# Privacy Policy

**Aspid Translator for GitHub**, a Chrome extension. Last updated: October 15, 2026.

## Summary

The extension does not collect, store or send any personal data. It has no servers, no analytics
and no accounts. Text is translated on your device by Chrome.

## What the extension reads

On `github.com` pages, the extension reads the text of pull requests, comments, commits and
README files to translate it. That text is handed to Chrome's built-in Translator and
LanguageDetector APIs, which run on your device. The translated text is shown on the page and
is never saved or sent anywhere. Nothing is posted to GitHub: other people still see the original.

The extension does not run on any other site.

## What the extension stores

Your settings: the target language, whether to translate automatically and which parts of a page
to translate. They are kept in `chrome.storage.local` on your device and never leave it.

## Network requests

The extension makes no network requests of its own.

The first time you translate a language pair, Chrome downloads a language model from Google.
Chrome makes that request, not the extension, and the text you translate is not part of it.
Google's handling of that download is covered by the
[Google Chrome Privacy Notice](https://www.google.com/chrome/privacy/).

## Data sharing

The extension does not sell, share or transfer any data to third parties, and does not use data
for any purpose other than showing a translation on the page you are reading.

## Permissions

- `storage`: keeps your settings on your device.
- Access to `https://github.com/*`: finds and translates text on GitHub pages.

## Changes

If this policy changes, the new version will be published at this address with a new date.
A future version that adds an online translation engine will say here what is sent and where,
and that engine will stay off until you turn it on.

## Contact

Questions: [open an issue](https://github.com/VPDPersonal/Aspid.GitHub.Translator/issues).
