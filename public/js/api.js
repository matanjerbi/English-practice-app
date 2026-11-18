import { state, merge, replaceData, setChangeHook, saveNow } from './store.js';

const TOKEN_KEY = 'ep_token', USER_KEY = 'ep_user';
export const session = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: (() => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } })(),
};

export function setSession(token, user) {
  session.token = token || ''; session.user = user || null;
  if (token) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
}

export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

export async function api(path, { method = 'GET', body, raw } = {}) {
  const headers = {};
  if (session.token) headers.authorization = 'Bearer ' + session.token;
  if (body !== undefined || raw !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch('/api/' + path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError('אין חיבור לשרת', 0);
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && path !== 'auth/login') window.dispatchEvent(new CustomEvent('ep:unauthorized'));
    throw new ApiError(data?.error || `שגיאה ${res.status}`, res.status);
  }
  return data;
}

export const ai = (action, payload) => api('ai/' + action, { method: 'POST', body: payload });

// ---------- סנכרון ----------
export const syncStatus = { state: 'idle', last: 0, error: '' };
let syncTimer = null, syncing = false, pending = false;
const listeners = new Set();
export const onSync = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emitSync = () => listeners.forEach(f => f(syncStatus));

export async function syncNow() {
  if (!session.token) return;
  if (syncing) { pending = true; return; }
  syncing = true; syncStatus.state = 'syncing'; emitSync();
  try {
    const remote = await api('state');
    const merged = merge(state.data, remote.data);
    replaceData(merged);
    await api('state', { method: 'PUT', raw: JSON.stringify(state.data) });
    syncStatus.state = 'ok'; syncStatus.last = Date.now(); syncStatus.error = '';
  } catch (e) {
    syncStatus.state = navigator.onLine ? 'error' : 'offline';
    syncStatus.error = e.message;
  } finally {
    syncing = false; emitSync();
    if (pending) { pending = false; scheduleSync(800); }
  }
}

export function scheduleSync(ms = 2500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, ms);
}

setChangeHook(() => scheduleSync());
window.addEventListener('online', () => scheduleSync(500));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { saveNow(); if (session.token) syncNow(); }
  else scheduleSync(300);
});
