// Every static/_locales/<dir>/messages.json goes into the bundle that imports this module:
// esbuild expands the template literal below into the list of matching files.
import { loadMessages as load } from '@aspid-lingo/browser/locales';

/** Returns the parsed messages.json for target language `code`, or null when the extension has none. */
export const loadMessages = (code) => load(code, (folder) => import(`../static/_locales/${folder}/messages.json`));
