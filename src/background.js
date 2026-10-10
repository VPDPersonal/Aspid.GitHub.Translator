import Anthropic from '@anthropic-ai/sdk';
import { languageName, loadSettings } from './settings.js';

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    source_language: {
      type: 'string',
      description: 'ISO 639-1 code of the main language of the input segments.',
    },
    translations: {
      type: 'array',
      items: { type: 'string' },
      description: 'One translation per input segment, in the same order.',
    },
  },
  required: ['source_language', 'translations'],
  additionalProperties: false,
};

function systemPrompt(target) {
  const name = `${languageName(target, 'en')} (${target})`;
  return `You translate fragments of GitHub pull requests and commits into ${name}: titles, descriptions, comments and commit messages.

The input is JSON {"segments": [...]}. Each segment is a title, a paragraph, a list item, a heading or a table cell. Segments are in reading order and may come from several comments, titles or commits; use neighbouring segments as context only where they clearly belong together.

Rules:
- Return exactly one translation per segment, in the same order.
- Keep the placeholder tags exactly as written. <xN/> stands for inline code, a mention, a link or an image. <gN>...</gN> wraps formatted text: translate the text inside and keep the tags around it. Keep every tag; move a tag only when the grammar of ${name} requires it.
- Do not translate code identifiers, file paths, commands, URLs, version numbers, or names of products and libraries.
- Keep developer jargon (pull request, merge, rebase, commit, CI, etc.) the way a fluent developer writing in ${name} would.
- Keep the tone and length of the original. Do not add explanations or notes.
- If a segment is already in ${name}, or has nothing to translate, return it unchanged.`;
}

function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'неверный API-ключ Claude';
  if (error instanceof Anthropic.PermissionDeniedError) return 'у API-ключа нет доступа к этой модели';
  if (error instanceof Anthropic.NotFoundError) return 'модель не найдена, проверьте настройки';
  if (error instanceof Anthropic.RateLimitError) return 'превышен лимит запросов Claude, попробуйте позже';
  if (error instanceof Anthropic.APIConnectionError) return 'нет соединения с API Claude';
  if (error instanceof Anthropic.APIError) return `ошибка API Claude ${error.status ?? ''}: ${error.message}`;
  return error?.message || String(error);
}

async function translateWithClaude({ segments, target }) {
  const { apiKey, model } = await loadSettings();
  if (!apiKey) throw new Error('не задан API-ключ Claude (откройте настройки расширения)');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 60_000 });
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: systemPrompt(target),
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: 'user', content: JSON.stringify({ segments }) }],
  });

  if (response.stop_reason === 'refusal') throw new Error('Claude отказался переводить этот текст');
  if (response.stop_reason === 'max_tokens') throw new Error('ответ Claude обрезан по max_tokens');

  const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  const data = JSON.parse(text);
  if (!Array.isArray(data.translations) || data.translations.length !== segments.length) {
    throw new Error(`Claude вернул ${data.translations?.length ?? 0} фрагментов вместо ${segments.length}`);
  }
  return { sourceLanguage: data.source_language, translations: data.translations };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'claude-translate') return false;
  translateWithClaude(message).then(sendResponse, (error) => sendResponse({ error: describeError(error) }));
  return true; // Keeps the channel open for the async response.
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
