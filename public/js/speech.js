import { state, normText, lev } from './store.js';

const synth = window.speechSynthesis;
let voices = [];
function loadVoices() { voices = synth ? synth.getVoices() : []; }
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

export const canSpeak = !!synth;
export const englishVoices = () => voices.filter(v => /^en[-_]/i.test(v.lang));

function pickVoice() {
  const s = state.data.settings;
  const list = englishVoices();
  return list.find(v => v.voiceURI === s.voiceURI)
    || list.find(v => v.lang.replace('_', '-') === s.accent && /google|natural|enhanced|premium/i.test(v.name))
    || list.find(v => v.lang.replace('_', '-') === s.accent)
    || list[0] || null;
}

export function speak(text, { rate, lang } = {}) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = lang || v?.lang || state.data.settings.accent || 'en-US';
    u.rate = rate ?? state.data.settings.rate ?? 0.95;
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
    // Chrome לפעמים "נתקע" — ביטחון
    setTimeout(resolve, Math.max(4000, text.length * 120));
  });
}

export const speakSlow = (text) => speak(text, { rate: 0.6 });
export const stopSpeaking = () => synth && synth.cancel();

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!SR;

let active = null;
export function listen({ lang, timeout = 9000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('הדפדפן לא תומך בזיהוי דיבור. נסה Chrome.'));
    stopSpeaking();
    if (active) try { active.abort(); } catch {}
    const r = new SR();
    active = r;
    r.lang = lang || state.data.settings.accent || 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 5;
    r.continuous = false;
    let done = false;
    const t = setTimeout(() => { try { r.stop(); } catch {} }, timeout);
    r.onresult = (e) => {
      done = true; clearTimeout(t);
      const res = e.results[0];
      const alts = [...res].map(a => ({ text: a.transcript.trim(), conf: a.confidence }));
      resolve({ transcript: alts[0]?.text || '', alternatives: alts });
    };
    r.onerror = (e) => {
      clearTimeout(t);
      if (done) return;
      done = true;
      const msg = e.error === 'not-allowed' ? 'אין הרשאה למיקרופון' : e.error === 'no-speech' ? 'לא נשמע דיבור — נסה שוב' : 'שגיאת זיהוי: ' + e.error;
      reject(new Error(msg));
    };
    r.onend = () => { clearTimeout(t); active = null; if (!done) { done = true; resolve({ transcript: '', alternatives: [] }); } };
    r.start();
  });
}
export const stopListening = () => { if (active) try { active.stop(); } catch {} };

// ציון התאמה בין יעד לבין מה שנאמר (0-100) + פירוט מילים
export function scoreSpeech(target, alternatives) {
  const tw = normText(target).split(' ').filter(Boolean);
  let best = { score: 0, words: tw.map(w => ({ w, ok: false })), heard: alternatives[0]?.text || '' };
  for (const alt of alternatives) {
    const hw = normText(alt.text).split(' ').filter(Boolean);
    const used = new Set();
    const words = tw.map(w => {
      let idx = hw.findIndex((h, i) => !used.has(i) && (h === w || (w.length > 3 && lev(h, w) <= 1)));
      if (idx >= 0) used.add(idx);
      return { w, ok: idx >= 0 };
    });
    const matched = words.filter(x => x.ok).length;
    const extra = Math.max(0, hw.length - tw.length);
    const score = Math.max(0, Math.round((matched / Math.max(1, tw.length)) * 100 - extra * 5));
    if (score > best.score) best = { score, words, heard: alt.text };
  }
  return best;
}
