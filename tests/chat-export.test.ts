import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationMarkdown, conversationText, exportFilename } from '../src/chat-export.ts';
import type { Conversation } from '../src/types.ts';
const chat: Conversation = { id:'export',scope:{libraryID:1,itemKey:'ABCDEFGH',title:'论文 <Title>'},title:'A / B: 对话',modelId:'test',createdAt:1700000000000,updatedAt:1700000000000,draft:'DO NOT EXPORT DRAFT',messages:[
  {id:'u',role:'user',createdAt:1700000000000,requestId:'r',status:'complete',content:'**解释**\n\n```ts\nconst x = 1;\n```',quote:{text:'quoted\npassage',pageLabel:'7'},inputImages:[{id:'i',name:'figure.png',dataURL:'data:image/png;base64,AA=='}]},
  {id:'a',role:'assistant',createdAt:1700000000001,requestId:'r',status:'stopped',content:'| Stage | Cost |\n|---|---|\n| Encode | 40 ms |\n\n[Reference](https://ai-reader.invalid/source/S1/2)',sources:[{id:'S1',title:'Source A',libraryID:1,itemKey:'ABCDEFGH',attachmentKey:'PDFKEY12',pages:[2,3],totalPages:5,truncated:true}],contextNotice:'Excerpts only',modelName:'Test model'},
] };
test('Markdown exports all messages, context and images without drafts',()=>{const md=conversationMarkdown(chat,'en-US');assert.ok(md.includes('data:image/png'));assert.ok(md.includes('quoted\n> passage'));assert.ok(md.includes('[Stopped]'));assert.ok(md.includes('PDF 2, 3'));assert.ok(md.includes('zotero://open-pdf/library/items/PDFKEY12?page=2'));assert.ok(!md.includes('DO NOT EXPORT'));});
test('plain text preserves code, table text and links without image base64',()=>{const txt=conversationText(chat,'en-US');assert.ok(txt.includes('const x = 1;'));assert.ok(txt.includes('Encode\t40 ms'));assert.ok(txt.includes('[Image: figure.png]'));assert.ok(!txt.includes('data:image'));assert.ok(!txt.includes('**解释**'));assert.ok(txt.includes('zotero://open-pdf'));});
test('export names cannot contain path separators',()=>{assert.match(exportFilename(chat,'pdf'),/^A - B- 对话-\d{4}-\d{2}-\d{2}\.pdf$/);});
test('export labels follow the UI language and include streaming state',()=>{const clone=structuredClone(chat);clone.messages[1].status='streaming';assert.ok(conversationMarkdown(clone,'zh-CN').includes('生成中，已导出当前内容'));assert.ok(conversationMarkdown(clone,'en-US').includes('Generating; exported content so far'));assert.equal(chat.messages[1].status,'stopped');});
