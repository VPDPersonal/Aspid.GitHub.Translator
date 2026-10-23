// Translates a web page in place: finds what the site marks as translatable, translates it lazily
// as it scrolls into view, puts a label with a toggle above each block, and adds a floating button
// that starts the translation and flips the whole page. A site extension describes its pages with
// a `Site` and calls startPageTranslator() from its content script.

import { sameLanguage } from '@aspid-lingo/core/languages';
import { hasLetters, protectNames, protectPrefix, stripTags } from '@aspid-lingo/core/placeholders';
import {
  applyTranslation, cloneForTranslation, collectPlainSegments, collectSegments, linkEmbeds, placeEmbeds, textOf,
} from './dom.js';
import { languageName, t } from './i18n.js';
import { detectLanguage, onDownloadProgress, prepareDetector } from './page-bridge.js';
import { getProvider } from './providers/index.js';

/**
 * What a site extension tells the page translator about its pages.
 * @typedef {object} Site
 * @property {(location: Location) => SitePage | null} page The page at `location`, or null where nothing is translated.
 * @property {Target[]} targets What can be translated.
 * @property {string} exclude Elements whose content is never translated, such as editors and diffs.
 * @property {import('./dom.js').Markup} markup How the site renders markdown.
 * @property {string} defaultSource The language of most of the site's text, taken when detection is unsure.
 * @property {string[]} [navigationEvents] Document events the site fires when it shows another page without a reload.
 * @property {(el: Element) => Element} [labelAnchor] The element to put a block's label before; the block itself by default.
 */

/**
 * @typedef {object} SitePage
 * @property {string} key Translations stay while the key stays, such as across the tabs of a pull request.
 * @property {(parts: Record<string, boolean>) => boolean} [ready] For pages that may have nothing to translate:
 *   whether the floating button shows now. Without it, the button always shows.
 */

/**
 * Something on a page that can be translated. `mode` picks the segmenter and the UI:
 *   block  - rendered markdown; a label above it has a per-comment toggle
 *   inline - a one-line title; the original is in the tooltip
 *   plain  - a plain-text commit body; the original is in the tooltip
 * @typedef {object} Target
 * @property {'block' | 'inline' | 'plain'} mode
 * @property {string} selector Only the innermost of nested blocks is translated.
 * @property {string | ((el: Element) => string)} kind The settings part that switches it on,
 *   or a function that returns the part of an element.
 */

/** @type {Site} */
let site = null;
let loadSettings = null;
let excluded = '';

const state = {
  settings: null,
  provider: null,
  url: '',
  page: null,
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
// Translation of one element.

/**
 * Returns a translated copy of the job's element, or null when there is nothing to translate.
 * Sets `job.source` to the source language as soon as it is known.
 */
async function translateElement(job) {
  const { provider, settings: { target } } = state;
  const clone = cloneForTranslation(job.el);
  const segments = job.mode === 'plain' ? collectPlainSegments(clone) : collectSegments(clone, site.markup);
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
    // Short titles often get a low-confidence guess; take the site's main language then.
    if (!source || detected.confidence < 0.4) source = site.defaultSource;
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
  for (const target of site.targets) {
    const byElement = typeof target.kind === 'function';
    if (!byElement && !parts[target.kind]) continue;
    for (const el of document.querySelectorAll(target.selector)) {
      if (state.jobs.has(el) || el.closest(excluded) || !hasLetters(el.textContent)) continue;
      if (target.mode === 'block' && el.querySelector(target.selector)) continue; // translate the innermost block only
      const kind = byElement ? target.kind(el) : target.kind;
      if (!parts[kind]) continue;
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
  job.text = textOf(job.el, site.markup);
  if (job.mode === 'block') setLabel(job, 'loading', `🌐 ${t('labelTranslating')}`);
  try {
    const clone = await translateElement(job);
    if (!isCurrent(job)) return;
    if (!clone) {
      job.status = 'skipped';
      removeLabel(job);
      return;
    }
    job.clone = clone;
    job.embeds = linkEmbeds(job.el, clone, site.markup);
    job.el.after(clone);
    job.status = 'done';
    render(job);
  } catch (error) {
    if (!isCurrent(job)) return;
    if (error.code === 'activation') {
      job.status = 'activation';
      state.needsActivation = true;
      if (job.mode === 'block') {
        setLabel(job, 'error', `🌐 ${t('labelNeedsModel')}`, t('actionDownload'), () => prepareModels(job.source));
      }
    } else {
      job.status = 'error';
      if (job.mode === 'block') {
        setLabel(job, 'error', `⚠️ ${t('labelError', error.message)}`, t('actionRetry'), () => retry(job));
      } else {
        job.el.title = t('tooltipError', error.message);
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

// Must be called from a click handler: model downloads need a user gesture. `source` is null
// when the language detector itself waits for its model; the site's main language stands in then.
function prepareModels(source) {
  source ??= site.defaultSource;
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
          setLabel(job, 'error', `⚠️ ${t('labelDownloadFailed', error.message)}`);
        }
      }
    },
  );
}

// ---------------------------------------------------------------------------------------------
// Rendering.

// Inline !important beats site utilities such as GitHub's `.d-block { display: block !important }`.
function setHidden(node, hidden) {
  if (hidden) {
    node.setAttribute('data-lingo-hidden', '');
    node.style.setProperty('display', 'none', 'important');
  } else if (node.hasAttribute('data-lingo-hidden')) {
    node.removeAttribute('data-lingo-hidden');
    node.style.removeProperty('display');
  }
}

const labelAnchor = (el) => site.labelAnchor?.(el) ?? el;

function setLabel(job, kind, text, actionText, onAction) {
  if (!job.label) {
    job.label = document.createElement('div');
    job.label.className = 'lingo-label';
    labelAnchor(job.el).before(job.label);
  }
  job.label.dataset.state = kind;
  const span = document.createElement('span');
  span.textContent = text;
  job.label.replaceChildren(span);
  if (actionText) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lingo-link';
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
  for (const node of job.clone.querySelectorAll('[data-lingo-id]')) {
    const id = node.getAttribute('data-lingo-id');
    if (toClone) {
      const original = job.el.querySelector(`[id="${CSS.escape(id)}"]`);
      if (!original) continue;
      original.removeAttribute('id');
      original.setAttribute('data-lingo-id', id);
      node.id = id;
    } else if (node.id) {
      node.removeAttribute('id');
      const original = job.el.querySelector(`[data-lingo-id="${CSS.escape(id)}"]`);
      if (original) {
        original.id = id;
        original.removeAttribute('data-lingo-id');
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
  const from = job.source ? languageName(job.source) : t('sourceUnknown');
  if (job.mode !== 'block') {
    job.clone.title = t('tooltipOriginal', from, job.el.textContent.trim());
    return;
  }
  const text = job.showOriginal ? t('labelOriginal', from) : t('labelTranslated', from, languageName(target));
  setLabel(job, 'done', `🌐 ${text}`, t(job.showOriginal ? 'actionShowTranslation' : 'actionShowOriginal'), () => {
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
  fab.className = 'lingo-fab';
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
  if (state.downloadProgress !== null) text = t('fabDownloading', Math.round(state.downloadProgress * 100));
  else if (!state.active) text = t('fabTranslate');
  else if (state.needsActivation) text = t('fabDownloadModel');
  else if (busy) text = t('fabTranslating', busy);
  else text = t(state.showOriginal ? 'actionShowTranslation' : 'actionShowOriginal');
  fab.textContent = `🌐 ${text}`;
  fab.title = t('fabTooltip', languageName(state.settings.target), state.provider.title);
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

// Shows the button on the site's pages, on those with `ready` only while it says so.
function syncFab() {
  const { page } = state;
  if (page && (!page.ready || page.ready(state.settings.parts))) ensureFab();
  else removeFab();
}

function onLocationChange() {
  if (location.href === state.url) return;
  state.url = location.href;
  const page = site.page(location);
  if (!page) {
    stop();
    state.page = null;
    syncFab();
    return;
  }
  const another = page.key !== state.page?.key;
  state.page = page;
  if (another) {
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
    if (!job.el.isConnected || (settled && textOf(job.el, site.markup) !== job.text)) {
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

function applySettings(settings) {
  state.settings = settings;
  state.provider = getProvider(settings.provider);
}

/**
 * Starts translating the pages of `siteRules` with the settings that `load` returns, the stored ones
 * over the extension's defaults. Call it once, from the content script.
 */
export function startPageTranslator(siteRules, load) {
  site = siteRules;
  loadSettings = load;
  excluded = [site.exclude, '[data-lingo-clone]'].filter(Boolean).join(',');

  onDownloadProgress((loaded) => {
    state.downloadProgress = loaded < 1 ? loaded : null;
    updateFab();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const previous = state.settings;
    loadSettings().then((settings) => {
      applySettings(settings);
      const changed = ['provider', 'target'].some((key) => previous[key] !== settings[key])
        || JSON.stringify(previous.parts) !== JSON.stringify(settings.parts);
      if (changed && state.page) {
        const wasActive = state.active;
        stop();
        if (wasActive || settings.auto) start();
      }
      syncFab();
      updateFab();
    });
  });

  (async () => {
    applySettings(await loadSettings());
    onLocationChange();
    new MutationObserver(scheduleMaintain).observe(document.body, { childList: true, subtree: true, characterData: true });
    for (const type of site.navigationEvents ?? []) document.addEventListener(type, scheduleMaintain);
    window.addEventListener('popstate', scheduleMaintain);
  })();
}
