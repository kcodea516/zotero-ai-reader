import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import { createZoteroAnnotationTools } from '../src/zotero-annotations.ts';
import type { Host } from '../src/types.ts';
import type { NativeButton } from '../src/controls.ts';

/** Real PDF adapter and native controls; isolated history and a scripted model response. */
export async function open(win: any) {
  const z = win.Zotero, doc = win.document;
  const originalTab = win.Zotero_Tabs.selectedID;
  const pane = doc.getElementById('zotero-context-pane');
  const paneStyle = pane.getAttribute('style');
  const originalReader = z.Reader._readers.find((r: any) => r.tabID === originalTab);
  if (!originalReader) throw new Error('Open the Nova PDF before running the documentation example.');
  const originalPDF = await z.Items.getAsync(originalReader.itemID);
  const paper = new z.Item('document');
  paper.setField('title', 'Nova: Real-Time Agentic Vision-Language Model Serving');
  await paper.saveTx();
  let reader: any, service: ChatService | undefined, panel: ReturnType<typeof mountSidebar> | undefined, overlay: HTMLElement | undefined;
  async function close() {
    panel?.destroy(); overlay?.remove(); await service?.shutdown();
    if (paneStyle === null) pane.removeAttribute('style'); else pane.setAttribute('style', paneStyle);
    reader?.close(); win.Zotero_Tabs.select(originalTab);
    const installed = z.AIReader.service;
    for (const c of installed.listConversations({libraryID: paper.libraryID, itemKey: paper.key})) installed.deleteConversation(c.id);
    await installed.flush(); paper.deleted = true; await paper.saveTx();
  }
  try {
    const pdf = await z.Attachments.importFromFile({file: await originalPDF.getFilePathAsync(), parentItemID: paper.id, contentType: 'application/pdf', title: 'English annotation example'});
    reader = await z.Reader.open(pdf.id); await reader._initPromise;
    const view = reader._internalReader._primaryView;
    for (let n = 0; n < 100 && !view._iframeWindow?.PDFViewerApplication?.pdfDocument; n++) await new Promise(r => win.setTimeout(r, 100));
    const scope = {libraryID: paper.libraryID, itemKey: paper.key, title: paper.getField('title')};
    const tools = createZoteroAnnotationTools({zotero: z});
    const quote = 'The typical output length ranges from 30 to 80 tokens.';
    const secrets = {async get() {return 'documentation-fixture';}, async set() {return true;}, async delete() {}};
    service = new ChatService({async load() {return null;}, async save() {}}, secrets, async request => {
      const payload = JSON.parse(request.messages.at(-1)!.content);
      if (!payload.paper?.pages.some((p: any) => p.page === 9 && p.text.includes('30 to 80 tokens'))) throw new Error('The expected Nova passage is absent.');
      request.onText(JSON.stringify({summary: '', annotations: [{page: 9, quote, comment: 'Typical outputs are 30 to 80 tokens. This describes the dataset; it is not a fixed generation limit.', type: 'highlight', color: '#5fb236'}]}));
      return {};
    }, undefined, tools.plan);
    await service.init();
    await service.saveConfig({version: 1, language: 'en-US', endpoints: [{id: 'demo', name: 'Example API', baseURL: 'https://example.invalid/v1', stream: false}], models: [{id: 'demo', endpointId: 'demo', name: 'Reading assistant', model: 'demo'}], defaultModelId: 'demo', systemPrompt: 'Explain the paper in English.'});
    const chat = service.forScope(scope);
    service.setReadingOptions(chat.id, {currentPaper: true, relatedPapers: false});
    service.setDraft(chat.id, 'Highlight the experimental output length in green and explain what it means.');
    overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    pane.style.width = '590px'; pane.style.minWidth = '590px';
    overlay!.style.cssText = 'position:fixed;top:80px;right:38px;width:550px;height:calc(100vh - 94px);z-index:2147483647;background:#f7f7f8;color:#202124;border:1px solid #d4d8df;border-radius:8px;overflow:hidden;font-size:13px;';
    const details = Array.from(doc.querySelectorAll('item-details')).find((node: any) => node.getBoundingClientRect().width > 0 && win.getComputedStyle(node).visibility !== 'hidden') as HTMLElement | undefined;
    (details || doc.documentElement).append(overlay);
    const host: Host = {service, annotations: tools, secretStore: secrets, rootURI: z.AIReader.host.rootURI, openSettings() {}, scopeForItem() {return null;}, openURL() {}, openSource() {}, copy() {}};
    panel = mountSidebar(overlay!, scope, host);
    (overlay!.querySelector('.zar-sidebar') as HTMLElement).style.height = '100%';
    await service.send(chat.id);
    const answer = chat.messages.at(-1)!;
    if (!answer.annotationPlan?.items.some(x => x.status === 'ready')) throw new Error('Native passage matching failed: ' + answer.content);
    await tools.locate(answer.annotationPlan, '0');
    const wait = async (ready: () => boolean) => {for (let i = 0; i < 80 && !ready(); i++) await new Promise(r => win.setTimeout(r, 100)); if (!ready()) throw new Error('Example UI did not finish.');};
    const button = (label: string) => Array.from(overlay!.querySelectorAll<NativeButton>('button')).find(n => n.getAttribute('label') === label)!;
    await wait(() => !!button('Save to PDF'));
    (overlay!.querySelector('.zar-messages') as HTMLElement).scrollTop = 0;
    return {
      paperID: paper.id,
      async save() {
        button('Save to PDF').doCommand();
        await wait(() => !!chat.messages.at(-1)?.annotationPlan?.receipts.length);
        await wait(() => !!button('Undo this batch') && !button('Undo this batch').hidden);
        const receipt = chat.messages.at(-1)!.annotationPlan!.receipts[0];
        const item = await z.Items.getByLibraryAndKeyAsync(pdf.libraryID, receipt.itemKey);
        await z.Items.loadDataTypes([item], ['annotation', 'annotationDeferred']);
        if (item.annotationColor !== '#5fb236' || item.annotationType !== 'highlight' || !item.annotationComment.includes('Typical outputs')) throw new Error('Saved annotation differs from preview.');
        return {saved: true, nativeType: item.annotationType, color: item.annotationColor};
      },
      async undo() {button('Undo this batch').doCommand(); await wait(() => !!chat.messages.at(-1)?.annotationPlan?.undone); return {undone: true};},
      close,
    };
  } catch (error) {await close(); throw error;}
}
