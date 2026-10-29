import MarkdownIt from 'markdown-it';
import { annotationMarkdown } from './annotations.ts';
import { tr, type UILanguage } from './i18n.ts';
import type { Conversation, Message, PaperSource } from './types.ts';

export type ExportFormat = 'md' | 'txt' | 'pdf';
const parser = new MarkdownIt({ html: false, breaks: true });
const label = (text: string) => text.replace(/[\\`*_[\]<>]/g, '\\$&').replace(/\s+/g, ' ').trim();
export function sourceURL(source: PaperSource, page?: number): string {
  return `zotero://open-pdf/library/items/${encodeURIComponent(source.attachmentKey)}${page ? `?page=${page}` : ''}`;
}
export function exportFilename(chat: Conversation, format: ExportFormat): string {
  const title = (chat.title || chat.scope.title || 'Conversation').replace(/[\x00-\x1f<>:"/\\|?*]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 90) || 'Conversation';
  return `${title}-${new Date(chat.createdAt).toISOString().slice(0, 10)}.${format}`;
}
export function exportBody(message: Message): string {
  return (message.content + annotationMarkdown(message.annotationPlan)).replace(/https:\/\/ai-reader\.invalid\/source\/(S\d+)\/(\d+)/g, (url, id, page) => {
    const source = message.sources?.find(s => s.id === id);
    return source ? sourceURL(source, Number(page)) : url;
  });
}
export function exportStatus(message: Message, language: UILanguage): string {
  const states = { streaming: ['生成中，已导出当前内容', 'Generating; exported content so far'], stopped: ['已停止', 'Stopped'], interrupted: ['已中断', 'Interrupted'], error: ['出错', 'Error'], complete: ['', ''] };
  return tr(language, states[message.status][0], states[message.status][1]);
}
export function conversationMarkdown(chat: Conversation, language: UILanguage): string {
  const t = (zh: string, en: string) => tr(language, zh, en);
  const result = [`# ${label(chat.title)}`, '', `${t('文献', 'Paper')}: ${label(chat.scope.title)}`, '', `${t('创建时间', 'Created')}: ${new Date(chat.createdAt).toLocaleString(language)}`, ''];
  for (const m of chat.messages) {
    result.push(`## ${m.role === 'user' ? t('我', 'You') : 'AI'} · ${new Date(m.createdAt).toLocaleString(language)}`, '');
    if (m.modelName) result.push(`${t('模型', 'Model')}: ${label([m.endpointName, m.modelName].filter(Boolean).join(' / '))}`, '');
    if (m.quote) result.push(`> ${m.quote.text.replace(/\n/g, '\n> ')}`, '', ...(m.quote.pageLabel ? [`${t('引用页码', 'Quoted page')}: ${label(m.quote.pageLabel)}`, ''] : []));
    for (const image of m.inputImages || []) result.push(`![${label(image.name)}](${image.dataURL})`, '');
    result.push(exportBody(m), '');
    for (const image of m.images || []) result.push(`![${t('生成的图片', 'Generated image')}](${image.dataURL})`, '');
    if (m.contextNotice) result.push(`${t('原文读取', 'Paper context')}: ${m.contextNotice}`, '');
    if (m.sources?.length) {
      result.push(`### ${t('本轮来源', 'Sources for this response')}`, '');
      for (const source of m.sources) result.push(`- ${source.id}: [${label(source.title)}](${sourceURL(source)}) — PDF ${source.pages.join(', ')}${source.truncated ? t('（节选）', ' (excerpts)') : ''}`);
      result.push('');
    }
    if (m.status !== 'complete') result.push(`[${exportStatus(m, language)}]`, '');
    if (m.error) result.push(`${t('错误', 'Error')}: ${m.error}`, '');
    result.push('---', '');
  }
  return result.join('\n');
}
/** Convert parsed Markdown to plain text without dropping code, table cells or link destinations. */
export function plainMarkdown(markdown: string): string {
  const walk = (tokens: any[]): string => tokens.map(token => {
    if (token.type === 'inline') return walk(token.children || []);
    if (token.type === 'image') return `[Image: ${token.content || 'image'}]`;
    if (token.type === 'link_open') return '';
    if (token.type === 'link_close') {
      const index = tokens.indexOf(token);
      for (let i = index - 1; i >= 0; i--) if (tokens[i].type === 'link_open') return ` (${tokens[i].attrGet('href')})`;
      return '';
    }
    if (['softbreak', 'hardbreak'].includes(token.type)) return '\n';
    if (token.type === 'list_item_open') return '• ';
    if (token.type === 'th_close' || token.type === 'td_close') return '\t';
    if (token.type.endsWith('_close') && token.block) return '\n';
    if (token.type === 'hr') return '\n────────────────────\n';
    if (token.type === 'fence' || token.type === 'code_block') return token.content + '\n';
    return token.nesting ? '' : token.content || '';
  }).join('');
  return walk(parser.parse(markdown, {})).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
export function conversationText(chat: Conversation, language: UILanguage): string {
  return plainMarkdown(conversationMarkdown(chat, language));
}
