import { state, setSettings, merge, replaceData, persist } from '../store.js';
import { session, syncNow, syncStatus } from '../api.js';
import { esc, toast, confirmBox } from '../ui.js';
import { englishVoices, speak, canSpeak, canListen } from '../speech.js';

export function render(root) {
  const s = state.data.settings;
  const voices = englishVoices();
  root.innerHTML = `<div class="settings">
    <a href="#/" class="muted">→ בית</a>
    <h1>הגדרות</h1>

    <div class="card">
      <h3>👤 ${esc(session.user?.display || '')}</h3>
      <p class="muted">שם משתמש: <b dir="ltr">@${esc(session.user?.username || '')}</b> — חברים יכולים לשלוח לך מילים לפי השם הזה</p>
      <p class="muted small">סנכרון: ${syncStatus.state === 'ok' ? 'מסונכרן ✓' : syncStatus.state === 'error' ? 'שגיאה — ' + esc(syncStatus.error) : syncStatus.state}</p>
      <div class="row gap-s wrap"><button class="btn" id="sync">☁️ סנכרן עכשיו</button><button class="btn danger" id="out">יציאה</button></div>
    </div>

    <div class="card form">
      <h3>🔊 קול והגייה</h3>
      ${!canSpeak ? '<p class="err">הדפדפן לא תומך בהקראה</p>' : ''}
      ${!canListen ? '<p class="muted small">זיהוי דיבור לא נתמך בדפדפן הזה (מומלץ Chrome)</p>' : ''}
      <label>מבטא
        <select id="accent">
          ${[['en-US', 'אמריקאי 🇺🇸'], ['en-GB', 'בריטי 🇬🇧'], ['en-AU', 'אוסטרלי 🇦🇺']].map(([v, t]) => `<option value="${v}" ${s.accent === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
      <label>קול
        <select id="voice"><option value="">אוטומטי</option>${voices.map(v => `<option value="${esc(v.voiceURI)}" ${s.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select></label>
      <label>מהירות דיבור: <b id="rv">${s.rate}</b><input type="range" id="rate" min="0.5" max="1.3" step="0.05" value="${s.rate}"></label>
      <button class="btn" id="test">▶️ בדיקה</button>
    </div>

    <div class="card form">
      <h3>🎯 תרגול</h3>
      <label>יעד נקודות יומי<select id="goal">${[30, 60, 100, 150, 250].map(g => `<option ${s.dailyGoal === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label>הרמה שלי (לשיחה עם AI)<select id="level">
        ${[['beginner', 'מתחיל'], ['intermediate', 'בינוני'], ['advanced', 'מתקדם']].map(([v, t]) => `<option value="${v}" ${s.level === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>ערכת צבעים<select id="theme">
        ${[['auto', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']].map(([v, t]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>

    <div class="card">
      <h3>📲 אפליקציה</h3>
      <button class="btn primary" onclick="installApp()">התקן כאפליקציה במכשיר</button>
    </div>

    <div class="card">
      <h3>💾 גיבוי</h3>
      <div class="row gap-s wrap">
        <button class="btn" id="exp">⬇️ ייצוא JSON</button>
        <button class="btn" id="csv">⬇️ ייצוא CSV</button>
        <label class="btn">⬆️ שחזור מגיבוי<input type="file" id="imp" accept=".json,application/json" hidden></label>
      </div>
    </div>
  </div>`;

  const $ = (id) => root.querySelector('#' + id);
  $('sync').onclick = async () => { await syncNow(); toast(syncStatus.state === 'ok' ? 'מסונכרן ✓' : syncStatus.error, syncStatus.state === 'ok' ? '' : 'err'); render(root); };
  $('out').onclick = async () => { if (await confirmBox('לצאת מהחשבון? הנתונים שמורים בענן.', { ok: 'יציאה' })) { await syncNow(); window.logout(); } };
  $('accent').onchange = (e) => setSettings({ accent: e.target.value, voiceURI: '' });
  $('voice').onchange = (e) => setSettings({ voiceURI: e.target.value });
  $('rate').oninput = (e) => { $('rv').textContent = e.target.value; };
  $('rate').onchange = (e) => setSettings({ rate: +e.target.value });
  $('test').onclick = () => speak('Hello! This is how I sound. Practice makes perfect.');
  $('goal').onchange = (e) => setSettings({ dailyGoal: +e.target.value });
  $('level').onchange = (e) => setSettings({ level: e.target.value });
  $('theme').onchange = (e) => setSettings({ theme: e.target.value });

  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('exp').onclick = () => download(`wordup-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state.data), 'application/json');
  $('csv').onclick = () => {
    const q = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const rows = [['english', 'hebrew', 'example', 'example_he', 'pos', 'tags'], ...state.data.words.filter(w => !w.del).map(w => [w.en, w.he, w.ex, w.exHe, w.pos, w.tags.join('|')])];
    download('wordup-words.csv', '﻿' + rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
  };
  $('imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.words)) throw new Error('קובץ לא תקין');
      if (!(await confirmBox(`למזג ${data.words.length} מילים מהגיבוי לתוך המאגר הנוכחי?`, { ok: 'מזג' }))) return;
      replaceData(merge(state.data, data)); persist();
      toast('שוחזר ✓');
    } catch (ex) { toast(ex.message, 'err'); }
  };
}
