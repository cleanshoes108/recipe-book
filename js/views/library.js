import { state, photoUrl } from '../app.js';
import { h, iconPlus, iconSearch, iconStar, navigate } from '../ui.js';
import { filterRecipes, collectTags } from '../search.js';
import { tagColour, tagCode } from '../model.js';
import { minutesLabel } from '../quantities.js';

export function libraryView() {
  const lib = state.library;
  const grid = h('section', { class: 'grid', 'aria-live': 'polite' });
  const countEl = h('p', { class: 'count' });

  function refresh() {
    const rows = filterRecipes(state.recipes, lib);
    grid.replaceChildren(...(rows.length ? rows.map(tile) : [emptyState()]));
    countEl.textContent = state.recipes.length ? `${rows.length} of ${state.recipes.length}` : '';
  }

  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'Search by name or ingredient',
    value: lib.query,
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: false,
    'aria-label': 'Search recipes',
    onInput: (e) => {
      lib.query = e.target.value;
      refresh();
    },
  });

  const tags = collectTags(state.recipes).slice(0, 14);
  const filterRow = h(
    'div',
    { class: 'filters', role: 'group', 'aria-label': 'Filter by tag' },
    tags.map(({ tag }) => {
      const active = lib.tags.includes(tag);
      return h(
        'button',
        {
          type: 'button',
          class: 'chip' + (active ? ' active' : ''),
          'aria-pressed': active ? 'true' : 'false',
          onClick: () => {
            lib.tags = active ? lib.tags.filter((t) => t !== tag) : [...lib.tags, tag];
            navigate('#/');
          },
        },
        code(tag),
        h('span', { class: 'chip-label' }, tag)
      );
    })
  );

  const sorts = [
    ['newest', 'Newest'],
    ['a-z', 'A to Z'],
    ['rating', 'Top rated'],
  ];
  const sortRow = h(
    'div',
    { class: 'sorts', role: 'group', 'aria-label': 'Sort' },
    sorts.map(([key, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'sort' + (lib.sort === key ? ' active' : ''),
          'aria-pressed': lib.sort === key ? 'true' : 'false',
          dataset: { sort: key },
          onClick: () => {
            lib.sort = key;
            sortRow.querySelectorAll('.sort').forEach((b) => {
              const on = b.dataset.sort === key;
              b.classList.toggle('active', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            refresh();
          },
        },
        label
      )
    ),
    countEl
  );

  refresh();

  return h(
    'main',
    { class: 'page library' },
    h(
      'header',
      { class: 'masthead' },
      h('h1', {}, 'Recipes'),
      h('a', { class: 'btn round', href: '#/add', 'aria-label': 'Add a recipe' }, iconPlus())
    ),
    h('div', { class: 'search-wrap' }, iconSearch(), search),
    tags.length ? filterRow : null,
    state.recipes.length ? sortRow : null,
    grid,
    h('footer', { class: 'page-foot' }, h('a', { href: '#/settings' }, 'Settings'))
  );
}

function tile(recipe) {
  const url = photoUrl(recipe);
  const meta = [recipe.serves ? `Serves ${recipe.serves}` : null, totalTime(recipe)].filter(Boolean).join(', ');
  return h(
    'a',
    { class: 'tile', href: `#/recipe/${recipe.id}` },
    url
      ? h('div', { class: 'tile-photo' }, h('img', { src: url, alt: '', loading: 'lazy' }))
      : h('div', { class: 'tile-photo placeholder', style: { background: tagColour(recipe.title) } }, h('span', {}, initial(recipe.title))),
    h('h2', { class: 'tile-title' }, recipe.title || 'Untitled'),
    h('p', { class: 'tile-meta' }, meta, recipe.rating ? h('span', { class: 'tile-rating' }, iconStar(true), String(recipe.rating)) : null)
  );
}

function emptyState() {
  if (!state.recipes.length) {
    return h(
      'div',
      { class: 'empty' },
      h('p', { class: 'empty-lead' }, 'Nothing here yet.'),
      h('p', {}, 'Add your first recipe from a photo of a cookbook page, a link, or pasted text.'),
      h('a', { class: 'btn primary', href: '#/add' }, 'Add a recipe')
    );
  }
  return h('div', { class: 'empty' }, h('p', {}, 'No recipes match. Try fewer words, or clear the filters.'));
}

function totalTime(r) {
  const t = (Number(r.prepMinutes) || 0) + (Number(r.cookMinutes) || 0);
  return t ? minutesLabel(t) : null;
}

function initial(title) {
  return (title || '?').trim().charAt(0).toUpperCase();
}

export function code(tag) {
  return h('span', { class: 'code', style: { background: tagColour(tag) }, 'aria-hidden': 'true' }, tagCode(tag));
}
