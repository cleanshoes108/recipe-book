import { h, iconBack, iconCamera, iconClose, toast, navigate } from '../ui.js';
import { getSettings, hasApiKey } from '../settings.js';
import { shrinkImage, blobToBase64 } from '../images.js';
import { writeDraft } from './edit.js';

export function addView() {
  const pages = []; // { blob, url }
  let busy = false;

  const text = h('textarea', {
    class: 'paste',
    rows: 7,
    placeholder: 'Paste the recipe here, or a link to it.',
    autocapitalize: 'sentences',
    onInput: updateButton,
  });

  const thumbs = h('div', { class: 'thumbs' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    hidden: true,
    onChange: async (e) => {
      const files = [...(e.target.files || [])];
      e.target.value = '';
      for (const file of files) {
        if (pages.length >= 4) {
          toast('Up to four pages at a time');
          break;
        }
        try {
          const blob = await shrinkImage(file, 1800, 0.8);
          pages.push({ blob, url: URL.createObjectURL(blob) });
        } catch (err) {
          toast(err.message);
        }
      }
      paintThumbs();
      updateButton();
    },
  });

  function paintThumbs() {
    thumbs.replaceChildren(
      ...pages.map((p, i) =>
        h(
          'div',
          { class: 'thumb' },
          h('img', { src: p.url, alt: `Page ${i + 1}` }),
          h(
            'button',
            {
              type: 'button',
              class: 'thumb-remove',
              'aria-label': 'Remove page',
              onClick: () => {
                URL.revokeObjectURL(p.url);
                pages.splice(i, 1);
                paintThumbs();
                updateButton();
              },
            },
            iconClose()
          )
        )
      )
    );
    thumbs.hidden = pages.length === 0;
  }
  paintThumbs();

  const readBtn = h('button', { type: 'button', class: 'btn primary wide', disabled: true, onClick: read }, 'Read recipe');
  const status = h('p', { class: 'status', 'aria-live': 'polite' });

  function updateButton() {
    readBtn.disabled = busy || (!text.value.trim() && pages.length === 0);
  }

  async function read() {
    if (busy) return;
    const settings = getSettings();
    if (!settings.apiKey) {
      navigate('#/settings');
      toast('Add your Claude API key first');
      return;
    }
    busy = true;
    updateButton();
    readBtn.textContent = 'Reading…';
    const raw = text.value.trim();
    const isUrl = /^https?:\/\/\S+$/i.test(raw);
    status.textContent = pages.length ? 'Reading the page…' : isUrl ? 'Fetching the page…' : 'Reading…';

    try {
      const images = [];
      for (const p of pages) images.push({ media_type: 'image/jpeg', data: await blobToBase64(p.blob) });
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiKey: settings.apiKey,
          model: settings.model,
          text: isUrl ? '' : raw,
          url: isUrl ? raw : '',
          images,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Could not read that (${res.status}).`);
      const r = data.recipe;
      writeDraft({
        title: r.title || '',
        headnote: r.headnote || '',
        serves: r.serves || 4,
        yieldNote: r.yieldNote || '',
        prepMinutes: r.prepMinutes ?? null,
        cookMinutes: r.cookMinutes ?? null,
        course: r.course || 'main',
        cuisine: r.cuisine || '',
        tags: r.tags || [],
        ingredients: r.ingredients || [],
        method: r.method || [],
        notes: '',
        source: r.source || (isUrl ? raw : ''),
      });
      navigate('#/new');
    } catch (err) {
      status.textContent = err.message || 'Something went wrong.';
      busy = false;
      readBtn.textContent = 'Read recipe';
      updateButton();
    }
  }

  return h(
    'main',
    { class: 'page add' },
    h('nav', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, iconBack(), 'Recipes')),
    h('h1', {}, 'Add a recipe'),
    hasApiKey()
      ? null
      : h('p', { class: 'note' }, 'To read recipes automatically, add your Claude API key in ', h('a', { href: '#/settings' }, 'Settings'), '. You can still type one in below.'),
    h('div', { class: 'paste-wrap' }, text),
    h(
      'div',
      { class: 'photo-field' },
      thumbs,
      h('button', { type: 'button', class: 'btn text', onClick: () => fileInput.click() }, iconCamera(), pages.length ? 'Add another page' : 'Photograph a cookbook page'),
      fileInput
    ),
    readBtn,
    status,
    h('p', { class: 'or' }, h('a', { href: '#/new', class: 'quiet' }, 'Or type it in yourself'))
  );
}
