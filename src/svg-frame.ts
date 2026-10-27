import { svgPreviewDocument } from './svg-document.ts';

/** Adds an offline, opaque-origin execution frame. Return a disposer for the network observer. */
export function mountInteractiveSVG(frame: HTMLIFrameElement, source: string): () => void {
  const win = frame.ownerDocument.defaultView as Window & typeof globalThis;
  if (source.length > 300_000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Invalid SVG');
  const parsed = new win.DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (parsed.querySelector('parsererror') || svg.localName !== 'svg' || parsed.querySelectorAll('*').length > 2000) throw new Error('Invalid SVG');
  if (!svg.hasAttribute('viewBox')) {
    const width = parseFloat(svg.getAttribute('width') || '') || 800, height = parseFloat(svg.getAttribute('height') || '') || 400;
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, Math.min(4096,width))} ${Math.max(1, Math.min(4096,height))}`);
  }
  source = new win.XMLSerializer().serializeToString(svg);
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  // CSP covers subresources. Cancel navigation requests too, which CSP does not cover.
  const contextID = (frame as any).browsingContext?.id;
  if (!contextID || typeof Services === 'undefined' || typeof Components === 'undefined') throw new Error('SVG sandbox unavailable');
  const observer = { observe(subject: any) {
    try {
      const channel = subject.QueryInterface(Components.interfaces.nsIHttpChannel);
      const info = channel.loadInfo;
      if (info.browsingContextID === contextID || info.frameBrowsingContextID === contextID) channel.cancel(Components.results.NS_BINDING_ABORTED);
    } catch { /* Non-HTTP channels are covered by the frame's origin and CSP. */ }
  } };
  Services.obs.addObserver(observer, 'http-on-modify-request');
  try { frame.srcdoc = svgPreviewDocument(source); }
  catch (error) { Services.obs.removeObserver(observer, 'http-on-modify-request'); throw error; }
  return () => Services.obs.removeObserver(observer, 'http-on-modify-request');
}
