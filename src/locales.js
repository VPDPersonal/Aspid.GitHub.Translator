// Every static/_locales/<dir>/messages.json goes into the bundle that imports this module:
// esbuild expands the template literal below into the list of matching files.

// Chrome's locale folders for targets that have no folder of their own name.
const FOLDERS = { zh: ['zh_CN'], 'zh-Hant': ['zh_TW'], pt: ['pt_BR', 'pt_PT'] };

/** Returns the parsed messages.json for target language `code`, or null when the extension has none. */
export async function loadMessages(code) {
  for (const folder of FOLDERS[code] ?? [code]) {
    try {
      return (await import(`../static/_locales/${folder}/messages.json`)).default;
    } catch {
      // No such locale in the bundle: try the next folder.
    }
  }
  return null;
}
