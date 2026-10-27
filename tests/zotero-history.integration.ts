import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import type { NativeButton, NativeEditable, NativeSelect } from '../src/controls.ts';
import type { Config, Conversation, Host, PaperScope, SecretStore, StoreState } from '../src/types.ts';

/** Real Zotero controls with isolated synthetic conversations. No library,
 * credentials, profile storage, clipboard, or network operations are used. */
export async function runHistoryChecks(win: Window): Promise<string[]> {
  const realm = win as Window & typeof globalThis;
  const doc = win.document;
  const checks: string[] = [];
  const check = (name: string, condition: unknown): void => {
    if (!condition) throw new Error(`History integration check failed: ${name}`);
    checks.push(name);
  };
  const pause = (ms = 140) => new Promise<void>(resolve => win.setTimeout(resolve, ms));
  const until = async (name: string, condition: () => boolean): Promise<void> => {
    const deadline = Date.now() + 5000;
    while (!condition() && Date.now() < deadline) await pause(20);
    if (!condition()) throw new Error(`History integration timed out: ${name}`);
    await pause();
  };
  let saved: StoreState | null = null;
  let requests = 0;
  const secrets: SecretStore = { async get() { return 'integration-placeholder'; }, async set() { return true; }, async delete() {} };
  const service = new ChatService({
    async load() { return saved; },
    async save(value) { saved = JSON.parse(JSON.stringify(value)) as StoreState; },
  }, secrets, async request => {
    requests++;
    request.onText(`Synthetic answer ${requests}: ${request.messages.at(-1)?.content || ''}；最后消息标识 history-answer-${requests}。`);
    return {};
  });
  const config: Config = {
    version: 1,
    endpoints: [{ id: 'history-integration-endpoint', name: 'Synthetic transport', baseURL: 'https://invalid.example/v1', stream: true }],
    models: [{ id: 'history-integration-model', endpointId: 'history-integration-endpoint', name: 'Fake model', model: 'fake' }],
    defaultModelId: 'history-integration-model', systemPrompt: 'Synthetic history integration test.',
  };
  const scope: PaperScope = { libraryID: 1, itemKey: 'SYNTHETIC_HISTORY_PAPER_A', title: 'Synthetic Nova paper for encoder scheduling' };
  const otherScope: PaperScope = { libraryID: 1, itemKey: 'SYNTHETIC_HISTORY_PAPER_B', title: 'Synthetic UnifiedServe paper for resource sharing' };
  const overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
  overlay.setAttribute('data-ai-reader-history-integration', 'true');
  overlay.style.cssText = 'position:fixed;top:16px;right:16px;width:304px;padding:0;margin:0;z-index:2147483647;background:Canvas;color:CanvasText;font-size:14px;';
  const previousFocus = doc.activeElement as HTMLElement | null;
  const previousPrompt = win.prompt;
  const previousConfirm = win.confirm;
  let panel: ReturnType<typeof mountSidebar> | undefined;
  const host: Host = { service, secretStore: secrets, rootURI: '', openSettings() {}, scopeForItem() { return null; }, openURL() {}, copy() {} };
  try {
    await service.init(); await service.saveConfig(config);
    const seed = async (paper: PaperScope, title: string, question: string, draft: string): Promise<Conversation> => {
      const value = service.createConversation(paper);
      service.setDraft(value.id, question); await service.send(value.id);
      service.renameConversation(value.id, title); service.setDraft(value.id, draft);
      return value;
    };
    const first = await seed(scope, '编码与解码调度', '解释编码干扰与输出停顿，搜索唯一词 encoder-gap-evidence。', '第一份尚未发送的草稿');
    const second = await seed(scope, '资源分配的假设', '比较 SM 分区与并发机制，搜索唯一词 spatial-partition-proof。', '第二份草稿：还需要检查限制');
    const foreign = await seed(otherScope, '另一篇论文的对照', '整理跨论文证据，搜索唯一词 cross-paper-proof。', '其它论文尚未发送的草稿');
    service.activateConversation(first.id);
    // Native item-details styles impose control sizing that a document-root
    // overlay does not inherit. Mount inside the active real pane to exercise
    // those rules while all conversations remain isolated in memory.
    const selectedDetails = doc.querySelector<HTMLElement>('item-details.deck-selected');
    const activeDetails = selectedDetails && selectedDetails.getBoundingClientRect().width > 0 && win.getComputedStyle(selectedDetails).visibility !== 'hidden' ? selectedDetails
      : Array.from(doc.querySelectorAll<HTMLElement>('item-details')).find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && win.getComputedStyle(element).visibility !== 'hidden';
      });
    (activeDetails || doc.documentElement).append(overlay);
    panel = mountSidebar(overlay, scope, host); await pause();
    const find = <T extends Element>(selector: string): T => {
      const element = overlay.querySelector(selector);
      if (!element) throw new Error(`History integration missing element: ${selector}`);
      return element as T;
    };
    const root = find<HTMLElement>('.zar-sidebar');
    const history = find<HTMLElement>('.zar-history');
    const toolbar = find<HTMLElement>('.zar-toolbar');
    const composer = find<HTMLElement>('.zar-compose');
    const paper = find<HTMLElement>('.zar-paper');
    const messages = find<HTMLElement>('.zar-messages');
    const historyButton = find<NativeButton>('.zar-toolbar-actions button[label="历史"]');
    const back = find<NativeButton>('.zar-history-back');
    const range = find<NativeSelect>('.zar-history-scope');
    const search = find<HTMLInputElement>('.zar-history input[type="search"]');
    const list = find<HTMLElement>('.zar-history-list');
    const draft = find<NativeEditable>('.zar-input');
    const cards = (): HTMLElement[] => Array.from(list.querySelectorAll<HTMLElement>('.zar-history-item'));
    const card = (title: string): HTMLElement => {
      const result = cards().find(element => element.querySelector('.zar-history-title')?.textContent === title);
      if (!result) throw new Error('History integration expected card missing');
      return result;
    };
    const visible = (node: Element): boolean => {
      const style = win.getComputedStyle(node); const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const setRange = async (value: 'paper' | 'all'): Promise<void> => {
      range.value = value; range.dispatchEvent(new realm.Event('command', { bubbles: true })); await pause();
    };
    const setSearch = async (value: string): Promise<void> => {
      search.value = value; search.dispatchEvent(new realm.Event('input', { bubbles: true })); await pause();
    };
    const openHistory = async (): Promise<void> => {
      historyButton.doCommand(); await until('history screen', () => root.dataset.view === 'history');
    };
    const openCard = async (title: string): Promise<void> => {
      card(title).querySelector<HTMLButtonElement>('.zar-history-open')!.click();
      await until('selected conversation screen', () => root.dataset.view === 'chat');
    };
    check('fixture width is 304px', Math.abs(overlay.getBoundingClientRect().width - 304) < 1);
    check('fixture inherits actual Zotero item-details control styling', !!activeDetails && overlay.closest('item-details') === activeDetails);
    check('chat root does not expand its 304px container', root.getBoundingClientRect().width <= overlay.getBoundingClientRect().width + 1);
    check('initial chat restores selected conversation draft', root.dataset.view === 'chat' && draft.value === first.draft);
    await openHistory();
    check('history occupies its own screen', visible(history) && win.getComputedStyle(history).display === 'flex');
    check('chat controls are hidden while history is open', !visible(toolbar) && !visible(paper) && !visible(messages) && !visible(composer));
    check('default filter shows two current-paper conversations', cards().length === 2 && cards().some(element => element.textContent?.includes(first.title)) && cards().some(element => element.textContent?.includes(second.title)));
    const firstCard = card(first.title);
    check('active conversation is marked', firstCard.getAttribute('aria-current') === 'true');
    for (const conversation of [first, second]) {
      const element = card(conversation.title);
      const open = element.querySelector<HTMLButtonElement>('.zar-history-open');
      check(`${conversation.title}: title and paper appear inside open control`, !!open?.querySelector('.zar-history-title') && open.querySelector('.zar-history-paper')?.textContent === conversation.scope.title);
      check(`${conversation.title}: timestamp, last-message preview and count are present`, !!open?.querySelector('time')?.getAttribute('datetime') && !!open.querySelector('.zar-history-preview')?.textContent?.includes(conversation.messages.at(-1)!.content.slice(0, 20)) && !!open.querySelector('.zar-history-count')?.textContent?.includes('1 轮'));
      const openRect = open!.getBoundingClientRect();
      const contentHeight = Array.from(open!.children).reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
      check(`${conversation.title}: native pane button sizing does not truncate card content`, openRect.height > 70 && openRect.height >= contentHeight - 1);
      const toolsRow = element.querySelector<HTMLElement>('.zar-history-tools')!;
      check(`${conversation.title}: card actions follow full card content without overlap`, toolsRow.getBoundingClientRect().top >= openRect.bottom - 1);
      const tools = Array.from(element.querySelectorAll<HTMLElement>('button')).filter(button => button !== open);
      check(`${conversation.title}: rename and delete are separate from opening`, tools.some(button => button.getAttribute('label') === '重命名') && tools.some(button => button.getAttribute('label') === '删除') && tools.every(button => !open?.contains(button)));
    }
    await setRange('all');
    check('all-history filter includes other paper', cards().length === 3 && !!card(foreign.title));
    await setSearch('cross-paper-proof');
    check('content search finds the other-paper conversation', cards().length === 1 && !!card(foreign.title));
    await setSearch('spatial-partition-proof');
    check('content search finds the matching current-paper conversation', cards().length === 1 && !!card(second.title));
    await setSearch('no-such-synthetic-message-1938');
    check('unmatched content search shows an empty state', cards().length === 0 && list.textContent?.includes('没有找到'));
    await setSearch(''); await setRange('paper');
    await openCard(second.title);
    check('selecting history restores selected draft and messages', draft.value === second.draft && messages.textContent?.includes('history-answer-2') && !messages.textContent?.includes('history-answer-1'));
    check('selected conversation is remembered', service.forScope(scope).id === second.id);
    draft.focus(); const input = draft.ref;
    if (!input) throw new Error('History integration native input unavailable');
    input.value = '正在编辑、切换历史也应保留的草稿';
    input.dispatchEvent(new realm.Event('input', { bubbles: true }));
    await openHistory(); back.doCommand(); await until('back to chat', () => root.dataset.view === 'chat');
    check('back to conversation preserves unsent draft', draft.value === '正在编辑、切换历史也应保留的草稿' && second.draft === draft.value);
    await openHistory();
    await setRange('all'); await openCard(foreign.title);
    check('other-paper history restores its own draft', draft.value === foreign.draft && paper.textContent?.includes(otherScope.title));
    await openHistory();
    panel.addQuote({ text: 'Synthetic selected passage from current paper.', pageLabel: '4' });
    await until('quote returns to chat', () => root.dataset.view === 'chat');
    check('selected quotation exits history into current paper chat', draft.value === second.draft && find<NativeEditable>('.zar-quote-input').value === 'Synthetic selected passage from current paper.' && !find<HTMLElement>('.zar-compose > .zar-quote').hidden);
    await openHistory(); await setRange('all');
    const renameTarget = card(foreign.title);
    (win as any).prompt = () => '已重命名的独立对话';
    Array.from(renameTarget.querySelectorAll<NativeButton>('button')).find(button => button.getAttribute('label') === '重命名')!.doCommand();
    await until('rename in history', () => cards().some(element => element.querySelector('.zar-history-title')?.textContent === '已重命名的独立对话'));
    check('rename updates history without opening chat', root.dataset.view === 'history' && service.getConversation(foreign.id)?.title === '已重命名的独立对话');
    (win as any).confirm = () => true;
    const deleteTarget = card('已重命名的独立对话');
    Array.from(deleteTarget.querySelectorAll<NativeButton>('button')).find(button => button.getAttribute('label') === '删除')!.doCommand();
    await until('delete synthetic conversation', () => !service.getConversation(foreign.id));
    check('delete affects only targeted in-memory conversation', root.dataset.view === 'history' && !!service.getConversation(first.id) && !!service.getConversation(second.id) && !service.getConversation(foreign.id));
    for (let index = 0; index < 18; index++) {
      const filler = service.createConversation(scope);
      service.renameConversation(filler.id, `Synthetic scroll fixture ${String(index + 1).padStart(2, '0')}`);
      service.setDraft(filler.id, `Unsent synthetic draft ${index + 1}`);
    }
    await until('long history list renders', () => cards().length === 20);
    const rootRect = root.getBoundingClientRect(); const historyRect = history.getBoundingClientRect();
    check('history stays within sidebar frame', historyRect.width > 0 && historyRect.top >= rootRect.top - 1 && historyRect.bottom <= rootRect.bottom + 1);
    check('history list scrolls internally', list.scrollHeight > list.clientHeight && win.getComputedStyle(list).overflowY === 'auto');
    list.scrollTop = list.scrollHeight; await pause();
    check('history scroll reaches older cards without exposing composer', list.scrollTop > 0 && !visible(composer) && root.dataset.view === 'history');
    check('history root does not expand its 304px container', root.getBoundingClientRect().width <= overlay.getBoundingClientRect().width + 1);
    check('304px history has no horizontal overflow', root.scrollWidth <= root.clientWidth + 1 && history.scrollWidth <= history.clientWidth + 1 && list.scrollWidth <= list.clientWidth + 1);
    check('fake transport was used only for three seeded conversations', requests === 3);
    check('all fixture storage stayed in isolated memory', !!saved && service.listConversations().length === 20);
    return checks;
  } finally {
    (win as any).prompt = previousPrompt; (win as any).confirm = previousConfirm;
    panel?.destroy(); overlay.remove(); await service.shutdown();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
}
