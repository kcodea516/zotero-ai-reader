import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import type { NativeButton } from '../src/controls.ts';
import type { Host } from '../src/types.ts';
import { conversationHTML, printConversationPDF } from '../src/chat-export-pdf.ts';
import { conversationMarkdown, conversationText } from '../src/chat-export.ts';
import type { Conversation } from '../src/types.ts';
export async function runExportChecks(win: Window, output: string): Promise<string[]> {
  const checks: string[] = [];
  const check = (name: string, value: unknown) => { if (!value) throw new Error(name); checks.push(name); };
  const browserCount = win.document.querySelectorAll('browser').length;
  const chat: Conversation = { id:'fixture',scope:{libraryID:1,itemKey:'TESTKEY1',title:'中文论文 / Export fixture'},title:'Conversation export / 对话导出',modelId:'mock',createdAt:1700000000000,updatedAt:1700000000000,draft:'UNSENT_DRAFT',messages:[] };
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 150"><rect width="600" height="150" fill="#eaf3ff"/><text x="30" y="80" font-size="28">Encoder → LLM / 视觉编码</text><script>throw new Error("UNSAFE")</script></svg>';
  for(let i=0;i<12;i++) chat.messages.push({id:String(i),role:i%2?'assistant':'user',createdAt:1700000000000+i*1000,requestId:'r'+i,status:i===11?'stopped':'complete',content:`第 ${i+1} 条消息：中文导出测试。\n\n| 阶段 | 时间 |\n|---|---|\n| Encode | 40 ms |\n| Decode | 8 ms |\n\n公式：$x^2 + y^2 = z^2$\n\n\`\`\`js\nconst greeting = '你好';\n\`\`\`\n\n${i===1?'\`\`\`svg\n'+svg+'\n\`\`\`':'A paragraph with **bold text** and [a link](https://example.org).'}\n\n<script>BAD_SCRIPT</script>`,quote:i===0?{text:'Quoted paper text / 引用原文',pageLabel:'2'}:undefined});
  const canvas=win.document.createElementNS('http://www.w3.org/1999/xhtml','canvas') as HTMLCanvasElement;
  canvas.width=240; canvas.height=80; const context=canvas.getContext('2d')!;
  context.fillStyle='#eaf3ff'; context.fillRect(0,0,240,80); context.fillStyle='#18202b'; context.font='22px sans-serif'; context.fillText('Input image',20,45);
  chat.messages[0].inputImages=[{id:'input',name:'figure.png',dataURL:canvas.toDataURL('image/png')}];
  chat.messages[1].images=[{id:'output',dataURL:canvas.toDataURL('image/jpeg')}];
  const html=conversationHTML(win.document,chat,'en-US');
  check('HTML keeps every message and excludes draft',html.includes('第 12 条消息')&&!html.includes('UNSENT_DRAFT'));
  check('HTML renders tables and math',html.includes('<table')&&html.includes('<math'));
  check('SVG is a static image, with no script node or image actions',html.includes('data:image/svg+xml')&&!html.includes('<script>')&&!html.includes('zar-image-tools'));
  check('input and output raster images are embedded',html.includes('data:image/png;base64,')&&html.includes('data:image/jpeg;base64,'));
  check('math appears once without raw TeX',!html.includes('x^2 + y^2 = z^2'));
  check('Markdown preserves the original SVG code',conversationMarkdown(chat,'en-US').includes(svg));
  check('TXT preserves table and code text',conversationText(chat,'en-US').includes('40 ms'));
  await printConversationPDF(win,html,output);
  check('print completed and its browser was removed',win.document.querySelectorAll('browser').length===browserCount);
  checks.push(...await runExportMenuChecks(win));
  return checks;
}

async function runExportMenuChecks(win: Window): Promise<string[]> {
  const checks:string[]=[];
  const check=(name:string,value:unknown)=>{if(!value)throw new Error(name);checks.push(name);};
  const service=new ChatService({async load(){return null;},async save(){}},{async get(){return '';},async set(){return true;},async delete(){}},async()=>({}));
  await service.init();
  const scope={libraryID:1,itemKey:'EXPTTEST',title:'Export menu fixture'};
  const chat=service.forScope(scope);
  chat.messages.push({id:'one',role:'user',content:'Full original message',createdAt:Date.now(),requestId:'test',status:'complete'});
  let snapshot:Conversation|undefined, selected='';
  let finish:(value:boolean)=>void=()=>{};
  const host:Host={service,secretStore:{async get(){return '';},async set(){return true;},async delete(){}},rootURI:'',openSettings(){},scopeForItem(){return null;},copy(){},openURL(){},async exportConversation(value,format){snapshot=value;selected=format;return new Promise<boolean>(resolve=>{finish=resolve;});}};
  const root=win.document.createElementNS('http://www.w3.org/1999/xhtml','div') as HTMLElement;
  root.style.cssText='position:fixed;top:20px;right:20px;width:304px;height:500px;background:Canvas;z-index:2147483646';win.document.documentElement.append(root);
  const focus=win.document.activeElement as HTMLElement|null;
  const panel=mountSidebar(root,scope,host);
  const tick=()=>new Promise(resolve=>win.setTimeout(resolve,100));
  try{
    await tick();
    const menu=root.querySelector<NativeButton>('.zar-export-menu')!;
    check('reading and export actions share the labeled tool group',menu.closest('[role=group]')?.getAttribute('aria-label')==='Tools' && menu.parentElement?.querySelectorAll('input[type=checkbox]').length===2);
    check('export uses a native popup without a blur-dismiss wrapper',menu.namespaceURI?.includes('keymaster') && menu.getAttribute('type')==='menu' && !menu.closest('details'));
    const buttons=Array.from(menu.querySelectorAll<NativeButton>('menuitem'));
    check('all three formats are available',buttons.length===3&&buttons.map(b=>b.getAttribute('label')).join().includes('PDF (.pdf)'));
    for(const format of ['md','txt','pdf']){
      const button=buttons.find(b=>b.getAttribute('label')?.includes('.'+format))!;
      menu.setAttribute('open', 'true'); await tick();
      button.doCommand(); await tick();
      check(format+' captures the current conversation',selected===format&&snapshot?.id===chat.id&&snapshot?.messages[0].content===chat.messages[0].content);
      check(format+' closes the menu and prevents duplicate export',menu.disabled&&buttons.every(b=>b.disabled));
      chat.messages[0].content+=' changed';
      check(format+' is a stable snapshot',snapshot!.messages[0].content!==chat.messages[0].content);
      finish(format!=='txt');await tick();
      check(format+' restores controls after save or cancel',buttons.every(b=>!b.disabled));
    }
  }finally{panel.destroy();root.remove();focus?.focus();}
  return checks;
}
