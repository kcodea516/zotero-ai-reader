import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import type { NativeButton, NativeEditable } from '../src/controls.ts';
import type { ChatRequest, Config, Host, SecretStore, StoreState } from '../src/types.ts';

/** Run inside Zotero's chrome window after loading the current addon/styles.css.
 * Uses an isolated in-memory service: no library, profile, API or clipboard access.
 */
export async function runSidebarChecks(win: Window): Promise<string[]> {
  const realm = win as Window & typeof globalThis;
  const doc = win.document;
  const checks: string[] = [];
  const check = (name: string, condition: unknown): void => {
    if (!condition) throw new Error(`Sidebar integration check failed: ${name}`);
    checks.push(name);
  };
  const pause = (ms = 130) => new Promise<void>(resolve => win.setTimeout(resolve, ms));
  const until = async (name: string, condition: () => boolean): Promise<void> => {
    const deadline = Date.now() + 5000;
    while (!condition() && Date.now() < deadline) await pause(20);
    if (!condition()) throw new Error(`Sidebar integration timed out: ${name}`);
    await pause();
  };
  let saved: StoreState | null = null;
  const secrets: SecretStore = {
    async get() { return 'integration-placeholder'; }, async set() { return true; }, async delete() {},
  };
  const requests: Array<ChatRequest['messages']> = [];
  const copies: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstResponse = Array.from({ length: 110 }, (_, index) => `Paragraph ${index + 1}: a long synthetic answer used to exercise scrolling.`).join('\n\n');
  const service = new ChatService({
    async load() { return saved; },
    async save(value) { saved = JSON.parse(JSON.stringify(value)) as StoreState; },
  }, secrets, async request => {
    requests.push(request.messages.map(message => ({ ...message })));
    if (requests.length === 1 || requests.length === 4) {
      request.onText(firstResponse);
      await new Promise<void>((resolve, reject) => {
        releaseFirst = resolve;
        request.signal.addEventListener('abort', () => reject(new Error('integration cancelled')), { once: true });
      });
      request.onText('\n\nFirst response completed.');
    } else if (requests.length === 5) throw new Error('Synthetic response failure.');
    else request.onText(`Synthetic response ${requests.length}.`);
    return {};
  });
  const config: Config = {
    version: 1,
    endpoints: [{ id: 'integration-endpoint', name: 'Integration', baseURL: 'https://invalid.example/v1', stream: true }],
    models: [{ id: 'integration-model', endpointId: 'integration-endpoint', name: 'Fake model', model: 'fake' }],
    defaultModelId: 'integration-model', systemPrompt: 'Synthetic integration test.',
  };
  const scope = { libraryID: 1, itemKey: 'SYNTHETIC_INTEGRATION_ONLY', title: 'Synthetic paper for repeated conversation and narrow sidebar layout' };
  const overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
  overlay.setAttribute('data-ai-reader-integration', 'true');
  overlay.style.cssText = 'position:fixed;top:16px;right:16px;width:304px;padding:0;margin:0;z-index:2147483647;background:Canvas;color:CanvasText;font-size:14px;';
  let panel: ReturnType<typeof mountSidebar> | undefined;
  const previousFocus = doc.activeElement as HTMLElement | null;
  const host: Host = {
    service, secretStore: secrets, rootURI: '',
    openSettings() {}, scopeForItem() { return null; }, openURL() {},
    copy(text) { copies.push(text); },
  };
  try {
    await service.init();
    await service.saveConfig(config);
    doc.documentElement.append(overlay);
    panel = mountSidebar(overlay, scope, host);
    await pause();
    const find = <T extends Element>(selector: string): T => {
      const node = overlay.querySelector(selector);
      if (!node) throw new Error(`Sidebar integration missing element: ${selector}`);
      return node as T;
    };
    const root = find<HTMLElement>('.zar-sidebar');
    const compose = find<HTMLElement>('.zar-compose');
    const frame = find<HTMLElement>('.zar-input-frame');
    const draft = find<NativeEditable>('.zar-input');
    const input = draft.ref;
    check('native editable textarea exists', !!input && input.tagName.toLowerCase() === 'textarea');
    if (!input) throw new Error('Native input unavailable');
    const send = find<NativeButton>('.zar-compose-controls button[label="发送"]');
    const conversation = service.forScope(scope);
    const type = (text: string): void => {
      draft.focus(); input.value = text;
      input.dispatchEvent(new realm.Event('input', { bubbles: true }));
    };
    const key = (options: KeyboardEventInit = {}): KeyboardEvent => {
      const event = new realm.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options });
      input.dispatchEvent(event); return event;
    };
    const isInside = (node: Element, outer: Element): boolean => {
      const innerRect = node.getBoundingClientRect(); const outerRect = outer.getBoundingClientRect();
      return innerRect.width > 0 && innerRect.height > 0 && innerRect.top >= outerRect.top - 1
        && innerRect.bottom <= outerRect.bottom + 1 && innerRect.left >= outerRect.left - 1 && innerRect.right <= outerRect.right + 1;
    };
    const visibleComposer = (phase: string): void => {
      const rect = compose.getBoundingClientRect();
      check(`${phase}: composer contained by chat`, isInside(compose, root));
      check(`${phase}: input contained by composer`, isInside(frame, compose));
      check(`${phase}: composer contained by viewport`, rect.top >= 0 && rect.bottom <= win.innerHeight && rect.left >= 0 && rect.right <= win.innerWidth);
      check(`${phase}: no horizontal overflow at 304px`, root.scrollWidth <= root.clientWidth + 1);
    };
    check('fixture width is 304px', Math.abs(overlay.getBoundingClientRect().width - 304) < 1);
    draft.blur();
    const border = win.getComputedStyle(frame);
    check('unfocused question frame has visible border', !frame.contains(doc.activeElement) && parseFloat(border.borderTopWidth) > 0 && border.borderTopStyle !== 'none' && !['transparent', 'rgba(0, 0, 0, 0)'].includes(border.borderTopColor));
    visibleComposer('empty');
    const stopControl = find<HTMLElement>('.zar-stop-control');
    const stop = find<NativeButton>('.zar-stop-control button');
    const progress = find<HTMLElement>('.zar-stop-progress');
    check('generation indicator is hidden while idle', stopControl.hidden && stop.hidden && progress.getClientRects().length === 0);

    type('First question');
    check('native input event updates draft and send state', conversation.draft === 'First question' && !send.disabled);
    const firstEnter = key();
    check('Enter is handled as one send', firstEnter.defaultPrevented);
    await until('first streamed response', () => requests.length === 1 && conversation.messages[1]?.content.length > 0);
    visibleComposer('long streaming answer');
    const progressRect = progress.getBoundingClientRect(), stopRect = stop.getBoundingClientRect();
    check('streaming indicator fits inside the clickable native Stop button', !stopControl.hidden && !stop.hidden && !stop.disabled && stop.namespaceURI === 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul' && progressRect.height === 2 && progressRect.left > stopRect.left && progressRect.right < stopRect.right && progressRect.bottom <= stopRect.bottom && win.getComputedStyle(progress).pointerEvents === 'none' && progress.getAttribute('aria-hidden') === 'true');
    const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = stopControl.getAnimations({ subtree: true })[0];
    const initialTime = Number(animation?.currentTime);
    await pause();
    check('activity bar animates or respects reduced motion', reducedMotion ? win.getComputedStyle(progress, '::after').animationName === 'none' : animation?.playState === 'running' && Number(animation.currentTime) > initialTime);

    const log = find<HTMLElement>('.zar-messages');
    check('long answer scrolls inside message log', log.scrollHeight > log.clientHeight && win.getComputedStyle(log).overflowY === 'auto');
    check('composer node survives first render', draft.isConnected && draft.ref === input);
    type('Second question');
    await pause();
    check('next draft survives streaming render', conversation.draft === 'Second question' && input.value === 'Second question');
    const busyEnter = key();
    await pause();
    check('Enter while busy does not duplicate send', busyEnter.defaultPrevented && requests.length === 1 && conversation.messages.length === 2);
    releaseFirst?.();
    await until('first completion', () => !service.isBusy(conversation.id));
    check('next draft survives completion', conversation.draft === 'Second question' && input.value === 'Second question' && !send.disabled);
    visibleComposer('first completed answer');
    check('completed response hides the indicator and ends its animation', stopControl.hidden && stop.hidden && stopControl.getAnimations({ subtree: true }).length === 0);
    key();
    await until('second completion', () => requests.length === 2 && !service.isBusy(conversation.id));
    check('second round carries completed prior context', JSON.stringify(requests[1].map(message => message.role)) === JSON.stringify(['system', 'user', 'assistant', 'user']) && requests[1][1].content === 'First question' && requests[1][2].content === `${firstResponse}\n\nFirst response completed.` && requests[1][3].content === 'Second question');
    check('second round retains original input node', draft.ref === input && input.isConnected);
    visibleComposer('second completed answer');

    type('Third question');
    const shifted = key({ shiftKey: true });
    check('Shift+Enter permits native multiline default without sending', !shifted.defaultPrevented && requests.length === 2 && doc.activeElement === input);
    // Synthetic keyboard events cannot perform a browser's trusted text-editing
    // default. Apply that default explicitly, then exercise native input sync.
    input.setSelectionRange(input.value.length, input.value.length);
    input.setRangeText('\ncontinued');
    input.dispatchEvent(new realm.Event('input', { bubbles: true }));
    check('multiline text syncs through native editable', conversation.draft === 'Third question\ncontinued');
    input.dispatchEvent(new realm.CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    const imeEnter = key({ isComposing: true, keyCode: 229 });
    input.dispatchEvent(new realm.CompositionEvent('compositionend', { bubbles: true, data: '文' }));
    await pause();
    check('IME commit Enter does not submit or cancel native default', !imeEnter.defaultPrevented && requests.length === 2);
    panel.addQuote({ text: 'Synthetic quoted passage.', pageLabel: '3' });
    await pause();
    const quote = find<HTMLElement>('.zar-compose > .zar-quote');
    check('quoted passage is visible and editable', !quote.hidden && find<NativeEditable>('.zar-quote-input').value === 'Synthetic quoted passage.');
    visibleComposer('with quoted passage');
    check('third round native send button enabled', !send.disabled);
    send.doCommand();
    await until('third completion', () => requests.length === 3 && !service.isBusy(conversation.id));
    check('third round carries two prior exchanges and new quote', JSON.stringify(requests[2].map(message => message.role)) === JSON.stringify(['system', 'user', 'assistant', 'user', 'assistant', 'user']) && requests[2][3].content === 'Second question' && requests[2][5].content.includes('Synthetic quoted passage.') && requests[2][5].content.includes('Third question\ncontinued'));
    const quotedUser = Array.from(overlay.querySelectorAll<HTMLElement>('.zar-message-user')).at(-1)?.querySelector<HTMLElement>('.zar-message-quote');
    check('sent quote leaves composer and stays on user message', quote.hidden && !!quotedUser && !quotedUser.hidden && quotedUser.textContent?.includes('Synthetic quoted passage.'));
    visibleComposer('third completed answer');
    check('original draft node remains connected after three rounds', draft.ref === input && input.isConnected);
    const articles = Array.from(overlay.querySelectorAll<HTMLElement>('.zar-message'));
    check('all six messages have card borders', articles.length === 6 && articles.every(article => parseFloat(win.getComputedStyle(article).borderTopWidth) > 0));
    const thirdAssistant = articles[5];
    const icon = thirdAssistant.querySelector<HTMLButtonElement>('.zar-message-actions > .zar-message-copy');
    check('copy icon follows response content', !!icon?.querySelector('svg') && thirdAssistant.lastElementChild?.classList.contains('zar-message-actions'));
    icon?.click();
    check('footer copy captures latest assistant content without system clipboard', copies.length === 1 && copies[0] === 'Synthetic response 3.');
    const thirdUserCopy = articles[4].querySelector<HTMLButtonElement>('.zar-message-copy');
    thirdUserCopy?.click();
    check('user message footer copies question content', copies.length === 2 && copies[1] === 'Third question\ncontinued');
    type('Fourth question to stop'); send.doCommand();
    await until('fourth response streams', () => requests.length === 4 && service.isBusy(conversation.id));
    stop.doCommand();
    await until('fourth response stops', () => !service.isBusy(conversation.id));
    check('animated Stop still cancels generation and hides the indicator', conversation.messages.at(-1)?.status === 'stopped' && stopControl.hidden && stopControl.getAnimations({ subtree: true }).length === 0);
    type('Fifth question to fail'); send.doCommand();
    await until('fifth response fails', () => requests.length === 5 && !service.isBusy(conversation.id));
    check('failed response also hides the indicator', conversation.messages.at(-1)?.status === 'error' && stopControl.hidden && stopControl.getAnimations({ subtree: true }).length === 0);
    return checks;
  } finally {
    releaseFirst?.();
    panel?.destroy();
    overlay.remove();
    await service.shutdown();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
}
