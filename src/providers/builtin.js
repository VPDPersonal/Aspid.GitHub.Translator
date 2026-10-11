import { callBridge } from '../page-bridge.js';
import { languageName } from '../settings.js';

/**
 * Chrome's built-in Translator API: free, on-device, one model per language pair.
 * @type {import('./index.js').Provider}
 */
export const builtin = {
  id: 'builtin',
  title: 'Встроенный переводчик Chrome',
  hint: 'Бесплатно и без ключей: текст переводится на устройстве и никуда не отправляется. '
    + 'При первом запуске Chrome скачивает языковую модель.',
  needsSource: true,
  plainText: true,
  concurrency: 1,

  prepare: ({ source, target }) => callBridge('translator.prepare', { source, target }),

  async translate({ texts, source, target }) {
    try {
      return { translations: await callBridge('translator.translate', { source, target, texts }) };
    } catch (error) {
      if (error.code === 'NotSupportedError') {
        error.message = `пара ${languageName(source)} → ${languageName(target)} не поддерживается встроенным переводчиком`;
      }
      throw error;
    }
  },
};
