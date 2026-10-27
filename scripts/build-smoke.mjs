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
await build({
  entryPoints: [resolve(root, 'tests/zotero-language.integration.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'AIReaderLanguageChecks',
  platform: 'browser',
  target: 'firefox140',
  outfile: resolve(root, 'build/language-checks.js'),
});
await build({ entryPoints: [resolve(root, 'tests/zotero-annotations.integration.ts')], bundle: true, format: 'iife', globalName: 'AIReaderAnnotationChecks', platform: 'browser', target: 'firefox140', outfile: resolve(root, 'build/annotation-checks.js') });
console.log('Built sidebar, reading, history, settings, language and annotation checks for Zotero Run JavaScript');

await build({ entryPoints: [resolve(root, 'tests/zotero-graphics.integration.ts')], bundle: true, format: 'iife', globalName: 'AIReaderGraphicsChecks', platform: 'browser', target: 'firefox140', outfile: resolve(root, 'build/graphics-checks.js') });

await build({ entryPoints: [resolve(root, 'tests/zotero-image-chat.integration.ts')], bundle: true, format: 'iife', globalName: 'AIReaderImageChatChecks', platform: 'browser', target: 'firefox140', outfile: resolve(root, 'build/image-chat-checks.js') });
