import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'addon/manifest.json'), 'utf8'));
if (manifest.version !== version) throw new Error('package.json and manifest.json versions must match');
await mkdir(resolve(root, 'addon/content'), {recursive: true});
await build({entryPoints:[resolve(root,'src/main.ts')],bundle:true,format:'iife',globalName:'AIReaderBundle',platform:'browser',target:'firefox140',outfile:resolve(root,'addon/content/main.js'),legalComments:'eof',sourcemap:false});
await mkdir(resolve(root,'addon/content/katex'),{recursive:true});
await cp(resolve(root,'node_modules/katex/dist/katex.min.css'),resolve(root,'addon/content/katex/katex.min.css'));
await cp(resolve(root,'node_modules/katex/dist/fonts'),resolve(root,'addon/content/katex/fonts'),{recursive:true});
const licenses = [await readFile(resolve(root, 'LICENSE'), 'utf8')];
const lock = JSON.parse(await readFile(resolve(root,'package-lock.json'),'utf8'));
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || metadata.dev) continue;
  const files = await readdir(resolve(root,path));
  for (const file of files.filter(name => /^(license|copying)(\.|$)/i.test(name))) {
    licenses.push(`${path}\n${await readFile(resolve(root,path,file),'utf8')}`);
  }
}
await writeFile(resolve(root,'addon/THIRD-PARTY-LICENSES.txt'),licenses.join('\n\n'));
await mkdir(resolve(root,'build'),{recursive:true});
execFileSync('python3',['-c',`import pathlib,zipfile\nr=pathlib.Path(${JSON.stringify(root)})\nwith zipfile.ZipFile(r/'build/zotero-ai-reader-${version}.xpi','w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted((r/'addon').rglob('*')):\n  if p.is_file() and p.name != '.DS_Store':\n   info=zipfile.ZipInfo(str(p.relative_to(r/'addon')),date_time=(2020,1,1,0,0,0))\n   info.compress_type=zipfile.ZIP_DEFLATED\n   info.external_attr=0o100644 << 16\n   z.writestr(info,p.read_bytes())\n`]);
const hash = createHash('sha256').update(await readFile(resolve(root, `build/zotero-ai-reader-${version}.xpi`))).digest('hex');
await writeFile(resolve(root, 'updates.json'), JSON.stringify({ addons: {
  [manifest.applications.zotero.id]: { updates: [{
    version,
    update_link: `https://github.com/kcodea516/zotero-ai-reader/releases/download/v${version}/zotero-ai-reader-${version}.xpi`,
    update_hash: `sha256:${hash}`,
    applications: { zotero: {
      strict_min_version: manifest.applications.zotero.strict_min_version,
      strict_max_version: manifest.applications.zotero.strict_max_version,
    } },
  }] },
} }, null, 2) + '\n');
console.log(`Built build/zotero-ai-reader-${version}.xpi`);
