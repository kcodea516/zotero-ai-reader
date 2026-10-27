import { tr, type UILanguage } from './i18n.ts';

let nextID = 0;

/** Clamp only the presentation; the full message remains available to copying and chat. */
export function mountMessageDisclosure(viewport: HTMLElement, body: HTMLElement, button: HTMLButtonElement, state: { expanded(): boolean; toggle(expanded: boolean): void }) {
  const win = viewport.ownerDocument.defaultView!;
  let language: UILanguage = 'zh-CN', frame = 0, destroyed = false;
  body.id = `zar-message-text-${++nextID}`;
  button.type = 'button'; button.hidden = true;
  button.setAttribute('aria-controls', body.id);
  function refresh(): void {
    if (destroyed || !body.isConnected) return;
    const height = (parseFloat(win.getComputedStyle(body).fontSize) || 14) * 1.6 * 6;
    viewport.style.setProperty('--zar-user-preview-height', `${height}px`);
    const overflowing = body.scrollHeight > Math.ceil(height) + 1;
    const expanded = state.expanded();
    viewport.classList.toggle('zar-user-text-collapsed', overflowing && !expanded);
    button.hidden = !overflowing;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? tr(language, '▴ 收起', '▴ Show less') : tr(language, '▾ 展开', '▾ Show more');
  }
  function toggle(): void { state.toggle(!state.expanded()); refresh(); }
  // A keyboard user can reach a link beyond the clipped preview. Reveal it before
  // focus is painted so navigation never lands on a hidden line.
  function revealFocus(): void { if (!state.expanded()) { state.toggle(true); refresh(); } }
  button.addEventListener('click', toggle);
  body.addEventListener('focusin', revealFocus);
  const observer = new win.ResizeObserver(refresh);
  observer.observe(body);
  return {
    update(nextLanguage: UILanguage) {
      language = nextLanguage; refresh();
      if (frame) win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => { frame = 0; refresh(); });
    },
    destroy() { destroyed = true; observer.disconnect(); if (frame) win.cancelAnimationFrame(frame); button.removeEventListener('click', toggle); body.removeEventListener('focusin', revealFocus); },
  };
}
