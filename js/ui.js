// Tiny DOM helpers. Text always goes in as text, never as HTML.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && k !== 'form') {
      try {
        el[k] = v;
      } catch (e) {
        el.setAttribute(k, v);
      }
    } else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function navigate(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

let toastTimer = null;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function confirmDialog(message, { confirmLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    const done = (v) => {
      overlay.remove();
      resolve(v);
    };
    const overlay = h(
      'div',
      { class: 'overlay', onClick: (e) => e.target === overlay && done(false) },
      h(
        'div',
        { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('p', {}, message),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { class: 'btn text', type: 'button', onClick: () => done(false) }, 'Cancel'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onClick: () => done(true) }, confirmLabel)
        )
      )
    );
    document.body.appendChild(overlay);
  });
}

export function iconBack() {
  return svg('M15 18l-6-6 6-6');
}
export function iconPlus() {
  return svg('M12 5v14M5 12h14');
}
export function iconSearch() {
  return svg('M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5');
}
export function iconCamera() {
  return svg('M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z');
}
export function iconClose() {
  return svg('M6 6l12 12M18 6L6 18');
}
export function iconMinus() {
  return svg('M5 12h14');
}
export function iconStar(filled) {
  const s = svg('M12 2.8l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z');
  if (filled) s.classList.add('filled');
  return s;
}

function svg(d) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('icon');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  el.appendChild(p);
  return el;
}
