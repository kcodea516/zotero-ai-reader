import { bilingualError } from './i18n-errors.ts';
import { tr } from './i18n.ts';
import { isAnnotationPlan, locateText, pageText, requestAnnotationSuggestions, type AnnotationDocument, type AnnotationPlan, type AnnotationReceipt, type AnnotationTools, type PDFPageData, type LocatedText } from './annotations.ts';
import type { PaperScope } from './types.ts';

const stopped = (signal: AbortSignal) => { if (signal.aborted) { const error = bilingualError('已停止生成。', 'Generation stopped.'); error.name = 'AbortError'; throw error; }; };
const uuid = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : n & 3 | 8).toString(16); });

/** The model proposes text. Only this local adapter can locate or save it. */
export function createZoteroAnnotationTools(environment: { zotero?: any; files?: any } = {}): AnnotationTools {
  const z = environment.zotero || Zotero, files = environment.files || IOUtils;
  // Serialize writes from multiple mounted reader panes, including double clicks.
  let writeQueue: Promise<unknown> = Promise.resolve();
  function serial<T>(action: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(action); writeQueue = result.catch(() => {}); return result;
  }
  function assertPlan(plan: AnnotationPlan): void {
    if (!isAnnotationPlan(plan)) throw bilingualError('标注方案无效，请重新生成预览。', 'The annotation plan is invalid. Generate a new preview.');
  }
  async function attachment(scope: PaperScope, key?: string): Promise<any> {
    let item: any;
    if (key) item = await z.Items.getByLibraryAndKeyAsync(scope.libraryID, key);
    else {
      const tabID = z.getMainWindow?.()?.Zotero_Tabs?.selectedID;
      const reader = z.Reader?._readers?.find((r: any) => r.tabID === tabID && !r._isTabClosed);
      if (reader) item = await z.Items.getAsync(reader.itemID);
    }
    const parent = item?.parentID ? await z.Items.getAsync(item.parentID) : item;
    if (!item || item.deleted || parent?.deleted || item.libraryID !== scope.libraryID || parent?.key !== scope.itemKey || !item.isPDFAttachment?.()) throw bilingualError('请打开这段会话所属论文的 PDF 后重试。', 'Open the PDF belonging to this conversation and retry.');
    if (!item.isEditable?.()) throw bilingualError('这份 PDF 或文库没有标注写入权限。', 'This PDF or library is not writable.');
    return item;
  }
  async function fingerprint(item: any): Promise<string> {
    const path = await item.getFilePathAsync();
    if (!path) throw bilingualError('PDF 附件尚未下载。', 'The PDF attachment is not downloaded.');
    const info = await files.stat(path);
    return `${info.size}:${info.lastModified}`;
  }
  async function readerFor(item: any): Promise<any> {
    const reader = z.Reader?._readers?.find((r: any) => r.itemID === item.id && !r._isTabClosed) || await z.Reader.open(item.id);
    await reader?._initPromise;
    const view = reader?._internalReader?._primaryView;
    if (!view || typeof view._ensureBasicPageData !== 'function') throw bilingualError('当前 Zotero 版本不支持此标注定位接口。', 'This Zotero version does not support the required annotation locator.');
    return { reader, view };
  }
  async function pageData(view: any, page: number): Promise<PDFPageData> {
    await view._ensureBasicPageData(page - 1);
    const data = view._pdfPages?.[page - 1];
    if (!data?.chars?.length || !Array.isArray(data.viewBox)) throw bilingualError('这一页没有可定位的文字，扫描件需要先做 OCR。', 'This page has no locatable text. Scanned pages need OCR first.');
    return data;
  }
  async function checked(plan: AnnotationPlan) {
    assertPlan(plan);
    const item = await attachment(plan.scope, plan.attachmentKey);
    if (await fingerprint(item) !== plan.fingerprint) throw bilingualError('PDF 文件已变化，请重新生成标注预览。', 'The PDF file changed. Generate a new annotation preview.');
    return item;
  }
  function snapshot(item: any): string {
    return z.Utilities.Internal.md5(JSON.stringify([item.parentID, item.annotationType, item.annotationText, item.annotationComment, item.annotationColor, item.annotationPageLabel, item.annotationSortIndex, item.annotationPosition, item.getTags().map((t: any) => t.tag).sort()]));
  }
  async function existing(item: any, batchID: string): Promise<any[]> {
    await z.Items.loadDataTypes([item], ['childItems']);
    const values = item.getAnnotations(false);
    await z.Items.loadDataTypes(values, ['annotation', 'annotationDeferred', 'tags']);
    return values.filter((a: any) => a && !a.deleted && a.getTags().some((t: any) => t.tag === `ai-reader:batch:${batchID}`));
  }
  return {
    async plan(request) {
      stopped(request.signal);
      request.onNotice(tr(request.language, '正在读取 PDF 并准备标注原文…', 'Reading the PDF for annotation…'));
      const item = await attachment(request.scope);
      const initialFingerprint = await fingerprint(item);
      const { view } = await readerFor(item);
      const totalPages = view._iframeWindow?.PDFViewerApplication?.pdfDocument?.numPages;
      if (!Number.isInteger(totalPages) || totalPages < 1) throw bilingualError('PDF 尚未加载完成，请稍后重试。', 'The PDF is still loading. Retry shortly.');
      const pages: AnnotationDocument['pages'] = [];
      let count = 0, skipped = 0;
      for (let page = 1; page <= Math.min(totalPages, 80); page++) {
        stopped(request.signal);
        await view._ensureBasicPageData(page - 1);
        const data = view._pdfPages?.[page - 1];
        if (!data?.chars?.length || !Array.isArray(data.viewBox)) { skipped++; continue; }
        const text = pageText(data.chars);
        if (count + text.length > 110000) break;
        pages.push({ page, text }); count += text.length;
      }
      stopped(request.signal);
      if (!pages.length) throw bilingualError('没有可用于标注的 PDF 原文。', 'No PDF text is available for annotation.');
      const warning = pages.length < totalPages ? tr(request.language, `读取了 ${pages.length} / ${totalPages} 页（跳过 ${skipped} 页无可定位文字的页面）；未提供页面不在本轮标注范围内。`, `Read ${pages.length} of ${totalPages} pages (${skipped} pages skipped without locatable text); pages not supplied are outside this plan.`) : undefined;
      const doc: AnnotationDocument = { scope: { ...request.scope }, attachmentKey: item.key, fingerprint: initialFingerprint, totalPages, pages, warning };
      const suggestions = await requestAnnotationSuggestions(request, doc);
      stopped(request.signal);
      request.onNotice(tr(request.language, '正在核对原句和 PDF 位置…', 'Checking quotations and PDF positions…'));
      const items = [];
      for (let n = 0; n < suggestions.items.length; n++) {
        stopped(request.signal);
        const suggestion = suggestions.items[n];
        const found = locateText(await pageData(view, suggestion.page), suggestion.page, suggestion.quote);
        items.push({ ...suggestion, id: String(n), status: typeof found === 'string' ? found : 'ready' as const });
      }
      if (await fingerprint(item) !== initialFingerprint) throw bilingualError('读取期间 PDF 已变化，请重试。', 'The PDF changed while reading. Retry.');
      stopped(request.signal);
      return { id: uuid(), scope: doc.scope, attachmentKey: doc.attachmentKey, fingerprint: doc.fingerprint, totalPages, warning: [warning, suggestions.summary].filter(Boolean).join('\n'), items, receipts: [] };
    },
    apply(plan, candidateIDs) {
      return serial(async () => {
        const item = await checked(plan);
        if (plan.undone) throw bilingualError('这个方案已撤销，请生成新的预览。', 'This plan was undone. Generate a new preview.');
        const { reader, view } = await readerFor(item);
        const chosen = [...new Set(candidateIDs)].map(id => plan.items.find(i => i.id === id));
        if (!chosen.length || chosen.some(i => !i || i.status !== 'ready')) throw bilingualError('请选择已成功定位的标注。', 'Select successfully located annotations.');
        const positions: { candidate: NonNullable<typeof chosen[0]>; location: LocatedText }[] = [];
        for (const candidate of chosen) {
          const location = locateText(await pageData(view, candidate!.page), candidate!.page, candidate!.quote);
          if (typeof location === 'string') throw bilingualError('原文位置无法再次确认，请重新生成预览。', 'The original passage could not be verified again. Generate a new preview.');
          positions.push({ candidate: candidate!, location });
        }
        if (await fingerprint(item) !== plan.fingerprint) throw bilingualError('PDF 文件已变化，请重新生成预览。', 'The PDF file changed. Generate a new preview.');
        const saved: any[] = [];
        const receipts: AnnotationReceipt[] = [];
        await z.DB.executeTransaction(async () => {
          const prior = await existing(item, plan.id);
          for (const { candidate, location } of positions) {
            // A stable per-candidate tag makes retries idempotent even if a pane
            // closes after the transaction commits but before history is saved.
            const candidateTag = `ai-reader:candidate:${candidate.id}`;
            let annotation = prior.find((a: any) => a.getTags().some((t: any) => t.tag === candidateTag));
            if (!annotation) {
              // saveFromJSON() starts its own transaction. Use save() here so
              // the complete batch shares this transaction and rolls back together.
              annotation = new z.Item('annotation');
              annotation.libraryID = item.libraryID;
              annotation.parentID = item.id;
              annotation.annotationType = candidate.type;
              annotation.annotationAuthorName = 'AI Reader';
              annotation.annotationIsExternal = false;
              annotation.annotationText = location.text;
              annotation.annotationComment = candidate.comment.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
              annotation.annotationColor = candidate.color;
              annotation.annotationPageLabel = view._getPageLabel?.(candidate.page - 1) || String(candidate.page);
              annotation.annotationSortIndex = location.sortIndex;
              annotation.annotationPosition = JSON.stringify(location.position);
              annotation.setTags([{ tag: `ai-reader:batch:${plan.id}` }, { tag: candidateTag }]);
              await annotation.save({ skipSelect: true });
            }
            saved.push(annotation); receipts.push({ candidateID: candidate.id, itemKey: annotation.key, digest: snapshot(annotation) });
          }
        });
        // Saving is complete even if a closed reader cannot refresh its view.
        try { await reader.setAnnotations(saved); } catch { /* Native notifier refreshes other readers. */ }
        return receipts;
      });
    },
    undo(plan) {
      return serial(async () => {
        const item = await checked(plan);
        const annotations: any[] = [];
        for (const receipt of plan.receipts) {
          const annotation = await z.Items.getByLibraryAndKeyAsync(item.libraryID, receipt.itemKey);
          if (!annotation || annotation.deleted) continue;
          await z.Items.loadDataTypes([annotation], ['annotation', 'annotationDeferred', 'tags']);
          if (annotation.parentID !== item.id || !annotation.isAnnotation?.() || !annotation.isEditable?.() || !annotation.getTags().some((t: any) => t.tag === `ai-reader:batch:${plan.id}`) || snapshot(annotation) !== receipt.digest) throw bilingualError('标注已被修改，已保留全部内容；请在 Zotero 中手动处理。', 'An annotation was edited. All annotations were preserved; manage them in Zotero.');
          annotations.push(annotation);
        }
        await z.DB.executeTransaction(async () => { for (const annotation of annotations) { annotation.deleted = true; await annotation.save(); } });
        for (const reader of z.Reader._readers.filter((r: any) => r.itemID === item.id)) {
          try { await reader.unsetAnnotations(annotations.map(a => a.key)); } catch { /* A reader may have closed. */ }
        }
        return annotations.length;
      });
    },
    async locate(plan, candidateID) {
      const item = await checked(plan), candidate = plan.items.find(i => i.id === candidateID);
      if (!candidate || candidate.status !== 'ready') throw bilingualError('这条标注尚未定位。', 'This annotation has not been located.');
      const { reader, view } = await readerFor(item);
      const location = locateText(await pageData(view, candidate.page), candidate.page, candidate.quote);
      if (typeof location === 'string') throw bilingualError('原文位置已无法确认。', 'The original passage could not be verified.');
      await reader.navigate({ pageIndex: candidate.page - 1, position: location.position });
    },
  };
}
