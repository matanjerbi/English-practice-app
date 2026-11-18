import { words, pickWeighted, gameAnswer, recordGame, shuffle, normText, lev, addXp, state } from '../store.js';
import { ai } from '../api.js';
import { esc, en, speakBtn, emptyState, loadingBtn, toast, beep } from '../ui.js';
import { speak, speakSlow } from '../speech.js';
import { runSession } from './games.js';

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findForm(ex, word) {
  if (!ex || !word) return null;
  const t = normText(word);
  if (t.includes(' ')) {
    const m = ex.match(new RegExp('\\b' + escRe(word.trim()).replace(/\s+/g, '\\s+') + '\\b', 'i'));
    return m ? { form: m[0], index: m.index } : null;
  }
  const stem = t.length > 4 ? t.slice(0, t.length - (t.endsWith('e') || t.endsWith('y') ? 1 : 2)) : t;
  const re = /[A-Za-z][A-Za-z'’-]*/g;
  let m;
  while ((m = re.exec(ex))) {
    const n = normText(m[0]);
    if (n === t || (n.startsWith(stem) && n.length - t.length <= 4 && n.length >= t.length - 2)) return { form: m[0], index: m.index };
  }
  return null;
}

const tokens = (s) => s.trim().split(/\s+/).filter(Boolean);
const cleanTok = (t) => normText(t);

// בונה משפט מאריחים (משותף ל-build ול-translate)
function tileBuilder(el, sentence, { extra = [], onDone }) {
  const target = tokens(sentence);
  let bank = shuffle([...target.map((t, i) => ({ t, k: 'a' + i })), ...extra.map((t, i) => ({ t, k: 'x' + i }))]);
  if (bank.map(b => b.t).join(' ') === sentence && bank.length > 2) bank = bank.reverse();
  const picked = [];
  const draw = () => {
    el.querySelector('.built').innerHTML = picked.length ? picked.map((p, i) => `<button class="tok on" data-p="${i}">${esc(p.t)}</button>`).join('') : '<span class="muted">לחץ על המילים לפי הסדר</span>';
    el.querySelector('.bank').innerHTML = bank.map((b, i) => `<button class="tok" data-b="${i}" ${picked.includes(b) ? 'disabled' : ''}>${esc(b.t)}</button>`).join('');
  };
  el.querySelector('.bank').onclick = (e) => { const b = e.target.closest('[data-b]'); if (b) { picked.push(bank[+b.dataset.b]); draw(); } };
  el.querySelector('.built').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { picked.splice(+b.dataset.p, 1); draw(); } };
  el.querySelector('#check').onclick = () => {
    if (!picked.length) return;
    const got = picked.map(p => cleanTok(p.t)).join(' ');
    const want = target.map(cleanTok).join(' ');
    const ok = got === want;
    el.querySelector('.built').classList.add(ok ? 'good' : 'bad');
    el.querySelector('#check').disabled = true;
    speak(sentence);
    onDone(ok, picked.map(p => p.t).join(' '));
  };
  el.querySelector('#clear').onclick = () => { picked.length = 0; draw(); };
  draw();
}

const SENTENCE = {
  build: { title: 'בניית משפט', filter: (w) => w.ex && tokens(w.ex).length >= 4 && tokens(w.ex).length <= 16, renderQ(el, w, pool, answer) {
    el.innerHTML = `<div class="prompt"><p class="muted">סדר את המילים למשפט נכון</p>${w.exHe ? `<p class="he small">${esc(w.exHe)}</p>` : ''}<p class="small">מילת המפתח: ${en(w.en)}</p></div>
      <div class="built" dir="ltr"></div><div class="bank" dir="ltr"></div>
      <div class="row gap-s"><button class="btn ghost" id="clear">נקה</button><button class="btn ghost" id="hear">🔊 רמז קולי</button><button class="btn primary grow" id="check">בדוק</button></div>`;
    el.querySelector('#hear').onclick = () => speakSlow(w.ex);
    tileBuilder(el, w.ex, { onDone: (ok, got) => answer(ok, { xp: 4, show: `${en(w.ex)} ${speakBtn(w.ex, 'sm')}${ok ? '' : `<br>בנית: <span dir="ltr">${esc(got)}</span>`}` }) });
  } },

  translate: { title: 'תרגום משפט', filter: (w) => w.ex && w.exHe && tokens(w.ex).length >= 4 && tokens(w.ex).length <= 16, renderQ(el, w, pool, answer) {
    const others = pool.filter(x => x.ex && x.id !== w.id).flatMap(x => tokens(x.ex));
    const tset = new Set(tokens(w.ex).map(cleanTok));
    const extra = shuffle(others.filter(t => !tset.has(cleanTok(t)))).slice(0, 3);
    el.innerHTML = `<div class="prompt"><p class="muted">תרגם לאנגלית</p><h3 class="he">${esc(w.exHe)}</h3></div>
      <div class="built" dir="ltr"></div><div class="bank" dir="ltr"></div>
      <div class="row gap-s"><button class="btn ghost" id="clear">נקה</button><button class="btn primary grow" id="check">בדוק</button></div>`;
    tileBuilder(el, w.ex, { extra, onDone: (ok, got) => answer(ok, { xp: 5, show: `${en(w.ex)} ${speakBtn(w.ex, 'sm')}${ok ? '' : `<br>בנית: <span dir="ltr">${esc(got)}</span>`}` }) });
  } },

  blank: { title: 'השלמת חסר', filter: (w) => !!findForm(w.ex, w.en), renderQ(el, w, pool, answer) {
    const f = findForm(w.ex, w.en);
    const before = w.ex.slice(0, f.index), after = w.ex.slice(f.index + f.form.length);
    const opts = shuffle([f.form, ...shuffle(pool.filter(x => x.id !== w.id && normText(x.en) !== normText(f.form))).slice(0, 3).map(x => x.en)]);
    el.innerHTML = `<div class="prompt"><p class="sentence" dir="ltr">${esc(before)}<span class="blank">_____</span>${esc(after)}</p>${w.exHe ? `<p class="muted small">${esc(w.exHe)}</p>` : ''}</div>
      <div class="opts">${opts.map((o, i) => `<button class="opt" dir="ltr" data-i="${i}">${esc(o)}</button>`).join('')}</div>`;
    let locked = false;
    el.querySelector('.opts').onclick = (e) => {
      const b = e.target.closest('.opt'); if (!b || locked) return;
      locked = true;
      const ok = opts[+b.dataset.i] === f.form;
      el.querySelectorAll('.opt').forEach((x, j) => { if (opts[j] === f.form) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      el.querySelector('.blank').textContent = f.form; el.querySelector('.blank').classList.add('filled');
      speak(w.ex);
      answer(ok, { xp: 3 });
    };
  } },

  dictation: { title: 'הכתבת משפטים', n: 6, filter: (w) => w.ex && tokens(w.ex).length <= 18, renderQ(el, w, pool, answer) {
    el.innerHTML = `<div class="prompt"><button class="big-play" id="pl">🔊</button><button class="btn sm ghost" id="sl">🐢 לאט</button><p class="muted">כתוב את המשפט ששמעת</p></div>
      <form class="type-form"><textarea id="ans" dir="ltr" rows="3" autocapitalize="sentences" spellcheck="false" placeholder="type the sentence..."></textarea>
      <button class="btn primary full">בדוק</button></form><div id="diff"></div>`;
    const inp = el.querySelector('#ans');
    el.querySelector('#pl').onclick = () => speak(w.ex);
    el.querySelector('#sl').onclick = () => speakSlow(w.ex);
    setTimeout(() => speak(w.ex), 300);
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      if (!inp.value.trim() || inp.disabled) return;
      inp.disabled = true;
      const want = tokens(w.ex), got = tokens(inp.value).map(cleanTok);
      const used = new Set();
      const marks = want.map(t => {
        const n = cleanTok(t);
        const i = got.findIndex((g, k) => !used.has(k) && (g === n || (n.length > 4 && lev(g, n) <= 1)));
        if (i >= 0) used.add(i);
        return { t, ok: i >= 0 };
      });
      const score = Math.round(marks.filter(m => m.ok).length / want.length * 100);
      el.querySelector('#diff').innerHTML = `<div class="card diff" dir="ltr">${marks.map(m => `<span class="${m.ok ? 'ok' : 'miss'}">${esc(m.t)}</span>`).join(' ')}</div><p class="center"><b>${score}%</b> ${w.exHe ? `· <span class="muted">${esc(w.exHe)}</span>` : ''}</p>`;
      answer(score >= 85, { xp: Math.round(score / 20) });
    };
  } },

  write: { title: 'כתוב משפט משלך', n: 5, minWords: 1, renderQ(el, w, pool, answer) {
    el.innerHTML = `<div class="prompt"><p class="muted">כתוב משפט באנגלית עם המילה</p><h2>${en(w.en)} ${speakBtn(w.en)}</h2><p class="he">${esc(w.he)}</p></div>
      <form class="type-form"><textarea id="ans" dir="ltr" rows="3" autocapitalize="sentences" placeholder="Write your own sentence..."></textarea>
      <div class="row gap-s"><button type="button" class="btn ghost" id="skip">דלג</button><button class="btn primary grow" id="chk">✨ בדוק עם AI</button></div></form><div id="res"></div>`;
    const inp = el.querySelector('#ans');
    setTimeout(() => inp.focus(), 50);
    el.querySelector('#skip').onclick = () => answer(false, { xp: 0, show: w.ex ? `דוגמה: ${en(w.ex)}` : '' });
    el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const sentence = inp.value.trim();
      if (!sentence) return;
      const btn = el.querySelector('#chk');
      loadingBtn(btn, true, 'בודק...');
      try {
        const r = await ai('check', { word: w.en, sentence });
        inp.disabled = true; btn.remove(); el.querySelector('#skip')?.remove();
        const score = Math.max(0, Math.min(100, +r.score || 0));
        el.querySelector('#res').innerHTML = `<div class="card ai-res">
          <div class="row between"><b>ציון: ${score}</b><span>${r.correct ? '✅ תקין דקדוקית' : '⚠️ יש מה לתקן'}${r.usedWord === false ? ' · המילה לא שומשה נכון' : ''}</span></div>
          ${r.corrected && normText(r.corrected) !== normText(sentence) ? `<p><small class="muted">מתוקן:</small><br>${en(r.corrected)} ${speakBtn(r.corrected, 'sm')}</p>` : ''}
          ${r.natural ? `<p><small class="muted">איך דובר שפת אם היה אומר:</small><br>${en(r.natural)} ${speakBtn(r.natural, 'sm')}</p>` : ''}
          ${(r.mistakes || []).length ? `<ul class="mist">${r.mistakes.map(m => `<li><s dir="ltr">${esc(m.wrong)}</s> ← <b dir="ltr">${esc(m.right)}</b> <span class="muted">${esc(m.whyHe)}</span></li>`).join('')}</ul>` : ''}
          ${r.feedbackHe ? `<p>${esc(r.feedbackHe)}</p>` : ''}</div>`;
        answer(score >= 70 && r.usedWord !== false, { xp: Math.round(score / 12) });
      } catch (ex) { toast(ex.message, 'err'); loadingBtn(btn, false); }
    };
  } },
};

// ---------- סיפור ----------
function storyView(root) {
  const pool = words();
  if (pool.length < 3) { root.innerHTML = emptyState('📖', 'אין מספיק מילים', 'צריך לפחות 3 מילים.', '<a class="btn primary" href="#/words?starter=1">📦 חבילות פתיחה</a>'); return; }
  const pickNew = () => pickWeighted(pool, Math.min(6, pool.length));
  let chosen = pickNew();
  const start = () => {
    root.innerHTML = `<div class="game"><div class="row between"><a href="#/practice" class="muted">✕</a><b>סיפור מהמילים שלי</b><span></span></div>
      <div class="card"><p>AI יכתוב סיפור קצר שמשלב את המילים:</p><div class="row wrap gap-s">${chosen.map(w => `<span class="chip" dir="ltr">${esc(w.en)}</span>`).join('')}</div>
      <div class="row gap-s" style="margin-top:12px"><button class="btn ghost" id="re">🔀 מילים אחרות</button><button class="btn primary grow" id="go">✨ כתוב סיפור</button></div></div></div>`;
    root.querySelector('#re').onclick = () => { chosen = pickNew(); start(); };
    root.querySelector('#go').onclick = async (e) => {
      loadingBtn(e.currentTarget, true, 'כותב...');
      try { show(await ai('story', { words: chosen.map(w => w.en) })); }
      catch (ex) { toast(ex.message, 'err'); loadingBtn(e.currentTarget, false); }
    };
  };
  const show = (s) => {
    let html = esc(s.story || '');
    for (const w of chosen) {
      html = html.replace(new RegExp('\\b(' + escRe(esc(w.en)).replace(/\s+/g, '\\s+') + '\\w*)', 'gi'), '<mark>$1</mark>');
    }
    const qs = Array.isArray(s.questions) ? s.questions : [];
    root.innerHTML = `<div class="game story">
      <div class="row between"><a href="#/practice" class="muted">✕</a><b>${esc(s.title || 'Story')}</b><span></span></div>
      <div class="row gap-s"><button class="btn" id="play">▶️ השמע</button><button class="btn ghost" id="slow">🐢 לאט</button><button class="btn ghost" id="tr">🇮🇱 תרגום</button></div>
      <div class="card story-text" dir="ltr">${html}</div>
      <div class="card he-text" hidden>${esc(s.storyHe || '')}</div>
      ${qs.length ? `<h3 class="section-title">שאלות הבנה</h3>${qs.map((q, i) => `<div class="card sq" data-q="${i}"><p dir="ltr"><b>${esc(q.q)}</b></p>
        <div class="opts">${(q.options || []).map((o, j) => `<button class="opt" dir="ltr" data-j="${j}">${esc(o)}</button>`).join('')}</div></div>`).join('')}` : ''}
      <div class="row gap-s center"><button class="btn primary" id="new">סיפור חדש</button></div></div>`;
    root.querySelector('#play').onclick = () => speak(s.story);
    root.querySelector('#slow').onclick = () => speak(s.story, { rate: 0.7 });
    root.querySelector('#tr').onclick = () => { const h = root.querySelector('.he-text'); h.hidden = !h.hidden; };
    root.querySelector('#new').onclick = () => { chosen = pickNew(); start(); };
    let ok = 0, answered = 0;
    root.querySelectorAll('.sq').forEach(card => card.onclick = (e) => {
      const b = e.target.closest('.opt'); if (!b || card.dataset.done) return;
      card.dataset.done = 1;
      const q = qs[+card.dataset.q];
      const right = +b.dataset.j === +q.answer;
      card.querySelectorAll('.opt').forEach((x, j) => { if (j === +q.answer) x.classList.add('right'); });
      if (!right) b.classList.add('wrong');
      beep(right); answered++; if (right) ok++;
      addXp(right ? 4 : 0, { ok: right ? 1 : 0, bad: right ? 0 : 1 });
      if (answered === qs.length) recordGame('story', Math.round(ok / qs.length * 100), ok, qs.length - ok);
    });
  };
  start();
}

export function render(root, id) {
  if (id === 'story') return storyView(root);
  const g = SENTENCE[id];
  if (!g) { location.hash = '#/practice'; return; }
  return runSession(root, { id, title: g.title, n: g.n || 8, filter: g.filter, minWords: g.minWords || 4, renderQ: g.renderQ });
}
