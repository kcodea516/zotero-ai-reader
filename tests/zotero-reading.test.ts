import test from 'node:test';
import assert from 'node:assert/strict';
import { createZoteroPaperContextProvider } from '../src/zotero-reading.ts';

function fixture() {
  const make = (id: number, key: string, title: string, extra: any = {}) => ({
    id, key, title, libraryID: 1, deleted: false, parentID: false,
    getField(name: string) { return name === 'title' ? title : name === 'abstractNote' ? 'vision encoder decode scheduling' : ''; },
    getCollections() { return [7]; },
    isRegularItem() { return true; },
    isAttachment() { return false; },
    getAttachments() { return [id + 100]; },
    ...extra,
  });
  const current = make(1, 'PAPERONE', 'Nova vision encoder scheduling');
  const related = make(2, 'PAPERTWO', 'UnifiedServe vision encoder decode scheduling');
  const unrelated = make(3, 'PAPERTHR', 'Medieval archaeology');
  const foreign = make(4, 'FOREIGNP', 'Nova vision encoder scheduling', { libraryID: 2 });
  const deleted = make(5, 'TRASHEDP', 'Nova vision encoder scheduling', { deleted: true });
  const note = make(6, 'NOTEPAPR', 'Nova vision encoder scheduling', { isRegularItem() { return false; } });
  const attachment = (parent: any, key: string, extra: any = {}) => make(parent.id + 100, key, 'PDF', {
    parentID: parent.id, isRegularItem() { return false; }, isAttachment() { return true; },
    isPDFAttachment() { return true; }, attachmentContentType: 'application/pdf',
    async getFilePathAsync() { return `/private/${key}.pdf`; }, ...extra,
  });
  const items = [current, related, unrelated, foreign, deleted, note,
    attachment(current, 'ATTACHON'), attachment(related, 'ATTACHTW'), attachment(unrelated, 'ATTACHTH')];
  const calls: number[] = [];
  let modified = 1;
  const zotero: any = {
    Items: {
      async getByLibraryAndKeyAsync(libraryID: number, key: string) { return items.find(item => item.libraryID === libraryID && item.key === key); },
      async getAsync(id: number) { return items.find(item => item.id === id); },
      async getAll() { return [current, related, unrelated, foreign, deleted, note]; },
      async loadDataTypes() {},
    },
    Collections: { get() { return { key: 'SAMECOLL', libraryID: 1 }; } },
    Reader: { _readers: [] },
    PDFWorker: { async getFullText(id: number, maxPages: any, priority: any) {
      assert.equal(maxPages, null); assert.equal(priority, true); calls.push(id);
      return { text: 'System overview vision encoder\fDecode priority and SM partitioning', extractedPages: 2, totalPages: 2 };
    } },
  };
  const files = { async stat() { return { size: 100, lastModified: modified }; }, async exists() { return true; } };
  const provider = createZoteroPaperContextProvider({ zotero, files });
  const request: any = { scope: { libraryID: 1, itemKey: current.key, title: current.title }, question: 'Explain vision encoder scheduling and decode', previousQuestions: [], options: { currentPaper: true, relatedPapers: true }, signal: new AbortController().signal };
  return { provider, request, zotero, calls, current, related, items, setModified(value: number) { modified = value; } };
}

test('extracts current and related local originals, excluding foreign libraries, trash and notes', async () => {
  const f = fixture();
  const result = await f.provider(f.request);
  assert.match(result.text, /System overview/);
  assert.match(result.text, /Decode priority/);
  assert.ok(result.sources.length >= 2);
  assert.ok(result.sources.every(source => source.libraryID === 1));
  assert.ok(!result.sources.some(source => ['FOREIGNP', 'TRASHEDP', 'NOTEPAPR'].includes(source.itemKey)));
  assert.ok(f.calls.includes(101));
  assert.ok(f.calls.includes(102));
  assert.equal(result.warning, undefined);
});

test('PDF cache invalidates on file modification and avoids repeated extraction', async () => {
  const f = fixture(); f.request.options.relatedPapers = false;
  await f.provider(f.request); await f.provider(f.request);
  assert.equal(f.calls.length, 1);
  f.setModified(2); await f.provider(f.request);
  assert.equal(f.calls.length, 2);
});

test('read disabled options cause no extraction', async () => {
  const f = fixture(); f.request.options = { currentPaper: false, relatedPapers: false };
  const result = await f.provider(f.request);
  assert.equal(f.calls.length, 0);
  assert.equal(result.sources.length, 0);
  assert.equal(result.warning, undefined);
});

test('missing current attachment remains explicit even when related original can be read', async () => {
  const f = fixture();
  f.items.find(item => item.id === 101)!.getFilePathAsync = async () => false;
  const result = await f.provider(f.request);
  assert.match(result.warning || '', /当前文献/);
  assert.ok(result.sources.length > 0);
  assert.ok(!result.sources.some(source => source.itemKey === f.current.key));
});

test('does not fabricate page numbers when extraction has missing page separators', async () => {
  const f = fixture(); f.request.options.relatedPapers = false;
  f.zotero.PDFWorker.getFullText = async () => ({ text: 'Merged pages without separators', extractedPages: 2, totalPages: 2 });
  const result = await f.provider(f.request);
  assert.equal(result.sources.length, 0);
  assert.match(result.warning || '', /当前文献/);
});

test('indexed fallback is accepted only when all physical page boundaries exist', async () => {
  const f = fixture(); f.request.options.relatedPapers = false;
  f.zotero.PDFWorker.getFullText = async () => { throw new Error('/private/sensitive/path'); };
  f.zotero.Fulltext = { getItemCacheFile() { return { path: '/private/cache' }; }, async getPages() { return { indexedPages: 2, total: 2 }; } };
  f.zotero.File = { async getContentsAsync() { return 'First page original\fSecond page original'; } };
  const result = await f.provider(f.request);
  assert.equal(result.sources.length, 1);
  assert.match(result.text, /Second page original/);
  assert.doesNotMatch(result.text + result.warning, /sensitive/);
});

test('partial indexed fallback does not masquerade as a complete original', async () => {
  const f = fixture(); f.request.options.relatedPapers = false;
  f.zotero.PDFWorker.getFullText = undefined;
  f.zotero.Fulltext = { getItemCacheFile() { return { path: '/private/cache' }; }, async getPages() { return { indexedPages: 1, total: 2 }; } };
  f.zotero.File = { async getContentsAsync() { throw new Error('Must not read partial cache'); } };
  const result = await f.provider(f.request);
  assert.equal(result.sources.length, 0);
  assert.match(result.warning || '', /当前文献/);
});

test('abort stops context preparation after PDF extraction and before candidate loading', async () => {
  const f = fixture(); const controller = new AbortController(); f.request.signal = controller.signal;
  f.zotero.PDFWorker.getFullText = async () => { controller.abort(); return { text: 'Original', extractedPages: 1, totalPages: 1 }; };
  f.zotero.Items.getAll = async () => { throw new Error('Must not load candidates'); };
  await assert.rejects(f.provider(f.request), { name: 'AbortError' });
});

test('active current reader attachment is preferred over other attachments', async () => {
  const f = fixture(); f.request.options.relatedPapers = false;
  f.items.push({ ...f.items.find(item => item.id === 101)!, id: 108, key: 'ACTIVEPD', getFilePathAsync: async () => '/private/active.pdf' });
  f.zotero.Reader._readers = [{ itemID: 108, tabID: 'active' }];
  f.zotero.getMainWindow = () => ({ Zotero_Tabs: { selectedID: 'active' } });
  const result = await f.provider(f.request);
  assert.deepEqual(f.calls, [108]);
  assert.equal(result.sources[0].attachmentKey, 'ACTIVEPD');
});
