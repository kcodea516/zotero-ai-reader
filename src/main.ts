import { ChatService } from './core';
import { ZoteroRepository, ZoteroSecretStore } from './platform';
import { mountSidebar } from './sidebar';
import { mountSettings as mountSettingsUI } from './settings';
import type { Host, PaperScope, Quote, PaperSource } from './types';
import { createZoteroPaperContextProvider } from './zotero-reading';

const ADDON_ID = 'ai-reader@local.codex';
const TRANSLATE_ID = 'zoteropdftranslate@euclpts.com';
const HTML = 'http://www.w3.org/1999/xhtml';
type Sidebar = ReturnType<typeof mountSidebar>;
type SectionInstance = {
  body: HTMLElement;
  section: any;
  details: any;
  scope: PaperScope | null;
  refresh(): Promise<void>;
  panel?: Sidebar;
  disposePlacement(): void;
};

let host: Host | undefined;
let service: ChatService | undefined;
let secretStore: ZoteroSecretStore | undefined;
let paneID = '';
let preferencesID = '';
let notifierID: string | number | undefined;
let alive = false;
let publishedAPI: any;
let resourceVersion = '';
const sections = new Map<HTMLElement, SectionInstance>();
const windows = new Map<Document, () => void>();
const settings = new Set<() => void>();

function report(code: string): void {
  // Native exceptions can contain URLs or submitted input. Log fixed codes only.
  try { Zotero.debug('[AI Reader] ' + code); } catch {}
}

function cleanupSafely(action: () => void, code: string): void {
  try { action(); } catch { report(code); }
}

export function scopeForItem(item: any): PaperScope | null {
  if (!item) return null;
  const parent = item.parentItem || (item.parentID ? Zotero.Items.get(item.parentID) : null);
  const target = parent || item;
  if (!target.key || !Number.isInteger(target.libraryID)) return null;
  return { libraryID: target.libraryID, itemKey: target.key, title: target.getField('title') || '未命名文献' };
}

function sameScope(left: PaperScope | null, right: PaperScope): boolean {
  return !!left && left.libraryID === right.libraryID && left.itemKey === right.itemKey;
}

function injectWindow(win: any): void {
  if (!host || !win?.document || windows.has(win.document)) return;
  const doc: Document = win.document;
  const added: Element[] = [];
  const parent = doc.head || doc.documentElement;
  for (const [rel, href] of [
    ['localization', 'ai-reader.ftl'],
    ['stylesheet', host.rootURI + 'styles.css?v=' + encodeURIComponent(resourceVersion)],
    ['stylesheet', host.rootURI + 'content/katex/katex.min.css'],
  ]) {
    const link = doc.createElementNS(HTML, 'link');
    link.setAttribute('rel', rel);
    link.setAttribute('href', href);
    link.setAttribute('data-ai-reader-resource', 'true');
    parent.append(link);
    added.push(link);
  }
  const cleanup = () => {
    windows.delete(doc);
    cleanupSafely(() => win.removeEventListener('unload', cleanup), 'window-listener-cleanup-failed');
    for (const element of added.splice(0)) cleanupSafely(() => element.remove(), 'window-style-cleanup-failed');
  };
  windows.set(doc, cleanup);
  win.addEventListener('unload', cleanup, { once: true });
}

function translationPaneID(): string | undefined {
  return Zotero.ItemPaneManager.customSectionData.options
    .find((option: any) => option.pluginID === TRANSLATE_ID)?.paneID;
}

/** The translator is non-orderable. Move only our own nodes, without changing
 * its registration or Zotero's persisted global ordering. */
function alignPlacement(instance: SectionInstance): void {
  if (!alive || !instance.section.isConnected) return;
  const targetID = translationPaneID();
  if (!targetID) return;
  const parent = instance.section.parentElement;
  const translation = Array.from(parent?.children || [])
    .find((element: any) => element.dataset.pane === targetID) as Element | undefined;
  if (!translation) return;

  const sidenav = instance.details?.sidenav;
  if (sidenav?.container === instance.details) {
    const buttons = Array.from(sidenav.querySelectorAll('.btn[data-pane]')) as HTMLElement[];
    const target = buttons.find(button => button.dataset.pane === targetID)?.parentElement;
    const own = buttons.find(button => button.dataset.pane === paneID)?.parentElement;
    if (target && own && own.previousElementSibling !== target) target.after(own);
  }
  if (instance.section.previousElementSibling !== translation) {
    // Zotero custom elements rebuild on a DOM move, just as they do during
    // native reordering. Re-render after moving so the replacement body mounts.
    translation.after(instance.section);
    Promise.resolve().then(() => { if (alive) return instance.refresh(); }).catch(() => report('placement-render-failed'));
  }
}

function observePlacement(instance: SectionInstance): () => void {
  const win: any = instance.body.ownerDocument.defaultView;
  let disposed = false;
  let pending = false;
  const schedule = () => {
    if (disposed || pending) return;
    pending = true;
    Promise.resolve().then(() => {
      pending = false;
      if (!disposed) alignPlacement(instance);
    }).catch(() => report('placement-failed'));
  };
  const observer = new win.MutationObserver(schedule);
  if (instance.section.parentElement) observer.observe(instance.section.parentElement, { childList: true });
  const navGroup = instance.details?.sidenav?.querySelector('.highlight-notes-inactive');
  if (navGroup) observer.observe(navGroup, { childList: true });
  schedule();
  return () => { disposed = true; observer.disconnect(); };
}

function destroySection(body: HTMLElement): void {
  const instance = sections.get(body);
  if (!instance) return;
  sections.delete(body);
  cleanupSafely(() => instance.disposePlacement(), 'section-observer-cleanup-failed');
  cleanupSafely(() => instance.panel?.destroy(), 'section-view-cleanup-failed');
  instance.panel = undefined;
}

function mountSettings(container: HTMLElement): () => void {
  if (!host || !alive) return () => {};
  injectWindow(container.ownerDocument.defaultView);
  const unmount = mountSettingsUI(container, host);
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    settings.delete(cleanup);
    cleanupSafely(unmount, 'settings-view-cleanup-failed');
  };
  settings.add(cleanup);
  return cleanup;
}

async function quoteSelection(reader: any, text: string, annotation: any): Promise<void> {
  if (!host || !service || !alive) return;
  const attachment = Zotero.Items.get(reader.itemID);
  const scope = scopeForItem(attachment);
  if (!scope) return;
  const quote: Quote = {
    text,
    pageLabel: annotation.pageLabel ? String(annotation.pageLabel) : undefined,
    attachmentKey: attachment?.key,
  };
  service.setQuote(service.forScope(scope).id, quote);
  await reader.setContextPaneOpen(true);
  const doc: Document | undefined = reader._window?.document || reader._iframe?.ownerDocument;
  if (!doc) return;
  injectWindow(doc.defaultView);
  // Reader.setContextPaneOpen() changes the embedded reader's toggle state.
  // The native Zotero splitter must also be opened to reveal item details.
  const nativeContext = (doc.defaultView as any)?.ZoteroContextPane;
  if (nativeContext) {
    nativeContext.collapsed = false;
    if (nativeContext.context) nativeContext.context.mode = 'item';
  }
  const candidates = Array.from(doc.querySelectorAll('item-details')) as any[];
  const details = candidates.find(element => reader.tabID && element.tabID === reader.tabID)
    || candidates.find(element => element.tabType === 'reader' && sameScope(scopeForItem(element.item), scope));
  if (!details) return;
  const pane = details.getPane?.(paneID);
  if (pane) {
    const collapsible = pane.querySelector('collapsible-section');
    if (collapsible) collapsible.open = true;
  }
  await details.render();
  await details.scrollToPane(paneID);
  const current = Array.from(sections.values()).find(instance => instance.details === details && sameScope(instance.scope, scope));
  current?.panel?.addQuote(quote);
  current?.panel?.show();
}

function onSelectionPopup({ reader, doc, params, append }: any): void {
  const text = params.annotation?.text?.trim();
  if (!text || !alive) return;
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = Zotero.locale?.startsWith('zh') ? '询问 AI' : 'Ask AI';
  button.className = 'ai-reader-ask-selection';
  button.style.cssText = 'margin:4px 6px;padding:4px 10px;border-radius:5px;cursor:pointer;';
  button.addEventListener('click', () => {
    void quoteSelection(reader, text, params.annotation).catch(() => report('quote-selection-failed'));
  });
  append(button);
}

export async function startup({ id = ADDON_ID, version = '', rootURI }: { id?: string; version?: string; rootURI: string }): Promise<void> {
  resourceVersion = version;
  if (alive) return;
  // Zotero awaits plugin startup before completing UI startup. Waiting for
  // uiReadyPromise here would deadlock the first window on a cold launch.
  await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise]);
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const ownAddon = await AddonManager.getAddonByID(id);
  if (ownAddon) ownAddon.applyBackgroundUpdates = AddonManager.AUTOUPDATE_DISABLE;
  secretStore = new ZoteroSecretStore();
  service = new ChatService(new ZoteroRepository(), secretStore, undefined, createZoteroPaperContextProvider());
  await service.init();
  host = {
    service,
    secretStore,
    rootURI,
    openSettings() { Zotero.Utilities.Internal.openPreferences(preferencesID); },
    scopeForItem,
    openSource(source: PaperSource, page?: number) {
      void (async () => {
        if (!Number.isInteger(source.libraryID) || !/^[A-Z0-9]{8}$/.test(source.attachmentKey)) return;
        const attachment = await Zotero.Items.getByLibraryAndKeyAsync(source.libraryID, source.attachmentKey);
        if (!attachment?.isAttachment() || attachment.deleted || attachment.attachmentContentType !== 'application/pdf') return;
        const parent = attachment.parentID ? await Zotero.Items.getAsync(attachment.parentID) : attachment;
        if (parent?.key !== source.itemKey || parent.deleted) return;
        const destination = Number.isInteger(page) && source.pages.includes(page!) ? page! : source.pages[0];
        if (!(destination >= 1 && destination <= source.totalPages)) return;
        await Zotero.Reader.open(attachment.id, { pageIndex: destination - 1 });
      })().catch(() => report('source-open-failed'));
    },
    copy(text: string) {
      Components.classes['@mozilla.org/widget/clipboardhelper;1']
        .getService(Components.interfaces.nsIClipboardHelper).copyString(text);
    },
    openURL(url: string) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') Zotero.launchURL(parsed.href);
      } catch { /* Invalid and non-web links remain inert. */ }
    },
  };
  alive = true;
  publishedAPI = Object.freeze({ service, host, get paneID() { return paneID; }, mountSettings });
  Zotero.AIReader = publishedAPI;
  for (const win of Zotero.getMainWindows()) injectWindow(win);

  preferencesID = await Zotero.PreferencePanes.register({
    pluginID: id,
    id: 'ai-reader-preferences',
    label: 'AI 阅读助手',
    image: rootURI + 'icons/chat.svg',
    src: rootURI + 'prefs.xhtml',
    scripts: [rootURI + 'prefs.js'],
  });

  const registered = Zotero.ItemPaneManager.registerSection({
    paneID: 'chat',
    pluginID: id,
    header: { l10nID: 'ai-reader-section', icon: rootURI + 'icons/chat16.svg' },
    sidenav: { l10nID: 'ai-reader-sidenav', icon: rootURI + 'icons/chat20.svg', orderable: false },
    onInit({ body, doc, item, refresh }: any) {
      injectWindow(doc.defaultView);
      const section = body.closest('item-pane-custom-section');
      const instance: SectionInstance = {
        body, section, details: section.closest('item-details'), scope: scopeForItem(item), refresh, disposePlacement() {},
      };
      sections.set(body, instance);
      instance.disposePlacement = observePlacement(instance);
    },
    onItemChange({ body, item, tabType, setEnabled }: any) {
      const scope = scopeForItem(item);
      setEnabled(tabType === 'reader' && !!scope);
      const instance = sections.get(body);
      if (instance) {
        instance.scope = scope;
        if (scope) instance.panel?.updateScope(scope);
      }
    },
    onRender({ body, item }: any) {
      const instance = sections.get(body);
      const scope = scopeForItem(item);
      if (!instance || !scope || !host) return;
      instance.scope = scope;
      if (instance.panel) instance.panel.updateScope(scope);
      else instance.panel = mountSidebar(body, scope, host);
    },
    onDestroy({ body }: any) { destroySection(body); },
    sectionButtons: [{
      type: 'settings',
      icon: rootURI + 'icons/settings.svg',
      l10nID: 'ai-reader-settings',
      onClick() { host?.openSettings(); },
    }],
  });
  if (!registered) { await shutdown(); throw new Error('无法注册 AI 对话侧栏。'); }
  paneID = registered;

  notifierID = Zotero.Notifier.registerObserver({
    notify() {
      Promise.resolve().then(() => {
        for (const instance of sections.values()) alignPlacement(instance);
      }).catch(() => report('placement-notify-failed'));
    },
  }, ['itempane', 'tab'], 'ai-reader-placement');
  Zotero.Reader.registerEventListener('renderTextSelectionPopup', onSelectionPopup, id);
}

export function onMainWindowLoad(win: any): void { if (alive) injectWindow(win); }
export function onMainWindowUnload(win: any): void {
  cleanupSafely(() => windows.get(win?.document)?.(), 'window-unload-cleanup-failed');
}

export async function shutdown(): Promise<void> {
  alive = false;
  const stoppingAPI = publishedAPI;
  const stoppingService = service;
  const stoppingSecrets = secretStore;
  try {
    cleanupSafely(() => Zotero.Reader.unregisterEventListener('renderTextSelectionPopup', onSelectionPopup), 'reader-listener-cleanup-failed');
    const oldNotifierID = notifierID;
    notifierID = undefined;
    if (oldNotifierID !== undefined) cleanupSafely(() => Zotero.Notifier.unregisterObserver(oldNotifierID), 'notifier-cleanup-failed');
    const oldPaneID = paneID;
    paneID = '';
    if (oldPaneID) cleanupSafely(() => Zotero.ItemPaneManager.unregisterSection(oldPaneID), 'pane-unregister-failed');
    const oldPreferencesID = preferencesID;
    preferencesID = '';
    if (oldPreferencesID) cleanupSafely(() => Zotero.PreferencePanes.unregister(oldPreferencesID), 'preferences-unregister-failed');
    for (const instance of Array.from(sections.values())) cleanupSafely(() => destroySection(instance.body), 'section-cleanup-failed');
    for (const cleanup of Array.from(settings)) cleanupSafely(cleanup, 'settings-cleanup-failed');
    for (const cleanup of Array.from(windows.values())) cleanupSafely(cleanup, 'window-cleanup-failed');
    try { await stoppingService?.shutdown(); } catch { report('service-flush-failed'); }
  } finally {
    sections.clear();
    settings.clear();
    windows.clear();
    cleanupSafely(() => stoppingSecrets?.clearSession(), 'secret-session-cleanup-failed');
    cleanupSafely(() => { if (Zotero.AIReader === stoppingAPI) delete Zotero.AIReader; }, 'global-cleanup-failed');
    publishedAPI = undefined;
    host = undefined;
    service = undefined;
    secretStore = undefined;
  }
}
