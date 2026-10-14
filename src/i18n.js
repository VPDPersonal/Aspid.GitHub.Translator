// UI strings live in static/_locales/<lang>/messages.json; Chrome picks the browser's language
// and falls back to English. bridge.js runs in the page's main world without chrome.i18n,
// so it reports error codes and the content script turns them into text.

/** Returns the message `key` with its placeholders filled from `substitutions`, in order. */
export const t = (key, ...substitutions) => chrome.i18n.getMessage(key, substitutions.map(String)) || key;

/** The browser's UI language, such as `en-US`. */
export const uiLanguage = () => chrome.i18n.getUILanguage();

/** Fills every `[data-i18n]` element under `root` with its message. */
export function localizePage(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}
