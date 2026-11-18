import { state, words, addMany, getWord, persist, LEVEL_HE, level } from '../store.js';
import { api, session } from '../api.js';
import { esc, en, speakBtn, toast, modal, confirmBox, loadingBtn, query, go, fmtDate, emptyState } from '../ui.js';

const TABS = [['library', '🌍 ספרייה'], ['inbox', '📬 קיבלתי'], ['create', '➕ שיתוף'], ['mine', '📦 שלי']];
let tab = 'library';

const linkFor = (code) => `${location.origin}/#/s/${code}`;

export function render(root) {
  const q = query();
  if (q.get('tab')) tab = q.get('tab');
  root.innerHTML = `<div class="share">
    <h1>שיתוף מילים</h1>
    <form class="code-form" id="cf"><input id="code" placeholder="יש לך קוד? הקלד כאן" maxlength="8" dir="ltr" autocapitalize="characters"><button class="btn">פתח</button></form>
    <div class="tabs">${TABS.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}</div>
    <div id="tab"></div>
  </div>`;
  root.querySelector('#cf').onsubmit = (e) => { e.preventDefault(); const c = root.querySelector('#code').value.trim().toUpperCase(); if (c) go('/s/' + c); };
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; history.replaceState(null, '', '#/share'); render(root); });
  const el = root.querySelector('#tab');
  ({ library, inbox, create, mine })[tab]?.(el, () => render(root));
}

// ---------- ספרייה ציבורית ----------
async function library(el) {
  el.innerHTML = `<input type="search" id="lq" placeholder="🔍 חיפוש חבילות"><div id="ll"><p class="muted center pad">טוען...</p></div>`;
  const load = async (q = '') => {
    try {
      const r = await api('shares?public=1' + (q ? '&q=' + encodeURIComponent(q) : ''));
      const ll = el.querySelector('#ll'); if (!ll) return;
      ll.innerHTML = r.items.length ? r.items.map(packCard).join('') :
        emptyState('🌍', 'הספרייה עוד ריקה', 'היה הראשון לשתף חבילה ציבורית! סמן "ציבורי" כשאתה יוצר שיתוף.');
    } catch (ex) { el.querySelector('#ll').innerHTML = `<p class="err">${esc(ex.message)}</p>`; }
  };
  let t;
  el.querySelector('#lq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value.trim()), 350); };
  el.onclick = (e) => { const c = e.target.closest('[data-code]'); if (c) go('/s/' + c.dataset.code); };
  load();
}

const packCard = (p) => `<button class="card pack-card" data-code="${esc(p.code)}">
  <div class="grow"><b>${esc(p.title)}</b>${p.description ? `<small>${esc(p.description)}</small>` : ''}
  <small class="muted">${p.word_count} מילים · מאת ${esc(p.display)} · ${p.imports} ייבאו</small></div>
  ${state.data.imported['share:' + p.code] ? '<span class="pill">✓ יובא</span>' : '<span class="pill">פתח</span>'}</button>`;

// ---------- תיבת דואר ----------
async function inbox(el, rerender) {
  el.innerHTML = `<p class="muted center pad">טוען...</p>`;
  try {
    const r = await api('inbox');
    if (!r.items.length) { el.innerHTML = emptyState('📬', 'אין הודעות', 'כשחבר ישלח לך מילים, הן יופיעו כאן. שתף אותו בשם המשתמש שלך: ' + (session.user?.username || '')); return; }
    el.innerHTML = r.items.map(i => `<div class="card pack-card">
      <div class="grow"><b>${esc(i.title)}</b>${i.message ? `<small>"${esc(i.message)}"</small>` : ''}
      <small class="muted">${i.word_count} מילים · מאת ${esc(i.from.display)} (@${esc(i.from.username)}) · ${fmtDate(i.created)}</small></div>
      <div class="col gap-s">
        ${state.data.imported['inbox:' + i.id] ? '<span class="pill">✓ יובא</span>' : `<button class="btn sm primary" data-open="${i.id}">צפה וייבא</button>`}
        <button class="btn sm ghost" data-del="${i.id}">🗑️</button>
      </div></div>`).join('');
    el.onclick = async (e) => {
      const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
      if (o) {
        const it = r.items.find(x => x.id === o.dataset.open);
        preview({ title: it.title, words: it.words, owner: it.from, description: it.message }, 'inbox:' + it.id, rerender);
      }
      if (d) { await api('inbox/' + d.dataset.del, { method: 'DELETE' }); rerender(); }
    };
  } catch (ex) { el.innerHTML = `<p class="err">${esc(ex.message)}</p>`; }
}

// ---------- יצירת שיתוף ----------
function create(el, rerender) {
  let pre = [];
  try { pre = JSON.parse(sessionStorage.getItem('ep_share_ids') || '[]'); } catch {}
  const all = words();
  if (!all.length) { el.innerHTML = emptyState('📚', 'אין מילים לשתף', 'הוסף קודם מילים למאגר.', '<a class="btn primary" href="#/words?add=1">➕ הוספת מילה</a>'); return; }
  const tags = [...new Set(all.flatMap(w => w.tags))].sort();
  let sel = new Set(pre.filter(id => getWord(id)));
  if (!sel.size) sel = new Set(all.map(w => w.id));

  const draw = () => {
    el.innerHTML = `<div class="card form">
      <label>כותרת<input id="tt" maxlength="80" placeholder="למשל: מילים לראיון עבודה" value="${esc(el.dataset.title || '')}"></label>
      <label>תיאור (אופציונלי)<input id="ds" maxlength="300" value="${esc(el.dataset.desc || '')}"></label>
      <div class="row wrap gap-s">
        <span class="muted small">בחירה מהירה:</span>
        <button class="chip" data-q="all">הכול (${all.length})</button>
        <button class="chip" data-q="none">נקה</button>
        <button class="chip" data-q="star">⭐ מסומנות</button>
        ${tags.map(t => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <details><summary><b id="cnt">${sel.size}</b> מילים נבחרו — לחץ לבחירה ידנית</summary>
        <div class="pick-list">${all.map(w => `<label class="inline pick"><input type="checkbox" data-id="${w.id}" ${sel.has(w.id) ? 'checked' : ''}> <span dir="ltr">${esc(w.en)}</span> — ${esc(w.he)}</label>`).join('')}</div>
      </details>
      <label class="inline"><input type="checkbox" id="pub"> 🌍 ציבורי — יופיע בספרייה לכל המשתמשים</label>
      <div class="row gap-s wrap">
        <button class="btn primary grow" id="mk">🔗 צור קישור וקוד</button>
        <button class="btn grow" id="send">📨 שלח למשתמש</button>
      </div>
    </div><div id="out"></div>`;
    const sync = () => { el.dataset.title = el.querySelector('#tt').value; el.dataset.desc = el.querySelector('#ds').value; };
    el.querySelectorAll('[data-q],[data-tag]').forEach(b => b.onclick = () => {
      sync();
      const q = b.dataset.q, t = b.dataset.tag;
      if (q === 'all') sel = new Set(all.map(w => w.id));
      else if (q === 'none') sel = new Set();
      else if (q === 'star') sel = new Set(all.filter(w => w.star).map(w => w.id));
      else if (t) { sel = new Set(all.filter(w => w.tags.includes(t)).map(w => w.id)); if (!el.dataset.title) el.dataset.title = t; }
      draw();
    });
    el.querySelector('.pick-list').onchange = (e) => {
      const id = e.target.dataset.id; if (!id) return;
      e.target.checked ? sel.add(id) : sel.delete(id);
      el.querySelector('#cnt').textContent = sel.size;
    };
    const payload = () => ({
      title: el.querySelector('#tt').value.trim() || 'חבילת מילים',
      description: el.querySelector('#ds').value.trim(),
      public: el.querySelector('#pub').checked,
      words: [...sel].map(getWord).filter(Boolean).map(w => ({ en: w.en, he: w.he, ex: w.ex, exHe: w.exHe, pos: w.pos, note: w.note, tags: w.tags })),
    });
    el.querySelector('#mk').onclick = async (e) => {
      if (!sel.size) return toast('לא נבחרו מילים');
      loadingBtn(e.currentTarget, true);
      try {
        const r = await api('shares', { method: 'POST', body: payload() });
        sessionStorage.removeItem('ep_share_ids');
        showLink(r.code, payload().title);
      } catch (ex) { toast(ex.message, 'err'); }
      finally { loadingBtn(e.currentTarget, false); }
    };
    el.querySelector('#send').onclick = () => {
      if (!sel.size) return toast('לא נבחרו מילים');
      sendDialog(payload());
    };
  };
  draw();
}

export function showLink(code, title) {
  const link = linkFor(code);
  modal(`<h2>החבילה מוכנה 🎉</h2>
    <p>כל מי שיש לו את הקוד או הקישור יכול לייבא את המילים:</p>
    <div class="code-big" dir="ltr">${esc(code)}</div>
    <input readonly value="${esc(link)}" dir="ltr" id="lnk">
    <div class="row gap-s wrap">
      <button class="btn primary grow" id="cp">📋 העתק קישור</button>
      ${navigator.share ? '<button class="btn grow" id="sh">📤 שתף</button>' : ''}
      <a class="btn grow" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`בוא לתרגל איתי אנגלית! חבילת מילים "${title}": ${link}`)}">וואטסאפ</a>
    </div>`, {
    onMount: (m) => {
      m.querySelector('#cp').onclick = async () => {
        try { await navigator.clipboard.writeText(link); toast('הועתק'); } catch { m.querySelector('#lnk').select(); }
      };
      m.querySelector('#sh')?.addEventListener('click', () => navigator.share({ title: 'WordUp', text: `חבילת מילים: ${title}`, url: link }).catch(() => {}));
    },
  });
}

function sendDialog(payload) {
  modal(`<h2>📨 שליחה למשתמש</h2>
    <label>שם משתמש של החבר<input id="to" dir="ltr" autocomplete="off" placeholder="username"></label>
    <div id="sug" class="sug"></div>
    <label>הודעה (אופציונלי)<input id="msg" maxlength="300" placeholder="בהצלחה בתרגול!"></label>
    <p class="muted small">${payload.words.length} מילים · "${esc(payload.title)}"</p>
    <div class="row end"><button class="btn primary" id="go">שלח</button></div>`, {
    onMount: (m, close) => {
      const to = m.querySelector('#to'), sug = m.querySelector('#sug');
      let t;
      to.oninput = () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const q = to.value.trim();
          if (q.length < 2) { sug.innerHTML = ''; return; }
          try {
            const r = await api('users?q=' + encodeURIComponent(q));
            sug.innerHTML = r.items.map(u => `<button class="chip" data-u="${esc(u.username)}">${esc(u.display)} <span dir="ltr">@${esc(u.username)}</span></button>`).join('');
          } catch {}
        }, 300);
      };
      sug.onclick = (e) => { const b = e.target.closest('[data-u]'); if (b) { to.value = b.dataset.u; sug.innerHTML = ''; } };
      m.querySelector('#go').onclick = async (e) => {
        if (!to.value.trim()) return toast('הכנס שם משתמש');
        loadingBtn(e.currentTarget, true);
        try {
          await api('inbox', { method: 'POST', body: { ...payload, to: to.value.trim(), message: m.querySelector('#msg').value.trim() } });
          toast('נשלח ✓'); sessionStorage.removeItem('ep_share_ids'); close();
        } catch (ex) { toast(ex.message, 'err'); loadingBtn(e.currentTarget, false); }
      };
      setTimeout(() => to.focus(), 50);
    },
  });
}

// ---------- השיתופים שלי ----------
async function mine(el, rerender) {
  el.innerHTML = `<p class="muted center pad">טוען...</p>`;
  try {
    const r = await api('shares');
    if (!r.items.length) { el.innerHTML = emptyState('📦', 'עוד לא שיתפת', 'צור חבילה מהמילים שלך ושלח לחברים.', '<button class="btn primary" id="mk">➕ שיתוף חדש</button>'); el.querySelector('#mk').onclick = () => { tab = 'create'; rerender(); }; return; }
    el.innerHTML = `<p class="muted small">שם המשתמש שלך לקבלת מילים: <b dir="ltr">@${esc(session.user?.username || '')}</b></p>` + r.items.map(p => `<div class="card pack-card">
      <div class="grow"><b>${esc(p.title)}</b><small class="muted">קוד <b dir="ltr">${esc(p.code)}</b> · ${p.word_count} מילים · ${p.imports} ייבאו · ${fmtDate(p.created)}</small></div>
      <div class="col gap-s">
        <button class="btn sm" data-link="${esc(p.code)}" data-title="${esc(p.title)}">🔗</button>
        <button class="btn sm ghost" data-pub="${esc(p.code)}" data-v="${p.public ? 0 : 1}">${p.public ? '🌍 ציבורי' : '🔒 פרטי'}</button>
        <button class="btn sm ghost" data-del="${esc(p.code)}">🗑️</button>
      </div></div>`).join('');
    el.onclick = async (e) => {
      const l = e.target.closest('[data-link]'), p = e.target.closest('[data-pub]'), d = e.target.closest('[data-del]');
      if (l) showLink(l.dataset.link, l.dataset.title);
      if (p) { await api('shares/' + p.dataset.pub, { method: 'PATCH', body: { public: p.dataset.v === '1' } }); rerender(); }
      if (d && await confirmBox('למחוק את השיתוף? מי שכבר ייבא ישמור את המילים.', { ok: 'מחק', danger: true })) {
        await api('shares/' + d.dataset.del, { method: 'DELETE' }); rerender();
      }
    };
  } catch (ex) { el.innerHTML = `<p class="err">${esc(ex.message)}</p>`; }
}

// ---------- תצוגה מקדימה וייבוא ----------
function preview(pack, key, done) {
  const existing = new Set(words().map(w => w.en.toLowerCase()));
  const list = pack.words;
  const newCount = list.filter(w => !existing.has(w.en.toLowerCase())).length;
  modal(`<h2>${esc(pack.title)}</h2>
    ${pack.description ? `<p>${esc(pack.description)}</p>` : ''}
    <p class="muted small">${list.length} מילים${pack.owner ? ` · מאת ${esc(pack.owner.display)}` : ''} · ${newCount} חדשות בשבילך</p>
    <div class="pick-list">${list.map((w, i) => `<label class="inline pick ${existing.has(w.en.toLowerCase()) ? 'have' : ''}"><input type="checkbox" data-i="${i}" ${existing.has(w.en.toLowerCase()) ? 'disabled' : 'checked'}>
      <span class="grow"><span dir="ltr"><b>${esc(w.en)}</b></span> — ${esc(w.he)}${existing.has(w.en.toLowerCase()) ? ' <small class="muted">(כבר יש)</small>' : ''}</span>${speakBtn(w.en, 'sm')}</label>`).join('')}</div>
    <label>תגית למילים המיובאות<input id="tg" value="${esc(pack.title)}"></label>
    <div class="row end gap-s">${state.data.imported[key] ? '<span class="pill">כבר ייבאת את החבילה</span>' : ''}<button class="btn primary" id="imp" ${newCount ? '' : 'disabled'}>⬇️ ייבא ${newCount} מילים</button></div>`, {
    wide: true,
    onMount: (m, close) => {
      const btn = m.querySelector('#imp');
      m.querySelector('.pick-list').onchange = () => {
        const n = m.querySelectorAll('.pick-list input:checked').length;
        btn.textContent = `⬇️ ייבא ${n} מילים`; btn.disabled = !n;
      };
      btn.onclick = async () => {
        const tag = m.querySelector('#tg').value.trim();
        const chosen = [...m.querySelectorAll('.pick-list input:checked')].map(c => list[+c.dataset.i]);
        const src = pack.owner ? `${pack.owner.display} (@${pack.owner.username})` : 'שיתוף';
        const r = addMany(chosen.map(w => ({ ...w, tags: [...new Set([...(w.tags || []).filter(t => t !== pack.title), ...(tag ? [tag] : [])])] })), src);
        state.data.imported[key] = Date.now(); persist();
        if (key.startsWith('share:')) api('shares/' + key.slice(6) + '/imported', { method: 'POST' }).catch(() => {});
        toast(`יובאו ${r.added} מילים 🎉`);
        close(); done?.();
      };
    },
  });
}

export async function renderCode(root, code) {
  code = code.toUpperCase();
  root.innerHTML = `<p class="muted center pad">טוען חבילה ${esc(code)}...</p>`;
  try {
    const p = await api('shares/' + code);
    root.innerHTML = `<div class="share">
      <a href="#/share" class="muted">→ שיתוף</a>
      <div class="card pack-hero">
        <div class="big-emoji">📦</div>
        <h2>${esc(p.title)}</h2>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
        <p class="muted">${p.wordCount} מילים · מאת ${esc(p.owner.display)} · ${p.imports} ייבאו</p>
        ${p.mine ? '<p class="pill">זו חבילה שלך</p>' : ''}
        <div class="row gap-s center wrap">
          <button class="btn primary big" id="imp">צפה וייבא</button>
          <button class="btn" id="lnk">🔗 שתף הלאה</button>
        </div>
      </div>
      <div class="card">${p.words.slice(0, 12).map(w => `<div class="row between"><span>${en(w.en)} — ${esc(w.he)}</span>${speakBtn(w.en, 'sm')}</div>`).join('')}${p.words.length > 12 ? `<p class="muted">ועוד ${p.words.length - 12}...</p>` : ''}</div>
    </div>`;
    root.querySelector('#imp').onclick = () => preview(p, 'share:' + p.code, () => go('/words'));
    root.querySelector('#lnk').onclick = () => showLink(p.code, p.title);
  } catch (ex) {
    root.innerHTML = emptyState('🤷', 'החבילה לא נמצאה', ex.message, '<a class="btn" href="#/share">לשיתוף</a>');
  }
}
