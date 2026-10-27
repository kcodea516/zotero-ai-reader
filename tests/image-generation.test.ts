import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImage, imageEndpoint, requestsImage } from '../src/image-generation.ts';
import { isRasterDataURL, imageDataURL, rasterMime } from '../src/image-data.ts';
import { ChatService } from '../src/core.ts';
import type { ImageRequest } from '../src/image-generation.ts';
import type { Config, StoreState } from '../src/types.ts';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=';
const dataURL='data:image/png;base64,'+png;
const endpoint={id:'e',name:'GPT gateway',baseURL:'https://api.example/custom/v1/chat/completions',stream:true,imageModel:'custom-image'};
const config: Config={version:1,endpoints:[endpoint],models:[{id:'m',endpointId:'e',name:'Chat model',model:'chat-model'}],defaultModelId:'m',systemPrompt:'Test'};
function request(): ImageRequest {return {endpoint,key:'secret-never-log',prompt:'Draw a PNG diagram',signal:new AbortController().signal};}
async function withFetch(mock: typeof fetch, run:()=>Promise<void>){const prior=globalThis.fetch;globalThis.fetch=mock;try{await run();}finally{globalThis.fetch=prior;}}
test('image intent is explicit and preserves SVG, negation, quoted evidence and ordinary questions',()=>{
 for(const s of ['帮我生成一张图片','画一张调度流程图','生成一张 JPG 示意图','Please generate an image of a GPU','Create a diagram of the encoder','帮我绘制图片'])assert.equal(requestsImage(s),true,s);
 for(const s of ['We generate an image for each request.','文中说“帮我生成一张图片”是什么意思','解释这张图片','如何生成图片','不要生成图片，只解释','用 SVG 画一个图','Generate an SVG diagram','> 帮我生成一张图片\n解释这段','```text\nGenerate an image\n```'])assert.equal(requestsImage(s),false,s);
});
test('image endpoint preserves the selected provider and raster data rejects active/nonimage formats',()=>{
 assert.equal(imageEndpoint(endpoint.baseURL),'https://api.example/custom/v1/images/generations');
 assert.equal(imageEndpoint('https://api.example'),'https://api.example/v1/images/generations');
 assert.equal(isRasterDataURL(dataURL),true);assert.equal(rasterMime(Uint8Array.of(255,216,255)), 'image/jpeg');
 for(const s of ['data:image/svg+xml;base64,PHN2Zz4=',dataURL.replace('image/png','image/jpeg'),'file:///etc/passwd','https://example.com/a.png','data:image/png;base64,AAAA'])assert.equal(isRasterDataURL(s),false);
});
test('image generation sends existing provider credentials once and accepts real encoded image bytes',async()=>{
 let calls=0;
 await withFetch(async(url,options)=>{calls++;assert.equal(url,imageEndpoint(endpoint.baseURL));assert.equal((options?.headers as any).Authorization,'Bearer secret-never-log');assert.equal(options?.credentials,'omit');assert.equal(options?.redirect,'error');const body=JSON.parse(String(options?.body));assert.equal(body.model,'custom-image');assert.equal(body.output_format,'png');assert.equal(body.n,1);return Response.json({data:[{b64_json:png}]});},async()=>{
  const images=await generateImage(request());assert.equal(images.length,1);assert.equal(images[0].dataURL,dataURL);
 });assert.equal(calls,1);
});
test('provider image URLs never receive the bearer key or cookies and private destinations are blocked',async()=>{
 let calls=0;
 await withFetch(async(url,options)=>{calls++;if(calls===1)return Response.json({data:[{url:'https://cdn.example/picture.png'}]});assert.equal(url,'https://cdn.example/picture.png');assert.equal(options?.headers,undefined);assert.equal(options?.credentials,'omit');return new Response(Uint8Array.from(atob(png),c=>c.charCodeAt(0)));},async()=>{assert.equal((await generateImage(request()))[0].dataURL,dataURL);});
 for(const url of ['http://localhost/a','https://127.0.0.1/a','https://user:secret@cdn.example/a','file:///tmp/a']){
  let requests=0;await withFetch(async()=>{requests++;return Response.json({data:[{url}]});},async()=>{await assert.rejects(generateImage(request()),error=>!String(error).includes(url));});assert.equal(requests,1);
 }
});
test('image API errors, malformed bytes and aborts do not leak server bodies or retry',async()=>{
 for(const status of [401,404,429,500]){let calls=0;await withFetch(async()=>{calls++;return new Response('secret-never-log',{status});},async()=>{await assert.rejects(generateImage(request()),error=>String(error).includes(String(status))&&!String(error).includes('secret-never-log'));});assert.equal(calls,1);}
 await withFetch(async()=>Response.json({data:[{b64_json:btoa('<svg onload="evil"/>')}]}),async()=>{await assert.rejects(generateImage(request()));});
 const controller=new AbortController();controller.abort();await withFetch(async(_url,options)=>{assert.equal(options?.signal?.aborted,true);throw new Error('secret-never-log');},async()=>{await assert.rejects(generateImage({...request(),signal:controller.signal}),/停止/);});
});
test('normal chat image commands persist local images, reuse endpoint keys and resume ordinary conversation',async()=>{
 let saved: StoreState|null=null, imageCalls=0, chats=0;const seen:string[]=[];
 const repo={async load(){return saved?structuredClone(saved):null;},async save(value:StoreState){saved=structuredClone(value);}};
 const secrets={async get(id:string){seen.push(id);return 'existing-secret';},async set(){return true;},async delete(){}};
 const chat=new ChatService(repo,secrets,async r=>{chats++;assert.ok(!JSON.stringify(r.messages).includes(png));r.onText('Follow-up');return {};},undefined,undefined,async r=>{imageCalls++;assert.equal(r.key,'existing-secret');assert.equal(r.endpoint.id,'e');return [{id:'image-1',dataURL}];});
 await chat.init();await chat.saveConfig(config);const c=chat.forScope({libraryID:1,itemKey:'PAPER1',title:'Test'});
 try{chat.setDraft(c.id,'帮我生成一张 PNG 图片');await chat.send(c.id);assert.equal(c.messages[0].intent,'image');assert.equal(c.messages[1].images?.length,1);assert.equal(c.messages[1].modelName,'custom-image');assert.equal(chats,0);
 chat.setDraft(c.id,'继续解释论文');await chat.send(c.id);assert.equal(chats,1);assert.equal(imageCalls,1);await chat.flush();assert.ok(!JSON.stringify(saved).includes('existing-secret'));}
 finally{await chat.shutdown();}
 const reopened=new ChatService(repo,secrets);await reopened.init();assert.equal(reopened.getConversation(c.id)?.messages[1].images?.[0].dataURL,dataURL);await reopened.shutdown();assert.deepEqual(seen,['e','e']);
});
test('stopping generation discards late images and retry preserves the requested action',async()=>{
 let release!:()=>void,calls=0;const chat=new ChatService({async load(){return null;},async save(){}},{async get(){return 'k';},async set(){return true;},async delete(){}},undefined,undefined,undefined,async()=>{calls++;if(calls===1)await new Promise<void>(r=>{release=r;});return [{id:'image',dataURL}];});
 await chat.init();await chat.saveConfig(config);try{const c=chat.forScope({libraryID:1,itemKey:'P',title:'P'});chat.setDraft(c.id,'生成一张图片');const running=chat.send(c.id);while(!release)await new Promise(r=>setTimeout(r,1));chat.stop(c.id);await running;release();await new Promise(r=>setTimeout(r,0));assert.equal(c.messages[1].images,undefined);assert.equal(c.messages[1].status,'stopped');await chat.retry(c.id);assert.equal(chat.getConversation(c.id)?.messages[1].images?.length,1);assert.equal(c.messages.length,2);assert.equal(calls,2);}finally{await chat.shutdown();}
});


test('failed image requests clear generating notices and preserve safe retry state',async()=>{
 const chat=new ChatService({async load(){return null;},async save(){}},{async get(){return 'k';},async set(){return true;},async delete(){}},undefined,undefined,undefined,async()=>{throw new Error('secret-service-body');});
 await chat.init();await chat.saveConfig(config);try{const c=chat.forScope({libraryID:1,itemKey:'P',title:'P'});chat.setDraft(c.id,'Generate an image of a GPU');await chat.send(c.id);assert.equal(c.messages[1].status,'error');assert.equal(c.messages[1].contextNotice,undefined);assert.equal(c.messages[1].images,undefined);assert.ok(!c.messages[1].error?.includes('secret-service-body'));assert.equal(c.messages[0].intent,'image');}finally{await chat.shutdown();}
});
