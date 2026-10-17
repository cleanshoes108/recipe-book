import { listRecipes, persistStorage } from './db.js';
import { clear, h } from './ui.js';
import { libraryView } from './views/library.js';
import { recipeView } from './views/recipe.js';
import { addView } from './views/add.js';
import { editView } from './views/edit.js';
import { settingsView } from './views/settings.js';

export const state = {
  recipes: [],
  loaded: false,
  library: { query: '', tags: [], sort: 'newest', scrollY: 0 },
  photoUrls: new Map(),
};

export async function reload() {
  state.recipes = await listRecipes();
  state.loaded = true;
  return state.recipes;
}

export function photoUrl(recipe) {
  if (!recipe.photo) return null;
  const cached = state.photoUrls.get(recipe.id);
  if (cached && cached.blob === recipe.photo) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(recipe.photo);
  state.photoUrls.set(recipe.id, { blob: recipe.photo, url });
  return url;
}

const routes = [
  { re: /^#?\/?$/, view: libraryView, name: 'library' },
  { re: /^#\/recipe\/([^/]+)$/, view: recipeView, name: 'recipe' },
  { re: /^#\/edit\/([^/]+)$/, view: editView, name: 'edit' },
  { re: /^#\/new$/, view: editView, name: 'new' },
  { re: /^#\/add$/, view: addView, name: 'add' },
  { re: /^#\/settings$/, view: settingsView, name: 'settings' },
];

let currentRoute = null;

async function render() {
  const app = document.getElementById('app');
  const hash = location.hash || '#/';
  const route = routes.find((r) => r.re.test(hash)) || routes[0];
  const params = hash.match(route.re) || [];

  if (currentRoute === 'library') state.library.scrollY = window.scrollY;
  currentRoute = route.name;
  document.body.dataset.view = route.name;

  if (!state.loaded) await reload();
  let el;
  try {
    el = await route.view({ id: params[1] });
  } catch (err) {
    el = h('main', { class: 'page' }, h('p', { class: 'error' }, err.message || String(err)));
  }
  clear(app).appendChild(el);
  if (route.name === 'library') window.scrollTo(0, state.library.scrollY);
  else window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  render();
  persistStorage();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
