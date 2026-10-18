# asp-pr rules for GitHubTranslator

## Scopes

Use the area of the extension that the change touches:

- `options`: the settings page (`src/options.js`, `static/options.html`, `src/i18n.js`, `src/locales.js`).
- `content`: the content script and its helpers (`src/content.js`, `src/dom.js`, `static/content.css`).
- `providers`: translation engines in `src/providers/` and `src/background.js`.
- `icons`: extension icons and their sources in `assets/`.
- `store`: Chrome Web Store listing, screenshots and their renderer.
- `build`: `build.mjs` and packaging.

Leave the scope out when the change spans several areas.

## Labels

Set no labels by hand.
