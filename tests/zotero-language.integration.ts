import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import type { NativeButton, NativeEditable, NativeSelect } from '../src/controls.ts';
import type { ChatRequest, Config, Host, PaperContextProvider, PaperScope, SecretStore, StoreState } from '../src/types.ts';

/** Native 304px sidebar with synthetic evidence, fake API and memory-only state.
 * Switching UI language must not rewrite documents, messages or active requests. */
export async function runLanguageChecks(win: Window): Promise<string[]> {
  const realm = win as Window & typeof globalThis;
  const doc = win.document;
  const checks: string[] = [];
  const check = (name: string, condition: unknown): void => {
    if (!condition) throw new Error(`Language integration check failed: ${name}`);
    checks.push(name);
  };
  const pause = (ms = 140) => new Promise<void>(resolve => win.setTimeout(resolve, ms));
  const until = async (name: string, condition: () => boolean): Promise<void> => {
    const deadline = Date.now() + 5000;
    while (!condition() && Date.now() < deadline) await pause(20);
    if (!condition()) throw new Error(`Language integration timed out: ${name}`);
    await pause();
  };
  let saved: StoreState | null = null;
  const requests: ChatRequest[] = [];
  const copies: string[] = [];
  let release: (() => void) | undefined;
  const secrets: SecretStore = { async get() { return 'synthetic-key'; }, async set() { return true; }, async delete() {} };
  const longAnswer = Array.from({ length: 50 }, (_, index) => `Synthetic paragraph ${index + 1}: 原文内容保持中文，界面语言不应改写这些内容。`).join('\n\n');
  const provider: PaperContextProvider = async request => ({
    text: JSON.stringify({ kind: 'synthetic-evidence', text: 'Synthetic source passage only.' }),
    sources: [{ id: 'S1', title: '中文文献题名保持原样 — A deliberately long original paper title about vision encoding interference and multimodal model serving scheduling', libraryID: request.scope.libraryID, itemKey: request.scope.itemKey, attachmentKey: 'SYNTHETIC_ATTACHMENT', pages: [1, 2, 3], totalPages: 5, truncated: true }],
  });
  const service = new ChatService({ async load() { return saved; }, async save(value) { saved = JSON.parse(JSON.stringify(value)) as StoreState; } }, secrets, async request => {
    requests.push(request);
    request.onText(requests.length === 1 ? longAnswer + '\n\nSynthetic source citation [S1 p.2].' : 'Synthetic streaming answer that must continue across a language switch.');
    if (requests.length === 2) await new Promise<void>(resolve => { release = resolve; });
    return {};
  }, provider);
  const config: Config = {
    version: 1, language: 'zh-CN',
    endpoints: [{ id: 'language-endpoint', name: '保留接口名', baseURL: 'https://invalid.example/v1', stream: true }],
    models: [{ id: 'language-model', endpointId: 'language-endpoint', name: '保留模型名', model: 'fake-model' }],
    defaultModelId: 'language-model', systemPrompt: 'Synthetic language UI fixture.',
  };
  const scope: PaperScope = { libraryID: 1, itemKey: 'SYNTHETIC_LANGUAGE_PAPER', title: '保留中文论文名与原始 English Title' };
  const overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
  overlay.setAttribute('data-ai-reader-language-integration', 'true');
  overlay.style.cssText = 'position:fixed;top:16px;right:16px;width:304px;padding:0;margin:0;z-index:2147483647;background:Canvas;color:CanvasText;font-size:14px;';
  let panel: ReturnType<typeof mountSidebar> | undefined;
  const previousFocus = doc.activeElement as HTMLElement | null;
  const host: Host = { service, secretStore: secrets, rootURI: '', openSettings() {}, scopeForItem() { return null; }, openURL() {}, copy(text) { copies.push(text); }, openSource() {} };
  try {
    await service.init(); await service.saveConfig(config);
    const conversation = service.forScope(scope);
    service.setReadingOptions(conversation.id, { currentPaper: true, relatedPapers: false });
    service.setDraft(conversation.id, '保留用户提问原文'); await service.send(conversation.id);
    service.renameConversation(conversation.id, '保留中文会话 stickykeyword');
    for (let index = 0; index < 18; index++) {
      const filler = service.createConversation(scope);
      service.renameConversation(filler.id, `stickykeyword synthetic history ${index + 1}`);
    }
    const foreign = service.createConversation({ libraryID: 1, itemKey: 'SYNTHETIC_LANGUAGE_OTHER', title: '另一个文献的原始题名' });
    service.renameConversation(foreign.id, 'stickykeyword other paper');
    service.activateConversation(conversation.id);
    service.setDraft(conversation.id, '尚未发送的草稿 with English');
    service.setQuote(conversation.id, { text: '保留选中的原文 quoted passage', pageLabel: '4' });
    const unchangedMessages = JSON.stringify(conversation.messages);
    const selectedDetails = doc.querySelector<HTMLElement>('item-details.deck-selected');
    const activeDetails = selectedDetails && selectedDetails.getBoundingClientRect().width > 0 ? selectedDetails
      : Array.from(doc.querySelectorAll<HTMLElement>('item-details')).find(element => {
        const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && win.getComputedStyle(element).visibility !== 'hidden';
      });
    (activeDetails || doc.documentElement).append(overlay);
    panel = mountSidebar(overlay, scope, host); await pause();
    const find = <T extends Element>(selector: string): T => {
      const element = overlay.querySelector(selector);
      if (!element) throw new Error(`Language integration missing element: ${selector}`);
      return element as T;
    };
    const button = (label: string): NativeButton => {
      const element = Array.from(overlay.querySelectorAll<NativeButton>('button')).find(node => node.getAttribute('label') === label);
      if (!element) throw new Error(`Language integration missing action: ${label}`); return element;
    };
    const root = find<HTMLElement>('.zar-sidebar');
    const draft = find<NativeEditable>('.zar-input'); draft.focus(); const input = draft.ref;
    if (!input) throw new Error('Language integration native input unavailable');
    const log = find<HTMLElement>('.zar-messages');
    const language = async (value: 'zh-CN' | 'en-US'): Promise<void> => {
      await service.saveConfig({ ...service.getConfig(), language: value });
      await until(`UI switches to ${value}`, () => root.lang === value);
    };
    check('language fixture inherits native item-details styles at 304px', !!activeDetails && overlay.closest('item-details') === activeDetails && Math.abs(overlay.getBoundingClientRect().width - 304) < 1);
    check('Chinese is the initial sidebar language', root.lang === 'zh-CN' && button('历史').getAttribute('label') === '历史');
    check('constant paper-transfer helper sentence is removed', !overlay.querySelector('.zar-reading-hint') && !overlay.textContent?.includes('自动读取当前论文；需要时查询文库。'));
    await language('en-US');
    check('English toolbar and composer labels update live', !!button('New') && !!button('History') && !!button('Settings') && !!button('Send') && draft.placeholder === 'Ask about this paper…');
    check('English accessibility and keyboard guidance are available', root.getAttribute('aria-label') === 'AI Reading Assistant' && draft.getAttribute('aria-label') === 'Question' && find<HTMLElement>('.zar-compose-hint').textContent?.includes('Enter to send'));
    check('useful original-reading tooltips remain bilingual', find<HTMLElement>('.zar-reading-options').textContent?.includes('Search library as needed') && Array.from(overlay.querySelectorAll<HTMLLabelElement>('.zar-reading-options label')).some(label => label.title.includes('all collections')));
    check('language changes preserve draft quote and original input node', draft.value === '尚未发送的草稿 with English' && draft.ref === input && find<NativeEditable>('.zar-quote-input').value === '保留选中的原文 quoted passage' && find<HTMLElement>('.zar-quote .zar-muted').textContent === 'Quoted passage · Page 4');
    check('paper and model names remain original content', find<HTMLElement>('.zar-paper strong').textContent === scope.title && find<HTMLElement>('.zar-message-model').textContent?.includes('保留接口名') && find<HTMLElement>('.zar-message-model').textContent?.includes('保留模型名'));
    const sources = find<HTMLDetailsElement>('.zar-message-assistant .zar-message-sources'); sources.open = true; await pause();
    check('source labels translate without changing original paper title', sources.querySelector('summary')?.textContent === 'Original sources · 1' && sources.querySelector('.zar-source-pages')?.textContent?.includes('PDF pages: 1, 2, 3') && sources.querySelector('.zar-source-link')?.textContent?.includes('中文文献题名保持原样'));
    const sourceButton = sources.querySelector<HTMLButtonElement>('.zar-source-link')!;
    const sourcePages = sources.querySelector<HTMLElement>('.zar-source-pages')!;
    const textRange = doc.createRange(); textRange.selectNodeContents(sourceButton);
    check('long source title and page labels remain separate under native styles', sourceButton.getBoundingClientRect().height >= textRange.getBoundingClientRect().height - 1 && sourcePages.getBoundingClientRect().top >= sourceButton.getBoundingClientRect().bottom + 3);
    check('saved Chinese evidence notices display as English UI', !/[\p{Script=Han}]/u.test(find<HTMLElement>('.zar-message-assistant .zar-message-context').textContent || ''));
    const copy = find<HTMLButtonElement>('.zar-message-assistant .zar-message-copy'); copy.click();
    check('copy feedback and tooltip use English', find<HTMLElement>('.zar-message-assistant .zar-copy-feedback').textContent === 'Copied' && copy.title === 'Copied');
    log.scrollTop = Math.min(70, log.scrollHeight - log.clientHeight); const chatScroll = log.scrollTop;
    await language('zh-CN');
    check('switching back preserves message scroll position', Math.abs(log.scrollTop - chatScroll) <= 1);
    check('copy feedback and source UI switch back to Chinese', find<HTMLElement>('.zar-message-assistant .zar-copy-feedback').textContent === '已复制' && sources.querySelector('summary')?.textContent === '本轮原文来源 · 1 篇');
    check('language toggles never rewrite stored message bodies', JSON.stringify(conversation.messages) === unchangedMessages);
    button('历史').doCommand(); await until('history opens', () => root.dataset.view === 'history');
    const range = find<NativeSelect>('.zar-history-scope'); range.value = 'all'; range.dispatchEvent(new realm.Event('command', { bubbles: true }));
    const search = find<HTMLInputElement>('.zar-history input[type="search"]'); search.value = 'stickykeyword'; search.dispatchEvent(new realm.Event('input', { bubbles: true })); await pause();
    const historyList = find<HTMLElement>('.zar-history-list'); historyList.scrollTop = 100; const historyScroll = historyList.scrollTop;
    const activeCard = find<HTMLElement>('.zar-history-item[aria-current="true"]');
    await language('en-US');
    check('history language updates without leaving history or changing filter', root.dataset.view === 'history' && find<HTMLElement>('.zar-history h2').textContent === 'Chat history' && range.value === 'all' && search.value === 'stickykeyword');
    check('history language switch preserves scroll selected card and stored title', Math.abs(historyList.scrollTop - historyScroll) <= 1 && activeCard.isConnected && activeCard.getAttribute('aria-current') === 'true' && activeCard.querySelector('.zar-history-title')?.textContent === conversation.title);
    check('history counts and actions are English', activeCard.querySelector('.zar-history-count')?.textContent === '1 exchange' && Array.from(activeCard.querySelectorAll<NativeButton>('button')).some(node => node.getAttribute('label') === 'Rename') && Array.from(activeCard.querySelectorAll<NativeButton>('button')).some(node => node.getAttribute('label') === 'Delete'));
    button('Copy chat as Markdown').doCommand();
    check('Markdown export translates headings but preserves original messages', copies.at(-1)?.includes(`Paper: ${scope.title}`) && copies.at(-1)?.includes('## You') && copies.at(-1)?.includes('保留用户提问原文') && copies.at(-1)?.includes('原文内容保持中文'));
    button('Back to chat').doCommand(); await until('back to chat', () => root.dataset.view === 'chat');
    check('returning from English history retains unsent draft', draft.value === '尚未发送的草稿 with English' && draft.ref === input);
    input.value = 'Synthetic active request that should survive language changes'; input.dispatchEvent(new realm.Event('input', { bubbles: true }));
    input.dispatchEvent(new realm.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await until('second request streams', () => requests.length === 2 && service.isBusy(conversation.id) && conversation.messages.at(-1)!.content.length > 0);
    input.value = '下一轮未发送草稿'; input.dispatchEvent(new realm.Event('input', { bubbles: true }));
    await language('zh-CN');
    check('switching language during streaming preserves active request and next draft', service.isBusy(conversation.id) && requests.length === 2 && !requests[1].signal.aborted && draft.value === '下一轮未发送草稿' && !!button('停止'));
    release?.(); await until('stream completes', () => !service.isBusy(conversation.id));
    check('stream finishes once without losing next draft', requests.length === 2 && conversation.messages.at(-1)?.status === 'complete' && draft.value === '下一轮未发送草稿');
    check('304px bilingual sidebar has no horizontal overflow', root.getBoundingClientRect().width <= overlay.getBoundingClientRect().width + 1 && root.scrollWidth <= root.clientWidth + 1);
    check('native composer survives bilingual switching', draft.ref === input && input.isConnected);
    return checks;
  } finally {
    release?.(); panel?.destroy(); overlay.remove(); await service.shutdown();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
}
