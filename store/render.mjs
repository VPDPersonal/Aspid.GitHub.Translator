// Renders the Chrome Web Store images with a headless Chrome:
//   node store/render.mjs promo   promo tiles from store/promo/*.html
//   node store/render.mjs shots   screenshots of the extension on live GitHub pages
// Run `npm run build` first: the screenshots load the extension from dist/.
// Set CHROME_PATH when Chrome is not in /Applications.

import puppeteer from 'puppeteer-core';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Kept between runs, so Chrome downloads the translation models once.
const PROFILE = join(tmpdir(), 'aspid-store-chrome');

const PROMO = [
  { name: 'small-tile', width: 440, height: 280 },
  { name: 'marquee', width: 1400, height: 560 },
];

// Store screenshots are 1280×800: a caption on top and the page below, cut by the bottom edge.
const FRAME = { width: 1280, height: 800, top: 136, window: 1120 };
const VIEWPORT = { width: 1280, height: Math.round(((FRAME.height - FRAME.top) * 1280) / FRAME.window) };

const ALL_PARTS = {
  prTitle: true, prBody: true, comments: true, reviewComments: true, commitTitles: true, commitBodies: true, readme: true,
};

/**
 * One screenshot per entry, per store language. `at` is the original text of a comment to
 * scroll to (the top of the page when absent), `offset` is where its label ends up in the
 * viewport, `scroll` moves further down, and `original` is the original text of a comment
 * to switch back to the original.
 */
const SHOTS = {
  en: {
    lang: 'en-US',
    target: 'en',
    list: [
      {
        name: '1-pull-request',
        url: 'https://github.com/NervJS/taro/pull/19523',
        caption: 'Read pull requests in your own language',
        sub: 'Titles, descriptions and comments are translated right where they are',
      },
      {
        name: '2-original',
        url: 'https://github.com/NervJS/taro/pull/19432',
        at: '修复解决了这个问题',
        offset: 90,
        original: '修复解决了这个问题',
        caption: 'The original is one click away',
        sub: 'Every comment has its own toggle, and the 🌐 button flips the whole page',
      },
      {
        name: '3-commits',
        url: 'https://github.com/dromara/Sa-Token/commits',
        caption: 'Commits too',
        sub: 'Commit titles and descriptions, with conventional commit prefixes kept',
      },
      {
        name: '4-readme',
        url: 'https://github.com/dromara/Sa-Token',
        readme: true,
        offset: 60,
        caption: 'READMEs and docs',
        sub: 'Repository READMEs and any .md file, with code left as code',
      },
      {
        name: '5-settings',
        options: true,
        caption: 'Free, private, on your device',
        sub: 'Chrome’s built-in translator: no account, no API key, nothing leaves your computer',
      },
    ],
  },
  ru: {
    lang: 'ru',
    target: 'ru',
    list: [
      {
        name: '1-pull-request',
        url: 'https://github.com/vuejs/core/pull/15853',
        caption: 'Пул-реквесты на вашем языке',
        sub: 'Заголовок, описание и комментарии переводятся прямо на месте',
      },
      {
        name: '2-original',
        url: 'https://github.com/sveltejs/svelte/pull/18791',
        at: 'In which case you would set the param',
        offset: 90,
        original: 'In which case you would set the param',
        caption: 'Оригинал в одном клике',
        sub: 'У каждого комментария свой переключатель, а кнопка 🌐 переключает всю страницу',
      },
      {
        name: '3-commits',
        url: 'https://github.com/vuejs/core/commits/main',
        caption: 'И коммиты тоже',
        sub: 'Заголовки и описания коммитов, префиксы conventional commits не трогаются',
      },
      {
        name: '4-readme',
        url: 'https://github.com/vitejs/vite',
        readme: true,
        offset: 60,
        scroll: 470,
        caption: 'README и документация',
        sub: 'README репозиториев и любые .md файлы, код остаётся кодом',
      },
      {
        name: '5-settings',
        options: true,
        caption: 'Бесплатно, приватно, на вашем устройстве',
        sub: 'Встроенный переводчик Chrome: без аккаунта, без ключей, ничего не уходит с компьютера',
      },
    ],
  },
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function launch(lang, extensions = false) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    enableExtensions: extensions,
    userDataDir: `${PROFILE}-${lang}`,
    // Puppeteer turns off the components that download translation models.
    ignoreDefaultArgs: ['--disable-features=Translate,AcceptCHFrame,MediaRouter,OptimizationHints,WebUIReloadButton,ProcessPerSiteUpToMainFrameThreshold,IsolateSandboxedIframes', '--disable-background-networking', '--disable-component-extensions-with-background-pages'],
    // On macOS Chrome takes its UI language from AppleLanguages and ignores --lang.
    args: [`--lang=${lang}`, '-AppleLanguages', `(${lang})`, '--hide-scrollbars'],
  });
}

async function renderPromo() {
  const browser = await launch('en-US');
  for (const { name, width, height } of PROMO) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(ROOT, 'store/promo', `${name}.html`)).href, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: join(ROOT, 'store/promo', `${name}.png`) });
    console.log(`store/promo/${name}.png`);
  }
  await browser.close();
}

// Headless Chrome ships no language detection model, so pages get a stand-in that tells
// languages apart by their script. Translation itself is done by Chrome's real Translator.
function detectorStandIn() {
  const count = (re, text) => (text.match(re) || []).length;
  // The script with the most characters wins; one CJK character weighs about one word.
  const guess = (text) => {
    const han = count(/\p{Script=Han}/gu, text);
    const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu, text);
    const scores = {
      zh: han,
      ja: kana >= 2 && kana * 10 >= han ? kana + han : 0,
      ko: count(/\p{Script=Hangul}/gu, text),
      ru: count(/\p{Script=Cyrillic}/gu, text) / 5,
      en: count(/\p{Script=Latin}/gu, text) / 5,
    };
    const [best, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return score > 0 ? best : 'und';
  };
  class LanguageDetector {
    static async availability() { return 'available'; }
    static async create() { return new LanguageDetector(); }
    async detect(text) { return [{ detectedLanguage: guess(text), confidence: 0.95 }]; }
  }
  Object.defineProperty(self, 'LanguageDetector', { value: LanguageDetector, configurable: true, writable: true });
}

// Waits until the floating button stops showing progress and no comment is loading.
async function settle(page, timeout = 90000) {
  const start = Date.now();
  let quiet = 0;
  while (Date.now() - start < timeout) {
    await sleep(1000);
    const state = await page.evaluate(() => ({
      fab: document.querySelector('.ght-fab')?.textContent ?? '',
      loading: document.querySelectorAll('.ght-label[data-state="loading"]').length,
    }));
    if (/model|модел/i.test(state.fab)) {
      await page.click('.ght-fab'); // a real click: Chrome downloads models only after a user gesture
      quiet = 0;
    } else if (state.fab && !/…|%/.test(state.fab) && !state.loading) {
      if (++quiet >= 2) return;
    } else {
      quiet = 0;
    }
  }
  throw new Error(`${page.url()} is still translating after ${timeout / 1000} s`);
}

async function capturePage(browser, extensionId, shot) {
  const page = await browser.newPage();
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  if (shot.options) {
    await page.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'networkidle0' });
    return page;
  }
  await page.evaluateOnNewDocument(detectorStandIn);
  await page.goto(shot.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await settle(page);
  // Everything is translated lazily, as it scrolls into view.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => scrollTo(0, top), y);
    await sleep(250);
  }
  await settle(page);

  const top = await page.evaluate(({ at, offset = 0, scroll = 0, original, readme }) => {
    // A label sits right before the original comment, which the translation follows.
    const labelOf = (text) => [...document.querySelectorAll('.ght-label')]
      .find((label) => label.nextElementSibling?.textContent.includes(text));
    if (original) labelOf(original)?.querySelector('.ght-link')?.click();
    // On a repository page, the README is the only comment-like block with a label.
    const target = readme ? document.querySelector('.ght-label') : at && labelOf(at);
    if (at && !target) throw new Error(`"${at}" is not on the page`);
    return target ? Math.max(0, target.getBoundingClientRect().top + scrollY - offset + scroll) : 0;
  }, shot);
  await page.evaluate((y) => scrollTo(0, y), top);
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {}); // avatars load lazily
  await sleep(500);
  return page;
}

async function frame(browser, image, shot, lang) {
  const page = await browser.newPage();
  await page.setViewport({ width: FRAME.width, height: FRAME.height, deviceScaleFactor: 1 });
  const css = await readFile(join(ROOT, 'store/promo/promo.css'), 'utf8');
  await page.setContent(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${css}
    body { width: ${FRAME.width}px; height: ${FRAME.height}px; }
    .shot { height: 100%; display: flex; flex-direction: column; align-items: center; }
    h1 { margin: 34px 0 0; font-size: 40px; font-weight: 700; letter-spacing: -0.015em; }
    p { margin: 8px 0 0; font-size: 19px; opacity: 0.92; }
    .bg > img { position: absolute; top: ${FRAME.top}px; left: ${(FRAME.width - FRAME.window) / 2}px; width: ${FRAME.window}px;
      border-radius: 12px 12px 0 0; box-shadow: 0 20px 50px rgb(15 23 42 / 0.35), 0 0 0 1px rgb(255 255 255 / 0.25); }
  </style></head><body><div class="shot bg"><h1></h1><p></p><img></div></body></html>`);
  await page.evaluate(({ caption, sub, src }) => {
    document.querySelector('h1').textContent = caption;
    document.querySelector('p').textContent = sub;
    document.querySelector('img').src = src;
  }, { caption: shot.caption, sub: shot.sub, src: `data:image/png;base64,${image.toString('base64')}` });
  await page.waitForFunction(() => document.querySelector('img').complete);
  const path = join(ROOT, 'store/screenshots', lang, `${shot.name}.png`);
  await page.screenshot({ path });
  await page.close();
  return path;
}

async function renderShots(only) {
  for (const [lang, set] of Object.entries(SHOTS)) {
    if (only && only !== lang) continue;
    await mkdir(join(ROOT, 'store/screenshots', lang), { recursive: true });
    const browser = await launch(set.lang, true);
    const extensionId = await browser.installExtension(join(ROOT, 'dist'));
    const setup = await browser.newPage();
    await setup.goto(`chrome-extension://${extensionId}/options.html`);
    await setup.evaluate((settings) => chrome.storage.local.set({ settings }), {
      provider: 'builtin', target: set.target, auto: true, parts: ALL_PARTS,
    });
    await setup.close();
    for (const shot of set.list) {
      const page = await capturePage(browser, extensionId, shot);
      const image = await page.screenshot();
      await page.close();
      console.log(await frame(browser, image, shot, lang));
    }
    await browser.close();
  }
}

const [command, only] = process.argv.slice(2);
if (command === 'promo') await renderPromo();
else if (command === 'shots') await renderShots(only);
else console.log('Usage: node store/render.mjs promo | shots [en|ru]');
