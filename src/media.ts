import { nativeButton } from './controls.ts';
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
  const create = (tag: string, cls = '') => { const el = doc.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement; el.className = cls; return el; };
  const figure = create('figure', 'zar-media');
  const clean = cleanSVG(doc, source);
  const details = create('details', 'zar-media-source'); const summary = create('summary'); summary.textContent = tr(language, '查看 SVG 代码', 'View SVG code');
  const pre = create('pre'); const code = create('code'); code.textContent = source; pre.append(code); details.append(summary, pre);
  if (!clean) { const notice = create('p'); notice.textContent = tr(language, 'SVG 尚不完整或无法预览，可查看代码。', 'SVG is incomplete or cannot be previewed. View the code below.'); figure.append(notice, details); return figure; }
  const img = create('img', 'zar-media-image') as HTMLImageElement;
  img.alt = tr(language, 'AI 生成的 SVG 图', 'AI-generated SVG diagram'); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clean);
  const controls = create('div', 'zar-media-actions'); const status = create('span', 'zar-media-status'); status.setAttribute('role', 'status');
  const raster = async () => {
    if (!img.complete) await new Promise<void>((resolve, reject) => { img.addEventListener('load', () => resolve(), { once: true }); img.addEventListener('error', () => reject(new Error('Image failed')), { once: true }); });
    if (!img.naturalWidth) throw new Error('Image failed');
    const canvas = doc.createElementNS('http://www.w3.org/1999/xhtml', 'canvas') as HTMLCanvasElement;
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0); return canvas.toDataURL('image/png');
  };
  const action = (zh: string, en: string, task: () => Promise<boolean | void> | void) => {
    const button = nativeButton(doc, tr(language, zh, en), () => { button.disabled = true; status.textContent = '';
      void Promise.resolve().then(task).then(done => { if (done !== false) status.textContent = tr(language, '已完成', 'Done'); })
        .catch(() => { status.textContent = tr(language, '操作失败，请重试。', 'Action failed. Please retry.'); }).finally(() => { button.disabled = false; });
    }); controls.append(button);
  };
  if (actions?.copyImage) action('复制图片', 'Copy image', async () => actions.copyImage!(await raster()));
  if (actions?.saveImage) {
    action('保存 PNG', 'Save PNG', async () => actions.saveImage!(await raster(), 'ai-reader-diagram.png'));
    action('保存 SVG', 'Save SVG', async () => actions.saveImage!(img.src, 'ai-reader-diagram.svg'));
  }
  if (actions) action('复制 SVG', 'Copy SVG', () => actions.copy(clean));
  controls.append(status); figure.append(img, controls, details); return figure;
}
