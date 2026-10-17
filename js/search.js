// Search and filtering over the in-memory recipe list.

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function matchesQuery(recipe, query) {
  const q = norm(query).trim();
  if (!q) return true;
  const terms = q.split(/\s+/);
  const hay = [
    recipe.title,
    recipe.headnote,
    recipe.cuisine,
    recipe.course,
    ...(recipe.tags || []),
    ...(recipe.ingredients || []).map((i) => `${i.item} ${i.note || ''}`),
  ]
    .map(norm)
    .join(' | ');
  return terms.every((t) => hay.includes(t));
}

export function filterRecipes(recipes, { query = '', tags = [], sort = 'newest' } = {}) {
  let out = recipes.filter((r) => matchesQuery(r, query));
  if (tags.length) out = out.filter((r) => tags.every((t) => (r.tags || []).includes(t) || r.course === t || norm(r.cuisine) === t));
  const cmp = {
    newest: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
    'a-z': (a, b) => norm(a.title).localeCompare(norm(b.title)),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.createdAt || '').localeCompare(a.createdAt || ''),
  }[sort];
  return out.sort(cmp);
}

// Tags that exist across the library, most used first, plus courses as tags.
export function collectTags(recipes) {
  const counts = new Map();
  for (const r of recipes) {
    const set = new Set([...(r.tags || []), r.course].filter(Boolean));
    for (const t of set) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
}
