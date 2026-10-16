import { uiLanguage } from './i18n.js';

/** Parts of a page that can be translated; options.html has a switch for each, with `data-part` set to its key. */
export const PARTS = ['prTitle', 'prBody', 'comments', 'reviewComments', 'commitTitles', 'commitBodies', 'readme'];

/** Languages offered as the translation target. */
export const TARGETS = ['ru', 'en', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'tr', 'zh', 'ja', 'ko'];

// The browser's language when it is a target, English otherwise.
function defaultTarget() {
  const language = uiLanguage().split('-')[0].toLowerCase();
  return TARGETS.includes(language) ? language : 'en';
}

export const DEFAULT_SETTINGS = {
  provider: 'builtin', // an id from providers/index.js
  target: defaultTarget(),
  auto: true,
  parts: Object.fromEntries(PARTS.map((key) => [key, true])),
};

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    parts: { ...DEFAULT_SETTINGS.parts, ...settings?.parts },
  };
}

export function saveSettings(settings) {
  return chrome.storage.local.set({ settings });
}

/** Returns the name of language `code` in the browser's language. */
export function languageName(code, locale = uiLanguage()) {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
