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
console.log('Built build/sidebar-checks.js and build/reading-checks.js for Zotero Run JavaScript');
