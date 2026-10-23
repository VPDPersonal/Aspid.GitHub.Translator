# asp-pr rules for Aspid.Lingo

## Scopes

Use the workspace or the area that the change touches:

- `github`: Aspid Lingo for GitHub in `apps/github`: GitHub page rules, manifest, locales.
- `content`: the content script and its helpers (`apps/github/src/content.js`, `apps/github/src/dom.js`, `apps/github/static/content.css`).
- `options`: the settings page (`apps/github/src/options.js`, `apps/github/static/options.html`, `apps/github/src/i18n.js`, `apps/github/src/locales.js`).
- `providers`: translation engines in `apps/github/src/providers/` and `apps/github/src/background.js`.
- `brand`: icons, their sources and the fonts in `packages/brand`.
- `store`: store listings, screenshots and their renderer in `apps/github/store`.
- `build`: build scripts, workspaces and packaging.

Leave the scope out when the change spans several areas.

## Labels

Set no labels by hand.
