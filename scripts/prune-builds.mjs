import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** Prune only this plugin's packages after the replacement was built successfully. */
export async function pruneBuilds(directory, version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid build version');
  const latest = `zotero-ai-reader-${version}.xpi`;
  const replacement = await stat(join(directory, latest));
  if (!replacement.isFile() || replacement.size === 0) throw new Error('Missing replacement package');
  const obsolete = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile()
    && /^zotero-ai-reader-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.xpi$/.test(entry.name) && entry.name !== latest);
  await Promise.all(obsolete.map(entry => unlink(join(directory, entry.name))));
  return obsolete.map(entry => entry.name);
}
