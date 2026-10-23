import * as esbuild from 'esbuild';
import { zipSync } from 'fflate';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { writeExtensionIcons, writeFonts } from '@aspid-lingo/brand';
import { bridgeEntry, writeLocales } from '@aspid-lingo/browser/build';

const watch = process.argv.includes('--watch');
const zip = process.argv.includes('--zip');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));

// One folder per browser. Chrome is the only one so far.
const OUT = 'dist/chrome';

// The version lives in package.json only.
async function writeManifest() {
  const manifest = JSON.parse(await readFile('static/manifest.json', 'utf8'));
  const withVersion = { manifest_version: manifest.manifest_version, version: pkg.version, ...manifest };
  await writeFile(`${OUT}/manifest.json`, `${JSON.stringify(withVersion, null, 2)}\n`);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

// Packs the build for the Web Store: manifest.json at the root of the archive.
async function writeZip() {
  const files = {};
  for (const path of await listFiles(OUT)) {
    files[relative(OUT, path).split(sep).join('/')] = await readFile(path);
  }
  const name = `release/aspid-lingo-github-chrome-${pkg.version}.zip`;
  await mkdir('release', { recursive: true });
  await writeFile(name, zipSync(files, { level: 9 }));
  console.log(`Packed ${name}`);
}

await rm('dist', { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp('static', OUT, { recursive: true });
await writeLocales(OUT);
await writeManifest();
await writeExtensionIcons(`${OUT}/icons`);
await writeFonts(`${OUT}/fonts`);

const context = await esbuild.context({
  entryPoints: {
    background: 'src/background.js',
    bridge: bridgeEntry,
    content: 'src/content.js',
    options: 'src/options.js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome138',
  outdir: OUT,
  logLevel: 'info',
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
  if (zip) await writeZip();
}
