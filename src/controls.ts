/** The same XUL control classes used by Zotero and Translate for Zotero. */
const XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

// These intentionally describe XUL controls rather than casting them to HTML controls.
export interface NativeButton extends HTMLElement {
  disabled: boolean;
  label: string;
  doCommand(): void;
}
export interface NativeSelect extends HTMLElement {
  disabled: boolean;
  value: string;
  selectedIndex: number;
  selectedItem: Element | null;
}
export interface NativeEditable extends HTMLElement {
  value: string;
  placeholder: string;
  readOnly: boolean;
  readonly ref: HTMLTextAreaElement | null;
}
export interface NativeOption { label: string; value: string }

function xul(doc: Document, tag: string): Element {
  const nativeDoc = doc as Document & { createXULElement?: (name: string) => Element };
  return nativeDoc.createXULElement ? nativeDoc.createXULElement(tag) : doc.createElementNS(XUL, tag);
}

export function nativeButton(doc: Document, label: string, action: () => void, className = ''): NativeButton {
  const node = xul(doc, 'button') as NativeButton;
  node.setAttribute('class', `zar-native-button ${className}`.trim());
  node.setAttribute('label', label);
  node.setAttribute('aria-label', label);
  // XUL emits command for both pointer and keyboard activation. Listening to click
  // as well would send a request twice and omit native keyboard behavior.
  node.addEventListener('command', () => { if (!node.disabled) action(); });
  return node;
}

export function nativeSelect(doc: Document, className = '', ariaLabel = ''): NativeSelect {
  const node = xul(doc, 'menulist') as NativeSelect;
  node.setAttribute('class', `zar-native-select ${className}`.trim());
  node.setAttribute('native', 'true');
  node.setAttribute('crop', 'end');
  if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
  node.append(xul(doc, 'menupopup'));
  return node;
}

/** Changing the value programmatically emits select/ValueChange, but not command. */
export function setNativeOptions(select: NativeSelect, options: NativeOption[], value: string): void {
  select.selectedItem = null;
  const popup = xul(select.ownerDocument, 'menupopup');
  for (const option of options) {
    const item = xul(select.ownerDocument, 'menuitem');
    item.setAttribute('label', option.label);
    item.setAttribute('value', option.value);
    if (option.value === value) item.setAttribute('selected', 'true');
    popup.append(item);
  }
  select.replaceChildren(popup);
  const selected = options.findIndex(option => option.value === value);
  select.selectedIndex = selected >= 0 ? selected : 0;
}

export function nativeEditable(doc: Document, className: string, ariaLabel: string, minLines = 3, maxLines = 10): NativeEditable {
  const node = xul(doc, 'editable-text') as NativeEditable;
  node.setAttribute('class', `zar-editable ${className}`.trim());
  node.setAttribute('multiline', 'true');
  node.setAttribute('min-lines', String(minLines));
  node.setAttribute('max-lines', String(maxLines));
  node.setAttribute('aria-label', ariaLabel);
  // Zotero's unfocused plain-text drop path updates value asynchronously via
  // _handleInput() without dispatching input. Bridge just that path, while
  // avoiding a second notification for ordinary focused textarea drops.
  let inputRevision = 0;
  node.addEventListener('input', () => { inputRevision++; });
  node.addEventListener('drop', () => {
    const previousValue = node.value;
    const previousRevision = inputRevision;
    const win = node.ownerDocument.defaultView;
    if (!win) return;
    win.setTimeout(() => {
      if (!node.isConnected || node.value === previousValue || inputRevision !== previousRevision) return;
      node.dispatchEvent(new win.Event('input', { bubbles: true }));
    }, 0);
  });
  return node;
}

/**
 * editable-text normally swallows Enter and blurs on Shift+Enter. Capture before
 * its internal textarea listener so chat sends on Enter and text fields keep
 * normal multiline editing. IME commits keep the browser's default behavior.
 */
export function multilineKeys(field: NativeEditable, send?: () => void): void {
  let composing = false;
  field.addEventListener('compositionstart', () => { composing = true; });
  field.addEventListener('compositionend', () => { composing = false; });
  field.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.stopPropagation();
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      // Native editable-text resets to initialValue without notifying input.
      // Preserve the current draft and only leave the field.
      event.preventDefault();
      field.ref?.blur();
      return;
    }
    if (send && (!event.shiftKey || event.ctrlKey || event.metaKey)) {
      event.preventDefault(); send();
    }
  }, true);
}

export function nativeTooltip(node: Element, text: string): void {
  node.setAttribute('tooltiptext', text);
}
