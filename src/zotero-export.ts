import { conversationMarkdown, conversationText, exportFilename, type ExportFormat } from './chat-export.ts';
import { conversationHTML, printConversationPDF } from './chat-export-pdf.ts';
import { tr, type UILanguage } from './i18n.ts';
import type { Conversation } from './types.ts';

export async function saveConversation(chat: Conversation, format: ExportFormat, language: UILanguage, win: Window): Promise<boolean> {
  const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
  const picker = new FilePicker();
  picker.init(win, tr(language, '导出当前对话', 'Export current chat'), picker.modeSave);
  picker.appendFilter(format.toUpperCase(), `*.${format}`);
  picker.defaultString = exportFilename(chat, format); picker.defaultExtension = format;
  if (await picker.show() === picker.returnCancel) return false;
  // Stage the complete file next to the destination. A failed PDF print must not destroy an existing export.
  const target = picker.file;
  const temporary = `${target}.${Services.uuid.generateUUID().toString()}.tmp`;
  try {
    if (format === 'pdf') await printConversationPDF(win, conversationHTML(win.document, chat, language), temporary);
    else await IOUtils.writeUTF8(temporary, format === 'md' ? conversationMarkdown(chat, language) : conversationText(chat, language));
    await IOUtils.move(temporary, target, { noOverwrite: false });
    return true;
  } finally { await IOUtils.remove(temporary, { ignoreAbsent: true }); }
}
