// Build helpers for a browser extension that uses this package.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The script for the page's main world, where Chrome exposes its built-in Translator and LanguageDetector
 * APIs. An extension bundles it as an entry point of its own and lists it as a `"world": "MAIN"` content script.
 */
export const bridgeEntry = here('src/bridge.js');

/**
 * Adds the UI strings of this package to the extension built in `dir`, whose own strings are already
 * in `dir/_locales`. Both must have the same locales and no key in common.
 */
export async function writeLocales(dir) {
  const shared = here('_locales');
  const folders = (await readdir(shared)).sort();
  const own = (await readdir(join(dir, '_locales'))).sort();
  if (folders.join() !== own.join()) {
    throw new Error(`${join(dir, '_locales')} has locales ${own.join(', ')}, the shared strings have ${folders.join(', ')}`);
  }
  for (const folder of folders) {
    const path = join(dir, '_locales', folder, 'messages.json');
    const messages = JSON.parse(await readFile(path, 'utf8'));
    const strings = JSON.parse(await readFile(join(shared, folder, 'messages.json'), 'utf8'));
    const twice = Object.keys(strings).filter((key) => Object.hasOwn(messages, key));
    if (twice.length) throw new Error(`${path} repeats shared strings: ${twice.join(', ')}`);
    await writeFile(path, `${JSON.stringify({ ...messages, ...strings }, null, 2)}\n`);
  }
}
