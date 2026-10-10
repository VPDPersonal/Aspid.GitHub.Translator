import { CACHE_PREFIX, loadSettings, languageName } from './settings.js';
import {
  applyTranslation, cloneForTranslation, collectPlainSegments, collectSegments, hasLetters, protectNames,
  protectPrefix, stripTags,
} from './dom.js';

// Pull requests (all tabs), single commits and commit lists.
const PAGE_PATH = /^\/[^/]+\/[^/]+\/(?:pull\/\d+|commit\/[0-9a-f]{7,40}|commits(?=\/|$))/;
// Repository home, folders and files. The button shows up there only when a README is rendered.
const REPO_PATH = /^\/[^/]+\/[^/]+(?:\/(?:tree|blob)\/.+)?\/?$/;
const README_SELECTOR = 'article.markdown-body[itemprop="text"], #readme .markdown-body';
const EXCLUDE_SELECTOR = [
  'form', '[contenteditable="true"]', '.js-preview-body', '[data-ght-clone]', '.prose-diff',
  '.rich-diff', '.js-file-content', '[class*="MarkdownEditor"]', '[class*="markdown-editor"]',
].join(',');
const MAX_CHUNK_CHARS = 4000;
const MAX_CLAUDE_REQUESTS = 4;

// What can be translated. `mode` picks the segmenter and the UI:
//   block  - rendered markdown; a label above it has a per-comment toggle
//   inline - a one-line title; the original is in the tooltip
//   plain  - a plain-text commit body; the original is in the tooltip
const TARGETS = [
  {
    mode: 'inline',
    kind: 'prTitle',
    selector: 'h1 .markdown-title, h2[class*="PageHeader-Title"] .markdown-title, .gh-header-title .js-issue-title',
  },
  {
    mode: 'inline',
    kind: 'commitTitles',
    selector: [
      '.js-details-container code:has(> a.markdown-title)', // PR conversation timeline
      '[data-testid="commit-row-item"] h4 > span', // commit lists
      '[class*="commitMessageContainer"] > span:not(.extended-commit-description-container)', // commit page
    ].join(','),
  },
  {
    mode: 'plain',
    kind: 'commitBodies',
    selector: '.extended-commit-description-container, .js-details-container .Details-content--hidden > pre',
  },
  { mode: 'block', kind: null, selector: '.markdown-body' },
];

function markdownKind(el) {
  if (el.matches(README_SELECTOR)) return 'readme';
  if (el.closest('[id^="pullrequest-"]')) return 'prBody';
  const review = [
    '.review-comment', '.review-thread-component', '.js-resolvable-timeline-thread-container',
    '[id^="discussion_r"]', '[id^="pullrequestreview-"]', '[data-testid*="review-thread"]',
    '[class*="ReviewThread"]',
  ].join(',');
  return el.closest(review) ? 'reviewComments' : 'comments';
}

const state = {
  settings: null,
  url: '',
  pageKey: '',
  pageAlways: false,
  active: false,
  showOriginal: false,
  needsActivation: false,
  downloadProgress: null,
  jobs: new Map(), // translated element -> job
  queue: [],
  running: 0,
};
let fab = null;

// ---------------------------------------------------------------------------------------------
// Bridge to the MAIN-world script that owns the built-in Translator API.

let bridgeSeq = 0;
const bridgePending = new Map();

window.addEventListener('ght:res', (event) => {
  const message = JSON.parse(event.detail);
  const pending = bridgePending.get(message.id);
  if (!pending) return;
  bridgePending.delete(message.id);
  if (message.error) pending.reject(Object.assign(new Error(message.error), { code: message.code }));
  else pending.resolve(message.result);
});

window.addEventListener('ght:progress', (event) => {
  const { loaded } = JSON.parse(event.detail);
  state.downloadProgress = loaded < 1 ? loaded : null;
  updateFab();
});

// Dispatch is synchronous, so a call made inside a click handler keeps the user activation.
function bridge(op, args) {
  return new Promise((resolve, reject) => {
    const id = ++bridgeSeq;
    bridgePending.set(id, { resolve, reject });
    window.dispatchEvent(new CustomEvent('ght:req', { detail: JSON.stringify({ id, op, args }) }));
  });
}

// ---------------------------------------------------------------------------------------------
// Claude: per-item cache in front of a batcher that packs small items into one request.

const claude = { queue: [], timer: 0, inflight: 0 };
const claudePending = new Map(); // cache key -> promise, so equal items share one request

function chunkTexts(texts) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const text of texts) {
    if (current.length && size + text.length > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function requestClaude(texts, target) {
  return new Promise((resolve, reject) => {
    claude.queue.push({ texts, target, resolve, reject, size: texts.join('').length });
    claude.timer ||= setTimeout(flushClaude, 40);
  });
}

function flushClaude() {
  claude.timer = 0;
  while (claude.inflight < MAX_CLAUDE_REQUESTS && claude.queue.length) {
    const batch = [claude.queue.shift()];
    let size = batch[0].size;
    while (claude.queue.length && claude.queue[0].target === batch[0].target
      && size + claude.queue[0].size <= MAX_CHUNK_CHARS) {
      size += claude.queue[0].size;
      batch.push(claude.queue.shift());
    }
    claude.inflight++;
    sendClaudeBatch(batch).finally(() => {
      claude.inflight--;
      flushClaude();
    });
  }
}

async function sendClaudeBatch(batch) {
  try {
    const segments = batch.flatMap((item) => item.texts);
    const response = await chrome.runtime.sendMessage({ type: 'claude-translate', segments, target: batch[0].target });
    if (!response) throw new Error('фоновый скрипт не ответил');
    if (response.error) throw new Error(response.error);
    let offset = 0;
    for (const item of batch) {
      const translations = response.translations.slice(offset, offset + item.texts.length);
      offset += item.texts.length;
      item.resolve({ translations, sourceLanguage: response.sourceLanguage });
    }
  } catch (error) {
    // One bad item must not fail its neighbours: retry each item on its own.
    if (batch.length > 1) await Promise.all(batch.map((item) => sendClaudeBatch([item])));
    else batch[0].reject(error);
  }
}

async function translateWithClaude(texts, target) {
  const key = CACHE_PREFIX + await sha256(JSON.stringify([state.settings.model, target, texts]));
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached) return cached;
  if (!claudePending.has(key)) {
    const promise = Promise.all(chunkTexts(texts).map((chunk) => requestClaude(chunk, target)))
      .then(async (results) => {
        const value = {
          translations: results.flatMap((r) => r.translations),
          sourceLanguage: results[0].sourceLanguage,
        };
        await chrome.storage.local.set({ [key]: value });
        return value;
      })
      .finally(() => claudePending.delete(key));
    claudePending.set(key, promise);
  }
  return claudePending.get(key);
}

// ---------------------------------------------------------------------------------------------
// Built-in Chrome translator.

const sameLanguage = (a, b) => a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();

async function detectLanguage(text, required) {
  try {
    const [top] = await bridge('detect', { text });
    return top ?? null;
  } catch (error) {
    if (required) throw error;
    return null; // Claude can still translate without a local detector.
  }
}

async function translateWithChrome(texts, source, target) {
  try {
    return await bridge('translate', { source, target, texts });
  } catch (error) {
    error.source = source;
    if (error.code === 'NotSupportedError') {
      error.message = `пара ${languageName(source)} → ${languageName(target)} не поддерживается встроенным переводчиком`;
    }
    throw error;
  }
}

// The built-in translator has no notion of code names, so hide them behind placeholders first.
async function translateNamesSafely(segments, source, target) {
  const capitalized = sameLanguage(source, 'en');
  for (const segment of segments) protectNames(segment, { capitalized });
  const pending = segments.filter((segment) => hasLetters(stripTags(segment.text)));
  if (!pending.length) return segments.map((segment) => segment.text);
  const translated = await translateWithChrome(pending.map((s) => s.text), source, target);
  const bySegment = new Map(pending.map((segment, i) => [segment, translated[i]]));
  return segments.map((segment) => bySegment.get(segment) ?? segment.text);
}

// ---------------------------------------------------------------------------------------------
// Translation of one element.

/** Returns a translated copy of the job's element, or null when there is nothing to translate. */
async function translateElement(job) {
  const { provider, target } = state.settings;
  const clone = cloneForTranslation(job.el);
  const segments = job.mode === 'plain' ? collectPlainSegments(clone) : collectSegments(clone);
  if (!segments.length) return null;
  if (job.mode === 'inline') segments.forEach(protectPrefix);

  const sample = segments.map((s) => stripTags(s.text)).join('\n').slice(0, 2000);
  if (!hasLetters(sample)) return null;
  const detected = await detectLanguage(sample, provider === 'chrome');
  if (detected && (detected.lang === 'und' || (sameLanguage(detected.lang, target) && detected.confidence >= 0.5))) {
    return null;
  }

  let translations;
  let source = detected?.lang;
  if (provider === 'claude') {
    const result = await translateWithClaude(segments.map((s) => s.text), target);
    translations = result.translations;
    source ??= result.sourceLanguage;
  } else {
    // Short titles often get a low-confidence guess; GitHub text is English far more often.
    if (!source || detected.confidence < 0.4) source = 'en';
    if (sameLanguage(source, target)) return null;
    translations = await translateNamesSafely(segments, source, target);
  }

  let changed = false;
  segments.forEach((segment, i) => {
    const translated = translations[i]?.trim();
    if (translated && translated !== segment.text) {
      applyTranslation(segment, translated);
      changed = true;
    }
  });
  return changed ? { clone, source } : null;
}

// ---------------------------------------------------------------------------------------------
// Jobs: one per element, translated lazily when it scrolls near the viewport.

const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    io.unobserve(entry.target);
    const job = state.jobs.get(entry.target);
    if (job?.status === 'pending') enqueue(job);
  }
}, { rootMargin: '600px 0px' });

const isCurrent = (job) => state.jobs.get(job.el) === job;

function scan() {
  if (!state.active) return;
  const { parts } = state.settings;
  for (const target of TARGETS) {
    if (target.kind && !parts[target.kind]) continue;
    for (const el of document.querySelectorAll(target.selector)) {
      if (state.jobs.has(el) || el.closest(EXCLUDE_SELECTOR) || !hasLetters(el.textContent)) continue;
      let kind = target.kind;
      if (target.mode === 'block') {
        if (el.querySelector('.markdown-body')) continue; // translate the innermost body only
        kind = markdownKind(el);
        if (!parts[kind]) continue;
      }
      const job = {
        el, kind, mode: target.mode, status: 'pending', showOriginal: state.showOriginal,
        clone: null, label: null, source: null, text: '',
      };
      state.jobs.set(el, job);
      io.observe(el);
    }
  }
}

function enqueue(job) {
  job.status = 'queued';
  state.queue.push(job);
  pump();
}

function pump() {
  // Claude jobs mostly wait on the batcher, so let many of them queue up for packing.
  const limit = state.settings.provider === 'chrome' ? 1 : 24;
  while (state.running < limit && state.queue.length) {
    const job = state.queue.shift();
    if (!isCurrent(job)) continue;
    state.running++;
    processJob(job).finally(() => {
      state.running--;
      pump();
    });
  }
  updateFab();
}

async function processJob(job) {
  job.status = 'working';
  job.text = job.el.textContent;
  if (job.mode === 'block') setLabel(job, 'loading', '🌐 Перевожу…');
  try {
    const result = await translateElement(job);
    if (!isCurrent(job)) return;
    if (!result) {
      job.status = 'skipped';
      removeLabel(job);
      return;
    }
    job.clone = result.clone;
    job.source = result.source;
    job.el.after(result.clone);
    job.status = 'done';
    render(job);
  } catch (error) {
    if (!isCurrent(job)) return;
    if (error.code === 'activation') {
      job.status = 'activation';
      state.needsActivation = true;
      if (job.mode === 'block') {
        setLabel(job, 'error', '🌐 Нужно скачать модель перевода', 'Скачать', () => prepareModels(error.source));
      }
    } else {
      job.status = 'error';
      if (job.mode === 'block') {
        setLabel(job, 'error', `⚠️ Ошибка перевода: ${error.message}`, 'Повторить', () => retry(job));
      } else {
        job.el.title = `Ошибка перевода: ${error.message}`;
      }
    }
    updateFab();
  }
}

function retry(job) {
  if (!isCurrent(job)) return;
  removeLabel(job);
  enqueue(job);
}

// Must be called from a click handler: the model download needs a user gesture.
function prepareModels(source) {
  const { target } = state.settings;
  const warmSource = source ?? (target === 'en' ? null : 'en');
  bridge('prepare', { source: warmSource, target }).then(
    () => {
      state.needsActivation = false;
      for (const job of state.jobs.values()) if (job.status === 'activation') retry(job);
      updateFab();
    },
    (error) => {
      for (const job of state.jobs.values()) {
        if (job.status === 'activation' && job.mode === 'block') {
          setLabel(job, 'error', `⚠️ Не удалось скачать модель: ${error.message}`);
        }
      }
    },
  );
}

// ---------------------------------------------------------------------------------------------
// Rendering.

// Inline !important beats GitHub utilities such as `.d-block { display: block !important }`.
function setHidden(node, hidden) {
  if (hidden) {
    node.setAttribute('data-ght-hidden', '');
    node.style.setProperty('display', 'none', 'important');
  } else if (node.hasAttribute('data-ght-hidden')) {
    node.removeAttribute('data-ght-hidden');
    node.style.removeProperty('display');
  }
}

// Classic GitHub comments render the body as a <td>; put the label above its table instead.
const labelAnchor = (el) => (el.tagName === 'TD' ? el.closest('table') ?? el : el);

function setLabel(job, kind, text, actionText, onAction) {
  if (!job.label) {
    job.label = document.createElement('div');
    job.label.className = 'ght-label';
    labelAnchor(job.el).before(job.label);
  }
  job.label.dataset.state = kind;
  const span = document.createElement('span');
  span.textContent = text;
  job.label.replaceChildren(span);
  if (actionText) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ght-link';
    button.textContent = actionText;
    button.addEventListener('click', onAction);
    job.label.append(button);
  }
}

function removeLabel(job) {
  job.label?.remove();
  job.label = null;
}

// Moves element ids to whichever copy is visible, so in-page anchors keep working.
function moveIds(job, toClone) {
  for (const node of job.clone.querySelectorAll('[data-ght-id]')) {
    const id = node.getAttribute('data-ght-id');
    if (toClone) {
      const original = job.el.querySelector(`[id="${CSS.escape(id)}"]`);
      if (!original) continue;
      original.removeAttribute('id');
      original.setAttribute('data-ght-id', id);
      node.id = id;
    } else if (node.id) {
      node.removeAttribute('id');
      const original = job.el.querySelector(`[data-ght-id="${CSS.escape(id)}"]`);
      if (original) {
        original.id = id;
        original.removeAttribute('data-ght-id');
      }
    }
  }
}

function render(job) {
  const { target } = state.settings;
  setHidden(job.el, !job.showOriginal);
  setHidden(job.clone, job.showOriginal);
  moveIds(job, !job.showOriginal);
  const from = job.source ? languageName(job.source) : 'оригинал';
  if (job.mode !== 'block') {
    job.clone.title = `Оригинал (${from}):\n${job.el.textContent.trim()}`;
    return;
  }
  const text = job.showOriginal ? `🌐 Оригинал (${from})` : `🌐 Перевод: ${from} → ${languageName(target)}`;
  setLabel(job, 'done', text, job.showOriginal ? 'Показать перевод' : 'Показать оригинал', () => {
    job.showOriginal = !job.showOriginal;
    render(job);
  });
}

function removeTranslation(job) {
  io.unobserve(job.el);
  if (job.clone) moveIds(job, false);
  job.clone?.remove();
  removeLabel(job);
  setHidden(job.el, false);
}

// ---------------------------------------------------------------------------------------------
// Floating button.

function ensureFab() {
  if (fab?.isConnected) return;
  fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ght-fab';
  fab.addEventListener('click', onFabClick);
  document.body.append(fab);
  updateFab();
}

function removeFab() {
  fab?.remove();
  fab = null;
}

function updateFab() {
  if (!fab) return;
  const busy = state.queue.length + state.running;
  let text;
  if (state.downloadProgress !== null) text = `🌐 Загрузка модели ${Math.round(state.downloadProgress * 100)}%`;
  else if (!state.active) text = '🌐 Перевести';
  else if (state.needsActivation) text = '🌐 Скачать модель перевода';
  else if (busy) text = `🌐 Перевожу… (${busy})`;
  else text = state.showOriginal ? '🌐 Показать перевод' : '🌐 Показать оригинал';
  fab.textContent = text;
  const provider = state.settings.provider === 'claude' ? `Claude (${state.settings.model})` : 'встроенный переводчик Chrome';
  fab.title = `Перевод на ${languageName(state.settings.target)} · ${provider}`;
}

function onFabClick() {
  if (state.settings.provider === 'chrome' && (!state.active || state.needsActivation)) {
    prepareModels(null);
  }
  if (!state.active) {
    start();
    return;
  }
  if (state.needsActivation) return;
  state.showOriginal = !state.showOriginal;
  for (const job of state.jobs.values()) {
    job.showOriginal = state.showOriginal;
    if (job.status === 'done') render(job);
  }
  updateFab();
}

// ---------------------------------------------------------------------------------------------
// Lifecycle.

function start() {
  state.active = true;
  state.showOriginal = false;
  scan();
  updateFab();
}

function stop() {
  state.active = false;
  state.needsActivation = false;
  for (const job of state.jobs.values()) removeTranslation(job);
  state.jobs.clear();
  state.queue.length = 0;
  updateFab();
}

function pageKeyOf(pathname) {
  const pr = pathname.match(PAGE_PATH)?.[0];
  if (pr) return { key: pr, always: true };
  if (REPO_PATH.test(pathname)) return { key: pathname, always: false };
  return null;
}

// Shows the button on PR and commit pages, and on repository pages that render a README.
function syncFab() {
  const visible = state.pageKey
    && (state.pageAlways || (state.settings.parts.readme && document.querySelector(README_SELECTOR)));
  if (visible) ensureFab();
  else removeFab();
}

function onLocationChange() {
  if (location.href === state.url) return;
  state.url = location.href;
  const page = pageKeyOf(location.pathname);
  if (!page) {
    stop();
    state.pageKey = '';
    syncFab();
    return;
  }
  if (page.key !== state.pageKey) {
    state.pageKey = page.key;
    state.pageAlways = page.always;
    stop();
    if (state.settings.auto) start();
  }
  syncFab();
}

// Drops translations of removed elements and re-translates elements whose text changed.
function maintain() {
  onLocationChange();
  syncFab();
  if (!state.active) return;
  for (const job of [...state.jobs.values()]) {
    const settled = job.status === 'done' || job.status === 'skipped' || job.status === 'error';
    if (!job.el.isConnected || (settled && job.el.textContent !== job.text)) {
      removeTranslation(job);
      state.jobs.delete(job.el);
    }
  }
  scan();
}

let maintainTimer = 0;
function scheduleMaintain() {
  clearTimeout(maintainTimer);
  maintainTimer = setTimeout(maintain, 250);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const previous = state.settings;
  loadSettings().then((settings) => {
    state.settings = settings;
    const changed = ['provider', 'target', 'model'].some((key) => previous[key] !== settings[key])
      || JSON.stringify(previous.parts) !== JSON.stringify(settings.parts);
    if (changed && state.pageKey) {
      const wasActive = state.active;
      stop();
      if (wasActive || settings.auto) start();
    }
    syncFab();
    updateFab();
  });
});

(async () => {
  state.settings = await loadSettings();
  onLocationChange();
  new MutationObserver(scheduleMaintain).observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener('turbo:load', scheduleMaintain);
  window.addEventListener('popstate', scheduleMaintain);
})();
