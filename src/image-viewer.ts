import { mountInteractiveSVG } from './svg-frame.ts';
import { tr, type UILanguage } from './i18n.ts';
const XHTML = 'http://www.w3.org/1999/xhtml';
const paths: Record<string, string> = { copy: 'M9 9h11v11H9z M4 15V4h11', download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5', more: 'M5 12h.01 M12 12h.01 M19 12h.01', close: 'm6 6 12 12 M6 18 18 6', plus: 'M5 12h14 M12 5v14', minus: 'M5 12h14', fit: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5', play: 'm8 4 12 8-12 8z', pause: 'M8 4v16 M16 4v16', restart: 'M4 10a8 8 0 1 1 1 8 M4 4v6h6' };
export function imageButton(doc: Document, label: string, icon: string, action: () => void): HTMLButtonElement {
  const button = doc.createElementNS(XHTML, 'button') as HTMLButtonElement; button.type = 'button'; button.className = 'zar-image-button'; button.title = label; button.setAttribute('aria-label', label);
  const svg = doc.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.8'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
  const path = doc.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d', paths[icon] || paths.more); svg.append(path); button.append(svg); button.addEventListener('click',action); return button;
}
const openViewers = new WeakMap<Document, () => void>();
export function closeImageViewer(doc: Document): void { openViewers.get(doc)?.(); }
/** Window-sized local viewer with zoom, scroll, focus trapping and Escape dismissal. */
export function openImageViewer(doc: Document, image: HTMLImageElement, language: UILanguage, svgSource?: string): void {
  if (!image.naturalWidth) return;
  openViewers.get(doc)?.(); const win = doc.defaultView!, focus = doc.activeElement as HTMLElement | null;
  const overlay = doc.createElementNS(XHTML,'div') as HTMLElement; overlay.className = 'zar-root zar-image-viewer'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label',tr(language,'图片预览','Image preview'));
  const toolbar = doc.createElementNS(XHTML,'div') as HTMLElement; toolbar.className = 'zar-viewer-toolbar';
  const viewport = doc.createElementNS(XHTML,'div') as HTMLElement; viewport.className = 'zar-viewer-viewport';
  const full = doc.createElementNS(XHTML,'img') as HTMLImageElement; full.src = image.src; full.alt = image.alt;
  let frame: HTMLIFrameElement | undefined, disposeFrame: (() => void) | undefined, timer: number | undefined;
  let closed = false;
  const message = doc.createElementNS(XHTML, 'span') as HTMLElement; message.className = 'zar-viewer-message'; message.setAttribute('role', 'status');
  const percent = doc.createElementNS(XHTML,'span') as HTMLElement; percent.className = 'zar-viewer-percent'; let zoom = 1;
  const fit = () => Math.min(1, (win.innerWidth-64)/Math.max(1,image.naturalWidth), (win.innerHeight-100)/Math.max(1,image.naturalHeight));
  const update = () => { full.style.width = Math.max(1, Math.round(image.naturalWidth * zoom)) + 'px'; full.style.height = 'auto'; percent.textContent = `${Math.round(zoom*100)}%`; if (frame) { frame.style.width = full.style.width; frame.style.height = Math.max(1, Math.round(image.naturalHeight * zoom)) + 'px'; } };
  const close = () => { if (closed) return; closed = true; if (timer !== undefined) win.clearInterval(timer); overlay.remove(); disposeFrame?.(); win.removeEventListener('unload', close); doc.removeEventListener('keydown',key,true); openViewers.delete(doc); if (focus?.isConnected) focus.focus({preventScroll:true}); };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') { const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button:not(:disabled),input:not(:disabled)')); const first = buttons[0], last = buttons.at(-1)!;
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  toolbar.append(imageButton(doc,tr(language,'缩小','Zoom out'),'minus',()=>{ zoom=Math.max(.1,zoom/1.25);update(); }),percent,
    imageButton(doc,tr(language,'放大','Zoom in'),'plus',()=>{ zoom=Math.min(8,zoom*1.25);update(); }),
    imageButton(doc,tr(language,'适应窗口','Fit to window'),'fit',()=>{zoom=fit();update();}),
    imageButton(doc,'100%','fit',()=>{zoom=1;update();}),imageButton(doc,tr(language,'关闭预览','Close preview'),'close',close));
  viewport.append(full); overlay.append(toolbar,message,viewport); doc.documentElement.append(overlay); zoom=fit();update();
  overlay.addEventListener('click',event=>{if(event.target===overlay||event.target===viewport) close();});
  doc.addEventListener('keydown',key,true); toolbar.querySelector<HTMLButtonElement>('button')!.focus(); openViewers.set(doc,close); win.addEventListener('unload', close, {once:true});
  if (svgSource) {
    const controls = doc.createElementNS(XHTML, 'div') as HTMLElement; controls.className = 'zar-svg-controls';
    let paused = false;
    const command = (action: string, seconds?: number) => frame?.contentWindow?.postMessage({ type: 'zar-svg-control', action, seconds }, '*');
    const play = imageButton(doc,tr(language,'暂停','Pause'),'pause',()=>{ paused = !paused; command(paused ? 'pause' : 'play'); });
    const restart = imageButton(doc,tr(language,'重新播放','Restart'),'restart',()=>load());
    const seek = doc.createElementNS(XHTML,'input') as HTMLInputElement; seek.type='range';seek.min='0';seek.max='1';seek.step='.01';seek.value='0';seek.disabled=true;
    seek.setAttribute('aria-label',tr(language,'SVG/CSS 动画进度','SVG/CSS animation timeline'));
    seek.title=tr(language,'拖动 SVG/CSS 动画进度；脚本动画可用重播重新开始。','Seek SVG/CSS animations. Use Restart to reset scripted animations.');
    seek.addEventListener('input',()=>command('seek',Number(seek.value)));
    const time = doc.createElementNS(XHTML,'span') as HTMLElement; time.className='zar-viewer-time';time.textContent='0.0s';
    controls.append(play,restart,seek,time);toolbar.prepend(controls);
    const load = () => {
      if (timer !== undefined) win.clearInterval(timer);frame?.remove();disposeFrame?.();disposeFrame=undefined;full.hidden=false;
      paused=false;play.disabled=true;seek.disabled=true;message.textContent=tr(language,'正在打开交互图…','Opening interactive diagram…');
      frame=doc.createElementNS(XHTML,'iframe') as HTMLIFrameElement;frame.className='zar-svg-frame';frame.title=tr(language,'交互式 SVG 图','Interactive SVG diagram');
      frame.setAttribute('sandbox','allow-scripts');viewport.append(frame);update();
      try {
        disposeFrame=mountInteractiveSVG(frame,svgSource);
        const start=Date.now();
        timer=win.setInterval(()=>{
          if (!overlay.isConnected) {close();return;}
          const root=frame?.contentDocument?.documentElement;
          if(root?.getAttribute('data-zar-close')==='true'){close();return;}
          if(root?.getAttribute('data-zar-ready')!=='true') {
            if(Date.now()-start>5000){if(timer!==undefined)win.clearInterval(timer);frame?.remove();disposeFrame?.();disposeFrame=undefined;frame=undefined;full.hidden=false;message.textContent=tr(language,'交互预览未能加载，请重新播放。','Interactive preview could not load. Try Restart.');}return;
          }
          full.hidden=true;message.textContent='';play.disabled=false;
          paused=root.getAttribute('data-zar-paused')==='true';
          const label=paused?tr(language,'播放','Play'):tr(language,'暂停','Pause');play.title=label;play.setAttribute('aria-label',label);play.querySelector('path')!.setAttribute('d',paths[paused?'play':'pause']);
          const duration=Number(root.getAttribute('data-zar-duration')),current=Number(root.getAttribute('data-zar-time'));
          seek.disabled=!(Number.isFinite(duration)&&duration>0);seek.max=String(seek.disabled?1:duration);
          if(Number.isFinite(current)) {time.textContent=`${current.toFixed(1)}s`;if(doc.activeElement!==seek)seek.value=String(duration>0?current%duration:0);}
        },100);
      }catch {frame.remove();frame=undefined;message.textContent=tr(language,'当前窗口不支持交互预览。','Interactive preview is unavailable in this window.');}
    };
    load();
  }
}
