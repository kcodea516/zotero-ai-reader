import { imageButton, openImageViewer } from './image-viewer.ts';
import { isRasterDataURL } from './image-data.ts';
import { tr, type UILanguage } from './i18n.ts';

export interface MediaActions {
  copy(text: string): void;
  copyImage?(png: string): Promise<void>;
  saveImage?(dataURL: string, filename: string): Promise<boolean>;
}
export const MAX_SVG_LENGTH = 300_000;
export function isSVG(source: string): boolean {
  return source.length <= MAX_SVG_LENGTH && /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source) && /<\/svg>\s*$/i.test(source);
}
const tags = new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath title desc marker linearGradient radialGradient stop clipPath mask pattern'.split(' '));
const attrs = new Set('id class x y x1 y1 x2 y2 cx cy r rx ry width height viewBox preserveAspectRatio d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset opacity font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline dx dy rotate letter-spacing word-spacing marker-start marker-mid marker-end markerWidth markerHeight markerUnits refX refY orient offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits patternTransform clip-path clip-rule mask maskUnits maskContentUnits startOffset textLength lengthAdjust'.split(' '));
const ns = 'http://www.w3.org/2000/svg';

/** Rebuild static SVG from allowed elements. Never insert model SVG into the chrome DOM. */
export function cleanSVG(doc: Document, source: string): string | undefined {
  if (!isSVG(source) || /<!DOCTYPE|<!ENTITY/i.test(source)) return;
  const win = doc.defaultView as Window & typeof globalThis;
  const parsed = new win.DOMParser().parseFromString(source, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg' || (parsed.documentElement.namespaceURI !== ns && parsed.documentElement.namespaceURI !== null) || parsed.querySelectorAll('*').length > 2000) return;
  const output = doc.implementation.createDocument(ns, 'svg', null);
  const copy = (from: Element, to: Element) => {
    for (const attr of Array.from(from.attributes)) {
      const name = attr.name, value = attr.value;
      if (value.length > 30000 || /(?:javascript:|data:|https?:|file:|@import|expression\s*\()/i.test(value)) continue;
      if (name === 'href' || name === 'xlink:href') { if (/^#[\w-]+$/.test(value)) to.setAttribute('href', value); continue; }
      if (name === 'style') {
        const safe = value.split(';').filter(rule => {
          const pos = rule.indexOf(':'); return pos > 0 && attrs.has(rule.slice(0, pos).trim()) && safeValue(rule.slice(pos + 1));
        }).join(';'); if (safe) to.setAttribute('style', safe); continue;
      }
      if (attrs.has(name) && safeValue(value)) to.setAttribute(name, value);
    }
    for (const node of Array.from(from.childNodes)) {
      if (node.nodeType === 3) to.append(output.createTextNode(node.textContent || ''));
      else if (node.nodeType === 1 && (node as Element).localName === 'style') {
        const css = (node.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
        const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map(([, selector, body]) => {
          if (!/^[.#\w\s,>+~*:-]+$/.test(selector)) return '';
          const declarations = body.split(';').filter(rule => { const pos = rule.indexOf(':'); return pos > 0 && attrs.has(rule.slice(0, pos).trim()) && safeValue(rule.slice(pos + 1)); }).join(';');
          return declarations ? selector + '{' + declarations + '}' : '';
        }).join('');
        if (rules) { const style = output.createElementNS(ns, 'style'); style.textContent = rules; to.append(style); }
      }
      else if (node.nodeType === 1 && tags.has((node as Element).localName) && ((node as Element).namespaceURI === ns || ((node as Element).namespaceURI === null && parsed.documentElement.namespaceURI === null))) {
        const child = output.createElementNS(ns, (node as Element).localName); copy(node as Element, child); to.append(child);
      }
    }
  };
  copy(parsed.documentElement, output.documentElement);
  const svg = output.documentElement;
  if (!svg.hasAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width') || '') || 800, h = parseFloat(svg.getAttribute('height') || '') || 400;
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, Math.min(4096, w))} ${Math.max(1, Math.min(4096, h))}`);
  }
  svg.setAttribute('width', '1200'); svg.setAttribute('height', '800');
  // Match the intrinsic aspect ratio without allowing huge decoded dimensions.
  const box = svg.getAttribute('viewBox')!.trim().split(/[ ,]+/).map(Number);
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return;
  const scale = Math.min(2, 1600 / Math.max(box[2], box[3]));
  svg.setAttribute('width', String(Math.max(1, Math.round(box[2] * scale))));
  svg.setAttribute('height', String(Math.max(1, Math.round(box[3] * scale))));
  return new win.XMLSerializer().serializeToString(svg);
}
function safeValue(value: string): boolean {
  return !/\\|\/\*|@|(?:javascript|data|https?|file):|expression\s*\(/i.test(value)
    && !/url\((?!\s*['"]?#[\w-]+['"]?\s*\))/i.test(value);
}

export function mountSVG(doc: Document, source: string, language: UILanguage, actions?: MediaActions): HTMLElement {
  const clean = cleanSVG(doc, source);
  if (clean) return mountImage(doc, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clean), language, actions, source, clean);
  const pre = doc.createElementNS('http://www.w3.org/1999/xhtml','pre') as HTMLElement; pre.textContent = source; return pre;
}
export function mountRaster(doc: Document, dataURL: string, language: UILanguage, actions?: MediaActions): HTMLElement {
  if (!isRasterDataURL(dataURL)) throw new Error('Invalid raster image');
  return mountImage(doc, dataURL, language, actions);
}
function mountImage(doc: Document, dataURL: string, language: UILanguage, actions?: MediaActions, source?: string, vector?: string): HTMLElement {
  const create = (tag: string, cls = '') => { const el = doc.createElementNS('http://www.w3.org/1999/xhtml',tag) as HTMLElement; el.className=cls; return el; };
  const figure=create('figure','zar-media'), stage=create('div','zar-media-stage'), tools=create('div','zar-image-tools');
  const img=create('img','zar-media-image') as HTMLImageElement; img.src=dataURL; img.alt=tr(language,'AI 生成的图片','AI-generated image'); img.tabIndex=0; img.setAttribute('role','button'); img.setAttribute('aria-label',tr(language,'点击放大图片','Open full-size image'));
  img.addEventListener('click',()=>openImageViewer(doc,img,language)); img.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openImageViewer(doc,img,language);}});
  const status=create('span','zar-image-status');status.setAttribute('role','status');
  const raster=async (format='image/png') => {
    if (!img.complete) await new Promise<void>((resolve,reject)=>{img.addEventListener('load',()=>resolve(),{once:true});img.addEventListener('error',()=>reject(new Error('Image failed')),{once:true});});
    if (!img.naturalWidth || img.naturalWidth*img.naturalHeight>32_000_000) throw new Error('Image is too large');
    const canvas=create('canvas') as HTMLCanvasElement; const scale=Math.min(1,4096/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d')!;if(format==='image/jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL(format,.95);
  };
  const run=(button: HTMLButtonElement, task:()=>Promise<boolean|void>|void) => {
    button.disabled=true;status.textContent='';status.classList.remove('zar-image-error');
    void Promise.resolve().then(task).then(done=>{if(done!==false){button.title=tr(language,'已完成','Done');status.textContent=button.title;const icon=button.querySelector('path');if(icon){const path=icon.getAttribute('d')||'';icon.setAttribute('d','m5 12 4 4 10-10');doc.defaultView!.setTimeout(()=>{icon.setAttribute('d',path);button.title=button.getAttribute('aria-label')||'';},1600);}}}).catch(()=>{status.textContent=tr(language,'图片操作失败，请重试。','Image action failed. Please retry.');status.classList.add('zar-image-error');}).finally(()=>{button.disabled=false;});
  };
  if(actions?.copyImage){const button=imageButton(doc,tr(language,'复制图片','Copy image'),'copy',()=>run(button,async()=>actions.copyImage!(await raster())));tools.append(button);}
  const menu=create('details','zar-image-menu'), summary=create('summary');summary.title=tr(language,'图片操作','Image actions');summary.setAttribute('aria-label',summary.title);summary.textContent='⋯';
  const options=create('div','zar-image-options');
  const option=(zh:string,en:string,task:()=>Promise<boolean|void>|void)=>{const button=create('button','zar-image-option') as HTMLButtonElement;button.type='button';button.textContent=tr(language,zh,en);button.setAttribute('aria-label',button.textContent);button.addEventListener('click',()=>{(menu as HTMLDetailsElement).open=false;run(button,task);});options.append(button);};
  if(actions?.saveImage){
    option('保存 PNG','Save PNG',async()=>actions.saveImage!(await raster(),'ai-reader-diagram.png'));
    option('保存 JPG','Save JPG',async()=>actions.saveImage!(await raster('image/jpeg'),'ai-reader-diagram.jpg'));
    if(vector)option('保存 SVG','Save SVG',async()=>actions.saveImage!(dataURL,'ai-reader-diagram.svg'));
    else option('保存原图','Save original',async()=>actions.saveImage!(dataURL,'ai-reader-diagram.'+(dataURL.startsWith('data:image/jpeg')?'jpg':dataURL.startsWith('data:image/webp')?'webp':'png')));
  }
  if(vector && actions)option('复制 SVG 代码','Copy SVG',()=>actions.copy(vector));
  if(source){const codeBox=create('pre','zar-media-source');codeBox.hidden=true;const code=create('code');code.textContent=source;codeBox.append(code);
    option('查看 SVG 代码','View SVG code',()=>{codeBox.hidden=!codeBox.hidden;});figure.append(codeBox);
  }
  menu.append(summary,options);tools.append(menu);stage.append(img,tools,status);figure.prepend(stage);return figure;
}
