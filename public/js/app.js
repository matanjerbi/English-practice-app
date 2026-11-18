import { state, setUser, onChange, dueWords, todayXp, streak } from './store.js';
import { session, setSession, api, syncNow, onSync, syncStatus } from './api.js';
import { esc, toast, $ } from './ui.js';
import { stopSpeaking, stopListening } from './speech.js';

import * as home from './views/home.js';
import * as wordsView from './views/words.js';
import * as reviewView from './views/review.js';
import * as practice from './views/practice.js';
import * as games from './views/games.js';
import * as sentences from './views/sentences.js';
import * as speakView from './views/speak.js';
import * as chat from './views/chat.js';
import * as share from './views/share.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';
import * as auth from './views/auth.js';

const routes = [
  [/^\/?$/, home.render, 'home'],
  [/^\/words$/, wordsView.render, 'words'],
  [/^\/review$/, reviewView.render, 'practice'],
  [/^\/practice$/, practice.render, 'practice'],
  [/^\/game\/(\w+)$/, games.render, 'practice'],
  [/^\/sentence\/(\w+)$/, sentences.render, 'practice'],
  [/^\/speak\/(\w+)$/, speakView.render, 'practice'],
  [/^\/chat$/, chat.render, 'chat'],
  [/^\/share$/, share.render, 'share'],
  [/^\/s\/([A-Za-z0-9]+)$/, share.renderCode, 'share'],
  [/^\/stats$/, stats.render, 'home'],
  [/^\/settings$/, settings.render, 'home'],
];

let cleanup = null;
const view = () => $('#view');

export function go(path) { location.hash = '#' + path; }
window.go = go;

function applyTheme() {
  const t = state.data.settings.theme;
  document.documentElement.dataset.theme = t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}

async function route() {
  try { cleanup?.(); } catch {}
  cleanup = null;
  stopSpeaking(); stopListening();
  const path = (location.hash.replace(/^#/, '').split('?')[0]) || '/';

  if (!session.token) {
    const m = path.match(/^\/s\/([A-Za-z0-9]+)$/);
    if (m) sessionStorage.setItem('ep_after_login', path);
    document.body.classList.add('no-nav');
    auth.render(view(), { onLogin });
    return;
  }
  document.body.classList.remove('no-nav');

  for (const [re, fn, tab] of routes) {
    const m = path.match(re);
    if (m) {
      document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
      view().innerHTML = '';
      view().scrollTop = 0; window.scrollTo(0, 0);
      try { cleanup = await fn(view(), ...m.slice(1)); }
      catch (e) { console.error(e); view().innerHTML = `<div class="card">שגיאה: ${esc(e.message)}</div>`; }
      return;
    }
  }
  go('/');
}

function onLogin(token, user) {
  setSession(token, user);
  setUser(user.id);
  applyTheme();
  renderHeader();
  syncNow().then(() => {
    const after = sessionStorage.getItem('ep_after_login');
    sessionStorage.removeItem('ep_after_login');
    if (after) go(after); else route();
  });
  route();
}

export function logout() {
  api('auth/logout', { method: 'POST' }).catch(() => {});
  setSession('', null);
  setUser('guest');
  renderHeader();
  route();
}

function renderHeader() {
  const h = $('#hdr-status');
  if (!h) return;
  if (!session.token) { h.innerHTML = ''; return; }
  const due = dueWords().length;
  const sIcon = { syncing: '⟳', ok: '☁️', error: '⚠️', offline: '📴', idle: '☁️' }[syncStatus.state] || '';
  h.innerHTML = `
    <span class="pill" title="רצף ימים">🔥 ${streak()}</span>
    <span class="pill" title="נקודות היום">⭐ ${todayXp()}</span>
    ${due ? `<a class="pill warn" href="#/review" title="מילים לחזרה">🔁 ${due}</a>` : ''}
    <span class="sync ${syncStatus.state}" title="${esc(syncStatus.error || 'סנכרון')}">${sIcon}</span>`;
}

// ---------- התקנה כאפליקציה ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
  document.body.classList.add('can-install');
});
export async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.body.classList.remove('can-install');
  } else {
    toast('בדפדפן: תפריט ⋮ ← "הוספה למסך הבית" (ב-iPhone: שיתוף ← הוסף למסך הבית)');
  }
}
window.installApp = installApp;
window.logout = logout;

// ---------- אתחול ----------
window.addEventListener('hashchange', route);
window.addEventListener('ep:unauthorized', () => {
  if (!session.token) return;
  toast('ההתחברות פגה — התחבר מחדש', 'err');
  setSession('', null);
  route();
});
onChange(renderHeader);
onSync(renderHeader);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
onChange(applyTheme);

setUser(session.user?.id || 'guest');
applyTheme();
renderHeader();
route();
if (session.token) {
  syncNow();
  api('me').then(r => { if (r?.user) setSession(session.token, r.user); }).catch(() => {});
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
