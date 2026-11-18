import { state, words, addWord, addMany, updateWord, deleteWord, level, LEVEL_HE, getWord } from '../store.js';
import { ai } from '../api.js';
import { esc, en, speakBtn, toast, modal, confirmBox, loadingBtn, query, go, relDue, emptyState } from '../ui.js';
import { STARTER_PACKS } from '../starter.js';

let filters = { q: '', level: '', tag: '', sort: 'new', star: false };
let selecting = false;
let selected = new Set();

export function render(root) {
  const q = query();
  root.innerHTML = `
  <div class="words-page">
    <div class="row between">
      <h1>המילים שלי</h1>
      <div class="row gap-s">
        <button class="btn primary" id="add">➕ מילה</button>
        <button class="icon-btn" id="more" title="עוד">⋯</button>
      </div>
    </div>
    <div class="filters">
      <input type="search" id="q" placeholder="🔍 חיפוש באנגלית או בעברית" value="${esc(filters.q)}">
      <div class="row gap-s wrap">
        <select id="lv"><option value="">כל הרמות</option>${Object.entries(LEVEL_HE).map(([k, v]) => `<option value="${k}" ${filters.level === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select id="tag"><option value="">כל התגיות</option>${allTags().map(t => `<option ${filters.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select id="sort">
          <option value="new" ${filters.sort === 'new' ? 'selected' : ''}>חדשות קודם</option>
          <option value="az" ${filters.sort === 'az' ? 'selected' : ''}>א-ב (אנגלית)</option>
          <option value="weak" ${filters.sort === 'weak' ? 'selected' : ''}>הכי קשות</option>
          <option value="due" ${filters.sort === 'due' ? 'selected' : ''}>לפי מועד חזרה</option>
        </select>
        <button class="chip ${filters.star ? 'on' : ''}" id="star">⭐ מסומנות</button>
      </div>
    </div>
    <div class="selbar" ${selecting ? '' : 'hidden'}>
      <span id="selcount">${selected.size} נבחרו</span>
      <button class="btn sm" id="selall">בחר הכול</button>
      <button class="btn sm primary" id="selshare">🤝 שתף</button>
      <button class="btn sm danger" id="seldel">🗑️ מחק</button>
      <button class="btn sm ghost" id="selcancel">ביטול</button>
    </div>
    <div id="list"></div>
  </div>`;

  const list = root.querySelector('#list');
  const draw = () => {
    const items = filtered();
    if (!words().length) {
      list.innerHTML = emptyState('📚', 'המאגר ריק', 'הוסף את המילה הראשונה שלך, או טען חבילת פתיחה.',
        `<div class="row gap-s center"><button class="btn primary" data-act="add">➕ הוספת מילה</button><button class="btn" data-act="starter">📦 חבילות פתיחה</button></div>`);
      return;
    }
    if (!items.length) { list.innerHTML = `<p class="muted center pad">לא נמצאו מילים</p>`; return; }
    list.innerHTML = `<p class="muted small">${items.length} מילים</p>` + items.slice(0, 400).map(w => `
      <div class="word-row ${selected.has(w.id) ? 'sel' : ''}" data-id="${w.id}">
        ${selecting ? `<span class="check">${selected.has(w.id) ? '☑' : '☐'}</span>` : ''}
        <div class="grow">
          <div class="w-en">${en(w.en)} ${w.star ? '<span class="star">⭐</span>' : ''}</div>
          <div class="w-he">${esc(w.he)}</div>
        </div>
        <span class="lvl lv-${level(w)}">${LEVEL_HE[level(w)]}</span>
        ${speakBtn(w.en)}
      </div>`).join('') + (items.length > 400 ? `<p class="muted center">מוצגות 400 הראשונות — השתמש בחיפוש</p>` : '');
  };
  draw();

  const rerender = () => render(root);
  root.querySelector('#q').oninput = (e) => { filters.q = e.target.value; draw(); };
  root.querySelector('#lv').onchange = (e) => { filters.level = e.target.value; draw(); };
  root.querySelector('#tag').onchange = (e) => { filters.tag = e.target.value; draw(); };
  root.querySelector('#sort').onchange = (e) => { filters.sort = e.target.value; draw(); };
  root.querySelector('#star').onclick = () => { filters.star = !filters.star; rerender(); };
  root.querySelector('#add').onclick = () => openEditor(null, rerender);
  root.querySelector('#more').onclick = () => moreMenu(rerender);

  list.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add') return openEditor(null, rerender);
    if (act === 'starter') return openStarter(rerender);
    const row = e.target.closest('.word-row');
    if (!row) return;
    if (selecting) {
      const id = row.dataset.id;
      selected.has(id) ? selected.delete(id) : selected.add(id);
      row.classList.toggle('sel');
      const c = row.querySelector('.check'); if (c) c.textContent = selected.has(id) ? '☑' : '☐';
      root.querySelector('#selcount').textContent = `${selected.size} נבחרו`;
    } else openDetail(row.dataset.id, rerender);
  };

  const endSel = () => { selecting = false; selected = new Set(); rerender(); };
  root.querySelector('#selcancel').onclick = endSel;
  root.querySelector('#selall').onclick = () => { filtered().forEach(w => selected.add(w.id)); rerender(); };
  root.querySelector('#selshare').onclick = () => {
    if (!selected.size) return toast('לא נבחרו מילים');
    sessionStorage.setItem('ep_share_ids', JSON.stringify([...selected]));
    selecting = false; selected = new Set();
    go('/share?tab=create');
  };
  root.querySelector('#seldel').onclick = async () => {
    if (!selected.size) return;
    if (!(await confirmBox(`למחוק ${selected.size} מילים?`, { ok: 'מחק', danger: true }))) return;
    selected.forEach(id => deleteWord(id));
    toast('נמחק'); endSel();
  };

  if (q.get('add')) { history.replaceState(null, '', '#/words'); openEditor(null, rerender); }
  if (q.get('starter')) { history.replaceState(null, '', '#/words'); openStarter(rerender); }
}

function allTags() {
  const s = new Set();
  words().forEach(w => w.tags.forEach(t => s.add(t)));
  return [...s].sort();
}

function filtered() {
  const q = filters.q.trim().toLowerCase();
  let items = words().filter(w =>
    (!q || w.en.toLowerCase().includes(q) || w.he.includes(q) || w.tags.some(t => t.includes(q))) &&
    (!filters.level || level(w) === filters.level) &&
    (!filters.tag || w.tags.includes(filters.tag)) &&
    (!filters.star || w.star));
  const sorters = {
    new: (a, b) => b.c - a.c,
    az: (a, b) => a.en.localeCompare(b.en),
    weak: (a, b) => (b.st.bad - b.st.ok * 0.3) - (a.st.bad - a.st.ok * 0.3),
    due: (a, b) => (a.srs.r ? a.srs.d : Infinity) - (b.srs.r ? b.srs.d : Infinity),
  };
  return items.sort(sorters[filters.sort]);
}

function moreMenu(done) {
  modal(`<h2>פעולות</h2>
    <div class="menu">
      <button data-a="starter">📦 חבילות פתיחה מוכנות</button>
      <button data-a="bulk">📋 ייבוא רשימה (הדבקה)</button>
      <button data-a="select">☑️ בחירה מרובה (שיתוף / מחיקה)</button>
      <button data-a="examples">✨ השלמת משפטי דוגמה עם AI</button>
      <button data-a="share">🤝 שיתוף וחבילות מחברים</button>
    </div>`, {
    onMount: (m, close) => m.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      close();
      if (a === 'starter') openStarter(done);
      if (a === 'bulk') openBulk(done);
      if (a === 'select') { selecting = true; done(); }
      if (a === 'examples') fillExamples(done);
      if (a === 'share') go('/share');
    },
  });
}

export function openEditor(id, done, preset = {}) {
  const w = id ? getWord(id) : null;
  const v = w || { en: '', he: '', ex: '', exHe: '', pos: '', note: '', tags: [], ...preset };
  modal(`
    <h2>${w ? 'עריכת מילה' : 'מילה חדשה'}</h2>
    <form class="form" id="wf">
      <label>באנגלית<div class="row gap-s"><input name="en" dir="ltr" value="${esc(v.en)}" required autocomplete="off" autocapitalize="none" placeholder="e.g. reliable" class="grow"><button type="button" class="btn sm" id="ai-en" title="השלם הכול עם AI">✨ השלם</button></div></label>
      <label>תרגום לעברית<div class="row gap-s"><input name="he" value="${esc(v.he)}" required autocomplete="off" placeholder="למשל: אמין" class="grow"><button type="button" class="btn sm" id="ai-he" title="תרגם מעברית לאנגלית">✨ לאנגלית</button></div></label>
      <label>משפט לדוגמה (אנגלית)<textarea name="ex" dir="ltr" rows="2">${esc(v.ex)}</textarea></label>
      <label>תרגום המשפט<textarea name="exHe" rows="2">${esc(v.exHe)}</textarea></label>
      <div class="row gap-s">
        <label class="grow">חלק דיבר<input name="pos" dir="ltr" value="${esc(v.pos)}" placeholder="noun / verb..."></label>
        <label class="grow">תגיות (מופרדות בפסיק)<input name="tags" value="${esc(v.tags.join(', '))}" placeholder="עבודה, טיול"></label>
      </div>
      <label>הערה<input name="note" value="${esc(v.note)}"></label>
      <div class="row end gap-s">
        ${w ? '' : '<label class="inline"><input type="checkbox" name="again" checked> הוסף עוד אחרי שמירה</label>'}
        <button class="btn primary" type="submit">שמור</button>
      </div>
    </form>`, {
    onMount: (m, close) => {
      const f = m.querySelector('#wf');
      const fill = (r) => {
        for (const k of ['en', 'he', 'ex', 'exHe', 'pos', 'note']) if (r[k] && (!f[k].value || k !== 'en')) f[k].value = r[k];
      };
      m.querySelector('#ai-en').onclick = async (e) => {
        const word = f.en.value.trim();
        if (!word) return toast('כתוב קודם מילה באנגלית');
        loadingBtn(e.currentTarget, true);
        try { const r = await ai('enrich', { word }); fill({ ...r, en: r.en || word }); if (r.en) f.en.value = r.en; }
        catch (ex) { toast(ex.message, 'err'); }
        finally { loadingBtn(e.currentTarget, false); }
      };
      m.querySelector('#ai-he').onclick = async (e) => {
        const text = f.he.value.trim();
        if (!text) return toast('כתוב קודם מילה בעברית');
        loadingBtn(e.currentTarget, true);
        try { const r = await ai('translate', { text }); if (r.en) f.en.value = r.en; fill(r); }
        catch (ex) { toast(ex.message, 'err'); }
        finally { loadingBtn(e.currentTarget, false); }
      };
      f.onsubmit = (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        const fields = {
          en: data.en.trim(), he: data.he.trim(), ex: data.ex.trim(), exHe: data.exHe.trim(),
          pos: data.pos.trim(), note: data.note.trim(),
          tags: data.tags.split(',').map(t => t.trim()).filter(Boolean),
        };
        if (w) { updateWord(w.id, fields); toast('נשמר'); close(); done?.(); return; }
        const r = addWord(fields);
        if (r?.dup) { toast('המילה כבר קיימת במאגר', 'err'); return; }
        toast(`"${fields.en}" נוספה ✓`);
        if (data.again) { f.reset(); f.again.checked = true; f.tags.value = fields.tags.join(', '); f.en.focus(); }
        else { close(); }
        done?.();
      };
      setTimeout(() => f.en.focus(), 50);
    },
  });
}

function openDetail(id, done) {
  const w = getWord(id);
  if (!w) return;
  const acc = w.st.ok + w.st.bad ? Math.round((w.st.ok / (w.st.ok + w.st.bad)) * 100) : null;
  modal(`
    <div class="detail">
      <div class="row between"><h2>${en(w.en)}</h2>${speakBtn(w.en)}</div>
      ${w.pos ? `<small class="muted" dir="ltr">${esc(w.pos)}</small>` : ''}
      <p class="he big">${esc(w.he)}</p>
      ${w.ex ? `<div class="ex-box"><p>${en(w.ex)} ${speakBtn(w.ex, 'sm')}</p>${w.exHe ? `<p class="muted">${esc(w.exHe)}</p>` : ''}</div>` : ''}
      ${w.note ? `<p class="note-txt">💡 ${esc(w.note)}</p>` : ''}
      ${w.tags.length ? `<div class="row wrap gap-s">${w.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="stats-mini">
        <div><b class="lvl lv-${level(w)}">${LEVEL_HE[level(w)]}</b><span>רמה</span></div>
        <div><b>${acc === null ? '—' : acc + '%'}</b><span>דיוק</span></div>
        <div><b>${w.st.ok}/${w.st.ok + w.st.bad}</b><span>נכון/סה"כ</span></div>
        <div><b>${w.srs.r ? relDue(w.srs.d) : '—'}</b><span>חזרה הבאה</span></div>
      </div>
      ${w.src ? `<p class="muted small">מקור: ${esc(w.src)}</p>` : ''}
      <div class="row wrap gap-s">
        <button class="btn" data-a="star">${w.star ? '★ בטל סימון' : '☆ סמן'}</button>
        <button class="btn" data-a="edit">✏️ ערוך</button>
        <button class="btn" data-a="say">🎤 תרגל הגייה</button>
        <button class="btn" data-a="reset">↺ אפס התקדמות</button>
        <button class="btn danger" data-a="del">🗑️ מחק</button>
      </div>
    </div>`, {
    onMount: (m, close) => m.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'star') { updateWord(id, { star: !w.star }); close(); done(); }
      if (a === 'edit') { close(); openEditor(id, done); }
      if (a === 'say') { close(); go('/speak/say?id=' + id); }
      if (a === 'reset') { updateWord(id, { srs: { e: 2.5, i: 0, d: 0, r: 0, l: 0 }, st: { ok: 0, bad: 0, last: 0 } }); toast('אופס'); close(); done(); }
      if (a === 'del') {
        if (await confirmBox(`למחוק את "${w.en}"?`, { ok: 'מחק', danger: true })) { deleteWord(id); close(); done(); toast('נמחק'); }
      }
    },
  });
}

export function openStarter(done) {
  modal(`<h2>חבילות פתיחה</h2><p class="muted">מילים שימושיות עם משפטי דוגמה ותרגום. אפשר לטעון כמה שרוצים — כפילויות מדולגות.</p>
    <div class="packs">${STARTER_PACKS.map((p, i) => `
      <div class="pack"><div class="grow"><b>${esc(p.title)}</b><small class="muted">${p.words.length} מילים · ${p.words.slice(0, 4).map(w => esc(w.en)).join(', ')}…</small></div>
      <button class="btn sm primary" data-i="${i}">הוסף</button></div>`).join('')}</div>`, {
    onMount: (m) => m.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const p = STARTER_PACKS[+b.dataset.i];
      const r = addMany(p.words, 'חבילת פתיחה');
      b.textContent = '✓'; b.disabled = true;
      toast(`נוספו ${r.added} מילים${r.dup ? ` (${r.dup} כבר היו)` : ''}`);
      done?.();
    },
  });
}

function openBulk(done) {
  modal(`<h2>ייבוא רשימה</h2>
    <p class="muted small">שורה לכל מילה. פורמטים נתמכים:<br><code dir="ltr">word - תרגום</code> · <code dir="ltr">word = תרגום</code> · <code dir="ltr">word, תרגום</code> · טאב (העתקה מאקסל)<br>אפשר גם לכתוב רק מילים באנגלית — ונשלים תרגום עם AI.</p>
    <textarea id="bulk" rows="9" dir="auto" placeholder="reliable - אמין&#10;deadline - מועד אחרון&#10;improve"></textarea>
    <label>תגית לכל המילים<input id="btag" placeholder="אופציונלי"></label>
    <div class="row end"><button class="btn primary" id="go">ייבוא</button></div>`, {
    onMount: (m, close) => m.querySelector('#go').onclick = async (e) => {
      const lines = m.querySelector('#bulk').value.split('\n').map(l => l.trim()).filter(Boolean);
      const tag = m.querySelector('#btag').value.trim();
      const parsed = [], missing = [];
      for (const l of lines) {
        const mm = l.match(/^(.+?)\s*(?:\t| - | – | = |=|,|:)\s*(.+)$/);
        if (mm) parsed.push({ en: mm[1].trim(), he: mm[2].trim() });
        else if (/^[a-zA-Z][a-zA-Z' -]*$/.test(l)) missing.push(l);
      }
      const btn = e.currentTarget;
      if (missing.length) {
        loadingBtn(btn, true, `מתרגם ${missing.length}...`);
        for (const word of missing.slice(0, 40)) {
          try { const r = await ai('enrich', { word }); if (r.he) parsed.push({ en: r.en || word, he: r.he, ex: r.example, exHe: r.exampleHe, pos: r.pos, note: r.note }); }
          catch (ex) { toast(ex.message, 'err'); break; }
        }
        loadingBtn(btn, false);
      }
      parsed.forEach(p => { if (tag) p.tags = [tag]; });
      const r = addMany(parsed, 'ייבוא');
      toast(`נוספו ${r.added} מילים${r.dup ? `, ${r.dup} כפולות דולגו` : ''}`);
      close(); done?.();
    },
  });
}

async function fillExamples(done) {
  const need = words().filter(w => !w.ex);
  if (!need.length) return toast('לכל המילים כבר יש משפטי דוגמה 👌');
  const close = modal(`<h2>✨ משלים משפטי דוגמה</h2><p id="exp">0 / ${need.length}</p><div class="progress"><div id="exbar" style="width:0"></div></div>`);
  let doneN = 0;
  for (let i = 0; i < need.length; i += 8) {
    const batch = need.slice(i, i + 8);
    try {
      const r = await ai('examples', { words: batch.map(w => ({ id: w.id, en: w.en, he: w.he })) });
      for (const it of r.items || []) if (it.id && it.example) updateWord(it.id, { ex: it.example, exHe: it.exampleHe || '' });
    } catch (ex) { toast(ex.message, 'err'); break; }
    doneN += batch.length;
    const p = document.getElementById('exp'), bar = document.getElementById('exbar');
    if (!p) break;
    p.textContent = `${doneN} / ${need.length}`; bar.style.width = (doneN / need.length * 100) + '%';
  }
  toast('הסתיים'); close(); done?.();
}
