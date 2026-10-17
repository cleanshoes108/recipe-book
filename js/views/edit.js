import { reload, photoUrl } from '../app.js';
import { getRecipe, putRecipe } from '../db.js';
import { h, iconBack, iconCamera, toast, navigate } from '../ui.js';
import { COURSES, newRecipe, cleanTags } from '../model.js';
import { ingredientsToText, textToIngredients, stepsToText, textToSteps } from '../quantities.js';
import { shrinkImage } from '../images.js';

export const DRAFT_KEY = 'recipe-book:draft';

export async function editView({ id }) {
  let recipe;
  let isNew = false;
  let draftNote = null;

  if (id) {
    recipe = await getRecipe(id);
    if (!recipe) return h('main', { class: 'page' }, h('p', { class: 'error' }, 'That recipe is no longer here.'));
  } else {
    isNew = true;
    const draft = readDraft();
    recipe = newRecipe(draft || {});
    if (draft) draftNote = 'Read from what you gave it. Check the amounts and tags, then save.';
  }

  let photoBlob = recipe.photo || null;
  let photoChanged = false;

  const f = {
    title: input('text', recipe.title, { placeholder: 'Recipe name', required: true, autocapitalize: 'words' }),
    headnote: textarea(recipe.headnote, { rows: 3, placeholder: 'A line or two about the dish, in your words or the author’s.' }),
    serves: input('number', recipe.serves ?? 4, { min: 1, max: 60, inputmode: 'numeric' }),
    yieldNote: input('text', recipe.yieldNote, { placeholder: 'e.g. as a side, or makes 12' }),
    prep: input('number', recipe.prepMinutes ?? '', { min: 0, inputmode: 'numeric', placeholder: 'min' }),
    cook: input('number', recipe.cookMinutes ?? '', { min: 0, inputmode: 'numeric', placeholder: 'min' }),
    course: h('select', {}, COURSES.map((c) => h('option', { value: c, selected: c === recipe.course }, c))),
    cuisine: input('text', recipe.cuisine, { placeholder: 'e.g. Middle Eastern', autocapitalize: 'words' }),
    tags: input('text', (recipe.tags || []).join(', '), { placeholder: 'chicken, one-pot, weeknight', autocapitalize: 'none' }),
    ingredients: textarea(ingredientsToText(recipe.ingredients || []), {
      rows: 10,
      placeholder: '250g chickpeas, drained\n2 tbsp olive oil\n\nFor the dressing:\n1 lemon, juiced',
      class: 'mono-ish',
    }),
    method: textarea(stepsToText(recipe.method || []), { rows: 12, placeholder: 'One step per paragraph. Leave a blank line between steps.' }),
    notes: textarea(recipe.notes, { rows: 3, placeholder: 'What to change next time.' }),
    source: input('text', recipe.source, { placeholder: 'Book, site or link', autocapitalize: 'none' }),
  };

  // Photo
  const photoWrap = h('div', { class: 'photo-field' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    hidden: true,
    onChange: async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        photoBlob = await shrinkImage(file, 1400, 0.82);
        photoChanged = true;
        paintPhoto();
      } catch (err) {
        toast(err.message);
      }
      e.target.value = '';
    },
  });
  function paintPhoto() {
    const url = photoBlob ? (photoBlob === recipe.photo ? photoUrl(recipe) : URL.createObjectURL(photoBlob)) : null;
    photoWrap.replaceChildren(
      url ? h('div', { class: 'photo-preview-wrap' }, h('img', { class: 'photo-preview', src: url, alt: '' })) : null,
      h(
        'div',
        { class: 'photo-actions' },
        h('button', { type: 'button', class: 'btn text', onClick: () => fileInput.click() }, iconCamera(), url ? 'Change photo' : 'Add a photo of the dish'),
        url
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn text',
                onClick: () => {
                  photoBlob = null;
                  photoChanged = true;
                  paintPhoto();
                },
              },
              'Remove'
            )
          : null
      ),
      fileInput
    );
  }
  paintPhoto();

  async function save(e) {
    e.preventDefault();
    const title = f.title.value.trim();
    if (!title) {
      f.title.focus();
      toast('Give it a name first');
      return;
    }
    const now = new Date().toISOString();
    Object.assign(recipe, {
      title,
      headnote: f.headnote.value.trim(),
      serves: Math.max(1, parseInt(f.serves.value, 10) || 1),
      yieldNote: f.yieldNote.value.trim(),
      prepMinutes: f.prep.value === '' ? null : Math.max(0, parseInt(f.prep.value, 10) || 0),
      cookMinutes: f.cook.value === '' ? null : Math.max(0, parseInt(f.cook.value, 10) || 0),
      course: f.course.value,
      cuisine: f.cuisine.value.trim(),
      tags: cleanTags(f.tags.value.split(',')),
      ingredients: textToIngredients(f.ingredients.value),
      method: textToSteps(f.method.value),
      notes: f.notes.value.trim(),
      source: f.source.value.trim(),
      updatedAt: now,
    });
    if (photoChanged) recipe.photo = photoBlob;
    if (isNew) recipe.createdAt = now;
    await putRecipe(recipe);
    await reload();
    clearDraft();
    toast(isNew ? 'Saved' : 'Changes saved');
    navigate(`#/recipe/${recipe.id}`);
  }

  const cancelHref = isNew ? '#/' : `#/recipe/${recipe.id}`;

  return h(
    'main',
    { class: 'page edit' },
    h(
      'nav',
      { class: 'topbar' },
      h(
        'a',
        {
          class: 'back',
          href: cancelHref,
          onClick: () => {
            if (isNew) clearDraft();
          },
        },
        iconBack(),
        'Cancel'
      ),
      h('button', { type: 'submit', class: 'btn primary', form: 'recipe-form' }, 'Save')
    ),
    h('h1', {}, isNew ? 'New recipe' : 'Edit recipe'),
    draftNote ? h('p', { class: 'note' }, draftNote) : null,
    h(
      'form',
      { id: 'recipe-form', class: 'form', onSubmit: save, novalidate: true },
      field('Name', f.title),
      field('Introduction', f.headnote),
      photoWrap,
      h('div', { class: 'row' }, field('Serves', f.serves), field('Or makes', f.yieldNote)),
      h('div', { class: 'row' }, field('Prep time', f.prep), field('Cook time', f.cook)),
      h('div', { class: 'row' }, field('Course', f.course), field('Cuisine', f.cuisine)),
      field('Tags', f.tags, 'Separate with commas. These become the coloured codes.'),
      field('Ingredients', f.ingredients, 'One per line, amount first. A line ending in a colon starts a group.'),
      field('Method', f.method),
      field('Notes', f.notes),
      field('Source', f.source),
      h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn primary wide' }, isNew ? 'Save recipe' : 'Save changes'))
    )
  );
}

function input(type, value, attrs = {}) {
  return h('input', { type, value: value == null ? '' : value, ...attrs });
}
function textarea(value, attrs = {}) {
  const el = h('textarea', { ...attrs, onInput: autogrow });
  el.value = value || '';
  // Size to content once it is on the page.
  requestAnimationFrame(() => autogrow({ target: el }));
  return el;
}
function autogrow(e) {
  const el = e.target;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight + 2, 0) + 'px';
}
function field(label, control, hint) {
  const id = 'f-' + label.toLowerCase().replace(/\W+/g, '-');
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);
}

export function writeDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    /* ignore */
  }
}
function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    /* ignore */
  }
}
