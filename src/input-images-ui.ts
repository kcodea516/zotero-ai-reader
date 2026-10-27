import { openImageViewer } from './image-viewer.ts';
import { tr, type UILanguage } from './i18n.ts';
import type { InputImage } from './image-data.ts';
const XHTML='http://www.w3.org/1999/xhtml';
/** Compact attachments above the composer text and sent user text. */
export function inputImageThumbnails(doc: Document, images: InputImage[], language: UILanguage, remove?: (id:string)=>void): HTMLElement {
  const row=doc.createElementNS(XHTML,'div') as HTMLElement;row.className='zar-input-images';
  for(const image of images){
    const tile=doc.createElementNS(XHTML,'div') as HTMLElement;tile.className='zar-input-image';
    const button=doc.createElementNS(XHTML,'button') as HTMLButtonElement;button.type='button';button.className='zar-input-image-open';button.title=image.name;button.setAttribute('aria-label',tr(language,`放大图片：${image.name}`,`Open image: ${image.name}`));
    const img=doc.createElementNS(XHTML,'img') as HTMLImageElement;img.src=image.dataURL;img.alt=image.name;button.append(img);button.addEventListener('click',()=>openImageViewer(doc,img,language));tile.append(button);
    if(remove){const close=doc.createElementNS(XHTML,'button') as HTMLButtonElement;close.type='button';close.className='zar-input-image-remove';close.textContent='×';close.setAttribute('aria-label',tr(language,`移除图片：${image.name}`,`Remove image: ${image.name}`));close.title=tr(language,'移除图片','Remove image');close.addEventListener('click',()=>remove(image.id));tile.append(close);}
    row.append(tile);
  }return row;
}
