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
