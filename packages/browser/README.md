# @aspid-lingo/browser

Code that every Aspid Lingo browser extension shares. A site extension, such as
[`apps/github`](../../apps/github), describes its pages and calls the page translator;
the rest comes from here.

| Path | Role |
|---|---|
| `src/page-translator.js` | `startPageTranslator(site, loadSettings)`: finds what the `Site` marks as translatable, translates it lazily as it scrolls into view, renders the labels, toggles and the floating button, and follows navigation and settings changes. |
| `src/dom.js` | Splits rendered markdown into segments with placeholder tags and writes translations back, with the site's `Markup` rules. |
| `src/bridge.js` | Runs in the page's main world and calls Chrome's built-in `Translator` and `LanguageDetector` APIs. |
| `src/page-bridge.js` | Content-side client for `bridge.js`; detects the language of a text. |
| `src/providers/` | Translation engines that browsers can run. `index.js` lists them. |
| `src/settings.js` | Default settings of an extension, loading and saving them in `chrome.storage.local`. |
| `src/i18n.js`, `_locales/` | UI strings of this code in every target language. |
| `src/locales.js` | Loads a locale for the settings page, which shows the target language's strings. |
| `build.mjs` | Build helpers: `bridgeEntry`, the bridge script to bundle, and `writeLocales(dir)`, which adds the strings of `_locales/` to an extension build. |

## A new site

1. Copy `apps/github` to `apps/<site>`: the manifest with the content scripts for the site,
   `build.mjs`, the settings page and the extension's own strings (name, description, settings page).
2. Describe the site in `src/content.js` and pass it to `startPageTranslator()`.
   `Site` in `src/page-translator.js` lists what it holds: the pages, what can be translated on them,
   what to leave alone and how the site renders markdown.
3. Style `.lingo-label`, `.lingo-link` and `.lingo-fab` in `static/content.css` in the site's look.

## Translation engines

An engine implements `Provider` from [`@aspid-lingo/core/provider`](../core/src/provider.js).
One that only needs `fetch` goes into `packages/core`, so every product can offer it;
one that needs a browser API goes into `src/providers/`. Either way, add it to `PROVIDERS`
in `src/providers/index.js`: the settings pages and the page translator pick it up from there.

Chrome's built-in translator is the only engine so far, so a browser without it,
such as Firefox, needs another engine before an extension can ship there.
