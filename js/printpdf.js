// Draws a recipe onto A4 pages and wraps them in a PDF.
// iPhone home-screen apps cannot open the print dialog, so the PDF goes to the
// share sheet instead, which has Print, Save to Files, Messages and Mail.

import { formatAmount, scaleRecipeQty, minutesLabel } from './quantities.js';
import { tagColour, tagCode } from './model.js';

const DPI = 200;
const MM = DPI / 25.4; // px per mm
const PT = DPI / 72; // px per point
const W = Math.round(210 * MM);
const H = Math.round(297 * MM);
const M = { top: 14 * MM, side: 15 * MM, bottom: 16 * MM };

const INK = '#161616';
const INK2 = '#4b4b4b';
const INK3 = '#8c8c8c';
const RULE = '#dedede';
const SERIF = "'Fraunces', Georgia, serif";
const SANS = "'Instrument Sans', system-ui, sans-serif";

const font = (size, { family = SANS, weight = 400, italic = false } = {}) => `${italic ? 'italic ' : ''}${weight} ${Math.round(size * PT)}px ${family}`;

async function loadFonts() {
  const specs = [font(12, { family: SERIF, weight: 500 }), font(12, { family: SERIF, weight: 500, italic: true }), font(12), font(12, { weight: 600 })];
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
  } catch (e) {
    /* fall back to system fonts */
  }
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ---- text layout -----------------------------------------------------------

// runs: [{ text, font, color }] -> lines of positioned words
function layoutRuns(ctx, runs, maxWidth) {
  const words = [];
  for (const r of runs) {
    const parts = String(r.text).split(/(\s+)/).filter((p) => p.length);
    for (const p of parts) words.push({ text: p, font: r.font, color: r.color, space: /^\s+$/.test(p) });
  }
  const lines = [];
  let line = [];
  let x = 0;
  for (const w of words) {
    ctx.font = w.font;
    const width = ctx.measureText(w.space ? ' ' : w.text).width;
    if (w.space) {
      if (line.length) {
        line.push({ ...w, text: ' ', x, width });
        x += width;
      }
      continue;
    }
    if (x + width > maxWidth && line.length) {
      while (line.length && line[line.length - 1].space) line.pop();
      lines.push(line);
      line = [];
      x = 0;
    }
    line.push({ ...w, x, width });
    x += width;
  }
  while (line.length && line[line.length - 1].space) line.pop();
  if (line.length) lines.push(line);
  return lines;
}

function drawLine(ctx, line, x, y) {
  for (const w of line) {
    if (w.space) continue;
    ctx.font = w.font;
    ctx.fillStyle = w.color;
    ctx.fillText(w.text, x + w.x, y);
  }
}

// ---- pages -----------------------------------------------------------------

class Pages {
  constructor() {
    this.canvases = [];
    this.add();
  }
  add() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    this.canvases.push(c);
    return ctx;
  }
  ctx(i) {
    while (i >= this.canvases.length) this.add();
    return this.canvases[i].getContext('2d');
  }
}

// A column that flows onto new pages when it reaches the bottom margin.
class Column {
  constructor(pages, x, width, page, y) {
    Object.assign(this, { pages, x, width, page, y });
  }
  ensure(height) {
    if (this.y + height > H - M.bottom) {
      this.page += 1;
      this.y = M.top;
    }
    return this.pages.ctx(this.page);
  }
}

export async function renderRecipePages(recipe, serves, base, photoSrc) {
  await loadFonts();
  const img = await loadImage(photoSrc);
  const pages = new Pages();
  const ctx = pages.ctx(0);
  const accent = tagColour(recipe.tags?.[0] || recipe.course || recipe.title);
  const contentW = W - 2 * M.side;
  let y = M.top;

  // Photo, cropped to fill
  if (img) {
    const ph = 62 * MM;
    const scale = Math.max(contentW / img.naturalWidth, ph / img.naturalHeight);
    const sw = contentW / scale;
    const sh = ph / scale;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, M.side, y, contentW, ph);
    y += ph + 7 * MM;
  }

  // Title
  const titleFont = font(26, { family: SERIF, weight: 500 });
  for (const line of layoutRuns(ctx, [{ text: recipe.title, font: titleFont, color: INK }], contentW)) {
    y += 26 * PT * 1.0;
    drawLine(ctx, line, M.side, y);
  }

  // Intro
  if (recipe.headnote) {
    y += 3 * MM;
    const hf = font(11, { family: SERIF, italic: true });
    for (const line of layoutRuns(ctx, [{ text: recipe.headnote, font: hf, color: INK2 }], Math.min(contentW, 135 * MM))) {
      y += 11 * PT * 1.45;
      drawLine(ctx, line, M.side, y);
    }
  }

  // Times and rating between two rules
  y += 5 * MM;
  rule(ctx, M.side, y, contentW);
  const factsH = 9 * MM;
  const times = [recipe.prepMinutes ? `Prep ${minutesLabel(recipe.prepMinutes)}` : null, recipe.cookMinutes ? `Cook ${minutesLabel(recipe.cookMinutes)}` : null]
    .filter(Boolean)
    .join('     ');
  ctx.font = font(9);
  ctx.fillStyle = INK2;
  ctx.fillText(times, M.side, y + factsH / 2 + 9 * PT * 0.35);
  if (recipe.rating) {
    const s = 3.2 * MM;
    for (let i = 0; i < 5; i++) {
      const cx = M.side + contentW - (4 - i) * (s * 2.4) - s;
      star(ctx, cx, y + factsH / 2, s, i < recipe.rating ? accent : null);
    }
  }
  y += factsH;
  rule(ctx, M.side, y, contentW);

  // Tags
  if (recipe.tags?.length) {
    y += 4 * MM;
    let x = M.side;
    const r = 2.4 * MM;
    for (const t of recipe.tags) {
      ctx.font = font(9);
      const tw = ctx.measureText(t).width;
      const need = 2 * r + 2 * MM + tw + 6 * MM;
      if (x + need > M.side + contentW) {
        x = M.side;
        y += 7 * MM;
      }
      ctx.fillStyle = tagColour(t);
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = font(6, { family: SERIF, weight: 600 });
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(tagCode(t), x + r, y + r + 6 * PT * 0.35);
      ctx.textAlign = 'left';
      ctx.font = font(9);
      ctx.fillStyle = INK;
      ctx.fillText(t, x + 2 * r + 2 * MM, y + r + 9 * PT * 0.35);
      x += need;
    }
    y += 2 * r;
  }

  y += 8 * MM;
  const leftW = 70 * MM;
  const gap = 9 * MM;
  const left = new Column(pages, M.side, leftW, 0, y);
  const right = new Column(pages, M.side + leftW + gap, contentW - leftW - gap, 0, y);

  drawIngredients(left, recipe, serves, base, accent);
  drawMethod(right, recipe, accent);

  return pages.canvases;
}

function drawIngredients(col, recipe, serves, base, accent) {
  let ctx = col.ensure(20 * MM);
  col.y += 15 * PT;
  ctx.font = font(15, { family: SERIF, weight: 500 });
  ctx.fillStyle = INK;
  ctx.fillText('Ingredients', col.x, col.y);

  col.y += 4 * MM + 15 * PT * 0.8;
  ctx.font = font(15, { family: SERIF, weight: 500 });
  ctx.fillStyle = accent;
  const n = String(serves);
  ctx.fillText(n, col.x, col.y);
  const nw = ctx.measureText(n).width;
  ctx.font = font(11, { family: SERIF, italic: true });
  ctx.fillStyle = INK2;
  const label = recipe.yieldNote && !/^(serves|feeds|for)\s*\d+$/i.test(recipe.yieldNote.trim()) && serves === base ? recipe.yieldNote : 'serves';
  ctx.fillText(label, col.x + nw + 2 * MM, col.y);
  col.y += 3 * MM;
  rule(ctx, col.x, col.y, col.width);

  const factor = serves / base;
  const amountW = 17 * MM;
  const size = 9.5;
  const lh = size * PT * 1.4;
  const pad = 1.2 * MM;
  let group = null;
  for (const ing of recipe.ingredients || []) {
    const g = ing.group || null;
    if (g !== group) {
      group = g;
      if (g) {
        ctx = col.ensure(12 * MM);
        col.y += 5 * MM + 11 * PT * 0.8;
        ctx.font = font(11, { family: SERIF, italic: true, weight: 500 });
        ctx.fillStyle = INK;
        ctx.fillText(g, col.x, col.y);
        col.y += 2 * MM;
        rule(ctx, col.x, col.y, col.width);
      }
    }
    const qty = scaleRecipeQty(ing.qty, factor, ing.unit);
    const qtyMax = ing.qtyMax == null ? null : scaleRecipeQty(ing.qtyMax, factor, ing.unit);
    const amount = formatAmount(qty, qtyMax, ing.unit);
    const runs = [{ text: ing.item, font: font(size), color: INK }];
    if (ing.note) runs.push({ text: `, ${ing.note}`, font: font(size), color: INK3 });
    const lines = layoutRuns(ctx, runs, col.width - amountW);
    const rowH = pad * 2 + lines.length * lh;
    ctx = col.ensure(rowH);
    let ly = col.y + pad + size * PT;
    ctx.font = font(size, { weight: 600 });
    ctx.fillStyle = INK;
    ctx.fillText(amount, col.x, ly);
    for (const line of lines) {
      drawLine(ctx, line, col.x + amountW, ly);
      ly += lh;
    }
    col.y += rowH;
    rule(ctx, col.x, col.y, col.width);
  }
}

function drawMethod(col, recipe, accent) {
  let ctx = col.ensure(20 * MM);
  col.y += 15 * PT;
  ctx.font = font(15, { family: SERIF, weight: 500 });
  ctx.fillStyle = INK;
  ctx.fillText('Method', col.x, col.y);
  col.y += 4 * MM;

  const numW = 8 * MM;
  const size = 10.5;
  const lh = size * PT * 1.5;
  (recipe.method || []).forEach((text, i) => {
    const lines = layoutRuns(ctx, [{ text, font: font(size), color: INK }], col.width - numW);
    const blockH = lines.length * lh + 3 * MM;
    ctx = col.ensure(Math.min(blockH, 3 * lh));
    let ly = col.y + size * PT;
    ctx.font = font(15, { family: SERIF, weight: 500 });
    ctx.fillStyle = accent;
    ctx.fillText(String(i + 1), col.x, ly + 1 * MM);
    for (const line of lines) {
      if (ly > H - M.bottom) {
        col.page += 1;
        col.y = M.top;
        ctx = col.pages.ctx(col.page);
        ly = col.y + size * PT;
      }
      drawLine(ctx, line, col.x + numW, ly);
      ly += lh;
    }
    col.y = ly - size * PT + 3 * MM;
  });

  if (recipe.source) {
    ctx = col.ensure(10 * MM);
    col.y += 4 * MM + 8.5 * PT;
    ctx.font = font(8.5);
    ctx.fillStyle = INK3;
    ctx.fillText(`From ${recipe.source.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')}`, col.x, col.y);
  }
}

function rule(ctx, x, y, w) {
  ctx.fillStyle = RULE;
  ctx.fillRect(x, Math.round(y), w, Math.max(1, Math.round(0.25 * MM)));
}

function star(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  } else {
    ctx.strokeStyle = INK3;
    ctx.lineWidth = 0.25 * MM;
    ctx.stroke();
  }
}

// ---- PDF ------------------------------------------------------------------

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))) : reject(new Error('Could not draw the page.'))), 'image/jpeg', 0.9)
  );
}

// Minimal PDF: one full-page JPEG per A4 page.
export async function canvasesToPdf(canvases) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n, body) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const part of body) push(part);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = canvases.length;
  const pageIds = canvases.map((_, i) => 3 + i * 3);
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`]);
  const pw = 595.28;
  const ph = 841.89;
  for (let i = 0; i < n; i++) {
    const jpg = await canvasToJpeg(canvases[i]);
    const pid = pageIds[i];
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(pid, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${pid + 2} 0 R >> >> /Contents ${pid + 1} 0 R >>`]);
    obj(pid + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(pid + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${canvases[i].width} /Height ${canvases[i].height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
      jpg,
      '\nendstream',
    ]);
  }
  const total = 3 + n * 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
