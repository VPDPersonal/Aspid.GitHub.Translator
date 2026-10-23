import { builtin } from './builtin.js';

// Translation engines, each a `Provider` from @aspid-lingo/core/provider. A new one is a module
// in this folder plus an entry in PROVIDERS.
//
// Providers that call a network API should send the request from the background service
// worker (content scripts are bound by the CORS rules of the page's site), add the host to
// `host_permissions`, and cache results in chrome.storage.local to save the user's money.

/** @type {import('@aspid-lingo/core/provider').Provider[]} */
export const PROVIDERS = [builtin];

/** The id of the engine that new installs start with. */
export const DEFAULT_PROVIDER = 'builtin';

/** Returns the provider with this id, or the default one for an unknown or removed id. */
export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id)
    ?? PROVIDERS.find((provider) => provider.id === DEFAULT_PROVIDER);
}
