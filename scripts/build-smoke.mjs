import { build } from 'esbuild';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await build({
  entryPoints: [resolve(root, 'tests/zotero-sidebar.integration.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'AIReaderSidebarChecks',
  platform: 'browser',
  target: 'firefox140',
  outfile: resolve(root, 'build/sidebar-checks.js'),
});
await build({
  entryPoints: [resolve(root, 'tests/zotero-reading.integration.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'AIReaderReadingChecks',
  platform: 'browser',
  target: 'firefox140',
  outfile: resolve(root, 'build/reading-checks.js'),
});
await build({
  entryPoints: [resolve(root, 'tests/zotero-history.integration.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'AIReaderHistoryChecks',
  platform: 'browser',
  target: 'firefox140',
  outfile: resolve(root, 'build/history-checks.js'),
});
await build({
  entryPoints: [resolve(root, 'tests/zotero-settings.integration.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'AIReaderSettingsChecks',
  platform: 'browser',
  target: 'firefox140',
  outfile: resolve(root, 'build/settings-checks.js'),
});
console.log('Built sidebar, reading, history and settings checks for Zotero Run JavaScript');
