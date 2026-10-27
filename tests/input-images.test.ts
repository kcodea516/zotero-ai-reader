import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from '../src/core.ts';
import { chatCompletion } from '../src/transport.ts';
import { generateImage } from '../src/image-generation.ts';
import { checkInputImages, inputImagesFromFiles, validInputImage } from '../src/image-data.ts';
import type { Config, ChatRequest, StoreState } from '../src/types.ts';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=';
const image={id:'input-1',name:'screenshot.png',dataURL:'data:image/png;base64,'+png};
const config:Config={version:1,endpoints:[{id:'e',name:'GPT',baseURL:'https://api.example/v1',stream:false}],models:[{id:'m',endpointId:'e',name:'Vision model',model:'vision-model'}],defaultModelId:'m',systemPrompt:'Test'};
const secrets={async get(){return 'existing-key';},async set(){return true;},async delete(){}};
async function withFetch(mock:typeof fetch,run:()=>Promise<void>){const old=globalThis.fetch;globalThis.fetch=mock;try{await run();}finally{globalThis.fetch=old;}}
test('input images accept only bounded raster data and imports inspect bytes rather than extensions',async()=>{
 checkInputImages([image]);assert.equal(validInputImage(image),true);
 for(const value of [[...Array(5)].map((_,i)=>({...image,id:String(i)})),[{...image,dataURL:'https://example/a.png'}],[{...image,name:'x'.repeat(257)}]])assert.throws(()=>checkInputImages(value));
 const file=new File([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],'screenshot.png',{type:'image/png'});
 const imported=await inputImagesFromFiles([file]);assert.equal(imported[0].dataURL,image.dataURL);assert.equal(imported[0].name,'screenshot.png');
 await assert.rejects(inputImagesFromFiles([new File(['<svg onload="alert(1)"/>'],'fake.png',{type:'image/png'})]));
 await assert.rejects(inputImagesFromFiles(Array(5).fill(file)));
});
test('images remain with their draft across restart and move into immutable sent messages',async()=>{
 let saved:StoreState|null=null;const repo={async load(){return saved?structuredClone(saved):null;},async save(value:StoreState){saved=structuredClone(value);}};
 const first=new ChatService(repo,secrets);await first.init();await first.saveConfig(config);const c=first.forScope({libraryID:1,itemKey:'P',title:'Paper'});first.addDraftImages(c.id,[image]);await first.shutdown();
 const requests:ChatRequest[]=[];const next=new ChatService(repo,secrets,async r=>{requests.push(r);r.onText('Vision answer');return {};});await next.init();
 try{const current=next.getConversation(c.id)!;assert.equal(current.draftImages?.[0].dataURL,image.dataURL);next.setDraft(current.id,'Explain this image');await next.send(current.id);assert.equal(current.draftImages,undefined);assert.equal(current.messages[0].inputImages?.[0].dataURL,image.dataURL);assert.equal(requests[0].messages.at(-1)?.images?.[0].dataURL,image.dataURL);
 next.setDraft(current.id,'Continue');await next.send(current.id);assert.equal(requests[1].messages[1].images?.[0].dataURL,image.dataURL);assert.equal(requests[1].messages.at(-1)?.images,undefined);
 next.addDraftImages(current.id,[{...image,id:'later'}]);next.removeDraftImage(current.id,'later');assert.equal(current.messages[0].inputImages?.length,1);assert.equal(next.getConversation(current.id)?.draftImages?.length,0);
 }finally{await next.shutdown();}
});
test('image-only sends work and invalid additions preserve the prior draft atomically',async()=>{
 let request:ChatRequest|undefined;const chat=new ChatService({async load(){return null;},async save(){}},secrets,async r=>{request=r;r.onText('Described');return {};});await chat.init();await chat.saveConfig(config);
 try{const c=chat.forScope({libraryID:1,itemKey:'P',title:'P'});chat.addDraftImages(c.id,[image]);assert.throws(()=>chat.addDraftImages(c.id,Array(4).fill(image)));assert.equal(c.draftImages?.length,1);await chat.send(c.id);assert.equal(c.messages.length,2);assert.equal(request?.messages.at(-1)?.images?.length,1);assert.ok(request?.messages.at(-1)?.content.includes('attached'));}finally{await chat.shutdown();}
});
test('vision transport sends image_url content parts without private attachment metadata',async()=>{
 await withFetch(async(_url,options)=>{const body=JSON.parse(String(options?.body));assert.deepEqual(body.messages[0].content,[{type:'text',text:'Read this chart'},{type:'image_url',image_url:{url:image.dataURL}}]);assert.equal(JSON.stringify(body).includes('screenshot.png'),false);assert.equal(JSON.stringify(body).includes('input-1'),false);return Response.json({choices:[{message:{content:'Chart explanation'},finish_reason:'stop'}]});},async()=>{await chatCompletion({endpoint:config.endpoints[0],model:config.models[0],key:'k',messages:[{role:'user',content:'Read this chart',images:[image]}],signal:new AbortController().signal,onText(){}});});
});
test('reference image generation uses multipart edits on the same endpoint and saved key',async()=>{
 await withFetch(async(url,options)=>{assert.equal(url,'https://api.example/v1/images/edits');assert.equal((options?.headers as any).Authorization,'Bearer existing-key');assert.equal((options?.headers as any)['Content-Type'],undefined);const form=options?.body as FormData;assert.ok(form instanceof FormData);assert.equal(form.get('prompt'),'Generate a new PNG diagram');const file=form.get('image[]') as File;assert.equal(file.type,'image/png');assert.equal(file.name,'input-1.png');assert.equal(file.size,atob(png).length);assert.equal(form.get('output_format'),'png');return Response.json({data:[{b64_json:png}]});},async()=>{const result=await generateImage({endpoint:config.endpoints[0],key:'existing-key',prompt:'Generate a new PNG diagram',images:[image],signal:new AbortController().signal});assert.equal(result[0].dataURL,image.dataURL);});
});
test('failed multimodal turns retain attachments for retry',async()=>{
 let calls=0;const chat=new ChatService({async load(){return null;},async save(){}},secrets,async r=>{calls++;assert.equal(r.messages.at(-1)?.images?.length,1);if(calls===1)throw new Error('API failure');r.onText('Done');return {};});await chat.init();await chat.saveConfig(config);
 try{const c=chat.forScope({libraryID:1,itemKey:'P',title:'P'});chat.addDraftImages(c.id,[image]);chat.setDraft(c.id,'Read this image');await chat.send(c.id);assert.equal(c.messages[1].status,'error');await chat.retry(c.id);assert.equal(c.messages.length,2);assert.equal(c.messages[1].status,'complete');assert.equal(c.messages[0].inputImages?.length,1);}finally{await chat.shutdown();}
});
