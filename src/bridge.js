// Runs in the page's MAIN world, where Chrome exposes the on-device Translator and
// LanguageDetector APIs. The isolated content script talks to it through window events
// with JSON string payloads.
(() => {
  if (window.__ghtBridge) return;
  window.__ghtBridge = true;

  let detectorPromise = null;
  const translatorPromises = new Map();

  const emit = (type, payload) =>
    window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(payload) }));

  const monitor = (m) =>
    m.addEventListener('downloadprogress', (event) => emit('ght:progress', { loaded: event.loaded }));

  function unsupported(api) {
    const error = new Error(`${api} API недоступен в этом браузере: нужен Chrome 138 или новее на компьютере.`);
    error.name = 'Unsupported';
    return error;
  }

  // create() must be called synchronously inside a user gesture when a model needs a download,
  // so these helpers start the call before their first await.
  function getDetector() {
    if (!('LanguageDetector' in self)) return Promise.reject(unsupported('Language Detector'));
    detectorPromise ??= LanguageDetector.create({ monitor }).catch((error) => {
      detectorPromise = null;
      throw error;
    });
    return detectorPromise;
  }

  function getTranslator(sourceLanguage, targetLanguage) {
    if (!('Translator' in self)) return Promise.reject(unsupported('Translator'));
    const key = `${sourceLanguage}>${targetLanguage}`;
    if (!translatorPromises.has(key)) {
      const promise = Translator.create({ sourceLanguage, targetLanguage, monitor }).catch((error) => {
        translatorPromises.delete(key);
        throw error;
      });
      translatorPromises.set(key, promise);
    }
    return translatorPromises.get(key);
  }

  const handlers = {
    async 'detector.prepare'() {
      await getDetector();
      return true;
    },
    async 'detector.detect'({ text }) {
      const detector = await getDetector();
      const results = await detector.detect(text);
      return results.slice(0, 3).map((r) => ({ lang: r.detectedLanguage, confidence: r.confidence }));
    },
    async 'translator.prepare'({ source, target }) {
      await getTranslator(source, target);
      return true;
    },
    async 'translator.translate'({ source, target, texts }) {
      const translator = await getTranslator(source, target);
      const out = [];
      for (const text of texts) out.push(await translator.translate(text));
      return out;
    },
  };

  window.addEventListener('ght:req', (event) => {
    let request;
    try {
      request = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (!Object.hasOwn(handlers, request.op)) return;
    handlers[request.op](request.args ?? {}).then(
      (result) => emit('ght:res', { id: request.id, result }),
      (error) => emit('ght:res', {
        id: request.id,
        error: error?.message || String(error),
        code: error?.name === 'NotAllowedError' ? 'activation' : error?.name,
      }),
    );
  });
})();
