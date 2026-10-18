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
      h('a', { class: 'btn text', href: `#/edit/${recipe.id}` }, 'Edit')
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
      h('section', { class: 'col-ingredients' }, h('h2', {}, 'Ingredients'), dial, ingList),
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
