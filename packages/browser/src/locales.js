// Every _locales/<dir>/messages.json of this package goes into the bundle that imports this module:
// esbuild expands the template literal below into the list of matching files.

// Chrome's locale folders for targets that have no folder of their own name.
const FOLDERS = { zh: ['zh_CN'], 'zh-Hant': ['zh_TW'], pt: ['pt_BR', 'pt_PT'] };

/**
 * Returns the parsed messages.json for target language `code`, the shared strings with the extension's own,
 * or null when the extension has none. `importOwn(folder)` imports the extension's messages.json from
 * a locale folder; it is a dynamic import in the extension, so its bundle gets every locale too.
 */
export async function loadMessages(code, importOwn) {
  for (const folder of FOLDERS[code] ?? [code]) {
    try {
      const [own, shared] = await Promise.all([importOwn(folder), import(`../_locales/${folder}/messages.json`)]);
      return { ...own.default, ...shared.default };
    } catch {
      // No such locale in the bundle: try the next folder.
    }
  }
  return null;
}
