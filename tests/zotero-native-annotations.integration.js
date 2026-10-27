/** Run with a disposable, synthetic PDF containing the five fixture sentences.
 * Uses the installed annotation adapter with a fake model transport.
 * Creates its own document, restores the selected tab, and trashes that document.
 */
var AIReaderNativeAnnotationChecks = {
 async run(win, pdfPath) {
  const checks=[], check=(name,condition)=>{if(!condition)throw new Error('Native annotation check failed: '+name);checks.push(name);};
  const originalTab=win.Zotero_Tabs.selectedID;
  let paper, pdf, reader, plan, receipts, calls=0;
  const service=Zotero.AIReader.service, tools=Zotero.AIReader.host.annotations;
  try {
   paper=new Zotero.Item('document');paper.setField('title','AI Reader disposable annotation fixture');await paper.saveTx();
   pdf=await Zotero.Attachments.importFromFile({file:pdfPath,parentItemID:paper.id,contentType:'application/pdf',title:'Synthetic annotation fixture'});
   reader=await Zotero.Reader.open(pdf.id);await reader._initPromise;
   const view=reader._internalReader._primaryView;
   for(let n=0;n<100&&!view._iframeWindow?.PDFViewerApplication?.pdfDocument;n++)await new Promise(r=>win.setTimeout(r,100));
   const scope={libraryID:paper.libraryID,itemKey:paper.key,title:paper.getField('title')};
   const before=pdf.getAnnotations(false).length;
   const quote='The decoder and encoder share GPU resources.';
   const second='A second passage supports testing underline comments.';
   plan=await tools.plan({scope,instruction:'Mark the sharing mechanism and underline the final passage.',previousQuestions:[],language:'en-US',signal:new win.AbortController().signal,onNotice(){},endpoint:{id:'native-fixture',name:'Synthetic',baseURL:'https://invalid.example/v1',stream:true},model:{id:'native',name:'Synthetic',endpointId:'native-fixture',model:'synthetic'},key:'',transport:async request=>{
    calls++;check('model receives actual local PDF text',request.messages.at(-1).content.includes(quote)&&request.messages.at(-1).content.includes(second));
    request.onText(JSON.stringify({summary:'Synthetic annotation fixture.',annotations:[{page:1,quote,comment:'Synthetic highlight comment.',type:'highlight',color:'#ffd400'},{page:1,quote:second,comment:'Synthetic underline comment.',type:'underline',color:'#2ea8e5'}]}));return{};
   }});
   check('real PDF quotations are located uniquely',plan.items.length===2&&plan.items.every(i=>i.status==='ready'));
   await Zotero.Items.loadDataTypes([pdf],['childItems']);check('planning does not write annotations',pdf.getAnnotations(false).length===before&&calls===1);
   const control=await Zotero.Annotations.saveFromJSON(pdf,{key:Zotero.DataObjectUtilities.generateKey(),type:'highlight',text:'Synthetic control annotation',comment:'Existing control must survive',color:'#ff6666',pageLabel:'1',sortIndex:'00000|000000|00001',position:{pageIndex:0,rects:[[50,748,320,762]]},tags:[]});
   receipts=await tools.apply(plan,['0','1']);plan.receipts=receipts;
   const saved=await Promise.all(receipts.map(r=>Zotero.Items.getByLibraryAndKeyAsync(pdf.libraryID,r.itemKey)));
   await Zotero.Items.loadDataTypes(saved,['annotation','annotationDeferred','tags']);
   check('highlights and underlines use native annotation items',saved[0].annotationType==='highlight'&&saved[1].annotationType==='underline'&&saved.every(a=>a.parentID===pdf.id));
   check('annotation text and comments round trip',saved[0].annotationText===quote&&saved[1].annotationText===second&&saved[0].annotationComment==='Synthetic highlight comment.'&&saved[1].annotationComment==='Synthetic underline comment.');
   check('positions contain real PDF rectangles',saved.every(a=>{const p=JSON.parse(a.annotationPosition);return p.pageIndex===0&&p.rects.length&&p.rects.every(r=>r.length===4&&r[2]>r[0]&&r[3]>r[1]);}));
   const repeated=await tools.apply(plan,['0','1']);check('repeated save does not duplicate annotations',repeated.every((r,i)=>r.itemKey===receipts[i].itemKey)&&pdf.getAnnotations(false).length===before+3);
   await tools.locate(plan,'0');check('local passage navigation succeeds',true);
   const oldComment=saved[0].annotationComment;saved[0].annotationComment='Edited synthetic comment';await saved[0].saveTx();
   let blocked=false;try{await tools.undo(plan);}catch(e){blocked=!!e.englishMessage;}
   check('edited annotations block undo and preserve the batch',blocked&&saved.every(a=>!a.deleted)&&!control.deleted);
   saved[0].annotationComment=oldComment;await saved[0].saveTx();
   const count=await tools.undo(plan);check('undo trashes this batch only',count===2&&saved.every(a=>a.deleted)&&!control.deleted);
   check('the existing control annotation survives undo',pdf.getAnnotations(false).some(a=>a.id===control.id));
   return {passed:checks.length,checks};
  } finally {
   if(reader)reader.close();
   win.Zotero_Tabs.select(originalTab);
   if(paper){const scope={libraryID:paper.libraryID,itemKey:paper.key,title:paper.getField('title')};for(const c of service.listConversations(scope))service.deleteConversation(c.id);await service.flush();paper.deleted=true;await paper.saveTx();}
  }
 }
};
