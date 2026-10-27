/** Runs only inside the opaque-origin SVG frame, before the diagram's scripts. */
function svgRuntime(): void {
  const root = document.documentElement;
  const nativeNow = performance.now.bind(performance);
  const nativeDateNow = Date.now.bind(Date);
  const nativeRAF = requestAnimationFrame.bind(window);
  const nativeTimeout = window.setTimeout.bind(window) as (handler: TimerHandler, timeout?: number, ...args: any[]) => number;
  const nativeClear = clearTimeout.bind(window);
  let paused = false, pauseAt = 0, excluded = 0, nextID = 1;
  const now = () => (paused ? pauseAt : nativeNow()) - excluded;
  const started = now();
  const rafs = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { fn: (...args: any[]) => void; args: any[]; due: number; repeat: number | null; handle?: number }>();
  const stoppedAnimations = new Set<Animation>();
  // Diagram callbacks observe a clock that stops with the playback controls.
  Object.defineProperty(performance, 'now', { value: now });
  Date.now = () => nativeDateNow() - excluded - (paused ? nativeNow() - pauseAt : 0);
  window.requestAnimationFrame = callback => { const id = nextID++; rafs.set(id, callback); return id; };
  window.cancelAnimationFrame = id => { rafs.delete(id); };
  const arm = (id: number) => {
    const timer = timers.get(id); if (!timer || paused) return;
    timer.handle = nativeTimeout(() => {
      if (!timers.has(id)) return;
      if (timer.repeat === null) timers.delete(id);
      else { timer.due = now() + timer.repeat; arm(id); }
      timer.fn(...timer.args);
    }, Math.max(0, timer.due - now()));
  };
  const addTimer = (handler: TimerHandler, delay: number | undefined, args: any[], repeat: boolean) => {
    if (typeof handler !== 'function') return nativeTimeout(handler, delay, ...args);
    const id = nextID++, ms = Math.max(0, Math.min(2147483647, Number(delay) || 0));
    timers.set(id, { fn: handler as (...args: any[]) => void, args, due: now() + ms, repeat: repeat ? Math.max(1, ms) : null }); arm(id); return id;
  };
  window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: any[]) => addTimer(handler, delay, args, false)) as typeof window.setTimeout;
  window.setInterval = ((handler: TimerHandler, delay?: number, ...args: any[]) => addTimer(handler, delay, args, true)) as typeof window.setInterval;
  const cancelTimer = (id?: any) => { const timer = timers.get(id); if (timer) { nativeClear(timer.handle); timers.delete(id); } };
  window.clearTimeout = window.clearInterval = cancelTimer;
  const svg = () => document.querySelector('svg');
  const setPaused = (value: boolean) => {
    if (value === paused) return;
    if (value) {
      pauseAt = nativeNow(); paused = true;
      for (const timer of timers.values()) nativeClear(timer.handle);
      svg()?.pauseAnimations();
      for (const animation of document.getAnimations()) if (animation.playState === 'running') { stoppedAnimations.add(animation); animation.pause(); }
    } else {
      excluded += nativeNow() - pauseAt; paused = false;
      svg()?.unpauseAnimations();
      for (const animation of stoppedAnimations) { try { animation.play(); } catch {} } stoppedAnimations.clear();
      for (const id of timers.keys()) arm(id);
    }
    root.setAttribute('data-zar-paused', String(paused));
  };
  addEventListener('message', event => {
    // Gecko reports privileged senders as null; commands only affect this diagram.
    if ((event.source !== parent && event.source !== null) || !event.data || event.data.type !== 'zar-svg-control') return;
    if (event.data.action === 'pause') setPaused(true);
    if (event.data.action === 'play') setPaused(false);
    if (event.data.action === 'seek' && Number.isFinite(event.data.seconds)) {
      const seconds = Math.max(0, Math.min(86400, event.data.seconds));
      svg()?.setCurrentTime(seconds);
      for (const animation of document.getAnimations()) { try { animation.currentTime = seconds * 1000; } catch {} }
    }
  });
  // Escape can be handled by the host without exposing any privileged callback.
  addEventListener('keydown', event => { if (event.key === 'Escape') root.setAttribute('data-zar-close', 'true'); });
  const duration = () => {
    let seconds = 0;
    for (const el of document.querySelectorAll('animate,animateTransform,animateMotion,set')) {
      const d = (el.getAttribute('dur') || '').match(/^([\d.]+)(ms|s|min|h)?$/);
      const begin = (el.getAttribute('begin') || '0').match(/^([\d.]+)(ms|s|min|h)?$/);
      const clock = (m: RegExpMatchArray | null) => m ? Number(m[1]) * ({ ms: .001, s: 1, min: 60, h: 3600 }[m[2] || 's'] || 1) : 0;
      if (d) seconds = Math.max(seconds, clock(d) + clock(begin));
    }
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming();
      if (timing && typeof timing.duration === 'number') seconds = Math.max(seconds, (timing.duration + Number(timing.delay || 0)) / 1000);
    }
    return Math.min(86400, seconds);
  };
  const tick = () => {
    if (!paused) {
      const callbacks = Array.from(rafs); rafs.clear();
      for (const [, callback] of callbacks) { try { callback(now()); } catch (error) { console.error(error); } }
    }
    root.setAttribute('data-zar-time', String(svg()?.getCurrentTime() ?? (now() - started) / 1000));
    root.setAttribute('data-zar-duration', String(duration()));
    nativeRAF(tick);
  };
  addEventListener('DOMContentLoaded', () => {
    root.setAttribute('data-zar-ready', 'true'); root.setAttribute('data-zar-paused', 'false'); nativeRAF(tick);
  }, { once: true });
}

export const SVG_PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** The caller validates XML first. Source is parsed only in the sandbox, never in chrome. */
export function svgPreviewDocument(source: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SVG_PREVIEW_CSP}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:white}body>svg{display:block;width:100%!important;height:100%!important}</style><script>(${svgRuntime.toString()})();</script></head><body>${source}</body></html>`;
}
