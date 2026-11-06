import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const AV_COLORS = [['#ff8fc0', '#a14dff'], ['#ffb36b', '#ff5f7e'], ['#7fd1ff', '#5b6cff'], ['#9dffcf', '#22a08a'], ['#ffe08a', '#ff8a4c'], ['#c9a3ff', '#ff6fae']];
export function avatar(nick, { size = '', online = null } = {}) {
  let h = 0;
  for (const c of String(nick)) h = (h * 31 + c.charCodeAt(0)) | 0;
  const [a, b] = AV_COLORS[Math.abs(h) % AV_COLORS.length];
  const dot = online === null ? '' : `<span class="dot ${online ? '' : 'off'}"></span>`;
  return `<div class="avatar ${size}" style="background:linear-gradient(135deg,${a},${b})">${esc([...String(nick)][0] || '?')}${dot}</div>`;
}

let toastRoot;
export function toast(msg, { type = '', ms = 3200, html = false, actions = null } = {}) {
  if (!toastRoot) { toastRoot = el('<div class="toasts"></div>'); document.getElementById('app').appendChild(toastRoot); }
  const t = el(`<div class="toast ${type}"></div>`);
  if (html) t.innerHTML = msg; else t.textContent = msg;
  if (actions) {
    for (const a of actions) {
      const b = el(`<button class="btn small ${a.primary ? 'primary' : ''}">${esc(a.label)}</button>`);
      b.onclick = () => { a.onClick(); t.remove(); };
      t.appendChild(b);
    }
  }
  toastRoot.appendChild(t);
  const timer = setTimeout(() => { t.remove(); actions?.find((a) => a.onTimeout)?.onTimeout(); }, ms);
  t.dismiss = () => { clearTimeout(timer); t.remove(); };
  return t;
}

export function modal(title, bodyHtml, { wide = false, foot = '', onClose } = {}) {
  const bg = el(`<div class="modal-bg"><div class="modal glass ${wide ? 'wide' : ''}">
    <div class="modal-head"><h2>${title}</h2><button class="iconbtn" data-close>${icon('close')}</button></div>
    <div class="modal-body scroll">${bodyHtml}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div></div>`);
  const close = () => { bg.remove(); onClose?.(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('pointerdown', (e) => { if (e.target === bg) close(); });
  bg.querySelector('[data-close]').onclick = close;
  document.getElementById('app').appendChild(bg);
  bg.close = close;
  return bg;
}

export function confirmDialog(title, text, okLabel = '확인') {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(title, `<p class="note" style="font-size:14px">${text}</p>`, {
      foot: `<button class="btn" data-no>취소</button><button class="btn primary" data-ok>${esc(okLabel)}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.querySelector('[data-no]').onclick = () => { done = true; m.close(); resolve(false); };
    m.querySelector('[data-ok]').onclick = () => { done = true; m.close(); resolve(true); };
  });
}

export const fmtTime = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
