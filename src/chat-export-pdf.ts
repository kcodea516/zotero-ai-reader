import { annotationMarkdown } from './annotations.ts';
import { renderMarkdown } from './render.ts';
import { isRasterDataURL } from './image-data.ts';
import { exportStatus, sourceURL } from './chat-export.ts';
import { tr, type UILanguage } from './i18n.ts';
import type { Conversation } from './types.ts';
const HTML = 'http://www.w3.org/1999/xhtml';
const css = `@page{size:A4;margin:18mm}body{font:11pt/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18202b;background:white;margin:0;overflow-wrap:anywhere}h1{font-size:20pt}h2{font-size:15pt;margin-top:1.5em}h3{font-size:12pt}h1,h2,h3,h4{break-after:avoid}article{border-top:1px solid #d9dfe8;padding-top:12pt;margin-top:18pt}p{margin:7pt 0}blockquote{border-left:3px solid #bbcce3;padding-left:12pt;margin:10pt 0;color:#475569}pre{white-space:pre-wrap;background:#f4f6f9;padding:10pt;font-size:9pt}code{font-family:monospace}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10pt}th,td{border:1px solid #ccd2da;padding:6pt;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr,img{break-inside:avoid}img{display:block;max-width:100%;max-height:235mm;object-fit:contain;margin:10pt 0}a{color:#245da8}.meta{font-size:9pt;color:#596575}.katex-html{display:none}.katex-mathml{position:static!important;clip:auto!important;width:auto!important;height:auto!important;overflow:visible!important}math{font-size:1.05em}annotation{display:none}`;
/** Build from the conversation model, never the collapsed or scrolled sidebar DOM. */
export function conversationHTML(doc: Document, chat: Conversation, language: UILanguage): string {
  const t = (zh: string, en: string) => tr(language, zh, en);
  const root = doc.createElementNS(HTML, 'main');
  const add = (parent: Element, tag: string, text: string, cls = '') => {
    const el = doc.createElementNS(HTML, tag); el.textContent = text; if (cls) el.className = cls; parent.append(el); return el;
  };
  add(root, 'h1', chat.title);
  add(root, 'p', `${t('文献', 'Paper')}: ${chat.scope.title}`);
  add(root, 'p', `${t('创建时间', 'Created')}: ${new Date(chat.createdAt).toLocaleString(language)}`, 'meta');
  const addImage = (parent: Element, url: string, name: string) => {
    if (!isRasterDataURL(url)) return;
    const img = doc.createElementNS(HTML, 'img') as HTMLImageElement; img.src = url; img.alt = name; parent.append(img);
  };
  for (const message of chat.messages) {
    const section = doc.createElementNS(HTML, 'article'); root.append(section);
    add(section, 'h2', `${message.role === 'user' ? t('我', 'You') : 'AI'} · ${new Date(message.createdAt).toLocaleString(language)}`);
    if (message.modelName) add(section, 'p', [message.endpointName, message.modelName].filter(Boolean).join(' / '), 'meta');
    if (message.quote) {
      add(section, 'blockquote', message.quote.text);
      if (message.quote.pageLabel) add(section, 'p', `${t('引用页码', 'Quoted page')}: ${message.quote.pageLabel}`, 'meta');
    }
    for (const image of message.inputImages || []) addImage(section, image.dataURL, image.name);
    const content = doc.createElementNS(HTML, 'div') as HTMLElement;
    renderMarkdown(content, message.content + annotationMarkdown(message.annotationPlan), () => {}, message.sources, () => {}, language);
    // Export the static image, not viewer controls or executable SVG.
    for (const media of Array.from(content.querySelectorAll('.zar-media'))) {
      const image = media.querySelector('img'); if (image) media.replaceWith(image.cloneNode(true));
    }
    for (const node of Array.from(content.querySelectorAll('button,details,script,iframe,.katex-html,annotation'))) node.remove();
    // DOMPurify unwraps KaTeX's annotation node, leaving the TeX source as a text sibling.
    for (const semantics of Array.from(content.querySelectorAll('math,semantics'))) {
      for (const child of Array.from(semantics.childNodes)) if (child.nodeType === 3) child.remove();
    }
    for (const anchor of Array.from(content.querySelectorAll('a'))) {
      const source = message.sources?.find(s => anchor.title.startsWith(s.title + ' · PDF'));
      const page = /PDF(?: 第)?\s*(\d+)/.exec(anchor.textContent || '')?.[1];
      if (source) anchor.href = sourceURL(source, page ? Number(page) : undefined);
    }
    section.append(content);
    for (const image of message.images || []) addImage(section, image.dataURL, t('生成的图片', 'Generated image'));
    if (message.contextNotice) add(section, 'p', message.contextNotice, 'meta');
    if (message.sources?.length) {
      add(section, 'h3', t('本轮来源', 'Sources for this response'));
      for (const s of message.sources) {
        const row = add(section, 'p', '', 'meta');
        const link = add(row, 'a', `${s.id}: ${s.title}`) as HTMLAnchorElement; link.href = sourceURL(s);
        row.append(doc.createTextNode(` — PDF ${s.pages.join(', ')}${s.truncated ? t('（节选）', ' (excerpts)') : ''}`));
      }
    }
    if (message.status !== 'complete') add(section, 'p', exportStatus(message, language), 'meta');
    if (message.error) add(section, 'p', message.error, 'meta');
  }
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'"><title>Chat export</title><style>${css}</style></head><body>${root.outerHTML}</body></html>`;
}

export async function printConversationPDF(win: Window, html: string, path: string): Promise<void> {
  const { HiddenBrowser } = ChromeUtils.importESModule('chrome://zotero/content/HiddenBrowser.mjs');
  const browser = new HiddenBrowser({ useHiddenFrame: false, blockRemoteResources: true });
  try {
    if (!await browser.load('data:text/html;charset=utf-8,' + encodeURIComponent(html))) throw new Error('Could not load the PDF document');
    await browser.waitForDocument();
    const settings = Components.classes['@mozilla.org/gfx/printsettings-service;1'].getService(Components.interfaces.nsIPrintSettingsService).createNewPrintSettings();
    settings.outputDestination = Components.interfaces.nsIPrintSettings.kOutputDestinationFile;
    settings.outputFormat = Components.interfaces.nsIPrintSettings.kOutputFormatPDF;
    settings.printerName = 'Mozilla Save to PDF';
    settings.toFileName = path; settings.printSilent = true; settings.printBGColors = true; settings.printBGImages = true;
    settings.paperWidth = 210; settings.paperHeight = 297; settings.paperSizeUnit = Components.interfaces.nsIPrintSettings.kPaperSizeMillimeters;
    for (const key of ['headerStrLeft','headerStrCenter','headerStrRight','footerStrLeft','footerStrCenter','footerStrRight']) settings[key] = '';
    await browser.browsingContext.print(settings);
  } finally { browser.destroy(); }
}
