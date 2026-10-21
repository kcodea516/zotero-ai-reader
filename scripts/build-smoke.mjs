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
console.log('Built build/sidebar-checks.js for Zotero Run JavaScript');
