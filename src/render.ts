import { isSVG, mountSVG, type MediaActions } from './media.ts';
import MarkdownIt from 'markdown-it';
import createDOMPurify from 'dompurify';
import katex from 'katex';
import type { PaperSource } from './types.ts';
import { tr, type UILanguage } from './i18n.ts';

const math = (source: string, displayMode: boolean): string => {
  try {
    return katex.renderToString(source, { displayMode, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20 });
  } catch {
    return `<code>${source.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))}</code>`;
  }
};

const md = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false });
// Images never initiate a network request while a response is being rendered.
md.renderer.rules.image = (tokens, index, _options, env) => {
  const language: UILanguage = env?.language === 'en-US' ? 'en-US' : 'zh-CN';
  return md.utils.escapeHtml(tr(language, `[图片：${tokens[index].content || '未加载'}]`, `[Image: ${tokens[index].content || 'not loaded'}]`));
};
md.inline.ruler.before('escape', 'reader_math', (state, silent) => {
  const start = state.pos;
  const delimiter = state.src.startsWith('\\(', start) ? '\\(' : state.src[start] === '$' && state.src[start + 1] !== '$' ? '$' : '';
  if (!delimiter) return false;
  const close = delimiter === '$' ? '$' : '\\)';
  let end = state.src.indexOf(close, start + delimiter.length);
  while (end !== -1 && state.src[end - 1] === '\\') end = state.src.indexOf(close, end + close.length);
  if (end === -1 || end === start + delimiter.length) return false;
  const source = state.src.slice(start + delimiter.length, end);
  if (source.includes('\n') || (delimiter === '$' && (/^\s|\s$/.test(source) || /\d/.test(state.src[end + 1] || '')))) return false;
  if (!silent) {
    const token = state.push('reader_math', 'span', 0);
    token.content = source;
  }
  state.pos = end + close.length;
  return true;
});
md.renderer.rules.reader_math = (tokens, index) => math(tokens[index].content, false);
md.block.ruler.before('fence', 'reader_math_block', (state, start, end, silent) => {
  const first = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]).trim();
  const delimiter = first.startsWith('$$') ? '$$' : first.startsWith('\\[') ? '\\[' : '';
  if (!delimiter) return false;
  const close = delimiter === '$$' ? '$$' : '\\]';
  const after = first.slice(delimiter.length);
  let last = start;
  let content = '';
  if (after.endsWith(close)) content = after.slice(0, -close.length);
  else {
    const lines = [after];
    let found = false;
    for (let line = start + 1; line < end; line++) {
      const value = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
      if (value.trimEnd().endsWith(close)) {
        lines.push(value.trimEnd().slice(0, -close.length));
        last = line;
        found = true;
        break;
      }
      lines.push(value);
    }
    if (!found) return false;
    content = lines.join('\n');
  }
  if (silent) return true;
  const token = state.push('reader_math_block', 'div', 0);
  token.block = true;
  token.content = content;
  token.map = [start, last + 1];
  state.line = last + 1;
  return true;
});
md.renderer.rules.reader_math_block = (tokens, index) => `${math(tokens[index].content, true)}\n`;

const fence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  if (env?.graphics && isSVG(token.content)) {
    const id = env.graphics.push(token.content) - 1;
    return `<div class="zar-svg-placeholder">${id}</div>`;
  }
  return fence(tokens, index, options, env, renderer);
};
md.block.ruler.before('fence', 'reader_svg', (state, start, end, silent) => {
  const first = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
  if (!/^\s*<svg\b/.test(first)) return false;
  const lines: string[] = []; let length = 0;
  for (let line = start; line < end; line++) {
    const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]); lines.push(text); length += text.length + 1;
    if (length > 300000) return false;
    if (/<\/svg>\s*$/.test(text)) {
      if (silent) return true;
      const token = state.push('fence', 'code', 0); token.content = lines.join('\n'); token.info = 'svg'; token.block = true;
      state.line = line + 1; return true;
    }
  }
  return false;
});

const purifiers = new WeakMap<object, ReturnType<typeof createDOMPurify>>();

/** Markdown and local KaTeX only. Every generated node is sanitized before insertion. */
export function renderMarkdown(target: HTMLElement, content: string, openURL: (url: string) => void, sources: PaperSource[] = [], openSource?: (source: PaperSource, page?: number) => void, language: UILanguage = 'zh-CN', mediaActions?: MediaActions): void {
  const win = target.ownerDocument.defaultView!;
  let purifier = purifiers.get(win);
  if (!purifier) {
    purifier = createDOMPurify(win as any);
    purifiers.set(win, purifier);
  }
  const cited = content.replace(/\[(S\d+)(?:,\s*PDF)?\s+p\.?\s*(\d+)\]/gi, (original, id: string, page: string) => {
    const source = sources.find(entry => entry.id === id.toUpperCase() && entry.pages.includes(Number(page)));
    return source && openSource ? `[${source.id} · PDF ${page}](https://ai-reader.invalid/source/${source.id}/${page})` : original;
  });
  const graphics: string[] = [];
  const fragment = purifier.sanitize(md.render(cited, { language, graphics }), {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'object', 'embed', 'style', 'script', 'form', 'input', 'button'],
    FORBID_ATTR: ['src', 'srcset', 'xlink:href'],
    ALLOW_DATA_ATTR: false,
  }) as unknown as DocumentFragment;
  for (const anchor of Array.from(fragment.querySelectorAll('a'))) {
    const url = anchor.getAttribute('href') || '';
    const local = /^https:\/\/ai-reader\.invalid\/source\/(S\d+)\/(\d+)$/.exec(url);
    if (local) {
      const page = Number(local[2]);
      const source = sources.find(entry => entry.id === local[1] && entry.pages.includes(page));
      if (source && openSource) {
        anchor.setAttribute('href', '#');
        anchor.title = tr(language, `${source.title} · PDF 第 ${page} 页`, `${source.title} · PDF page ${page}`);
        anchor.addEventListener('click', event => { event.preventDefault(); openSource(source, page); });
      } else anchor.removeAttribute('href');
      continue;
    }
    if (!/^https?:\/\//i.test(url)) anchor.removeAttribute('href');
    else {
      anchor.setAttribute('rel', 'noopener noreferrer');
      anchor.addEventListener('click', event => { event.preventDefault(); openURL(url); });
    }
  }
  for (const placeholder of Array.from(fragment.querySelectorAll('.zar-svg-placeholder'))) {
    const index = Number(placeholder.textContent);
    if (Number.isInteger(index) && graphics[index]) placeholder.replaceWith(mountSVG(target.ownerDocument, graphics[index], language, mediaActions));
  }
  target.replaceChildren(fragment);
}
