import { preferredTarget } from '@aspid-lingo/core/languages';
import { uiLanguage } from './i18n.js';
import { DEFAULT_PROVIDER } from './providers/index.js';

/**
 * Returns the default settings of an extension whose pages have these `parts`, the parts of a page
 * that can be translated. Its settings page has a switch for each, with `data-part` set to its key.
 */
export function defaultSettings(parts) {
  return {
    provider: DEFAULT_PROVIDER,
    // The first of the browser's preferred languages (chrome://settings/languages) that is a target,
    // then its UI language, then English.
    target: preferredTarget([...navigator.languages, uiLanguage()]),
    auto: true,
    parts: Object.fromEntries(parts.map((key) => [key, true])),
  };
}

/** Returns the stored settings over `defaults`. */
export async function loadSettings(defaults) {
  const { settings } = await chrome.storage.local.get('settings');
  return {
    ...defaults,
    ...settings,
    parts: { ...defaults.parts, ...settings?.parts },
  };
}

export function saveSettings(settings) {
  return chrome.storage.local.set({ settings });
}
