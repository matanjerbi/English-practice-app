import { state, words, pickWeighted, addXp } from '../store.js';
import { ai } from '../api.js';
import { esc, en, speakBtn, toast } from '../ui.js';
import { speak, listen, canListen, stopSpeaking } from '../speech.js';

const SCEN = [
  ['free', '💬', 'שיחה חופשית'],
  ['interview', '💼', 'ראיון עבודה בהייטק'],
  ['meeting', '🧑‍💻', 'ישיבת צוות'],
  ['smalltalk', '☕', 'סמול טוק במשרד'],
  ['restaurant', '🍽️', 'במסעדה'],
  ['travel', '🏨', 'מלון וטיול'],
  ['shopping', '🛒', 'בחנות'],
  ['doctor', '🩺', 'קביעת תור במרפאה'],
];

let convo = null; // { scenario, messages: [{role, content, he, correction, tip}] }
let autoSpeak = true;

export function render(root) {
  if (!convo) return pickScenario(root);
  drawChat(root);
}

function pickScenario(root) {
  root.innerHTML = `<div class="chat-pick">
    <h1>שיחה באנגלית</h1>
    <p class="muted">תרגול שיחה עם AI — בדיבור או בכתיבה. כל טעות תתוקן בעדינות, ואפשר לראות תרגום לכל הודעה.</p>
    <div class="scen">${SCEN.map(([k, i, t]) => `<button class="card scen-b" data-k="${k}"><span>${i}</span>${t}</button>`).join('')}</div>
  </div>`;
  root.querySelector('.scen').onclick = async (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    convo = { scenario: b.dataset.k, messages: [] };
    drawChat(root);
    await reply(root);
  };
}

function bubble(m, i) {
  if (m.role === 'user') {
    return `<div class="msg me"><div class="b" dir="ltr">${esc(m.content)}</div>
      ${m.correction ? `<div class="corr">✏️ ${en(m.correction)} ${speakBtn(m.correction, 'sm')}${m.tip ? `<br><small>${esc(m.tip)}</small>` : ''}</div>` : ''}</div>`;
  }
  return `<div class="msg ai"><div class="b" dir="ltr">${esc(m.content)}</div>
    <div class="row gap-s">${speakBtn(m.content, 'sm')}${m.he ? `<button class="link sm" data-tr="${i}">תרגום</button>` : ''}</div>
    <div class="tr" id="tr${i}" hidden>${esc(m.he || '')}</div></div>`;
}

function drawChat(root) {
  const sc = SCEN.find(s => s[0] === convo.scenario);
  root.innerHTML = `<div class="chat">
    <div class="row between chat-top">
      <button class="link" id="back">← תרחישים</button>
      <b>${sc[1]} ${sc[2]}</b>
      <label class="inline small"><input type="checkbox" id="as" ${autoSpeak ? 'checked' : ''}> הקראה</label>
    </div>
    <div class="msgs" id="msgs">${convo.messages.map(bubble).join('')}<div id="typing"></div></div>
    <form class="chat-in" id="f">
      ${canListen ? '<button type="button" class="mic sm" id="mic">🎤</button>' : ''}
      <input id="t" dir="ltr" autocomplete="off" placeholder="Type or press the mic...">
      <button class="btn primary" id="send">שלח</button>
    </form>
  </div>`;
  const msgs = root.querySelector('#msgs');
  msgs.scrollTop = msgs.scrollHeight;
  root.querySelector('#back').onclick = () => { convo = null; stopSpeaking(); pickScenario(root); };
  root.querySelector('#as').onchange = (e) => { autoSpeak = e.target.checked; };
  msgs.onclick = (e) => { const t = e.target.closest('[data-tr]'); if (t) { const el = root.querySelector('#tr' + t.dataset.tr); el.hidden = !el.hidden; } };
  const input = root.querySelector('#t');
  root.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    convo.messages.push({ role: 'user', content: text });
    drawChat(root);
    await reply(root);
  };
  const mic = root.querySelector('#mic');
  if (mic) mic.onclick = async () => {
    mic.classList.add('rec');
    try {
      const r = await listen({ timeout: 15000 });
      if (r.transcript) { input.value = r.transcript; root.querySelector('#f').requestSubmit(); }
    } catch (ex) { toast(ex.message, 'err'); }
    finally { mic.classList.remove('rec'); }
  };
}

async function reply(root) {
  const typing = root.querySelector('#typing');
  if (typing) typing.innerHTML = '<div class="msg ai"><div class="b typing"><i></i><i></i><i></i></div></div>';
  const msgs = root.querySelector('#msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  try {
    const vocab = pickWeighted(words(), 10).map(w => w.en);
    const r = await ai('chat', {
      scenario: convo.scenario, level: state.data.settings.level, vocab,
      messages: convo.messages.map(m => ({ role: m.role, content: m.content })),
    });
    const lastUser = [...convo.messages].reverse().find(m => m.role === 'user');
    if (lastUser && convo.messages[convo.messages.length - 1] === lastUser) {
      if (r.correction && r.correction.trim().toLowerCase() !== lastUser.content.trim().toLowerCase()) { lastUser.correction = r.correction; lastUser.tip = r.tipHe || ''; }
      addXp(lastUser.correction ? 2 : 4);
    }
    const text = String(r.reply || '').trim() || '...';
    convo.messages.push({ role: 'assistant', content: text, he: r.replyHe || '' });
    if (!convo || !location.hash.startsWith('#/chat')) return;
    drawChat(root);
    if (autoSpeak) speak(text);
  } catch (ex) {
    if (!location.hash.startsWith('#/chat')) return;
    const tp = root.querySelector('#typing'); if (tp) tp.innerHTML = '';
    toast(ex.message, 'err');
  }
}
