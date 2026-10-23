// UI strings live in static/_locales/<lang>/messages.json; Chrome picks the browser's language
// and falls back to English. The settings page shows them in the target language instead
// (see useMessages). bridge.js runs in the page's main world without chrome.i18n,
// so it reports error codes and the content script turns them into text.

// The messages.json that replaces chrome.i18n and its locale, or null for the browser's language.
let messages = null;
let language = null;

/**
 * Makes `t` read from `table`, a parsed messages.json in `locale`; keys it lacks still come from chrome.i18n.
 * Null returns to the browser's language.
 */
export function useMessages(table, locale) {
  messages = table;
  language = table ? locale : null;
}

/** Returns the message `key` with its placeholders filled from `substitutions`, in order. */
export function t(key, ...substitutions) {
  const strings = substitutions.map(String);
  const entry = messages?.[key];
  if (!entry) return chrome.i18n.getMessage(key, strings) || key;
  // The format of chrome.i18n: $NAME$ is a named placeholder, $1..$9 a substitution, $$ a dollar sign.
  const named = entry.message.replace(/\$(\w+)\$/g, (match, name) => entry.placeholders?.[name.toLowerCase()]?.content ?? match);
  return named.replace(/\$(\$|[1-9])/g, (match, n) => (n === '$' ? '$' : strings[n - 1] ?? ''));
}

/** The language of the UI strings, such as `en-US`. */
export const uiLanguage = () => language ?? chrome.i18n.getUILanguage();

/** Fills every `[data-i18n]` element under `root` with its message. */
export function localizePage(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}
