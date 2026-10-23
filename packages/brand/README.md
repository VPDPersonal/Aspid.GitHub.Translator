# @aspid-lingo/brand

The Aspid Lingo artwork, shared by every product.

| File | Role |
|---|---|
| `aspid-snake.png` | The Aspid snake, from Aspid.FastTools. |
| `aspid-snake-tile.jpg` | Its smooth rendition on a dark tile. |
| `icon.svg`, `icon-tile.svg`, `icon-small.svg` | Icons built by `icon.mjs` from the tile: `icon.svg` for 128 px and the settings page, `icon-tile.svg` with bigger glyphs for 48 px, `icon-small.svg` with the glyphs alone in the snake's green for 16 and 32 px. |
| `icon.mjs` | Writes the three SVGs. Run `npm run icons -w packages/brand` after a change. |
| `index.mjs` | Build helpers: `writeExtensionIcons(dir)` renders the PNG icons of a browser extension, supersampled, and `writeFonts(dir)` copies the IBM Plex fonts of the settings pages from `@fontsource`. |
