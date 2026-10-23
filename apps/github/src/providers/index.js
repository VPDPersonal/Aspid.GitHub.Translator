import { DEFAULT_SETTINGS } from '../settings.js';
import { builtin } from './builtin.js';

/**
 * A translation engine. The content script talks to engines only through this interface,
 * so a new one is a module in this folder plus an entry in PROVIDERS.
 *
 * Texts come in as segments with placeholder tags (see dom.js): `<xN/>` must be kept as is,
 * `<gN>...</gN>` wraps text to translate. A provider returns one translation per text,
 * in the same order, with every tag kept.
 *
 * How the kinds of engines map onto the flags:
 *   - On-device translators (Chrome's built-in Translator API): need the source language,
 *     know nothing about code, need a user gesture to download a model.
 *   - Machine translation services with an API key (DeepL, Google Cloud Translation):
 *     detect the source language themselves, still translate names, so `plainText` is true.
 *   - AI models with an API key (Claude, OpenAI, Gemini): detect the language, keep names
 *     and tags when the prompt asks them to, and benefit from packing many texts into one request.
 *
 * Providers that call a network API should send the request from the background service
 * worker (content scripts are bound by github.com's CORS rules), add the host to
 * `host_permissions`, and cache results in chrome.storage.local to save the user's money.
 * Their own options (API key, model) go to `settings.providerOptions[id]`.
 *
 * @typedef {object} Provider
 * @property {string} id Stored in `settings.provider`.
 * @property {string} title Name on the settings page and in the floating button tooltip.
 * @property {boolean} needsSource The engine needs the source language up front; when false,
 *   `source` may be undefined and the engine detects the language itself.
 * @property {boolean} plainText The engine translates code names (`Unity` becomes `единство`),
 *   so they are hidden behind placeholders before the call.
 * @property {number} concurrency How many page elements may be translated at once.
 * @property {(request: { texts: string[], source?: string, target: string }) =>
 *   Promise<{ translations: string[], sourceLanguage?: string }>} translate
 *   Rejects with `code: 'activation'` when a model download waits for a user gesture.
 * @property {(request: { source: string, target: string }) => Promise<unknown>} [prepare]
 *   Starts model downloads. It is called inside a click handler, so it must start its
 *   work before the first `await`.
 */

/** @type {Provider[]} */
export const PROVIDERS = [builtin];

/** Returns the provider with this id, or the default one for an unknown or removed id. */
export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id)
    ?? PROVIDERS.find((provider) => provider.id === DEFAULT_SETTINGS.provider);
}
