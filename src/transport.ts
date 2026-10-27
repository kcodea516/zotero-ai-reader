import { isRasterDataURL, checkInputImages } from './image-data.ts';
import { bilingualError } from './i18n-errors.ts';
import type { ChatRequest } from './types.ts';

const CONNECT_TIMEOUT = 60_000;
const IDLE_TIMEOUT = 120_000;

/** Normalize either an API root, a versioned prefix, or the complete chat URL. */
export function normalizeEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw bilingualError('API 地址无效，请填写完整的 http(s) 地址。', "The API address is invalid. Enter a complete HTTP(S) URL."); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw bilingualError('API 地址必须是 http(s) 地址，且不能包含用户名、密码、查询参数或锚点。', "The API URL must use HTTP(S) and must not contain credentials, query parameters, or fragments.");
  }
  let path = url.pathname.replace(/\/+$/, '');
  if (!path) path = '/v1';
  if (!path.endsWith('/chat/completions')) path += '/chat/completions';
  url.pathname = path;
  return url.href;
}

function statusError(status: number): Error {
  if (status === 401 || status === 403) return bilingualError(`API 鉴权失败（${status}），请检查密钥及调用权限。`, `API authentication failed (${status}). Check your API key and permissions.`);
  if (status === 404) return bilingualError('API 地址或模型不存在（404），请检查接口地址和模型 ID。', "The API endpoint or model was not found (404). Check the address and model ID.");
  if (status === 413) return bilingualError('问题或历史记录过长（413），请缩短内容或新建会话。', "The question or history is too long (413). Shorten it or start a new conversation.");
  if (status === 429) return bilingualError('API 请求受限（429），请稍后手动重试或检查额度。', "The API request was rate-limited (429). Retry later or check your quota.");
  if (status >= 500) return bilingualError(`API 服务暂时不可用（${status}），请稍后手动重试。`, `The API service is temporarily unavailable (${status}). Retry later.`);
  return bilingualError(`API 请求失败（${status}），请检查接口配置、模型及上下文长度。`, `The API request failed (${status}). Check the endpoint settings, model, and context length.`);
}

function emitContent(value: unknown, request: Pick<ChatRequest, 'onText' | 'onImage'>): boolean {
  if (typeof value === 'string') { request.onText(value); return true; }
  if (!Array.isArray(value)) return false;
  for (const part of value) {
    if (part && typeof part.text === 'string') request.onText(part.text);
    const uri = part?.image_url?.url || part?.url;
    if (isRasterDataURL(uri)) request.onImage?.({ id: globalThis.crypto.randomUUID(), dataURL: uri });
  }
  return true;
}
function completion(value: any, request: Pick<ChatRequest, 'onText' | 'onImage'>): { truncated?: boolean } {
  if (value?.error) throw bilingualError('API 返回错误，请检查模型、额度及上下文长度。', 'The API returned an error. Check the model, quota, and context length.');
  const choice=value?.choices?.[0];
  if (!choice || (typeof choice.message?.content !== 'string' && !Array.isArray(choice.message?.content) && !Array.isArray(choice.message?.images))) throw bilingualError('API 返回格式不受支持，需要 Chat Completions 格式。', 'The API response format is unsupported. Chat Completions format is required.');
  if (choice.finish_reason==='content_filter') throw bilingualError('API 未完成回答：内容被服务端过滤。','The API did not complete the answer because the server filtered its content.');
  emitContent(choice.message.content,request); emitContent(choice.message.images,request);
  return choice.finish_reason==='length'?{truncated:true}:{};
}

/** A single request: no retries, cookies, SDK, or access to Zotero UI state. */
export async function chatCompletion(request: ChatRequest): Promise<{ truncated?: boolean }> {
  const url = normalizeEndpoint(request.endpoint.baseURL);
  const messages = request.messages.map(message => {
    if(!message.images?.length) return {role:message.role,content:message.content};
    checkInputImages(message.images);
    return {role:message.role,content:[{type:'text',text:message.content||'Describe the attached images.'},...message.images.map(image=>({type:'image_url',image_url:{url:image.dataURL}}))]};
  });
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => controller.abort();
  const resetTimer = (delay: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, delay);
  };
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    resetTimer(CONNECT_TIMEOUT);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: request.endpoint.stream ? 'text/event-stream, application/json' : 'application/json' };
    if (request.key) headers.Authorization = `Bearer ${request.key}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify({ model: request.model.model, messages, stream: request.endpoint.stream }),
        signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      });
    } catch {
      if (controller.signal.aborted) throw bilingualError(timedOut ? 'API 连接或响应超时，请手动重试。' : '已停止生成。', timedOut ? 'The API connection or response timed out. Retry manually.' : 'Generation stopped.');
      throw bilingualError('无法连接 API，请检查网络、地址和证书；接口重定向不受支持。', "Could not connect to the API. Check the network, URL, and certificate; endpoint redirects are unsupported.");
    }
    if (!response.ok) throw statusError(response.status);
    resetTimer(IDLE_TIMEOUT);
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json') || (!request.endpoint.stream && !contentType.includes('text/event-stream'))) {
      let json: any;
      try { json = await response.json(); }
      catch {
        if (controller.signal.aborted) throw bilingualError(timedOut ? 'API 响应超时，请手动重试。' : '已停止生成。', timedOut ? 'The API response timed out. Retry manually.' : 'Generation stopped.');
        throw bilingualError('API 返回了无效的 JSON。', "The API returned invalid JSON.");
      }
      if (controller.signal.aborted) throw bilingualError(timedOut ? 'API 响应超时，请手动重试。' : '已停止生成。', timedOut ? 'The API response timed out. Retry manually.' : 'Generation stopped.');
      return completion(json, request);
    }
    if (!response.body) throw bilingualError('API 没有返回可读取的响应。', "The API returned no readable response.");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventLines: string[] = [];
    let done = false;
    let finished = false;
    let truncated = false;
    const dispatch = () => {
      if (!eventLines.length || done) { eventLines = []; return; }
      const data = eventLines.join('\n');
      eventLines = [];
      if (data.trim() === '[DONE]') { done = true; return; }
      let value: any;
      try { value = JSON.parse(data); }
      catch { throw bilingualError('API 流式数据格式无效，请手动重试。', "The API stream format is invalid. Retry manually."); }
      if (value?.error) throw bilingualError('API 在生成过程中返回错误，请检查额度、模型及上下文长度。', "The API returned an error during generation. Check the quota, model, and context length.");
      const choice = value?.choices?.find((item: any) => item.index === 0) ?? value?.choices?.[0];
      if (!choice) return; // Usage-only event
      emitContent(choice.delta?.content, request); emitContent(choice.delta?.images, request);
      if (choice.finish_reason === 'content_filter') throw bilingualError('API 未完成回答：内容被服务端过滤。', "The API did not complete the answer because the server filtered its content.");
      if (choice.finish_reason != null) { finished = true; done = true; truncated ||= choice.finish_reason === 'length'; }
    };
    const line = (value: string) => {
      if (!value) dispatch();
      else if (value.startsWith('data:')) eventLines.push(value.slice(5).replace(/^ /, ''));
    };
    const consume = (final: boolean) => {
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char !== '\r' && char !== '\n') continue;
        if (char === '\r' && i === buffer.length - 1 && !final) break;
        line(buffer.slice(start, i));
        if (char === '\r' && buffer[i + 1] === '\n') i++;
        start = i + 1;
        if (done) break;
      }
      buffer = buffer.slice(start);
      if (final && !done) {
        if (buffer) line(buffer);
        buffer = '';
        dispatch();
      }
    };
    try {
      while (!done) {
        const chunk = await reader.read();
        if (controller.signal.aborted) throw new Error('aborted');
        if (chunk.done) { buffer += decoder.decode(); consume(true); break; }
        resetTimer(IDLE_TIMEOUT);
        buffer += decoder.decode(chunk.value, { stream: true });
        consume(false);
      }
    } catch (error) {
      if (controller.signal.aborted) throw bilingualError(timedOut ? 'API 响应超时，请手动重试。' : '已停止生成。', timedOut ? 'The API response timed out. Retry manually.' : 'Generation stopped.');
      if (error instanceof Error && error.message.startsWith('API ')) throw error;
      throw bilingualError('API 连接中断，请手动重试。', "The API connection was interrupted. Retry manually.");
    }
    if (!done && !finished) throw bilingualError('API 响应意外中断，已保留收到的文字，请手动重试。', "The API response ended unexpectedly. Received text has been preserved; retry manually.");
    return truncated ? { truncated: true } : {};
  } finally {
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    if (reader) { try { await reader.cancel(); } catch {} }
  }
}
