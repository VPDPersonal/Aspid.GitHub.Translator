import { localizePage, t, uiLanguage } from './i18n.js';
import { DEFAULT_SETTINGS, PARTS, TARGETS, languageName, loadSettings, saveSettings } from './settings.js';
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

async function init() {
  document.documentElement.lang = uiLanguage();
  document.title = t('settingsTitle');
  localizePage();
  const settings = await loadSettings();
  const capitalize = (name) => name.charAt(0).toLocaleUpperCase(uiLanguage()) + name.slice(1);
  const targets = TARGETS.map((code) => ({ code, name: capitalize(languageName(code)) }))
    .sort((a, b) => a.name.localeCompare(b.name, uiLanguage()));
  for (const { code, name } of targets) $('target').add(new Option(`${name} (${code})`, code));
  $('target').value = settings.target;
  $('auto').checked = settings.auto;
  renderProviders(getProvider(settings.provider).id);
  for (const key of PARTS) partSwitch(key).checked = settings.parts[key];
  showCount();
}

// Every change is saved at once: open GitHub tabs listen to chrome.storage and apply it.
form.addEventListener('change', async () => {
  showCount();
  await saveSettings(readForm());
  showSaved();
});
form.addEventListener('submit', (event) => event.preventDefault());

init();
