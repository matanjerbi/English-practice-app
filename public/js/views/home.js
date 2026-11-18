import { state, words, dueWords, newWords, todayXp, streak, level, pickWeighted, today } from '../store.js';
import { session, api } from '../api.js';
import { esc, en, speakBtn, go } from '../ui.js';

export function render(root) {
  const all = words();
  const goal = state.data.settings.dailyGoal || 60;
  const xp = todayXp();
  const pct = Math.min(100, Math.round((xp / goal) * 100));
  const due = dueWords().length;
  const fresh = newWords().length;
  const counts = { new: 0, learning: 0, known: 0, mastered: 0 };
  all.forEach(w => counts[level(w)]++);
  const wotd = all.length ? pickWeighted(all, 1, w => w.ex)[0] || all[0] : null;
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 18 ? 'צהריים טובים' : 'ערב טוב';

  // 7 ימים אחרונים
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ k: today(d), l: d.toLocaleDateString('he-IL', { weekday: 'narrow' }) }); }
  const maxXp = Math.max(goal, ...days.map(d => state.data.log[d.k]?.xp || 0));

  root.innerHTML = `
  <div class="home">
    <div class="row between">
      <div>
        <h1 class="hello">${hello}, ${esc(session.user?.display || '')} 👋</h1>
        <p class="muted">${all.length ? `יש לך ${all.length} מילים במאגר` : 'בוא נתחיל לבנות את מאגר המילים שלך'}</p>
      </div>
      <div class="row gap-s">
        <a class="icon-btn" href="#/stats" title="סטטיסטיקה">📊</a>
        <a class="icon-btn" href="#/settings" title="הגדרות">⚙️</a>
      </div>
    </div>

    <div class="card goal">
      <div class="ring" style="--p:${pct}"><div><b>${xp}</b><small>/${goal}</small></div></div>
      <div class="grow">
        <h3>${pct >= 100 ? 'השלמת את היעד היומי! 🎉' : 'היעד היומי'}</h3>
        <p class="muted">🔥 רצף של ${streak()} ימים</p>
        <div class="week">${days.map(d => {
          const v = state.data.log[d.k]?.xp || 0;
          return `<div class="bar ${v >= goal ? 'full' : ''}" title="${v}"><i style="height:${Math.max(4, (v / maxXp) * 100)}%"></i><span>${d.l}</span></div>`;
        }).join('')}</div>
      </div>
    </div>

    <div id="inbox-note"></div>

    ${all.length === 0 ? `
      <div class="card cta">
        <h3>מתחילים 🚀</h3>
        <p>הוסף מילים משלך, טען חבילת פתיחה מוכנה, או ייבא חבילה שחבר שיתף איתך.</p>
        <div class="row wrap gap-s">
          <a class="btn primary" href="#/words?add=1">➕ הוספת מילה</a>
          <a class="btn" href="#/words?starter=1">📦 חבילות פתיחה</a>
          <a class="btn" href="#/share">🤝 מילים מחברים</a>
        </div>
      </div>` : `
      <div class="grid2">
        <a class="card tile ${due ? 'hot' : ''}" href="#/review">
          <div class="tile-ico">🔁</div><b>${due}</b><span>לחזרה עכשיו</span>
        </a>
        <a class="card tile" href="#/review?new=1">
          <div class="tile-ico">🌱</div><b>${fresh}</b><span>מילים חדשות ללמוד</span>
        </a>
      </div>

      <div class="card levels">
        ${['new', 'learning', 'known', 'mastered'].map(k => `<div class="lv lv-${k}"><b>${counts[k]}</b><span>${{ new: 'חדשות', learning: 'בלמידה', known: 'מוכרות', mastered: 'שלוטות' }[k]}</span></div>`).join('')}
      </div>

      ${wotd ? `
      <div class="card wotd">
        <div class="row between"><small class="muted">מילה לתרגול</small>${speakBtn(wotd.en)}</div>
        <h2>${en(wotd.en)}</h2>
        <p class="he">${esc(wotd.he)}</p>
        ${wotd.ex ? `<p class="ex">${en(wotd.ex)} ${speakBtn(wotd.ex, 'sm')}</p>` : ''}
      </div>` : ''}

      <h3 class="section-title">תרגול מהיר</h3>
      <div class="quick">
        <a href="#/game/choice" class="q"><span>🎯</span>בחירה</a>
        <a href="#/game/listen" class="q"><span>👂</span>שמיעה</a>
        <a href="#/speak/say" class="q"><span>🎤</span>הגייה</a>
        <a href="#/sentence/build" class="q"><span>🧩</span>משפטים</a>
        <a href="#/game/match" class="q"><span>🃏</span>התאמה</a>
        <a href="#/chat" class="q"><span>💬</span>שיחה</a>
      </div>
    `}
  </div>`;

  api('inbox').then(r => {
    const n = (r.items || []).filter(i => !state.data.imported['inbox:' + i.id]).length;
    if (n) root.querySelector('#inbox-note').innerHTML =
      `<a class="card note" href="#/share?tab=inbox">📬 קיבלת ${n} ${n === 1 ? 'חבילת מילים' : 'חבילות מילים'} מחברים — לחץ לצפייה</a>`;
  }).catch(() => {});
}
