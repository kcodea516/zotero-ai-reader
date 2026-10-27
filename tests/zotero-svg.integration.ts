import { mountSVG } from '../src/media.ts';

/** Run in Zotero with synthetic diagrams; no provider calls or library writes. */
export async function runSVGChecks(win: Window): Promise<string[]> {
  const doc=win.document, checks:string[]=[];
  const check=(name:string,ok:unknown)=>{if(!ok)throw new Error(name);checks.push(name);};
  const wait=async(fn:()=>boolean)=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>win.setTimeout(r,40));if(!fn())throw new Error('Timed out after: '+checks.join(', '));};
  const fixture=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240">
  <style>@keyframes slide{from{opacity:1}to{opacity:.2}}#css{animation:slide 2s linear infinite}</style>
  <rect width="600" height="240" fill="#eaf3ff"/>
  <circle id="smil" cy="60" r="15"><animate attributeName="cx" from="30" to="500" dur="2s" repeatCount="indefinite"/></circle>
  <circle id="css" cx="60" cy="110" r="15" fill="green"/>
  <text id="click" x="30" y="170" onclick="this.textContent='Clicked';this.setAttribute('data-clicked','yes')">Click me</text>
  <text id="counter" x="30" y="210">0</text>
  <script><![CDATA[
    let count=0;setInterval(()=>document.getElementById('counter').textContent=String(++count),40);
    function step(t){document.getElementById('counter').setAttribute('data-raf',String(t));requestAnimationFrame(step)}requestAnimationFrame(step);
    const report={};try{report.parent=parent.document.title}catch(e){report.parent='blocked'}
    try{report.chrome=!!Components.classes}catch(e){report.chrome=false}
    report.zotero=typeof Zotero;report.services=typeof Services;
    try{localStorage.setItem('probe','x');report.storage='allowed'}catch(e){report.storage='blocked'}
    fetch('http://127.0.0.1:18674/no-network').then(()=>document.documentElement.setAttribute('data-fetch','allowed')).catch(()=>document.documentElement.setAttribute('data-fetch','blocked'));
    document.addEventListener('securitypolicyviolation',e=>{document.documentElement.setAttribute('data-csp',e.violatedDirective)});

    document.documentElement.setAttribute('data-probe',JSON.stringify(report));
  ]]></script></svg>`;
  const root=doc.createElementNS('http://www.w3.org/1999/xhtml','div');doc.documentElement.append(root);
  const button=(name:string)=>Array.from(doc.querySelectorAll<HTMLButtonElement>('.zar-image-viewer button')).find(b=>b.getAttribute('aria-label')===name)!;
  const frame=()=>doc.querySelector<HTMLIFrameElement>('.zar-svg-frame')!;
  const inner=()=>frame().contentDocument!;
  try {
    let saved='',copied='';
    root.append(mountSVG(doc,fixture,'en-US',{copy:s=>{copied=s;},saveImage:async data=>{saved=data;return true;}}));
    (root.querySelector('[aria-label="Save SVG"]') as HTMLButtonElement).click();await wait(()=>!!saved);
    (root.querySelector('[aria-label="Copy SVG"]') as HTMLButtonElement).click();await wait(()=>!!copied);
    check('save and copy retain original animation and scripts',decodeURIComponent(saved.split(',').slice(1).join(','))===fixture&&copied===fixture);

    const image=root.querySelector('img')!;await wait(()=>image.naturalWidth>0);image.click();
    await wait(()=>inner()?.documentElement.getAttribute('data-zar-ready')==='true'&&!button('Pause').disabled);
    check('opaque sandbox is enabled',frame().getAttribute('sandbox')==='allow-scripts'&&(inner() as any).nodePrincipal.isNullPrincipal);
    const probe=JSON.parse(inner().documentElement.getAttribute('data-probe')!);
    check('SVG cannot read Zotero window or privileged APIs',probe.parent==='blocked'&&!probe.chrome&&probe.zotero==='undefined'&&probe.services==='undefined');
    await wait(()=>inner().documentElement.getAttribute('data-fetch')==='blocked');
    check('CSP blocks network and sandbox blocks storage',inner().documentElement.getAttribute('data-csp')==='connect-src'&&probe.storage==='blocked');
    await new Promise(r=>win.setTimeout(r,160));
    check('SMIL animation advances',inner().querySelector('svg')!.getCurrentTime()>.05);
    check('script timer and animation-frame callbacks execute',Number(inner().querySelector('#counter')!.textContent)>0&&Number(inner().querySelector('#counter')!.getAttribute('data-raf'))>0);
    inner().querySelector('#click')!.dispatchEvent(new (win as any).MouseEvent('click',{bubbles:true}));
    check('SVG inline click handler works',inner().querySelector('#click')!.getAttribute('data-clicked')==='yes');
    button('Pause').click();await wait(()=>!!button('Play'));
    const before={time:inner().querySelector('svg')!.getCurrentTime(),count:inner().querySelector('#counter')!.textContent,raf:inner().querySelector('#counter')!.getAttribute('data-raf')};
    await new Promise(r=>win.setTimeout(r,200));
    check('pause freezes SMIL',Math.abs(inner().querySelector('svg')!.getCurrentTime()-before.time)<.02);
    check('pause freezes timers and RAF',inner().querySelector('#counter')!.textContent===before.count&&inner().querySelector('#counter')!.getAttribute('data-raf')===before.raf);
    check('pause freezes CSS animations',inner().getAnimations().every(a=>a.playState==='paused'));
    const slider=doc.querySelector<HTMLInputElement>('.zar-svg-controls input')!;slider.value='1.5';slider.dispatchEvent(new (win as any).Event('input'));
    await new Promise(r=>win.setTimeout(r,80));
    check('timeline seeks SMIL while paused',Math.abs(inner().querySelector('svg')!.getCurrentTime()-1.5)<.02);
    button('Play').click();await wait(()=>!!button('Pause'));
    await new Promise(r=>win.setTimeout(r,160));check('play resumes timers',Number(inner().querySelector('#counter')!.textContent)>Number(before.count));
    button('Restart').click();await wait(()=>inner()?.documentElement.getAttribute('data-zar-ready')==='true');
    check('restart recreates script state',!inner().querySelector('#click')!.hasAttribute('data-clicked'));
    button('Zoom in').click();check('zoom sizes interactive frame',parseFloat(frame().style.width)>0);
    button('Close preview').click();check('close removes the execution frame',!doc.querySelector('.zar-svg-frame'));
    return checks;
  }finally{button('Close preview')?.click();root.remove();}
}
