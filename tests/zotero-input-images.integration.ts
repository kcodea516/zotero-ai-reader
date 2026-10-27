import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import { mountRaster } from '../src/media.ts';
import type { ChatRequest, Config, Host } from '../src/types.ts';
import type { NativeButton, NativeEditable } from '../src/controls.ts';

/** Memory-only file/paste/drop and vision requests; no actual clipboard, file picker or provider. */
export async function runInputImagesChecks(win: Window): Promise<string[]> {
 const doc=win.document,realm=win as Window & typeof globalThis,checks:string[]=[];
 const check=(name:string,value:unknown)=>{if(!value)throw new Error(name);checks.push(name);};
 const pause=()=>new Promise(r=>win.setTimeout(r,140));
 const wait=async(fn:()=>boolean)=>{for(let n=0;n<100&&!fn();n++)await new Promise(r=>win.setTimeout(r,40));check('pending UI action completes',fn());};
 const create=(tag:string)=>doc.createElementNS('http://www.w3.org/1999/xhtml',tag) as HTMLElement;
 const canvas=create('canvas') as HTMLCanvasElement;canvas.width=160;canvas.height=100;canvas.getContext('2d')!.fillRect(0,0,160,100);const dataURL=canvas.toDataURL('image/png');
 const image={id:'input-picker',name:'screenshot.png',dataURL};const requests:ChatRequest[]=[];
 const service=new ChatService({async load(){return null;},async save(){}},{async get(){return 'synthetic';},async set(){return true;},async delete(){}},async request=>{requests.push(request);request.onText('Image explanation.');return {};});
 const config:Config={version:1,language:'en-US',endpoints:[{id:'e',name:'Example',baseURL:'https://invalid.example/v1',stream:true}],models:[{id:'m',endpointId:'e',name:'Vision',model:'vision'}],defaultModelId:'m',systemPrompt:'Fixture'};
 let selections=0;const host:Host={service,secretStore:{async get(){return '';},async set(){return true;},async delete(){}},rootURI:'',scopeForItem(){return null;},async pickImages(){selections++;return [image];},copy(){},async copyImage(){},async saveImage(){return true;},openSettings(){},openURL(){}};
 const overlay=create('div');overlay.style.cssText='position:fixed;right:12px;top:12px;width:304px;height:85vh;background:Canvas;color:CanvasText;z-index:2147483646;font-size:14px;';
 const before=doc.activeElement as HTMLElement|null;let panel:ReturnType<typeof mountSidebar>|undefined;
 try{
  await service.init();await service.saveConfig(config);doc.documentElement.append(overlay);const scope={libraryID:1,itemKey:'INPUT001',title:'Image input fixture'};panel=mountSidebar(overlay,scope,host);await pause();const c=service.forScope(scope);
  const attach=overlay.querySelector<HTMLButtonElement>('.zar-attach-image')!;check('attach icon is labelled and visible',attach?.getAttribute('aria-label')==='Attach images'&&!attach.hidden);attach.click();
  await wait(()=>!!overlay.querySelector('.zar-draft-images .zar-input-image'));check('file selection only attaches locally',selections===1&&requests.length===0&&c.draftImages?.length===1);
  const frame=overlay.querySelector<HTMLElement>('.zar-input-frame')!;check('thumbnails precede the text field inside the composer',frame.firstElementChild?.classList.contains('zar-draft-images'));
  const remove=overlay.querySelector<HTMLButtonElement>('.zar-input-image-remove')!;remove.click();await wait(()=>!c.draftImages?.length);check('removal keeps draft text',c.draft==='');
  const bytes=Uint8Array.from(atob(dataURL.split(',')[1]),char=>char.charCodeAt(0));const file=new realm.File([bytes],'pasted.png',{type:'image/png'});
  const paste=new realm.Event('paste',{bubbles:true,composed:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{files:[file]}});frame.dispatchEvent(paste);
  await wait(()=>c.draftImages?.length===1);check('pasted screenshot becomes an attachment and prevents raw pasting',paste.defaultPrevented&&c.draftImages?.[0].name==='pasted.png');await pause();
  const send=Array.from(overlay.querySelectorAll<NativeButton>('button')).find(b=>b.getAttribute('label')==='Send')!;check('image-only message can be sent',!send.disabled);send.doCommand();
  await wait(()=>requests.length===1&&!service.isBusy(c.id));await pause();check('vision request contains attached image bytes',requests[0].messages.at(-1)?.images?.[0].dataURL===dataURL);
  check('sent image is above the user text and removed from draft',!!overlay.querySelector('.zar-message-user .zar-input-images')&&!c.draftImages?.length);
  const thumb=overlay.querySelector<HTMLImageElement>('.zar-message-user .zar-input-image img')!;await wait(()=>thumb.complete&&thumb.naturalWidth>0);thumb.closest<HTMLButtonElement>('button')!.click();check('sent input thumbnail opens image viewer',!!doc.querySelector('.zar-image-viewer'));doc.querySelector<HTMLButtonElement>('.zar-image-viewer [aria-label="Close preview"]')!.click();
  const drop=new realm.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{files:[file]}});frame.dispatchEvent(drop);await wait(()=>c.draftImages?.length===1);check('image drag and drop attaches locally',drop.defaultPrevented&&requests.length===1);
  panel.updateScope({libraryID:1,itemKey:'INPUT002',title:'Other paper'});await pause();check('new paper does not inherit attachments',!overlay.querySelector('.zar-draft-images .zar-input-image'));
  panel.updateScope(scope);await pause();check('returning to paper restores attachment draft',!!overlay.querySelector('.zar-draft-images .zar-input-image'));
  const sample=create('div');sample.className='zar-root';sample.append(mountRaster(doc,dataURL,'en-US',host));overlay.append(sample);const tools=sample.querySelector<HTMLElement>('.zar-image-tools')!;
  const opacity=Number(win.getComputedStyle(tools).opacity);check('image toolbar is translucent until interaction',opacity>0&&opacity<1);
  check('upper-right copy control is smaller',sample.querySelector<HTMLElement>('.zar-image-tools .zar-image-button')!.getBoundingClientRect().width<=24);
  return checks;
 }finally{panel?.destroy();overlay.remove();await service.shutdown();before?.focus?.({preventScroll:true});}
}
