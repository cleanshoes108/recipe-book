// Recipe shape, defaults, and the colour codes used for tags.

export const COURSES = ['main', 'side', 'salad', 'soup', 'breakfast', 'snack', 'dessert', 'bake', 'drink', 'basic'];

// Saturated cookbook colours. One per tag, assigned by name so a tag keeps its colour everywhere.
export const PALETTE = [
  '#E2007A', // pomegranate
  '#F28C00', // saffron
  '#1F8A4C', // herb green
  '#0066CC', // ultramarine
  '#7A2BB3', // aubergine
  '#D62817', // chilli
  '#0097A7', // teal
  '#C99700', // mustard
];

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export function tagColour(tag) {
  return PALETTE[hashString(String(tag).toLowerCase()) % PALETTE.length];
}

// "one-pot" -> "OP", "chicken" -> "C", "make ahead" -> "MA"
export function tagCode(tag) {
  const words = String(tag).split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(tag).slice(0, 1).toUpperCase();
}

export function newRecipe(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    title: '',
    headnote: '',
    serves: 4,
    yieldNote: '',
    prepMinutes: null,
    cookMinutes: null,
    course: 'main',
    cuisine: '',
    tags: [],
    ingredients: [],
    method: [],
    notes: '',
    rating: 0,
    source: '',
    photo: null, // Blob
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function cleanTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags || []) {
    const v = String(t).trim().toLowerCase().replace(/\s+/g, ' ');
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
