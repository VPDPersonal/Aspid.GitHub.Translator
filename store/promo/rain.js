// The code rain of the Aspid promo film (the Venom canvas), frozen in one frame: columns of text set one
// character per row, faint white with a rare green character, fading out towards the bottom and thinned
// out behind the text so it stays readable. Here the columns hold pull request comments and commit
// messages in eight languages, and a little code. Seeded, so every render draws the same frame.

// Each entry is one line in en, zh, ru, ja, ko, es, de, pt; code has a single form.
const RAIN_LINES = [
  ['fix: observe callback not firing', '修复 observe 回调不触发的问题', 'Исправлен вызов observe', 'observe のコールバックを修正',
    'observe 콜백 수정', 'Corrige el callback de observe', 'Behebt den observe-Callback', 'Corrige o callback de observe'],
  ['Looks good to me', '看起来没问题', 'Выглядит хорошо', '問題なさそうです', '좋아 보입니다', 'Me parece bien', 'Sieht gut aus', 'Parece bom'],
  ['Add tests for the parser', '为解析器添加测试', 'Добавлены тесты парсера', 'パーサーのテストを追加', '파서 테스트 추가',
    'Añade pruebas del parser', 'Tests für den Parser', 'Adiciona testes do parser'],
  ['Update the README', '更新 README', 'Обновлён README', 'README を更新', 'README 업데이트', 'Actualiza el README',
    'README aktualisiert', 'Atualiza o README'],
  ['Could you rebase on main?', '可以 rebase 到 main 吗？', 'Сделаете rebase на main?', 'main に rebase できますか？',
    'main에 rebase 해 주실래요?', '¿Puedes hacer rebase sobre main?', 'Bitte auf main rebasen', 'Pode fazer rebase na main?'],
  ['const text = await translator.translate(body);'],
  ['if (!text.trim()) return;'],
  ['git commit -m "docs: translate"'],
];
const RAIN_LANGUAGES = 8;

function rainRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The box around the text in `element`: a heading is as wide as the frame, its words are not.
function textBox(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
  }
  return right > left ? { left, top, width: right - left, height: bottom - top } : null;
}

// Draws the rain on `canvas`; `scale` sizes it against the film's 1920×1080 frame, `clear` lists the
// elements to thin it out behind.
async function drawRain(canvas, { scale = 1, seed = 7, clear = [] } = {}) {
  await document.fonts.load(`${Math.round(22 * scale)}px "Geist Mono"`);
  await document.fonts.ready;
  const box = canvas.getBoundingClientRect();
  const { width, height } = box;
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  const g = canvas.getContext('2d');
  g.scale(devicePixelRatio, devicePixelRatio);
  g.textAlign = 'center';
  g.textBaseline = 'top';

  const random = rainRandom(seed);
  const layers = [{ size: 13, alpha: 0.08 }, { size: 17, alpha: 0.12 }, { size: 22, alpha: 0.17 }];
  const step = 40 * scale;
  for (let x = step / 2, column = 0; x < width + step; x += step, column++) {
    if (column > 1 && random() < 0.08) continue; // a rare empty column, never at the left edge
    const layer = layers[random() < 0.42 ? 0 : random() < 0.62 ? 1 : 2];
    const size = layer.size * scale;
    const row = Math.round(size * 1.32);
    const language = Math.floor(random() * RAIN_LANGUAGES);
    const text = [0, 1, 2].map(() => {
      const line = RAIN_LINES[Math.floor(random() * RAIN_LINES.length)];
      return (line[language] ?? line[0]) + ' '.repeat(3 + Math.floor(random() * 6));
    }).join('');
    const start = Math.floor(random() * text.length);
    g.font = `${size}px "Geist Mono", monospace`;
    for (let r = 0, y = -random() * row; y < height; r++, y += row) {
      const char = text[(start + r) % text.length];
      if (char === ' ') continue;
      g.fillStyle = random() < 0.05
        ? `rgba(108, 196, 123, ${Math.min(layer.alpha * 2.4, 0.9)})`
        : `rgba(242, 242, 238, ${layer.alpha})`;
      g.fillText(char, x, y);
    }
  }

  // The film's fade: in over the top edge, out over the lower half.
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, 0, height);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(0.06, '#000');
  fade.addColorStop(0.42, '#000');
  fade.addColorStop(0.7, 'rgba(0, 0, 0, 0.4)');
  fade.addColorStop(0.95, 'rgba(0, 0, 0, 0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, width, height);

  g.globalCompositeOperation = 'destination-out';
  for (const element of clear) {
    const rect = textBox(element);
    if (!rect) continue;
    const rx = rect.width * 0.75;
    const ry = rect.height * 0.9;
    g.save();
    g.translate(rect.left - box.left + rect.width / 2, rect.top - box.top + rect.height / 2);
    g.scale(1, ry / rx);
    const hole = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    hole.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    hole.addColorStop(0.55, 'rgba(0, 0, 0, 0.6)');
    hole.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = hole;
    g.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    g.restore();
  }
}
