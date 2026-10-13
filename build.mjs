import * as esbuild from 'esbuild';
import { Resvg } from '@resvg/resvg-js';
import { zipSync } from 'fflate';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const watch = process.argv.includes('--watch');
const zip = process.argv.includes('--zip');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));

// Icon size -> source and padding. The Web Store wants the 128 px icon as 96 px artwork
// with 16 px of transparent padding; at 16 px the full icon blurs, so it has its own drawing.
const ICONS = {
  16: { svg: 'assets/icon-16.svg', padding: 0 },
  32: { svg: 'assets/icon.svg', padding: 0 },
  48: { svg: 'assets/icon.svg', padding: 0 },
  128: { svg: 'assets/icon.svg', padding: 16 },
};

async function renderIcons() {
  await mkdir('dist/icons', { recursive: true });
  for (const [size, { svg, padding }] of Object.entries(ICONS)) {
    const source = await readFile(svg, 'utf8');
    const art = Number(source.match(/viewBox="0 0 (\d+)/)[1]);
    const pad = (padding / (size - 2 * padding)) * art; // padding in the drawing's units
    const padded = source.replace(/viewBox="[^"]*"/, `viewBox="${-pad} ${-pad} ${art + 2 * pad} ${art + 2 * pad}"`);
    const png = new Resvg(padded, { fitTo: { mode: 'width', value: Number(size) } }).render().asPng();
    await writeFile(`dist/icons/icon-${size}.png`, png);
  }
}

// The version lives in package.json only.
async function writeManifest() {
  const manifest = JSON.parse(await readFile('static/manifest.json', 'utf8'));
  const withVersion = { manifest_version: manifest.manifest_version, version: pkg.version, ...manifest };
  await writeFile('dist/manifest.json', `${JSON.stringify(withVersion, null, 2)}\n`);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

// Packs dist/ for the Web Store: manifest.json at the root of the archive.
async function writeZip() {
  const files = {};
  for (const path of await listFiles('dist')) {
    files[relative('dist', path).split(sep).join('/')] = await readFile(path);
  }
  const name = `release/aspid-github-translator-${pkg.version}.zip`;
  await mkdir('release', { recursive: true });
  await writeFile(name, zipSync(files, { level: 9 }));
  console.log(`Packed ${name}`);
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
await writeManifest();
await renderIcons();

const context = await esbuild.context({
  entryPoints: {
    background: 'src/background.js',
    bridge: 'src/bridge.js',
    content: 'src/content.js',
    options: 'src/options.js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome138',
  outdir: 'dist',
  logLevel: 'info',
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
  if (zip) await writeZip();
}
