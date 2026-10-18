// Vercel serverless function: turns pasted text, a web page, or photos of a cookbook page
// into a structured recipe using Claude. The caller's API key is passed per request and
// never stored here.

export const config = { maxDuration: 60 };

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_PAGE_CHARS = 60000;
const MAX_TEXT_CHARS = 60000;
const MAX_IMAGES = 4;

const COURSES = ['main', 'side', 'salad', 'soup', 'breakfast', 'snack', 'dessert', 'bake', 'drink', 'basic'];

const SYSTEM = `You turn recipes into structured data for a personal recipe book. The input may be pasted text, the text of a web page (sometimes as schema.org JSON), or photographs of cookbook pages. Always call save_recipe exactly once.

Rules
- Metric only. Convert every imperial or cup measure: cups and fluid ounces to ml (1 cup = 250 ml), ounces and pounds to g (1 oz = 28 g, 1 lb = 450 g), °F to °C. Convert cups of dry ingredients to grams using sensible densities (flour 130 g, sugar 200 g, rice 200 g, butter 225 g, oats 90 g, nuts 120 g per cup). Keep tsp and tbsp as they are. Use g for solids and ml for liquids. Write temperatures in the method as °C.
- qty is a number; use qtyMax only for ranges ("2–3 lemons" is qty 2, qtyMax 3). Leave qty null when there is no amount ("salt", "a handful of parsley" becomes item "parsley", note "a handful").
- unit is one of: g, kg, ml, l, tsp, tbsp, pinch, cm, or null. Count nouns go into the item ("3 garlic cloves" is qty 3, unit null, item "garlic cloves"). Tins and packets: use the weight ("400g tinned chopped tomatoes" is qty 400, unit g).
- item is the ingredient itself, lower case, no amounts. note holds preparation ("finely chopped", "juice and zest", "drained"). group is the sub-list heading when the recipe has one (write it plainly, e.g. "Dressing", "To serve"), else null.
- method is an array of steps, one per element, each a self-contained paragraph in the author's voice, trimmed of chatter and advertising. Keep every temperature, time and cue. Do not number them.
- headnote: the author's introduction if there is one, condensed to at most three sentences; otherwise a plain one-sentence description of the dish. No marketing language.
- serves: an integer. yieldNote is empty unless there is a range or a "makes" quantity. For "serves 4–6" use 4 and put "serves 4 to 6" in yieldNote. For "makes 12 muffins" use serves 12 and yieldNote "makes 12".
- course: one of ${COURSES.join(', ')}. cuisine: a short label or empty string.
- tags: 3 to 6 short lower-case tags useful for finding the recipe later: the main ingredient, style ("one-pot", "traybake", "salad"), occasion ("weeknight", "make-ahead", "quick"), diet ("vegetarian", "vegan"), and the cuisine if clear. Do not repeat the course as a tag.
- source: the book title or site name if known, otherwise empty string.
- Never invent ingredients or steps. If the input is not a recipe or cannot be read, set ok to false with a short reason and leave the other fields empty.`;

const TOOL = {
  name: 'save_recipe',
  description: 'Save the structured recipe.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      reason: { type: ['string', 'null'] },
      title: { type: 'string' },
      headnote: { type: 'string' },
      serves: { type: 'integer' },
      yieldNote: { type: 'string' },
      prepMinutes: { type: ['integer', 'null'] },
      cookMinutes: { type: ['integer', 'null'] },
      course: { type: 'string', enum: COURSES },
      cuisine: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            qty: { type: ['number', 'null'] },
            qtyMax: { type: ['number', 'null'] },
            unit: { type: ['string', 'null'] },
            item: { type: 'string' },
            note: { type: ['string', 'null'] },
            group: { type: ['string', 'null'] },
          },
          required: ['qty', 'qtyMax', 'unit', 'item', 'note', 'group'],
        },
      },
      method: { type: 'array', items: { type: 'string' } },
      source: { type: 'string' },
    },
    required: ['ok', 'reason', 'title', 'headnote', 'serves', 'yieldNote', 'prepMinutes', 'cookMinutes', 'course', 'cuisine', 'tags', 'ingredients', 'method', 'source'],
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use POST.' });

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, 400, { ok: false, error: 'The request could not be read.' });
  }

  const apiKey = String(body.apiKey || '').trim();
  const model = /^claude-[a-z0-9.-]+$/i.test(body.model || '') ? body.model : DEFAULT_MODEL;
  const text = String(body.text || '').slice(0, MAX_TEXT_CHARS).trim();
  const url = String(body.url || '').trim();
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];

  if (!apiKey) return send(res, 400, { ok: false, error: 'Add your Claude API key in Settings first.' });
  if (!text && !url && !images.length) return send(res, 400, { ok: false, error: 'Nothing to read yet.' });

  const content = [];
  let fetchedFrom = '';
  if (url) {
    if (!/^https?:\/\//i.test(url)) return send(res, 400, { ok: false, error: 'That link needs to start with http:// or https://.' });
    try {
      const page = await fetchPage(url);
      fetchedFrom = page.site;
      content.push({ type: 'text', text: `Web page from ${page.site}${page.title ? ` titled "${page.title}"` : ''}:\n\n${page.text}` });
    } catch (e) {
      return send(res, 502, { ok: false, error: e.message || 'That page could not be fetched.' });
    }
  }
  if (text) content.push({ type: 'text', text });
  for (const img of images) {
    if (!img || typeof img.data !== 'string') continue;
    content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type || 'image/jpeg', data: img.data } });
  }
  content.push({ type: 'text', text: 'Turn this into a recipe by calling save_recipe.' });

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 6000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        messages: [{ role: 'user', content }],
      }),
    });
  } catch (e) {
    return send(res, 502, { ok: false, error: 'Could not reach Claude. Check your connection and try again.' });
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const msg = data?.error?.message || '';
    if (upstream.status === 401) return send(res, 401, { ok: false, error: 'That API key was not accepted. Check it in Settings.' });
    if (upstream.status === 429) return send(res, 429, { ok: false, error: 'Claude is busy. Wait a moment and try again.' });
    if (/credit|billing/i.test(msg)) return send(res, 402, { ok: false, error: 'Your Claude account has no credit left.' });
    return send(res, 502, { ok: false, error: msg ? `Claude said: ${msg}` : `Claude returned an error (${upstream.status}).` });
  }

  const blocks = Array.isArray(data.content) ? data.content : [];
  let input = blocks.find((b) => b.type === 'tool_use' && b.name === TOOL.name)?.input;
  if (!input) {
    const textBlock = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const m = textBlock.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        input = JSON.parse(m[0]);
      } catch (e) {
        /* fall through */
      }
    }
  }
  if (!input) return send(res, 502, { ok: false, error: 'Claude did not return a recipe. Try again, or type it in.' });
  if (input.ok === false) return send(res, 422, { ok: false, error: input.reason || 'That does not look like a recipe.' });

  const recipe = tidy(input, fetchedFrom);
  return send(res, 200, { ok: true, recipe, usage: data.usage || null });
}

function tidy(r, fetchedFrom) {
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    title: str(r.title),
    headnote: str(r.headnote),
    serves: Math.max(1, Math.round(num(r.serves) || 4)),
    // Drop notes that only restate the serves number ("serves 2").
    yieldNote: /^(serves|feeds|for)\s*\d+$/i.test(str(r.yieldNote)) ? '' : str(r.yieldNote),
    prepMinutes: num(r.prepMinutes),
    cookMinutes: num(r.cookMinutes),
    course: COURSES.includes(r.course) ? r.course : 'main',
    cuisine: str(r.cuisine),
    tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => str(t).toLowerCase()).filter(Boolean).slice(0, 8),
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients : [])
      .map((i) => ({
        qty: num(i.qty),
        qtyMax: num(i.qtyMax),
        unit: str(i.unit) || null,
        item: str(i.item),
        note: str(i.note) || null,
        group: str(i.group) || null,
      }))
      .filter((i) => i.item),
    method: (Array.isArray(r.method) ? r.method : []).map(str).filter(Boolean),
    source: str(r.source) || fetchedFrom,
  };
}

// ---------- fetching a web page ----------

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-AU,en;q=0.9',
      },
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'That page took too long to load.' : 'That page could not be fetched.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`That page could not be fetched (${res.status}).`);
  const html = (await res.text()).slice(0, 3_000_000);
  let site = '';
  try {
    site = new URL(res.url || url).hostname.replace(/^www\./, '');
  } catch (e) {
    /* ignore */
  }
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();

  const ld = extractRecipeJsonLd(html);
  if (ld) return { site, title, text: `schema.org Recipe JSON:\n${JSON.stringify(ld).slice(0, MAX_PAGE_CHARS)}` };
  return { site, title, text: htmlToText(html).slice(0, MAX_PAGE_CHARS) };
}

export function extractRecipeJsonLd(html) {
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let json;
    try {
      json = JSON.parse(m[1].trim());
    } catch (e) {
      continue;
    }
    const found = findRecipe(json);
    if (found) return slimRecipe(found);
  }
  return null;
}

function findRecipe(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findRecipe(n, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const type = node['@type'];
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.some((t) => /recipe/i.test(String(t)))) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'hasPart']) {
    if (node[key]) {
      const f = findRecipe(node[key], depth + 1);
      if (f) return f;
    }
  }
  return null;
}

function slimRecipe(r) {
  const keep = ['name', 'description', 'author', 'recipeYield', 'prepTime', 'cookTime', 'totalTime', 'recipeCategory', 'recipeCuisine', 'keywords', 'recipeIngredient', 'recipeInstructions'];
  const out = {};
  for (const k of keep) if (r[k] != null) out[k] = r[k];
  if (out.author && typeof out.author === 'object') out.author = Array.isArray(out.author) ? out.author.map((a) => a?.name).filter(Boolean) : out.author.name;
  if (Array.isArray(out.recipeInstructions)) {
    out.recipeInstructions = out.recipeInstructions.flatMap((s) => {
      if (typeof s === 'string') return [s];
      if (s && Array.isArray(s.itemListElement)) return s.itemListElement.map((x) => (typeof x === 'string' ? x : x?.text)).filter(Boolean);
      return [s?.text].filter(Boolean);
    });
  }
  return out;
}

export function htmlToText(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|dd|dt)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');
  s = decode(s);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function decode(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => (named[n.toLowerCase()] != null ? named[n.toLowerCase()] : m));
}

// ---------- request / response helpers ----------

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}
