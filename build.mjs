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
  await cp('assets/icon.svg', 'dist/icons/icon.svg'); // the settings page header
}

// IBM Plex (OFL 1.1) for the settings page, copied from the pinned @fontsource packages: only the faces
// the page uses, in the Latin, Latin Extended, Vietnamese and Cyrillic subsets, plus Greek for IBM Plex
// Sans (Serif and Mono have no Greek). Each subset is its own @font-face rule with the package's
// unicode-range, so the page loads only the subsets it shows. Characters outside them, such as Arabic,
// Hebrew, Indic, Thai and CJK scripts and Greek in headings and code, fall back to the system fonts in
// the --sans/--serif/--mono stacks of options.html.
const FONTS = [
  { family: 'IBM Plex Sans', pkg: 'ibm-plex-sans', weights: [400, 500, 600], subsets: ['cyrillic', 'greek', 'vietnamese', 'latin-ext', 'latin'] },
  { family: 'IBM Plex Serif', pkg: 'ibm-plex-serif', weights: [600], subsets: ['cyrillic', 'vietnamese', 'latin-ext', 'latin'] },
  { family: 'IBM Plex Mono', pkg: 'ibm-plex-mono', weights: [400], subsets: ['cyrillic', 'vietnamese', 'latin-ext', 'latin'] },
];
// From the packages' <subset>-<weight>.css, the same for every family and weight. The ranges overlap
// (U+0304, U+0308, U+0329), and for a shared character the browser takes the face declared last, so
// the subsets keep @fontsource's order with latin last.
const SUBSETS = {
  cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
  vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
};

async function copyFonts() {
  await mkdir('dist/fonts', { recursive: true });
  const rules = [];
  for (const { family, pkg: name, weights, subsets } of FONTS) {
    const dir = `node_modules/@fontsource/${name}`;
    await cp(`${dir}/LICENSE`, `dist/fonts/${name}-LICENSE.txt`);
    for (const weight of weights) {
      for (const subset of subsets) {
        const file = `${name}-${subset}-${weight}-normal.woff2`;
        await cp(`${dir}/files/${file}`, `dist/fonts/${file}`);
        rules.push(`@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: swap; `
          + `src: url('${file}') format('woff2'); unicode-range: ${SUBSETS[subset]}; }`);
      }
    }
  }
  await writeFile('dist/fonts/fonts.css', `${rules.join('\n')}\n`);
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
await copyFonts();

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
