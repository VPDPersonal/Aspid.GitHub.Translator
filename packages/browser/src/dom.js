// Splits a rendered markdown element into translatable segments and writes translations back.
//
// A segment is a run of inline content between block boundaries (a paragraph, a list item,
// a table cell). Inline markup is encoded as placeholder tags so the translator keeps it
// (see @aspid-lingo/core/placeholders): an atom is a node copied as is (inline code, mentions,
// refs, images), a wrapper is an element whose text is translated (links, bold, italics).

import { atomIds, hasLetters, splitPlainText, stripTags, tags } from '@aspid-lingo/core/placeholders';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI',
  'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
  'THEAD', 'TR', 'UL',
]);
const BLOCK_SELECTOR = [...BLOCK_TAGS].map((tag) => tag.toLowerCase()).join(',');

/**
 * How a site renders markdown beyond plain HTML. Each field is a CSS selector, or empty.
 * @typedef {object} Markup
 * @property {string} [skip] Blocks that are never translated, such as highlighted code.
 * @property {string} [atoms] Elements that are copied as they are, such as mentions and issue references.
 * @property {string} [embeds] Live embeds, such as diagrams the site renders in an iframe and finds by id.
 *   A copy of one stays blank, so the live node itself moves into the translation.
 */

// Blocks that are never translated, on any site.
const SKIP_BLOCK_SELECTOR = 'pre, svg, math, script, style, template, textarea';

const ATOM_TAGS = new Set([
  'CODE', 'KBD', 'SAMP', 'VAR', 'TT', 'IMG', 'BR', 'SVG', 'INPUT', 'VIDEO', 'PICTURE', 'MATH', 'BUTTON',
]);

// Link texts that are references rather than prose: URLs, #123, owner/repo#123, SHAs, @user.
const REF_TEXT = /^(?:https?:\/\/\S+|www\.\S+|[\w.\/-]*#\d+|[0-9a-f]{7,40}|@[\w-]+(?:\/[\w-]+)?)$/i;

function isBlock(el) {
  if (BLOCK_TAGS.has(el.tagName)) return true;
  return el.tagName.includes('-') && el.querySelector(BLOCK_SELECTOR) !== null;
}

function isAtom(el, atoms) {
  if (ATOM_TAGS.has(el.tagName) || (atoms && el.matches(atoms))) return true;
  const text = el.textContent.trim();
  if (!hasLetters(text)) return true;
  return el.tagName === 'A' && REF_TEXT.test(text);
}

function collectRuns(root, skip) {
  const runs = [];
  const visit = (el) => {
    if (el.matches(skip)) return;
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

function encodeRun(run, atoms) {
  const tokens = [];
  const encode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const id = tokens.length;
    if (isAtom(node, atoms)) {
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

/** Returns the segments of `root`, rendered markdown in the site's `markup`, that contain words to translate. */
export function collectSegments(root, markup) {
  const skip = [SKIP_BLOCK_SELECTOR, markup.embeds, markup.skip].filter(Boolean).join(',');
  return collectRuns(root, skip)
    .map((run) => encodeRun(run, markup.atoms))
    .filter((segment) => hasLetters(stripTags(segment.text)));
}

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

  const fragment = document.createDocumentFragment();
  const segments = [];
  splitPlainText(source).forEach((part, i) => {
    if (i > 0) fragment.append('\n');
    if ('verbatim' in part) {
      fragment.append(decode(part.verbatim, tokens, atomIds(part.verbatim)));
      return;
    }
    const { prefix, text } = part;
    const container = document.createElement('span');
    container.append(decode(text, tokens, atomIds(text)));
    fragment.append(prefix, container);
    segments.push({ container, tokens, text });
  });
  root.replaceChildren(fragment);
  return segments;
}

// A copy of an atom: a node of the page, or a name that the core protected.
const copyAtom = (token) => token.node?.cloneNode(true) ?? document.createTextNode(token.text);

function decode(text, tokens, expectedAtoms) {
  const fragment = document.createDocumentFragment();
  const stack = [{ node: fragment, id: -1 }];
  const used = new Set();
  const top = () => stack[stack.length - 1].node;
  const pushText = (value) => {
    if (value) top().appendChild(document.createTextNode(value));
  };

  let last = 0;
  for (const { raw, index: start, atom, close, id } of tags(text)) {
    pushText(text.slice(last, start));
    last = start + raw.length;
    const token = tokens[id];
    if (!token) {
      pushText(raw); // not a placeholder after all, e.g. `x2>` in a commit message
    } else if (atom) {
      if (!close && !used.has(id)) {
        used.add(id);
        top().appendChild(copyAtom(token));
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
    if (!used.has(id) && tokens[id]) fragment.append(' ', copyAtom(tokens[id]));
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

/** Makes a detached copy of a comment body that the site's scripts (`js-` hooks) and our scanner ignore. */
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
export function linkEmbeds(el, clone, { embeds }) {
  if (!embeds) return [];
  const originals = [...el.querySelectorAll(embeds)];
  const copies = [...clone.querySelectorAll(embeds)];
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
export function textOf(el, { embeds }) {
  if (!embeds || !el.querySelector(embeds)) return el.textContent;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeType === Node.ELEMENT_NODE && node.matches(embeds)
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
