import { tr, type UILanguage } from './i18n.ts';
const XHTML = 'http://www.w3.org/1999/xhtml';
const paths: Record<string, string> = { copy: 'M9 9h11v11H9z M4 15V4h11', download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5', more: 'M5 12h.01 M12 12h.01 M19 12h.01', close: 'm6 6 12 12 M6 18 18 6', plus: 'M5 12h14 M12 5v14', minus: 'M5 12h14', fit: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5' };
export function imageButton(doc: Document, label: string, icon: string, action: () => void): HTMLButtonElement {
  const button = doc.createElementNS(XHTML, 'button') as HTMLButtonElement; button.type = 'button'; button.className = 'zar-image-button'; button.title = label; button.setAttribute('aria-label', label);
  const svg = doc.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.8'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
  const path = doc.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d', paths[icon] || paths.more); svg.append(path); button.append(svg); button.addEventListener('click',action); return button;
}
const openViewers = new WeakMap<Document, () => void>();
/** Window-sized local viewer with zoom, scroll, focus trapping and Escape dismissal. */
export function openImageViewer(doc: Document, image: HTMLImageElement, language: UILanguage): void {
  if (!image.naturalWidth) return;
  openViewers.get(doc)?.(); const win = doc.defaultView!, focus = doc.activeElement as HTMLElement | null;
  const overlay = doc.createElementNS(XHTML,'div') as HTMLElement; overlay.className = 'zar-root zar-image-viewer'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label',tr(language,'图片预览','Image preview'));
  const toolbar = doc.createElementNS(XHTML,'div') as HTMLElement; toolbar.className = 'zar-viewer-toolbar';
  const viewport = doc.createElementNS(XHTML,'div') as HTMLElement; viewport.className = 'zar-viewer-viewport';
  const full = doc.createElementNS(XHTML,'img') as HTMLImageElement; full.src = image.src; full.alt = image.alt;
  const percent = doc.createElementNS(XHTML,'span') as HTMLElement; percent.className = 'zar-viewer-percent'; let zoom = 1;
  const fit = () => Math.min(1, (win.innerWidth-64)/Math.max(1,image.naturalWidth), (win.innerHeight-100)/Math.max(1,image.naturalHeight));
  const update = () => { full.style.width = Math.max(1, Math.round(image.naturalWidth * zoom)) + 'px'; full.style.height = 'auto'; percent.textContent = `${Math.round(zoom*100)}%`; };
  const close = () => { overlay.remove(); doc.removeEventListener('keydown',key,true); openViewers.delete(doc); if (focus?.isConnected) focus.focus({preventScroll:true}); };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') { const buttons = Array.from(toolbar.querySelectorAll('button')); const first = buttons[0], last = buttons.at(-1)!;
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  toolbar.append(imageButton(doc,tr(language,'缩小','Zoom out'),'minus',()=>{ zoom=Math.max(.1,zoom/1.25);update(); }),percent,
    imageButton(doc,tr(language,'放大','Zoom in'),'plus',()=>{ zoom=Math.min(8,zoom*1.25);update(); }),
    imageButton(doc,tr(language,'适应窗口','Fit to window'),'fit',()=>{zoom=fit();update();}),
    imageButton(doc,'100%','fit',()=>{zoom=1;update();}),imageButton(doc,tr(language,'关闭预览','Close preview'),'close',close));
  viewport.append(full); overlay.append(toolbar,viewport); doc.documentElement.append(overlay); zoom=fit();update();
  overlay.addEventListener('click',event=>{if(event.target===overlay||event.target===viewport) close();});
  doc.addEventListener('keydown',key,true); toolbar.querySelector<HTMLButtonElement>('button')!.focus(); openViewers.set(doc,close);
}
