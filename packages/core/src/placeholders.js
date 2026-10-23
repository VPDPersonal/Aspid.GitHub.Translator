// Placeholder tags: how markup that must survive translation travels through a translation engine.
//
// A segment is a run of text that is translated as one piece, such as a paragraph or a list item:
// `{ text, tokens }`. Markup is encoded in `text` as placeholder tags so the engine keeps it:
//   <xN/>        an atom that is copied as is (inline code, mentions, refs, images, protected names)
//   <gN>...</gN> a wrapper whose text is translated (links, bold, italics)
// `tokens[N]` describes tag N. Names protected here are `{ atom: true, text }`; a platform adds
// its own tokens for its markup, such as `{ atom, node }` for a DOM node in a browser.

const LETTER = /\p{L}/u;
// A placeholder tag as a translator returns it. Translators sometimes change its case (`</G0>`)
// or lose a part of it (`<x2>`, `<x2/`, `<x2`, `g1>`), so only the letter, the number and
// a leading slash count. A closing tag of an atom (`</x2>`) is ignored.
const TAG = /<?(\/)?([xg])(\d+)\s*\/?>|<(\/)?([xg])(\d+)\/?/gi;

/** Yields every placeholder tag in `text` as `{ raw, index, atom, close, id }`. */
export function* tags(text) {
  for (const match of text.matchAll(TAG)) {
    yield {
      raw: match[0],
      index: match.index,
      atom: (match[2] ?? match[5]).toLowerCase() === 'x',
      close: Boolean(match[1] ?? match[4]),
      id: Number(match[3] ?? match[6]),
    };
  }
}

export const hasLetters = (text) => LETTER.test(text);
export const stripTags = (text) => text.replace(TAG, ' ').replace(/\s+/g, ' ').trim();

/** Returns the ids of the atoms in `text`. */
export const atomIds = (text) => new Set([...tags(text)].filter((tag) => tag.atom && !tag.close).map((tag) => tag.id));

const WORD_OR_TAG = /(<\/?[xg]\d+\/?>)|([\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)/gu;
const SENTENCE_END = /(?:^|[.!?:(«"'])$/;

function isIdentifier(word) {
  return /\p{Ll}\p{Lu}/u.test(word) // CamelCase: SerializeReference, OnGUI
    || /^\p{Lu}[\p{Lu}\p{N}]+$/u.test(word) // acronyms: CI, IMGUI
    || /[\p{L}\p{N}][_.][\p{L}\p{N}]/u.test(word); // snake_case, file.cs
}

function atSentenceStart(text, offset) {
  const before = text.slice(0, offset).replace(/(?:<\/?[xg]\d+\/?>|\s)+$/, '');
  return !/[\p{L}\p{N}]/u.test(before) || SENTENCE_END.test(before);
}

/**
 * Turns names into atomic placeholders so that a plain machine translator keeps them,
 * e.g. "Unity" no longer becomes "единство".
 * `capitalized` also protects capitalized words in mid-sentence; use it for English sources only.
 */
export function protectNames(segment, { capitalized }) {
  segment.text = segment.text.replace(WORD_OR_TAG, (match, tag, word, offset, text) => {
    if (tag) return tag;
    const name = isIdentifier(word)
      || (capitalized && /^\p{Lu}\p{Ll}+$/u.test(word) && !atSentenceStart(text, offset));
    if (!name) return word;
    const id = segment.tokens.push({ atom: true, text: word }) - 1;
    return `<x${id}/>`;
  });
}

// Conventional commit prefix such as `fix(scope)!:`; kept as is in titles.
const CONVENTIONAL_PREFIX = /^((?:<g\d+>)*)([a-z][a-z0-9-]*(?:\([^)<]*\))?!?:)(?=\s)/;

/** Keeps a conventional commit prefix (`test(scope):`) out of the translation. */
export function protectPrefix(segment) {
  segment.text = segment.text.replace(CONVENTIONAL_PREFIX, (match, wrappers, prefix) => {
    const id = segment.tokens.push({ atom: true, text: prefix }) - 1;
    return `${wrappers}<x${id}/>`;
  });
}

// Git trailers (`Co-Authored-By:`, `Signed-off-by:`) are kept untranslated.
const TRAILER = /^[A-Za-z]+(?:-[A-Za-z]+)+:\s/;
const LIST_ITEM = /^(\s*(?:[-*+•]|\d+[.)])\s+)(.*)$/;

/**
 * Splits a plain-text message, such as a commit body, into paragraphs and list items, one per line
 * of `source`, which may hold placeholder tags. Hard-wrapped lines are joined. Returns the parts in
 * order: `{ verbatim }` for a line that stays as it is (blank, a git trailer, no words), and
 * `{ prefix, text }` for a paragraph or a list item to translate, `prefix` being its list marker.
 */
export function splitPlainText(source) {
  const parts = [];
  let item = null;
  const flush = () => {
    if (item) parts.push({ prefix: item.prefix, text: item.lines.join(' ').replace(/\s+/g, ' ').trim() });
    item = null;
  };
  for (const line of source.split('\n')) {
    const listItem = line.match(LIST_ITEM);
    if (!line.trim() || TRAILER.test(line) || !hasLetters(stripTags(line))) {
      flush();
      parts.push({ verbatim: line });
    } else if (listItem) {
      flush();
      item = { prefix: listItem[1], lines: [listItem[2]] };
    } else if (item && (!item.prefix || /^\s+\S/.test(line))) {
      item.lines.push(line.trim());
    } else {
      flush();
      item = { prefix: '', lines: [line.trim()] };
    }
  }
  flush();
  return parts;
}
