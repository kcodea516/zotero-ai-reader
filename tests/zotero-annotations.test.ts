import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createZoteroAnnotationTools } from '../src/zotero-annotations.ts';
import { isAnnotationPlan, type AnnotationPlan, type PDFPageData } from '../src/annotations.ts';
import { ChatService } from '../src/core.ts';
import type { ChatTransport, Config, SecretStore, StoreState } from '../src/types.ts';

const quote = 'The decoder and encoder share GPU resources.';
const scope = { libraryID: 1, itemKey: 'PAPER001', title: 'Synthetic paper' };
const config: Config = { version: 1, language: 'en-US', endpoints: [{ id: 'e', name: 'Example', baseURL: 'https://example.invalid/v1', stream: true }], models: [{ id: 'm', endpointId: 'e', name: 'Model', model: 'model' }], defaultModelId: 'm', systemPrompt: 'test' };
const secrets: SecretStore = { async get() { return 'synthetic-key'; }, async set() { return true; }, async delete() {} };
function setup() {
  let modified = 1, sequence = 0, writes = 0, failAt = 0;
  const records = new Map<number, any>();
  const pdf: any = { id: 20, key: 'PDF00001', libraryID: 1, parentID: 10, deleted: false, isPDFAttachment: () => true, isEditable: () => true,
    getFilePathAsync: async () => '/synthetic/paper.pdf', getAnnotations: () => [...records.values()].filter(x => !x.deleted) };
  const data: PDFPageData = { chars: [...quote].map((u, n) => ({ u, rect: [n * 5, 50, n * 5 + 5, 60] })), viewBox: [0, 0, 600, 800] };
  const view: any = { _iframeWindow: { PDFViewerApplication: { pdfDocument: { numPages: 1 } } }, _ensureBasicPageData: async () => {}, _pdfPages: [data], _getPageLabel: () => '1' };
  const shown: any[] = [], removed: string[][] = [], locations: any[] = [];
  const reader = { itemID: 20, tabID: 'tab', _internalReader: { _primaryView: view }, _initPromise: Promise.resolve(), setAnnotations: async (items: any[]) => { shown.push(...items); }, unsetAnnotations: async (keys: string[]) => { removed.push(keys); }, navigate: async (location: any) => { locations.push(location); } };
  const parent = { id: 10, key: scope.itemKey, libraryID: 1 };
  const z: any = {
    getMainWindow: () => ({ Zotero_Tabs: { selectedID: 'tab' } }), Reader: { _readers: [reader], open: async () => reader },
    Items: { getAsync: async (id: number | number[]) => Array.isArray(id) ? id.map(n => records.get(n)) : id === 20 ? pdf : id === 10 ? parent : records.get(id),
      getByLibraryAndKeyAsync: async (library: number, key: string) => library !== 1 ? undefined : key === pdf.key ? pdf : [...records.values()].find(x => x.key === key), loadDataTypes: async () => {} },
    Utilities: { Internal: { md5: (value: string) => createHash('md5').update(value).digest('hex') } },
    DataObjectUtilities: { generateKey: () => String(++sequence).padStart(8, '0') },
    DB: { executeTransaction: async (fn: () => Promise<void>) => { const prior = new Map([...records].map(([id, value]) => [id, { ...value }])); try { await fn(); } catch (error) { records.clear(); for (const [id, value] of prior) records.set(id, value); throw error; } } },
    Item: class {
      id = 0; key = ''; parentID = 0; libraryID = 0; deleted = false; tags: any[] = [];
      constructor(type: string) { assert.equal(type, 'annotation'); }
      setTags(tags: any[]) { this.tags = tags; }
      getTags() { return this.tags; }
      isAnnotation() { return true; }
      isEditable() { return true; }
      async save(options?: any) {
        assert.notEqual(options?.tx, true);
        if (!this.id) {
          writes++; if (writes === failAt) throw new Error('Synthetic save error');
          this.id = ++sequence + 100; this.key = String(sequence).padStart(8, '0'); records.set(this.id, this);
        }
      }
    },
  };
  const tools = createZoteroAnnotationTools({ zotero: z, files: { stat: async () => ({ size: 50, lastModified: modified }) } });
  let calls = 0;
  const transport: ChatTransport = async request => { calls++; assert.equal(request.endpoint.stream, false); assert.equal(JSON.stringify(request.messages).includes('position'), false); request.onText(JSON.stringify({ summary: 'Preview only.', annotations: [{ page: 1, quote, comment: 'These stages share a fixed GPU.', type: 'highlight', color: '#ffd400' }] })); return {}; };
  const plan = () => tools.plan({ scope, instruction: 'Highlight shared resources', previousQuestions: [], language: 'en-US', signal: new AbortController().signal, onNotice() {}, endpoint: config.endpoints[0], model: config.models[0], key: 'synthetic-key', transport });
  return { z, tools, plan, records, pdf, data, shown, removed, locations, transport, get writes() { return writes; }, get calls() { return calls; }, modifyPDF() { modified++; }, failOn(n: number) { failAt = n; } };
}
test('planning reads the current paper and verifies quotes without writing or trusting model coordinates', async () => {
  const s = setup(), plan = await s.plan();
  assert.equal(s.writes, 0); assert.equal(s.calls, 1); assert.equal(plan.items[0].status, 'ready'); assert.ok(isAnnotationPlan(plan));
  await s.tools.locate(plan, '0'); assert.equal(s.locations[0].pageIndex, 0); assert.ok(s.locations[0].position.rects.length);
});
test('selected annotations save once under concurrent repeated apply calls and refresh the reader', async () => {
  const s = setup(), plan = await s.plan();
  const [one, two] = await Promise.all([s.tools.apply(plan, ['0']), s.tools.apply(plan, ['0'])]);
  assert.equal(s.writes, 1); assert.equal(one[0].itemKey, two[0].itemKey); assert.equal(s.records.size, 1);
  assert.equal(s.shown[0].annotationText, quote); assert.equal(s.shown[0].annotationComment, 'These stages share a fixed GPU.');
  plan.receipts = one;
  assert.equal(await s.tools.undo(plan), 1); assert.ok([...s.records.values()][0].deleted); assert.equal(s.removed.length, 1);
});
test('changed PDFs, foreign scope, read-only attachments and unlocated text block writes', async () => {
  const s = setup(), plan = await s.plan(); s.modifyPDF();
  await assert.rejects(() => s.tools.apply(plan, ['0']), /PDF/); assert.equal(s.writes, 0);
  const t = setup(), p = await t.plan(); p.scope.itemKey = 'OTHER001'; await assert.rejects(() => t.tools.apply(p, ['0'])); assert.equal(t.writes, 0);
  const u = setup(); u.pdf.isEditable = () => false; await assert.rejects(u.plan);
  const v = setup(), pv = await v.plan(); pv.items[0].status = 'missing'; await assert.rejects(() => v.tools.apply(pv, ['0']));
});
test('undo preserves edited annotations and unrelated user annotations', async () => {
  const s = setup(), plan = await s.plan(); plan.receipts = await s.tools.apply(plan, ['0']);
  const annotation = [...s.records.values()][0]; annotation.annotationComment = 'User edited this.';
  await assert.rejects(() => s.tools.undo(plan), /标注已被修改/); assert.equal(annotation.deleted, false);
  plan.receipts[0].itemKey = 'PDF00001'; await assert.rejects(() => s.tools.undo(plan)); assert.equal(s.pdf.deleted, false);
});
test('a failed batch rolls back all newly created annotations', async () => {
  const s = setup(), plan = await s.plan();
  plan.items.push({ ...plan.items[0], id: '1', type: 'underline' }); s.failOn(2);
  await assert.rejects(() => s.tools.apply(plan, ['0', '1'])); assert.equal(s.records.size, 0); assert.equal(s.shown.length, 0);
});
test('core annotation turns use the existing model, preserve previews through restart and respect reading permission', async () => {
  const s = setup(); let saved: StoreState | null = null;
  const repository = { async load() { return saved ? structuredClone(saved) : null; }, async save(value: StoreState) { saved = structuredClone(value); } };
  let ordinary = 0;
  const chat = new ChatService(repository, secrets, s.transport, async () => { ordinary++; return { text: '', sources: [] }; }, s.tools.plan);
  await chat.init(); await chat.saveConfig(config);
  const c = chat.forScope(scope); chat.setDraft(c.id, 'Highlight the shared resources'); await chat.send(c.id, 'annotate');
  assert.equal(ordinary, 0); assert.equal(s.calls, 1); assert.equal(c.messages[0].intent, 'annotate'); assert.equal(c.messages[1].status, 'complete'); assert.ok(c.messages[1].annotationPlan); assert.equal(s.writes, 0);
  const receipts = await s.tools.apply(c.messages[1].annotationPlan!, ['0']); chat.updateAnnotationReceipts(c.id, c.messages[1].id, receipts); await chat.shutdown();
  const reopened = new ChatService(repository, secrets); await reopened.init(); assert.equal(reopened.getConversation(c.id)?.messages[1].annotationPlan?.receipts.length, 1); await reopened.shutdown();
  const blocked = new ChatService({ async load() { return null; }, async save() {} }, secrets, s.transport, undefined, s.tools.plan);
  await blocked.init(); await blocked.saveConfig(config); const b = blocked.forScope(scope); blocked.setReadingOptions(b.id, { currentPaper: false, relatedPapers: false }); blocked.setDraft(b.id, 'Annotate'); await blocked.send(b.id, 'annotate');
  assert.equal(b.messages[1].status, 'error'); assert.equal(s.calls, 1); await blocked.shutdown();
});

test('blank pages are skipped with explicit coverage while later text remains locatable', async () => {
  const s = setup(), view = s.z.Reader._readers[0]._internalReader._primaryView;
  view._iframeWindow.PDFViewerApplication.pdfDocument.numPages = 2;
  view._pdfPages = [{ chars: [], viewBox: [0, 0, 600, 800] }, s.data];
  const transport: ChatTransport = async request => {
    const payload = JSON.parse(request.messages[1].content);
    assert.deepEqual(payload.paper.pages.map((p: any) => p.page), [2]);
    request.onText(JSON.stringify({ summary: '', annotations: [{ page: 2, quote, comment: 'Later page.', type: 'highlight', color: '#ffd400' }] })); return {};
  };
  const plan = await s.tools.plan({ scope, instruction: 'Find evidence', previousQuestions: [], language: 'en-US', signal: new AbortController().signal, onNotice() {}, endpoint: config.endpoints[0], model: config.models[0], key: '', transport });
  assert.match(plan.warning!, /1 of 2 pages/); assert.equal(plan.items[0].status, 'ready'); assert.equal(s.writes, 0);
});
test('annotation comments save as text rather than executing model-provided HTML', async () => {
  const s = setup(), plan = await s.plan(); plan.items[0].comment = '<img src=x onerror=alert(1)> & evidence';
  await s.tools.apply(plan, ['0']); assert.equal([...s.records.values()][0].annotationComment, '&lt;img src=x onerror=alert(1)&gt; &amp; evidence');
});
test('cancellation prevents late model results from becoming a writable plan and retry retains annotation intent', async () => {
  const s = setup(); let release: (() => void) | undefined, attempts = 0;
  const transport: ChatTransport = async request => {
    attempts++;
    if (attempts === 1) await new Promise<void>(resolve => { release = resolve; });
    request.onText(JSON.stringify({ summary: '', annotations: [{ page: 1, quote, comment: 'Evidence.', type: 'highlight', color: '#ffd400' }] })); return {};
  };
  const chat = new ChatService({ async load() { return null; }, async save() {} }, secrets, transport, undefined, s.tools.plan);
  await chat.init(); await chat.saveConfig(config); const c = chat.forScope(scope); chat.setDraft(c.id, 'Highlight evidence');
  const sending = chat.send(c.id, 'annotate');
  for (let i = 0; i < 30 && !release; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.ok(release); chat.stop(c.id); await sending; release!(); await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(c.messages[1].status, 'stopped'); assert.equal(c.messages[1].annotationPlan, undefined); assert.equal(s.writes, 0);
  await chat.retry(c.id); assert.equal(attempts, 2); assert.equal(c.messages.length, 2); assert.ok(c.messages[1].annotationPlan); await chat.shutdown();
});
test('an empty suggestion response remains a completed explanation without an invalid source link', async () => {
  const s = setup();
  const chat = new ChatService({ async load() { return null; }, async save() {} }, secrets, async request => { request.onText('{"summary":"Insufficient evidence","annotations":[]}'); return {}; }, undefined, s.tools.plan);
  await chat.init(); await chat.saveConfig(config); const c = chat.forScope(scope); chat.setDraft(c.id, 'Find evidence'); await chat.send(c.id, 'annotate');
  assert.equal(c.messages[1].status, 'complete'); assert.equal(c.messages[1].sources, undefined); assert.equal(c.messages[1].annotationPlan?.items.length, 0); assert.equal(s.writes, 0); await chat.shutdown();
});
