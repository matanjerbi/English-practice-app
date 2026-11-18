import { words, pickWeighted, gameAnswer, recordGame, judge, shuffle, firstMeaning, normText, addXp } from '../store.js';
import { esc, en, speakBtn, progress, emptyState, beep, vibrate } from '../ui.js';
import { speak, speakSlow } from '../speech.js';

// ---------- מנוע סשן משותף ----------
export function runSession(root, { id, title, n = 10, filter = () => true, minWords = 4, renderQ }) {
  const pool = words();
  const cands = pool.filter(filter);
  if (pool.length < minWords || !cands.length) {
    root.innerHTML = emptyState('🧐', 'אין מספיק מילים', cands.length ? `צריך לפחות ${minWords} מילים במאגר.` : 'אין מילים מתאימות למשחק הזה (למשל: חסרים משפטי דוגמה).',
      '<div class="row gap-s center"><a class="btn primary" href="#/words?starter=1">📦 חבילות פתיחה</a><a class="btn" href="#/practice">חזרה</a></div>');
    return;
  }
  const list = pickWeighted(cands, Math.min(n, cands.length));
  let i = 0, ok = 0, bad = 0, combo = 0, bestCombo = 0;
  const mistakes = [];
  let alive = true;

  const next = () => {
    if (!alive) return;
    if (i >= list.length) return end();
    const w = list[i];
    root.innerHTML = `
      <div class="game">
        <div class="row between"><a href="#/practice" class="muted">✕</a><b>${esc(title)}</b><span class="muted">${i + 1}/${list.length}${combo >= 3 ? ` · 🔥${combo}` : ''}</span></div>
        ${progress(i, list.length)}
        <div id="q"></div>
        <div id="fb"></div>
      </div>`;
    renderQ(root.querySelector('#q'), w, pool, answer);
  };

  const answer = (correct, { word, show, xp = 2, close = false } = {}) => {
    const w = word || list[i];
    gameAnswer(w.id, correct, xp + (combo >= 4 ? 1 : 0));
    correct ? (ok++, combo++, bestCombo = Math.max(bestCombo, combo)) : (bad++, combo = 0, mistakes.push(w));
    beep(correct); if (!correct) vibrate(80);
    const fb = root.querySelector('#fb');
    fb.innerHTML = `<div class="feedback ${correct ? 'ok' : 'bad'}">
      <div class="grow"><b>${correct ? (close ? 'כמעט מושלם! ✓' : ['מצוין!', 'נכון!', 'יפה מאוד!', 'בדיוק!'][Math.floor(Math.random() * 4)]) : 'לא נכון'}</b>
      <div>${en(w.en)} — ${esc(w.he)}</div>${show ? `<div class="small">${show}</div>` : ''}</div>
      ${speakBtn(w.en)}
      <button class="btn ${correct ? 'primary' : ''}" id="nx">המשך ←</button></div>`;
    const go = () => { i++; next(); };
    fb.querySelector('#nx').onclick = go;
    fb.querySelector('#nx').focus();
    if (correct) setTimeout(() => { if (alive && fb.isConnected && fb.querySelector('#nx')) go(); }, close ? 1800 : 1100);
  };

  const end = () => {
    const score = Math.round((ok / Math.max(1, ok + bad)) * 100);
    recordGame(id, score, ok, bad);
    if (score === 100) addXp(5);
    root.innerHTML = `
      <div class="finish">
        <div class="big-emoji">${score >= 90 ? '🏆' : score >= 70 ? '🎉' : score >= 50 ? '💪' : '📚'}</div>
        <h2>${score}%</h2>
        <p>${ok} נכונות · ${bad} טעויות${bestCombo >= 3 ? ` · רצף שיא ${bestCombo}` : ''}</p>
        ${mistakes.length ? `<div class="card mistakes"><b>לחזור על:</b>${[...new Map(mistakes.map(m => [m.id, m])).values()].map(m => `<div class="row between"><span>${en(m.en)} — ${esc(m.he)}</span>${speakBtn(m.en)}</div>`).join('')}</div>` : ''}
        <div class="row gap-s center wrap">
          <button class="btn primary" id="again">שחק שוב</button>
          <a class="btn" href="#/practice">משחקים אחרים</a>
        </div>
      </div>`;
    root.querySelector('#again').onclick = () => runSession(root, { id, title, n, filter, minWords, renderQ });
  };

  next();
  return () => { alive = false; };
}

function distractors(w, pool, k = 3, key = 'he') {
  const same = pool.filter(x => x.id !== w.id && x.pos && x.pos === w.pos && firstMeaning(x[key]) !== firstMeaning(w[key]));
  const rest = pool.filter(x => x.id !== w.id && !same.includes(x) && firstMeaning(x[key]) !== firstMeaning(w[key]));
  return [...shuffle(same).slice(0, 2), ...shuffle(rest)].slice(0, k);
}

function choices(el, opts, correctIdx, onPick) {
  el.innerHTML = opts.map((o, i) => `<button class="opt" data-i="${i}">${o}</button>`).join('');
  let locked = false;
  el.onclick = (e) => {
    const b = e.target.closest('.opt');
    if (!b || locked) return;
    locked = true;
    const i = +b.dataset.i;
    el.querySelectorAll('.opt').forEach((x, j) => { if (j === correctIdx) x.classList.add('right'); });
    if (i !== correctIdx) b.classList.add('wrong');
    onPick(i === correctIdx);
  };
}

// ---------- משחקים ----------
const GAMES = {
  choice: { title: 'בחירה מרובה', renderQ(el, w, pool, answer) {
    const toHe = Math.random() < 0.55;
    const ds = distractors(w, pool, 3, toHe ? 'he' : 'en');
    const all = shuffle([w, ...ds]);
    el.innerHTML = `<div class="prompt">${toHe ? `<h2 class="xl">${en(w.en)}</h2>${speakBtn(w.en)}<p class="muted">בחר את התרגום</p>` : `<h2 class="xl he">${esc(firstMeaning(w.he))}</h2><p class="muted">בחר את המילה באנגלית</p>`}</div><div class="opts"></div>`;
    if (toHe) speak(w.en);
    choices(el.querySelector('.opts'), all.map(x => toHe ? esc(firstMeaning(x.he)) : en(x.en)), all.indexOf(w), (c) => { if (!toHe) speak(w.en); answer(c); });
  } },

  listen: { title: 'מה שמעת?', renderQ(el, w, pool, answer) {
    const ds = distractors(w, pool, 3, 'he');
    const all = shuffle([w, ...ds]);
    el.innerHTML = `<div class="prompt"><button class="big-play" id="pl">🔊</button><button class="btn sm ghost" id="sl">🐢 לאט</button><p class="muted">מה פירוש המילה ששמעת?</p></div><div class="opts"></div>`;
    el.querySelector('#pl').onclick = () => speak(w.en);
    el.querySelector('#sl').onclick = () => speakSlow(w.en);
    setTimeout(() => speak(w.en), 250);
    choices(el.querySelector('.opts'), all.map(x => esc(firstMeaning(x.he))), all.indexOf(w), (c) => answer(c, { xp: 3 }));
  } },

  type: { title: 'כתיבה', renderQ(el, w, pool, answer) {
    let hints = 0;
    el.innerHTML = `<div class="prompt"><h2 class="xl he">${esc(w.he)}</h2>
      ${w.exHe ? `<p class="muted small">${esc(w.exHe)}</p>` : ''}
      <p class="hint" dir="ltr" id="hint"></p></div>
      <form class="type-form"><input id="ans" dir="ltr" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="type in English..." >
      <div class="row gap-s"><button type="button" class="btn ghost" id="h">💡 רמז</button><button type="button" class="btn ghost" id="skip">לא יודע</button><button class="btn primary grow">בדוק</button></div></form>`;
    const inp = el.querySelector('#ans');
    setTimeout(() => inp.focus(), 50);
    el.querySelector('#h').onclick = () => {
      hints++;
      el.querySelector('#hint').textContent = w.en.split('').map((c, i) => (i < hints || c === ' ') ? c : '_').join(' ');
      inp.focus();
    };
    el.querySelector('#skip').onclick = () => { inp.disabled = true; answer(false); speak(w.en); };
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      if (!inp.value.trim() || inp.disabled) return;
      const j = judge(inp.value, w.en);
      inp.disabled = true;
      inp.classList.add(j === 'wrong' ? 'bad' : 'good');
      speak(w.en);
      answer(j !== 'wrong', { close: j === 'close', xp: hints ? 2 : 4, show: j === 'close' ? `כתבת: <span dir="ltr">${esc(inp.value)}</span>` : j === 'wrong' ? `כתבת: <span dir="ltr">${esc(inp.value)}</span>` : '' });
    };
  } },

  spell: { title: 'הכתבת מילים', renderQ(el, w, pool, answer) {
    el.innerHTML = `<div class="prompt"><button class="big-play" id="pl">🔊</button><button class="btn sm ghost" id="sl">🐢 לאט</button><p class="muted">כתוב את המילה ששמעת</p></div>
      <form class="type-form"><input id="ans" dir="ltr" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="type what you hear...">
      <div class="row gap-s"><button type="button" class="btn ghost" id="h">💡 הצג תרגום</button><button class="btn primary grow">בדוק</button></div><p class="muted center" id="tr"></p></form>`;
    const inp = el.querySelector('#ans');
    el.querySelector('#pl').onclick = () => { speak(w.en); inp.focus(); };
    el.querySelector('#sl').onclick = () => { speakSlow(w.en); inp.focus(); };
    el.querySelector('#h').onclick = () => { el.querySelector('#tr').textContent = w.he; };
    setTimeout(() => { speak(w.en); inp.focus(); }, 250);
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      if (!inp.value.trim() || inp.disabled) return;
      const j = judge(inp.value, w.en);
      inp.disabled = true;
      answer(j !== 'wrong', { close: j === 'close', xp: 4, show: j !== 'exact' ? `כתבת: <span dir="ltr">${esc(inp.value)}</span>` : '' });
    };
  } },

  scramble: { title: 'אותיות מבולגנות', filter: (w) => /^[a-zA-Z]{3,12}$/.test(w.en), renderQ(el, w, pool, answer) {
    const target = w.en.toLowerCase();
    let letters = shuffle(target.split('').map((c, i) => ({ c, i })));
    if (letters.map(l => l.c).join('') === target) letters = letters.reverse();
    const picked = [];
    const draw = () => {
      el.innerHTML = `<div class="prompt"><h2 class="he">${esc(w.he)}</h2><p class="muted">סדר את האותיות</p></div>
        <div class="slots" dir="ltr">${target.split('').map((_, k) => `<span class="slot">${picked[k] ? picked[k].c : ''}</span>`).join('')}</div>
        <div class="tiles" dir="ltr">${letters.map((l, k) => `<button class="tile-l" data-k="${k}" ${picked.includes(l) ? 'disabled' : ''}>${l.c}</button>`).join('')}</div>
        <div class="row gap-s center"><button class="btn ghost" id="bk">⌫ מחק</button><button class="btn ghost" id="skip">דלג</button></div>`;
      el.querySelector('.tiles').onclick = (e) => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        picked.push(letters[+b.dataset.k]);
        if (picked.length === target.length) {
          const word = picked.map(p => p.c).join('');
          draw();
          el.querySelector('.slots').classList.add(word === target ? 'good' : 'bad');
          speak(w.en);
          return answer(word === target, { xp: 3, show: word !== target ? `סידרת: <span dir="ltr">${esc(word)}</span>` : '' });
        }
        draw();
      };
      el.querySelector('#bk').onclick = () => { picked.pop(); draw(); };
      el.querySelector('#skip').onclick = () => { speak(w.en); answer(false); };
    };
    draw();
  } },

  hangman: { title: 'איש תלוי', n: 5, filter: (w) => /^[a-zA-Z ]{3,16}$/.test(w.en), renderQ(el, w, pool, answer) {
    const target = w.en.toLowerCase();
    const guessed = new Set();
    let lives = 6;
    const draw = () => {
      const shown = target.split('').map(c => c === ' ' ? '  ' : guessed.has(c) ? c : '_').join(' ');
      const won = target.split('').every(c => c === ' ' || guessed.has(c));
      el.innerHTML = `<div class="prompt"><p class="he">${esc(w.he)}</p><div class="lives">${'❤️'.repeat(lives)}${'🤍'.repeat(6 - lives)}</div>
        <h2 class="hang" dir="ltr">${shown}</h2></div>
        <div class="kbd" dir="ltr">${'qwertyuiopasdfghjklzxcvbnm'.split('').map(c => `<button data-c="${c}" ${guessed.has(c) || won || !lives ? 'disabled' : ''} class="${guessed.has(c) ? (target.includes(c) ? 'hit' : 'miss') : ''}">${c}</button>`).join('')}</div>`;
      if (won || !lives) { speak(w.en); return answer(won, { xp: 4 }); }
      el.querySelector('.kbd').onclick = (e) => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        const c = b.dataset.c;
        guessed.add(c);
        if (!target.includes(c)) { lives--; vibrate(40); }
        draw();
      };
    };
    draw();
  } },
};

// ---------- התאמת זוגות ----------
function matchGame(root) {
  const pool = words();
  if (pool.length < 4) { root.innerHTML = emptyState('🃏', 'אין מספיק מילים', 'צריך לפחות 4 מילים.', '<a class="btn primary" href="#/words?starter=1">📦 חבילות פתיחה</a>'); return; }
  const set = pickWeighted(pool, Math.min(6, pool.length));
  const left = shuffle(set), right = shuffle(set);
  let sel = null, matched = 0, errors = 0;
  const t0 = Date.now();
  let timer;
  root.innerHTML = `<div class="game">
    <div class="row between"><a href="#/practice" class="muted">✕</a><b>התאמת זוגות</b><span id="tm" class="muted">0:00</span></div>
    <p class="muted center">לחץ על מילה ואז על התרגום שלה</p>
    <div class="match"><div class="col" dir="ltr">${left.map(w => `<button class="m-card" data-id="${w.id}" data-side="en">${esc(w.en)}</button>`).join('')}</div>
    <div class="col">${right.map(w => `<button class="m-card" data-id="${w.id}" data-side="he">${esc(firstMeaning(w.he))}</button>`).join('')}</div></div></div>`;
  timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); const el = root.querySelector('#tm'); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
  root.querySelector('.match').onclick = (e) => {
    const b = e.target.closest('.m-card');
    if (!b || b.classList.contains('done')) return;
    if (b.dataset.side === 'en') speak(b.textContent);
    if (!sel || sel.dataset.side === b.dataset.side) {
      root.querySelectorAll('.m-card.sel').forEach(x => x.classList.remove('sel'));
      sel = b; b.classList.add('sel'); return;
    }
    if (sel.dataset.id === b.dataset.id) {
      [sel, b].forEach(x => { x.classList.remove('sel'); x.classList.add('done'); });
      gameAnswer(b.dataset.id, true, 2); beep(true);
      matched++;
      if (matched === set.length) {
        clearInterval(timer);
        const secs = Math.round((Date.now() - t0) / 1000);
        const score = Math.max(0, 100 - errors * 10);
        recordGame('match', score, set.length, errors);
        setTimeout(() => {
          root.innerHTML = `<div class="finish"><div class="big-emoji">🃏</div><h2>${secs} שניות</h2><p>${errors} טעויות</p>
            <div class="row gap-s center"><button class="btn primary" id="again">שוב</button><a class="btn" href="#/practice">משחקים אחרים</a></div></div>`;
          root.querySelector('#again').onclick = () => matchGame(root);
        }, 500);
      }
    } else {
      errors++; beep(false); vibrate(60);
      const wrongId = sel.dataset.side === 'en' ? sel.dataset.id : b.dataset.id;
      gameAnswer(wrongId, false);
      [sel, b].forEach(x => { x.classList.add('shake'); setTimeout(() => x.classList.remove('shake', 'sel'), 450); });
    }
    sel = null;
  };
  return () => clearInterval(timer);
}

// ---------- ספרינט ----------
function speedGame(root) {
  const pool = words();
  if (pool.length < 4) { root.innerHTML = emptyState('⚡', 'אין מספיק מילים', 'צריך לפחות 4 מילים.', '<a class="btn primary" href="#/words?starter=1">📦 חבילות פתיחה</a>'); return; }
  root.innerHTML = `<div class="finish"><div class="big-emoji">⚡</div><h2>ספרינט 60 שניות</h2><p>מופיעה מילה ותרגום — האם התרגום נכון?<br>כל תשובה נכונה = נקודה. טעות = 3 שניות קנס.</p><button class="btn primary big" id="start">התחל!</button></div>`;
  let timer, alive = true;
  root.querySelector('#start').onclick = () => {
    let left = 60, score = 0, wrong = 0, cur;
    const end = () => {
      clearInterval(timer);
      const g = recordGame('speed', score, score, wrong);
      root.innerHTML = `<div class="finish"><div class="big-emoji">⚡</div><h2>${score} נקודות</h2><p>${wrong} טעויות</p>
        <div class="row gap-s center"><button class="btn primary" id="again">שוב</button><a class="btn" href="#/practice">משחקים אחרים</a></div></div>`;
      root.querySelector('#again').onclick = () => speedGame(root);
    };
    const nextQ = () => {
      const w = pickWeighted(pool, 1)[0];
      const truth = Math.random() < 0.5;
      const shownHe = truth ? firstMeaning(w.he) : firstMeaning(distractors(w, pool, 1)[0]?.he || w.he);
      cur = { w, truth: truth || shownHe === firstMeaning(w.he) };
      root.querySelector('#sq').innerHTML = `<h2 class="xl">${en(w.en)}</h2><p class="he big">= ${esc(shownHe)} ?</p>`;
    };
    root.innerHTML = `<div class="game speed"><div class="row between"><a href="#/practice" class="muted">✕</a><b id="sc">0</b><span id="tl" class="timer">60</span></div>
      <div class="prompt" id="sq"></div>
      <div class="tf"><button class="btn big bad" data-v="0">✗ לא נכון</button><button class="btn big good" data-v="1">✓ נכון</button></div></div>`;
    nextQ();
    timer = setInterval(() => {
      left--; const t = root.querySelector('#tl'); if (t) t.textContent = left;
      if (left <= 0 && alive) end();
    }, 1000);
    root.querySelector('.tf').onclick = (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const right = (b.dataset.v === '1') === cur.truth;
      gameAnswer(cur.w.id, right, 1);
      if (right) { score++; beep(true); } else { wrong++; left = Math.max(0, left - 3); beep(false); vibrate(60); }
      root.querySelector('#sc').textContent = score;
      root.querySelector('.prompt').classList.add(right ? 'flash-ok' : 'flash-bad');
      setTimeout(() => root.querySelector('.prompt')?.classList.remove('flash-ok', 'flash-bad'), 250);
      nextQ();
    };
  };
  const onKey = (e) => {
    if (e.key === 'ArrowRight') root.querySelector('[data-v="1"]')?.click();
    if (e.key === 'ArrowLeft') root.querySelector('[data-v="0"]')?.click();
  };
  document.addEventListener('keydown', onKey);
  return () => { alive = false; clearInterval(timer); document.removeEventListener('keydown', onKey); };
}

export function render(root, id) {
  if (id === 'match') return matchGame(root);
  if (id === 'speed') return speedGame(root);
  const g = GAMES[id];
  if (!g) { location.hash = '#/practice'; return; }
  return runSession(root, { id, title: g.title, n: g.n || 10, filter: g.filter, renderQ: g.renderQ });
}
