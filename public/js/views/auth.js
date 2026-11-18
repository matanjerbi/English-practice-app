import { api } from '../api.js';
import { esc, loadingBtn } from '../ui.js';

export async function render(root, { onLogin }) {
  let mode = 'login';
  let inviteRequired = false;
  try { inviteRequired = !!(await api('health')).inviteRequired; } catch {}

  const draw = () => {
    root.innerHTML = `
    <div class="auth">
      <div class="auth-logo">🗣️</div>
      <h1>Word<span>Up</span></h1>
      <p class="muted">מילים, משחקים, משפטים, דיבור ושמיעה — והכול משותף עם חברים.</p>
      <div class="tabs">
        <button class="${mode === 'login' ? 'on' : ''}" data-m="login">התחברות</button>
        <button class="${mode === 'register' ? 'on' : ''}" data-m="register">הרשמה</button>
      </div>
      <form class="card form" autocomplete="on">
        <label>שם משתמש<input name="username" required minlength="3" maxlength="24" autocomplete="username" dir="auto"></label>
        ${mode === 'register' ? `<label>שם תצוגה<input name="display" maxlength="40" placeholder="איך יראו אותך החברים"></label>` : ''}
        <label>סיסמה<input name="password" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
        ${mode === 'register' && inviteRequired ? `<label>קוד הזמנה<input name="inviteCode" required></label>` : ''}
        <div class="err" hidden></div>
        <button class="btn primary big" type="submit">${mode === 'login' ? 'כניסה' : 'יצירת חשבון'}</button>
      </form>
    </div>`;
    root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    const form = root.querySelector('form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('[type=submit]');
      const err = form.querySelector('.err');
      err.hidden = true;
      loadingBtn(btn, true);
      try {
        const r = await api(mode === 'login' ? 'auth/login' : 'auth/register', { method: 'POST', body: fd });
        onLogin(r.token, r.user);
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false;
      } finally { loadingBtn(btn, false); }
    };
  };
  draw();
}
