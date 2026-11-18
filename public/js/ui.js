import { speak } from './speech.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const en = (s) => `<span class="en" dir="ltr">${esc(s)}</span>`;

export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

export function modal(html, { onMount, wide, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog"><button class="modal-x" aria-label="סגור">✕</button>${html}</div>`;
  document.body.appendChild(wrap);
  let closed = false;
  const close = () => { if (closed) return; closed = true; onClose?.(); wrap.classList.add('closing'); setTimeout(() => wrap.remove(), 180); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.modal-x')) close(); });
  onMount?.(wrap.querySelector('.modal'), close);
  return close;
}

export function confirmBox(text, { ok = 'אישור', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal(`<p class="confirm-text">${esc(text)}</p>
      <div class="row end"><button class="btn ghost" data-a="no">ביטול</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(ok)}</button></div>`, {
      onClose: () => { if (!answered) resolve(false); },
      onMount: (m, c) => m.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        answered = true; resolve(a === 'yes'); c();
      }),
    });
  });
}

export const speakBtn = (text, cls = '') => `<button class="icon-btn speak ${cls}" data-speak="${esc(text)}" aria-label="השמע" title="השמע">🔊</button>`;

// כפתורי השמעה גלובליים
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-speak]');
  if (b) { e.preventDefault(); e.stopPropagation(); speak(b.dataset.speak, b.dataset.rate ? { rate: +b.dataset.rate } : {}); }
});

export function progress(cur, total) {
  return `<div class="progress"><div style="width:${Math.round((cur / Math.max(1, total)) * 100)}%"></div></div>`;
}

export function emptyState(icon, title, text, actionHtml = '') {
  return `<div class="empty"><div class="empty-ico">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml}</div>`;
}

export function loadingBtn(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.txt = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${text || ''}`; }
  else { btn.disabled = false; if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; }
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relDue(ts) {
  const d = ts - Date.now();
  if (d <= 0) return 'עכשיו';
  const h = d / 36e5;
  if (h < 1) return 'בעוד פחות משעה';
  if (h < 24) return `בעוד ${Math.round(h)} שעות`;
  const days = Math.round(h / 24);
  return days === 1 ? 'מחר' : `בעוד ${days} ימים`;
}

export function vibrate(p) { try { navigator.vibrate?.(p); } catch {} }

// צלילי משוב קצרים
let ctx;
export function beep(ok) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = ok ? 880 : 220;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.18 : 0.3));
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.3);
    if (ok) { const o2 = ctx.createOscillator(); o2.frequency.value = 1320; o2.connect(g); o2.start(ctx.currentTime + 0.08); o2.stop(ctx.currentTime + 0.2); }
  } catch {}
}

export const go = (p) => { location.hash = '#' + p; };
export const query = () => new URLSearchParams(location.hash.split('?')[1] || '');
