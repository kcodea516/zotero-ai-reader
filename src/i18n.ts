import { ERROR_TRANSLATIONS } from './i18n-errors.ts';

export type UILanguage = 'zh-CN' | 'en-US';

/** Keep the existing Chinese interface for configurations saved before 1.3.0. */
export function getLanguage(config?: { language?: unknown }): UILanguage {
  return config?.language === 'en-US' ? 'en-US' : 'zh-CN';
}

export function tr(language: UILanguage, chinese: string, english: string): string {
  return language === 'en-US' ? english : chinese;
}

const NOTICES: readonly (readonly [string, string])[] = [
  ['操作失败，请重试。', 'The action failed. Please try again.'],
  ['已复制当前会话。', 'Current conversation copied.'],
  ['复制失败，请重试。', 'Copy failed. Please try again.'],
  ['正在读取当前文献原文…', 'Reading the current paper…'],
  ['正在判断是否需要其他文献…', 'Checking whether other papers are needed…'],
  ['正在查找其他文献…', 'Looking up other papers…'],
  ['文献原文读取已停止。', 'Paper reading stopped.'],
  ['未读取到文献原文；本轮回答不能核实论文中的具体表述。', 'No original paper text was read; this answer cannot verify specific statements in the paper.'],
  ['未读取到当前文献正文。', 'The current paper text could not be read.'],
  ['当前文献没有可提取的正文（可能是扫描件或尚未完成文字识别）。', 'The current paper has no extractable text (it may be scanned or not yet processed with OCR).'],
  ['部分文献仅提供了相关页摘录，未覆盖的内容不能视为已经阅读。', 'Some papers were supplied as excerpts from relevant pages; uncovered content has not been read.'],
  ['上次生成因 Zotero 退出而中断，可手动重试。', 'The previous response was interrupted when Zotero closed. You can retry it.'],
];

/** Translate only plugin-owned status/error text. Never pass model answers here. */
export function localizeError(error: unknown, language: UILanguage): string {
  const value = error && typeof error === 'object' ? error as { message?: unknown; englishMessage?: unknown } : undefined;
  if (language === 'en-US' && typeof value?.englishMessage === 'string') return value.englishMessage;
  let text = typeof value?.message === 'string' ? value.message : String(error ?? '');
  const pairs = [...ERROR_TRANSLATIONS, ...NOTICES].sort((a, b) =>
    (language === 'en-US' ? b[0].length - a[0].length : b[1].length - a[1].length));
  for (const [chinese, english] of pairs) {
    const from = language === 'en-US' ? chinese : english;
    const to = language === 'en-US' ? english : chinese;
    if (from) text = text.split(from).join(to);
  }
  if (language === 'en-US') {
    text = text.replace(/已读取 (\d+) 篇文献的原文片段。/g, 'Read source excerpts from $1 paper(s).')
      .replace(/关联文献“([^”]+)”没有可提取的正文。/g, 'The related paper “$1” has no extractable text.')
      .replace(/已按需联查 (\d+) 篇相关论文。/g, 'Consulted $1 related paper(s) on demand.');
  } else {
    text = text.replace(/Read source excerpts from (\d+) paper\(s\)\./g, '已读取 $1 篇文献的原文片段。')
      .replace(/(?:The related paper|Related paper) “([^”]+)” has no extractable text\./g, '关联文献“$1”没有可提取的正文。')
      .replace(/Read excerpts from (\d+) papers?\./g, '已读取 $1 篇文献的原文片段。')
      .replace(/Consulted (\d+) related (?:papers?|paper\(s\)) on demand\./g, '已按需联查 $1 篇相关论文。');
  }
  return text;
}
