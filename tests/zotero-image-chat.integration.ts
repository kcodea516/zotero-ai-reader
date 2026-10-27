import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import { mountSettings } from '../src/settings.ts';
import type { Host, Config } from '../src/types.ts';
import type { NativeButton, NativeEditable } from '../src/controls.ts';

/** Synthetic images, in-memory history, fake providers and export sinks. */
export async function runImageChatChecks(win: Window): Promise<string[]> {
 const doc=win.document, realm=win as Window & typeof globalThis, checks:string[]=[];
 const check=(name:string,value:unknown)=>{if(!value)throw new Error(name);checks.push(name);};
 const wait=async(fn:()=>boolean)=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>win.setTimeout(r,50));check('pending action completes',fn());};
 const create=(tag:string)=>doc.createElementNS('http://www.w3.org/1999/xhtml',tag) as HTMLElement;
 const canvas=create('canvas') as HTMLCanvasElement;canvas.width=480;canvas.height=240;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#dcecff';ctx.fillRect(0,0,480,240);ctx.fillStyle='#183d68';ctx.font='28px sans-serif';ctx.fillText('GPT image preview',70,130);
 const png=canvas.toDataURL('image/png'), jpg=canvas.toDataURL('image/jpeg');let generated=0,chats=0,copies=0;const saved:string[]=[];
 const service=new ChatService({async load(){return null;},async save(){}},{async get(){return 'synthetic';},async set(){return true;},async delete(){}},async r=>{chats++;r.onText('Ordinary chat.');return {};},undefined,undefined,async r=>{generated++;check('selected provider and model settings reach image generation',r.endpoint.id==='e'&&r.endpoint.imageModel==='image-model');return [{id:'generated-'+generated,dataURL:r.format==='jpeg'?jpg:png}];});
 const config:Config={version:1,language:'en-US',endpoints:[{id:'e',name:'Synthetic GPT',baseURL:'https://invalid.example/v1',stream:true,imageModel:'image-model'}],models:[{id:'m',endpointId:'e',name:'Chat model',model:'chat-model'}],defaultModelId:'m',systemPrompt:'Fixture'};
 const host:Host={service,secretStore:{async get(){return 'synthetic';},async set(){return true;},async delete(){}},rootURI:'',scopeForItem(){return null;},copy(){},async copyImage(data){check('copy icon produces PNG',data.startsWith('data:image/png;base64,'));copies++;},async saveImage(data,name){check('save carries actual image data',data.startsWith('data:image/'));saved.push(name);return true;},openSettings(){},openURL(){}};
 const overlay=create('div');overlay.style.cssText='position:fixed;top:12px;right:12px;width:304px;height:85vh;background:Canvas;color:CanvasText;z-index:2147483646;font-size:14px;';
 const scope={libraryID:1,itemKey:'IMAGE001',title:'Synthetic image reading'};let panel:ReturnType<typeof mountSidebar>|undefined,settingsClose:(()=>void)|undefined;
 const focus=doc.activeElement as HTMLElement|null;
 const send=()=>{const button=Array.from(overlay.querySelectorAll<NativeButton>('button')).find(b=>b.getAttribute('label')==='Send');if(!button)throw new Error('Missing Send');button.doCommand();};
 const action=(name:string)=>{const button=Array.from(overlay.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.getAttribute('aria-label')===name);if(!button)throw new Error('Missing '+name);return button;};
 try{
  await service.init();await service.saveConfig(config);(doc.documentElement).append(overlay);panel=mountSidebar(overlay,scope,host);await new Promise(r=>win.setTimeout(r,150));const c=service.forScope(scope);
  service.setDraft(c.id,'Generate a PNG image of GPU scheduling');await new Promise(r=>win.setTimeout(r,150));send();await wait(()=>!!overlay.querySelector('.zar-media-image'));
  const img=overlay.querySelector<HTMLImageElement>('.zar-media-image')!;await wait(()=>img.complete&&img.naturalWidth>0);
  check('chat command renders an actual PNG, without annotation mode',generated===1&&chats===0&&img.src===png);
  check('copy icon lives in the image upper-right toolbar',action('Copy image').closest('.zar-image-tools')&&win.getComputedStyle(action('Copy image').closest('.zar-image-tools')!).position==='absolute');
  check('image has no footer action row',!overlay.querySelector('.zar-media-actions'));
  img.focus();img.click();const viewer=doc.querySelector<HTMLElement>('.zar-image-viewer')!;
  check('click opens accessible full-window image viewer',viewer?.getAttribute('role')==='dialog'&&viewer.getAttribute('aria-modal')==='true');
  const viewerImage=viewer.querySelector<HTMLImageElement>('img')!;const width=parseFloat(viewerImage.style.width);viewer.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click();check('zoom increases rendered dimensions',parseFloat(viewerImage.style.width)>width);
  viewer.querySelector<HTMLButtonElement>('[aria-label="100%"]')!.click();check('100 percent displays intrinsic pixels',parseFloat(viewerImage.style.width)===480);
  doc.dispatchEvent(new realm.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check('Escape closes viewer and restores image focus',!doc.querySelector('.zar-image-viewer')&&doc.activeElement===img);
  action('Copy image').click();await wait(()=>copies===1);
  const menu=overlay.querySelector<HTMLDetailsElement>('.zar-image-menu')!;menu.open=true;action('Save JPG').click();await wait(()=>saved.length===1);check('save menu exports JPG and closes',saved[0].endsWith('.jpg')&&!menu.open);
  service.setDraft(c.id,'Generate a JPG image of a GPU');await new Promise(r=>win.setTimeout(r,150));send();await wait(()=>overlay.querySelectorAll('.zar-media-image').length===2);
  check('JPG generation and prior PNG remain in chat',c.messages[3].images?.[0].dataURL===jpg&&c.messages[1].images?.[0].dataURL===png);
  service.setDraft(c.id,'Explain the paper');await new Promise(r=>win.setTimeout(r,150));send();await wait(()=>chats===1);check('ordinary discussion resumes after image turns',generated===2);
  panel.destroy();panel=undefined;
  const settings=create('div');overlay.append(settings);settingsClose=mountSettings(settings,host);
  const field=settings.querySelector<HTMLInputElement>('.zar-image-model-input')!;check('existing endpoint exposes image model configuration',field?.value==='image-model');
  return checks;
 }finally{settingsClose?.();panel?.destroy();doc.querySelector<HTMLElement>('.zar-image-viewer [aria-label="Close preview"]')?.click();overlay.remove();await service.shutdown();focus?.focus?.({preventScroll:true});}
}
