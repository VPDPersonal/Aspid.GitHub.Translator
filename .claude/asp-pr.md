# asp-pr rules for Aspid.Lingo

## Scopes

Use the workspace or the area that the change touches:

- `core`: platform-neutral code in `packages/core`.
- `browser`: shared browser extension code in `packages/browser`: the page translator, the DOM segmenter, the bridge to Chrome's built-in APIs, settings, shared UI strings.
- `providers`: translation engines in `packages/browser/src/providers/`, and in `packages/core` when they need only `fetch`.
- `github`: Aspid Lingo for GitHub in `apps/github`: GitHub page rules, styles, manifest, its UI strings.
- `options`: the settings page (`apps/github/src/options.js`, `apps/github/static/options.html`).
- `brand`: icons, their sources and the fonts in `packages/brand`.
- `store`: store listings, screenshots and their renderer in `apps/github/store`.
- `build`: build scripts, workspaces and packaging.

Leave the scope out when the change spans several areas.

## Labels

Set no labels by hand.
