# Aspid Translator for GitHub

Chrome extension that translates GitHub pull requests and commits in place.
It works only on `github.com` and leaves the rest of the page alone.

- Translates the PR title, the PR description, conversation comments, review comments,
  commit titles, commit descriptions and READMEs. Each part can be turned off in the settings.
- Works on pull request pages (all tabs), single commit pages, commit lists, repository pages
  with a README and rendered `.md` files.
- Skips text that is already in the target language.
- Keeps code blocks, inline code, mentions, issue references, links, conventional commit
  prefixes (`fix(scope):`) and git trailers (`Co-Authored-By:`) untouched.
- Translates lazily, as content scrolls into view. With Claude, small items are packed into one request.
- Comments get a "show original" toggle; titles and commit messages show the original in a tooltip.
  A floating button toggles the whole page.

## Translation services

| Service | Cost | Notes |
|---|---|---|
| Chrome built-in Translator API (default) | Free, on-device | Chrome 138+ on desktop. Chrome downloads a language model on first use, which needs a click on the page. |
| Claude API | Paid per token | Uses `claude-haiku-5-5` by default. Translations are cached in `chrome.storage.local`. |

## Build and install

```bash
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. Click the extension icon to open the settings: pick the target language and the service.
   For Claude, paste an API key and click **Проверить ключ** to test it.

Use `npm run watch` while developing, then press the reload button on the extension card.

## Layout

| Path | Role |
|---|---|
| `src/content.js` | Finds comment bodies on PR pages, runs the translation queue, renders labels and toggles. |
| `src/dom.js` | Splits rendered markdown into segments with placeholder tags and writes translations back. |
| `src/bridge.js` | Runs in the page's main world and calls the built-in `Translator` and `LanguageDetector` APIs. |
| `src/background.js` | Service worker that calls the Claude API through `@anthropic-ai/sdk`. |
| `src/options.js`, `static/options.html` | Settings page. |
| `static/` | Manifest and styles, copied to `dist/` as is. |
