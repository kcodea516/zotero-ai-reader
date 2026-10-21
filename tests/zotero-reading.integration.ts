import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import { createZoteroPaperContextProvider } from '../src/zotero-reading.ts';
import type { NativeEditable } from '../src/controls.ts';
import type { ChatRequest, Config, Host, PaperContextProvider, PaperScope, PaperSource, SecretStore, StoreState } from '../src/types.ts';

/** Uses actual local PDF extraction with a strictly in-memory conversation and
 * fake transport. Never reads credentials, sends requests, or saves profile data. */
export async function runReadingChecks(win: Window): Promise<{
  checks: string[];
  sources: { title: string; totalPages: number; suppliedPages: number }[];
}> {
  const realm = win as Window & typeof globalThis;
  const doc = win.document;
  const checks: string[] = [];
  const check = (name: string, condition: unknown): void => {
    if (!condition) throw new Error(`Reading integration check failed: ${name}`);
    checks.push(name);
  };
  const pause = (ms = 140) => new Promise<void>(resolve => win.setTimeout(resolve, ms));
  const until = async (name: string, condition: () => boolean): Promise<void> => {
    const deadline = Date.now() + 60000;
    while (!condition() && Date.now() < deadline) await pause(30);
    if (!condition()) throw new Error(`Reading integration timed out: ${name}`);
    await pause();
  };
  const selectedID = (win as any).Zotero_Tabs?.selectedID;
  const readers: any[] = Zotero.Reader._readers.filter((reader: any) => !reader._isTabClosed);
  const reader = readers.find(candidate => candidate.tabID === selectedID) || readers[0];
  if (!reader) throw new Error('Reading integration requires an open PDF reader');
  const attachment = await Zotero.Items.getAsync(reader.itemID);
  const item = attachment.parentID ? await Zotero.Items.getAsync(attachment.parentID) : attachment;
  await Zotero.Items.loadDataTypes([item], ['itemData']);
  const scope: PaperScope = { libraryID: item.libraryID, itemKey: item.key, title: item.getField('title') };
  const provider = createZoteroPaperContextProvider();
  const question = '解释System Overview的四个组成部分，并与UnifiedServe的机制联系起来';
  const context = await provider({ scope, question, previousQuestions: [], options: { currentPaper: true, relatedPapers: true }, signal: new AbortController().signal });
  const payload = context.text ? JSON.parse(context.text) : undefined;
  const current = context.sources.find(source => source.id === 'S1');
  check('current local PDF source exists', !!current && current.itemKey === scope.itemKey && current.pages.length > 0);
  check('all original sources use physical pages within bounds', context.sources.every(source => source.pages.length > 0 && source.pages.every(page => Number.isInteger(page) && page >= 1 && page <= source.totalPages)));
  const sourceDocuments: any[] = payload?.documents || [];
  const normalizedOriginal = sourceDocuments.flatMap(document => document.passages.map((passage: any) => passage.text)).join(' ').replace(/\s+/g, ' ').toLowerCase();
  check('retrieved real PDF contains System Overview section', normalizedOriginal.includes('system overview'));
  check('explicit UnifiedServe comparison retrieves another local original', context.sources.some(source => source.id !== 'S1' && /UnifiedServe|Enabling Disaggregated Multi-Stage MLLM/i.test(source.title)));
  if (/^Nova:/i.test(scope.title)) check('Nova full extraction has 14 physical PDF pages', current?.totalPages === 14 && current.pages.length === 14);
  const originalFragment = String(sourceDocuments.find(document => document.source.id === 'S1')?.passages[0]?.text || '').slice(80, 230);
  check('real original passage is available for storage isolation assertion', originalFragment.length > 100);
  const encodedFragment = JSON.stringify(originalFragment).slice(1, -1);

  let saved: StoreState | null = null;
  const requests: Array<ChatRequest['messages']> = [];
  const opened: { source: PaperSource; page?: number }[] = [];
  let providerCalls = 0;
  const wrappedProvider: PaperContextProvider = async request => { providerCalls++; return await provider(request); };
  const secrets: SecretStore = { async get() { return 'integration-placeholder'; }, async set() { return true; }, async delete() {} };
  const config: Config = {
    version: 1,
    endpoints: [{ id: 'reading-integration-endpoint', name: 'Fake transport', baseURL: 'https://invalid.example/v1', stream: true }],
    models: [{ id: 'reading-integration-model', endpointId: 'reading-integration-endpoint', name: 'Fake model', model: 'fake' }],
    defaultModelId: 'reading-integration-model', systemPrompt: 'Local PDF integration check.',
  };
  const service = new ChatService({
    async load() { return saved; },
    async save(value) { saved = JSON.parse(JSON.stringify(value)) as StoreState; },
  }, secrets, async request => {
    requests.push(request.messages.map(message => ({ ...message })));
    const material = /<retrieved_paper_context>\s*([\s\S]*?)\s*<\/retrieved_paper_context>/.exec(request.messages.at(-1)?.content || '');
    if (material) {
      const data = JSON.parse(material[1]);
      const sources: PaperSource[] = data.documents.map((document: any) => document.source);
      const primary = sources.find(source => source.id === 'S1')!;
      const secondary = sources.find(source => source.id !== 'S1')!;
      request.onText(`Synthetic local reading response ${requests.length}. Current original [S1 p.${primary.pages[0]}]. Related original [${secondary.id} p.${secondary.pages[0]}]. Invalid page stays plain [S1 p.${primary.totalPages + 12345}].`);
    } else request.onText('Synthetic response with original reading disabled.');
    return {};
  }, wrappedProvider);
  const overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
  overlay.setAttribute('data-ai-reader-reading-integration', 'true');
  overlay.style.cssText = 'position:fixed;top:16px;right:16px;width:304px;padding:0;margin:0;z-index:2147483647;background:Canvas;color:CanvasText;font-size:14px;';
  const previousFocus = doc.activeElement as HTMLElement | null;
  let panel: ReturnType<typeof mountSidebar> | undefined;
  const host: Host = {
    service, secretStore: secrets, rootURI: '', openSettings() {}, scopeForItem() { return null; }, openURL() {}, copy() {},
    openSource(source, page) { opened.push({ source, page }); },
  };
  try {
    await service.init(); await service.saveConfig(config);
    doc.documentElement.append(overlay);
    panel = mountSidebar(overlay, scope, host); await pause();
    const find = <T extends Element>(selector: string): T => {
      const element = overlay.querySelector(selector);
      if (!element) throw new Error(`Reading integration missing element: ${selector}`);
      return element as T;
    };
    const draft = find<NativeEditable>('.zar-input');
    draft.focus(); const input = draft.ref;
    if (!input) throw new Error('Reading integration native input unavailable');
    const conversation = service.forScope(scope);
    const send = async (text: string, expected: number): Promise<void> => {
      draft.focus(); input.value = text;
      input.dispatchEvent(new realm.Event('input', { bubbles: true }));
      const event = new realm.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      check(`round ${expected}: Enter submits native input`, event.defaultPrevented);
      await until(`round ${expected} completion`, () => requests.length === expected && !service.isBusy(conversation.id));
      check(`round ${expected}: assistant completes`, conversation.messages.at(-1)?.status === 'complete');
    };
    check('reading fixture is 304px wide', Math.abs(overlay.getBoundingClientRect().width - 304) < 1);
    await send(question, 1);
    check('first request receives real original context in last user message', requests[0].at(-1)?.role === 'user' && requests[0].at(-1)!.content.includes('<retrieved_paper_context>') && requests[0].at(-1)!.content.includes('zotero-local-paper-evidence') && requests[0].at(-1)!.content.includes(encodedFragment));
    const firstAssistant = find<HTMLElement>('.zar-message-assistant');
    const sourcePanel = firstAssistant.querySelector<HTMLDetailsElement>('.zar-message-sources');
    check('current and related original sources appear in response UI', !!sourcePanel && !sourcePanel.hidden && sourcePanel.querySelectorAll('.zar-source-link').length >= 2);
    const citations = Array.from(firstAssistant.querySelectorAll<HTMLAnchorElement>('.zar-markdown a'));
    check('only two valid page citations become clickable', citations.length === 2 && citations.every(anchor => anchor.getAttribute('href') === '#'));
    const firstSource = conversation.messages[1].sources!.find(source => source.id === 'S1')!;
    citations[0].click();
    check('citation opens exact original attachment and cited physical page', opened.length === 1 && opened[0].source.attachmentKey === firstSource.attachmentKey && opened[0].source.itemKey === scope.itemKey && opened[0].page === firstSource.pages[0]);
    check('invalid physical PDF page remains non-clickable text', firstAssistant.querySelector('.zar-markdown')?.textContent?.includes(`[S1 p.${firstSource.totalPages + 12345}]`) && !citations.some(anchor => anchor.textContent?.includes(String(firstSource.totalPages + 12345))));
    await send('继续解释这四点之间的关系，并继续对照UnifiedServe。', 2);
    check('second round preserves prior exchange while reattaching current originals', requests[1].filter(message => message.role === 'user').length === 2 && requests[1].at(-1)!.content.includes('<retrieved_paper_context>') && conversation.messages[3].sources!.some(source => source.id === 'S1'));
    check('second round keeps original input available', draft.isConnected && draft.ref === input);
    const root = find<HTMLElement>('.zar-sidebar');
    const frame = find<HTMLElement>('.zar-input-frame');
    const outer = root.getBoundingClientRect(); const inner = frame.getBoundingClientRect();
    check('composer remains visible in 304px sidebar', inner.width > 0 && inner.top >= outer.top && inner.bottom <= outer.bottom + 1 && root.scrollWidth <= root.clientWidth + 1);
    const optionChecks = Array.from(overlay.querySelectorAll<HTMLInputElement>('.zar-reading-options input[type="checkbox"]'));
    check('two independent original reading controls are available', optionChecks.length === 2 && optionChecks.every(checkbox => checkbox.checked && !checkbox.disabled));
    for (const checkbox of optionChecks) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new realm.Event('change', { bubbles: true }));
    }
    await pause();
    const previousCalls = providerCalls;
    await send('关闭原文后只继续讨论刚才的对话。', 3);
    check('checkbox opt-out skips provider on next request', providerCalls === previousCalls);
    check('opt-out API body contains no original corpus', requests[2].every(message => !message.content.includes('<retrieved_paper_context>') && !message.content.includes('zotero-local-paper-evidence') && !message.content.includes(encodedFragment)));
    await service.flush();
    const stored = JSON.stringify(saved);
    check('conversation state stores source metadata but no retrieved original corpus', stored.includes('attachmentKey') && !stored.includes('zotero-local-paper-evidence') && !stored.includes('retrieved_paper_context') && !stored.includes(encodedFragment));
    return { checks, sources: context.sources.map(source => ({ title: source.title, totalPages: source.totalPages, suppliedPages: source.pages.length })) };
  } finally {
    panel?.destroy(); overlay.remove(); await service.shutdown();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
}
