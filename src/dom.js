// Splits a rendered markdown element into translatable segments and writes translations back.
//
// A segment is a run of inline content between block boundaries (a paragraph, a list item,
// a table cell). Inline markup is encoded as placeholder tags so the translator keeps it:
//   <xN/>        an atomic node that is copied as-is (inline code, mentions, refs, images)
//   <gN>...</gN> a wrapper whose text is translated (links, bold, italics)

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI',
  'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
  'THEAD', 'TR', 'UL',
]);
const BLOCK_SELECTOR = [...BLOCK_TAGS].map((tag) => tag.toLowerCase()).join(',');

// Diagrams and maps (mermaid, GeoJSON, STL) that GitHub renders in an iframe and finds by id.
// A copy of one stays blank, so the live node itself moves into the translation.
const EMBED_SELECTOR = '.render-needs-enrichment';

// Blocks that are never translated.
const SKIP_BLOCK_SELECTOR = [
  EMBED_SELECTOR, 'pre', '.highlight', '.snippet-clipboard-content', '.js-suggested-changes-blob', '.blob-wrapper',
  '.zeroclipboard-container', 'svg', 'math', 'math-renderer', 'script', 'style', 'template', 'textarea',
].join(',');

const ATOM_TAGS = new Set([
  'CODE', 'KBD', 'SAMP', 'VAR', 'TT', 'IMG', 'BR', 'SVG', 'G-EMOJI', 'INPUT', 'VIDEO', 'PICTURE',
  'MATH', 'MATH-RENDERER', 'BUTTON', 'CLIPBOARD-COPY',
]);
const ATOM_SELECTOR = '.user-mention, .team-mention, .issue-link, .commit-link, a.anchor, [data-hovercard-type]';

// Link texts that are references rather than prose: URLs, #123, owner/repo#123, SHAs, @user.
const REF_TEXT = /^(?:https?:\/\/\S+|www\.\S+|[\w.\/-]*#\d+|[0-9a-f]{7,40}|@[\w-]+(?:\/[\w-]+)?)$/i;
const LETTER = /\p{L}/u;
// A placeholder tag as a translator returns it. Translators sometimes change its case (`</G0>`)
// or lose a part of it (`<x2>`, `<x2/`, `<x2`, `g1>`), so only the letter, the number and
// a leading slash count. A closing tag of an atom (`</x2>`) is ignored.
const TAG = /<?(\/)?([xg])(\d+)\s*\/?>|<(\/)?([xg])(\d+)\/?/gi;

function parseTag(match) {
  return {
    atom: (match[2] ?? match[5]).toLowerCase() === 'x',
    close: Boolean(match[1] ?? match[4]),
    id: Number(match[3] ?? match[6]),
  };
}

export const hasLetters = (text) => LETTER.test(text);
export const stripTags = (text) => text.replace(TAG, ' ').replace(/\s+/g, ' ').trim();

function isBlock(el) {
  if (BLOCK_TAGS.has(el.tagName)) return true;
  return el.tagName.includes('-') && el.querySelector(BLOCK_SELECTOR) !== null;
}

function isAtom(el) {
  if (ATOM_TAGS.has(el.tagName) || el.matches(ATOM_SELECTOR)) return true;
  const text = el.textContent.trim();
  if (!hasLetters(text)) return true;
  return el.tagName === 'A' && REF_TEXT.test(text);
}

function collectRuns(root) {
  const runs = [];
  const visit = (el) => {
    if (el.matches(SKIP_BLOCK_SELECTOR)) return;
    let run = [];
    const flush = () => {
      if (run.length) runs.push(run);
      run = [];
    };
    for (const child of [...el.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE && isBlock(child)) {
        flush();
        visit(child);
      } else if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.ELEMENT_NODE) {
        run.push(child);
      }
    }
    flush();
  };
  visit(root);
  return runs;
}

function encodeRun(run) {
  const tokens = [];
  const encode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const id = tokens.length;
    if (isAtom(node)) {
      tokens.push({ node, atom: true });
      return `<x${id}/>`;
    }
    tokens.push({ node, atom: false });
    const inner = [...node.childNodes].map(encode).join('');
    return `<g${id}>${inner}</g${id}>`;
  };
  const text = run.map(encode).join('').replace(/\s+/g, ' ').trim();
  return { run, tokens, text };
}

/** Returns the segments of `root` that contain words to translate. */
export function collectSegments(root) {
  return collectRuns(root)
    .map(encodeRun)
    .filter((segment) => hasLetters(stripTags(segment.text)));
}

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
    const id = segment.tokens.push({ node: document.createTextNode(word), atom: true }) - 1;
    return `<x${id}/>`;
  });
}

// Conventional commit prefix such as `fix(scope)!:`; kept as is in titles.
const CONVENTIONAL_PREFIX = /^((?:<g\d+>)*)([a-z][a-z0-9-]*(?:\([^)<]*\))?!?:)(?=\s)/;

/** Keeps a conventional commit prefix (`test(scope):`) out of the translation. */
export function protectPrefix(segment) {
  segment.text = segment.text.replace(CONVENTIONAL_PREFIX, (match, tags, prefix) => {
    const id = segment.tokens.push({ node: document.createTextNode(prefix), atom: true }) - 1;
    return `${tags}<x${id}/>`;
  });
}

const atomIds = (text) => new Set([...text.matchAll(TAG)].map(parseTag).filter((tag) => tag.atom && !tag.close).map((tag) => tag.id));

// Git trailers (`Co-Authored-By:`, `Signed-off-by:`) are kept untranslated.
const TRAILER = /^[A-Za-z]+(?:-[A-Za-z]+)+:\s/;
const LIST_ITEM = /^(\s*(?:[-*+•]|\d+[.)])\s+)(.*)$/;

/**
 * Splits a plain-text commit body (`white-space: pre-wrap`) into paragraphs and list items.
 * Hard-wrapped lines are joined, and `root` is rebuilt so each segment owns a container.
 */
export function collectPlainSegments(root) {
  const tokens = [];
  const source = [...root.childNodes].map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.tagName === 'BR') return '\n';
    return `<x${tokens.push({ node, atom: true }) - 1}/>`;
  }).join('');

  const parts = [];
  let item = null;
  const flush = () => {
    if (item) parts.push(item);
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

  const fragment = document.createDocumentFragment();
  const segments = [];
  parts.forEach((part, i) => {
    if (i > 0) fragment.append('\n');
    if ('verbatim' in part) {
      fragment.append(decode(part.verbatim, tokens, atomIds(part.verbatim)));
      return;
    }
    const text = part.lines.join(' ').replace(/\s+/g, ' ').trim();
    const container = document.createElement('span');
    container.append(decode(text, tokens, atomIds(text)));
    fragment.append(part.prefix, container);
    segments.push({ container, tokens, text });
  });
  root.replaceChildren(fragment);
  return segments;
}

function decode(text, tokens, expectedAtoms) {
  const fragment = document.createDocumentFragment();
  const stack = [{ node: fragment, id: -1 }];
  const used = new Set();
  const top = () => stack[stack.length - 1].node;
  const pushText = (value) => {
    if (value) top().appendChild(document.createTextNode(value));
  };

  let last = 0;
  for (const match of text.matchAll(TAG)) {
    pushText(text.slice(last, match.index));
    last = match.index + match[0].length;
    const { atom, close, id } = parseTag(match);
    const token = tokens[id];
    if (!token) {
      pushText(match[0]); // not a placeholder after all, e.g. `x2>` in a commit message
    } else if (atom) {
      if (!close && !used.has(id)) {
        used.add(id);
        top().appendChild(token.node.cloneNode(true));
      }
    } else if (!close) {
      if (!token.atom && !used.has(id)) {
        used.add(id);
        const shell = token.node.cloneNode(false);
        top().appendChild(shell);
        stack.push({ node: shell, id });
      }
    } else {
      const index = stack.findLastIndex((entry) => entry.id === id);
      if (index > 0) stack.length = index;
    }
  }
  pushText(text.slice(last));

  // Never lose code or references, even if the translator dropped their placeholders.
  for (const id of expectedAtoms) {
    if (!used.has(id) && tokens[id]) fragment.append(' ', tokens[id].node.cloneNode(true));
  }
  return fragment;
}

/** Replaces the segment's original content with the translated text. */
export function applyTranslation(segment, translated) {
  const fragment = decode(translated, segment.tokens, atomIds(segment.text));
  if (segment.container) {
    segment.container.replaceChildren(fragment);
    return;
  }
  const first = segment.run[0];
  first.parentNode.insertBefore(fragment, first);
  for (const node of segment.run) node.remove();
}

/** Makes a detached copy of a comment body that GitHub scripts and our scanner ignore. */
export function cloneForTranslation(el) {
  const clone = el.cloneNode(true);
  clone.setAttribute('data-lingo-clone', '');
  clone.removeAttribute('id');
  clone.removeAttribute('data-testid');
  if (clone.hasAttribute('data-lingo-hidden')) {
    clone.removeAttribute('data-lingo-hidden');
    clone.style.removeProperty('display');
  }
  clone.classList.remove(...[...clone.classList].filter((name) => name.startsWith('js-')));
  // Ids move between the original and the copy, so anchors (README tables of contents) follow what is shown.
  for (const node of clone.querySelectorAll('[id]')) {
    node.setAttribute('data-lingo-id', node.id);
    node.removeAttribute('id');
  }
  return clone;
}

/**
 * Pairs the live embeds of `el` with their copies in `clone`, which become empty slots.
 * Returns the pairs for placeEmbeds(), or nothing when `el` changed since it was copied.
 */
export function linkEmbeds(el, clone) {
  const originals = [...el.querySelectorAll(EMBED_SELECTOR)];
  const copies = [...clone.querySelectorAll(EMBED_SELECTOR)];
  if (originals.length !== copies.length) return [];
  return originals.map((node, i) => {
    const home = document.createComment('lingo-embed');
    node.before(home);
    const slot = document.createComment('lingo-embed');
    copies[i].replaceWith(slot);
    return { node, home, slot };
  });
}

/** Returns the text of `el` without live embeds, so moving them does not look like an edit. */
export function textOf(el) {
  if (!el.querySelector(EMBED_SELECTOR)) return el.textContent;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeType === Node.ELEMENT_NODE && node.matches(EMBED_SELECTOR)
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT),
  });
  let text = '';
  while (walker.nextNode()) if (walker.currentNode.nodeType === Node.TEXT_NODE) text += walker.currentNode.nodeValue;
  return text;
}

/** Moves linked embeds into the translation or back to the original without reloading their iframes. */
export function placeEmbeds(embeds, inTranslation) {
  for (const { node, home, slot } of embeds) {
    const anchor = inTranslation ? slot : home;
    const parent = anchor.parentNode;
    if (!parent) continue;
    // moveBefore keeps iframe state but needs both ends in the document.
    if (node.isConnected && anchor.isConnected) parent.moveBefore(node, anchor);
    else parent.insertBefore(node, anchor);
  }
}
