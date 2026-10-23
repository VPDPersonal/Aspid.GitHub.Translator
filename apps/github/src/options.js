import { TARGET_LANGUAGES } from '@aspid-lingo/core/languages';
import { localizePage, t, uiLanguage, useMessages } from './i18n.js';
import { loadMessages } from './locales.js';
import { DEFAULT_SETTINGS, PARTS, languageName, loadSettings, saveSettings } from './settings.js';
import { PROVIDERS, getProvider } from './providers/index.js';

const $ = (id) => document.getElementById(id);
const form = $('form');
const partSwitch = (key) => form.querySelector(`[data-part="${key}"]`);
let hideToast;

function readForm() {
  return {
    provider: form.querySelector('input[name="provider"]:checked')?.value ?? DEFAULT_SETTINGS.provider,
    target: $('target').value,
    auto: $('auto').checked,
    parts: Object.fromEntries(PARTS.map((key) => [key, partSwitch(key).checked])),
  };
}

function showCount() {
  const on = PARTS.filter((key) => partSwitch(key).checked).length;
  $('count').textContent = t('settingsPartsCount', on, PARTS.length);
}

function showSaved() {
  clearTimeout(hideToast);
  $('toast-text').textContent = t('settingsSaved');
  $('toast').classList.add('shown');
  hideToast = setTimeout(() => $('toast').classList.remove('shown'), 3000);
}

function renderProviders(selected) {
  const template = $('provider-row').content.firstElementChild;
  $('providers').replaceChildren();
  for (const provider of PROVIDERS) {
    const row = template.cloneNode(true);
    const input = row.querySelector('input');
    input.value = provider.id;
    input.checked = provider.id === selected;
    input.hidden = PROVIDERS.length === 1; // nothing to choose from yet
    row.querySelector('.name').textContent = provider.title;
    $('providers').append(row);
  }
}

// Each language in the page's language, with its own name after it, so that a page switched
// to a language the user does not read still shows the way back.
function renderTargets(selected) {
  const capitalize = (name, locale) => name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  const targets = TARGET_LANGUAGES.map((code) => {
    const name = capitalize(languageName(code), uiLanguage());
    const own = capitalize(languageName(code, code), code);
    return { code, name, label: name === own ? name : `${name} — ${own}` };
  }).sort((a, b) => a.name.localeCompare(b.name, uiLanguage()));
  $('target').replaceChildren(...targets.map(({ code, label }) => new Option(label, code)));
  $('target').value = selected;
}

// Arabic and Hebrew read right to left; the page's CSS uses logical properties, so `dir` mirrors it.
function textDirection(language) {
  const locale = new Intl.Locale(language);
  return (locale.getTextInfo?.() ?? locale.textInfo)?.direction ?? 'ltr';
}

let shownTarget;

// The page speaks the target language when the extension has its strings, the browser's otherwise.
async function showLanguage(target) {
  shownTarget = target;
  const messages = await loadMessages(target);
  if (shownTarget !== target) return; // another language was picked meanwhile
  useMessages(messages, target);
  document.documentElement.lang = uiLanguage();
  document.documentElement.dir = textDirection(uiLanguage());
  document.title = t('settingsTitle');
  localizePage();
  renderTargets(target);
  renderProviders(form.querySelector('input[name="provider"]:checked')?.value);
  showCount();
}

async function init() {
  const settings = await loadSettings();
  $('auto').checked = settings.auto;
  for (const key of PARTS) partSwitch(key).checked = settings.parts[key];
  renderProviders(getProvider(settings.provider).id);
  await showLanguage(settings.target);
}

// Every change is saved at once: open GitHub tabs listen to chrome.storage and apply it.
form.addEventListener('change', async (event) => {
  showCount();
  await saveSettings(readForm());
  if (event.target === $('target')) await showLanguage($('target').value);
  showSaved();
});
form.addEventListener('submit', (event) => event.preventDefault());

init();
