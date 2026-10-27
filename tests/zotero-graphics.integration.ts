import { renderMarkdown } from '../src/render.ts';
import { cleanSVG } from '../src/media.ts';

/** Synthetic images and fake copy/save sinks; no provider, clipboard or file writes. */
export async function runGraphicsChecks(win: Window): Promise<string[]> {
  const doc = win.document; const checks: string[] = [];
  const check = (name: string, condition: unknown) => { if (!condition) throw new Error(name); checks.push(name); };
  const root = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
  root.className = 'zar-root'; root.style.cssText = 'position:fixed;top:20px;right:20px;width:304px;background:Canvas;color:CanvasText;z-index:2147483647;';
  const target = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement; target.className = 'zar-markdown'; root.append(target);
  const details = Array.from(doc.querySelectorAll('item-details')).find(n => n.getBoundingClientRect().width > 0);
  (details || doc.documentElement).append(root);
  const copies: string[] = [], images: string[] = [], saves: string[] = [];
  const actions = { copy: (text: string) => { copies.push(text); }, async copyImage(png: string) { images.push(png); }, async saveImage(data: string, name: string) { saves.push(name + ':' + data); return true; } };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240"><rect x="10" y="10" width="580" height="220" rx="20" fill="#eaf3ff" stroke="#4070bc"/><text x="300" y="115" font-size="30" text-anchor="middle">Encoder → LLM</text><text x="300" y="170" font-size="24" text-anchor="middle">视觉编码与推理</text></svg>';
  const wait = async (condition: () => boolean) => { for (let i = 0; i < 100 && !condition(); i++) await new Promise(resolve => win.setTimeout(resolve, 50)); check('action completed', condition()); };
  const button = (label: string) => { const found = Array.from(target.querySelectorAll<HTMLButtonElement>('button')).find(b => b.getAttribute('aria-label') === label); if (!found) throw new Error('Missing ' + label); return found; };
  try {
    renderMarkdown(target, 'Diagram:\n\n```svg\n' + svg + '\n```\n\nAfter diagram.', () => {}, [], undefined, 'en-US', actions);
    const img = target.querySelector<HTMLImageElement>('img')!;
    await wait(() => img.complete && img.naturalWidth > 0);
    check('fenced SVG renders as a decoded image', img.src.startsWith('data:image/svg+xml;') && img.naturalWidth === 1200);
    check('model SVG is never inserted into privileged DOM', !target.querySelector('.zar-media-stage > svg'));
    check('diagram fits the narrow sidebar', img.getBoundingClientRect().width <= 304);
    check('surrounding answer is preserved', target.textContent?.includes('After diagram.'));
    button('Copy image').click(); await wait(() => images.length === 1);
    check('copy produces a PNG image', images[0].startsWith('data:image/png;base64,'));
    button('Save PNG').click(); await wait(() => saves.length === 1);
    check('PNG save receives image bytes', saves[0].startsWith('ai-reader-diagram.png:data:image/png;base64,'));
    button('Save SVG').click(); await wait(() => saves.length === 2);
    check('SVG save receives the sanitized vector', saves[1].startsWith('ai-reader-diagram.svg:data:image/svg+xml;'));
    button('Copy SVG').click(); await wait(() => copies.length === 1);
    check('vector copy preserves Chinese and shape text', copies[0].includes('视觉编码与推理'));
    button('View SVG code').click();
    check('original code remains available', target.querySelector('pre code')?.textContent === svg + '\n');
    renderMarkdown(target, svg, () => {}, [], undefined, 'zh-CN', actions);
    check('raw standalone SVG renders with Chinese actions', !!target.querySelector('img') && !!button('复制图片'));
    renderMarkdown(target, '```svg\n<svg><rect', () => {}, [], undefined, 'en-US', actions);
    check('partial streaming SVG stays readable code', !target.querySelector('img') && target.textContent?.includes('<svg>'));
    const dirty = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><div>unsafe</div></foreignObject><image href="https://example.invalid/pixel"/><use href="https://example.invalid/external.svg#x"/><rect style="fill:url(https://example.invalid/pixel)"/><text>safe</text></svg>';
    const clean = cleanSVG(doc, dirty)!;
    check('scripts, events, HTML and external resources are removed', !/onload|script|foreignObject|https:\/\/example|<image|url\(/.test(clean) && clean.includes('safe'));
    check('XML entities and malformed SVG fail closed', !cleanSVG(doc, '<!DOCTYPE svg><svg/>') && !cleanSVG(doc, '<svg><rect></svg>'));
    const plain = cleanSVG(doc, '<svg viewBox="0 0 400 100"><style>.label {fill:blue;font-size:20px;background:url(https://example.invalid/pixel)}</style><text class="label">No namespace</text></svg>')!;
    check('SVG without xmlns retains geometry, text and safe CSS', plain.includes('No namespace') && plain.includes('fill:blue') && !plain.includes('example.invalid'));
    renderMarkdown(target, '![remote](https://example.invalid/pixel)', () => {}, [], undefined, 'en-US', actions);
    check('ordinary remote image links still do not fetch automatically', !target.querySelector('img'));
    return checks;
  } finally { root.remove(); }
}
