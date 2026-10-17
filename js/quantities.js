// Quantities: scaling, rounding, display and the plain-text ingredient line format.
// Metric only. "250g chickpeas, drained" / "2 tbsp olive oil" / "3 eggs" / "1–2 lemons"

const WEIGHT_VOLUME = new Set(['g', 'kg', 'ml', 'l']);
const SPOONS = new Set(['tsp', 'tbsp']);

const UNIT_ALIASES = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  pinch: 'pinch', pinches: 'pinch',
  cm: 'cm', mm: 'mm',
  bunch: 'bunch', bunches: 'bunch',
  handful: 'handful', handfuls: 'handful',
  sprig: 'sprig', sprigs: 'sprig',
  stalk: 'stalk', stalks: 'stalk',
  slice: 'slice', slices: 'slice',
  can: 'tin', cans: 'tin', tin: 'tin', tins: 'tin',
  clove: 'clove', cloves: 'clove',
  knob: 'knob', dash: 'dash', splash: 'splash', drizzle: 'drizzle',
};

const UNICODE_FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

export function normaliseUnit(u) {
  if (!u) return null;
  const key = String(u).trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[key] || key;
}

export function scaleRecipeQty(qty, factor, unit) {
  if (qty == null || !isFinite(qty)) return qty;
  return roundForUnit(qty * factor, unit);
}

// Rounds a scaled value to something a cook would actually measure.
export function roundForUnit(value, unit) {
  const u = normaliseUnit(unit);
  if (u === 'g' || u === 'ml') {
    if (value >= 1000) return Math.round(value / 10) * 10;
    if (value >= 100) return Math.round(value / 5) * 5;
    if (value >= 20) return Math.round(value);
    return Math.round(value * 2) / 2;
  }
  if (u === 'kg' || u === 'l') return Math.round(value * 20) / 20;
  if (SPOONS.has(u)) return Math.round(value * 4) / 4;
  if (u === 'cm' || u === 'mm') return Math.round(value * 2) / 2;
  // counts (eggs, lemons, cloves): halves while small, whole numbers from 3 up
  if (value >= 2.75) return Math.round(value);
  return Math.round(value * 2) / 2;
}

// 0.5 -> "½", 1.5 -> "1½", 0.33 -> "⅓", 250 -> "250", 1.2 -> "1.2"
export function formatQty(n) {
  if (n == null || !isFinite(n)) return '';
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  const glyph = fractionGlyph(frac);
  if (glyph !== null) return (whole ? String(whole) : '') + glyph;
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return (Math.round(n * 100) / 100).toString();
}

function fractionGlyph(frac) {
  if (frac < 0.01) return whole0();
  const table = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞']];
  for (const [v, g] of table) if (Math.abs(frac - v) < 0.02) return g;
  return null;
  function whole0() { return ''; }
}

// "250g", "2 tbsp", "3", "1–2", "½ tsp"
export function formatAmount(qty, qtyMax, unit) {
  const u = normaliseUnit(unit);
  if (qty == null && !u) return '';
  let num = formatQty(qty);
  if (qtyMax != null && qtyMax !== qty) num += '–' + formatQty(qtyMax);
  if (!u) return num;
  if (!num) return u;
  return WEIGHT_VOLUME.has(u) ? `${num}${u}` : `${num} ${u}`;
}

// One ingredient -> plain text line (used by the edit form)
export function ingredientToLine(ing) {
  const amount = formatAmount(ing.qty, ing.qtyMax, ing.unit);
  let line = amount ? `${amount} ${ing.item}` : ing.item;
  if (ing.note) line += `, ${ing.note}`;
  return line.trim();
}

export function ingredientsToText(ingredients) {
  const out = [];
  let group = null;
  for (const ing of ingredients) {
    const g = ing.group || null;
    if (g !== group) {
      if (out.length) out.push('');
      if (g) out.push(`${g}:`);
      group = g;
    }
    out.push(ingredientToLine(ing));
  }
  return out.join('\n');
}

// Order matters: mixed numbers ("1 ½", "1 1/2") must win over a bare "1".
const NUM = String.raw`(?:\d+\s?[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])`;
const LINE_RE = new RegExp(
  `^(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*([a-zA-Z]+\\.?)?\\s+(.+)$`
);

function parseNumber(s) {
  if (!s) return null;
  s = s.trim().replace(',', '.');
  if (UNICODE_FRACTIONS[s] != null) return UNICODE_FRACTIONS[s];
  const mixed = s.match(/^(\d+)\s?([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (mixed) return parseInt(mixed[1], 10) + UNICODE_FRACTIONS[mixed[2]];
  const mixedSlash = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedSlash) return parseInt(mixedSlash[1], 10) + parseInt(mixedSlash[2], 10) / parseInt(mixedSlash[3], 10);
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// Plain text line -> ingredient. Unknown shapes become {qty:null, item: line}.
export function parseIngredientLine(line, group = null) {
  const text = line.trim();
  const m = text.match(LINE_RE);
  let qty = null, qtyMax = null, unit = null, rest = text;
  if (m) {
    qty = parseNumber(m[1]);
    qtyMax = m[2] ? parseNumber(m[2]) : null;
    const maybeUnit = m[3] ? m[3].toLowerCase().replace(/\.$/, '') : null;
    if (maybeUnit && UNIT_ALIASES[maybeUnit]) {
      unit = UNIT_ALIASES[maybeUnit];
      rest = m[4];
    } else {
      rest = (m[3] ? m[3] + ' ' : '') + m[4];
    }
  } else {
    // "250g chickpeas" with no space between number and unit is handled by LINE_RE,
    // but "a pinch of salt" and similar fall through here.
  }
  let item = rest.trim();
  let note = null;
  const comma = item.indexOf(',');
  if (comma > 0) {
    note = item.slice(comma + 1).trim() || null;
    item = item.slice(0, comma).trim();
  }
  return { qty, qtyMax, unit, item, note, group };
}

export function textToIngredients(text) {
  const out = [];
  let group = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-•*]\s+/, '');
    if (!line) continue;
    if (/^[^:]{2,40}:$/.test(line) && !/\d/.test(line)) {
      group = line.slice(0, -1).replace(/^for the\s+/i, (s) => s).trim();
      continue;
    }
    out.push(parseIngredientLine(line, group));
  }
  return out;
}

export function textToSteps(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s*(?:step\s*)?\d+[.)]\s*/i, '').replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

export function stepsToText(steps) {
  return (steps || []).join('\n\n');
}

export function minutesLabel(min) {
  if (min == null || min === '' || isNaN(min)) return '';
  const m = Number(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
