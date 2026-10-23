import assert from 'node:assert/strict';
import { test } from 'node:test';
import { languageName, preferredTarget, sameLanguage, targetFor } from '../src/languages.js';

test('targetFor maps browser language tags onto targets', () => {
  assert.equal(targetFor('pt-BR'), 'pt');
  assert.equal(targetFor('zh-CN'), 'zh');
  assert.equal(targetFor('zh-TW'), 'zh-Hant');
  assert.equal(targetFor('nb'), 'no');
  assert.equal(targetFor('iw'), 'he');
  assert.equal(targetFor('xx'), undefined);
  assert.equal(targetFor('not a tag'), undefined);
});

test('preferredTarget takes the first tag that has a target, then English', () => {
  assert.equal(preferredTarget(['xx-YY', 'de-AT', 'fr']), 'de');
  assert.equal(preferredTarget([]), 'en');
});

test('languageName names a language in a locale', () => {
  assert.equal(languageName('de', 'en'), 'German');
  assert.equal(languageName('de', 'ru'), 'немецкий');
});

test('sameLanguage ignores regions, scripts and case', () => {
  assert.equal(sameLanguage('en-US', 'EN'), true);
  assert.equal(sameLanguage('zh-Hant', 'zh'), true);
  assert.equal(sameLanguage('pt', 'es'), false);
});
