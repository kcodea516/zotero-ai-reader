import { conversationMarkdown, type ExportFormat } from './chat-export.ts';
import { inputImagesFromFiles, type InputImage } from './image-data.ts';
import { imageButton } from './image-viewer.ts';
import { inputImageThumbnails } from './input-images-ui.ts';
import { mountRaster } from './media.ts';
import { mountMessageDisclosure } from './message-disclosure.ts';
import { annotationMarkdown } from './annotations.ts';
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
  let attachmentSignature = '';
  let attachmentLoading = 0;
  let renderedConversationId = '';
  const copyTimers = new Map<string, number>();
  const historyRendered = new Map<string, { root: HTMLElement; title: HTMLElement; paper: HTMLElement; time: HTMLTimeElement; preview: HTMLElement; count: HTMLElement; badge: HTMLElement }>();
  const expandedMessages = new Set<string>();
  const annotationSelections = new Map<string, Set<string>>();
  const annotationActions = new Set<string>();
  const rendered = new Map<string, { disclosure?: ReturnType<typeof mountMessageDisclosure>; annotation: HTMLElement; root: HTMLElement; content: HTMLElement; signature: string; contentText: string | undefined; quoteRef: Quote | undefined; headerSignature: string; header: HTMLElement; quote: HTMLElement; error: HTMLElement; copy: HTMLButtonElement; feedback: HTMLElement; context: HTMLElement; sources: HTMLDetailsElement }>();
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
  const functionBar = el('div', 'zar-function-bar');
  functionBar.setAttribute('role', 'group');
  const functionLabel = el('div', 'zar-function-label');
  const exportMenu = button('导出', () => {}, 'zar-export-menu', 'Export');
  exportMenu.setAttribute('type', 'menu');
  const exportChoices = doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menupopup') as HTMLElement & { hidePopup(): void };
  // Keep the popup and its items native. A blur on an HTML details wrapper can
  // hide XUL buttons between pointer-down and their command event.

  let exporting = false;
  const exportActions = (['md', 'txt', 'pdf'] as ExportFormat[]).map(format => {
    const choice = doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem') as NativeButton;
    choice.setAttribute('label', format === 'md' ? 'Markdown (.md)' : format.toUpperCase() + ' (.' + format + ')');
    choice.addEventListener('command', () => {
      const value = current(); if (!value?.messages.length || exporting || !host.exportConversation) return;
      // Capture before opening the picker so streaming/navigation cannot change this export.
      const snapshot: Conversation = JSON.parse(JSON.stringify(value));
      exportChoices.hidePopup(); exporting = true; exportMenu.disabled = true; exportActions.forEach(b => b.disabled = true);
      actionError = t('正在导出…', 'Exporting…'); renderStatus();
      void host.exportConversation(snapshot, format, win).then(saved => {
        actionError = saved ? t('对话已导出。', 'Chat exported.') : '';
      }).catch(error => { actionError = localizeError(error, language); }).finally(() => {
        exporting = false; if (!destroyed) render();
      });
    });
    exportChoices.append(choice); return choice;
  });
  exportMenu.append(exportChoices); exportMenu.hidden = !host.exportConversation;
  readingOptions.append(exportMenu);
  functionBar.append(functionLabel, readingOptions);
  paper.append(paperLabel, paperTitle, returnButton, functionBar);
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
    const content = conversationMarkdown(value, language);
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
  const draftAttachments=el('div','zar-draft-images');draftAttachments.hidden=true;
  draftFrame.append(draftAttachments,draft);
  const attachButton=imageButton(doc,'添加图片','plus',()=>{if(host.pickImages)importImages(()=>host.pickImages!(win));});attachButton.classList.add('zar-attach-image');attachButton.hidden=!host.pickImages;
  draftFrame.addEventListener('paste',event=>{const files=Array.from(event.clipboardData?.files||[]);if(files.length){event.preventDefault();event.stopPropagation();importImages(()=>inputImagesFromFiles(files));}},true);
  draftFrame.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
  draftFrame.addEventListener('drop',event=>{const files=Array.from(event.dataTransfer?.files||[]);if(files.length){event.preventDefault();event.stopPropagation();importImages(()=>inputImagesFromFiles(files));}});
  const composeFooter = el('div', 'zar-compose-footer');
  const hint = el('span', 'zar-muted zar-compose-hint', 'Enter 发送 · Shift+Enter 换行');
  const composeControls = el('div', 'zar-compose-controls');
  const retryButton = button('重试', () => { const value = current(); if (value) run(() => host.service.retry(value.id)); }, '', 'Retry');
  const sendButton = button('发送', () => submit(), '', 'Send');
  const stopButton = button('停止', () => { const value = current(); if (value) host.service.stop(value.id); }, '', 'Stop');
  const stopControl = el('div', 'zar-stop-control');
  const stopProgress = el('span', 'zar-stop-progress'); stopProgress.setAttribute('aria-hidden', 'true');
  stopControl.append(stopButton, stopProgress);
  composeControls.append(retryButton, sendButton, stopControl); composeFooter.append(attachButton,hint, composeControls);
  const status = el('div', 'zar-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  compose.append(quoteBox, draftFrame, composeFooter, status);
  root.append(toolbar, paper, history, messages, compose); body.append(root);

  function localizeStaticControls(): void {
    root.lang = language;
    functionLabel.textContent = t('功能栏', 'Tools');
    functionBar.setAttribute('aria-label', t('功能栏', 'Tools'));
    nativeTooltip(exportMenu, t('导出当前对话', 'Export current chat'));
    attachButton.title=t('添加图片，也可粘贴截图','Attach images or paste a screenshot');attachButton.setAttribute('aria-label',t('添加图片','Attach images'));
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
  function importImages(load:()=>Promise<InputImage[]>): void {
    const target=current()?.id;if(!target||destroyed)return;attachmentLoading++;render();
    run(async()=>{try{const images=await load();if(!destroyed&&host.service.getConversation(target)&&images.length)host.service.addDraftImages(target,images);}
      finally{attachmentLoading--;if(!destroyed)render();}});
  }
  function submit(): void {
    const value = current();
    if (!value || attachmentLoading || host.service.isBusy(value.id) || !(draft.value.trim() || value.quote?.text.trim() || value.draftImages?.length)) return;
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
  function renderAnnotationPlan(container: HTMLElement, message: Message): void {
    const plan = message.annotationPlan;
    container.hidden = !plan;
    container.replaceChildren();
    if (!plan) return;
    const conversation = current();
    if (!conversation) return;
    const disabled = !host.annotations || annotationActions.has(message.id) || host.service.isBusy(conversation.id);
    let selected = annotationSelections.get(plan.id);
    if (!selected) { selected = new Set(plan.items.filter(i => i.status === 'ready' && !plan.receipts.some(r => r.candidateID === i.id)).map(i => i.id)); annotationSelections.set(plan.id, selected); }
    container.append(el('div', 'zar-annotation-heading', plan.undone ? t('本批标注已撤销', 'This annotation batch was undone') : t('标注预览', 'Annotation preview')));
    for (const item of plan.items) {
      const applied = plan.receipts.some(r => r.candidateID === item.id) && !plan.undone;
      const card = el('div', 'zar-annotation-card');
      const label = el('label', 'zar-annotation-choice');
      const choose = el('input'); choose.type = 'checkbox'; choose.checked = !plan.undone && !applied && selected.has(item.id);
      choose.disabled = disabled || applied || !!plan.undone || item.status !== 'ready';
      choose.setAttribute('aria-label', t(`选择 PDF 第 ${item.page} 页标注`, `Select annotation on PDF page ${item.page}`));
      choose.addEventListener('change', () => { if (choose.checked) selected!.add(item.id); else selected!.delete(item.id); updateApply(); });
      const state = applied ? t('已写入', 'Saved') : item.status === 'missing' ? t('原句未找到', 'Passage not found') : item.status === 'ambiguous' ? t('存在多处匹配', 'Multiple matches') : t('已定位', 'Located');
      label.append(choose, el('span', '', `PDF ${item.page} · ${item.type === 'underline' ? t('下划线', 'Underline') : t('高亮', 'Highlight')} · ${state}`));
      const quote = el('blockquote', 'zar-annotation-quote', item.quote); quote.style.borderInlineStartColor = item.color;
      const comment = el('div', 'zar-annotation-comment', item.comment);
      card.append(label, quote, comment);
      if (item.status === 'ready') {
        const locate = nativeButton(doc, t('查看原文位置', 'Show passage'), () => {
          void host.annotations?.locate(plan, item.id).catch(error => { actionError = error && typeof error === 'object' && typeof (error as { englishMessage?: unknown }).englishMessage === 'string' ? localizeError(error, language) : t('无法打开原文位置，请检查 PDF 后重试。', 'Could not open the passage. Check the PDF and retry.'); renderStatus(); });
        });
        locate.disabled = disabled; card.append(locate);
      }
      container.append(card);
    }
    const controls = el('div', 'zar-annotation-actions');
    const apply = nativeButton(doc, t('写入所选标注', 'Save selected annotations'), () => { void act(false); });
    function updateApply() { apply.disabled = disabled || !!plan!.undone || ![...selected!].some(id => plan!.items.some(i => i.id === id && i.status === 'ready') && !plan!.receipts.some(r => r.candidateID === id)); }
    updateApply();
    const undo = nativeButton(doc, t('撤销本批标注', 'Undo this batch'), () => { void act(true); });
    undo.disabled = disabled; undo.hidden = !plan.receipts.length || !!plan.undone;
    controls.append(apply, undo); container.append(controls);
    if (!plan.items.length) container.append(el('p', 'zar-muted', t('没有找到适合此次要求的可标注原文，请换一个更具体的要求。', 'No passages were proposed. Try a more specific instruction.')));
    async function act(revert: boolean) {
      if (annotationActions.has(message.id) || !host.annotations || !conversation || !plan) return;
      annotationActions.add(message.id); render();
      try {
        if (revert) {
          await host.annotations.undo(plan);
          host.service.updateAnnotationReceipts(conversation.id, message.id, plan.receipts, true);
          actionError = t('本批标注已移入 Zotero 回收站。', 'This annotation batch was moved to Zotero Trash.');
        } else {
          const receipts = await host.annotations.apply(plan, [...selected!].filter(id => !plan.receipts.some(r => r.candidateID === id)));
          const latest = host.service.getConversation(conversation.id)?.messages.find(m => m.id === message.id)?.annotationPlan;
          const merged = [...(latest?.receipts || [])];
          for (const receipt of receipts) if (!merged.some(r => r.candidateID === receipt.candidateID)) merged.push(receipt);
          host.service.updateAnnotationReceipts(conversation.id, message.id, merged);
          actionError = t(`已写入 ${receipts.length} 条高亮/下划线及注释。`, `Saved ${receipts.length} highlights/underlines and comments.`);
        }
        await host.service.flush();
      } catch (error) {
        actionError = error && typeof error === 'object' && typeof (error as { englishMessage?: unknown }).englishMessage === 'string' ? localizeError(error, language) : t('标注操作未完成，请检查 PDF 与文库权限后重试。', 'The annotation action could not be completed. Check PDF and library permissions, then retry.');
      } finally { annotationActions.delete(message.id); render(); }
    }
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
        const latest = current()?.messages.find(value => value.id === message.id);
        const text = latest ? latest.content + annotationMarkdown(latest.annotationPlan) : '';
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
      const annotation = el('div', 'zar-annotation-plan'); annotation.hidden = true;
      const sources = el('details', 'zar-message-sources');
      sources.hidden = true;
      let disclosure: ReturnType<typeof mountMessageDisclosure> | undefined;
      if (message.role === 'user') {
        const viewport = el('div', 'zar-user-text');
        const body = el('div', 'zar-user-text-body'); body.append(quote, content); viewport.append(body);
        const expand = el('button', 'zar-message-expand');
        disclosure = mountMessageDisclosure(viewport, body, expand, {
          expanded: () => expandedMessages.has(message.id),
          toggle: expanded => { if (expanded) expandedMessages.add(message.id); else expandedMessages.delete(message.id); },
        });
        messageRoot.append(header, context, viewport, expand, sources, annotation, error, actions);
      } else messageRoot.append(header, quote, context, content, sources, annotation, error, actions);
      entry = { disclosure, annotation, root: messageRoot, content, signature: '', contentText: undefined, quoteRef: undefined, headerSignature: '', header, quote, error, copy, feedback, context, sources }; rendered.set(message.id, entry);
    }
    const signature = JSON.stringify([language, message.status, message.error, message.modelName, message.endpointName, message.contextNotice, message.sources, message.images?.map(image=>image.id), message.inputImages?.map(image=>image.id), message.annotationPlan, annotationActions.has(message.id), host.service.isBusy(current()?.id || '')]);
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
      renderAnnotationPlan(entry.annotation, message);
      entry.copy.disabled = !message.content;
      entry.copy.title = copyTimers.has(message.id) ? t('已复制', 'Copied') : t('复制消息原文', 'Copy message');
      entry.copy.setAttribute('aria-label', t('复制消息原文', 'Copy message'));
      if (copyTimers.has(message.id)) entry.feedback.textContent = t('已复制', 'Copied');
      entry.quote.hidden = !message.quote;
      entry.quote.textContent = message.quote ? `${message.quote.pageLabel ? `${t(`第 ${message.quote.pageLabel} 页`, `Page ${message.quote.pageLabel}`)}\n` : ''}${message.quote.text}` : '';
      entry.context.textContent = message.contextNotice ? localizeError(message.contextNotice, language) : '';
      entry.context.hidden = !message.contextNotice;
      renderMarkdown(entry.content, message.content || (message.status === 'streaming' && !message.contextNotice ? t('正在生成…', 'Generating…') : ''), host.openURL, message.sources, host.openSource, language, host);
      if(message.inputImages?.length)entry.content.prepend(inputImageThumbnails(doc,message.inputImages,language));
      for (const image of message.images || []) entry.content.append(mountRaster(doc,image.dataURL,language,host));
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
    entry.disclosure?.update(language);
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
    exportMenu.disabled = !value.messages.length || exporting;
    exportActions.forEach(b => b.disabled = !value.messages.length || exporting);
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
      copyTimers.delete(id); rendered.get(id)?.disclosure?.destroy(); rendered.delete(id);
    }
    const nextAttachments=JSON.stringify([value.id,language,(value.draftImages||[]).map(image=>image.id)]);
    if(attachmentSignature!==nextAttachments){attachmentSignature=nextAttachments;draftAttachments.replaceChildren();draftAttachments.hidden=!value.draftImages?.length;
      if(value.draftImages?.length)draftAttachments.append(inputImageThumbnails(doc,value.draftImages,language,id=>{host.service.removeDraftImage(value!.id,id);draft.focus();}));}
    attachButton.disabled=attachmentLoading>0;
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
    const sendLabel = t('发送', 'Send');
    sendButton.setAttribute('label', sendLabel); sendButton.setAttribute('aria-label', sendLabel);
    sendButton.hidden = busy; stopButton.hidden = !busy; stopControl.hidden = !busy;
    nativeTooltip(stopButton, t('正在生成，点击停止', 'Generating; click to stop'));
    sendButton.disabled = !!attachmentLoading || !(value.draft.trim() || value.quote?.text.trim() || value.draftImages?.length) || !modelSelect.value;
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
      for (const entry of rendered.values()) entry.disclosure?.destroy();
      copyTimers.clear(); expandedMessages.clear(); annotationSelections.clear(); annotationActions.clear(); rendered.clear(); historyRendered.clear(); buttonLabels.clear(); root.remove(); void host.service.flush().catch(() => {});
    },
  };
}
