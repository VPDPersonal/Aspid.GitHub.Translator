import { uiLanguage } from './i18n.js';

/** Parts of a page that can be translated; options.html has a switch for each, with `data-part` set to its key. */
export const PARTS = ['prTitle', 'prBody', 'comments', 'reviewComments', 'commitTitles', 'commitBodies', 'readme'];

/**
 * Languages offered as the translation target: every language Chrome's built-in Translator supports,
 * as listed on https://developer.chrome.com/docs/ai/translator-api#supported-languages.
 */
export const TARGETS = [
  'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'kn', 'ko',
  'lt', 'mr', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'ta', 'te', 'th', 'tr', 'uk', 'vi', 'zh', 'zh-Hant',
];

// Browser tags whose language has another code in TARGETS.
const ALIASES = { iw: 'he', nb: 'no', nn: 'no' };

/** Returns the target that matches the BCP 47 language `tag` (`pt-BR`, `zh-TW`, `nb`), or undefined. */
export function targetFor(tag) {
  try {
    const locale = new Intl.Locale(tag).maximize();
    const language = ALIASES[locale.language] ?? locale.language;
    if (language === 'zh' && locale.script === 'Hant') return 'zh-Hant';
    return TARGETS.includes(language) ? language : undefined;
  } catch {
    return undefined;
  }
}

// The first of the browser's preferred languages (chrome://settings/languages) that is a target,
// then its UI language, then English.
function defaultTarget() {
  for (const tag of [...navigator.languages, uiLanguage()]) {
    const target = targetFor(tag);
    if (target) return target;
  }
  return 'en';
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

/** Returns the name of language `code` in `locale`, the browser's language by default. */
export function languageName(code, locale = uiLanguage()) {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
