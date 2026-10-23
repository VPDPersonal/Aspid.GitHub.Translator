import { DEFAULT_SETTINGS } from '../settings.js';
import { builtin } from './builtin.js';

// Translation engines, each a `Provider` from @aspid-lingo/core/provider. A new one is a module
// in this folder plus an entry in PROVIDERS.
//
// Providers that call a network API should send the request from the background service
// worker (content scripts are bound by github.com's CORS rules), add the host to
// `host_permissions`, and cache results in chrome.storage.local to save the user's money.

/** @type {import('@aspid-lingo/core/provider').Provider[]} */
export const PROVIDERS = [builtin];

/** Returns the provider with this id, or the default one for an unknown or removed id. */
export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id)
    ?? PROVIDERS.find((provider) => provider.id === DEFAULT_SETTINGS.provider);
}
