import { bilingualError } from './i18n-errors.ts';
import { normalizeEndpoint } from './transport.ts';
import { imageDataURL, isRasterDataURL, MAX_IMAGE_BYTES, type GeneratedImage } from './image-data.ts';
import type { EndpointConfig } from './types.ts';

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5-flare';
export interface ImageRequest { endpoint: EndpointConfig; key: string; prompt: string; signal: AbortSignal; format?: 'png' | 'jpeg' | 'webp' }
export type ImageTransport = (request: ImageRequest) => Promise<GeneratedImage[]>;
export function imageEndpoint(base: string): string { return normalizeEndpoint(base).replace(/\/chat\/completions$/, '/images/generations'); }
export function requestsImage(input: string): boolean {
  const text = input.replace(/```[\s\S]*?```|^\s*>.*$/gm, '').replace(/"[^"\n]*"|“[^”\n]*”|「[^」\n]*」/g, '').trim();
  if (/\bsvg\b/i.test(text) && !/(?:不要|不用|不是|not).{0,5}\bsvg\b/i.test(text)) return false;
  return text.split(/[。！？!?;；\n]/).some(value => {
    const part=value.trim();
    if (/(?:不要|不用|无需|先不|别).{0,12}(?:生图|画|生成.{0,5}图)|\b(?:do not|don't|without)\b.{0,20}(?:generat|draw|image)/i.test(part)) return false;
    if (/^(?:解释|什么是|如何|怎么|why\b|what\b|how\b|explain\b)/i.test(part)) return false;
    return /^(?:(?:再|请|帮我|给我|为我|替我|麻烦|我想|我希望|能不能).{0,24})?(?:生成|绘制|画|制作|生图).{0,24}(?:图片|图像|张图|幅图|示意图|流程图|结构图|配图|插图|\bpng\b|\bjpe?g\b)|^(?:(?:再|请|帮我|给我|为我|替我|麻烦)\s*)?(?:画|绘制|生图).{1,80}|^(?:(?:please|can you|could you|would you|help me|i want you to)\s+)*(?:generate|draw|create|make)\s+(?:(?:me|an?|the|some)\s+){0,3}(?:image|picture|illustration|diagram|photo|png|jpe?g)\b/i.test(part);
  });
}

async function boundedBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit || !response.body) throw new Error('Invalid image response');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > limit) throw new Error('Image response too large'); chunks.push(chunk.value); } }
  finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
}
function publicImageURL(value: string): string {
  const url = new URL(value), host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || host === 'localhost' || host.endsWith('.local') || host.includes(':') || /^127\.|^10\.|^0\.|^169\.254\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) throw new Error('Invalid image URL');
  return url.href;
}
/** Explicit image requests only. Uses the selected endpoint's existing key; no retries. */
export const generateImage: ImageTransport = async request => {
  const controller = new AbortController(); const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true }); if (request.signal.aborted) controller.abort();
  const timer = setTimeout(abort, 300000);
  try {
    const response = await fetch(imageEndpoint(request.endpoint.baseURL), { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(request.key ? { Authorization: `Bearer ${request.key}` } : {}) },
      body: JSON.stringify({ model: request.endpoint.imageModel?.trim() || DEFAULT_IMAGE_MODEL, prompt: request.prompt.slice(0,32000), n: 1, size: 'auto', output_format: request.format || 'png' }),
      signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw bilingualError(`生图请求失败（${response.status}）。请检查此接口的生图支持、模型 ID、密钥权限和额度。`, `Image generation failed (${response.status}). Check image API support, image model ID, key permissions, and quota.`);
    let value: any; try { value = JSON.parse(new TextDecoder().decode(await boundedBytes(response, 18 * 1024 * 1024))); } catch { throw new Error('Invalid response'); }
    const item = value?.data?.[0]; let dataURL: string;
    if (typeof item?.b64_json === 'string') {
      if (item.b64_json.length > MAX_IMAGE_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) throw new Error('Invalid image');
      dataURL = imageDataURL(Uint8Array.from(atob(item.b64_json), c => c.charCodeAt(0)));
    } else if (typeof item?.url === 'string') {
      // Provider image URLs are fetched without forwarding the API key or cookies.
      const image = await fetch(publicImageURL(item.url), { signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (!image.ok) throw new Error('Image download failed'); dataURL = imageDataURL(await boundedBytes(image, MAX_IMAGE_BYTES));
    } else throw new Error('No image returned');
    if (controller.signal.aborted || !isRasterDataURL(dataURL)) throw new Error('Invalid image');
    return [{ id: globalThis.crypto.randomUUID(), dataURL }];
  } catch (error) {
    if (request.signal.aborted) throw bilingualError('已停止生图。', 'Image generation stopped.');
    if (error && typeof error === 'object' && 'englishMessage' in error) throw error;
    throw bilingualError('未取得有效图片，请检查生图接口、模型和网络后重试。', 'No valid image was received. Check the image API, model, and network, then retry.');
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); }
};
