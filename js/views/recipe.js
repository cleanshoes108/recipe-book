import { state, photoUrl, reload } from '../app.js';
import { getRecipe, putRecipe, deleteRecipe } from '../db.js';
import { h, iconBack, iconMinus, iconPlus, iconStar, confirmDialog, toast, navigate } from '../ui.js';
import { formatAmount, scaleRecipeQty, minutesLabel } from '../quantities.js';
import { tagColour } from '../model.js';
import { code } from './library.js';

export async function recipeView({ id }) {
  const recipe = await getRecipe(id);
  if (!recipe) {
    return h('main', { class: 'page' }, h('p', { class: 'error' }, 'That recipe is no longer here.'), h('a', { href: '#/' }, 'Back to recipes'));
  }

  const accent = tagColour(recipe.tags?.[0] || recipe.course || recipe.title);
  const base = Number(recipe.serves) || 1;
  let serves = base;

  // --- Serves dial + ingredient list that re-renders when it changes
  const ingList = h('div', { class: 'ingredients' });
  const servesNum = h('span', { class: 'serves-num' }, String(serves));
  const resetLink = h('button', { type: 'button', class: 'linklike', onClick: () => setServes(base) }, `Back to ${base}`);

  function setServes(n) {
    serves = Math.max(1, Math.min(60, n));
    servesNum.textContent = String(serves);
    resetLink.hidden = serves === base;
    renderIngredients();
  }

  function renderIngredients() {
    const factor = serves / base;
    const items = [];
    let group = null;
    for (const ing of recipe.ingredients || []) {
      const g = ing.group || null;
      if (g !== group) {
        group = g;
        if (g) items.push(h('h3', { class: 'ing-group' }, g));
      }
      const qty = scaleRecipeQty(ing.qty, factor, ing.unit);
      const qtyMax = ing.qtyMax == null ? null : scaleRecipeQty(ing.qtyMax, factor, ing.unit);
      const amount = formatAmount(qty, qtyMax, ing.unit);
      items.push(
        h(
          'label',
          { class: 'ing' },
          h('input', { type: 'checkbox', class: 'ing-check', 'aria-label': `${amount} ${ing.item}` }),
          h('span', { class: 'ing-amount' }, amount),
          h('span', { class: 'ing-item' }, ing.item, ing.note ? h('span', { class: 'ing-note' }, `, ${ing.note}`) : null)
        )
      );
    }
    ingList.replaceChildren(...items);
  }
  renderIngredients();
  resetLink.hidden = true;

  const dial = h(
    'div',
    { class: 'serves' },
    h('button', { type: 'button', class: 'dial', 'aria-label': 'Fewer serves', onClick: () => setServes(serves - 1) }, iconMinus()),
    h('div', { class: 'serves-readout' }, servesNum, h('span', { class: 'serves-label' }, recipe.yieldNote && !/^(serves|feeds|for)\s*\d+$/i.test(recipe.yieldNote.trim()) ? recipe.yieldNote : 'serves')),
    h('button', { type: 'button', class: 'dial', 'aria-label': 'More serves', onClick: () => setServes(serves + 1) }, iconPlus()),
    resetLink
  );

  // --- Rating
  const stars = h(
    'div',
    { class: 'stars', role: 'radiogroup', 'aria-label': 'Rating' },
    [1, 2, 3, 4, 5].map((n) =>
      h(
        'button',
        {
          type: 'button',
          class: 'star',
          role: 'radio',
          'aria-checked': recipe.rating === n ? 'true' : 'false',
          'aria-label': `${n} star${n > 1 ? 's' : ''}`,
          onClick: async () => {
            recipe.rating = recipe.rating === n ? 0 : n;
            recipe.updatedAt = new Date().toISOString();
            await putRecipe(recipe);
            await reload();
            paintStars();
          },
        },
        iconStar(false)
      )
    )
  );
  function paintStars() {
    stars.querySelectorAll('.star').forEach((b, i) => {
      const on = i < (recipe.rating || 0);
      b.querySelector('svg').classList.toggle('filled', on);
      b.setAttribute('aria-checked', recipe.rating === i + 1 ? 'true' : 'false');
    });
  }
  paintStars();

  // --- Method
  const steps = h(
    'ol',
    { class: 'method' },
    (recipe.method || []).map((text, i) =>
      h(
        'li',
        {
          class: 'step',
          onClick: (e) => e.currentTarget.classList.toggle('done'),
        },
        h('span', { class: 'step-num', 'aria-hidden': 'true' }, String(i + 1)),
        h('p', {}, text)
      )
    )
  );

  const times = [
    recipe.prepMinutes ? `Prep ${minutesLabel(recipe.prepMinutes)}` : null,
    recipe.cookMinutes ? `Cook ${minutesLabel(recipe.cookMinutes)}` : null,
  ].filter(Boolean);

  const url = photoUrl(recipe);

  return h(
    'main',
    { class: 'page recipe', style: { '--accent': accent } },
    h(
      'nav',
      { class: 'topbar' },
      h('a', { class: 'back', href: '#/' }, iconBack(), 'Recipes'),
      h(
        'div',
        { class: 'topbar-actions' },
        h('button', { type: 'button', class: 'btn text', onClick: () => shareRecipe(recipe, serves, base) }, 'Share'),
        h('a', { class: 'btn text', href: `#/edit/${recipe.id}` }, 'Edit')
      )
    ),
    url ? h('figure', { class: 'hero' }, h('img', { src: url, alt: recipe.title })) : null,
    h(
      'header',
      { class: 'recipe-head' },
      h('h1', {}, recipe.title),
      recipe.headnote ? h('p', { class: 'headnote' }, recipe.headnote) : null,
      h(
        'div',
        { class: 'facts' },
        times.length ? h('p', { class: 'times' }, times.join('   ')) : null,
        stars
      ),
      recipe.tags?.length
        ? h(
            'div',
            { class: 'tags' },
            recipe.tags.map((t) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'tag',
                  onClick: () => {
                    state.library.tags = [t];
                    state.library.query = '';
                    navigate('#/');
                  },
                },
                code(t),
                t
              )
            )
          )
        : null
    ),
    h(
      'div',
      { class: 'columns' },
      h(
        'section',
        { class: 'col-ingredients' },
        h('h2', {}, 'Ingredients'),
        dial,
        ingList,
        recipe.ingredients?.length
          ? h('button', { type: 'button', class: 'btn shop', onClick: () => copyShoppingList(recipe, serves, base) }, 'Copy shopping list')
          : null
      ),
      h(
        'section',
        { class: 'col-method' },
        h('h2', {}, 'Method'),
        steps,
        h(
          'section',
          { class: 'notes' },
          h('h2', {}, 'Notes'),
          recipe.notes ? h('p', { class: 'notes-text' }, recipe.notes) : h('a', { href: `#/edit/${recipe.id}`, class: 'quiet' }, 'Add a note for next time')
        ),
        recipe.source ? h('p', { class: 'source' }, sourceNode(recipe.source)) : null
      )
    ),
    h(
      'footer',
      { class: 'recipe-foot' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn text danger',
          onClick: async () => {
            if (await confirmDialog(`Delete “${recipe.title}”? This can’t be undone.`)) {
              await deleteRecipe(recipe.id);
              await reload();
              toast('Deleted');
              navigate('#/');
            }
          },
        },
        'Delete recipe'
      )
    )
  );
}

// Shopping list: one line per ingredient, no bullets, so Notes can turn every line into a checklist item.
const SHOPPING_HINT = /optional|not |to taste|to serve|about|approx|or |plus|tins?\b|large|small|ripe|fresh/i;
export function shoppingList(recipe, serves, base) {
  const factor = serves / base;
  const merged = new Map();
  for (const ing of recipe.ingredients || []) {
    const item = String(ing.item || '').trim();
    if (!item || /^(cold |warm |boiling |hot )?water$/i.test(item)) continue;
    const key = item.toLowerCase() + '|' + (ing.unit || '');
    const prev = merged.get(key);
    const note = ing.note && SHOPPING_HINT.test(ing.note) ? ing.note : null;
    if (prev) {
      if (prev.qty != null && ing.qty != null) prev.qty += ing.qty;
      else if (prev.qty == null) prev.qty = ing.qty;
      if (prev.qtyMax != null || ing.qtyMax != null) prev.qtyMax = (prev.qtyMax ?? prev.qty ?? 0) + (ing.qtyMax ?? ing.qty ?? 0);
      if (!prev.note && note) prev.note = note;
    } else {
      merged.set(key, { item, unit: ing.unit || null, qty: ing.qty, qtyMax: ing.qtyMax, note });
    }
  }
  const lines = [];
  for (const m of merged.values()) {
    const qty = scaleRecipeQty(m.qty, factor, m.unit);
    const qtyMax = m.qtyMax == null ? null : scaleRecipeQty(m.qtyMax, factor, m.unit);
    // "400 g" with a space, as Notes and most shopping lists write it.
    const amount = formatAmount(qty, qtyMax, m.unit).replace(/(\d)(g|kg|ml|l)$/, '$1 $2');
    const name = amount ? `${amount} ${m.item}` : m.item.charAt(0).toUpperCase() + m.item.slice(1);
    lines.push(m.note ? `${name}, ${m.note}` : name);
  }
  return `${recipe.title}\n\n${lines.join('\n')}`;
}

async function copyShoppingList(recipe, serves, base) {
  const text = shoppingList(recipe, serves, base);
  try {
    await navigator.clipboard.writeText(text);
    toast('Shopping list copied');
  } catch (e) {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${recipe.title}: shopping list`, text });
      } catch (err) {
        /* cancelled */
      }
    } else toast('Copying is not available here');
  }
}

// Plain-text version of the recipe, at the serves currently on the dial.
export function recipeToText(recipe, serves, base) {
  const factor = serves / base;
  const lines = [recipe.title];
  if (recipe.headnote) lines.push('', recipe.headnote);
  const meta = [
    recipe.yieldNote && !/^(serves|feeds|for)\s*\d+$/i.test(recipe.yieldNote.trim()) && serves === base ? recipe.yieldNote : `Serves ${serves}`,
    recipe.prepMinutes ? `Prep ${minutesLabel(recipe.prepMinutes)}` : null,
    recipe.cookMinutes ? `Cook ${minutesLabel(recipe.cookMinutes)}` : null,
  ].filter(Boolean);
  lines.push('', meta.join(' · '));

  lines.push('', 'INGREDIENTS');
  let group = null;
  for (const ing of recipe.ingredients || []) {
    const g = ing.group || null;
    if (g !== group) {
      group = g;
      if (g) lines.push('', g);
    }
    const qty = scaleRecipeQty(ing.qty, factor, ing.unit);
    const qtyMax = ing.qtyMax == null ? null : scaleRecipeQty(ing.qtyMax, factor, ing.unit);
    const amount = formatAmount(qty, qtyMax, ing.unit);
    lines.push(`• ${amount ? amount + ' ' : ''}${ing.item}${ing.note ? ', ' + ing.note : ''}`);
  }

  if (recipe.method?.length) {
    lines.push('', 'METHOD');
    recipe.method.forEach((s, i) => lines.push(`${i + 1}. ${s}`, ''));
    lines.pop();
  }
  if (recipe.source) lines.push('', `From ${recipe.source}`);
  return lines.join('\n');
}

async function shareRecipe(recipe, serves, base) {
  const text = recipeToText(recipe, serves, base);
  if (navigator.share) {
    try {
      await navigator.share({ title: recipe.title, text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Recipe copied');
  } catch (e) {
    toast('Sharing is not available here');
  }
}

function sourceNode(source) {
  const s = String(source).trim();
  if (/^https?:\/\//i.test(s)) {
    let label = s;
    try {
      label = new URL(s).hostname.replace(/^www\./, '');
    } catch (e) {
      /* keep full */
    }
    return ['From ', h('a', { href: s, target: '_blank', rel: 'noopener' }, label)];
  }
  return `From ${s}`;
}
