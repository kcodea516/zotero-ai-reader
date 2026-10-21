import type { Conversation, Host, Message, PaperScope, Quote } from './types.ts';
import { renderMarkdown } from './render.ts';
import { normalizeUserMessageColor, getUserMessageTextColor } from './appearance.ts';
import { getLanguage, tr, localizeError, type UILanguage } from './i18n.ts';
import { nativeButton, nativeEditable, nativeSelect, nativeTooltip, multilineKeys, setNativeOptions, type NativeButton, type NativeOption } from './controls.ts';

const XHTML = 'http://www.w3.org/1999/xhtml';
const sameScope = (a: PaperScope, b: PaperScope) => a.libraryID === b.libraryID && a.itemKey === b.itemKey;
const failure = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

export function mountSidebar(body: HTMLElement, initialScope: PaperScope, host: Host): {
  updateScope(scope: PaperScope): void; destroy(): void; addQuote(quote: Quote): void; show(): void;
} {
  const doc = body.ownerDocument;
  const win = doc.defaultView!;
  let language = getLanguage(host.service.getConfig());
  let renderedLanguage: UILanguage | undefined;
  const t = (zh: string, en: string): string => tr(language, zh, en);
  const buttonLabels = new Map<NativeButton, { zh: string; en: string }>();
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
    const node = doc.createElementNS(XHTML, tag) as HTMLElementTagNameMap[K];
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function button(label: string, action: () => void, cls = '', english = label): NativeButton {
    const node = nativeButton(doc, t(label, english), action, cls);
    buttonLabels.set(node, { zh: label, en: english });
    return node;
  }
  let scope = { ...initialScope };
  let conversationId = host.service.forScope(scope).id;
  let destroyed = false;
  let historyOpen = false;
  let allHistory = false;
  let query = '';
  let actionError = '';
  let actionEpoch = 0;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let modelsSignature = '';
  let historySignature = '';
  let quoteSignature = '';
  let renderedConversationId = '';
  const copyTimers = new Map<string, number>();
  const historyRendered = new Map<string, { root: HTMLElement; title: HTMLElement; paper: HTMLElement; time: HTMLTimeElement; preview: HTMLElement; count: HTMLElement; badge: HTMLElement }>();
  const rendered = new Map<string, { root: HTMLElement; content: HTMLElement; signature: string; contentText: string | undefined; quoteRef: Quote | undefined; headerSignature: string; header: HTMLElement; quote: HTMLElement; error: HTMLElement; copy: HTMLButtonElement; feedback: HTMLElement; context: HTMLElement; sources: HTMLDetailsElement }>();
  const root = el('div', 'zar-root zar-sidebar');
  root.setAttribute('aria-label', 'AI 阅读助手');
  const toolbar = el('div', 'zar-toolbar');
  const modelSelect = nativeSelect(doc, 'zar-model', '选择接口和模型');
  nativeTooltip(modelSelect, '切换后，下一次提问将使用所选模型，并保留此前已完成的对话。');
  const toolbarActions = el('div', 'zar-toolbar-actions');
  const newButton = button('新建', () => {
    prepareNavigation(); conversationId = host.service.createConversation(scope).id; historyOpen = false; render(); draft.focus();
  }, '', 'New');
  nativeTooltip(newButton, '为当前文献新建会话');
  const historyButton = button('历史', () => { prepareNavigation(); historyOpen = true; render(); historyQuery.focus(); }, '', 'History');
  historyButton.setAttribute('aria-expanded', 'false');
  const settingsButton = button('设置', () => host.openSettings(win), '', 'Settings');
  toolbarActions.append(newButton, historyButton, settingsButton); toolbar.append(modelSelect, toolbarActions);
  const paper = el('div', 'zar-paper');
  const paperLabel = el('div', 'zar-muted'); const paperTitle = el('strong');
  const returnButton = button('返回当前文献', () => { prepareNavigation(); conversationId = host.service.forScope(scope).id; render(); }, 'zar-text-button', 'Return to current paper');
  const readingOptions = el('div', 'zar-reading-options');
  const currentLabel = el('label'); const currentCheck = el('input'); currentCheck.type = 'checkbox';
  const currentLabelText = doc.createTextNode('读取原文');
  currentLabel.append(currentCheck, currentLabelText);
  currentLabel.title = '发送问题时自动读取当前论文的本地 PDF 原文。';
  const relatedLabel = el('label'); const relatedCheck = el('input'); relatedCheck.type = 'checkbox';
  const relatedLabelText = doc.createTextNode('按需查文库');
  relatedLabel.append(relatedCheck, relatedLabelText);
  relatedLabel.title = '仅在问题需要比较其他文献或补充依据时，检索同一 Zotero 文库（不限当前分组）中的原文。';
  readingOptions.append(currentLabel, relatedLabel);
  paper.append(paperLabel, paperTitle, returnButton, readingOptions);
  const history = el('div', 'zar-history');
  history.setAttribute('role', 'region'); history.setAttribute('aria-label', '历史对话');
  const historyHeader = el('div', 'zar-history-header');
  const historyHeading = el('h2', '', '历史对话');
  const historyBack = button('返回对话', () => { prepareNavigation(); historyOpen = false; render(); draft.focus(); }, 'zar-history-back', 'Back to chat');
  historyHeader.append(historyHeading, historyBack);
  const historyControls = el('div', 'zar-row zar-history-controls');
  const historyScope = nativeSelect(doc, 'zar-history-scope', '历史记录范围');
  setNativeOptions(historyScope, [{ value: 'paper', label: '当前文献' }, { value: 'all', label: '全部历史' }], 'paper');
  const historyQuery = el('input'); historyQuery.type = 'search'; historyQuery.placeholder = '搜索对话'; historyQuery.setAttribute('aria-label', '搜索对话内容与标题');
  historyControls.append(historyScope, historyQuery);
  const historyList = el('div', 'zar-history-list');
  const historyEmpty = el('div', 'zar-empty');
  const historyStatus = el('div', 'zar-status'); historyStatus.setAttribute('role', 'status'); historyStatus.setAttribute('aria-live', 'polite');
  const exportButton = button('复制当前会话为 Markdown', () => {
    const value = current();
    if (!value) return;
    const content = [`# ${value.title}`, '', `${t('文献：', 'Paper: ')}${value.scope.title}`, '', ...value.messages.flatMap(message => [
      `## ${message.role === 'user' ? t('我', 'You') : 'AI'}${message.modelName ? ` · ${message.endpointName || ''} / ${message.modelName}` : ''}`,
      '', ...(message.quote ? [`> ${message.quote.text.split('\n').join('\n> ')}`, ''] : []), message.content,
      ...(message.status === 'complete' ? [] : [`\n[${statusLabel(message.status)}]`]), '',
    ])].join('\n');
    host.copy(content); actionError = '已复制当前会话。'; renderStatus();
  }, 'zar-text-button', 'Copy chat as Markdown');
  history.append(historyHeader, historyControls, historyList, exportButton, historyStatus);
  const messages = el('div', 'zar-messages'); messages.setAttribute('role', 'log'); messages.setAttribute('aria-label', '对话记录');
  // Announcing every streamed token makes screen readers unusable; status is announced separately.
  messages.setAttribute('aria-live', 'off');
  const empty = el('div', 'zar-empty');
  empty.append(el('p', '', '直接询问当前论文的章节、方法或实验，无需粘贴原文。'), el('p', '', '要对照其他论文，可在问题中写出简称或标题。也可以选中文字后点击“询问 AI”。'));
  const compose = el('div', 'zar-compose');
  const quoteBox = el('div', 'zar-quote');
  const quoteHeader = el('div', 'zar-row');
  const quoteLabel = el('span', 'zar-muted');
  const quoteRemove = button('移除', () => { const value = current(); if (value) host.service.setQuote(value.id, undefined); }, 'zar-text-button', 'Remove');
  const quoteInput = nativeEditable(doc, 'zar-quote-input', '本次提问引用，可编辑', 3, 8);
  multilineKeys(quoteInput);
  quoteHeader.append(quoteLabel, quoteRemove); quoteBox.append(quoteHeader, quoteInput);
  const draft = nativeEditable(doc, 'zar-input', '问题', 3, 10);
  draft.placeholder = '询问这篇文献…';
  multilineKeys(draft, submit);
  // editable-text is transparent when empty and unfocused. Keep its outline
  // independent of the native control's editing/preview state.
  const draftFrame = el('div', 'zar-input-frame');
  draftFrame.append(draft);
  const composeFooter = el('div', 'zar-compose-footer');
  const hint = el('span', 'zar-muted zar-compose-hint', 'Enter 发送 · Shift+Enter 换行');
  const composeControls = el('div', 'zar-compose-controls');
  const retryButton = button('重试', () => { const value = current(); if (value) run(() => host.service.retry(value.id)); }, '', 'Retry');
  const sendButton = button('发送', () => submit(), '', 'Send');
  const stopButton = button('停止', () => { const value = current(); if (value) host.service.stop(value.id); }, '', 'Stop');
  const stopControl = el('div', 'zar-stop-control');
  const stopProgress = el('span', 'zar-stop-progress'); stopProgress.setAttribute('aria-hidden', 'true');
  stopControl.append(stopButton, stopProgress);
  composeControls.append(retryButton, sendButton, stopControl); composeFooter.append(hint, composeControls);
  const status = el('div', 'zar-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  compose.append(quoteBox, draftFrame, composeFooter, status);
  root.append(toolbar, paper, history, messages, compose); body.append(root);

  function localizeStaticControls(): void {
    root.lang = language;
    root.setAttribute('aria-label', t('AI 阅读助手', 'AI Reading Assistant'));
    for (const [node, labels] of buttonLabels) {
      const label = t(labels.zh, labels.en);
      node.setAttribute('label', label); node.setAttribute('aria-label', label);
    }
    modelSelect.setAttribute('aria-label', t('选择接口和模型', 'Select endpoint and model'));
    nativeTooltip(modelSelect, t('切换后，下一次提问将使用所选模型，并保留此前已完成的对话。', 'The next question uses the selected model and keeps completed conversation history.'));
    nativeTooltip(newButton, t('为当前文献新建会话', 'Start a new chat for the current paper'));
    currentLabelText.data = t('读取原文', 'Read paper');
    currentLabel.title = t('发送问题时自动读取当前论文的本地 PDF 原文。', 'Read the current paper’s local PDF when sending a question.');
    relatedLabelText.data = t('按需查文库', 'Search library as needed');
    relatedLabel.title = t('仅在问题需要比较其他文献或补充依据时，检索同一 Zotero 文库（不限当前分组）中的原文。', 'Search originals in the same Zotero library, across all collections, only when a comparison or additional evidence is needed.');
    history.setAttribute('aria-label', t('历史对话', 'Chat history'));
    historyHeading.textContent = t('历史对话', 'Chat history');
    historyScope.setAttribute('aria-label', t('历史记录范围', 'History scope'));
    setNativeOptions(historyScope, [{ value: 'paper', label: t('当前文献', 'Current paper') }, { value: 'all', label: t('全部历史', 'All history') }], allHistory ? 'all' : 'paper');
    historyQuery.placeholder = t('搜索对话', 'Search chats');
    historyQuery.setAttribute('aria-label', t('搜索对话内容与标题', 'Search chat contents and titles'));
    messages.setAttribute('aria-label', t('对话记录', 'Conversation messages'));
    empty.children[0].textContent = t('直接询问当前论文的章节、方法或实验，无需粘贴原文。', 'Ask about the current paper’s sections, methods, or experiments without pasting the original.');
    empty.children[1].textContent = t('要对照其他论文，可在问题中写出简称或标题。也可以选中文字后点击“询问 AI”。', 'Name another paper to compare it, or select a passage and choose “Ask AI”.');
    quoteInput.setAttribute('aria-label', t('本次提问引用，可编辑', 'Quoted passage for this question, editable'));
    draft.setAttribute('aria-label', t('问题', 'Question'));
    hint.textContent = t('Enter 发送 · Shift+Enter 换行', 'Enter to send · Shift+Enter for a new line');
  }
  function current(): Conversation | undefined { return host.service.getConversation(conversationId); }
  function prepareNavigation(): void {
    if (!historyOpen && renderedConversationId) {
      const outgoing = host.service.getConversation(renderedConversationId);
      // Commit native editor values before changing which conversation owns them.
      draft.ref?.blur(); quoteInput.ref?.blur();
      if (outgoing) {
        if (draft.value !== outgoing.draft) host.service.setDraft(outgoing.id, draft.value);
        if (outgoing.quote && quoteInput.value !== outgoing.quote.text) host.service.setQuote(outgoing.id, { ...outgoing.quote, text: quoteInput.value });
      }
    }
    actionEpoch++; actionError = '';
  }
  function run(action: () => unknown): void {
    actionError = '';
    const target = conversationId;
    const epoch = actionEpoch;
    const report = (error: unknown) => {
      if (destroyed || conversationId !== target || actionEpoch !== epoch) return;
      actionError = failure(error); renderStatus();
    };
    try { Promise.resolve(action()).catch(report); }
    catch (error) { report(error); }
  }
  function submit(): void {
    const value = current();
    if (!value || host.service.isBusy(value.id) || !(draft.value.trim() || value.quote?.text.trim())) return;
    if (!modelSelect.value) { actionError = '请先在设置中添加 API 和模型。'; renderStatus(); return; }
    host.service.setDraft(value.id, draft.value);
    run(() => host.service.send(value.id));
    render(); draft.focus();
  }
  function statusLabel(value: string): string {
    return ({ streaming: t('正在生成…', 'Generating…'), error: t('回答未完成', 'Incomplete response'), stopped: t('已停止', 'Stopped'), interrupted: t('上次生成已中断', 'Previous response interrupted'), complete: '' } as Record<string, string>)[value] || '';
  }
  function renderStatus(): void {
    const text = [host.service.storageError, actionError].filter(Boolean).map(value => localizeError(value, language)).join('\n');
    status.textContent = text; historyStatus.textContent = text;
  }
  function activate(value: Conversation): void {
    prepareNavigation(); conversationId = value.id; host.service.activateConversation(value.id); actionError = ''; historyOpen = false; render(); draft.focus();
  }
  function renderHistory(): void {
    if (!historyOpen) return;
    const entries = host.service.listConversations(allHistory ? undefined : scope, query);
    const signature = JSON.stringify([language, allHistory, query, conversationId, entries.map(value => {
      const last = value.messages.at(-1);
      return [value.id, value.title, value.scope.title, value.updatedAt, value.messages.length, last?.id, last?.content, last?.quote?.text, last?.status, last?.contextNotice];
    })]);
    if (signature === historySignature) return;
    historySignature = signature;
    const focused = historyList.contains(doc.activeElement) ? doc.activeElement as HTMLElement : undefined;
    const wanted: HTMLElement[] = [];
    if (!entries.length) {
      historyEmpty.textContent = query ? t('没有找到匹配的对话。', 'No matching chats.') : t('暂无对话记录。', 'No chat history yet.');
      wanted.push(historyEmpty);
    }
    for (const entry of entries) {
      let card = historyRendered.get(entry.id);
      if (!card) {
        const item = el('div', 'zar-history-item');
        const open = el('button', 'zar-history-open'); open.type = 'button';
        open.addEventListener('click', () => {
          const value = host.service.getConversation(entry.id);
          if (value) activate(value);
        });
        const heading = el('span', 'zar-history-heading');
        const title = el('span', 'zar-history-title');
        const badge = el('span', 'zar-history-current', '当前会话');
        heading.append(title, badge);
        const paper = el('span', 'zar-history-paper');
        const meta = el('span', 'zar-history-meta');
        const time = el('time');
        const count = el('span', 'zar-history-count');
        meta.append(time, count);
        const preview = el('span', 'zar-history-preview');
        open.append(heading, paper, meta, preview);
        const tools = el('div', 'zar-history-tools');
        tools.append(button('重命名', () => {
          const value = host.service.getConversation(entry.id);
          if (!value) return;
          const next = win.prompt(t('会话名称', 'Chat name'), value.title);
          if (next?.trim()) run(() => host.service.renameConversation(value.id, next.trim()));
        }, 'zar-text-button', 'Rename'), button('删除', () => {
          const value = host.service.getConversation(entry.id);
          if (!value) return;
          if (win.confirm(t(`确定删除“${value.title}”的全部对话记录吗？此操作无法撤销。`, `Delete all messages in “${value.title}”? This cannot be undone.`))) {
            run(() => host.service.deleteConversation(value.id));
            if (!current()) conversationId = host.service.forScope(scope).id;
            render();
          }
        }, 'zar-text-button', 'Delete'));
        item.append(open, tools);
        card = { root: item, title, paper, time, preview, count, badge };
        historyRendered.set(entry.id, card);
      }
      const active = entry.id === conversationId;
      card.root.setAttribute('aria-current', String(active));
      card.badge.hidden = !active; card.badge.textContent = t('当前会话', 'Current');
      card.title.textContent = entry.title || t('新对话', 'New chat');
      card.paper.textContent = entry.scope.title;
      card.paper.title = entry.scope.title;
      const updated = new Date(entry.updatedAt);
      card.time.textContent = updated.toLocaleString(language, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      card.time.dateTime = updated.toISOString(); card.time.title = updated.toLocaleString(language);
      const turns = entry.messages.filter(message => message.role === 'user').length;
      card.count.textContent = t(`${turns} 轮对话`, `${turns} ${turns === 1 ? 'exchange' : 'exchanges'}`);
      const last = entry.messages.at(-1);
      const preview = last?.content || last?.quote?.text || (last?.contextNotice ? localizeError(last.contextNotice, language) : '') || (last ? statusLabel(last.status) : t('暂无消息', 'No messages yet'));
      card.preview.textContent = `${last ? (last.role === 'user' ? t('我：', 'You: ') : t('AI：', 'AI: ')) : ''}${preview.replace(/\s+/g, ' ').trim().slice(0, 180)}`;
      wanted.push(card.root);
    }
    for (const child of Array.from(historyList.children)) if (!wanted.includes(child as HTMLElement)) child.remove();
    // Keep each card and action button mounted while streamed previews change.
    for (let index = 0; index < wanted.length; index++) if (historyList.children[index] !== wanted[index]) historyList.insertBefore(wanted[index], historyList.children[index] || null);
    if (focused?.isConnected && doc.activeElement !== focused) focused.focus({ preventScroll: true });
    const retained = new Set(host.service.listConversations().map(entry => entry.id));
    for (const [id, card] of historyRendered) if (!retained.has(id)) {
      for (const node of card.root.querySelectorAll<NativeButton>('.zar-native-button')) buttonLabels.delete(node);
      historyRendered.delete(id);
    }
  }
  function renderModels(value: Conversation): void {
    const config = host.service.getConfig();
    const signature = JSON.stringify([language, config.endpoints, config.models]);
    if (signature !== modelsSignature) {
      modelsSignature = signature;
      const options: NativeOption[] = [{ value: '', label: config.models.length ? t('请选择模型', 'Select a model') : t('请先在设置中添加模型', 'Add a model in Settings') }];
      for (const model of config.models) {
        const endpoint = config.endpoints.find(entry => entry.id === model.endpointId);
        if (endpoint) options.push({ label: `${endpoint.name} / ${model.name}`, value: model.id });
      }
      setNativeOptions(modelSelect, options, value.modelId);
    }
    modelSelect.value = value.modelId;
    if (modelSelect.selectedIndex === -1) modelSelect.value = '';
    modelSelect.disabled = !config.models.length;
  }
  function renderMessage(message: Message): HTMLElement {
    let entry = rendered.get(message.id);
    if (!entry) {
      const messageRoot = el('article', `zar-message zar-message-${message.role}`);
      const header = el('div', 'zar-message-header');
      const actions = el('div', 'zar-message-actions');
      const copy = el('button', 'zar-message-copy');
      copy.type = 'button';
      copy.title = '复制消息原文';
      copy.setAttribute('aria-label', '复制消息原文');
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const outline = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      outline.setAttribute('d', 'M9 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2');
      const square = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      square.setAttribute('x', '3'); square.setAttribute('y', '7');
      square.setAttribute('width', '14'); square.setAttribute('height', '14');
      square.setAttribute('rx', '2');
      svg.append(outline, square); copy.append(svg);
      const feedback = el('span', 'zar-copy-feedback');
      feedback.setAttribute('role', 'status');
      copy.addEventListener('click', () => {
        const text = current()?.messages.find(value => value.id === message.id)?.content;
        if (!text) return;
        try {
          host.copy(text);
          feedback.textContent = t('已复制', 'Copied');
          copy.title = t('已复制', 'Copied');
          if (copyTimers.has(message.id)) win.clearTimeout(copyTimers.get(message.id));
          copyTimers.set(message.id, win.setTimeout(() => {
            feedback.textContent = ''; copy.title = t('复制消息原文', 'Copy message'); copyTimers.delete(message.id);
          }, 1600));
        } catch { actionError = '复制失败，请重试。'; renderStatus(); }
      });
      actions.append(copy, feedback);
      const quote = el('blockquote', 'zar-message-quote');
      const context = el('div', 'zar-message-context zar-muted');
      const content = el('div', 'zar-markdown');
      const error = el('div', 'zar-message-error');
      const sources = el('details', 'zar-message-sources');
      sources.hidden = true;
      messageRoot.append(header, quote, context, content, sources, error, actions);
      entry = { root: messageRoot, content, signature: '', contentText: undefined, quoteRef: undefined, headerSignature: '', header, quote, error, copy, feedback, context, sources }; rendered.set(message.id, entry);
    }
    const signature = JSON.stringify([language, message.status, message.error, message.modelName, message.endpointName, message.contextNotice, message.sources]);
    if (entry.contentText !== message.content || entry.quoteRef !== message.quote || entry.signature !== signature) {
      entry.signature = signature; entry.contentText = message.content; entry.quoteRef = message.quote;
      const headerSignature = JSON.stringify([language, message.role, message.createdAt, message.modelName, message.endpointName]);
      if (entry.headerSignature !== headerSignature) {
        entry.headerSignature = headerSignature;
        const role = el('span', 'zar-message-role', message.role === 'user' ? t('我', 'You') : 'AI');
        const time = el('time', '', new Date(message.createdAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }));
        time.dateTime = new Date(message.createdAt).toISOString(); time.title = new Date(message.createdAt).toLocaleString(language);
        entry.header.replaceChildren(role, time);
        if (message.modelName) entry.header.append(el('span', 'zar-message-model', `${message.endpointName || 'API'} / ${message.modelName}`));
      }
      entry.copy.disabled = !message.content;
      entry.copy.title = copyTimers.has(message.id) ? t('已复制', 'Copied') : t('复制消息原文', 'Copy message');
      entry.copy.setAttribute('aria-label', t('复制消息原文', 'Copy message'));
      if (copyTimers.has(message.id)) entry.feedback.textContent = t('已复制', 'Copied');
      entry.quote.hidden = !message.quote;
      entry.quote.textContent = message.quote ? `${message.quote.pageLabel ? `${t(`第 ${message.quote.pageLabel} 页`, `Page ${message.quote.pageLabel}`)}\n` : ''}${message.quote.text}` : '';
      entry.context.textContent = message.contextNotice ? localizeError(message.contextNotice, language) : '';
      entry.context.hidden = !message.contextNotice;
      renderMarkdown(entry.content, message.content || (message.status === 'streaming' && !message.contextNotice ? t('正在生成…', 'Generating…') : ''), host.openURL, message.sources, host.openSource, language);
      entry.sources.hidden = !message.sources?.length;
      entry.sources.replaceChildren();
      if (message.sources?.length) {
        entry.sources.append(el('summary', '', t(`本轮原文来源 · ${message.sources.length} 篇`, `Original sources · ${message.sources.length}`)));
        for (const source of message.sources) {
          const sourceItem = el('div', 'zar-source-item');
          const sourceButton = el('button', 'zar-source-link'); sourceButton.type = 'button';
          sourceButton.textContent = `${source.id} · ${source.title}`;
          sourceButton.title = t(`打开原文，PDF 第 ${source.pages[0]} 页`, `Open original at PDF page ${source.pages[0]}`);
          sourceButton.addEventListener('click', () => host.openSource?.(source, source.pages[0]));
          const pages = source.pages.length > 8 ? `${source.pages.slice(0, 8).join(t('、', ', '))}…` : source.pages.join(t('、', ', '));
          const description = el('div', 'zar-source-pages', t(`PDF 页码：${pages}${source.truncated ? ' · 按问题摘取的片段' : ''}`, `PDF pages: ${pages}${source.truncated ? ' · Selected excerpts' : ''}`));
          sourceItem.append(sourceButton, description);
          entry.sources.append(sourceItem);
        }
      }
      entry.error.textContent = [statusLabel(message.status), message.error ? localizeError(message.error, language) : ''].filter(Boolean).join(' · ');
      entry.error.hidden = !entry.error.textContent;
    }
    return entry.root;
  }
  function render(): void {
    if (destroyed) return;
    const config = host.service.getConfig();
    language = getLanguage(config);
    const languageChanged = renderedLanguage !== language;
    const switchingLanguage = renderedLanguage !== undefined && languageChanged;
    const previousMessagesScroll = messages.scrollTop;
    const previousHistoryScroll = historyList.scrollTop;
    const focused = doc.activeElement as HTMLElement | null;
    if (languageChanged) { localizeStaticControls(); renderedLanguage = language; }
    const userMessageColor = normalizeUserMessageColor(config.appearance?.userMessageColor);
    root.style.setProperty('--zar-user-message-bg', userMessageColor);
    root.style.setProperty('--zar-user-message-fg', getUserMessageTextColor(userMessageColor));
    let value = current();
    if (!value) { value = host.service.forScope(scope); conversationId = value.id; }
    root.dataset.view = historyOpen ? 'history' : 'chat';
    toolbar.hidden = historyOpen; paper.hidden = historyOpen; messages.hidden = historyOpen; compose.hidden = historyOpen;
    history.hidden = !historyOpen;
    historyButton.setAttribute('aria-expanded', String(historyOpen));
    if (historyOpen) {
      renderHistory(); renderStatus();
      if (switchingLanguage) {
        if (focused?.isConnected && doc.activeElement !== focused) focused.focus({ preventScroll: true });
        historyList.scrollTop = previousHistoryScroll;
      }
      return;
    }
    const pinned = renderedConversationId !== value.id || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
    renderedConversationId = value.id;
    const foreign = !sameScope(value.scope, scope);
    paperLabel.textContent = foreign ? t('正在查看其他文献的会话', 'Chat for another paper') : t('当前文献', 'Current paper');
    paperTitle.textContent = value.scope.title; paperTitle.title = value.scope.title;
    returnButton.hidden = !foreign;
    renderModels(value);
    const wanted = value.messages.map(renderMessage);
    if (!wanted.length) wanted.push(empty);
    for (const child of Array.from(messages.children)) if (!wanted.includes(child as HTMLElement)) child.remove();
    // Existing nodes are not recreated while tokens arrive, keeping focus and selection stable.
    for (let index = 0; index < wanted.length; index++) if (messages.children[index] !== wanted[index]) messages.insertBefore(wanted[index], messages.children[index] || null);
    const keep = new Set(value.messages.map(message => message.id));
    for (const id of rendered.keys()) if (!keep.has(id)) {
      if (copyTimers.has(id)) win.clearTimeout(copyTimers.get(id));
      copyTimers.delete(id); rendered.delete(id);
    }
    if (draft.value !== value.draft) draft.value = value.draft;
    draft.placeholder = foreign ? t('继续这段会话…', 'Continue this chat…') : t('询问这篇文献…', 'Ask about this paper…');
    const nextQuoteSignature = JSON.stringify([language, value.id, value.quote]);
    quoteBox.hidden = !value.quote;
    if (nextQuoteSignature !== quoteSignature) {
      quoteSignature = nextQuoteSignature;
      quoteLabel.textContent = value.quote?.pageLabel ? t(`本次引用 · 第 ${value.quote.pageLabel} 页`, `Quoted passage · Page ${value.quote.pageLabel}`) : t('本次引用', 'Quoted passage');
      if (quoteInput.value !== (value.quote?.text || '')) quoteInput.value = value.quote?.text || '';
    }
    const busy = host.service.isBusy(value.id);
    const reading = host.service.getReadingOptions(value.id);
    currentCheck.checked = reading.currentPaper; relatedCheck.checked = reading.relatedPapers;
    currentCheck.disabled = busy; relatedCheck.disabled = busy;
    sendButton.hidden = busy; stopButton.hidden = !busy; stopControl.hidden = !busy;
    nativeTooltip(stopButton, t('正在生成，点击停止', 'Generating; click to stop'));
    sendButton.disabled = !(value.draft.trim() || value.quote?.text.trim()) || !modelSelect.value;
    nativeTooltip(sendButton, modelSelect.value ? t('发送问题及本次引用', 'Send question and quoted passage') : t('请先在设置中添加 API 和模型', 'Add an API endpoint and model in Settings first.'));
    retryButton.disabled = !modelSelect.value;
    const lastAssistant = [...value.messages].reverse().find(message => message.role === 'assistant');
    retryButton.hidden = busy || !lastAssistant || !['error', 'stopped', 'interrupted'].includes(lastAssistant.status);
    if (switchingLanguage) {
      if (focused?.isConnected && doc.activeElement !== focused) focused.focus({ preventScroll: true });
      messages.scrollTop = previousMessagesScroll;
    } else if (pinned) messages.scrollTop = messages.scrollHeight;
    renderStatus();
  }
  const schedule = () => {
    if (destroyed || scheduled) return;
    scheduled = setTimeout(() => { scheduled = undefined; render(); }, 90);
  };
  const unsubscribe = host.service.subscribe(schedule);
  modelSelect.addEventListener('command', () => { const value = current(); if (value) run(() => host.service.setModel(value.id, modelSelect.value)); });
  historyScope.addEventListener('command', () => { allHistory = historyScope.value === 'all'; render(); });
  historyQuery.addEventListener('input', () => { query = historyQuery.value; render(); });
  for (const control of [currentCheck, relatedCheck]) control.addEventListener('change', () => {
    const value = current();
    if (value) run(() => host.service.setReadingOptions(value.id, { currentPaper: currentCheck.checked, relatedPapers: relatedCheck.checked }));
  });
  draft.addEventListener('input', () => {
    const value = host.service.getConversation(renderedConversationId); if (value) { host.service.setDraft(value.id, draft.value); sendButton.disabled = !(draft.value.trim() || value.quote?.text.trim()) || !modelSelect.value; }
  });
  quoteInput.addEventListener('input', () => {
    const value = host.service.getConversation(renderedConversationId); if (value?.quote) host.service.setQuote(value.id, { ...value.quote, text: quoteInput.value });
  });
  render();
  return {
    updateScope(nextScope) {
      const changed = !sameScope(scope, nextScope);
      if (changed) prepareNavigation();
      scope = { ...nextScope };
      if (changed) { conversationId = host.service.forScope(scope).id; actionError = ''; historySignature = ''; }
      render();
    },
    addQuote(quote) {
      prepareNavigation();
      if (!sameScope(current()?.scope || scope, scope)) conversationId = host.service.forScope(scope).id;
      const value = current(); if (value) host.service.setQuote(value.id, quote);
      historyOpen = false; root.hidden = false; render(); draft.focus();
    },
    show() { prepareNavigation(); historyOpen = false; root.hidden = false; render(); draft.focus(); },
    destroy() {
      destroyed = true; actionEpoch++; unsubscribe(); if (scheduled) clearTimeout(scheduled);
      for (const timer of copyTimers.values()) win.clearTimeout(timer);
      copyTimers.clear(); rendered.clear(); historyRendered.clear(); buttonLabels.clear(); root.remove(); void host.service.flush().catch(() => {});
    },
  };
}
