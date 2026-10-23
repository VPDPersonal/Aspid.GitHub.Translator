import { languageName as nameIn, preferredTarget } from '@aspid-lingo/core/languages';
import { uiLanguage } from './i18n.js';

/** Parts of a page that can be translated; options.html has a switch for each, with `data-part` set to its key. */
export const PARTS = ['prTitle', 'prBody', 'comments', 'reviewComments', 'commitTitles', 'commitBodies', 'readme'];

export const DEFAULT_SETTINGS = {
  provider: 'builtin', // an id from providers/index.js
  // The first of the browser's preferred languages (chrome://settings/languages) that is a target,
  // then its UI language, then English.
  target: preferredTarget([...navigator.languages, uiLanguage()]),
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
export const languageName = (code, locale = uiLanguage()) => nameIn(code, locale);
