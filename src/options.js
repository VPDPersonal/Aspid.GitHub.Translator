import { DEFAULT_SETTINGS, PARTS, languageName, loadSettings, saveSettings } from './settings.js';
import { PROVIDERS, getProvider } from './providers/index.js';

const TARGETS = ['ru', 'en', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'tr', 'zh', 'ja', 'ko'];

const $ = (id) => document.getElementById(id);
const form = $('form');
const status = $('status');

function showStatus(text, kind = '') {
  status.textContent = text;
  status.className = kind;
}

function readForm() {
  return {
    provider: form.querySelector('input[name="provider"]:checked')?.value ?? DEFAULT_SETTINGS.provider,
    target: $('target').value,
    auto: $('auto').checked,
    parts: Object.fromEntries(PARTS.map(([key]) => [key, $(`part-${key}`).checked])),
  };
}

function renderProviders(selected) {
  for (const provider of PROVIDERS) {
    const label = document.createElement('label');
    label.className = 'radio';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'provider';
    input.value = provider.id;
    input.checked = provider.id === selected;
    input.hidden = PROVIDERS.length === 1; // nothing to choose from yet
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = provider.hint;
    const text = document.createElement('span');
    text.append(provider.title, document.createElement('br'), hint);
    label.append(input, text);
    $('providers').append(label);
  }
}

async function init() {
  const settings = await loadSettings();
  for (const code of TARGETS) $('target').add(new Option(`${languageName(code)} (${code})`, code));
  $('target').value = settings.target;
  $('auto').checked = settings.auto;
  renderProviders(getProvider(settings.provider).id);
  for (const [key, title] of PARTS) {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `part-${key}`;
    input.checked = settings.parts[key];
    label.append(input, ` ${title}`);
    $('parts').append(label);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveSettings(readForm());
  showStatus('Сохранено. Открытые вкладки GitHub подхватят настройки сами.', 'ok');
});

init();
