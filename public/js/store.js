// מצב האפליקציה: מילים, SRS, סטטיסטיקה, הגדרות. local-first עם מיזוג לסנכרון.
const DAY = 864e5;
let userId = 'guest';
let listeners = new Set();
let saveTimer = null;
let onChangeHook = null;

export const state = { data: defaultData() };

export function defaultData() {
  return {
    v: 1,
    words: [],
    settings: { accent: 'en-US', voiceURI: '', rate: 0.95, dailyGoal: 60, level: 'intermediate', theme: 'auto' },
    settingsU: 0,
    log: {},        // 'YYYY-MM-DD' -> { xp, ok, bad, reviews, mins }
    games: {},      // gameId -> { played, best, ok, bad }
    imported: {},   // share codes / inbox ids already imported
    updatedAt: 0,
  };
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const today = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export function setUser(id) {
  userId = id || 'guest';
  try {
    const raw = localStorage.getItem('ep_state_' + userId);
    state.data = raw ? normalize(JSON.parse(raw)) : defaultData();
  } catch { state.data = defaultData(); }
  emit();
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setChangeHook(fn) { onChangeHook = fn; }
function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

export function persist({ sync = true } = {}) {
  state.data.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem('ep_state_' + userId, JSON.stringify(state.data)); } catch (e) { console.warn(e); }
  }, 150);
  if (sync && onChangeHook) onChangeHook();
  emit();
}

export function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem('ep_state_' + userId, JSON.stringify(state.data)); } catch {}
}

function normalize(d) {
  const base = defaultData();
  const out = { ...base, ...d };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.words = (d.words || []).filter(w => w && w.id).map(normWord);
  out.log = d.log || {};
  out.games = d.games || {};
  out.imported = d.imported || {};
  return out;
}

function normWord(w) {
  return {
    id: w.id, en: w.en || '', he: w.he || '', ex: w.ex || '', exHe: w.exHe || '', pos: w.pos || '',
    note: w.note || '', tags: Array.isArray(w.tags) ? w.tags : [], src: w.src || '',
    c: w.c || Date.now(), u: w.u || Date.now(), del: !!w.del, star: !!w.star,
    srs: { e: 2.5, i: 0, d: 0, r: 0, l: 0, ...(w.srs || {}) },
    st: { ok: 0, bad: 0, last: 0, ...(w.st || {}) },
  };
}

// ---------- מיזוג בין מכשירים ----------
export function merge(local, remote) {
  if (!remote) return local;
  const a = normalize(local), b = normalize(remote);
  const map = new Map();
  for (const w of a.words) map.set(w.id, w);
  for (const w of b.words) {
    const cur = map.get(w.id);
    if (!cur || (w.u || 0) > (cur.u || 0)) map.set(w.id, w);
  }
  const log = { ...a.log };
  for (const [day, v] of Object.entries(b.log)) {
    const c = log[day] || {};
    log[day] = {};
    for (const k of new Set([...Object.keys(c), ...Object.keys(v)])) log[day][k] = Math.max(c[k] || 0, v[k] || 0);
  }
  const games = { ...a.games };
  for (const [g, v] of Object.entries(b.games)) {
    const c = games[g] || {};
    games[g] = {};
    for (const k of new Set([...Object.keys(c), ...Object.keys(v)])) games[g][k] = Math.max(c[k] || 0, v[k] || 0);
  }
  const useB = (b.settingsU || 0) > (a.settingsU || 0);
  return {
    ...a,
    words: [...map.values()],
    log, games,
    imported: { ...b.imported, ...a.imported },
    settings: useB ? b.settings : a.settings,
    settingsU: Math.max(a.settingsU || 0, b.settingsU || 0),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
  };
}

export function replaceData(d) { state.data = normalize(d); saveNow(); emit(); }

// ---------- מילים ----------
export const words = () => state.data.words.filter(w => !w.del);
export const getWord = (id) => state.data.words.find(w => w.id === id && !w.del);

export function findByEn(en) {
  const k = normText(en);
  return words().find(w => normText(w.en) === k);
}

export function addWord(fields, { silent = false } = {}) {
  const en = (fields.en || '').trim(), he = (fields.he || '').trim();
  if (!en || !he) return null;
  const existing = findByEn(en);
  if (existing) return { dup: true, word: existing };
  const w = normWord({ ...fields, en, he, id: uid(), c: Date.now(), u: Date.now() });
  state.data.words.unshift(w);
  if (!silent) persist();
  return { word: w };
}

export function addMany(list, src = '') {
  let added = 0, dup = 0;
  for (const f of list) {
    const r = addWord({ ...f, src: f.src || src }, { silent: true });
    if (!r) continue;
    if (r.dup) dup++; else added++;
  }
  persist();
  return { added, dup };
}

export function updateWord(id, patch) {
  const w = state.data.words.find(x => x.id === id);
  if (!w) return;
  Object.assign(w, patch, { u: Date.now() });
  persist();
}

export function deleteWord(id) {
  const w = state.data.words.find(x => x.id === id);
  if (!w) return;
  Object.assign(w, { del: true, u: Date.now(), en: w.en, he: '', ex: '', exHe: '', note: '' });
  persist();
}

export function setSettings(patch) {
  Object.assign(state.data.settings, patch);
  state.data.settingsU = Date.now();
  persist();
}

// ---------- SRS (בסגנון SM-2) ----------
// grade: 0 = שכחתי, 1 = קשה, 2 = טוב, 3 = קל
export function review(id, grade) {
  const w = state.data.words.find(x => x.id === id);
  if (!w) return;
  const s = w.srs;
  const now = Date.now();
  if (grade === 0) {
    s.l++; s.r = 0; s.i = 0; s.e = Math.max(1.3, s.e - 0.2);
    s.d = now + 10 * 60e3;
  } else {
    s.r++;
    if (s.r === 1) s.i = grade === 1 ? 0.5 : grade === 2 ? 1 : 3;
    else if (s.r === 2) s.i = grade === 1 ? 2 : grade === 2 ? 3 : 6;
    else s.i = Math.round(s.i * s.e * (grade === 1 ? 0.7 : grade === 3 ? 1.3 : 1) * 10) / 10;
    s.e = Math.min(3, Math.max(1.3, s.e + (grade === 1 ? -0.15 : grade === 3 ? 0.12 : 0)));
    s.i = Math.min(s.i, 365);
    s.d = now + s.i * DAY;
  }
  w.st.last = now;
  if (grade === 0) w.st.bad++; else w.st.ok++;
  w.u = now;
  addXp(grade === 0 ? 1 : 3, { reviews: 1, ok: grade ? 1 : 0, bad: grade ? 0 : 1 });
}

// תשובה במשחק: טעות מחזירה את המילה לחזרה, הצלחה רק נספרת
export function gameAnswer(id, correct, xp = 2) {
  const w = state.data.words.find(x => x.id === id);
  if (w) {
    if (correct) w.st.ok++;
    else {
      w.st.bad++;
      if (w.srs.r > 0) { w.srs.d = Math.min(w.srs.d, Date.now()); w.srs.i = Math.max(0.5, w.srs.i / 2); }
    }
    w.st.last = Date.now();
    w.u = Date.now();
  }
  addXp(correct ? xp : 0, { ok: correct ? 1 : 0, bad: correct ? 0 : 1 });
}

export function addXp(xp, extra = {}) {
  const d = today();
  const e = state.data.log[d] || (state.data.log[d] = { xp: 0, ok: 0, bad: 0, reviews: 0 });
  e.xp = (e.xp || 0) + xp;
  for (const [k, v] of Object.entries(extra)) e[k] = (e[k] || 0) + v;
  persist();
}

export function recordGame(gameId, score, ok, bad) {
  const g = state.data.games[gameId] || (state.data.games[gameId] = { played: 0, best: 0, ok: 0, bad: 0 });
  g.played++; g.best = Math.max(g.best, score); g.ok += ok; g.bad += bad;
  persist();
}

export const isDue = (w) => w.srs.r === 0 ? false : w.srs.d <= Date.now();
export const isNew = (w) => w.srs.r === 0 && w.srs.l === 0;
export const dueWords = () => words().filter(isDue).sort((a, b) => a.srs.d - b.srs.d);
export const newWords = () => words().filter(isNew).sort((a, b) => a.c - b.c);

export function level(w) {
  if (w.srs.r === 0 && w.srs.l === 0 && !w.st.ok) return 'new';
  if (w.srs.i >= 21) return 'mastered';
  if (w.srs.i >= 5) return 'known';
  return 'learning';
}
export const LEVEL_HE = { new: 'חדשה', learning: 'בלמידה', known: 'מוכרת', mastered: 'שלוטה' };

// בחירה משוקללת — מילים חלשות מופיעות יותר
export function pickWeighted(pool, n, filter = () => true) {
  const items = pool.filter(filter).map(w => {
    const lv = level(w);
    let wt = 1 + w.st.bad * 1.5 - Math.min(w.st.ok, 10) * 0.08;
    if (lv === 'new') wt += 1; if (lv === 'mastered') wt *= 0.4; if (w.star) wt += 1;
    return { w, wt: Math.max(0.2, wt) };
  });
  const out = [];
  while (out.length < n && items.length) {
    const total = items.reduce((s, x) => s + x.wt, 0);
    let r = Math.random() * total, i = 0;
    for (; i < items.length; i++) { r -= items[i].wt; if (r <= 0) break; }
    out.push(items.splice(Math.min(i, items.length - 1), 1)[0].w);
  }
  return out;
}

export function streak() {
  let s = 0;
  const d = new Date();
  const has = (x) => (state.data.log[today(x)]?.xp || 0) > 0;
  if (!has(d)) d.setDate(d.getDate() - 1); // היום עוד לא נגמר
  while (has(d)) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

export const todayXp = () => state.data.log[today()]?.xp || 0;

// ---------- עזרי טקסט ----------
export function normText(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'").replace(/[^a-z0-9'֐-׿\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function lev(a, b) {
  a = normText(a); b = normText(b);
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// 'exact' | 'close' | 'wrong'
export function judge(answer, target) {
  const targets = String(target).split(/[\/,;]| or /).map(t => t.trim()).filter(Boolean);
  let best = 'wrong';
  for (const t of [target, ...targets]) {
    const d = lev(answer, t);
    if (d === 0) return 'exact';
    const len = normText(t).length;
    if ((len >= 4 && d === 1) || (len >= 9 && d === 2)) best = 'close';
  }
  return best;
}

export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const firstMeaning = (he) => String(he || '').split(/[,;\/]/)[0].trim();
