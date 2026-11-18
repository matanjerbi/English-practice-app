import { dueWords, newWords, review, getWord, words, shuffle } from '../store.js';
import { esc, en, speakBtn, progress, query, emptyState } from '../ui.js';
import { speak } from '../speech.js';

export function render(root) {
  const q = query();
  const wantNew = q.get('new') === '1';
  let queue = wantNew ? newWords().slice(0, 10) : dueWords().slice(0, 60);
  let mode = wantNew ? 'new' : 'due';
  if (!queue.length && !wantNew) {
    const fresh = newWords();
    root.innerHTML = emptyState('✅', 'אין מילים לחזרה כרגע', fresh.length
      ? `יש ${fresh.length} מילים חדשות שעוד לא למדת.` : words().length ? 'כל הכבוד! תחזור מאוחר יותר.' : 'הוסף מילים כדי להתחיל.',
      `<div class="row gap-s center wrap">
        ${fresh.length ? '<a class="btn primary" href="#/review?new=1">🌱 למד 10 מילים חדשות</a>' : ''}
        ${words().length ? '<a class="btn" href="#/review?all=1">🔀 חזרה חופשית על 20 מילים</a>' : '<a class="btn primary" href="#/words?add=1">➕ הוספת מילים</a>'}
      </div>`);
    if (q.get('all') !== '1') return;
  }
  if (q.get('all') === '1') { queue = shuffle(words()).slice(0, 20); mode = 'free'; }
  if (!queue.length) {
    root.innerHTML = emptyState('🌱', 'אין מילים חדשות', 'כל המילים כבר בתהליך למידה.', '<a class="btn" href="#/review">חזרה</a>');
    return;
  }

  const total = queue.length;
  let idx = 0, flipped = false, again = 0, good = 0;
  const reverse = () => Math.random() < 0.35 && mode !== 'new'; // לפעמים מעברית לאנגלית
  let rev = reverse();

  const draw = () => {
    if (idx >= queue.length) return finish();
    const w = getWord(queue[idx]?.id) || queue[idx];
    root.innerHTML = `
    <div class="review">
      <div class="row between"><a href="#/practice" class="muted">✕</a><span class="muted" dir="ltr">${Math.min(idx + 1, queue.length)}/${queue.length}</span></div>
      ${progress(idx, queue.length)}
      ${mode === 'new' ? '<p class="badge-new">🌱 מילה חדשה</p>' : ''}
      <div class="flash ${flipped ? 'flipped' : ''}" id="card">
        <div class="face front">
          ${rev ? `<p class="he xl">${esc(w.he)}</p><small class="muted">איך אומרים באנגלית?</small>`
                : `<h2 class="xl">${en(w.en)}</h2>${speakBtn(w.en)}<small class="muted">מה התרגום?</small>`}
        </div>
        <div class="face back">
          <h2>${en(w.en)} ${speakBtn(w.en)}</h2>
          ${w.pos ? `<small class="muted" dir="ltr">${esc(w.pos)}</small>` : ''}
          <p class="he big">${esc(w.he)}</p>
          ${w.ex ? `<div class="ex-box"><p>${en(w.ex)} ${speakBtn(w.ex, 'sm')}</p>${w.exHe ? `<p class="muted small">${esc(w.exHe)}</p>` : ''}</div>` : ''}
          ${w.note ? `<p class="note-txt">💡 ${esc(w.note)}</p>` : ''}
        </div>
      </div>
      ${flipped ? `
        <div class="grades">
          <button class="g g0" data-g="0">שכחתי<small>שוב עוד מעט</small></button>
          <button class="g g1" data-g="1">קשה</button>
          <button class="g g2" data-g="2">ידעתי</button>
          <button class="g g3" data-g="3">קל!</button>
        </div>` : `<button class="btn primary big full" id="flip">הצג תשובה</button>`}
    </div>`;
    if (!flipped && !rev) speak(w.en);
    root.querySelector('#card').onclick = (e) => { if (!e.target.closest('[data-speak]') && !flipped) { flipped = true; draw(); if (rev) speak(w.en); } };
    root.querySelector('#flip')?.addEventListener('click', () => { flipped = true; draw(); if (rev) speak(w.en); });
    root.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const g = +b.dataset.g;
      review(w.id, g);
      if (g === 0) { again++; queue.push(w); } else good++;
      idx++; flipped = false; rev = reverse();
      draw();
    });
  };

  const onKey = (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!flipped) { flipped = true; draw(); } }
    if (flipped && ['1', '2', '3', '4'].includes(e.key)) root.querySelector(`[data-g="${+e.key - 1}"]`)?.click();
  };
  document.addEventListener('keydown', onKey);

  const finish = () => {
    root.innerHTML = `
    <div class="finish">
      <div class="big-emoji">🎉</div>
      <h2>סיימת ${total} מילים!</h2>
      <p>${good} ידעת · ${again} חזרו לתרגול</p>
      <div class="row gap-s center wrap">
        <a class="btn primary" href="#/practice">להמשיך לתרגל</a>
        <a class="btn" href="#/">לדף הבית</a>
      </div>
    </div>`;
  };

  draw();
  return () => document.removeEventListener('keydown', onKey);
}
