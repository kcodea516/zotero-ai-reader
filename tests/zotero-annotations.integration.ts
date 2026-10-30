import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import type { AnnotationPlan, AnnotationTools } from '../src/annotations.ts';
import type { NativeButton, NativeEditable } from '../src/controls.ts';
import type { Config, Host, SecretStore } from '../src/types.ts';

/** UI-only fixture. Uses memory and fake annotation tools, never Zotero items or APIs. */
export async function runAnnotationChecks(win: Window): Promise<string[]> {
  const realm = win as Window & typeof globalThis, doc = win.document;
  const checks: string[] = [], copies: string[] = [];
  const check = (name: string, pass: unknown) => { if (!pass) throw new Error(`Annotation integration failed: ${name}`); checks.push(name); };
  const pause = () => new Promise<void>(resolve => win.setTimeout(resolve, 140));
  const until = async (name: string, pass: () => boolean) => {
    for (let i = 0; i < 35 && !pass(); i++) await pause();
    check(name, pass()); await pause();
  };
  const scope = { libraryID: 1, itemKey: 'PAPER001', title: 'Synthetic annotation paper' };
  const plan: AnnotationPlan = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', scope, attachmentKey: 'PDF00001', fingerprint: '1:2', totalPages: 2, receipts: [], items: [
    { id: '0', page: 1, quote: 'The decoder and encoder share GPU resources.', comment: 'The mechanism coordinates work on one GPU.', type: 'highlight', color: '#ffd400', status: 'ready' },
    { id: '1', page: 2, quote: 'This passage cannot be uniquely identified.', comment: 'Do not save an unverified passage.', type: 'underline', color: '#2ea8e5', status: 'ambiguous' },
  ] };
  let writes = 0, undos = 0, located = 0, ordinary = 0, planned = 0;
  const tools: AnnotationTools = {
    async plan() { planned++; return structuredClone(plan); },
    async apply(_plan, ids) { check('only the checked verified candidate reaches apply', JSON.stringify(ids) === '["0"]'); writes++; return [{ candidateID: '0', itemKey: 'ANNOT001', digest: 'a'.repeat(32) }]; },
    async undo() { undos++; return 1; }, async locate(_plan, id) { check('show passage targets verified candidate', id === '0'); located++; },
  };
  const secrets: SecretStore = { async get() { return 'synthetic'; }, async set() { return true; }, async delete() {} };
  const service = new ChatService({ async load() { return null; }, async save() {} }, secrets, async request => { ordinary++; request.onText('Ordinary answer.'); return {}; }, undefined, tools.plan);
  const config: Config = { version: 1, language: 'en-US', endpoints: [{ id: 'e', name: 'Example', baseURL: 'https://example.invalid/v1', stream: true }], models: [{ id: 'm', endpointId: 'e', name: 'Model', model: 'model' }], defaultModelId: 'm', systemPrompt: 'Synthetic fixture' };
  const overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
  overlay.setAttribute('data-ai-reader-annotation-integration', 'true');
  overlay.style.cssText = 'position:fixed;top:12px;right:12px;width:304px;height:85vh;background:Canvas;color:CanvasText;z-index:2147483647;font-size:14px;';
  const focus = doc.activeElement as HTMLElement | null;
  let panel: ReturnType<typeof mountSidebar> | undefined;
  const host: Host = { service, annotations: tools, secretStore: secrets, rootURI: '', scopeForItem() { return null; }, openSettings() {}, openSource() {}, openURL() {}, copy(value) { copies.push(value); } };
  try {
    await service.init(); await service.saveConfig(config);
    const conversation = service.forScope(scope);
    const details = Array.from(doc.querySelectorAll('item-details')).find(n => n.getBoundingClientRect().width > 0 && win.getComputedStyle(n).visibility !== 'hidden');
    (details || doc.documentElement).append(overlay); panel = mountSidebar(overlay, scope, host); await pause();
    const find = <T extends Element>(selector: string): T => { const element = overlay.querySelector(selector); if (!element) throw new Error(`Missing ${selector}`); return element as T; };
    const button = (name: string) => { const node = Array.from(overlay.querySelectorAll<NativeButton>('button')).find(n => n.getAttribute('label') === name); if (!node) throw new Error(`Missing button ${name}`); return node; };
    check('annotation mode toggle is absent', !overlay.querySelector('.zar-annotation-mode'));
    const draft = find<NativeEditable>('.zar-input'); draft.focus(); const input = draft.ref!;
    input.value = '我需要的是你直接在pdf上面进行批注，用蓝色下划线，然后标注对应的解释'; input.dispatchEvent(new realm.Event('input', { bubbles: true }));
    button('Send').doCommand();
    await until('annotation preview is shown', () => !!overlay.querySelector('.zar-annotation-card'));
    check('planning writes nothing and skips normal chat', planned === 1 && writes === 0 && ordinary === 0);
    check('input node survives plan rendering', draft.ref === input && input.isConnected);
    const candidates = overlay.querySelectorAll<HTMLInputElement>('.zar-annotation-choice input');
    check('ambiguous candidates cannot be selected', candidates.length === 2 && candidates[0].checked && !candidates[0].disabled && candidates[1].disabled);
    button('Show passage').doCommand(); await until('show passage uses local locator', () => located === 1);
    const card = find<HTMLElement>('.zar-annotation-card');
    check('annotation card and comment fit a narrow sidebar', card.scrollWidth <= card.clientWidth + 1 && card.textContent?.includes('coordinates work'));
    find<HTMLButtonElement>('.zar-message-assistant .zar-message-copy').click();
    check('copy includes proposed quotation and comment', copies[0]?.includes(plan.items[0].quote) && copies[0]?.includes(plan.items[0].comment));
    button('Save to PDF').doCommand();
    await until('save records receipts in conversation history', () => !!conversation.messages[1].annotationPlan?.receipts.length);
    check('saved candidate is disabled', find<HTMLInputElement>('.zar-annotation-choice input').disabled && writes === 1);
    button('Undo this batch').doCommand();
    await until('undo state is recorded', () => !!conversation.messages[1].annotationPlan?.undone);
    check('undo applies only to the preview batch', undos === 1 && button('Save to PDF').disabled);
    await service.saveConfig({ ...config, language: 'zh-CN' }); await pause();
    check('annotation preview labels switch to Chinese', overlay.textContent?.includes('标注预览') || overlay.textContent?.includes('本批标注已撤销'));
    service.setDraft(conversation.id, 'Follow-up question'); await pause(); button('发送').doCommand();
    await until('ordinary chat still works after an annotation turn', () => ordinary === 1 && !service.isBusy(conversation.id));
    check('no extra annotation write occurs on ordinary follow-up', writes === 1 && undos === 1);
    return checks;
  } finally { panel?.destroy(); overlay.remove(); await service.shutdown(); focus?.focus?.({ preventScroll: true }); }
}
