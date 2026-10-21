import { ChatService } from '../src/core.ts';
import { mountSidebar } from '../src/sidebar.ts';
import { mountSettings } from '../src/settings.ts';
import type { Config, Host, PaperScope, SecretStore, StoreState } from '../src/types.ts';

/** Render the real native controls with sample data, never the user's history or keys. */
export async function mountShowcase(win: Window, view: 'chat' | 'settings') {
  const doc = win.document;
  let saved: StoreState | null = null;
  const secrets: SecretStore = { async get() { return ''; }, async set() { return true; }, async delete() {} };
  const service = new ChatService({ async load() { return saved; }, async save(value) { saved = JSON.parse(JSON.stringify(value)); } }, secrets,
    async request => {
      request.onText('Nova separates work into three workers:\n\n- **Vision encode** turns images into visual features.\n- **LLM prefill** processes the input sequence and builds its KV cache.\n- **LLM decode** generates the output tokens.\n\nA single request follows that order. Across different requests, decode can overlap with vision encoding or prefill. Nova coordinates these workers with a scheduler and GPU resource partitioning. [S1 p.4]');
      return {};
    }, async () => ({ text: 'Illustrative documentation fixture.', sources: [{ id: 'S1', title: 'Nova: Real-Time Agentic Vision-Language Model Serving with Adaptive Cross-Stage Parallelization', libraryID: 1, itemKey: 'DEMOITEM', attachmentKey: 'DEMOPDF1', pages: [4], totalPages: 14, truncated: true }] }));
  await service.init();
  const config: Config = { version: 1, language: 'en-US', endpoints: [{ id: 'demo-api', name: 'Example API', baseURL: 'https://api.example.com/v1', stream: true }], models: [{ id: 'demo-model', endpointId: 'demo-api', name: 'Reading model', model: 'your-model-id' }], defaultModelId: 'demo-model', systemPrompt: 'Help me understand the paper. Distinguish the authors’ claims from your interpretation, cite the supplied PDF pages, and explain unfamiliar terms.' };
  await service.saveConfig(config);
  const scope: PaperScope = { libraryID: 1, itemKey: 'DEMOITEM', title: 'Nova: Real-Time Agentic Vision-Language Model Serving with Adaptive Cross-Stage Parallelization' };
  const conversation = service.forScope(scope);
  service.setReadingOptions(conversation.id, { currentPaper: true, relatedPapers: false });
  service.setDraft(conversation.id, 'How do the three workers in Nova fit together?');
  await service.send(conversation.id);
  const overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
  overlay.dataset.aiReaderShowcase = 'true';
  overlay.style.cssText = `position:fixed;top:16px;left:16px;width:${view === 'chat' ? 420 : 740}px;height:${Math.min(win.innerHeight - 32, 850)}px;z-index:2147483647;background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb,currentColor 18%,transparent);overflow:hidden;font-size:14px;`;
  const activeDetails = Array.from(doc.querySelectorAll<HTMLElement>('item-details')).find(node => node.getBoundingClientRect().width > 0 && win.getComputedStyle(node).visibility === 'visible');
  (activeDetails || doc.documentElement).append(overlay);
  const host: Host = { service, secretStore: secrets, rootURI: '', openSettings() {}, scopeForItem() { return null; }, openURL() {}, openSource() {}, copy() {} };
  const panel = view === 'chat' ? mountSidebar(overlay, scope, host) : undefined;
  const settings = view === 'settings' ? mountSettings(overlay, host) : undefined;
  if (panel) {
    const root = overlay.querySelector<HTMLElement>('.zar-sidebar')!;
    root.style.height = '100%';
    for (const node of overlay.querySelectorAll<HTMLDetailsElement>('.zar-message-sources')) node.open = true;
    const log = overlay.querySelector<HTMLElement>('.zar-messages')!;
    log.scrollTop = 0;
  }
  return {
    overlay,
    async close() { panel?.destroy(); settings?.(); overlay.remove(); await service.shutdown(); },
  };
}
