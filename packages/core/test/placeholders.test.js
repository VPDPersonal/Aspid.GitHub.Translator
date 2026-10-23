import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  atomIds, hasLetters, protectNames, protectPrefix, splitPlainText, stripTags, tags,
} from '../src/placeholders.js';

const segment = (text, tokens = []) => ({ text, tokens });

describe('tags', () => {
  test('reads tags that a translator changed or cut', () => {
    const found = [...tags('a <x1/> b </G0> <x2> c <g3')].map(({ raw, atom, close, id }) => ({ raw, atom, close, id }));
    assert.deepEqual(found, [
      { raw: '<x1/>', atom: true, close: false, id: 1 },
      { raw: '</G0>', atom: false, close: true, id: 0 },
      { raw: '<x2>', atom: true, close: false, id: 2 },
      { raw: '<g3', atom: false, close: false, id: 3 },
    ]);
  });

  test('atomIds ignores closing atoms and wrappers', () => {
    assert.deepEqual(atomIds('<x1/> </x3> <X2> <g4>text</g4>'), new Set([1, 2]));
  });

  test('stripTags leaves the words', () => {
    assert.equal(stripTags('<g0>Hello</g0>  <x1/> world'), 'Hello world');
    assert.equal(hasLetters(stripTags('<x0/> 42')), false);
    assert.equal(hasLetters(stripTags('<x0/> fixed')), true);
  });
});

describe('protectNames', () => {
  test('protects identifiers, acronyms and file names', () => {
    const s = segment('Second item about the OnGUI method and snake_case names in file.cs');
    protectNames(s, { capitalized: false });
    assert.equal(s.text, 'Second item about the <x0/> method and <x1/> names in <x2/>');
    assert.deepEqual(s.tokens, [
      { atom: true, text: 'OnGUI' },
      { atom: true, text: 'snake_case' },
      { atom: true, text: 'file.cs' },
    ]);
  });

  test('protects capitalized words in mid-sentence only for English sources', () => {
    const english = segment('Read the notes before you merge it. Ask Bob about the CI.');
    protectNames(english, { capitalized: true });
    assert.equal(english.text, 'Read the notes before you merge it. Ask <x0/> about the <x1/>.');

    const other = segment('Read the notes before you merge it. Ask Bob about the CI.');
    protectNames(other, { capitalized: false });
    assert.equal(other.text, 'Read the notes before you merge it. Ask Bob about the <x0/>.');
  });

  test('keeps existing tags and numbers them after the existing tokens', () => {
    const s = segment('<g0>Open the Unity docs</g0> <x1/>', [{ atom: false }, { atom: true }]);
    protectNames(s, { capitalized: true });
    assert.equal(s.text, '<g0>Open the <x2/> docs</g0> <x1/>');
    assert.deepEqual(s.tokens[2], { atom: true, text: 'Unity' });
  });
});

describe('protectPrefix', () => {
  test('keeps a conventional commit prefix out of the translation', () => {
    const s = segment('fix(ci): Run the SerializeReference tests on Unity 6');
    protectPrefix(s);
    protectNames(s, { capitalized: true });
    assert.equal(s.text, '<x0/> Run the <x1/> tests on <x2/> 6');
    assert.deepEqual(s.tokens.map((token) => token.text), ['fix(ci):', 'SerializeReference', 'Unity']);
  });

  test('finds the prefix inside leading wrappers', () => {
    const s = segment('<g0>feat(api)!: Add the cache</g0>', [{ atom: false }]);
    protectPrefix(s);
    assert.equal(s.text, '<g0><x1/> Add the cache</g0>');
    assert.deepEqual(s.tokens[1], { atom: true, text: 'feat(api)!:' });
  });

  test('leaves a title without a prefix alone', () => {
    const s = segment('Note: this is not a prefix');
    protectPrefix(s);
    assert.equal(s.text, 'Note: this is not a prefix');
  });
});

describe('splitPlainText', () => {
  test('joins hard-wrapped lines and keeps trailers verbatim', () => {
    const body = [
      'Long description of the change that wraps',
      'onto a second line.',
      '',
      '- Fix the first problem',
      '- Fix the second problem',
      '  with a continued line',
      '1) A numbered item',
      '<x0/>',
      'Co-Authored-By: Jane Doe <jane@example.com>',
      'Signed-off-by: John Roe <john@example.com>',
    ].join('\n');
    assert.deepEqual(splitPlainText(body), [
      { prefix: '', text: 'Long description of the change that wraps onto a second line.' },
      { verbatim: '' },
      { prefix: '- ', text: 'Fix the first problem' },
      { prefix: '- ', text: 'Fix the second problem with a continued line' },
      { prefix: '1) ', text: 'A numbered item' },
      { verbatim: '<x0/>' },
      { verbatim: 'Co-Authored-By: Jane Doe <jane@example.com>' },
      { verbatim: 'Signed-off-by: John Roe <john@example.com>' },
    ]);
  });

  test('starts a new paragraph after a list item without indentation', () => {
    assert.deepEqual(splitPlainText('- An item\nA paragraph'), [
      { prefix: '- ', text: 'An item' },
      { prefix: '', text: 'A paragraph' },
    ]);
  });
});
