import MarkdownIt from 'markdown-it';
import createDOMPurify from 'dompurify';
import katex from 'katex';

const math = (source: string, displayMode: boolean): string => {
  try {
    return katex.renderToString(source, { displayMode, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20 });
  } catch {
    return `<code>${source.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))}</code>`;
  }
};

const md = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false });
// Images never initiate a network request while a response is being rendered.
md.renderer.rules.image = (tokens, index) => md.utils.escapeHtml(`[图片：${tokens[index].content || '未加载'}]`);
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

const purifiers = new WeakMap<object, ReturnType<typeof createDOMPurify>>();

/** Markdown and local KaTeX only. Every generated node is sanitized before insertion. */
export function renderMarkdown(target: HTMLElement, content: string, openURL: (url: string) => void): void {
  const win = target.ownerDocument.defaultView!;
  let purifier = purifiers.get(win);
  if (!purifier) {
    purifier = createDOMPurify(win as any);
    purifiers.set(win, purifier);
  }
  const fragment = purifier.sanitize(md.render(content), {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'object', 'embed', 'style', 'script', 'form', 'input', 'button'],
    FORBID_ATTR: ['src', 'srcset', 'xlink:href'],
    ALLOW_DATA_ATTR: false,
  }) as unknown as DocumentFragment;
  for (const anchor of Array.from(fragment.querySelectorAll('a'))) {
    const url = anchor.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(url)) anchor.removeAttribute('href');
    else {
      anchor.setAttribute('rel', 'noopener noreferrer');
      anchor.addEventListener('click', event => { event.preventDefault(); openURL(url); });
    }
  }
  target.replaceChildren(fragment);
}
