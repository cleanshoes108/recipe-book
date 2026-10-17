import { state, reload } from '../app.js';
import { putMany } from '../db.js';
import { h, iconBack, toast, confirmDialog } from '../ui.js';
import { getSettings, saveSettings, MODELS } from '../settings.js';
import { blobToDataUrl, dataUrlToBlob } from '../images.js';
import { newRecipe } from '../model.js';

export function settingsView() {
  const s = getSettings();

  const keyInput = h('input', {
    type: 'password',
    value: s.apiKey,
    placeholder: 'sk-ant-…',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: false,
    onChange: (e) => {
      saveSettings({ apiKey: e.target.value.trim() });
      toast(e.target.value.trim() ? 'Key saved' : 'Key removed');
    },
  });

  const modelSelect = h(
    'select',
    { onChange: (e) => saveSettings({ model: e.target.value }) },
    MODELS.map((m) => h('option', { value: m.id, selected: m.id === s.model }, `${m.label}`))
  );

  const withPhotos = state.recipes.filter((r) => r.photo).length;
  const importInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onChange: async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const list = Array.isArray(data) ? data : data.recipes;
        if (!Array.isArray(list)) throw new Error('That file is not a recipe backup.');
        const existing = new Set(state.recipes.map((r) => r.id));
        const incoming = [];
        for (const raw of list) {
          const r = newRecipe({ ...raw });
          if (typeof r.photo === 'string') r.photo = await dataUrlToBlob(r.photo);
          incoming.push(r);
        }
        const replacing = incoming.filter((r) => existing.has(r.id)).length;
        if (replacing && !(await confirmDialog(`${replacing} of these already exist here and will be replaced. Continue?`, { confirmLabel: 'Import', danger: false }))) return;
        await putMany(incoming);
        await reload();
        toast(`Imported ${incoming.length} recipe${incoming.length === 1 ? '' : 's'}`);
        location.hash = '#/';
      } catch (err) {
        toast(err.message || 'Could not import that file.');
      }
    },
  });

  async function exportAll() {
    const out = [];
    for (const r of state.recipes) {
      const copy = { ...r };
      if (r.photo) copy.photo = await blobToDataUrl(r.photo);
      out.push(copy);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File([JSON.stringify({ app: 'recipe-book', exportedAt: new Date().toISOString(), recipes: out })], `recipes-${stamp}.json`, {
      type: 'application/json',
    });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Recipe backup' });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const a = h('a', { href: URL.createObjectURL(file), download: file.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return h(
    'main',
    { class: 'page settings' },
    h('nav', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, iconBack(), 'Recipes')),
    h('h1', {}, 'Settings'),

    h(
      'section',
      { class: 'block' },
      h('h2', {}, 'Reading recipes'),
      h('p', {}, 'Pasted text, links and photographed pages are turned into recipes by Claude. The key stays on this device and is sent only when you tap Read recipe.'),
      h('div', { class: 'field' }, h('label', { for: 'api-key' }, 'Claude API key'), Object.assign(keyInput, { id: 'api-key' })),
      h('p', { class: 'hint' }, 'Create one at ', h('a', { href: 'https://platform.claude.com/', target: '_blank', rel: 'noopener' }, 'platform.claude.com'), '.'),
      h('div', { class: 'field' }, h('label', { for: 'model' }, 'Model'), Object.assign(modelSelect, { id: 'model' })),
      h('p', { class: 'hint' }, MODELS.map((m) => `${m.label}: ${m.note}`).join(' '))
    ),

    h(
      'section',
      { class: 'block' },
      h('h2', {}, 'Backup'),
      h('p', {}, `Recipes live only on this device. ${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'}, ${withPhotos} with photos.`),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onClick: exportAll, disabled: !state.recipes.length }, 'Export a backup'),
        h('button', { type: 'button', class: 'btn', onClick: () => importInput.click() }, 'Import a backup'),
        importInput
      ),
      h('p', { class: 'hint' }, 'Export saves a single file you can keep in iCloud Drive or send to another device, where Import brings it back in.')
    )
  );
}
