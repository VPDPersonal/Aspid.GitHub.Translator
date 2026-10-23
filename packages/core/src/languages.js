/**
 * Languages offered as the translation target: every language Chrome's built-in Translator supports,
 * as listed on https://developer.chrome.com/docs/ai/translator-api#supported-languages.
 */
export const TARGET_LANGUAGES = [
  'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'kn', 'ko',
  'lt', 'mr', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'ta', 'te', 'th', 'tr', 'uk', 'vi', 'zh', 'zh-Hant',
];

// Language tags whose language has another code in TARGET_LANGUAGES.
const ALIASES = { iw: 'he', nb: 'no', nn: 'no' };

/** Returns the target that matches the BCP 47 language `tag` (`pt-BR`, `zh-TW`, `nb`), or undefined. */
export function targetFor(tag) {
  try {
    const locale = new Intl.Locale(tag).maximize();
    const language = ALIASES[locale.language] ?? locale.language;
    if (language === 'zh' && locale.script === 'Hant') return 'zh-Hant';
    return TARGET_LANGUAGES.includes(language) ? language : undefined;
  } catch {
    return undefined;
  }
}

/** Returns the target of the first language tag in `tags`, most preferred first, that has one, or English. */
export function preferredTarget(tags) {
  for (const tag of tags) {
    const target = targetFor(tag);
    if (target) return target;
  }
  return 'en';
}

/** Returns the name of language `code` in `locale`, or the code when the runtime has no name for it. */
export function languageName(code, locale) {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Whether language tags `a` and `b` are the same language, regions and scripts aside. */
export const sameLanguage = (a, b) => a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();
