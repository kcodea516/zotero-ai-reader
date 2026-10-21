import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import { createZoteroPaperContextProvider } from '../src/zotero-reading.ts';
import type { NativeEditable } from '../src/controls.ts';
import type { ChatRequest, Config, Host, PaperContextProvider, PaperScope, PaperSource, SecretStore, StoreState } from '../src/types.ts';

/** Actual local PDF extraction and native pane styling, isolated in-memory chat,
 * and fake planner/answer transports. No credentials, API, or profile writes. */
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
  const question = '解释System Overview的四个组成部分。';
  const context = await provider({ scope, question, previousQuestions: [], options: { currentPaper: true, relatedPapers: false }, signal: new AbortController().signal });
  const payload = context.text ? JSON.parse(context.text) : undefined;
  const current = context.sources.find(source => source.id === 'S1');
  check('current local PDF source exists without automatic related lookup', !!current && current.itemKey === scope.itemKey && current.pages.length > 0 && context.sources.length === 1);
  check('current original uses physical pages within bounds', context.sources.every(source => source.pages.every(page => Number.isInteger(page) && page >= 1 && page <= source.totalPages)));
  const sourceDocuments: any[] = payload?.documents || [];
  const normalizedOriginal = sourceDocuments.flatMap(document => document.passages.map((passage: any) => passage.text)).join(' ').replace(/\s+/g, ' ').toLowerCase();
  check('retrieved real PDF contains System Overview section', normalizedOriginal.includes('system overview'));
  if (/^Nova:/i.test(scope.title)) check('Nova full extraction has 14 physical PDF pages', current?.totalPages === 14 && current.pages.length === 14);
  const originalFragment = String(sourceDocuments.find(document => document.source.id === 'S1')?.passages[0]?.text || '').slice(80, 230);
  check('real original passage is available for storage isolation assertion', originalFragment.length > 100);
  const encodedFragment = JSON.stringify(originalFragment).slice(1, -1);

  let saved: StoreState | null = null;
  const requests: Array<ChatRequest['messages']> = [];
  const opened: { source: PaperSource; page?: number }[] = [];
  const providerOptions: { currentPaper: boolean; relatedPapers: boolean }[] = [];
  let plannerCalls = 0;
  const wrappedProvider: PaperContextProvider = async request => {
    providerOptions.push({ ...request.options });
    return await provider(request);
  };
  const materialFrom = (messages: ChatRequest['messages']): any | undefined => {
    const match = /<retrieved_paper_context>\s*([\s\S]*?)\s*<\/retrieved_paper_context>/.exec(messages.at(-1)?.content || '');
    return match ? JSON.parse(match[1]) : undefined;
  };
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
    if (request.messages.some(message => message.role === 'system' && message.content.includes('zotero-library-lookup-decision'))) {
      plannerCalls++;
      request.onText(JSON.stringify({ lookup: plannerCalls === 2, query: plannerCalls === 2 ? 'UnifiedServe vision encode decode GPU sharing' : '' }));
      return {};
    }
    requests.push(request.messages.map(message => ({ ...message })));
    const material = materialFrom(request.messages);
    if (material) {
      const sources: PaperSource[] = material.documents.map((document: any) => document.source);
      const primary = sources.find(source => source.id === 'S1')!;
      const secondary = sources.find(source => source.id !== 'S1');
      request.onText(`Synthetic local reading response ${requests.length}. Current original [S1 p.${primary.pages[0]}].${secondary ? ` Related original [${secondary.id} p.${secondary.pages[0]}].` : ''} Invalid page stays plain [S1 p.${primary.totalPages + 12345}].`);
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
    const selectedDetails = doc.querySelector<HTMLElement>('item-details.deck-selected');
    const activeDetails = selectedDetails && selectedDetails.getBoundingClientRect().width > 0 ? selectedDetails
      : Array.from(doc.querySelectorAll<HTMLElement>('item-details')).find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && win.getComputedStyle(element).visibility !== 'hidden';
      });
    (activeDetails || doc.documentElement).append(overlay);
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
    check('source fixture inherits actual Zotero item-details control styling', !!activeDetails && overlay.closest('item-details') === activeDetails);
    const options = find<HTMLElement>('.zar-reading-options');
    check('lookup option explains whole-library scope and on-demand use', options.textContent?.includes('按需查文库') && Array.from(options.querySelectorAll('label')).some(label => label.title.includes('不限当前分组') && label.title.includes('仅在问题需要')));
    await send(question, 1);
    const firstMaterial = materialFrom(requests[0]);
    check('ordinary first request contains real current original only', firstMaterial?.documents.length === 1 && firstMaterial.documents[0].source.id === 'S1' && requests[0].at(-1)!.content.includes(encodedFragment));
    check('ordinary first question does not request related PDF extraction', plannerCalls === 1 && providerOptions.length === 1 && !providerOptions[0].relatedPapers);
    const firstAssistant = find<HTMLElement>('.zar-message-assistant');
    const firstSource = conversation.messages[1].sources!.find(source => source.id === 'S1')!;
    const firstCitations = Array.from(firstAssistant.querySelectorAll<HTMLAnchorElement>('.zar-markdown a'));
    check('valid current citation is clickable and invalid physical page stays plain', firstCitations.length === 1 && firstCitations[0].getAttribute('href') === '#' && firstAssistant.querySelector('.zar-markdown')?.textContent?.includes(`[S1 p.${firstSource.totalPages + 12345}]`));
    firstCitations[0].click();
    check('citation opens exact original attachment and cited physical page', opened.length === 1 && opened[0].source.attachmentKey === firstSource.attachmentKey && opened[0].source.itemKey === scope.itemKey && opened[0].page === firstSource.pages[0]);

    await send('请把Nova与UnifiedServe处理视觉编码干扰decode的机制作对照。', 2);
    const comparisonMaterial = materialFrom(requests[1]);
    const comparisonSources: PaperSource[] = comparisonMaterial?.documents.map((document: any) => document.source) || [];
    check('explicit comparison triggers planner and reads another local original', plannerCalls === 2 && providerOptions.some(option => option.relatedPapers) && comparisonSources.some(source => source.id !== 'S1' && /UnifiedServe|Enabling Disaggregated Multi-Stage MLLM/i.test(source.title)));
    check('second round preserves prior exchange and original sources', requests[1].filter(message => message.role === 'user').length === 2 && conversation.messages[3].sources!.some(source => source.id === 'S1'));
    const comparisonAssistant = Array.from(overlay.querySelectorAll<HTMLElement>('.zar-message-assistant'))[1];
    const sourcePanel = comparisonAssistant.querySelector<HTMLDetailsElement>('.zar-message-sources')!;
    check('comparison response displays independent source cards', !!sourcePanel && !sourcePanel.hidden && sourcePanel.querySelectorAll('.zar-source-item').length === comparisonSources.length && comparisonSources.length >= 2);
    sourcePanel.open = true; await pause();
    for (const sourceItem of Array.from(sourcePanel.querySelectorAll<HTMLElement>('.zar-source-item'))) {
      const button = sourceItem.querySelector<HTMLButtonElement>('.zar-source-link')!;
      const pages = sourceItem.querySelector<HTMLElement>('.zar-source-pages')!;
      const buttonRect = button.getBoundingClientRect(); const pagesRect = pages.getBoundingClientRect();
      const textRange = doc.createRange(); textRange.selectNodeContents(button);
      const textRect = textRange.getBoundingClientRect();
      check('source title button contains all wrapped text under native pane styles', buttonRect.height >= textRect.height - 1 && button.scrollHeight <= button.clientHeight + 1 && (button.textContent!.length < 80 || buttonRect.height > 30));
      check('source page numbers appear below title without overlap', pagesRect.top >= buttonRect.bottom + 3 && sourceItem.getBoundingClientRect().bottom >= pagesRect.bottom - 1);
      check('source card stays within 304px width', sourceItem.scrollWidth <= sourceItem.clientWidth + 1 && button.scrollWidth <= button.clientWidth + 1);
    }
    const comparedOriginal = comparisonMaterial.documents.find((document: any) => document.source.id !== 'S1');
    const relatedFragment = JSON.stringify(String(comparedOriginal.passages[0].text).slice(100, 250)).slice(1, -1);
    check('second round keeps original input available', draft.isConnected && draft.ref === input);

    await send('只解释当前论文的 System Overview，不需要比较其他论文。', 3);
    const thirdMaterial = materialFrom(requests[2]);
    check('later ordinary question returns to current original only', plannerCalls === 3 && thirdMaterial?.documents.length === 1 && thirdMaterial.documents[0].source.id === 'S1' && conversation.messages[5].sources?.length === 1);
    check('previous comparison does not resend unrelated original corpus', requests[2].every(message => !message.content.includes(relatedFragment)));
    const root = find<HTMLElement>('.zar-sidebar'); const frame = find<HTMLElement>('.zar-input-frame');
    const outer = root.getBoundingClientRect(); const inner = frame.getBoundingClientRect();
    check('composer remains visible and sidebar does not exceed 304px', inner.width > 0 && inner.top >= outer.top && inner.bottom <= outer.bottom + 1 && root.scrollWidth <= root.clientWidth + 1 && outer.width <= overlay.getBoundingClientRect().width + 1);
    const optionChecks = Array.from(overlay.querySelectorAll<HTMLInputElement>('.zar-reading-options input[type="checkbox"]'));
    check('two independent reading permissions remain available', optionChecks.length === 2 && optionChecks.every(checkbox => checkbox.checked && !checkbox.disabled));
    for (const checkbox of optionChecks) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new realm.Event('change', { bubbles: true }));
    }
    await pause(); const previousCalls = providerOptions.length; const previousPlannerCalls = plannerCalls;
    await send('关闭原文后只继续讨论刚才的对话。', 4);
    check('opt-out skips both PDF provider and lookup planner', providerOptions.length === previousCalls && plannerCalls === previousPlannerCalls);
    check('opt-out API body contains no original corpus', requests[3].every(message => !message.content.includes('<retrieved_paper_context>') && !message.content.includes('zotero-local-paper-evidence') && !message.content.includes(encodedFragment) && !message.content.includes(relatedFragment)));
    check('planner decisions never appear as assistant answers', conversation.messages.filter(message => message.role === 'assistant').length === 4 && conversation.messages.filter(message => message.role === 'assistant').every(message => !message.content.includes('"lookup"')));
    await service.flush(); const stored = JSON.stringify(saved);
    check('conversation state stores source metadata but no retrieved original corpus', stored.includes('attachmentKey') && !stored.includes('zotero-local-paper-evidence') && !stored.includes('retrieved_paper_context') && !stored.includes(encodedFragment) && !stored.includes(relatedFragment));
    const allSources = new Map([...context.sources, ...comparisonSources].map(source => [`${source.libraryID}:${source.attachmentKey}`, source]));
    return { checks, sources: Array.from(allSources.values()).map(source => ({ title: source.title, totalPages: source.totalPages, suppliedPages: source.pages.length })) };
  } finally {
    panel?.destroy(); overlay.remove(); await service.shutdown();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
}
