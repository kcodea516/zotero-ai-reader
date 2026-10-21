import { tr, type UILanguage } from './i18n.ts';
import type { PaperContextProvider, PaperScope } from './types';
import { buildPaperContext, rankPapers, type PaperDocument, type PaperRecord } from './reading.ts';

const MAX_CACHED_DOCUMENTS = 12;

function checkCancellation(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

/** Reads only local attachments. Extracted corpus text is kept in memory, never
 * written to the library, logs, or plugin conversation storage by this adapter. */
export function createZoteroPaperContextProvider(environment: { zotero?: any; files?: any } = {}): PaperContextProvider {
  const zotero = environment.zotero || Zotero;
  const files = environment.files || IOUtils;
  const documents = new Map<string, { fingerprint: string; document: PaperDocument }>();

  async function getItem(libraryID: number, key: string): Promise<any> {
    return await zotero.Items.getByLibraryAndKeyAsync(libraryID, key);
  }

  function isInScope(item: any, scope: PaperScope): boolean {
    return !!item && item.libraryID === scope.libraryID && item.key === scope.itemKey && !item.deleted;
  }

  async function metadata(item: any, language: UILanguage = 'zh-CN'): Promise<PaperRecord> {
    await zotero.Items.loadDataTypes([item], ['itemData', 'collections']);
    const collectionKeys: string[] = [];
    for (const collectionID of item.getCollections?.() || []) {
      const collection = zotero.Collections?.get(collectionID);
      if (collection?.key && collection.libraryID === item.libraryID) collectionKeys.push(collection.key);
    }
    return {
      libraryID: item.libraryID,
      itemKey: item.key,
      title: String(item.getField('title') || tr(language, '未命名文献', 'Untitled paper')),
      shortTitle: String(item.getField('shortTitle') || ''),
      abstract: String(item.getField('abstractNote') || ''),
      collectionKeys,
    };
  }

  async function pdfAttachment(item: any, signal: AbortSignal): Promise<{ attachment: any; path: string } | undefined> {
    checkCancellation(signal);
    const candidateIDs: number[] = [];
    const selectedID = zotero.getMainWindow?.()?.Zotero_Tabs?.selectedID;
    const readers: any[] = [...(zotero.Reader?._readers || [])];
    readers.sort((a, b) => Number(b.tabID === selectedID) - Number(a.tabID === selectedID));
    for (const reader of readers) {
      if (reader._isTabClosed) continue;
      const attachment = await zotero.Items.getAsync(reader.itemID);
      checkCancellation(signal);
      if (!attachment || attachment.deleted || attachment.libraryID !== item.libraryID) continue;
      if (attachment.id === item.id || attachment.parentID === item.id) candidateIDs.push(attachment.id);
    }
    if (item.isAttachment?.()) candidateIDs.push(item.id);
    else {
      await zotero.Items.loadDataTypes([item], ['childItems']);
      checkCancellation(signal);
      candidateIDs.push(...item.getAttachments(false));
    }
    for (const id of new Set(candidateIDs)) {
      const attachment = await zotero.Items.getAsync(id);
      checkCancellation(signal);
      if (!attachment || attachment.deleted || attachment.libraryID !== item.libraryID) continue;
      if (!attachment.isPDFAttachment?.() && attachment.attachmentContentType !== 'application/pdf') continue;
      const path = await attachment.getFilePathAsync();
      checkCancellation(signal);
      if (path) return { attachment, path };
    }
    return undefined;
  }

  async function indexedFallback(attachment: any, signal: AbortSignal): Promise<{ text: string; extractedPages: number; totalPages: number } | undefined> {
    const fulltext = zotero.Fulltext || zotero.FullText;
    if (!fulltext?.getItemCacheFile || !fulltext?.getPages) return undefined;
    const cachePath = fulltext.getItemCacheFile(attachment).path;
    if (!(await files.exists(cachePath))) return undefined;
    checkCancellation(signal);
    const stats = await fulltext.getPages(attachment.id);
    checkCancellation(signal);
    if (!stats?.total || !stats.indexedPages || stats.indexedPages !== stats.total) return undefined;
    const text = await zotero.File.getContentsAsync(cachePath, 'utf-8');
    checkCancellation(signal);
    return { text, extractedPages: stats.indexedPages, totalPages: stats.total };
  }

  async function document(item: any, paper: PaperRecord, signal: AbortSignal): Promise<PaperDocument | undefined> {
    const local = await pdfAttachment(item, signal);
    if (!local) return undefined;
    const { attachment, path } = local;
    const stats = await files.stat(path);
    checkCancellation(signal);
    const cacheKey = `${attachment.libraryID}:${attachment.key}`;
    const fingerprint = `${path}:${stats.size}:${stats.lastModified}`;
    const cached = documents.get(cacheKey);
    if (cached?.fingerprint === fingerprint) {
      // Refresh metadata and LRU ordering even when PDF bytes have not changed.
      documents.delete(cacheKey);
      const refreshed = { ...cached.document, paper };
      documents.set(cacheKey, { fingerprint, document: refreshed });
      return refreshed;
    }
    let extracted: { text: string; extractedPages: number; totalPages: number } | undefined;
    try {
      if (typeof zotero.PDFWorker?.getFullText !== 'function') throw new Error('Unavailable');
      extracted = await zotero.PDFWorker.getFullText(attachment.id, null, true);
      checkCancellation(signal);
    } catch (error) {
      checkCancellation(signal);
      extracted = await indexedFallback(attachment, signal);
    }
    if (!extracted?.text?.trim() || !Number.isInteger(extracted.totalPages) || extracted.totalPages < 1) return undefined;
    const pieces = extracted.text.split('\f');
    // Missing page separators cannot support trustworthy physical-page citations.
    if (pieces.length !== extracted.extractedPages || extracted.extractedPages !== extracted.totalPages) return undefined;
    const result: PaperDocument = {
      paper,
      attachmentKey: attachment.key,
      totalPages: extracted.totalPages,
      pages: pieces.map((text, index) => ({ page: index + 1, text: text.trim() })),
    };
    checkCancellation(signal);
    documents.delete(cacheKey);
    documents.set(cacheKey, { fingerprint, document: result });
    while (documents.size > MAX_CACHED_DOCUMENTS) documents.delete(documents.keys().next().value!);
    return result;
  }

  return async request => {
    const { scope, question, previousQuestions, options, signal, language = 'zh-CN' } = request;
    checkCancellation(signal);
    if (!options.currentPaper && !options.relatedPapers) return { text: '', sources: [] };
    const warnings: string[] = [];
    const currentItem = await getItem(scope.libraryID, scope.itemKey);
    checkCancellation(signal);
    let currentRecord: PaperRecord = { ...scope };
    let current: PaperDocument | undefined;
    if (isInScope(currentItem, scope)) {
      currentRecord = await metadata(currentItem, language);
      checkCancellation(signal);
      if (options.currentPaper) {
        try { current = await document(currentItem, currentRecord, signal); }
        catch { checkCancellation(signal); }
      }
    }
    if (options.currentPaper && !current) {
      warnings.push(tr(language, '未能读取当前文献的完整本地 PDF 原文；请确认附件已下载、PDF 可提取文字。回答中不得假称已经读过该文献。', 'The complete local PDF text could not be read. Check that the attachment is downloaded and has extractable text. Do not claim to have read it.'));
    }
    const related: PaperDocument[] = [];
    if (options.relatedPapers) {
      const all = await zotero.Items.getAll(scope.libraryID, true, false);
      checkCancellation(signal);
      const candidates: PaperRecord[] = [];
      const items = new Map<string, any>();
      const eligible = all.filter((item: any) => item && !item.deleted && item.libraryID === scope.libraryID && item.key !== scope.itemKey && item.isRegularItem?.());
      await zotero.Items.loadDataTypes(eligible, ['itemData', 'collections']);
      checkCancellation(signal);
      for (const item of eligible) {
        checkCancellation(signal);
        const paper = await metadata(item, language);
        candidates.push(paper);
        items.set(paper.itemKey, item);
      }
      const chosen = rankPapers(currentRecord, candidates, question, previousQuestions).slice(0, 3);
      for (const paper of chosen) {
        checkCancellation(signal);
        try {
          const doc = await document(items.get(paper.itemKey), paper, signal);
          checkCancellation(signal);
          if (doc) related.push(doc);
        } catch { checkCancellation(signal); }
      }
      if (chosen.length && !related.length) warnings.push(tr(language, '相关文献未找到可读取的完整本地 PDF，未把题录冒充原文。', 'No readable complete local PDF was found for the related papers; metadata was not used as original text.'));
    }
    checkCancellation(signal);
    const context = buildPaperContext(current, related, question, language);
    const contextWarning = options.currentPaper ? context.warning : context.warning?.replace(tr(language, '未读取到当前文献正文。', 'The current paper text was not retrieved.'), '').trim();
    return { ...context, warning: [contextWarning, ...warnings].filter(Boolean).join('\n') || undefined };
  };
}
