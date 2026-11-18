import { judge } from '../store.js';
import { esc, en, speakBtn, query, toast } from '../ui.js';
import { speak, speakSlow, listen, scoreSpeech, canListen } from '../speech.js';
import { runSession } from './games.js';

function micUI(el, { target, onResult, tries = 3, hearText }) {
  let attempt = 0, best = 0;
  el.innerHTML += `<div class="mic-area">
      <button class="mic" id="mic" aria-label="הקלט">🎤</button>
      <p class="muted" id="mst">לחץ ודבר</p>
      <div id="heard"></div>
      <div class="row gap-s center"><button class="btn ghost" id="giveup">דלג</button></div>
    </div>`;
  const mic = el.querySelector('#mic'), st = el.querySelector('#mst'), heard = el.querySelector('#heard');
  let finished = false;
  const finish = (ok, score) => { if (finished) return; finished = true; mic.disabled = true; el.querySelector('#giveup')?.remove(); onResult(ok, score); };
  el.querySelector('#giveup').onclick = () => finish(false, best);
  mic.onclick = async () => {
    if (finished) return;
    mic.classList.add('rec'); st.textContent = 'מקשיב...';
    try {
      const r = await listen();
      mic.classList.remove('rec');
      if (!r.transcript) { st.textContent = 'לא נשמע כלום — נסה שוב'; return; }
      attempt++;
      const res = hearText(r);
      best = Math.max(best, res.score);
      heard.innerHTML = res.html;
      if (res.score >= 80) { st.textContent = 'מעולה! 🎉'; finish(true, res.score); }
      else if (attempt >= tries) { st.textContent = 'נמשיך הלאה'; finish(false, best); }
      else st.textContent = `ניסיון ${attempt}/${tries} — נסה שוב`;
    } catch (e) {
      mic.classList.remove('rec');
      st.textContent = e.message;
    }
  };
}

const SPEAK = {
  say: { title: 'הגיית מילים', renderQ(el, w, pool, answer) {
    el.innerHTML = `<div class="prompt"><h2 class="xl">${en(w.en)}</h2><p class="he">${esc(w.he)}</p>
      <div class="row gap-s center">${speakBtn(w.en)}<button class="btn sm ghost" data-speak="${esc(w.en)}" data-rate="0.6">🐢 לאט</button></div>
      <p class="muted small">שמע, ואז לחץ על המיקרופון ואמור את המילה</p></div>`;
    setTimeout(() => speak(w.en), 250);
    micUI(el, {
      target: w.en,
      hearText: (r) => {
        const s = scoreSpeech(w.en, r.alternatives);
        return { score: s.score, html: `<p>שמעתי: <b dir="ltr">${esc(s.heard)}</b> · ${s.score}%</p>` };
      },
      onResult: (ok, score) => answer(ok, { xp: ok ? 4 : 0, show: `ציון הגייה: ${score}%` }),
    });
  } },

  shadow: { title: 'חיקוי משפטים', n: 6, filter: (w) => !!w.ex, renderQ(el, w, pool, answer) {
    el.innerHTML = `<div class="prompt"><p class="sentence" dir="ltr">${esc(w.ex)}</p>${w.exHe ? `<p class="muted small">${esc(w.exHe)}</p>` : ''}
      <div class="row gap-s center"><button class="btn" id="pl">🔊 השמע</button><button class="btn ghost" id="sl">🐢 לאט</button></div>
      <p class="muted small">שמע את המשפט וחזור עליו בקול, באותו קצב ואינטונציה</p></div>`;
    el.querySelector('#pl').onclick = () => speak(w.ex);
    el.querySelector('#sl').onclick = () => speakSlow(w.ex);
    setTimeout(() => speak(w.ex), 300);
    micUI(el, {
      target: w.ex,
      hearText: (r) => {
        const s = scoreSpeech(w.ex, r.alternatives);
        return { score: s.score, html: `<div class="card diff" dir="ltr">${s.words.map(x => `<span class="${x.ok ? 'ok' : 'miss'}">${esc(x.w)}</span>`).join(' ')}</div><p class="center">${s.score}% · שמעתי: <span dir="ltr">${esc(s.heard)}</span></p>` };
      },
      onResult: (ok, score) => answer(ok, { xp: Math.round(score / 15), show: `${score}%` }),
    });
  } },

  answer: { title: 'תרגם בקול', renderQ(el, w, pool, answer) {
    el.innerHTML = `<div class="prompt"><h2 class="xl he">${esc(w.he)}</h2><p class="muted small">אמור את המילה באנגלית</p></div>`;
    micUI(el, {
      target: w.en, tries: 2,
      hearText: (r) => {
        const hit = r.alternatives.find(a => judge(a.text, w.en) !== 'wrong' || a.text.toLowerCase().split(/\s+/).some(t => judge(t, w.en) === 'exact'));
        return { score: hit ? 100 : 0, html: `<p>שמעתי: <b dir="ltr">${esc(r.transcript)}</b></p>` };
      },
      onResult: (ok) => { speak(w.en); answer(ok, { xp: ok ? 5 : 0 }); },
    });
  } },
};

export function render(root, id) {
  const g = SPEAK[id];
  if (!g) { location.hash = '#/practice'; return; }
  if (!canListen) toast('זיהוי דיבור לא נתמך בדפדפן הזה — נסה Chrome', 'err');
  const only = query().get('id');
  return runSession(root, {
    id, title: g.title, n: only ? 1 : g.n || 8, minWords: only ? 1 : 2,
    filter: only ? (w) => w.id === only : g.filter, renderQ: g.renderQ,
  });
}
