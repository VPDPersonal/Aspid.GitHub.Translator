# Chrome Web Store listing

Everything the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) asks for,
ready to paste. Upload `release/aspid-github-translator-<version>.zip` from `npm run zip`.

## Package

Name and summary come from `_locales/*/messages.json` (`extName`, `extDescription`),
so the Dashboard shows them read-only.

## Store listing

| Field | Value |
|---|---|
| Description (English) | [`description.en.txt`](description.en.txt) |
| Description (Russian) | [`description.ru.txt`](description.ru.txt) |
| Category | Developer Tools |
| Language | English (default), Russian |
| Store icon | `dist/icons/icon-128.png` |
| Screenshots (English) | [`screenshots/en/`](screenshots/en), 1280×800, in file name order |
| Screenshots (Russian) | [`screenshots/ru/`](screenshots/ru), 1280×800, in file name order |
| Small promo tile | [`promo/small-tile.png`](promo/small-tile.png), 440×280 |
| Marquee promo tile | [`promo/marquee.png`](promo/marquee.png), 1400×560 |
| Official URL | none |
| Homepage URL | `https://github.com/VPDPersonal/Aspid.GitHub.Translator` |
| Support URL | `https://github.com/VPDPersonal/Aspid.GitHub.Translator/issues` |
| Mature content | No |

## Privacy practices

**Single purpose**

> Translates pull requests, code review comments, commits and README files on github.com into
> the user's language in place, on the user's device with Chrome's built-in Translator API.

**Permission justification**

| Permission | Justification |
|---|---|
| `storage` | Keeps the user's settings (target language, automatic translation, which parts of a page to translate) on the device. |
| Host permission `https://github.com/*` (content scripts) | The extension finds pull request, commit and README text on github.com pages and shows its translation in place. It runs on no other site. |

**Remote code:** No, I am not using remote code. All scripts are in the package.

**Data usage:** check none of the data types. The extension reads page text only to translate it
on the device, and nothing leaves the device.

Check all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://github.com/VPDPersonal/Aspid.GitHub.Translator/blob/main/PRIVACY.md`

## Distribution

| Field | Value |
|---|---|
| Payments | Free of charge |
| Visibility | Public |
| Regions | All regions |

## Test instructions

> No account or setup is needed. Open any public pull request with non-English text, for example
> https://github.com/NervJS/taro/pull/19523. The first time, click the 🌐 button in the bottom
> right corner so Chrome downloads the translation model. Requires desktop Chrome 138 or newer.

## Images

Screenshots show the real extension on public pull requests, translated by Chrome's
built-in Translator. Promo tiles are rendered from [`promo/`](promo) sources.
