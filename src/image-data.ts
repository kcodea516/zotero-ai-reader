import { bilingualError } from './i18n-errors.ts';
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export interface GeneratedImage { id: string; dataURL: string; prompt?: string }
export function rasterMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp';
}
export function isRasterDataURL(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_BYTES * 1.4) return false;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  try { return rasterMime(Uint8Array.from(atob(match[2].slice(0, Math.min(32, match[2].length))), c => c.charCodeAt(0))) === match[1]; } catch { return false; }
}
export function validGeneratedImage(value: unknown): value is GeneratedImage {
  const image = value as GeneratedImage | undefined;
  return !!image && typeof image.id === 'string' && image.id.length <= 100 && isRasterDataURL(image.dataURL) && (image.prompt === undefined || typeof image.prompt === 'string');
}
export function imageDataURL(bytes: Uint8Array): string {
  const mime = rasterMime(bytes); if (!mime || bytes.length > MAX_IMAGE_BYTES) throw new Error('Unsupported image');
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}


export interface InputImage extends GeneratedImage { name: string }
export const MAX_INPUT_IMAGES = 4;
export const MAX_INPUT_BYTES = 24 * 1024 * 1024;
export function validInputImage(value: unknown): value is InputImage {
  const image = value as InputImage | undefined;
  return validGeneratedImage(image) && typeof image.name === 'string' && image.name.length <= 256;
}
export function imageByteLength(dataURL: string): number {
  const encoded=dataURL.slice(dataURL.indexOf(',')+1); return encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
}
export function checkInputImages(images: InputImage[]): void {
  if (!Array.isArray(images)||images.length>MAX_INPUT_IMAGES||!images.every(validInputImage)||images.some(i=>imageByteLength(i.dataURL)>MAX_IMAGE_BYTES)||images.reduce((n,i)=>n+imageByteLength(i.dataURL),0)>MAX_INPUT_BYTES)
    throw bilingualError('最多添加 4 张 PNG、JPG 或 WebP 图片，单张不超过 12 MB，总计不超过 24 MB。','Attach up to 4 PNG, JPG, or WebP images, at most 12 MB each and 24 MB in total.');
}
export async function inputImagesFromFiles(files: readonly File[]): Promise<InputImage[]> {
  if(files.length>MAX_INPUT_IMAGES) throw bilingualError('最多添加 4 张图片。','Attach up to 4 images.');
  const images:InputImage[]=[];
  for(const file of files){
    if(file.size>MAX_IMAGE_BYTES) throw bilingualError('单张图片不能超过 12 MB。','Each image must be 12 MB or smaller.');
    let dataURL:string;try{dataURL=imageDataURL(new Uint8Array(await file.arrayBuffer()));}catch{throw bilingualError('请选择 PNG、JPG 或 WebP 图片。','Choose PNG, JPG, or WebP images.');}
    images.push({id:globalThis.crypto.randomUUID(),name:file.name.split(/[\\/]/).pop()!.slice(0,256)||'image.png',dataURL});
  }
  checkInputImages(images);return images;
}
