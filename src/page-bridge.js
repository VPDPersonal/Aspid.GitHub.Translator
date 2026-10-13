// Content-side client for bridge.js, which runs in the page's MAIN world where Chrome exposes
// the on-device Translator and LanguageDetector APIs. Both sides talk through window events
// with JSON string payloads.

import { t } from './i18n.js';

let seq = 0;
const pending = new Map();
let progressListener = null;
let listening = false;

// Listeners are added on first use, so importing this module has no side effects.
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('ght:res', (event) => {
    const message = JSON.parse(event.detail);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) {
      const text = message.code === 'Unsupported' ? t('errorUnsupported') : message.error;
      request.reject(Object.assign(new Error(text), { code: message.code }));
    } else {
      request.resolve(message.result);
    }
  });
  window.addEventListener('ght:progress', (event) => progressListener?.(JSON.parse(event.detail).loaded));
}

// Dispatch is synchronous, so a call made inside a click handler keeps the user activation.
export function callBridge(op, args) {
  listen();
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    window.dispatchEvent(new CustomEvent('ght:req', { detail: JSON.stringify({ id, op, args }) }));
  });
}

/** Calls `listener` with the 0..1 progress of a model download. */
export function onDownloadProgress(listener) {
  listen();
  progressListener = listener;
}

/** Returns the most likely language of `text` as `{ lang, confidence }`, or null. */
export async function detectLanguage(text) {
  const [top] = await callBridge('detector.detect', { text });
  return top ?? null;
}

/** Downloads the language detector model. Call it inside a user gesture. */
export const prepareDetector = () => callBridge('detector.prepare');
