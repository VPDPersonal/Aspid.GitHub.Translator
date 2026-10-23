// What Aspid Lingo translates on GitHub: the pages, their parts and how GitHub renders markdown.
// The page translator in @aspid-lingo/browser does the rest.
import { startPageTranslator } from '@aspid-lingo/browser/page-translator';
import { loadSettings } from './settings.js';

// Pull requests (all tabs), single commits and commit lists.
const PAGE_PATH = /^\/[^/]+\/[^/]+\/(?:pull\/\d+|commit\/[0-9a-f]{7,40}|commits(?=\/|$))/;
// Repository home, folders and files. The button shows up there only when a README is rendered.
const REPO_PATH = /^\/[^/]+\/[^/]+(?:\/(?:tree|blob)\/.+)?\/?$/;
const README_SELECTOR = 'article.markdown-body[itemprop="text"], #readme .markdown-body';

const TARGETS = [
  {
    mode: 'inline',
    kind: 'prTitle',
    selector: 'h1 .markdown-title, h2[class*="PageHeader-Title"] .markdown-title, .gh-header-title .js-issue-title',
  },
  {
    mode: 'inline',
    kind: 'commitTitles',
    selector: [
      '.js-details-container code:has(> a.markdown-title)', // PR conversation timeline
      '[data-testid="commit-row-item"] h4 > span', // commit lists
      '[class*="commitMessageContainer"] > span:not(.extended-commit-description-container)', // commit page
    ].join(','),
  },
  {
    mode: 'plain',
    kind: 'commitBodies',
    selector: '.extended-commit-description-container, .js-details-container .Details-content--hidden > pre',
  },
  { mode: 'block', kind: markdownKind, selector: '.markdown-body' },
];

function markdownKind(el) {
  if (el.matches(README_SELECTOR)) return 'readme';
  if (el.closest('[id^="pullrequest-"]')) return 'prBody';
  const review = [
    '.review-comment', '.review-thread-component', '.js-resolvable-timeline-thread-container',
    '[id^="discussion_r"]', '[id^="pullrequestreview-"]', '[data-testid*="review-thread"]',
    '[class*="ReviewThread"]',
  ].join(',');
  return el.closest(review) ? 'reviewComments' : 'comments';
}

startPageTranslator({
  page({ pathname }) {
    const pr = pathname.match(PAGE_PATH)?.[0];
    if (pr) return { key: pr };
    if (REPO_PATH.test(pathname)) {
      return { key: pathname, ready: (parts) => parts.readme && document.querySelector(README_SELECTOR) !== null };
    }
    return null;
  },
  targets: TARGETS,
  exclude: [
    'form', '[contenteditable="true"]', '.js-preview-body', '.prose-diff',
    '.rich-diff', '.js-file-content', '[class*="MarkdownEditor"]', '[class*="markdown-editor"]',
  ].join(','),
  markup: {
    skip: [
      '.highlight', '.snippet-clipboard-content', '.js-suggested-changes-blob', '.blob-wrapper',
      '.zeroclipboard-container', 'math-renderer',
    ].join(','),
    atoms: [
      '.user-mention', '.team-mention', '.issue-link', '.commit-link', 'a.anchor', '[data-hovercard-type]',
      'g-emoji', 'math-renderer', 'clipboard-copy',
    ].join(','),
    // Diagrams and maps (mermaid, GeoJSON, STL) that GitHub renders in an iframe and finds by id.
    embeds: '.render-needs-enrichment',
  },
  // GitHub text is English far more often than not.
  defaultSource: 'en',
  navigationEvents: ['turbo:load'],
  // Classic GitHub comments render the body as a <td>; put the label above its table instead.
  labelAnchor: (el) => (el.tagName === 'TD' ? el.closest('table') ?? el : el),
}, loadSettings);
