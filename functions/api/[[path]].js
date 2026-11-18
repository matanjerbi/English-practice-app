// API יחיד לכל /api/* — סנכרון מצב (D1) ופיצ'רים של AI (Workers AI)
const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_STATE_BYTES = 1_900_000; // מגבלת שורה ב-D1 ~2MB

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const AI_DAILY_LIMIT = 300;
const SESSION_DAYS = 180;
const MAX_SHARE_WORDS = 500;

const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return hex(bits);
}

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function currentUser(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.username, u.display, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).bind(token).first();
  if (!row || row.expires < Date.now()) return null;
  return { id: row.id, username: row.username, display: row.display, token };
}

async function newSession(env, userId) {
  const token = randHex(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created, expires) VALUES (?, ?, ?, ?)')
    .bind(token, userId, now, now + SESSION_DAYS * 864e5).run();
  return token;
}

const USERNAME_RE = /^[a-zA-Z0-9_.\u0590-\u05FF-]{3,24}$/;

// ניקוי מילים שמגיעות לשיתוף
function cleanWords(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const w of list.slice(0, MAX_SHARE_WORDS)) {
    const en = clip(w?.en, 80).trim(), he = clip(w?.he, 120).trim();
    if (!en || !he) continue;
    out.push({
      en, he,
      ex: clip(w.ex, 300), exHe: clip(w.exHe, 300),
      pos: clip(w.pos, 30), note: clip(w.note, 200),
      tags: Array.isArray(w.tags) ? w.tags.slice(0, 6).map(t => clip(t, 30)) : [],
    });
  }
  return out;
}

const shareCode = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(6));
  return [...r].map(b => abc[b % abc.length]).join('');
};

async function aiAllowed(env, userId) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    'INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 RETURNING count'
  ).bind(userId, day).first();
  return (row?.count || 0) <= AI_DAILY_LIMIT;
}

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

const clip = (s, n) => String(s ?? '').slice(0, n);

// ---------- AI helpers ----------
async function llm(env, system, user, { max = 700, temperature = 0.4, history = [] } = {}) {
  if (!env.AI) throw new Error('Workers AI binding missing');
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: user }];
  const res = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, { messages, max_tokens: max, temperature });
  const out = res?.response ?? res?.result?.response ?? res;
  return out;
}

function parseJson(out) {
  if (out && typeof out === 'object') return out;
  const text = String(out || '');
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  const as = text.indexOf('['), ae = text.lastIndexOf(']');
  if (as >= 0 && ae > as) {
    try { return JSON.parse(text.slice(as, ae + 1)); } catch {}
  }
  throw new Error('AI returned invalid JSON');
}

const JSON_RULE = 'Respond with ONLY valid JSON, no markdown, no code fences, no extra text.';

const SCENARIOS = {
  free: 'a friendly English conversation partner. Talk about anything the learner wants.',
  interview: 'an interviewer at a tech company interviewing the learner for a database / platform engineer position. Ask one question at a time.',
  restaurant: 'a waiter at a restaurant in London. The learner is a customer.',
  travel: 'a hotel receptionist and local guide. The learner is a tourist checking in and asking for tips.',
  smalltalk: 'a new colleague making small talk at the office coffee machine.',
  meeting: 'a teammate in a technical stand-up meeting. Discuss tasks, incidents and plans.',
  shopping: 'a shop assistant in an electronics store.',
  doctor: 'a receptionist at a medical clinic booking an appointment.',
};

async function handleAI(action, data, env) {
  switch (action) {
    case 'enrich': {
      const word = clip(data.word, 80).trim();
      if (!word) return json({ error: 'missing word' }, 400);
      const out = await llm(env,
        `You are an expert English-Hebrew dictionary for Hebrew-speaking learners. ${JSON_RULE}`,
        `English word or phrase: "${word}"
Return JSON: {"en": corrected English spelling, "he": the main Hebrew translation(s) - up to 3 short common meanings separated by ", ", "pos": part of speech in English (noun/verb/adjective/adverb/phrase/...), "example": one natural everyday English example sentence (8-14 words) using the word, "exampleHe": accurate Hebrew translation of that sentence, "note": very short Hebrew usage note or empty string}`,
        { max: 400, temperature: 0.2 });
      return json(parseJson(out));
    }
    case 'translate': {
      const he = clip(data.text, 120).trim();
      if (!he) return json({ error: 'missing text' }, 400);
      const out = await llm(env,
        `You are an expert Hebrew-English dictionary. ${JSON_RULE}`,
        `Hebrew word or phrase: "${he}"
Return JSON: {"en": the most common English word/phrase for it, "he": cleaned Hebrew meaning(s), "pos": part of speech, "example": natural English example sentence using the English word, "exampleHe": Hebrew translation of the sentence, "note": short Hebrew note or ""}`,
        { max: 400, temperature: 0.2 });
      return json(parseJson(out));
    }
    case 'examples': {
      const words = (Array.isArray(data.words) ? data.words : []).slice(0, 12)
        .map(w => ({ id: clip(w.id, 40), en: clip(w.en, 80), he: clip(w.he, 80) }));
      if (!words.length) return json({ items: [] });
      const out = await llm(env,
        `You write example sentences for English learners (B1 level). ${JSON_RULE}`,
        `For each word write one natural English sentence (7-14 words) that uses the word in the given meaning, plus its Hebrew translation.
Words: ${JSON.stringify(words)}
Return JSON: {"items":[{"id": same id, "example": "...", "exampleHe": "..."}]}`,
        { max: 1400, temperature: 0.5 });
      return json(parseJson(out));
    }
    case 'check': {
      const word = clip(data.word, 80), sentence = clip(data.sentence, 500).trim();
      if (!sentence) return json({ error: 'missing sentence' }, 400);
      const out = await llm(env,
        `You are a kind, precise English teacher for a Hebrew speaker. Explanations must be in Hebrew. ${JSON_RULE}`,
        `The learner had to write an English sentence using the word "${word}".
Learner sentence: "${sentence}"
Return JSON: {"score": 0-100 overall quality, "usedWord": true/false whether the target word (any form) is used correctly, "correct": true if the sentence is grammatically correct, "corrected": the minimally corrected sentence (same as input if correct), "natural": a more natural way a native speaker would say it, "feedbackHe": 1-3 short sentences in Hebrew explaining the mistakes or praising, "mistakes": [{"wrong": "...", "right": "...", "whyHe": "short Hebrew explanation"}]}`,
        { max: 700, temperature: 0.2 });
      return json(parseJson(out));
    }
    case 'chat': {
      const scenario = SCENARIOS[data.scenario] || SCENARIOS.free;
      const level = clip(data.level || 'intermediate', 30);
      const vocab = (Array.isArray(data.vocab) ? data.vocab : []).slice(0, 15).map(v => clip(v, 40));
      const history = (Array.isArray(data.messages) ? data.messages : []).slice(-12).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: clip(m.role === 'assistant' ? m.content : m.content, 800),
      }));
      const last = history.pop();
      if (!last || last.role !== 'user') {
        // פתיחת שיחה
        const out = await llm(env,
          `You are ${scenario} The learner is a Hebrew speaker at ${level} level. Speak simple, natural English. ${JSON_RULE}`,
          `Start the conversation with a short opening (1-2 sentences). Return JSON: {"reply": "...", "replyHe": "Hebrew translation of reply"}`,
          { max: 300, temperature: 0.7 });
        return json(parseJson(out));
      }
      const out = await llm(env,
        `You are ${scenario} The learner is a Hebrew speaker at ${level} level practicing spoken English. Keep replies short (1-3 sentences), natural and end with a question to keep the conversation going.${vocab.length ? ` When natural, use some of these words the learner is studying: ${vocab.join(', ')}.` : ''} ${JSON_RULE}`,
        `Learner said: "${last.content}"
Return JSON: {"reply": your in-character reply, "replyHe": Hebrew translation of your reply, "correction": if the learner's message had grammar/word mistakes give the corrected version, otherwise "", "tipHe": very short Hebrew tip about the learner's mistake or a better phrase, or ""}`,
        { max: 500, temperature: 0.7, history });
      return json(parseJson(out));
    }
    case 'story': {
      const words = (Array.isArray(data.words) ? data.words : []).slice(0, 10).map(w => clip(w, 40));
      const out = await llm(env,
        `You write short, engaging stories for English learners (B1). ${JSON_RULE}`,
        `Write a short story (90-130 words) that naturally uses ALL these words: ${words.join(', ')}.
Return JSON: {"title": "...", "story": "...", "storyHe": "Hebrew translation", "questions": [{"q": "comprehension question in English", "options": ["a","b","c"], "answer": index 0-2}] (exactly 3 questions)}`,
        { max: 1500, temperature: 0.8 });
      return json(parseJson(out));
    }
    default:
      return json({ error: 'unknown action' }, 404);
  }
}

async function handleAuth(route, request, env) {
  const data = await body(request);
  const username = clip(data.username, 40).trim();
  const password = String(data.password || '');
  if (route === 'auth/register') {
    if (env.SIGNUP_CODE && !safeEqual(String(data.inviteCode || '').trim(), env.SIGNUP_CODE)) {
      return json({ error: 'קוד הזמנה שגוי' }, 403);
    }
    if (!USERNAME_RE.test(username)) return json({ error: 'שם משתמש: 3-24 תווים, אותיות/ספרות/_ . -' }, 400);
    if (password.length < 6) return json({ error: 'סיסמה חייבת להכיל לפחות 6 תווים' }, 400);
    const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (exists) return json({ error: 'שם המשתמש תפוס' }, 409);
    const id = randHex(12), salt = randHex(16);
    const display = clip(data.display, 40).trim() || username;
    await env.DB.prepare('INSERT INTO users (id, username, display, pass_hash, salt, created) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, username, display, await hashPassword(password, salt), salt, Date.now()).run();
    const token = await newSession(env, id);
    return json({ token, user: { id, username, display } });
  }
  if (route === 'auth/login') {
    const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    if (!u || !safeEqual(await hashPassword(password, u.salt), u.pass_hash)) {
      return json({ error: 'שם משתמש או סיסמה שגויים' }, 401);
    }
    const token = await newSession(env, u.id);
    return json({ token, user: { id: u.id, username: u.username, display: u.display } });
  }
  return null;
}

async function handleShares(parts, method, request, env, user, url) {
  // /api/shares  (GET mine | GET ?public=1 | POST create)
  // /api/shares/:code (GET | DELETE | POST import-count)
  const code = parts[1] ? clip(parts[1], 12).toUpperCase() : '';
  if (!code) {
    if (method === 'GET') {
      if (url.searchParams.get('public') === '1') {
        const q = clip(url.searchParams.get('q') || '', 60).trim();
        const stmt = q
          ? env.DB.prepare(`SELECT s.code, s.title, s.description, s.word_count, s.imports, s.created, u.display, u.username
              FROM shares s JOIN users u ON u.id = s.owner_id WHERE s.public = 1 AND (s.title LIKE ?1 OR s.description LIKE ?1)
              ORDER BY s.imports DESC, s.created DESC LIMIT 60`).bind(`%${q}%`)
          : env.DB.prepare(`SELECT s.code, s.title, s.description, s.word_count, s.imports, s.created, u.display, u.username
              FROM shares s JOIN users u ON u.id = s.owner_id WHERE s.public = 1
              ORDER BY s.created DESC LIMIT 60`);
        return json({ items: (await stmt.all()).results });
      }
      const rows = await env.DB.prepare(
        'SELECT code, title, description, word_count, imports, public, created FROM shares WHERE owner_id = ? ORDER BY created DESC'
      ).bind(user.id).all();
      return json({ items: rows.results });
    }
    if (method === 'POST') {
      const data = await body(request);
      const words = cleanWords(data.words);
      if (!words.length) return json({ error: 'אין מילים לשיתוף' }, 400);
      const title = clip(data.title, 80).trim() || 'חבילת מילים';
      let c = shareCode();
      for (let i = 0; i < 4; i++) {
        const ex = await env.DB.prepare('SELECT code FROM shares WHERE code = ?').bind(c).first();
        if (!ex) break;
        c = shareCode();
      }
      await env.DB.prepare(
        'INSERT INTO shares (code, owner_id, title, description, words, word_count, public, imports, created) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
      ).bind(c, user.id, title, clip(data.description, 300), JSON.stringify(words), words.length, data.public ? 1 : 0, Date.now()).run();
      return json({ code: c });
    }
    return json({ error: 'method not allowed' }, 405);
  }
  if (method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT s.*, u.display, u.username FROM shares s JOIN users u ON u.id = s.owner_id WHERE s.code = ?'
    ).bind(code).first();
    if (!row) return json({ error: 'לא נמצאה חבילה עם הקוד הזה' }, 404);
    return json({
      code: row.code, title: row.title, description: row.description, words: JSON.parse(row.words),
      wordCount: row.word_count, imports: row.imports, public: !!row.public, created: row.created,
      owner: { display: row.display, username: row.username }, mine: row.owner_id === user.id,
    });
  }
  if (method === 'POST' && parts[2] === 'imported') {
    await env.DB.prepare('UPDATE shares SET imports = imports + 1 WHERE code = ? AND owner_id != ?').bind(code, user.id).run();
    return json({ ok: true });
  }
  if (method === 'PATCH') {
    const data = await body(request);
    await env.DB.prepare('UPDATE shares SET public = ? WHERE code = ? AND owner_id = ?').bind(data.public ? 1 : 0, code, user.id).run();
    return json({ ok: true });
  }
  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM shares WHERE code = ? AND owner_id = ?').bind(code, user.id).run();
    return json({ ok: true });
  }
  return json({ error: 'method not allowed' }, 405);
}

async function handleInbox(parts, method, request, env, user) {
  if (!parts[1]) {
    if (method === 'GET') {
      const rows = await env.DB.prepare(
        `SELECT i.id, i.title, i.message, i.words, i.word_count, i.created, u.display, u.username
         FROM inbox i JOIN users u ON u.id = i.from_id WHERE i.to_id = ? ORDER BY i.created DESC LIMIT 100`
      ).bind(user.id).all();
      return json({ items: rows.results.map(r => ({ ...r, words: JSON.parse(r.words), from: { display: r.display, username: r.username } })) });
    }
    if (method === 'POST') {
      const data = await body(request);
      const to = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(clip(data.to, 40).trim()).first();
      if (!to) return json({ error: 'משתמש לא נמצא' }, 404);
      if (to.id === user.id) return json({ error: 'אי אפשר לשלוח לעצמך' }, 400);
      const words = cleanWords(data.words);
      if (!words.length) return json({ error: 'אין מילים לשליחה' }, 400);
      const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM inbox WHERE to_id = ?').bind(to.id).first();
      if ((pending?.n || 0) >= 100) return json({ error: 'תיבת הדואר של המשתמש מלאה' }, 429);
      await env.DB.prepare(
        'INSERT INTO inbox (id, to_id, from_id, title, message, words, word_count, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(randHex(10), to.id, user.id, clip(data.title, 80).trim() || 'מילים בשבילך', clip(data.message, 300), JSON.stringify(words), words.length, Date.now()).run();
      return json({ ok: true });
    }
    return json({ error: 'method not allowed' }, 405);
  }
  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM inbox WHERE id = ? AND to_id = ?').bind(clip(parts[1], 40), user.id).run();
    return json({ ok: true });
  }
  return json({ error: 'method not allowed' }, 405);
}

export async function onRequest({ request, env, params }) {
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const route = parts.join('/');
  const method = request.method;
  const url = new URL(request.url);

  if (route === 'health') {
    return json({ ok: true, db: !!env.DB, ai: !!env.AI, inviteRequired: !!env.SIGNUP_CODE });
  }
  if (!env.DB) return json({ error: 'D1 binding missing' }, 503);

  try {
    if (route.startsWith('auth/') && method === 'POST') {
      const res = await handleAuth(route, request, env);
      if (res) return res;
    }

    const user = await currentUser(request, env);
    if (!user) return json({ error: 'unauthorized' }, 401);

    if (route === 'me') return json({ user: { id: user.id, username: user.username, display: user.display } });

    if (route === 'auth/logout' && method === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(user.token).run();
      return json({ ok: true });
    }

    if (route === 'state') {
      if (method === 'GET') {
        const row = await env.DB.prepare('SELECT data, updated_at FROM app_state WHERE id = ?').bind(user.id).first();
        return json(row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: 0 });
      }
      if (method === 'PUT') {
        const text = await request.text();
        if (text.length > MAX_STATE_BYTES) return json({ error: 'state too large' }, 413);
        let parsed;
        try { parsed = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.words)) return json({ error: 'bad state' }, 400);
        const now = Date.now();
        await env.DB.prepare(
          'INSERT INTO app_state (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
        ).bind(user.id, text, now).run();
        return json({ ok: true, updatedAt: now });
      }
      return json({ error: 'method not allowed' }, 405);
    }

    if (route === 'users' && method === 'GET') {
      const q = clip(url.searchParams.get('q') || '', 30).trim();
      if (q.length < 2) return json({ items: [] });
      const rows = await env.DB.prepare(
        'SELECT username, display FROM users WHERE (username LIKE ?1 OR display LIKE ?1) AND id != ?2 ORDER BY username LIMIT 10'
      ).bind(`%${q}%`, user.id).all();
      return json({ items: rows.results });
    }

    if (parts[0] === 'shares') return await handleShares(parts, method, request, env, user, url);
    if (parts[0] === 'inbox') return await handleInbox(parts, method, request, env, user);

    if (parts[0] === 'ai' && method === 'POST') {
      if (!(await aiAllowed(env, user.id))) return json({ error: 'הגעת למכסת ה-AI היומית' }, 429);
      return await handleAI(parts[1], await body(request), env);
    }

    return json({ error: 'not found' }, 404);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
}
