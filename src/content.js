import { loadSettings, languageName } from './settings.js';
import {
  applyTranslation, cloneForTranslation, collectPlainSegments, collectSegments, hasLetters, linkEmbeds, placeEmbeds,
  protectNames, protectPrefix, stripTags, textOf,
} from './dom.js';
import { detectLanguage, onDownloadProgress, prepareDetector } from './page-bridge.js';
import { getProvider } from './providers/index.js';

// Pull requests (all tabs), single commits and commit lists.
const PAGE_PATH = /^\/[^/]+\/[^/]+\/(?:pull\/\d+|commit\/[0-9a-f]{7,40}|commits(?=\/|$))/;
// Repository home, folders and files. The button shows up there only when a README is rendered.
const REPO_PATH = /^\/[^/]+\/[^/]+(?:\/(?:tree|blob)\/.+)?\/?$/;
const README_SELECTOR = 'article.markdown-body[itemprop="text"], #readme .markdown-body';
const EXCLUDE_SELECTOR = [
  'form', '[contenteditable="true"]', '.js-preview-body', '[data-ght-clone]', '.prose-diff',
  '.rich-diff', '.js-file-content', '[class*="MarkdownEditor"]', '[class*="markdown-editor"]',
].join(',');

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
  provider: null,
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

onDownloadProgress((loaded) => {
  state.downloadProgress = loaded < 1 ? loaded : null;
  updateFab();
});

const sameLanguage = (a, b) => a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();

// ---------------------------------------------------------------------------------------------
// Translation of one element.

/**
 * Returns a translated copy of the job's element, or null when there is nothing to translate.
 * Sets `job.source` to the source language as soon as it is known.
 */
async function translateElement(job) {
  const { provider, settings: { target } } = state;
  const clone = cloneForTranslation(job.el);
  const segments = job.mode === 'plain' ? collectPlainSegments(clone) : collectSegments(clone);
  if (!segments.length) return null;
  if (job.mode === 'inline') segments.forEach(protectPrefix);

  const sample = segments.map((s) => stripTags(s.text)).join('\n').slice(0, 2000);
  if (!hasLetters(sample)) return null;
  let detected = null;
  try {
    detected = await detectLanguage(sample);
  } catch (error) {
    if (provider.needsSource) throw error; // other engines detect the language themselves
  }
  if (detected && (detected.lang === 'und' || (sameLanguage(detected.lang, target) && detected.confidence >= 0.5))) {
    return null;
  }

  let source = detected?.lang;
  if (provider.needsSource) {
    // Short titles often get a low-confidence guess; GitHub text is English far more often.
    if (!source || detected.confidence < 0.4) source = 'en';
    if (sameLanguage(source, target)) return null;
  }
  job.source = source;

  if (provider.plainText) {
    const capitalized = Boolean(source) && sameLanguage(source, 'en');
    for (const segment of segments) protectNames(segment, { capitalized });
  }
  const pending = segments.filter((segment) => hasLetters(stripTags(segment.text)));
  if (!pending.length) return null;

  const result = await provider.translate({ texts: pending.map((segment) => segment.text), source, target });
  job.source ??= result.sourceLanguage;

  let changed = false;
  pending.forEach((segment, i) => {
    const translated = result.translations[i]?.trim();
    if (translated && translated !== segment.text) {
      applyTranslation(segment, translated);
      changed = true;
    }
  });
  return changed ? clone : null;
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
        clone: null, embeds: [], label: null, source: null, text: '',
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
  while (state.running < state.provider.concurrency && state.queue.length) {
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
  job.text = textOf(job.el);
  if (job.mode === 'block') setLabel(job, 'loading', '🌐 Перевожу…');
  try {
    const clone = await translateElement(job);
    if (!isCurrent(job)) return;
    if (!clone) {
      job.status = 'skipped';
      removeLabel(job);
      return;
    }
    job.clone = clone;
    job.embeds = linkEmbeds(job.el, clone);
    job.el.after(clone);
    job.status = 'done';
    render(job);
  } catch (error) {
    if (!isCurrent(job)) return;
    if (error.code === 'activation') {
      job.status = 'activation';
      state.needsActivation = true;
      if (job.mode === 'block') {
        setLabel(job, 'error', '🌐 Нужно скачать модель перевода', 'Скачать', () => prepareModels(job.source));
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

// Must be called from a click handler: model downloads need a user gesture.
function prepareModels(source = 'en') {
  const { provider, settings: { target } } = state;
  const downloads = [prepareDetector()];
  if (provider.prepare && !sameLanguage(source, target)) downloads.push(provider.prepare({ source, target }));
  Promise.all(downloads).then(
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
  placeEmbeds(job.embeds, !job.showOriginal);
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
  placeEmbeds(job.embeds, false);
  for (const { home } of job.embeds) home.remove();
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
  fab.title = `Перевод на ${languageName(state.settings.target)} · ${state.provider.title}`;
}

function onFabClick() {
  if (!state.active || state.needsActivation) prepareModels();
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
    if (!job.el.isConnected || (settled && textOf(job.el) !== job.text)) {
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
    applySettings(settings);
    const changed = ['provider', 'target'].some((key) => previous[key] !== settings[key])
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

function applySettings(settings) {
  state.settings = settings;
  state.provider = getProvider(settings.provider);
}

(async () => {
  applySettings(await loadSettings());
  onLocationChange();
  new MutationObserver(scheduleMaintain).observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener('turbo:load', scheduleMaintain);
  window.addEventListener('popstate', scheduleMaintain);
})();
