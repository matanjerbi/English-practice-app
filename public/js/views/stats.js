import { state, words, level, LEVEL_HE, today, streak } from '../store.js';
import { esc, en, speakBtn } from '../ui.js';
import { ACTIVITIES } from './practice.js';

export function render(root) {
  const all = words();
  const counts = { new: 0, learning: 0, known: 0, mastered: 0 };
  all.forEach(w => counts[level(w)]++);
  const log = state.data.log;
  const totals = Object.values(log).reduce((a, d) => ({ xp: a.xp + (d.xp || 0), ok: a.ok + (d.ok || 0), bad: a.bad + (d.bad || 0), rv: a.rv + (d.reviews || 0) }), { xp: 0, ok: 0, bad: 0, rv: 0 });
  const acc = totals.ok + totals.bad ? Math.round(totals.ok / (totals.ok + totals.bad) * 100) : 0;
  const activeDays = Object.values(log).filter(d => d.xp > 0).length;

  const days = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ k: today(d), d }); }
  const maxXp = Math.max(10, ...days.map(d => log[d.k]?.xp || 0));
  const goal = state.data.settings.dailyGoal;

  const hard = all.filter(w => w.st.bad > 0).sort((a, b) => (b.st.bad / (b.st.ok + b.st.bad + 1)) - (a.st.bad / (a.st.ok + a.st.bad + 1))).slice(0, 10);
  const names = Object.fromEntries(ACTIVITIES.flatMap(g => g.items).filter(a => a.id).map(a => [a.id, `${a.ico} ${a.t}`]));
  const games = Object.entries(state.data.games).sort((a, b) => b[1].played - a[1].played);
  const added30 = all.filter(w => w.c > Date.now() - 30 * 864e5).length;

  root.innerHTML = `<div class="stats">
    <a href="#/" class="muted">→ בית</a>
    <h1>סטטיסטיקה</h1>
    <div class="grid3">
      <div class="card stat"><b>${all.length}</b><span>מילים</span></div>
      <div class="card stat"><b>🔥 ${streak()}</b><span>רצף ימים</span></div>
      <div class="card stat"><b>${acc}%</b><span>דיוק כללי</span></div>
      <div class="card stat"><b>${totals.xp}</b><span>נקודות סה"כ</span></div>
      <div class="card stat"><b>${totals.rv}</b><span>חזרות</span></div>
      <div class="card stat"><b>${activeDays}</b><span>ימי תרגול</span></div>
    </div>

    <h3 class="section-title">התקדמות המאגר</h3>
    <div class="card">
      <div class="stackbar">${Object.entries(counts).map(([k, v]) => v ? `<i class="lv-${k}" style="flex:${v}" title="${LEVEL_HE[k]} ${v}"></i>` : '').join('')}</div>
      <div class="row wrap gap-s legend">${Object.entries(counts).map(([k, v]) => `<span><i class="dot lv-${k}"></i>${LEVEL_HE[k]}: ${v}</span>`).join('')}</div>
      <p class="muted small">${added30} מילים נוספו ב-30 הימים האחרונים</p>
    </div>

    <h3 class="section-title">נקודות ב-30 יום</h3>
    <div class="card chart30">
      <div class="bars">${days.map(d => { const v = log[d.k]?.xp || 0; return `<i class="${v >= goal ? 'full' : ''}" style="height:${Math.max(2, v / maxXp * 100)}%" title="${d.d.toLocaleDateString('he-IL')}: ${v}"></i>`; }).join('')}</div>
      <div class="row between muted small"><span>לפני 30 יום</span><span>היום</span></div>
    </div>

    ${games.length ? `<h3 class="section-title">משחקים</h3><div class="card">
      <table class="tbl"><tr><th>משחק</th><th>שוחק</th><th>שיא</th><th>דיוק</th></tr>
      ${games.map(([id, g]) => `<tr><td>${esc(names[id] || id)}</td><td>${g.played}</td><td>${g.best}</td><td>${g.ok + g.bad ? Math.round(g.ok / (g.ok + g.bad) * 100) + '%' : '—'}</td></tr>`).join('')}</table></div>` : ''}

    ${hard.length ? `<h3 class="section-title">המילים הכי קשות</h3><div class="card">
      ${hard.map(w => `<div class="row between word-mini"><span>${en(w.en)} — ${esc(w.he)}</span><span class="row gap-s"><small class="muted">${w.st.bad} טעויות</small>${speakBtn(w.en, 'sm')}</span></div>`).join('')}
      <a class="btn full" href="#/game/type">תרגל אותן בכתיבה</a></div>` : ''}
  </div>`;
}
