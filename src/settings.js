export const PARTS = [
  ['prTitle', 'Название PR'],
  ['prBody', 'Описание PR'],
  ['comments', 'Комментарии в обсуждении'],
  ['reviewComments', 'Комментарии к коду (ревью)'],
  ['commitTitles', 'Заголовки коммитов'],
  ['commitBodies', 'Описания коммитов'],
  ['readme', 'README и .md-файлы'],
];

export const DEFAULT_SETTINGS = {
  provider: 'chrome', // 'chrome' (built-in on-device Translator API) or 'claude'
  target: 'ru',
  auto: true,
  apiKey: '',
  model: 'claude-haiku-5-5',
  parts: Object.fromEntries(PARTS.map(([key]) => [key, true])),
};

export const CACHE_PREFIX = 'tr:';

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

export function languageName(code, locale = 'ru') {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
