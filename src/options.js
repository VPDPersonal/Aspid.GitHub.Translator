import { CACHE_PREFIX, DEFAULT_SETTINGS, PARTS, languageName, loadSettings, saveSettings } from './settings.js';

const TARGETS = ['ru', 'en', 'uk', 'be', 'kk', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'tr', 'zh', 'ja', 'ko'];

const $ = (id) => document.getElementById(id);
const form = $('form');
const status = $('status');

function showStatus(text, kind = '') {
  status.textContent = text;
  status.className = kind;
}

function readForm() {
  return {
    provider: form.elements.provider.value || DEFAULT_SETTINGS.provider,
    target: $('target').value,
    auto: $('auto').checked,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim() || DEFAULT_SETTINGS.model,
    parts: Object.fromEntries(PARTS.map(([key]) => [key, $(`part-${key}`).checked])),
  };
}

function syncClaudeSection() {
  $('claude').disabled = form.elements.provider.value !== 'claude';
}

async function init() {
  const settings = await loadSettings();
  for (const code of TARGETS) $('target').add(new Option(`${languageName(code)} (${code})`, code));
  $('target').value = settings.target;
  $('auto').checked = settings.auto;
  form.elements.provider.value = settings.provider;
  $('apiKey').value = settings.apiKey;
  $('model').value = settings.model;
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
  syncClaudeSection();
}

form.addEventListener('change', syncClaudeSection);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveSettings(readForm());
  showStatus('Сохранено. Открытые вкладки GitHub подхватят настройки сами.', 'ok');
});

$('test').addEventListener('click', async () => {
  const settings = readForm();
  if (!settings.apiKey) {
    showStatus('Введите API-ключ.', 'err');
    return;
  }
  await saveSettings(settings);
  showStatus('Проверяю…');
  const response = await chrome.runtime.sendMessage({
    type: 'claude-translate',
    segments: ['Looks good to me, but please rebase onto <x0/> first.'],
    target: settings.target,
  });
  if (response?.error) showStatus(`Ошибка: ${response.error}`, 'err');
  else showStatus(`Ключ работает. Пример: «${response.translations[0]}»`, 'ok');
});

$('clearCache').addEventListener('click', async () => {
  const keys = Object.keys(await chrome.storage.local.get(null)).filter((key) => key.startsWith(CACHE_PREFIX));
  await chrome.storage.local.remove(keys);
  showStatus(`Кэш очищен (${keys.length} записей).`, 'ok');
});

init();
