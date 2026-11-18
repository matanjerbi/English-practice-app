import { words, dueWords, state } from '../store.js';
import { canListen, canSpeak } from '../speech.js';
import { esc } from '../ui.js';

export const ACTIVITIES = [
  { group: 'חזרה חכמה', items: [
    { href: '#/review', ico: '🔁', t: 'חזרה מרווחת', d: 'כרטיסיות עם אלגוריתם שזוכר מתי לחזור על כל מילה', badge: () => dueWords().length || '' },
    { href: '#/review?new=1', ico: '🌱', t: 'מילים חדשות', d: 'למד 10 מילים שעוד לא תרגלת' },
  ] },
  { group: 'משחקי מילים', items: [
    { href: '#/game/choice', ico: '🎯', t: 'בחירה מרובה', d: 'אנגלית ↔ עברית, 4 אפשרויות', id: 'choice' },
    { href: '#/game/type', ico: '⌨️', t: 'כתיבה', d: 'רואים עברית — כותבים באנגלית', id: 'type' },
    { href: '#/game/match', ico: '🃏', t: 'התאמת זוגות', d: 'חבר מילים לתרגומים נגד השעון', id: 'match' },
    { href: '#/game/scramble', ico: '🔤', t: 'אותיות מבולגנות', d: 'סדר את האותיות למילה הנכונה', id: 'scramble' },
    { href: '#/game/speed', ico: '⚡', t: 'ספרינט 60 שניות', d: 'נכון או לא נכון — כמה שיותר מהר', id: 'speed' },
    { href: '#/game/hangman', ico: '🪢', t: 'איש תלוי', d: 'נחש את המילה אות אחרי אות', id: 'hangman' },
  ] },
  { group: 'שמיעה', items: [
    { href: '#/game/listen', ico: '👂', t: 'מה שמעת?', d: 'שומעים מילה — בוחרים את הפירוש', id: 'listen', need: 'speak' },
    { href: '#/game/spell', ico: '✍️', t: 'הכתבת מילים', d: 'שומעים מילה — כותבים אותה', id: 'spell', need: 'speak' },
    { href: '#/sentence/dictation', ico: '📝', t: 'הכתבת משפטים', d: 'שומעים משפט שלם וכותבים אותו', id: 'dictation', need: 'speak' },
    { href: '#/sentence/story', ico: '📖', t: 'סיפור מהמילים שלי', d: 'AI כותב סיפור קצר עם המילים שלך + שאלות הבנה', id: 'story' },
  ] },
  { group: 'משפטים', items: [
    { href: '#/sentence/build', ico: '🧩', t: 'בניית משפט', d: 'סדר את המילים למשפט נכון', id: 'build' },
    { href: '#/sentence/blank', ico: '🕳️', t: 'השלמת חסר', d: 'איזו מילה חסרה במשפט?', id: 'blank' },
    { href: '#/sentence/translate', ico: '🔄', t: 'תרגום משפט', d: 'רואים משפט בעברית — בונים אותו באנגלית', id: 'translate' },
    { href: '#/sentence/write', ico: '✏️', t: 'כתוב משפט משלך', d: 'כתוב משפט עם מילה — AI בודק ומתקן', id: 'write' },
  ] },
  { group: 'דיבור', items: [
    { href: '#/speak/say', ico: '🎤', t: 'הגיית מילים', d: 'אמור את המילה — קבל ציון הגייה', id: 'say', need: 'listen' },
    { href: '#/speak/shadow', ico: '🗣️', t: 'חיקוי משפטים (Shadowing)', d: 'שמע משפט וחזור עליו בקול', id: 'shadow', need: 'listen' },
    { href: '#/speak/answer', ico: '🎙️', t: 'תרגם בקול', d: 'רואים עברית — אומרים באנגלית', id: 'answer', need: 'listen' },
    { href: '#/chat', ico: '💬', t: 'שיחה עם AI', d: 'שיחה קולית בתרחישים: ראיון עבודה, מסעדה, טיול...' },
  ] },
];

export function render(root) {
  const n = words().length;
  const withEx = words().filter(w => w.ex).length;
  root.innerHTML = `
  <div class="practice">
    <h1>תרגול</h1>
    ${n < 4 ? `<div class="card note">צריך לפחות 4 מילים במאגר כדי לשחק. <a href="#/words?starter=1">טען חבילת פתיחה</a></div>` : ''}
    ${n >= 4 && withEx < 3 ? `<div class="card note">למשחקי המשפטים צריך משפטי דוגמה. <a href="#/words">במסך המילים ← ⋯ ← "השלמת משפטי דוגמה"</a></div>` : ''}
    ${!canListen ? `<div class="card note muted">זיהוי דיבור לא נתמך בדפדפן הזה — לתרגילי דיבור השתמש ב-Chrome.</div>` : ''}
    ${ACTIVITIES.map(g => `
      <h3 class="section-title">${esc(g.group)}</h3>
      <div class="acts">
        ${g.items.map(a => {
          const disabled = (a.need === 'listen' && !canListen) || (a.need === 'speak' && !canSpeak);
          const best = a.id && state.data.games[a.id]?.best;
          const badge = a.badge?.();
          return `<a class="act ${disabled ? 'disabled' : ''}" href="${disabled ? '#/practice' : a.href}">
            <span class="act-ico">${a.ico}</span>
            <span class="grow"><b>${esc(a.t)}</b><small>${esc(a.d)}</small></span>
            ${badge ? `<span class="pill warn">${badge}</span>` : best ? `<span class="pill">🏆 ${best}</span>` : ''}
          </a>`;
        }).join('')}
      </div>`).join('')}
  </div>`;
}
