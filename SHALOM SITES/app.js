/* SHALOM GENERAL STORE - user interface */
(function () {
  'use strict';
  const C = window.ShalomCore;
  const { Reports, r2, dayKey, genId, pad } = C;

  // ================================================================ state
  const S = {
    backend: null, logic: null, uid: null, me: null, roleAtStart: null,
    users: [], products: [], sales: [], payroll: [], messages: [], stockMoves: [], audit: [],
    settings: Object.assign({}, C.DEFAULT_SETTINGS),
    loaded: {}, unsubs: [], timers: [], route: null, view: null, charts: {},
    cart: [], cartSaleId: null, pay: { method: 'Cash', paid: '', name: '', phone: '', ref: '' },
    popped: new Set(), settingUp: false, busySale: false,
  };
  const V = {}; // per-view UI state (filters etc.)
  const CREDIT_1 = 'Designed By: Engineer Maitha';
  const CREDIT_2 = '+254711829800 / maithajoseph2003@gmail.com';
  const creditHTML = (cls) => '<div class="' + (cls || 'credit') + '">' + CREDIT_1 + '<br>' + CREDIT_2 + '</div>';

  // ================================================================ theme (saved per device)
  const THEME_KEY = 'shalom_theme_v1';
  const DEFAULT_THEME = { accent: '#16a34a', sidebar: 'dark', mode: 'light', font: 'normal' };
  const PRESETS = [
    ['Shalom Green', '#16a34a'], ['Emerald', '#059669'], ['Teal', '#0d9488'], ['Sky Blue', '#0284c7'],
    ['Royal Blue', '#2563eb'], ['Indigo', '#4f46e5'], ['Purple', '#7c3aed'], ['Pink', '#db2777'],
    ['Maroon', '#9f1239'], ['Orange', '#ea580c'], ['Gold', '#b45309'], ['Coffee', '#7c4a1e'], ['Graphite', '#4b5563'],
  ];
  function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const A = hexToRgb(a); const B = hexToRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  function loadTheme() {
    try { return Object.assign({}, DEFAULT_THEME, JSON.parse(localStorage.getItem(THEME_KEY)) || {}); } catch (e) { return Object.assign({}, DEFAULT_THEME); }
  }
  function saveTheme(t) { try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) {} }
  function applyTheme(t) {
    const r = document.documentElement;
    const a = /^#[0-9a-f]{6}$/i.test(t.accent || '') ? t.accent : DEFAULT_THEME.accent;
    const dark = t.mode === 'dark';
    const surf = dark ? '#182130' : '#ffffff';
    const set = (k, v) => r.style.setProperty(k, v);
    r.dataset.mode = dark ? 'dark' : 'light';
    r.dataset.sidebar = t.sidebar;
    set('--green-600', a);
    set('--green-700', mix(a, '#000000', 0.15));
    set('--green-800', mix(a, '#000000', 0.3));
    set('--green-900', mix(a, '#000000', 0.45));
    set('--green-100', dark ? mix(a, surf, 0.72) : mix(a, '#ffffff', 0.84));
    set('--green-50', dark ? mix(a, surf, 0.85) : mix(a, '#ffffff', 0.93));
    set('--green-line', dark ? mix(a, surf, 0.5) : mix(a, '#ffffff', 0.65));
    set('--green-ink', dark ? mix(a, '#ffffff', 0.55) : mix(a, '#000000', 0.45));
    let sb;
    if (t.sidebar === 'colored') sb = [mix(a, '#000000', 0.55), 'rgba(255,255,255,.85)', '#ffffff', 'rgba(255,255,255,.65)', 'rgba(255,255,255,.1)', 'rgba(255,255,255,.12)'];
    else if (t.sidebar === 'light') sb = dark ? ['#182130', '#cdd3dc', '#ffffff', '#9aa5b4', 'rgba(255,255,255,.06)', '#2a3546'] : ['#ffffff', '#374151', '#111827', '#6b7280', 'rgba(0,0,0,.05)', '#e5e7eb'];
    else sb = [dark ? '#0b111b' : '#111827', '#d1d5db', '#ffffff', '#9ca3af', 'rgba(255,255,255,.07)', 'rgba(255,255,255,.07)'];
    ['--sb-bg', '--sb-text', '--sb-strong', '--sb-muted', '--sb-hover', '--sb-border'].forEach((k, i) => set(k, sb[i]));
    set('--base-font', t.font === 'large' ? '15.5px' : '14px');
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', t.sidebar === 'light' && !dark ? '#ffffff' : sb[0]);
  }
  applyTheme(loadTheme());
  const isAdmin = () => !!(S.me && S.me.role === 'admin');
  const actor = () => (S.me ? { uid: S.uid, name: S.me.name, role: S.me.role } : null);

  // ================================================================ utils
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cur = () => S.settings.currency || 'KSh';
  const fmtNum = (n, dp) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: dp == null ? 2 : dp, maximumFractionDigits: dp == null ? 2 : dp });
  const money = (n) => cur() + ' ' + fmtNum(n);
  const shortMoney = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(v % 1000 === 0 ? 0 : 1) + 'k' : String(v));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtD(ms) { const d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function fmtT(ms) { const d = new Date(ms); return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2); }
  function fmtDT(ms) { return fmtD(ms) + ', ' + fmtT(ms); }
  function ago(ms) {
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h ago';
    const d = Math.floor(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }
  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
  const startOfWeek = (ms) => { const d = new Date(startOfDay(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const startOfMonth = (ms) => { const d = new Date(startOfDay(ms)); d.setDate(1); return d.getTime(); };
  const addMonths = (ms, n) => { const d = new Date(ms); d.setMonth(d.getMonth() + n); return d.getTime(); };
  function parseDate(v) { if (!v) return null; const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
  function rangeFor(kind, from, to) {
    const now = Date.now();
    const t0 = startOfDay(now);
    if (kind === 'today') return [t0, addDays(t0, 1), 'Today (' + fmtD(t0) + ')'];
    if (kind === 'yesterday') return [addDays(t0, -1), t0, 'Yesterday'];
    if (kind === 'week') { const w = startOfWeek(now); return [w, addDays(w, 7), 'This week (from ' + fmtD(w) + ')']; }
    if (kind === 'month') { const m = startOfMonth(now); return [m, addMonths(m, 1), 'This month (' + MONTHS[new Date(m).getMonth()] + ' ' + new Date(m).getFullYear() + ')']; }
    if (kind === 'lastweek') { const w = addDays(startOfWeek(now), -7); return [w, addDays(w, 7), 'Last week (' + fmtD(w) + ' – ' + fmtD(addDays(w, 6)) + ')']; }
    if (kind === 'lastmonth') { const m = addMonths(startOfMonth(now), -1); return [m, addMonths(m, 1), 'Last month (' + MONTHS[new Date(m).getMonth()] + ' ' + new Date(m).getFullYear() + ')']; }
    if (kind === 'custom') {
      const f = parseDate(from) || t0;
      const t = parseDate(to) || f;
      return [Math.min(f, t), addDays(Math.max(f, t), 1), fmtD(Math.min(f, t)) + ' to ' + fmtD(Math.max(f, t))];
    }
    return [0, 8.64e15, 'All time'];
  }
  const userById = (id) => S.users.find((u) => u.id === id);
  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
  function avatar(uid, nameFallback, cls) {
    const u = userById(uid);
    const name = (u && u.name) || nameFallback || '?';
    if (u && u.photo && /^data:image\//.test(u.photo)) return '<img class="avatar ' + (cls || '') + '" src="' + esc(u.photo) + '" alt="">';
    return '<span class="avatar ' + (cls || '') + '">' + esc(initials(name)) + '</span>';
  }
  function who(uid, nameFallback) {
    const u = userById(uid);
    return '<span class="who">' + avatar(uid, nameFallback, 'sm') + '<span>' + esc((u && u.name) || nameFallback || 'Unknown') + '</span></span>';
  }
  const isLow = (p) => p.qty <= (p.minStock != null ? p.minStock : S.settings.lowStockDefault);
  function stockBadge(p) {
    if (p.qty <= 0) return '<span class="badge b-red">OUT OF STOCK</span>';
    if (isLow(p)) return '<span class="badge b-amber">LOW STOCK</span>';
    return '<span class="badge b-green">In stock</span>';
  }
  const debtHours = () => Number(S.settings.debtAlertHours) || 24;
  const isOverdue = (s) => !s.reversed && s.balanceDue > 0 && Date.now() - s.at >= debtHours() * 3600000;
  function payBadge(s) {
    if (s.reversed) return '<span class="badge b-grey">REVERSED</span>';
    if (s.balanceDue <= 0) return '<span class="badge b-green">PAID FULL</span>';
    if (isOverdue(s)) return '<span class="badge b-red">' + (s.amountApplied > 0 ? 'PART PAID' : 'NOT PAID') + ' · OVERDUE</span>';
    return '<span class="badge b-amber">' + (s.amountApplied > 0 ? 'PART PAID' : 'NOT PAID') + '</span>';
  }
  function telLink(phone) {
    if (!phone) return '<span class="muted">—</span>';
    return '<a href="tel:' + esc(String(phone).replace(/\s+/g, '')) + '">' + esc(phone) + '</a>';
  }

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12l2-8H6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2M6 6V4h12v2"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.7 5.7 0 0 0 22 9.7C22 5.4 17.5 2 12 2z"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };
  const icon = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

  // ================================================================ toasts & modals
  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    $('#toastRoot').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6500 : 3500);
  }
  function openModal(opts) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal ' + (opts.cls || '') + '" role="dialog" aria-modal="true"><div class="modal-h"><h3>' + opts.title + '</h3><button class="close" aria-label="Close">&times;</button></div><div class="modal-b">' + (opts.body || '') + '</div>' + (opts.footer ? '<div class="modal-f">' + opts.footer + '</div>' : '') + '</div>';
    const m = { el: bg.firstChild, closed: false };
    m.close = () => { if (m.closed) return; m.closed = true; bg.remove(); if (opts.onClose) opts.onClose(); setTimeout(runPopups, 300); };
    bg.querySelector('.close').onclick = m.close;
    bg.addEventListener('mousedown', (e) => { if (e.target === bg && !opts.sticky) m.close(); });
    $('#modalRoot').appendChild(bg);
    const f = bg.querySelector('input:not([type=hidden]):not([readonly]), textarea, select');
    if (f && !opts.noFocus) setTimeout(() => f.focus(), 30);
    return m;
  }
  function confirmBox(title, text, okLabel, danger) {
    return new Promise((res) => {
      const m = openModal({
        title: esc(title), cls: 'narrow', body: '<p>' + text + '</p>',
        footer: '<button class="btn secondary" data-no>Cancel</button><button class="btn ' + (danger ? 'danger' : '') + '" data-yes>' + esc(okLabel || 'OK') + '</button>',
        onClose: () => res(false),
      });
      m.el.querySelector('[data-no]').onclick = () => m.close();
      m.el.querySelector('[data-yes]').onclick = () => { res(true); m.close(); };
    });
  }
  async function guard(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), 'error'); return undefined; } finally { if (btn) btn.disabled = false; }
  }
  function on(root, ev, sel, fn) {
    root.addEventListener(ev, (e) => {
      const t = e.target.closest(sel);
      if (t && root.contains(t)) fn(t, e);
    });
  }
  function formData(form) {
    const o = {};
    for (const el of form.elements) if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    return o;
  }

  // ================================================================ boot & auth
  async function boot() {
    const cfg = window.SHALOM_FIREBASE_CONFIG;
    S.backend = cfg && cfg.apiKey ? new C.FirebaseBackend(cfg) : new C.LocalBackend();
    try { await S.backend.init(); } catch (e) {
      $('#root').innerHTML = '<div class="boot-screen"><h2>Cannot start</h2><p>' + esc(e.message) + '</p><button class="btn" onclick="location.reload()">Retry</button></div>';
      return;
    }
    S.backend.onError = (e, col) => {
      const k = 'err-' + col;
      if (S.popped.has(k)) return;
      S.popped.add(k);
      toast('Database access problem (' + col + '): ' + (e.code === 'permission-denied' ? 'permission denied - check that firestore.rules are published.' : e.message), 'error');
    };
    S.logic = C.Logic(S.backend, actor);
    S.backend.onAuth(handleAuth);
  }
  async function handleAuth(uid) {
    if (S.settingUp) return;
    teardown();
    if (!uid) { showLogin(); return; }
    let me = null;
    try { me = await S.backend.get('users', uid); } catch (e) { console.error(e); }
    if (!me) { await S.backend.signOut(); showLogin('This login has no user profile. Ask the administrator.'); return; }
    if (me.active === false) { await S.backend.signOut(); showLogin('This account has been disabled. Contact the shop administrator.'); return; }
    S.uid = uid;
    S.me = me;
    S.roleAtStart = me.role;
    startApp();
  }
  function teardown() {
    S.unsubs.forEach((u) => { try { u(); } catch (e) {} });
    S.unsubs = [];
    S.timers.forEach(clearInterval);
    S.timers = [];
    Object.values(S.charts).forEach((c) => { try { c.destroy(); } catch (e) {} });
    S.charts = {};
    Object.assign(S, { uid: null, me: null, users: [], products: [], sales: [], payroll: [], messages: [], stockMoves: [], audit: [], loaded: {}, route: null, view: null });
    $('#modalRoot').innerHTML = '';
  }
  async function logout() {
    teardown();
    await S.backend.signOut();
  }

  // The administrator account is created automatically the first time the system is opened.
  // Username: admin  -  the admin is asked to change the password after the first login.
  const DEFAULT_ADMIN = { username: 'admin', password: 'admin2026admin2026', name: 'Administrator' };
  async function ensureAdmin() {
    let setup = null;
    try { setup = await S.backend.get('meta', 'setup'); } catch (e) { console.error(e); return; }
    if (setup) return;
    S.settingUp = true;
    try {
      await S.backend.createFirstAdmin(DEFAULT_ADMIN.username, DEFAULT_ADMIN.password, { name: DEFAULT_ADMIN.name, mustChangePassword: true, salary: 0, salaryPeriod: 'monthly', commissionRate: 0 });
    } catch (e) { console.warn('admin setup:', e.message); }
    finally {
      if (S.backend.mode === 'firebase') { try { await S.backend.signOut(); } catch (e) {} }
      S.settingUp = false;
    }
  }
  async function showLogin(errMsg) {
    $('#root').innerHTML = '<div class="boot-screen"><div class="spinner"></div></div>';
    await ensureAdmin();
    $('#root').innerHTML = `
      <div class="auth-wrap">
        <section class="auth-brand">
          <div><div class="logo-mark">S</div></div>
          <div>
            <h1>SHALOM<br>GENERAL STORE</h1>
            <p>Stock control, point of sale, debts and profit management - all in one place.</p>
            <ul class="features">
              <li>Real-time stock levels and low-stock alerts</li>
              <li>Fast checkout with printable receipts</li>
              <li>Customer debt tracking with 24-hour follow-up alerts</li>
              <li>Accurate profit reports for the owner</li>
            </ul>
          </div>
          <small style="opacity:.7">© ${new Date().getFullYear()} Shalom General Store</small>
        </section>
        <section class="auth-panel">
          <div class="auth-card">
            <h2>Log in</h2>
            <p class="muted">Enter the username and password given to you by the administrator.</p>
            <form id="authForm">
              <div class="field"><label>Username</label><input class="input" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></div>
              <div class="field"><label>Password</label><input class="input" type="password" name="password" required autocomplete="current-password">
                <label class="small muted" style="display:flex;gap:6px;align-items:center;margin-top:4px;font-weight:500"><input type="checkbox" id="showPw"> Show password</label></div>
              <div class="error-text" id="authErr">${esc(errMsg || '')}</div>
              <button class="btn lg block" type="submit">Log in</button>
            </form>
            ${creditHTML('credit auth-credit')}
          </div>
        </section>
      </div>`;
    const form = $('#authForm');
    $('#showPw').onchange = (e) => { form.elements.password.type = e.target.checked ? 'text' : 'password'; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(form);
      const btn = form.querySelector('button[type=submit]');
      const err = $('#authErr');
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Logging in…';
      try {
        await S.backend.signIn(d.username, d.password);
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        btn.textContent = 'Log in';
      }
    };
  }

  // ================================================================ app shell
  const NAV = [
    ['dashboard', 'Dashboard', 'home', 'all'],
    ['products', 'Products', 'box', 'all'],
    ['stock', 'Stock Management', 'layers', 'admin'],
    ['sale', 'New Sale', 'cart', 'all'],
    ['sales', 'Sales History', 'list', 'all'],
    ['team', 'Team Sales', 'trophy', 'all'],
    ['receipts', 'Receipts', 'receipt', 'all'],
    ['debts', 'Debts', 'wallet', 'all'],
    ['profit', 'Profit & Reports', 'chart', 'admin'],
    ['payroll', 'Salaries & Commission', 'cash', 'admin'],
    ['earnings', 'My Earnings', 'cash', 'seller'],
    ['daily', 'Daily Reports', 'calendar', 'all'],
    ['messages', 'Messages', 'chat', 'all'],
    ['users', 'Users', 'users', 'admin'],
    ['settings', 'Settings', 'settings', 'admin'],
    ['theme', 'Theme & Colours', 'palette', 'all'],
    ['profile', 'My Profile', 'user', 'all'],
  ];
  const allowed = (r) => { const n = NAV.find((x) => x[0] === r); return !!n && (n[3] === 'all' || (n[3] === 'admin' ? isAdmin() : !isAdmin())); };

  function startApp() {
    const b = S.backend;
    const admin = isAdmin();
    const sub = (u) => S.unsubs.push(u);
    renderShell();
    sub(b.listen('products', (d) => { S.products = d.sort((x, y) => x.name.localeCompare(y.name)); S.loaded.products = true; refresh(); }));
    sub(b.listen('users', (d) => {
      S.users = d;
      const me = d.find((u) => u.id === S.uid);
      if (me) {
        S.me = me;
        if (me.active === false) { toast('Your account has been disabled by the administrator.', 'error'); logout(); return; }
        if (me.role !== S.roleAtStart) { location.reload(); return; }
      }
      refresh();
    }));
    sub(b.listenDoc('meta', 'settings', (d) => {
      if (d) { const x = Object.assign({}, d); delete x.id; S.settings = Object.assign({}, C.DEFAULT_SETTINGS, x); }
      refresh();
    }));
    sub(b.listen('sales', (d) => { S.sales = d.sort((x, y) => y.at - x.at); S.loaded.sales = true; refresh(); }));
    sub(b.listen('payroll', (d) => { S.payroll = d.sort((x, y) => y.paidAt - x.paidAt); refresh(); }, admin ? null : ['sellerId', S.uid]));
    if (admin) {
      sub(b.listen('messages', (d) => { S.messages = d; refresh(); }));
      sub(b.listen('stockMoves', (d) => { S.stockMoves = d.sort((x, y) => y.at - x.at); refresh(); }));
      sub(b.listen('audit', (d) => { S.audit = d.sort((x, y) => y.at - x.at); refresh(); }));
    } else {
      const parts = {};
      const merge = () => {
        const m = {};
        Object.values(parts).forEach((arr) => arr.forEach((x) => { m[x.id] = x; }));
        S.messages = Object.values(m);
        refresh();
      };
      [['toUid', S.uid], ['toUid', 'all'], ['fromUid', S.uid]].forEach((f, i) => sub(b.listen('messages', (d) => { parts[i] = d; merge(); }, f)));
    }
    loadCart();
    if (S.me.mustChangePassword) setTimeout(() => {
      if (!S.me || !S.me.mustChangePassword) return;
      const m = openModal({ title: '🔒 Change the default password', cls: 'narrow alerting', noFocus: true, body: '<p>You are using the default administrator password. Change it now so nobody else can log in as the administrator.</p>', footer: '<button class="btn secondary" data-x>Later</button><button class="btn" data-go>Change password now</button>' });
      m.el.querySelector('[data-x]').onclick = m.close;
      m.el.querySelector('[data-go]').onclick = () => { m.close(); go('profile'); };
    }, 400);
    S.timers.push(setInterval(() => { updateBadges(); runPopups(); if (S.view && S.view.tick) S.view.tick(); }, 60000));
    setTimeout(() => {
      if (S.me && (!S.loaded.products || !S.loaded.sales)) toast('Still connecting to the database… check your internet connection.', 'warn');
    }, 10000);
    route();
  }

  function renderShell() {
    $('#root').innerHTML = `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="brand"><div class="logo">S</div><div><b>SHALOM<br>GENERAL STORE</b><small>Stock &amp; Sales System</small></div></div>
          <nav class="nav" id="nav"></nav>
          <div class="me" id="meBox"></div>
        </aside>
        <div class="overlay" id="overlay"></div>
        <div class="main">
          <header class="topbar">
            <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
            <h1 id="pageTitle">Dashboard</h1>
            <span class="date" id="topDate"></span>
            <button class="icon-btn" id="topMode" title="Switch light / dark mode" aria-label="Switch light / dark mode"></button>
            <button class="icon-btn" id="topDebts" title="Debts">${icon('wallet')}<span class="dot"></span></button>
            <button class="icon-btn" id="topMsgs" title="Messages">${icon('chat')}<span class="dot"></span></button>
          </header>
          <main class="content" id="view"></main>
          <footer class="app-footer">${creditHTML('credit')}</footer>
        </div>
      </div>`;
    $('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#overlay').classList.add('show'); };
    $('#overlay').onclick = closeMenu;
    $('#topMsgs').onclick = () => go('messages');
    $('#topDebts').onclick = () => go('debts');
    const modeBtn = $('#topMode');
    const syncModeBtn = () => { modeBtn.innerHTML = icon(loadTheme().mode === 'dark' ? 'sun' : 'moon'); };
    syncModeBtn();
    modeBtn.onclick = () => {
      const t = loadTheme();
      t.mode = t.mode === 'dark' ? 'light' : 'dark';
      saveTheme(t);
      applyTheme(t);
      syncModeBtn();
      route(); // redraw charts in the new colours
    };
    $('#topDate').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    renderNav();
  }
  function closeMenu() { const sb = $('#sidebar'); if (sb) sb.classList.remove('open'); const o = $('#overlay'); if (o) o.classList.remove('show'); }
  function renderNav() {
    const nav = $('#nav');
    if (!nav) return;
    nav.innerHTML = NAV.filter((n) => allowed(n[0])).map((n) =>
      (n[0] === 'theme' ? '<div class="sep"></div>' : '') +
      '<a href="#' + n[0] + '" data-route="' + n[0] + '" class="' + (S.route === n[0] ? 'active' : '') + '">' + icon(n[2]) + '<span>' + n[1] + '</span><span class="badge" data-badge="' + n[0] + '"></span></a>'
    ).join('') + '<a href="#" id="logoutLink">' + icon('logout') + '<span>Logout</span></a>';
    $('#logoutLink').onclick = async (e) => { e.preventDefault(); if (await confirmBox('Log out', 'Log out of SHALOM GENERAL STORE?', 'Log out')) logout(); };
    $$('a[data-route]', nav).forEach((a) => a.addEventListener('click', closeMenu));
    updateBadges();
  }
  function renderMe() {
    const box = $('#meBox');
    if (!box || !S.me) return;
    box.innerHTML = avatar(S.uid, S.me.name) + '<div><div class="name">' + esc(S.me.name) + '</div><div class="role">' + (isAdmin() ? 'Administrator' : 'Seller / Cashier') + '</div></div>';
  }

  // ---------- derived data
  function myUnread() {
    const me = S.uid;
    return S.messages.filter((m) => {
      if (m.fromUid === me || (m.readBy && m.readBy[me])) return false;
      if (isAdmin()) return m.toUid === 'admins' || m.toUid === me || m.toUid === 'all';
      return m.toUid === me || m.toUid === 'all';
    }).sort((a, b) => a.at - b.at);
  }
  const lineQty = (l) => l.qtyText || C.fmtQ(l.qty) + (l.unit ? ' ' + l.unit : '');
  const qtyU = (q, unit) => C.fmtQ(q) + ' ' + (unit || 'pcs');
  // admin works with every sale; a seller's dashboard, debts and daily report use their own sales
  const mySales = () => (isAdmin() ? S.sales : S.sales.filter((s) => s.sellerId === S.uid));
  const openDebts = () => mySales().filter((s) => !s.reversed && s.balanceDue > 0);
  const overdueDebts = () => openDebts().filter(isOverdue);

  function updateBadges() {
    const unread = myUnread().length;
    const overdue = overdueDebts().length;
    const low = S.products.filter(isLow).length;
    const set = (k, n, cls) => { const el = document.querySelector('[data-badge="' + k + '"]'); if (el) { el.className = 'badge ' + (n ? cls || 'count-badge' : ''); el.textContent = n ? String(n) : ''; } };
    set('messages', unread);
    set('debts', overdue);
    set('stock', low, 'count-badge');
    const dm = $('#topMsgs .dot'); if (dm) { dm.className = 'dot ' + (unread ? 'count-badge' : ''); dm.textContent = unread ? String(unread) : ''; }
    const dd = $('#topDebts .dot'); if (dd) { dd.className = 'dot ' + (overdue ? 'count-badge' : ''); dd.textContent = overdue ? String(overdue) : ''; }
  }

  let refreshPending = false;
  function refresh() {
    if (refreshPending) return;
    refreshPending = true;
    setTimeout(() => {
      refreshPending = false;
      if (!S.me) return;
      renderMe();
      updateBadges();
      if (S.view && S.view.update) { try { S.view.update(); } catch (e) { console.error(e); } }
      runPopups();
    }, 40);
  }

  // ---------- routing
  function go(r) { if (location.hash === '#' + r) route(); else location.hash = '#' + r; }
  window.addEventListener('hashchange', () => { if (S.me) route(); });
  function route() {
    let r = (location.hash || '').replace('#', '') || 'dashboard';
    if (!VIEWS[r] || !allowed(r)) r = 'dashboard';
    if (S.view && S.view.destroy) { try { S.view.destroy(); } catch (e) {} }
    Object.values(S.charts).forEach((c) => { try { c.destroy(); } catch (e) {} });
    S.charts = {};
    S.route = r;
    const view = VIEWS[r];
    S.view = view;
    $('#pageTitle').textContent = view.title;
    document.title = view.title + ' · SHALOM GENERAL STORE';
    $$('#nav a[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
    const root = document.createElement('div');
    $('#view').replaceChildren(root);
    view.root = root;
    view.render(root);
    if (view.update) view.update();
    window.scrollTo(0, 0);
    closeMenu();
  }

  // ================================================================ charts
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isDark = () => document.documentElement.dataset.mode === 'dark';
  // read the theme colours when a chart is drawn (charts are redrawn on theme change)
  const COLS = { get sales() { return cssVar('--green-600') || '#16a34a'; }, get profit() { return isDark() ? '#9ca3af' : '#374151'; } };
  function barChart(canvas, key, labels, series) {
    const tick = isDark() ? '#9aa5b4' : '#6b7280';
    const grid = isDark() ? '#2a3546' : '#eef0f3';
    if (!canvas) return;
    if (!window.Chart) { canvas.parentElement.innerHTML = '<div class="empty">Charts need an internet connection to load.</div>'; return; }
    const existing = S.charts[key];
    if (existing && existing.canvas === canvas && existing.data.datasets.length === series.length) {
      existing.data.labels = labels;
      series.forEach((s, i) => { existing.data.datasets[i].data = s.data; });
      existing.update('none');
      return;
    }
    if (existing) existing.destroy();
    S.charts[key] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: series.map((s) => ({ label: s.label, data: s.data, backgroundColor: s.color, hoverBackgroundColor: s.color, borderRadius: 4, maxBarThickness: 22, categoryPercentage: 0.72, barPercentage: 0.92 })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: series.length > 1, position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, color: tick } },
          tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + money(c.parsed.y) } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: tick, maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, suggestedMax: 100, grid: { color: grid }, border: { display: false }, ticks: { color: tick, precision: 0, callback: (v) => shortMoney(v) } },
        },
      },
    });
  }
  function dailySeries(sales, from, days) {
    const labels = [];
    const rev = [];
    const prof = [];
    for (let i = 0; i < days; i++) {
      const a = addDays(from, i);
      const b = addDays(from, i + 1);
      const sm = Reports.summarize(Reports.between(sales, a, b));
      const d = new Date(a);
      labels.push(d.getDate() + ' ' + MONTHS[d.getMonth()]);
      rev.push(sm.revenue);
      prof.push(sm.profit);
    }
    return { labels, rev, prof };
  }

  // ================================================================ receipts & printing
  function receiptHTML(s, a4) {
    const st = S.settings;
    const items = s.items.map((l) => `
      <tr><td colspan="3">${esc(l.name)}</td></tr>
      <tr><td>${esc(lineQty(l))} x ${fmtNum(l.rate != null ? l.rate : l.unitPrice)}${l.rateUnit ? "/" + esc(l.rateUnit) : ""}</td><td></td><td class="num">${fmtNum(l.subtotal)}</td></tr>`).join('');
    const pays = (s.payments || []).slice(1).map((p) => `<div class="rc-row"><span>Paid ${fmtD(p.at)} (${esc(p.method)})</span><span>${fmtNum(p.amount)}</span></div>`).join('');
    return `
      <div class="receipt ${a4 ? 'a4' : ''}">
        <div class="rc-center">
          <div class="rc-title">${esc(st.shopName || 'SHALOM GENERAL STORE')}</div>
          ${st.address ? '<div>' + esc(st.address) + '</div>' : ''}
          ${st.phone ? '<div>Tel: ' + esc(st.phone) + '</div>' : ''}
          ${st.email ? '<div>' + esc(st.email) + '</div>' : ''}
          ${st.kraPin ? '<div>PIN: ' + esc(st.kraPin) + '</div>' : ''}
          <div style="margin-top:4px;font-weight:700">SALES RECEIPT</div>
        </div>
        <div class="rc-hr"></div>
        <div class="rc-row"><span>Receipt No:</span><b>${esc(s.receiptNo)}</b></div>
        <div class="rc-row"><span>Date:</span><span>${fmtD(s.at)} ${fmtT(s.at)}</span></div>
        <div class="rc-row"><span>Served by:</span><span>${esc(s.sellerName)}</span></div>
        ${s.customerName ? '<div class="rc-row"><span>Customer:</span><span>' + esc(s.customerName) + '</span></div>' : ''}
        ${s.customerPhone ? '<div class="rc-row"><span>Phone:</span><span>' + esc(s.customerPhone) + '</span></div>' : ''}
        <div class="rc-hr"></div>
        <table><thead><tr><th>Item</th><th></th><th class="num">Amount</th></tr></thead><tbody>${items}</tbody></table>
        <div class="rc-hr"></div>
        <div class="rc-row"><span>Items:</span><span>${s.itemCount}</span></div>
        <div class="rc-row rc-total"><span>TOTAL:</span><span>${esc(cur())} ${fmtNum(s.total)}</span></div>
        <div class="rc-row"><span>Amount paid (${esc(s.method)}):</span><span>${fmtNum(s.amountPaid)}</span></div>
        ${s.reference ? '<div class="rc-row"><span>Ref:</span><span>' + esc(s.reference) + '</span></div>' : ''}
        <div class="rc-row"><span>Change:</span><span>${fmtNum(s.change)}</span></div>
        ${pays}
        ${s.payments && s.payments.length > 1 || s.balanceDue > 0 ? '<div class="rc-row"><b>BALANCE DUE:</b><b>' + fmtNum(s.balanceDue) + '</b></div>' : ''}
        <div class="rc-row"><span>Payment method:</span><span>${esc(s.method)}</span></div>
        <div class="rc-center" style="margin-top:4px;font-weight:700">${s.reversed ? '*** SALE REVERSED ***' : s.balanceDue > 0 ? '*** NOT FULLY PAID ***' : '*** PAID IN FULL ***'}</div>
        <div class="rc-hr"></div>
        <div class="rc-thanks">${esc(st.receiptFooter || C.DEFAULT_SETTINGS.receiptFooter)}</div>
        <div class="rc-hr"></div>
        ${creditHTML('rc-credit')}
      </div>`;
  }
  function printHTML(html, page) {
    const pa = $('#printArea');
    pa.innerHTML = '<style>@page { size: ' + page + '; margin: ' + (page === 'A4' ? '14mm' : '2mm') + '; }</style>' + html;
    setTimeout(() => {
      try { window.print(); } catch (e) { toast('Printing is not available in this browser.', 'error'); }
    }, 60);
  }
  function printReceipt(s) {
    const paper = S.settings.receiptPaper || '80mm';
    if (paper === 'A4') return printHTML(receiptHTML(s, true), 'A4');
    const w = paper === '58mm' ? 58 : 80;
    printHTML('<div style="width:' + (w - 6) + 'mm">' + receiptHTML(s, false).replace('class="receipt "', 'class="receipt" style="max-width:none;font-size:' + (w === 58 ? '10px' : '11.5px') + '"') + '</div>', w + 'mm auto');
  }
  function jsPDFCtor() { return window.jspdf && window.jspdf.jsPDF; }
  function pdfReceipt(s) {
    const JsPDF = jsPDFCtor();
    if (!JsPDF) { toast('PDF tool could not load (needs internet). Use Print and choose "Save as PDF".', 'error'); return; }
    const st = S.settings;
    const W = (S.settings.receiptPaper === '58mm') ? 58 : 80;
    const M = 4;
    const inner = W - 2 * M;
    const fs = W === 58 ? 7.5 : 8.5;
    const lh = fs * 0.45;
    const draw = (doc, real) => {
      let y = M + 2;
      const center = (t, bold, size) => {
        doc.setFont('courier', bold ? 'bold' : 'normal');
        doc.setFontSize(size || fs);
        doc.splitTextToSize(String(t), inner).forEach((ln) => { if (real) doc.text(ln, W / 2, y, { align: 'center' }); y += (size || fs) * 0.45; });
      };
      const row = (l, r, bold) => {
        doc.setFont('courier', bold ? 'bold' : 'normal');
        doc.setFontSize(fs);
        const ls = doc.splitTextToSize(String(l), inner - doc.getTextWidth(String(r)) - 2);
        ls.forEach((ln, i) => { if (real) { doc.text(ln, M, y); if (i === 0) doc.text(String(r), W - M, y, { align: 'right' }); } y += lh; });
      };
      const hr = () => { if (real) { doc.setLineDashPattern([0.8, 0.8], 0); doc.line(M, y - lh / 2, W - M, y - lh / 2); } y += lh * 0.7; };
      center(st.shopName || 'SHALOM GENERAL STORE', true, fs + 3);
      if (st.address) center(st.address);
      if (st.phone) center('Tel: ' + st.phone);
      if (st.email) center(st.email);
      if (st.kraPin) center('PIN: ' + st.kraPin);
      center('SALES RECEIPT', true);
      hr();
      row('Receipt No:', s.receiptNo, true);
      row('Date:', fmtD(s.at) + ' ' + fmtT(s.at));
      row('Served by:', s.sellerName);
      if (s.customerName) row('Customer:', s.customerName);
      if (s.customerPhone) row('Phone:', s.customerPhone);
      hr();
      s.items.forEach((l) => {
        doc.setFont('courier', 'normal'); doc.setFontSize(fs);
        doc.splitTextToSize(l.name, inner).forEach((ln) => { if (real) doc.text(ln, M, y); y += lh; });
        row('  ' + lineQty(l) + ' x ' + fmtNum(l.rate != null ? l.rate : l.unitPrice) + (l.rateUnit ? '/' + l.rateUnit : ''), fmtNum(l.subtotal));
      });
      hr();
      row('Items:', String(s.itemCount));
      row('TOTAL (' + cur() + '):', fmtNum(s.total), true);
      row('Paid (' + s.method + '):', fmtNum(s.amountPaid));
      if (s.reference) row('Ref:', s.reference);
      row('Change:', fmtNum(s.change));
      (s.payments || []).slice(1).forEach((p) => row('Paid ' + fmtD(p.at) + ':', fmtNum(p.amount)));
      if (s.balanceDue > 0 || (s.payments || []).length > 1) row('BALANCE DUE:', fmtNum(s.balanceDue), true);
      row('Payment method:', s.method);
      center(s.reversed ? '*** SALE REVERSED ***' : s.balanceDue > 0 ? '*** NOT FULLY PAID ***' : '*** PAID IN FULL ***', true);
      hr();
      center(st.receiptFooter || C.DEFAULT_SETTINGS.receiptFooter, true);
      hr();
      center(CREDIT_1, false, fs - 1.5);
      center(CREDIT_2, false, fs - 1.5);
      return y + M;
    };
    const probe = new JsPDF({ unit: 'mm', format: [W, 400] });
    const h = Math.max(60, draw(probe, false));
    const doc = new JsPDF({ unit: 'mm', format: [W, h] });
    draw(doc, true);
    doc.save('Receipt-' + s.receiptNo + '.pdf');
  }
  function showReceipt(s, justSold) {
    const m = openModal({
      title: (justSold ? 'Sale completed · ' : 'Receipt · ') + esc(s.receiptNo), cls: '', noFocus: true,
      body: (justSold ? '<div class="alert green">Sale recorded and stock updated.' + (s.change > 0 ? ' <b>Give change: ' + money(s.change) + '</b>' : '') + (s.balanceDue > 0 ? ' <b>Balance owed: ' + money(s.balanceDue) + '</b> - recorded in Debts.' : '') + '</div>' : '') +
        '<div class="receipt-preview">' + receiptHTML(s) + '</div>',
      footer: '<button class="btn secondary" data-pdf>' + icon('download') + 'Download PDF</button><button class="btn" data-print>' + icon('print') + 'Print receipt</button>' + (justSold ? '<button class="btn dark" data-new>New sale</button>' : ''),
    });
    m.el.querySelector('[data-print]').onclick = () => printReceipt(s);
    m.el.querySelector('[data-pdf]').onclick = () => pdfReceipt(s);
    const nb = m.el.querySelector('[data-new]');
    if (nb) nb.onclick = () => { m.close(); const inp = $('#posSearch'); if (inp) inp.focus(); };
  }
  function reportPDF(title, subtitle, blocks, filename) {
    const JsPDF = jsPDFCtor();
    if (!JsPDF || !(JsPDF.API && JsPDF.API.autoTable)) { toast('PDF tool could not load (needs internet). Use Print and choose "Save as PDF".', 'error'); return; }
    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(S.settings.shopName || 'SHALOM GENERAL STORE', 14, 16);
    doc.setFontSize(12); doc.text(title, 14, 23);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(subtitle + '   ·   Generated ' + fmtDT(Date.now()) + ' by ' + S.me.name, 14, 29);
    let y = 34;
    blocks.forEach((b) => {
      if (b.heading) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(b.heading, 14, y + 5); y += 7; }
      doc.autoTable({ startY: y, head: b.head ? [b.head] : undefined, body: b.body, foot: b.foot ? [b.foot] : undefined, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: [21, 128, 61] }, footStyles: { fillColor: [229, 231, 235], textColor: 20, fontStyle: 'bold' }, columnStyles: b.colStyles || {}, margin: { left: 14, right: 14 } });
      y = doc.lastAutoTable.finalY + 6;
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110);
      doc.text(CREDIT_1 + '  ·  ' + CREDIT_2, 105, 290, { align: 'center' });
      doc.text('Page ' + i + ' of ' + pages, 196, 290, { align: 'right' });
    }
    doc.save(filename);
  }
  function reportPrint(title, subtitle, blocks) {
    const html = '<div class="report"><h2>' + esc(S.settings.shopName || 'SHALOM GENERAL STORE') + '</h2><div><b>' + esc(title) + '</b></div><div class="small">' + esc(subtitle) + ' · Printed ' + fmtDT(Date.now()) + ' by ' + esc(S.me.name) + '</div>' +
      blocks.map((b) => (b.heading ? '<h3>' + esc(b.heading) + '</h3>' : '') + '<table>' + (b.head ? '<thead><tr>' + b.head.map((h, i) => '<th class="' + (b.numCols && b.numCols.includes(i) ? 'num' : '') + '">' + esc(h) + '</th>').join('') + '</tr></thead>' : '') +
        '<tbody>' + b.body.map((r) => '<tr>' + r.map((c, i) => '<td class="' + (b.numCols && b.numCols.includes(i) ? 'num' : '') + '">' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
        (b.foot ? '<tfoot><tr>' + b.foot.map((c, i) => '<td class="' + (b.numCols && b.numCols.includes(i) ? 'num' : '') + '"><b>' + esc(c) + '</b></td>').join('') + '</tr></tfoot>' : '') + '</table>').join('') + creditHTML('report-credit') + '</div>';
    printHTML(html, 'A4');
  }

  // ================================================================ sale detail / payments / reversal
  function saleDetail(s) {
    const admin = isAdmin();
    const rows = s.items.map((l) => '<tr><td>' + esc(l.name) + '</td><td class="num">' + esc(lineQty(l)) + '</td><td class="num">' + fmtNum(l.rate != null ? l.rate : l.unitPrice) + (l.rateUnit ? '/' + esc(l.rateUnit) : '') + '</td>' + (admin ? '<td class="num">' + fmtNum(l.unitCost) + (l.unit ? '/' + esc(l.unit) : '') + '</td>' : '') + '<td class="num">' + fmtNum(l.subtotal) + '</td>' + (admin ? '<td class="num">' + fmtNum(l.profit) + '</td>' : '') + '</tr>').join('');
    const pays = (s.payments || []).map((p) => '<li><span>' + fmtDT(p.at) + ' · ' + esc(p.method) + ' · by ' + esc(p.byName) + (p.note ? ' <span class="muted">(' + esc(p.note) + ')</span>' : '') + '</span><b>' + money(p.amount) + '</b></li>').join('') || '<li class="muted">No payment received yet.</li>';
    const m = openModal({
      title: 'Transaction ' + esc(s.receiptNo), cls: 'wide', noFocus: true,
      body: `
        ${s.reversed ? '<div class="alert red"><div><b>This sale was reversed</b> by ' + esc(s.reversedByName) + ' on ' + fmtDT(s.reversedAt) + '. Reason: ' + esc(s.reverseReason) + '</div></div>' : ''}
        ${!s.reversed && s.balanceDue > 0 ? '<div class="alert ' + (isOverdue(s) ? 'red' : 'amber') + '"><div><b>Customer owes ' + money(s.balanceDue) + '.</b> ' + esc(s.customerName) + ' · ' + esc(s.customerPhone) + (isOverdue(s) ? ' · <b>OVERDUE</b> (more than ' + debtHours() + ' hours)' : '') + '</div></div>' : ''}
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:14px">
          <div><div class="muted small">Date &amp; time</div><b>${fmtDT(s.at)}</b></div>
          <div><div class="muted small">Seller</div>${who(s.sellerId, s.sellerName)}</div>
          <div><div class="muted small">Payment method</div><b>${esc(s.method)}</b>${s.reference ? ' <span class="muted">(' + esc(s.reference) + ')</span>' : ''}</div>
          <div><div class="muted small">Status</div>${payBadge(s)}</div>
          ${s.customerName ? '<div><div class="muted small">Customer</div><b>' + esc(s.customerName) + '</b><br>' + telLink(s.customerPhone) + '</div>' : ''}
        </div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Unit price</th>${admin ? '<th class="num">Unit cost</th>' : ''}<th class="num">Subtotal</th>${admin ? '<th class="num">Profit</th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${s.itemCount}</td><td></td>${admin ? '<td class="num">' + fmtNum(s.totalCost) + '</td>' : ''}<td class="num">${fmtNum(s.total)}</td>${admin ? '<td class="num">' + fmtNum(s.profit) + '</td>' : ''}</tr></tfoot></table></div>
        <div class="two-col even" style="margin-top:14px">
          <div><h4 style="margin-bottom:6px">Payments</h4><ul class="list-plain">${pays}</ul></div>
          <div><ul class="list-plain">
            <li><span>Total payable</span><b>${money(s.total)}</b></li>
            <li><span>Cash handed over at sale</span><b>${money(s.amountPaid)}</b></li>
            <li><span>Change given</span><b>${money(s.change)}</b></li>
            <li><span>Total paid towards sale</span><b>${money(s.amountApplied)}</b></li>
            <li><span>Balance due</span><b class="${s.balanceDue > 0 ? 'text-red' : ''}">${money(s.balanceDue)}</b></li>
          </ul></div>
        </div>`,
      footer: (!s.reversed && admin ? '<button class="btn danger" data-rev>Reverse sale</button>' : '') +
        (!s.reversed && s.balanceDue > 0 && (admin || s.sellerId === S.uid) ? '<button class="btn dark" data-pay>Record payment</button><button class="btn secondary" data-cust>Edit customer</button>' : '') +
        '<button class="btn secondary" data-pdf>' + icon('download') + 'PDF</button><button class="btn" data-print>' + icon('print') + 'Print receipt</button>',
    });
    m.el.querySelector('[data-print]').onclick = () => printReceipt(s);
    m.el.querySelector('[data-pdf]').onclick = () => pdfReceipt(s);
    const rv = m.el.querySelector('[data-rev]'); if (rv) rv.onclick = () => { m.close(); reverseDialog(s); };
    const pb = m.el.querySelector('[data-pay]'); if (pb) pb.onclick = () => { m.close(); paymentDialog(s); };
    const cb = m.el.querySelector('[data-cust]'); if (cb) cb.onclick = () => { m.close(); customerDialog(s); };
  }
  function paymentDialog(s) {
    const m = openModal({
      title: 'Record debt payment', cls: 'narrow',
      body: `<p><b>${esc(s.customerName || 'Customer')}</b> · ${esc(s.customerPhone || '')}<br><span class="muted">Receipt ${esc(s.receiptNo)} · balance due</span> <b class="text-red">${money(s.balanceDue)}</b></p>
        <form id="payForm">
          <div class="field"><label>Amount received</label><input class="input" name="amount" type="number" min="0.01" step="0.01" max="${s.balanceDue}" value="${s.balanceDue}" required></div>
          <div class="field"><label>Payment method</label><select class="input" name="method"><option>Cash</option><option>M-Pesa</option><option>Bank</option><option>Other</option></select></div>
          <div class="field"><label>Note / reference (optional)</label><input class="input" name="note" maxlength="80" placeholder="e.g. M-Pesa code"></div>
        </form>`,
      footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>Save payment</button>',
    });
    m.el.querySelector('[data-x]').onclick = m.close;
    const submit = (btn) => guard(btn, async () => {
      const d = formData($('#payForm', m.el));
      const left = await S.logic.recordPayment(s.id, d.amount, d.method, d.note || 'Debt payment');
      m.close();
      toast(left > 0 ? 'Payment saved. Remaining balance: ' + money(left) : 'Debt fully cleared. Thank you!');
    });
    m.el.querySelector('[data-ok]').onclick = (e) => submit(e.currentTarget);
    $('#payForm', m.el).onsubmit = (e) => { e.preventDefault(); submit(m.el.querySelector('[data-ok]')); };
  }
  function customerDialog(s) {
    const m = openModal({
      title: 'Customer details', cls: 'narrow',
      body: `<form id="custForm"><div class="field"><label>Full name</label><input class="input" name="name" value="${esc(s.customerName)}" required></div>
        <div class="field"><label>Phone number</label><input class="input" name="phone" type="tel" value="${esc(s.customerPhone)}" required></div></form>`,
      footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>Save</button>',
    });
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => {
      const d = formData($('#custForm', m.el));
      if (d.name.trim().length < 3) throw new Error('Enter the full name.');
      if (!/^[+0-9][0-9 ]{8,15}$/.test(d.phone.trim())) throw new Error('Enter a valid phone number.');
      await S.logic.updateDebtor(s.id, d.name, d.phone);
      m.close();
      toast('Customer details updated.');
    });
  }
  function reverseDialog(s) {
    const m = openModal({
      title: 'Reverse sale ' + esc(s.receiptNo), cls: 'narrow',
      body: `<div class="alert red"><div>Reversing returns <b>${s.itemCount}</b> item(s) to stock and removes <b>${money(s.total)}</b> from sales and profit. This is recorded in the audit trail and cannot be undone.</div></div>
        <div class="field"><label>Reason for reversal</label><textarea class="input" id="revReason" maxlength="200" placeholder="e.g. Wrong product entered, customer returned goods"></textarea></div>`,
      footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn danger" data-ok>Reverse sale</button>',
    });
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => {
      await S.logic.reverseSale(s.id, $('#revReason', m.el).value);
      m.close();
      toast('Sale ' + s.receiptNo + ' reversed and stock returned.');
    });
  }

  // ================================================================ product dialogs
  function unitOptions(sel) {
    return Object.entries(C.UNITS).map(([k, u]) => '<option value="' + k + '" ' + (k === sel ? 'selected' : '') + '>' + esc(u.name) + '</option>').join('');
  }
  function productDialog(p) {
    const cats = S.settings.categories || ['Other'];
    const catOpts = Array.from(new Set(cats.concat(p && p.category ? [p.category] : []))).map((c) => '<option ' + (p && p.category === c ? 'selected' : '') + '>' + esc(c) + '</option>').join('');
    const hp = p && C.hasPack(p);
    const m = openModal({
      title: p ? 'Edit product · ' + esc(p.id) : 'Add new product', cls: 'wide',
      body: `<form id="prodForm" class="form-grid">
        <div class="field full"><label>Product name *</label><input class="input" name="name" required maxlength="80" value="${esc(p ? p.name : '')}" placeholder="e.g. Sugar, Cooking oil, Mitumba bale"></div>
        <div class="field"><label>Category *</label><select class="input" name="category">${catOpts}</select></div>
        <div class="field"><label>Unit of measurement *</label><select class="input" name="unit">${unitOptions(p ? p.unit || 'pcs' : 'pcs')}</select><span class="hint" id="unitHint"></span></div>
        <div class="field"><label data-l="buy">Buying price per unit *</label><input class="input" type="number" name="buyPrice" min="0" step="0.01" required value="${p ? p.buyPrice : ''}"></div>
        <div class="field"><label data-l="sell">Selling price per unit *</label><input class="input" type="number" name="sellPrice" min="0" step="0.01" required value="${p ? p.sellPrice : ''}"></div>
        <div class="field full" style="margin-bottom:6px"><label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="packEnabled" ${hp ? 'checked' : ''}> Also comes in packs / bales / cartons / sacks (e.g. 1 bale = 50 pieces)</label></div>
        <div class="full hidden" id="packBox" style="border:1px solid var(--grey-200);border-radius:12px;padding:12px 12px 0;margin-bottom:12px;background:var(--grey-50)">
          <div class="form-grid">
            <div class="field"><label>Pack name</label><input class="input" name="packName" list="packNames" maxlength="20" value="${esc(hp ? p.packName : 'bale')}" placeholder="bale, carton, sack…"><datalist id="packNames">${C.PACK_NAMES.map((n) => '<option value="' + n + '">').join('')}</datalist></div>
            <div class="field"><label data-l="size">Units inside one pack</label><input class="input" type="number" name="packSize" min="0" step="any" value="${hp ? p.packSize : ''}" placeholder="e.g. 50"></div>
            <div class="field"><label data-l="packSell">Selling price per pack</label><input class="input" type="number" name="packPrice" min="0" step="0.01" value="${hp ? p.packPrice : ''}" placeholder="auto"><span class="hint">Leave empty to use units × unit price.</span></div>
            <div class="field"><label data-l="packBuy">Buying price per pack (optional)</label><input class="input" type="number" name="packBuy" min="0" step="0.01" placeholder="fills the unit buying price"><span class="hint">Type what you paid for one pack - the unit cost is calculated.</span></div>
          </div>
        </div>
        ${p ? '<div class="field"><label>Quantity in stock</label><input class="input" value="' + esc(C.stockText(p)) + '" readonly><span class="hint">Change quantities in Stock Management.</span></div>'
          : '<div class="field"><label>Initial stock quantity *</label><div style="display:flex;gap:6px"><input class="input" type="number" name="qty" min="0" step="any" required value="0"><select class="input" name="qtyIn" style="width:auto"><option value="unit" data-l="inUnit">units</option><option value="pack" data-l="inPack">packs</option></select></div></div>'}
        <div class="field"><label data-l="min">Minimum stock level (low-stock alert)</label><input class="input" type="number" name="minStock" min="0" step="any" value="${p ? p.minStock : S.settings.lowStockDefault}"></div>
        <div class="field"><label>Date added</label><input class="input" type="date" name="dateAdded" value="${esc(p ? p.dateAdded : dayKey(Date.now()))}"></div>
        <div class="field full"><label>Description (optional)</label><textarea class="input" name="description" maxlength="300">${esc(p ? p.description : '')}</textarea></div>
        <div class="full" id="marginInfo"></div>
      </form>`,
      footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>' + (p ? 'Save changes' : 'Add product') + '</button>',
    });
    const form = $('#prodForm', m.el);
    const E = form.elements;
    const lab = (k, t) => { const el = $('[data-l="' + k + '"]', form); if (el) el.textContent = t; };
    const info = (ev) => {
      const unit = E.unit.value;
      const ui = C.UNITS[unit] || {};
      const pe = E.packEnabled.checked;
      const pn = (E.packName.value || 'pack').trim().toLowerCase();
      $('#packBox', m.el).classList.toggle('hidden', !pe);
      if (E.qtyIn) { E.qtyIn.classList.toggle('hidden', !pe); if (!pe) E.qtyIn.value = 'unit'; }
      lab('buy', 'Buying price per ' + unit + ' *');
      lab('sell', 'Selling price per ' + unit + ' *');
      lab('size', 'How many ' + unit + ' inside one ' + pn);
      lab('packSell', 'Selling price per ' + pn);
      lab('packBuy', 'Buying price per ' + pn + ' (optional)');
      lab('min', 'Minimum stock level in ' + unit + ' (low-stock alert)');
      lab('inUnit', unit);
      lab('inPack', C.plural(pn, 2));
      $('#unitHint', m.el).textContent = ui.dec ? 'Sellers can sell fractions, e.g. 0.5 ' + unit + (ui.sub ? ' or 250 ' + ui.sub[0] : '') + ', or by money amount.' : 'Sold in whole ' + unit + '.';
      const size = Number(E.packSize.value);
      if (ev && ev.target === E.packBuy && E.packBuy.value !== '' && size > 0) E.buyPrice.value = r2(Number(E.packBuy.value) / size);
      if (E.packPrice.value === '' && size > 0 && E.sellPrice.value !== '') E.packPrice.placeholder = 'auto: ' + fmtNum(size * Number(E.sellPrice.value));
      const b = Number(E.buyPrice.value);
      const s = Number(E.sellPrice.value);
      const el = $('#marginInfo', m.el);
      if (E.buyPrice.value === '' || E.sellPrice.value === '') { el.innerHTML = ''; return; }
      const pu = r2(s - b);
      let html = 'Profit per ' + esc(unit) + ': <b>' + money(pu) + '</b>' + (s > 0 ? ' · margin ' + ((pu / s) * 100).toFixed(1) + '%' : '') + (pu < 0 ? ' - <b>selling price is below buying price!</b>' : '');
      if (pe && size > 0) {
        const pp = E.packPrice.value !== '' ? Number(E.packPrice.value) : size * s;
        html += '<br>1 ' + esc(pn) + ' = <b>' + C.fmtQ(size) + ' ' + esc(unit) + '</b> · sells for <b>' + money(pp) + '</b> · costs ' + money(size * b) + ' · profit per ' + esc(pn) + ' <b>' + money(pp - size * b) + '</b>';
      }
      el.innerHTML = '<div class="alert ' + (pu < 0 ? 'red' : pu === 0 ? 'amber' : 'green') + '"><div>' + html + '</div></div>';
    };
    form.addEventListener('input', info);
    form.addEventListener('change', info);
    info();
    m.el.querySelector('[data-x]').onclick = m.close;
    const save = (btn) => guard(btn, async () => {
      const d = formData(form);
      if (p) { await S.logic.updateProduct(p.id, d); toast('Product updated.'); } else { const np = await S.logic.addProduct(d); toast('Product added with ID ' + np.id + '.'); }
      m.close();
    });
    m.el.querySelector('[data-ok]').onclick = (e) => save(e.currentTarget);
    form.onsubmit = (e) => { e.preventDefault(); save(m.el.querySelector('[data-ok]')); };
  }
  /** "in" selector for stock forms: units or packs */
  function amountInSelect(p, name) {
    if (!C.hasPack(p)) return '';
    return '<select class="input" name="' + (name || 'amountIn') + '" style="width:auto"><option value="unit">' + esc(p.unit || 'pcs') + '</option><option value="pack">' + esc(C.plural(p.packName, 2)) + ' (' + C.fmtQ(p.packSize) + ' ' + esc(p.unit || 'pcs') + ' each)</option></select>';
  }
  function stockDialog(p, mode) {
    mode = mode || 'add';
    const unit = p.unit || 'pcs';
    const m = openModal({
      title: 'Update stock · ' + esc(p.name), cls: 'narrow',
      body: `<p class="muted">Current stock: <b>${esc(C.stockText(p))}</b> · ID ${esc(p.id)}</p>
        <form id="stkForm">
          <div class="field"><label>Action</label><select class="input" name="mode">
            <option value="add" ${mode === 'add' ? 'selected' : ''}>Receive new stock (increase)</option>
            <option value="remove" ${mode === 'remove' ? 'selected' : ''}>Remove stock (damaged / expired / lost)</option>
            <option value="set" ${mode === 'set' ? 'selected' : ''}>Set exact count (stock take)</option></select></div>
          <div class="field"><label id="stkQtyLbl">Quantity</label><div style="display:flex;gap:6px"><input class="input" type="number" name="amount" min="0" step="any" required>${amountInSelect(p) || '<span class="muted" style="align-self:center">' + esc(unit) + '</span>'}</div></div>
          <div class="field" id="stkBuy"><label>New buying price (optional)</label><div style="display:flex;gap:6px"><input class="input" type="number" name="buyPrice" min="0" step="0.01" placeholder="Current: ${fmtNum(p.buyPrice)}/${esc(unit)}">${C.hasPack(p) ? '<select class="input" name="buyPer" style="width:auto"><option value="unit">per ' + esc(unit) + '</option><option value="pack">per ' + esc(p.packName) + '</option></select>' : ''}</div><span class="hint">Only future sales use the new price. Past profit stays correct.</span></div>
          <div class="field"><label>Note (supplier, invoice, reason)</label><input class="input" name="note" maxlength="120"></div>
        </form>`,
      footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>Save</button>',
    });
    const form = $('#stkForm', m.el);
    const sync = () => { const md = form.elements.mode.value; $('#stkBuy', m.el).classList.toggle('hidden', md !== 'add'); $('#stkQtyLbl', m.el).textContent = md === 'set' ? 'Counted quantity in stock' : md === 'add' ? 'Quantity received' : 'Quantity to remove'; };
    form.elements.mode.onchange = sync;
    sync();
    m.el.querySelector('[data-x]').onclick = m.close;
    const save = (btn) => guard(btn, async () => {
      const d = formData(form);
      let buy = d.mode === 'add' ? d.buyPrice : undefined;
      if (buy !== undefined && buy !== '' && d.buyPer === 'pack') buy = r2(Number(buy) / p.packSize);
      const after = await S.logic.adjustStock(p.id, d.mode, d.amount, d.note, buy, d.amountIn || 'unit');
      toast('Stock updated. ' + p.name + ' now has ' + C.stockText(p, after) + '.');
      m.close();
    });
    m.el.querySelector('[data-ok]').onclick = (e) => save(e.currentTarget);
    form.onsubmit = (e) => { e.preventDefault(); save(m.el.querySelector('[data-ok]')); };
  }

  // ================================================================ popups (messages & debt alerts)
  function runPopups() {
    if (!S.me || $('#modalRoot').children.length) return;
    // 1) new messages
    const unread = myUnread().filter((m) => !S.popped.has('m' + m.id));
    if (unread.length) {
      if (S.route === 'messages' && V.msg && unread.every((m) => m.threadId === V.msg.thread)) return;
      unread.forEach((m) => S.popped.add('m' + m.id));
      messagePopup(unread);
      return;
    }
    // 2) overdue debts (once per login session per sale)
    const od = overdueDebts().filter((s) => !S.popped.has('d' + s.id));
    if (od.length) {
      od.forEach((s) => S.popped.add('d' + s.id));
      const rows = od.map((s) => '<tr><td><b>' + esc(s.customerName || '—') + '</b><br>' + telLink(s.customerPhone) + '</td><td class="num">' + money(s.balanceDue) + '</td><td>' + ago(s.at) + '</td>' + (isAdmin() ? '<td>' + who(s.sellerId, s.sellerName) + '</td>' : '') + '</tr>').join('');
      const m = openModal({
        title: '⚠ Debt follow-up reminder', cls: 'alerting wide', noFocus: true,
        body: '<p>' + (od.length === 1 ? 'This customer has' : 'These ' + od.length + ' customers have') + ' not paid in full for more than <b>' + debtHours() + ' hours</b>. Please follow up.</p><div class="table-wrap"><table class="t"><thead><tr><th>Customer</th><th class="num">Balance</th><th>Sold</th>' + (isAdmin() ? '<th>Sold by</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>',
        footer: '<button class="btn secondary" data-x>Remind me later</button><button class="btn danger" data-go>Open Debts</button>',
      });
      m.el.querySelector('[data-x]').onclick = m.close;
      m.el.querySelector('[data-go]').onclick = () => { m.close(); V.debts = Object.assign(V.debts || {}, { tab: 'overdue' }); go('debts'); };
    }
  }
  function messagePopup(list) {
    const last = list[list.length - 1];
    const body = list.slice(-5).map((m) => '<div class="bubble"><div>' + avatar(m.fromUid, m.fromName, 'sm') + '</div><div><div class="body">' + esc(m.text) + '</div><div class="meta">' + esc(m.fromName) + (m.toUid === 'all' ? ' · to all sellers' : '') + ' · ' + fmtDT(m.at) + '</div></div></div>').join('');
    const m = openModal({
      title: '💬 New message' + (list.length > 1 ? 's (' + list.length + ')' : '') + ' from ' + esc(last.fromName), cls: 'msg-pop', sticky: true,
      body: '<div class="bubbles" style="max-height:300px;border-radius:10px">' + body + '</div><div class="field" style="margin-top:12px"><label>Reply</label><textarea class="input" id="popReply" maxlength="2000" placeholder="Type your reply…"></textarea></div>',
      footer: '<button class="btn secondary" data-read>Mark as read</button><button class="btn secondary" data-open>Open conversation</button><button class="btn" data-reply>' + icon('send') + 'Send reply</button>',
    });
    const markAll = () => S.logic.markRead(list.map((x) => x.id));
    m.el.querySelector('[data-read]').onclick = () => { markAll(); m.close(); };
    m.el.querySelector('[data-open]').onclick = () => { markAll(); m.close(); V.msg = Object.assign(V.msg || {}, { thread: last.threadId }); go('messages'); };
    m.el.querySelector('[data-reply]').onclick = (e) => guard(e.currentTarget, async () => {
      const txt = $('#popReply', m.el).value;
      await S.logic.sendMessage(replyTarget(last.threadId), txt, last.threadId);
      await markAll();
      m.close();
      toast('Reply sent.');
    });
  }
  function threadRoot(threadId) {
    return S.messages.filter((m) => m.threadId === threadId).sort((a, b) => a.at - b.at)[0];
  }
  function replyTarget(threadId) {
    if (!isAdmin()) return 'admins';
    const root = threadRoot(threadId);
    if (!root || root.toUid === 'all') return 'all';
    if (root.fromRole === 'admin') return root.toUid; // admin started the thread with one seller
    return root.fromUid; // a seller started the thread
  }

  // ================================================================ VIEWS
  const VIEWS = {};

  // ---------------------------------------------------------------- Dashboard
  VIEWS.dashboard = {
    title: 'Dashboard',
    render(root) {
      root.innerHTML = `
        <div id="dAlerts"></div>
        <div class="grid stats" id="dStats"></div>
        <div class="two-col">
          <div class="card"><div class="card-h"><h3>${isAdmin() ? 'Daily sales and profit' : 'My daily sales'} · last 14 days</h3></div><div class="card-b"><div class="chart-box"><canvas id="dChart" aria-label="Daily sales chart"></canvas></div></div></div>
          <div class="card"><div class="card-h"><h3>Low-stock alerts</h3><a href="#${isAdmin() ? 'stock' : 'products'}" class="btn sm secondary">View stock</a></div><div class="card-b flush" id="dLow"></div></div>
        </div>
        <div class="card"><div class="card-h"><h3>Recent sales</h3><a href="#sales" class="btn sm secondary">All sales</a><a href="#sale" class="btn sm">${icon('plus')}New sale</a></div><div class="card-b flush table-wrap" id="dRecent"></div></div>`;
      on(root, 'click', '[data-sale]', (el) => { const s = S.sales.find((x) => x.id === el.dataset.sale); if (s) saleDetail(s); });
    },
    update() {
      const root = this.root;
      const admin = isAdmin();
      const t0 = startOfDay(Date.now());
      const t1 = addDays(t0, 1);
      const today = Reports.summarize(Reports.between(mySales(), t0, t1));
      const collected = Reports.collected(mySales(), t0, t1);
      const inStock = S.products.filter((p) => p.qty > 0).length;
      const units = S.products.reduce((s, p) => s + (p.qty || 0), 0);
      const low = S.products.filter(isLow).sort((a, b) => a.qty - b.qty);
      const debts = openDebts();
      const od = debts.filter(isOverdue);
      const debtSum = r2(debts.reduce((s, x) => s + x.balanceDue, 0));
      const stat = (label, value, sub, cls) => '<div class="stat ' + (cls || '') + '"><div class="label">' + label + '</div><div class="value">' + value + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      $('#dStats', root).innerHTML = [
        stat('Products in stock', fmtNum(inStock, 0), 'of ' + S.products.length + ' registered products'),
        stat('Total quantity available', fmtNum(units, 0), 'units on the shelves', 'grey'),
        stat(admin ? 'Sales made today' : 'My sales today', fmtNum(today.count, 0), 'transactions'),
        stat('Sales value today', money(today.revenue), 'value of goods sold', 'grey'),
        stat('Money collected today', money(collected), 'cash, M-Pesa, bank (incl. debt payments)'),
        stat('Products sold today', fmtNum(today.units, 0), 'units'),
        admin ? stat('Profit today', money(today.profit), 'selling price − buying price', today.profit < 0 ? 'red' : '') : '',
        stat('Outstanding debts', money(debtSum), debts.length + ' customer(s) · ' + od.length + ' overdue', od.length ? 'red' : 'amber'),
      ].join('');
      let alerts = '';
      if (od.length) alerts += '<div class="alert red"><div><b>' + od.length + ' customer debt(s) unpaid for more than ' + debtHours() + ' hours.</b> <a href="#debts">Follow up now →</a></div></div>';
      const out = S.products.filter((p) => p.qty <= 0).length;
      if (low.length) alerts += '<div class="alert amber"><div><b>LOW STOCK:</b> ' + low.length + ' product(s) at or below minimum level' + (out ? ', ' + out + ' out of stock' : '') + '.</div></div>';
      if (!S.products.length && admin) alerts += '<div class="alert blue"><div>Welcome! Start by adding your products in <a href="#products">Products</a>, then add your sellers in <a href="#users">Users</a>.</div></div>';
      $('#dAlerts', root).innerHTML = alerts;
      $('#dLow', root).innerHTML = low.length ? '<ul class="list-plain" style="padding:0 18px">' + low.slice(0, 8).map((p) => '<li><span><b>' + esc(p.name) + '</b><br><span class="muted small">' + esc(p.id) + ' · min ' + (p.minStock != null ? p.minStock : S.settings.lowStockDefault) + '</span></span><span>' + stockBadge(p) + '<div class="right"><b>' + esc(C.stockText(p)) + '</b> left</div></span></li>').join('') + '</ul>' : '<div class="empty">All products are well stocked.</div>';
      const recent = mySales().slice(0, 8);
      $('#dRecent', root).innerHTML = recent.length ? '<table class="t"><thead><tr><th>Receipt</th><th>Time</th><th>Products</th><th class="num">Total</th><th>Status</th><th>Seller</th></tr></thead><tbody>' +
        recent.map((s) => '<tr class="' + (s.reversed ? 'row-reversed' : '') + '"><td><a href="javascript:void 0" data-sale="' + esc(s.id) + '">' + esc(s.receiptNo) + '</a></td><td class="nowrap">' + fmtDT(s.at) + '</td><td>' + esc(s.items.map((l) => l.name + ' × ' + lineQty(l)).join(', ')) + '</td><td class="num">' + money(s.total) + '</td><td>' + payBadge(s) + '</td><td>' + who(s.sellerId, s.sellerName) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">No sales yet. <a href="#sale">Record the first sale →</a></div>';
      const from = addDays(t0, -13);
      const ds = dailySeries(mySales(), from, 14);
      barChart($('#dChart', root), 'dash', ds.labels, admin ? [{ label: 'Sales', data: ds.rev, color: COLS.sales }, { label: 'Profit', data: ds.prof, color: COLS.profit }] : [{ label: 'Sales', data: ds.rev, color: COLS.sales }]);
    },
  };

  // ---------------------------------------------------------------- Products
  VIEWS.products = {
    title: 'Products',
    render(root) {
      V.prod = V.prod || { q: '', cat: '', stock: '' };
      const admin = isAdmin();
      root.innerHTML = `
        <div class="grid stats" id="pStats"></div>
        <div class="card">
          <div class="card-h">
            <div class="toolbar" style="flex:1">
              <input class="input search" id="pQ" placeholder="Search by product name or ID…" value="${esc(V.prod.q)}">
              <select class="input" id="pCat"><option value="">All categories</option></select>
              <select class="input" id="pStock"><option value="">All stock levels</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
            </div>
            ${admin ? '<button class="btn" id="pAdd">' + icon('plus') + 'Add product</button>' : ''}
          </div>
          <div class="card-b flush table-wrap" id="pTable"></div>
        </div>`;
      $('#pStock', root).value = V.prod.stock;
      $('#pQ', root).oninput = (e) => { V.prod.q = e.target.value; this.update(); };
      $('#pCat', root).onchange = (e) => { V.prod.cat = e.target.value; this.update(); };
      $('#pStock', root).onchange = (e) => { V.prod.stock = e.target.value; this.update(); };
      if (admin) $('#pAdd', root).onclick = () => productDialog(null);
      on(root, 'click', '[data-act]', async (el) => {
        const p = S.products.find((x) => x.id === el.dataset.id);
        if (!p) return;
        const a = el.dataset.act;
        if (a === 'edit') productDialog(p);
        else if (a === 'stock') stockDialog(p, 'add');
        else if (a === 'sell') { addToCart(p.id, 'unit'); go('sale'); }
        else if (a === 'del') {
          if (await confirmBox('Delete product', 'Delete <b>' + esc(p.name) + '</b> (' + esc(p.id) + ')? Past sales keep their records. This cannot be undone.', 'Delete', true)) guard(null, async () => { await S.logic.deleteProduct(p.id); toast('Product deleted.'); });
        }
      });
    },
    update() {
      const root = this.root;
      const admin = isAdmin();
      const catSel = $('#pCat', root);
      const cats = Array.from(new Set((S.settings.categories || []).concat(S.products.map((p) => p.category)))).filter(Boolean).sort();
      const keep = V.prod.cat;
      catSel.innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option>' + esc(c) + '</option>').join('');
      catSel.value = keep;
      const costVal = r2(S.products.reduce((s, p) => s + p.qty * p.buyPrice, 0));
      const retailVal = r2(S.products.reduce((s, p) => s + p.qty * p.sellPrice, 0));
      const stat = (l, v, sub, c) => '<div class="stat ' + (c || '') + '"><div class="label">' + l + '</div><div class="value">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      $('#pStats', root).innerHTML = stat('Registered products', fmtNum(S.products.length, 0)) + stat('Quantity in stock', C.fmtQ(S.products.reduce((s, p) => s + p.qty, 0)), 'all units of measure', 'grey') +
        (admin ? stat('Stock value (cost)', money(costVal), 'at buying price') : '') + stat('Stock value (selling)', money(retailVal), 'at selling price', 'grey') +
        stat('Low / out of stock', S.products.filter(isLow).length + ' / ' + S.products.filter((p) => p.qty <= 0).length, '', 'amber');
      const q = V.prod.q.trim().toLowerCase();
      const list = S.products.filter((p) => (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) && (!V.prod.cat || p.category === V.prod.cat) &&
        (!V.prod.stock || (V.prod.stock === 'low' ? isLow(p) : p.qty <= 0)));
      $('#pTable', root).innerHTML = list.length ? `<table class="t"><thead><tr><th>ID</th><th>Product</th><th>Category</th><th>Unit / pack</th>${admin ? '<th class="num">Buying price</th>' : ''}<th class="num">Selling price</th>${admin ? '<th class="num">Profit/unit</th>' : ''}<th class="num">In stock</th><th class="num">Min</th><th class="num">Stock value</th><th>Status</th><th>Added</th><th></th></tr></thead><tbody>` +
        list.map((p) => `<tr><td class="nowrap"><b>${esc(p.id)}</b></td><td><b>${esc(p.name)}</b>${p.description ? '<div class="muted small">' + esc(p.description) + '</div>' : ''}</td><td>${esc(p.category)}</td><td class="small">${esc(p.unit || 'pcs')}${C.hasPack(p) ? '<div class="muted">1 ' + esc(p.packName) + ' = ' + C.fmtQ(p.packSize) + ' ' + esc(p.unit || 'pcs') + '<br>' + money(C.packPrice(p)) + '/' + esc(p.packName) + '</div>' : ''}</td>
          ${admin ? '<td class="num">' + fmtNum(p.buyPrice) + '<span class="muted small">/' + esc(p.unit || 'pcs') + '</span></td>' : ''}<td class="num">${fmtNum(p.sellPrice)}<span class="muted small">/${esc(p.unit || 'pcs')}</span></td>${admin ? '<td class="num ' + (p.sellPrice - p.buyPrice < 0 ? 'text-red' : '') + '">' + fmtNum(p.sellPrice - p.buyPrice) + '</td>' : ''}
          <td class="num"><b>${esc(C.stockText(p))}</b></td><td class="num">${p.minStock != null ? p.minStock : S.settings.lowStockDefault}</td><td class="num">${fmtNum(p.qty * (admin ? p.buyPrice : p.sellPrice))}</td><td>${stockBadge(p)}</td><td class="nowrap small">${esc(p.dateAdded || '')}</td>
          <td class="nowrap"><div class="btn-row">${p.qty > 0 ? '<button class="btn sm" data-act="sell" data-id="' + esc(p.id) + '">Sell</button>' : ''}${admin ? '<button class="btn sm secondary" data-act="stock" data-id="' + esc(p.id) + '">+ Stock</button><button class="btn sm secondary" data-act="edit" data-id="' + esc(p.id) + '">Edit</button><button class="btn sm ghost text-red" data-act="del" data-id="' + esc(p.id) + '">Delete</button>' : ''}</div></td></tr>`).join('') +
        '</tbody></table>' : '<div class="empty">' + (S.products.length ? 'No products match your search.' : 'No products yet.' + (admin ? ' Click <b>Add product</b> to register your first product.' : '')) + '</div>';
    },
  };

  // ---------------------------------------------------------------- Stock management (admin)
  VIEWS.stock = {
    title: 'Stock Management',
    render(root) {
      V.stk = V.stk || { q: '', type: '' };
      root.innerHTML = `
        <div class="grid stats" id="sStats"></div>
        <div class="two-col">
          <div class="card"><div class="card-h"><h3>Update stock</h3></div><div class="card-b">
            <form id="sForm" class="form-grid">
              <div class="field full"><label>Product</label><select class="input" name="pid" id="sPid" required></select></div>
              <div class="field"><label>Action</label><select class="input" name="mode" id="sMode"><option value="add">Receive new stock (increase)</option><option value="remove">Remove (damaged / expired / lost)</option><option value="set">Set exact count (stock take)</option></select></div>
              <div class="field"><label>Quantity</label><div style="display:flex;gap:6px"><input class="input" type="number" name="amount" min="0" step="any" required><span id="sIn" style="display:contents"></span></div></div>
              <div class="field" id="sBuyF"><label id="sBuyL">New buying price per unit (optional)</label><input class="input" type="number" name="buyPrice" min="0" step="0.01"></div>
              <div class="field"><label>Note (supplier / invoice / reason)</label><input class="input" name="note" maxlength="120"></div>
              <div class="full"><button class="btn" type="submit">Save stock update</button> <span class="muted small" id="sCur"></span></div>
            </form></div></div>
          <div class="card"><div class="card-h"><h3>Products needing restock</h3></div><div class="card-b flush" id="sLow"></div></div>
        </div>
        <div class="card"><div class="card-h"><h3>Stock movements</h3>
          <div class="toolbar"><input class="input" id="sQ" placeholder="Filter by product…" value="${esc(V.stk.q)}">
          <select class="input" id="sType"><option value="">All movements</option><option value="initial">Opening stock</option><option value="restock">Restock</option><option value="sale">Sale</option><option value="removal">Removal</option><option value="adjustment">Stock-take adjustment</option><option value="reversal">Sale reversal</option></select></div></div>
          <div class="card-b flush table-wrap" id="sMoves"></div></div>`;
      const form = $('#sForm', root);
      $('#sType', root).value = V.stk.type;
      const sync = () => { $('#sBuyF', root).classList.toggle('hidden', form.elements.mode.value !== 'add'); const p = S.products.find((x) => x.id === form.elements.pid.value); const sIn = $('#sIn', root); const pidNow = p ? p.id : ''; if (sIn.dataset.pid !== pidNow) { sIn.dataset.pid = pidNow; sIn.innerHTML = p ? (amountInSelect(p) || '<span class="muted" style="align-self:center">' + esc(p.unit || 'pcs') + '</span>') : ''; } $('#sBuyL', root).textContent = 'New buying price per ' + ((p && p.unit) || 'unit') + ' (optional)'; $('#sCur', root).textContent = p ? 'Current stock: ' + C.stockText(p) + ' · buying price ' + money(p.buyPrice) + '/' + (p.unit || 'pcs') : ''; };
      form.elements.mode.onchange = sync;
      form.elements.pid.onchange = sync;
      this.sync = sync;
      form.onsubmit = (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        guard(btn, async () => {
          const d = formData(form);
          if (!d.pid) throw new Error('Choose a product.');
          const after = await S.logic.adjustStock(d.pid, d.mode, d.amount, d.note, d.mode === 'add' ? d.buyPrice : undefined, d.amountIn || 'unit');
          toast('Stock saved. New quantity: ' + after);
          form.elements.amount.value = '';
          form.elements.note.value = '';
          form.elements.buyPrice.value = '';
        });
      };
      $('#sQ', root).oninput = (e) => { V.stk.q = e.target.value; this.update(); };
      $('#sType', root).onchange = (e) => { V.stk.type = e.target.value; this.update(); };
      on(root, 'click', '[data-restock]', (el) => { form.elements.pid.value = el.dataset.restock; form.elements.mode.value = 'add'; sync(); form.elements.amount.focus(); });
    },
    update() {
      const root = this.root;
      const sel = $('#sPid', root);
      const keep = sel.value;
      sel.innerHTML = '<option value="">— choose product —</option>' + S.products.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.id + ' · ' + p.name + ' (' + C.stockText(p) + ')') + '</option>').join('');
      sel.value = keep;
      this.sync();
      const cost = r2(S.products.reduce((s, p) => s + p.qty * p.buyPrice, 0));
      const retail = r2(S.products.reduce((s, p) => s + p.qty * p.sellPrice, 0));
      const stat = (l, v, sub, c) => '<div class="stat ' + (c || '') + '"><div class="label">' + l + '</div><div class="value">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      $('#sStats', root).innerHTML = stat('Total stock value (cost)', money(cost), 'what you paid for current stock') + stat('Stock value (selling)', money(retail), 'if everything is sold', 'grey') +
        stat('Expected profit in stock', money(retail - cost)) + stat('Units in stock', fmtNum(S.products.reduce((s, p) => s + p.qty, 0), 0), S.products.length + ' products', 'grey') +
        stat('Low stock', String(S.products.filter((p) => isLow(p) && p.qty > 0).length), 'at/below minimum', 'amber') + stat('Out of stock', String(S.products.filter((p) => p.qty <= 0).length), '', 'red');
      const low = S.products.filter(isLow).sort((a, b) => a.qty - b.qty);
      $('#sLow', root).innerHTML = low.length ? '<ul class="list-plain" style="padding:0 18px">' + low.map((p) => '<li><span><b>' + esc(p.name) + '</b><br><span class="small muted">' + esc(C.stockText(p)) + ' left · min ' + (p.minStock != null ? p.minStock : S.settings.lowStockDefault) + '</span></span><span>' + stockBadge(p) + ' <button class="btn sm secondary" data-restock="' + esc(p.id) + '">Restock</button></span></li>').join('') + '</ul>' : '<div class="empty">No low-stock products.</div>';
      const q = V.stk.q.trim().toLowerCase();
      const TYPES = { initial: ['Opening stock', 'b-blue'], restock: ['Restock', 'b-green'], sale: ['Sale', 'b-grey'], removal: ['Removal', 'b-red'], adjustment: ['Stock take', 'b-amber'], reversal: ['Reversal', 'b-blue'] };
      const mv = S.stockMoves.filter((m) => (!q || (m.productName || '').toLowerCase().includes(q) || (m.productId || '').toLowerCase().includes(q)) && (!V.stk.type || m.type === V.stk.type)).slice(0, 300);
      $('#sMoves', root).innerHTML = mv.length ? '<table class="t"><thead><tr><th>Date</th><th>Product</th><th>Type</th><th class="num">Change</th><th class="num">Before</th><th class="num">After</th><th>By</th><th>Note / Ref</th></tr></thead><tbody>' +
        mv.map((m) => { const t = TYPES[m.type] || [m.type, 'b-grey']; return '<tr><td class="nowrap">' + fmtDT(m.at) + '</td><td><b>' + esc(m.productName) + '</b> <span class="muted small">' + esc(m.productId) + '</span></td><td><span class="badge ' + t[1] + '">' + t[0] + '</span></td><td class="num ' + (m.change < 0 ? 'text-red' : 'text-green') + '"><b>' + (m.change > 0 ? '+' : '') + m.change + '</b></td><td class="num">' + m.before + '</td><td class="num">' + m.after + '</td><td>' + esc(m.byName) + '</td><td class="small">' + esc([m.note, m.ref].filter(Boolean).join(' · ')) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty">No stock movements yet.</div>';
    },
  };

  // ---------------------------------------------------------------- New Sale (POS)
  function cartKey() { return 'shalom_cart_' + S.uid; }
  function saveCart() { try { localStorage.setItem(cartKey(), JSON.stringify({ cart: S.cart, id: S.cartSaleId, pay: S.pay })); } catch (e) {} }
  function normLine(l) { return { key: l.key || genId(), productId: l.productId, mode: l.mode || 'unit', value: l.value != null ? l.value : l.qty != null ? l.qty : 1 }; }
  function loadCart() {
    try {
      const d = JSON.parse(localStorage.getItem(cartKey()));
      if (d && Array.isArray(d.cart)) { S.cart = d.cart.map(normLine); S.cartSaleId = d.id || genId(); S.pay = Object.assign({ method: 'Cash', paid: '', name: '', phone: '', ref: '' }, d.pay || {}); return; }
    } catch (e) {}
    S.cart = []; S.cartSaleId = genId(); S.pay = { method: 'Cash', paid: '', name: '', phone: '', ref: '' };
  }
  function resetCart() { S.cart = []; S.cartSaleId = genId(); S.pay = { method: 'Cash', paid: '', name: '', phone: '', ref: '' }; saveCart(); }
  const MODE_DEFAULT = { unit: 1, sub: 250, pack: 1, amount: 50 };
  /** sell modes a product offers: [mode, label] */
  function sellModes(p) {
    const u = C.unitInfo(p);
    const unit = p.unit || 'pcs';
    const m = [['unit', unit + ' (' + money(p.sellPrice) + '/' + unit + ')']];
    if (u.sub) m.push(['sub', u.sub[0] + ' (type ' + u.sub[0] + ')']);
    if (C.hasPack(p)) m.push(['pack', p.packName + ' of ' + C.fmtQ(p.packSize) + ' ' + unit + ' (' + money(C.packPrice(p)) + ')']);
    if (u.dec) m.push(['amount', cur() + ' amount (money worth)']);
    return m;
  }
  function addToCart(pid, mode, value) {
    const p = S.products.find((x) => x.id === pid);
    if (!p) return;
    mode = mode || 'unit';
    const add = value != null ? value : MODE_DEFAULT[mode];
    const line = S.cart.find((l) => l.productId === pid && l.mode === mode && (mode === 'unit' || mode === 'pack'));
    if (line) line.value = C.r3(Number(line.value || 0) + add); else S.cart.push({ key: genId(), productId: pid, mode, value: add });
    const c = cartCalc();
    const bad = c.issues.find((i) => i.includes('"' + p.name + '"') && /available/.test(i));
    if (bad) { if (line) line.value = C.r3(Number(line.value) - add); else S.cart.pop(); toast(bad, 'warn'); }
    saveCart();
  }
  function cartCalc() {
    let total = 0;
    const issues = [];
    const need = {};
    const lines = S.cart.map((l) => {
      const p = S.products.find((x) => x.id === l.productId);
      if (!p) { issues.push('A product in the cart was deleted - remove it.'); return { l, p: null, x: null, sub: 0 }; }
      try {
        const x = C.resolveLine(p, l.mode, l.value);
        need[p.id] = C.r3((need[p.id] || 0) + x.qty);
        total += x.subtotal;
        return { l, p, x, sub: x.subtotal };
      } catch (e) { issues.push(e.message); return { l, p, x: null, sub: 0 }; }
    });
    Object.keys(need).forEach((id) => {
      const p = S.products.find((x) => x.id === id);
      if (need[id] > p.qty + 1e-9) issues.push('Only ' + C.stockText(p) + ' of "' + p.name + '" available - this sale needs ' + qtyU(need[id], p.unit) + '.');
    });
    total = r2(total);
    const paid = S.pay.paid === '' ? NaN : Number(S.pay.paid);
    return { lines, total, paid, issues, need, balance: isNaN(paid) ? total : r2(Math.max(0, total - paid)), change: isNaN(paid) ? 0 : r2(Math.max(0, paid - total)) };
  }
  function lineDesc(x) { return x ? '= ' + x.qtyText + ' @ ' + fmtNum(x.rate) + '/' + x.rateUnit : ''; }
  function chipsFor(p, mode) {
    const u = C.unitInfo(p);
    if (mode === 'unit' && u.dec) return [[0.25, '¼'], [0.5, '½'], [1, '1'], [2, '2'], [5, '5']];
    if (mode === 'sub') return [[100, '100'], [250, '250'], [500, '500'], [750, '750']];
    if (mode === 'amount') return [[20, '20'], [50, '50'], [100, '100'], [200, '200'], [500, '500']];
    return [];
  }
  VIEWS.sale = {
    title: 'New Sale',
    render(root) {
      V.pos = V.pos || { q: '', cat: '' };
      root.innerHTML = `
        <div class="pos">
          <div class="card">
            <div class="card-h"><div class="toolbar" style="flex:1"><input class="input search" id="posSearch" placeholder="Search product by name or ID…" value="${esc(V.pos.q)}" autocomplete="off"><select class="input" id="posCat"></select></div></div>
            <div class="pos-results" id="posResults"></div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Current sale</h3><button class="btn sm ghost" id="posClear">Clear</button></div>
            <div class="card-b">
              <div id="posCart"></div>
              <div class="totals" id="posTotals"></div>
              <form id="posPay" autocomplete="off">
                <div class="form-grid">
                  <div class="field"><label>Payment method</label><select class="input" name="method"><option>Cash</option><option>M-Pesa</option><option>Bank</option><option>Other</option></select></div>
                  <div class="field"><label>Amount paid by customer</label><input class="input" type="number" name="paid" min="0" step="0.01" placeholder="0.00"></div>
                  <div class="field full" id="refField"><label>Transaction reference (optional)</label><input class="input" name="ref" maxlength="40" placeholder="e.g. M-Pesa code"></div>
                </div>
                <div class="btn-row" style="margin:-4px 0 12px"><button type="button" class="btn sm secondary" id="exactBtn">Exact amount</button></div>
                <div id="payStatus"></div>
                <div class="debtor-box hidden" id="debtorBox">
                  <h4>⚠ Customer is paying less than the total - enter their details to record the debt</h4>
                  <div class="field"><label>Customer full name *</label><input class="input" name="name" maxlength="60" placeholder="e.g. Mary Wanjiku Kamau"></div>
                  <div class="field"><label>Customer phone number *</label><input class="input" name="phone" type="tel" maxlength="16" placeholder="e.g. 0712345678"></div>
                </div>
                <div class="error-text" id="posErr"></div>
                <button class="btn lg block" type="submit" id="posConfirm">Confirm sale</button>
              </form>
            </div>
          </div>
        </div>
        <button type="button" class="pos-mobile-bar hidden-bar" id="posBar"><span id="posBarCount"></span><span id="posBarTotal"></span></button>`;
      $('#view').classList.add('has-bar');
      $('#posBar', root).onclick = () => { const card = $('#posCart', root).closest('.card'); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      const form = $('#posPay', root);
      form.elements.method.value = S.pay.method;
      form.elements.paid.value = S.pay.paid;
      form.elements.ref.value = S.pay.ref;
      form.elements.name.value = S.pay.name;
      form.elements.phone.value = S.pay.phone;
      form.addEventListener('input', () => {
        S.pay = { method: form.elements.method.value, paid: form.elements.paid.value, ref: form.elements.ref.value, name: form.elements.name.value, phone: form.elements.phone.value };
        saveCart();
        this.renderTotals();
      });
      form.elements.method.onchange = () => { S.pay.method = form.elements.method.value; saveCart(); this.renderTotals(); };
      $('#exactBtn', root).onclick = () => { form.elements.paid.value = cartCalc().total; form.dispatchEvent(new Event('input')); };
      $('#posSearch', root).oninput = (e) => { V.pos.q = e.target.value; this.renderResults(); };
      $('#posSearch', root).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = $('.pos-item:not(.disabled)', root); if (first) first.click(); } };
      $('#posCat', root).onchange = (e) => { V.pos.cat = e.target.value; this.renderResults(); };
      $('#posClear', root).onclick = async () => { if (!S.cart.length || (await confirmBox('Clear sale', 'Remove all items from this sale?', 'Clear'))) { resetCart(); this.syncForm(); this.renderCart(); } };
      on(root, 'click', '.pos-item', (el, e) => {
        if (el.classList.contains('disabled')) return;
        const pk = e.target.closest('[data-addpack]');
        addToCart(el.dataset.pid, pk ? 'pack' : 'unit');
        this.renderCart();
      });
      const lineOf = (el) => S.cart.find((x) => x.key === el.dataset.key);
      on(root, 'click', '[data-rm]', (el) => { S.cart = S.cart.filter((l) => l.key !== el.dataset.rm); saveCart(); this.renderCart(); });
      on(root, 'input', '[data-val]', (el) => {
        const l = lineOf(el);
        if (!l) return;
        l.value = el.value;
        saveCart();
        const row = cartCalc().lines.find((x) => x.l === l);
        const box = el.closest('.cart-line2');
        box.querySelector('[data-sub]').textContent = fmtNum(row ? row.sub : 0);
        box.querySelector('[data-desc]').textContent = row && row.x ? lineDesc(row.x) : '';
        this.renderTotals();
      });
      on(root, 'change', '[data-val]', () => this.renderCart());
      on(root, 'change', '[data-mode]', (el) => { const l = lineOf(el); if (l) { l.mode = el.value; l.value = MODE_DEFAULT[l.mode]; saveCart(); this.renderCart(); } });
      on(root, 'click', '[data-chip]', (el) => { const l = lineOf(el); if (l) { l.value = Number(el.dataset.v); saveCart(); this.renderCart(); } });
      form.onsubmit = (e) => { e.preventDefault(); this.confirm(); };
      setTimeout(() => { const s = $('#posSearch', root); if (s) s.focus(); }, 50);
    },
    destroy() { const v = $('#view'); if (v) v.classList.remove('has-bar'); },
    syncForm() {
      const form = $('#posPay', this.root);
      if (!form) return;
      ['method', 'paid', 'ref', 'name', 'phone'].forEach((k) => { form.elements[k].value = S.pay[k] || (k === 'method' ? 'Cash' : ''); });
    },
    update() {
      const root = this.root;
      const sel = $('#posCat', root);
      const cats = Array.from(new Set(S.products.map((p) => p.category))).filter(Boolean).sort();
      sel.innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option>' + esc(c) + '</option>').join('');
      sel.value = V.pos.cat;
      this.renderResults();
      const active = document.activeElement;
      if (!(active && active.closest && active.closest('#posCart') && active.tagName === 'INPUT')) this.renderCart(); else this.renderTotals();
    },
    renderResults() {
      const q = V.pos.q.trim().toLowerCase();
      const list = S.products.filter((p) => (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) && (!V.pos.cat || p.category === V.pos.cat))
        .sort((a, b) => (b.qty > 0) - (a.qty > 0) || a.name.localeCompare(b.name)).slice(0, 80);
      $('#posResults', this.root).innerHTML = list.length ? list.map((p) => '<div class="pos-item ' + (p.qty <= 0 ? 'disabled' : '') + '" data-pid="' + esc(p.id) + '" role="button" tabindex="0"><div><div class="nm">' + esc(p.name) + '</div><div class="small muted">' + esc(p.id) + ' · ' + esc(p.category) + ' · ' + (p.qty <= 0 ? '<b class="text-red">Out of stock</b>' : '<b>' + esc(C.stockText(p)) + '</b> available' + (isLow(p) ? ' <span class="badge b-amber">LOW</span>' : '')) + '</div></div><div class="price">' + money(p.sellPrice) + '<span class="small muted">/' + esc(p.unit || 'pcs') + '</span>' + (C.hasPack(p) && p.qty >= p.packSize ? '<div><button type="button" class="btn sm secondary" data-addpack>+ 1 ' + esc(p.packName) + ' · ' + money(C.packPrice(p)) + '</button></div>' : '') + '</div></div>').join('') :
        '<div class="empty">' + (S.products.length ? 'No product matches "' + esc(V.pos.q) + '".' : 'No products in stock yet.' + (isAdmin() ? ' <a href="#products">Add products</a>.' : '')) + '</div>';
    },
    renderCart() {
      const c = cartCalc();
      $('#posCart', this.root).innerHTML = c.lines.length ?
        c.lines.map(({ l, p, x, sub }) => p ? '<div class="cart-line2"><div class="cl-top"><div><div class="nm">' + esc(p.name) + '</div><div class="small muted">' + money(p.sellPrice) + '/' + esc(p.unit || 'pcs') + ' · ' + esc(C.stockText(p)) + ' in stock</div></div><button type="button" class="x" data-rm="' + esc(l.key) + '" title="Remove">&times;</button></div>' +
          '<div class="cl-row"><select class="input" data-mode data-key="' + esc(l.key) + '" aria-label="Sell by">' + sellModes(p).map((o) => '<option value="' + o[0] + '" ' + (o[0] === l.mode ? 'selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' +
          '<input class="input" type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.value) + '" data-val data-key="' + esc(l.key) + '" aria-label="Quantity"><div class="right mono" data-sub>' + fmtNum(sub) + '</div></div>' +
          (chipsFor(p, l.mode).length ? '<div class="chips">' + chipsFor(p, l.mode).map((ch) => '<button type="button" class="chip ' + (Number(l.value) === ch[0] ? 'on' : '') + '" data-chip data-key="' + esc(l.key) + '" data-v="' + ch[0] + '">' + (l.mode === 'amount' ? esc(cur()) + ' ' : '') + ch[1] + (l.mode === 'unit' ? ' ' + esc(p.unit) : l.mode === 'sub' ? ' ' + esc(C.unitInfo(p).sub[0]) : '') + '</button>').join('') + '</div>' : '') +
          '<div class="small muted" data-desc>' + esc(lineDesc(x)) + '</div></div>' :
          '<div class="cart-line2"><div class="cl-top"><div class="text-red">Deleted product</div><button type="button" class="x" data-rm="' + esc(l.key) + '">&times;</button></div></div>').join('') :
        '<div class="empty" style="padding:20px 0">Search and click products on the left to add them to this sale.</div>';
      this.renderTotals();
    },
    renderTotals() {
      const root = this.root;
      const c = cartCalc();
      const items = S.cart.length;
      const bar = $('#posBar', root);
      if (bar) {
        bar.classList.toggle('hidden-bar', !S.cart.length);
        $('#posBarCount', root).textContent = '🛒 ' + items + ' item' + (items === 1 ? '' : 's') + ' · View cart & pay';
        $('#posBarTotal', root).textContent = money(c.total);
      }
      $('#posTotals', root).innerHTML = '<div class="row"><span>Products in cart</span><span>' + items + '</span></div><div class="row"><span>Total payable</span><span class="big">' + money(c.total) + '</span></div>' +
        (!isNaN(c.paid) ? '<div class="row"><span>Amount paid</span><span>' + money(c.paid) + '</span></div><div class="row"><span>' + (c.change > 0 ? 'Change to give' : 'Balance remaining') + '</span><b>' + money(c.change > 0 ? c.change : c.balance) + '</b></div>' : '');
      const short = c.total > 0 && !isNaN(c.paid) && c.paid < c.total;
      $('#debtorBox', root).classList.toggle('hidden', !short);
      $('#refField', root).classList.toggle('hidden', S.pay.method === 'Cash');
      $('#payStatus', root).innerHTML = c.total > 0 && !isNaN(c.paid) ? (short ? '<div class="pay-status debt">NOT PAID IN FULL · customer will owe ' + money(c.balance) + '</div>' : '<div class="pay-status ok">PAID IN FULL' + (c.change > 0 ? ' · change ' + money(c.change) : '') + '</div>') : '';
      $('#posErr', root).textContent = c.issues[0] || '';
      $('#posConfirm', root).disabled = S.busySale || !S.cart.length || c.issues.length > 0;
    },
    async confirm() {
      const root = this.root;
      const c = cartCalc();
      const err = $('#posErr', root);
      if (!S.cart.length) { err.textContent = 'Add at least one product.'; return; }
      if (c.issues.length) { err.textContent = c.issues[0]; return; }
      if (S.pay.paid === '' || isNaN(c.paid)) { err.textContent = 'Enter the amount paid by the customer (enter 0 if nothing was paid).'; $('#posPay', root).elements.paid.focus(); return; }
      if (c.paid < c.total) {
        if ((S.pay.name || '').trim().length < 3) { err.textContent = "Customer hasn't paid in full - enter the customer's full name."; $('#posPay', root).elements.name.focus(); return; }
        if (!/^[+0-9][0-9 ]{8,15}$/.test((S.pay.phone || '').trim())) { err.textContent = 'Enter a valid phone number for the customer (e.g. 0712345678).'; $('#posPay', root).elements.phone.focus(); return; }
      }
      if (S.busySale) return;
      S.busySale = true;
      const btn = $('#posConfirm', root);
      btn.disabled = true;
      btn.textContent = 'Saving sale…';
      try {
        const sale = await S.logic.completeSale(S.cartSaleId, S.cart.map((l) => ({ productId: l.productId, mode: l.mode, value: Number(l.value) })), { amountPaid: c.paid, method: S.pay.method, customerName: c.paid < c.total ? S.pay.name : '', customerPhone: c.paid < c.total ? S.pay.phone : '', reference: S.pay.method === 'Cash' ? '' : S.pay.ref });
        resetCart();
        S.busySale = false;
        if (S.view === this) { this.syncForm(); this.renderCart(); }
        showReceipt(sale, true);
      } catch (e) {
        S.busySale = false;
        console.error(e);
        if (/already recorded/.test(e.message)) resetCart();
        err.textContent = e.message;
        toast(e.message, 'error');
        if (S.view === this) this.renderCart();
      } finally {
        const b = $('#posConfirm', root);
        if (b) b.textContent = 'Confirm sale';
      }
    },
  };

  // ---------------------------------------------------------------- Sales History
  function filterSales(f) {
    const [from, to] = rangeFor(f.range, f.from, f.to);
    const q = (f.q || '').trim().toLowerCase();
    return S.sales.filter((s) => s.at >= from && s.at < to &&
      (!q || s.receiptNo.toLowerCase().includes(q) || (s.customerName || '').toLowerCase().includes(q) || (s.customerPhone || '').includes(q) || (s.sellerName || '').toLowerCase().includes(q) || s.items.some((l) => l.name.toLowerCase().includes(q))) &&
      (!f.status || (f.status === 'paid' ? !s.reversed && s.balanceDue <= 0 : f.status === 'owing' ? !s.reversed && s.balanceDue > 0 : s.reversed)) &&
      (!f.method || s.method === f.method) && (!f.seller || s.sellerId === f.seller));
  }
  function filterBar(prefix, f, extra) {
    return `<div class="toolbar">
      <input class="input search" data-f="q" placeholder="Search receipt no., product, customer, phone…" value="${esc(f.q)}">
      <div class="seg" data-seg>${[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All'], ['custom', 'Dates']].map((x) => '<button type="button" data-range="' + x[0] + '" class="' + (f.range === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('')}</div>
      <input class="input ${f.range === 'custom' ? '' : 'hidden'}" type="date" data-f="from" value="${esc(f.from)}" aria-label="From date">
      <input class="input ${f.range === 'custom' ? '' : 'hidden'}" type="date" data-f="to" value="${esc(f.to)}" aria-label="To date">
      ${extra || ''}</div>`;
  }
  function bindFilters(root, f, cb) {
    $$('[data-f]', root).forEach((el) => { el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => { f[el.dataset.f] = el.value; cb(); }); });
    on(root, 'click', '[data-range]', (el) => {
      f.range = el.dataset.range;
      $$('[data-range]', root).forEach((b) => b.classList.toggle('on', b === el));
      $$('[data-f=from],[data-f=to]', root).forEach((i) => i.classList.toggle('hidden', f.range !== 'custom'));
      if (f.range === 'custom' && !f.from) { f.from = dayKey(Date.now()); f.to = f.from; $('[data-f=from]', root).value = f.from; $('[data-f=to]', root).value = f.to; }
      cb();
    });
  }
  VIEWS.sales = {
    title: 'Sales History',
    render(root) {
      V.sales = V.sales || { q: '', range: 'today', from: '', to: '', status: '', method: '', seller: '', limit: 100 };
      const f = V.sales;
      const admin = isAdmin();
      root.innerHTML = `
        ${admin ? '' : '<div class="alert blue"><div>You can see the sales made by <b>all sellers</b>. Choose your name in the seller filter to see only yours.</div></div>'}
        <div class="card"><div class="card-h" style="display:block">
          ${filterBar('s', f, `
            <select class="input" data-f="status"><option value="">All payment statuses</option><option value="paid">Paid in full</option><option value="owing">Not fully paid (debt)</option><option value="reversed">Reversed</option></select>
            <select class="input" data-f="method"><option value="">All methods</option><option>Cash</option><option>M-Pesa</option><option>Bank</option><option>Other</option></select>
            <select class="input" data-f="seller" id="shSeller"></select>`)}
        </div>
        <div class="grid stats" id="shStats" style="padding:16px 18px 0;margin:0"></div>
        <div class="card-b flush table-wrap" id="shTable"></div></div>`;
      $('[data-f=status]', root).value = f.status;
      $('[data-f=method]', root).value = f.method;
      bindFilters(root, f, () => { f.limit = 100; this.update(); });
      on(root, 'click', '[data-view]', (el) => { const s = S.sales.find((x) => x.id === el.dataset.view); if (s) saleDetail(s); });
      on(root, 'click', '[data-rcpt]', (el) => { const s = S.sales.find((x) => x.id === el.dataset.rcpt); if (s) showReceipt(s); });
      on(root, 'click', '[data-more]', () => { f.limit += 200; this.update(); });
    },
    update() {
      const root = this.root;
      const f = V.sales;
      const admin = isAdmin();
      const ss = $('#shSeller', root);
      if (ss) { ss.innerHTML = '<option value="">All sellers</option>' + S.users.map((u) => '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>').join(''); ss.value = f.seller; }
      const list = filterSales(f);
      const valid = list.filter((s) => !s.reversed);
      const sm = Reports.summarize(valid);
      const paidAmt = r2(valid.reduce((s, x) => s + x.amountApplied, 0));
      const stat = (l, v, c) => '<div class="stat ' + (c || '') + '"><div class="label">' + l + '</div><div class="value">' + v + '</div></div>';
      $('#shStats', root).innerHTML = stat('Transactions', fmtNum(sm.count, 0)) + stat('Total sales', money(sm.revenue), 'grey') + stat('Amount paid', money(paidAmt)) + stat('Unpaid balance', money(sm.balance), sm.balance > 0 ? 'red' : 'grey') + (admin ? stat('Profit', money(sm.profit)) : '');
      const shown = list.slice(0, f.limit);
      $('#shTable', root).innerHTML = shown.length ? `<table class="t"><thead><tr><th>Transaction / Receipt</th><th>Date &amp; time</th><th>Products</th><th class="num">Qty</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Payment status</th><th>Method</th>${admin ? '<th class="num">Profit</th>' : ''}<th>Seller</th><th>Customer</th><th></th></tr></thead><tbody>` +
        shown.map((s) => `<tr class="${s.reversed ? 'row-reversed' : isOverdue(s) ? 'row-overdue' : ''}"><td class="nowrap"><a href="javascript:void 0" data-view="${esc(s.id)}"><b>${esc(s.receiptNo)}</b></a></td><td class="nowrap">${fmtDT(s.at)}</td>
          <td>${esc(s.items.map((l) => l.name).join(', '))}</td><td class="num">${esc(s.items.map(lineQty).join(', '))}</td><td class="num"><b>${fmtNum(s.total)}</b></td><td class="num">${fmtNum(s.amountApplied)}</td><td class="num ${s.balanceDue > 0 && !s.reversed ? 'text-red' : ''}">${fmtNum(s.balanceDue)}</td>
          <td>${payBadge(s)}</td><td>${esc(s.method)}</td>${admin ? '<td class="num">' + fmtNum(s.profit) + '</td>' : ''}<td class="nowrap">${who(s.sellerId, s.sellerName)}</td>
          <td>${s.customerName ? esc(s.customerName) + '<div class="small">' + telLink(s.customerPhone) + '</div>' : '<span class="muted">—</span>'}</td>
          <td class="nowrap"><div class="btn-row"><button class="btn sm secondary" data-view="${esc(s.id)}">View</button><button class="btn sm secondary" data-rcpt="${esc(s.id)}">Receipt</button></div></td></tr>`).join('') +
        '</tbody></table>' + (list.length > shown.length ? '<div class="center" style="padding:14px"><button class="btn secondary" data-more>Show more (' + (list.length - shown.length) + ' remaining)</button></div>' : '') :
        '<div class="empty">No sales found for this filter.</div>';
    },
  };

  // ---------------------------------------------------------------- Receipts
  VIEWS.receipts = {
    title: 'Receipts',
    render(root) {
      V.rc = V.rc || { q: '', range: 'week', from: '', to: '' };
      root.innerHTML = `<div class="card"><div class="card-h" style="display:block">${filterBar('r', V.rc)}</div><div class="card-b flush table-wrap" id="rcTable"></div></div>`;
      bindFilters(root, V.rc, () => this.update());
      const find = (id) => S.sales.find((x) => x.id === id);
      on(root, 'click', '[data-act]', (el) => {
        const s = find(el.dataset.id);
        if (!s) return;
        if (el.dataset.act === 'view') showReceipt(s);
        if (el.dataset.act === 'print') printReceipt(s);
        if (el.dataset.act === 'pdf') pdfReceipt(s);
      });
    },
    update() {
      const list = filterSales(V.rc).slice(0, 300);
      $('#rcTable', this.root).innerHTML = list.length ? '<table class="t"><thead><tr><th>Receipt no.</th><th>Date &amp; time</th><th>Items</th><th class="num">Total</th><th>Status</th><th>Served by</th><th>Customer</th><th></th></tr></thead><tbody>' +
        list.map((s) => '<tr class="' + (s.reversed ? 'row-reversed' : '') + '"><td><b>' + esc(s.receiptNo) + '</b></td><td class="nowrap">' + fmtDT(s.at) + '</td><td class="num">' + s.itemCount + '</td><td class="num">' + money(s.total) + '</td><td>' + payBadge(s) + '</td><td>' + esc(s.sellerName) + '</td><td>' + esc(s.customerName || '—') + '</td><td class="nowrap"><div class="btn-row"><button class="btn sm secondary" data-act="view" data-id="' + esc(s.id) + '">View</button><button class="btn sm secondary" data-act="print" data-id="' + esc(s.id) + '">' + icon('print') + 'Reprint</button><button class="btn sm secondary" data-act="pdf" data-id="' + esc(s.id) + '">' + icon('download') + 'PDF</button></div></td></tr>').join('') + '</tbody></table>' :
        '<div class="empty">No receipts for this period.</div>';
    },
  };

  // ---------------------------------------------------------------- Debts
  VIEWS.debts = {
    title: 'Debts',
    render(root) {
      V.debts = V.debts || {};
      V.debts.tab = V.debts.tab || 'open';
      V.debts.q = V.debts.q || '';
      const admin = isAdmin();
      root.innerHTML = `
        <div class="alert blue"><div>Customers who paid <b>less than the full amount</b> appear here with the seller who served them. Debts unpaid for more than <b>${debtHours()} hours</b> are marked <b>OVERDUE</b> and trigger a reminder${admin ? '' : ' (you see customers you sold to)'}.</div></div>
        <div class="grid stats" id="dbStats"></div>
        <div class="card"><div class="card-h">
          <div class="seg" id="dbTabs">${[['open', 'Outstanding'], ['overdue', 'Overdue'], ['cleared', 'Cleared'], ['all', 'All']].map((x) => '<button type="button" data-tab="' + x[0] + '" class="' + (V.debts.tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('')}</div>
          <input class="input search" id="dbQ" style="flex:1;min-width:200px" placeholder="Search customer name, phone, receipt, seller…" value="${esc(V.debts.q)}">
        </div><div class="card-b flush table-wrap" id="dbTable"></div></div>`;
      on(root, 'click', '[data-tab]', (el) => { V.debts.tab = el.dataset.tab; $$('[data-tab]', root).forEach((b) => b.classList.toggle('on', b === el)); this.update(); });
      $('#dbQ', root).oninput = (e) => { V.debts.q = e.target.value; this.update(); };
      on(root, 'click', '[data-act]', (el) => {
        const s = S.sales.find((x) => x.id === el.dataset.id);
        if (!s) return;
        if (el.dataset.act === 'pay') paymentDialog(s);
        if (el.dataset.act === 'view') saleDetail(s);
        if (el.dataset.act === 'edit') customerDialog(s);
        if (el.dataset.act === 'msg') composeDialog(s.sellerId, 'Please follow up on the debt of ' + s.customerName + ' (' + s.customerPhone + '), receipt ' + s.receiptNo + ', balance ' + money(s.balanceDue) + '.');
      });
    },
    tick() { this.update(); },
    update() {
      const root = this.root;
      const admin = isAdmin();
      const all = mySales().filter((s) => !s.reversed && (s.balanceDue > 0 || (s.payments || []).length > 1 || s.customerName && s.clearedAt && s.clearedAt > s.at));
      const open = all.filter((s) => s.balanceDue > 0);
      const od = open.filter(isOverdue);
      const total = r2(open.reduce((a, s) => a + s.balanceDue, 0));
      const stat = (l, v, sub, c) => '<div class="stat ' + (c || '') + '"><div class="label">' + l + '</div><div class="value">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      $('#dbStats', root).innerHTML = stat('Total owed by customers', money(total), open.length + ' unpaid sale(s)', total > 0 ? 'red' : '') + stat('Debtors', String(new Set(open.map((s) => (s.customerPhone || '') + '|' + (s.customerName || '').toLowerCase())).size), 'unique customers', 'grey') +
        stat('Overdue (> ' + debtHours() + ' h)', String(od.length), money(od.reduce((a, s) => a + s.balanceDue, 0)), od.length ? 'red' : 'grey') + stat('Cleared debts', String(all.filter((s) => s.balanceDue <= 0).length), 'fully paid later');
      const q = V.debts.q.trim().toLowerCase();
      const tab = V.debts.tab;
      const list = all.filter((s) => (tab === 'all' || (tab === 'open' ? s.balanceDue > 0 : tab === 'overdue' ? isOverdue(s) : s.balanceDue <= 0)) &&
        (!q || (s.customerName || '').toLowerCase().includes(q) || (s.customerPhone || '').includes(q) || s.receiptNo.toLowerCase().includes(q) || (s.sellerName || '').toLowerCase().includes(q)))
        .sort((a, b) => (b.balanceDue > 0) - (a.balanceDue > 0) || a.at - b.at);
      $('#dbTable', root).innerHTML = list.length ? '<table class="t"><thead><tr><th>Customer</th><th>Phone</th><th>Receipt</th><th>Sold on</th><th>Age</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th>Sold by</th><th></th></tr></thead><tbody>' +
        list.map((s) => '<tr class="' + (isOverdue(s) ? 'row-overdue' : '') + '"><td><b>' + esc(s.customerName || '—') + '</b></td><td class="nowrap">' + telLink(s.customerPhone) + '</td><td class="nowrap"><a href="javascript:void 0" data-act="view" data-id="' + esc(s.id) + '">' + esc(s.receiptNo) + '</a></td><td class="nowrap">' + fmtDT(s.at) + '</td><td class="nowrap">' + (s.balanceDue > 0 ? ago(s.at) : 'cleared ' + (s.clearedAt ? fmtD(s.clearedAt) : '')) + '</td>' +
          '<td class="num">' + fmtNum(s.total) + '</td><td class="num">' + fmtNum(s.amountApplied) + '</td><td class="num ' + (s.balanceDue > 0 ? 'text-red' : '') + '"><b>' + fmtNum(s.balanceDue) + '</b></td><td>' + payBadge(s) + '</td><td class="nowrap">' + who(s.sellerId, s.sellerName) + '</td>' +
          '<td class="nowrap"><div class="btn-row">' + (s.balanceDue > 0 ? '<button class="btn sm" data-act="pay" data-id="' + esc(s.id) + '">Record payment</button><button class="btn sm secondary" data-act="edit" data-id="' + esc(s.id) + '">Edit</button>' : '') + (admin && s.balanceDue > 0 && s.sellerId !== S.uid ? '<button class="btn sm secondary" data-act="msg" data-id="' + esc(s.id) + '">Message seller</button>' : '') + '</div></td></tr>').join('') + '</tbody></table>' :
        '<div class="empty">' + (tab === 'cleared' ? 'No cleared debts yet.' : 'No customer debts. 🎉') + '</div>';
    },
  };

  // ---------------------------------------------------------------- Profit & Reports (admin)
  VIEWS.profit = {
    title: 'Profit & Financial Reports',
    render(root) {
      V.pr = V.pr || { range: 'month', from: '', to: '' };
      const f = V.pr;
      root.innerHTML = `
        <div class="grid stats" id="prFixed"></div>
        <div class="card"><div class="card-h">
          <div class="seg">${[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['custom', 'Date range'], ['all', 'Overall']].map((x) => '<button type="button" data-range="' + x[0] + '" class="' + (f.range === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('')}</div>
          <input class="input ${f.range === 'custom' ? '' : 'hidden'}" type="date" data-f="from" value="${esc(f.from)}" style="width:auto"> <input class="input ${f.range === 'custom' ? '' : 'hidden'}" type="date" data-f="to" value="${esc(f.to)}" style="width:auto">
          <span style="flex:1"></span>
          <button class="btn secondary" id="prPrint">${icon('print')}Print</button><button class="btn" id="prPdf">${icon('download')}Download PDF</button>
        </div>
        <div class="card-b"><div id="prLabel" class="muted" style="margin-bottom:10px"></div><div class="grid stats" id="prStats" style="margin:0"></div>
          <div class="alert blue" style="margin:4px 0 0"><div><b>Revenue is not profit.</b> Profit = (selling price − buying price) × quantity, using the prices stored on each sale at the moment it was made. Reversed sales are excluded.</div></div></div></div>
        <div class="card"><div class="card-h"><h3>Daily revenue and profit</h3></div><div class="card-b"><div class="chart-box"><canvas id="prChart"></canvas></div></div></div>
        <div class="card"><div class="card-h"><h3>Profit per product</h3></div><div class="card-b flush table-wrap" id="prTable"></div></div>`;
      bindFilters(root, f, () => this.update());
      $('#prPrint', root).onclick = () => { const r = this.reportData(); reportPrint('Profit & Financial Report', r.label, r.blocks); };
      $('#prPdf', root).onclick = () => { const r = this.reportData(); reportPDF('Profit & Financial Report', r.label, r.blocks, 'Profit-Report-' + dayKey(Date.now()) + '.pdf'); };
    },
    reportData() {
      const f = V.pr;
      const [from, to, label] = rangeFor(f.range, f.from, f.to);
      const sales = Reports.between(S.sales, from, to);
      const sm = Reports.summarize(sales);
      const rows = Reports.byProduct(sales);
      const collected = Reports.collected(S.sales, from, to);
      const staff = Reports.staffCost(S.payroll, from, to);
      const net = r2(sm.profit - staff);
      return {
        from, to, label, sales, sm, rows, collected, staff, net,
        blocks: [
          { heading: 'Summary', body: [['Transactions', String(sm.count)], ['Units sold', String(sm.units)], ['Total revenue (sales value)', money(sm.revenue)], ['Cost of goods sold (buying cost)', money(sm.cost)], ['Gross profit', money(sm.profit)], ['Profit margin', sm.revenue ? ((sm.profit / sm.revenue) * 100).toFixed(1) + '%' : '0%'], ['Salaries, commission & staff payments', money(staff)], ['NET PROFIT after staff costs', money(net)], ['Money collected in period', money(collected)], ['Still owed on these sales', money(sm.balance)]], numCols: [1], colStyles: { 1: { halign: 'right' } } },
          { heading: 'Profit per product', head: ['Product', 'Buying price/unit', 'Selling price/unit', 'Qty sold', 'Total sales', 'Cost of goods', 'Total profit'], body: rows.map((r) => [r.name, fmtNum(r.avgBuy), fmtNum(r.avgSell), qtyU(r.qty, r.unit), fmtNum(r.revenue), fmtNum(r.cost), fmtNum(r.profit)]), foot: ['TOTAL', '', '', String(sm.units), fmtNum(sm.revenue), fmtNum(sm.cost), fmtNum(sm.profit)], numCols: [1, 2, 3, 4, 5, 6], colStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } },
        ],
      };
    },
    update() {
      const root = this.root;
      const now = Date.now();
      const p = (k) => Reports.summarize(Reports.between(S.sales, ...rangeFor(k).slice(0, 2)));
      const all = Reports.summarize(Reports.valid(S.sales));
      const stat = (l, v, sub, c) => '<div class="stat ' + (c || '') + '"><div class="label">' + l + '</div><div class="value">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      const t = p('today'); const w = p('week'); const m = p('month');
      $('#prFixed', root).innerHTML = stat('Gross profit today', money(t.profit), 'revenue ' + money(t.revenue)) + stat('Profit this week', money(w.profit), 'revenue ' + money(w.revenue), 'grey') + stat('Profit this month', money(m.profit), 'revenue ' + money(m.revenue)) + stat('Overall business profit', money(all.profit), 'all-time revenue ' + money(all.revenue), 'grey');
      const r = this.reportData();
      $('#prLabel', root).textContent = 'Period: ' + r.label;
      const sm = r.sm;
      $('#prStats', root).innerHTML = stat('Total revenue', money(sm.revenue), sm.count + ' sales · ' + sm.units + ' units', 'grey') + stat('Cost of goods sold', money(sm.cost), 'buying price of items sold', 'grey') + stat('Gross profit', money(sm.profit), sm.revenue ? 'margin ' + ((sm.profit / sm.revenue) * 100).toFixed(1) + '%' : '', sm.profit < 0 ? 'red' : '') + stat('Staff costs', money(r.staff), 'salaries, commission, bonuses paid', 'grey') + stat('Net profit', money(r.net), 'gross profit − staff costs', r.net < 0 ? 'red' : '') + stat('Money collected', money(r.collected), 'payments received in period') + stat('Unpaid by customers', money(sm.balance), 'from sales in period', sm.balance > 0 ? 'red' : 'grey');
      $('#prTable', root).innerHTML = r.rows.length ? '<table class="t"><thead><tr><th>Product</th><th class="num">Buying price / unit</th><th class="num">Selling price / unit</th><th class="num">Qty sold</th><th class="num">Total sales</th><th class="num">Cost of goods sold</th><th class="num">Total profit</th><th class="num">Margin</th></tr></thead><tbody>' +
        r.rows.map((x) => '<tr><td><b>' + esc(x.name) + '</b></td><td class="num">' + fmtNum(x.avgBuy) + '</td><td class="num">' + fmtNum(x.avgSell) + '</td><td class="num">' + esc(qtyU(x.qty, x.unit)) + '</td><td class="num">' + fmtNum(x.revenue) + '</td><td class="num">' + fmtNum(x.cost) + '</td><td class="num ' + (x.profit < 0 ? 'text-red' : 'text-green') + '"><b>' + fmtNum(x.profit) + '</b></td><td class="num">' + (x.revenue ? ((x.profit / x.revenue) * 100).toFixed(1) + '%' : '—') + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td>TOTAL</td><td></td><td></td><td class="num">' + sm.units + '</td><td class="num">' + fmtNum(sm.revenue) + '</td><td class="num">' + fmtNum(sm.cost) + '</td><td class="num">' + fmtNum(sm.profit) + '</td><td class="num">' + (sm.revenue ? ((sm.profit / sm.revenue) * 100).toFixed(1) + '%' : '') + '</td></tr></tfoot></table>' : '<div class="empty">No sales in this period.</div>';
      let from = r.from;
      let to = Math.min(r.to, addDays(startOfDay(now), 1));
      if (V.pr.range === 'all') { const first = S.sales.length ? Math.min(...S.sales.map((s) => s.at)) : now; from = startOfDay(first); }
      let days = Math.max(1, Math.round((to - from) / 86400000));
      if (days > 62) { from = addDays(to, -62); days = 62; }
      const ds = dailySeries(S.sales, from, days);
      barChart($('#prChart', root), 'profit', ds.labels, [{ label: 'Revenue', data: ds.rev, color: COLS.sales }, { label: 'Profit', data: ds.prof, color: COLS.profit }]);
    },
  };

  // ---------------------------------------------------------------- Daily Reports
  VIEWS.daily = {
    title: 'Daily Sales Report',
    render(root) {
      V.day = V.day || { date: dayKey(Date.now()) };
      root.innerHTML = `
        <div class="card"><div class="card-h">
          <button class="btn secondary sm" data-shift="-1">‹ Previous day</button>
          <input class="input" type="date" id="dyDate" value="${esc(V.day.date)}" style="width:auto">
          <button class="btn secondary sm" data-shift="1">Next day ›</button>
          <button class="btn ghost sm" data-shift="0">Today</button>
          <span style="flex:1"></span>
          <button class="btn secondary" id="dyPrint">${icon('print')}Print</button><button class="btn" id="dyPdf">${icon('download')}Download PDF</button>
        </div><div class="card-b"><h3 id="dyTitle" style="margin-bottom:12px"></h3><div class="grid stats" id="dyStats" style="margin:0"></div></div></div>
        <div class="two-col">
          <div class="card"><div class="card-h"><h3>Products sold</h3></div><div class="card-b flush table-wrap" id="dyProducts"></div></div>
          <div><div class="card"><div class="card-h"><h3>By payment method</h3></div><div class="card-b" id="dyMethods"></div></div>
          ${isAdmin() ? '<div class="card"><div class="card-h"><h3>By seller</h3></div><div class="card-b" id="dySellers"></div></div>' : ''}</div>
        </div>
        <div class="card"><div class="card-h"><h3>Transactions</h3></div><div class="card-b flush table-wrap" id="dySales"></div></div>`;
      $('#dyDate', root).onchange = (e) => { V.day.date = e.target.value || dayKey(Date.now()); this.update(); };
      on(root, 'click', '[data-shift]', (el) => { const n = Number(el.dataset.shift); V.day.date = n === 0 ? dayKey(Date.now()) : dayKey(addDays(parseDate(V.day.date), n)); $('#dyDate', root).value = V.day.date; this.update(); });
      on(root, 'click', '[data-sale]', (el) => { const s = S.sales.find((x) => x.id === el.dataset.sale); if (s) saleDetail(s); });
      $('#dyPrint', root).onclick = () => { const r = this.data(); reportPrint('Daily Sales Report', r.label, r.blocks); };
      $('#dyPdf', root).onclick = () => { const r = this.data(); reportPDF('Daily Sales Report', r.label, r.blocks, 'Daily-Report-' + V.day.date + '.pdf'); };
    },
    data() {
      const admin = isAdmin();
      const d0 = parseDate(V.day.date);
      const d1 = addDays(d0, 1);
      const sales = Reports.between(mySales(), d0, d1);
      const sm = Reports.summarize(sales);
      const best = Reports.bestSeller(sales);
      const collected = Reports.collected(mySales(), d0, d1);
      const prods = Reports.byProduct(sales).sort((a, b) => b.qty - a.qty);
      const methods = {};
      sales.forEach((s) => { (s.payments || []).filter((p) => p.at >= d0 && p.at < d1).forEach((p) => { methods[p.method] = r2((methods[p.method] || 0) + p.amount); }); });
      mySales().filter((s) => !s.reversed && (s.at < d0 || s.at >= d1)).forEach((s) => (s.payments || []).filter((p) => p.at >= d0 && p.at < d1).forEach((p) => { methods[p.method + ' (debt payments)'] = r2((methods[p.method + ' (debt payments)'] || 0) + p.amount); }));
      const sellers = {};
      sales.forEach((s) => { const k = s.sellerId; sellers[k] = sellers[k] || { name: s.sellerName, count: 0, revenue: 0, profit: 0 }; sellers[k].count++; sellers[k].revenue = r2(sellers[k].revenue + s.total); sellers[k].profit = r2(sellers[k].profit + s.profit); });
      const newDebt = r2(sales.reduce((a, s) => a + s.balanceDue, 0));
      const label = new Date(d0).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (admin ? '' : ' · seller: ' + S.me.name);
      const sumRows = [['Number of transactions', String(sm.count)], ['Total products sold (units)', String(sm.units)], ['Total sales value', money(sm.revenue)], ['Total money collected', money(collected)]];
      if (admin) sumRows.push(['Total cost of products sold', money(sm.cost)], ['Total profit', money(sm.profit)]);
      sumRows.push(['Unpaid balances from today', money(newDebt)], ['Best-selling product', best ? best.name + ' (' + qtyU(best.qty, best.unit) + ')' : '—']);
      const blocks = [
        { heading: 'Summary', body: sumRows, colStyles: { 1: { halign: 'right' } }, numCols: [1] },
        { heading: 'Products sold', head: admin ? ['Product', 'Qty', 'Sales', 'Cost', 'Profit'] : ['Product', 'Qty', 'Sales'], body: prods.map((p) => admin ? [p.name, qtyU(p.qty, p.unit), fmtNum(p.revenue), fmtNum(p.cost), fmtNum(p.profit)] : [p.name, qtyU(p.qty, p.unit), fmtNum(p.revenue)]), numCols: [1, 2, 3, 4], colStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } },
        { heading: 'Transactions', head: ['Receipt', 'Time', 'Seller', 'Total', 'Paid', 'Balance', 'Method'], body: sales.map((s) => [s.receiptNo, fmtT(s.at), s.sellerName, fmtNum(s.total), fmtNum(s.amountApplied), fmtNum(s.balanceDue), s.method]), numCols: [3, 4, 5], colStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } },
      ];
      return { d0, d1, sales, sm, best, collected, prods, methods, sellers, newDebt, label, blocks };
    },
    update() {
      const root = this.root;
      const admin = isAdmin();
      const r = this.data();
      $('#dyTitle', root).textContent = r.label;
      const stat = (l, v, sub, c) => '<div class="stat ' + (c || '') + '"><div class="label">' + l + '</div><div class="value">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      $('#dyStats', root).innerHTML = stat('Transactions', String(r.sm.count)) + stat('Products sold', String(r.sm.units), 'units', 'grey') + stat('Revenue', money(r.sm.revenue), 'value of goods sold') + stat('Money collected', money(r.collected), 'incl. debt payments', 'grey') +
        (admin ? stat('Cost of products sold', money(r.sm.cost), '', 'grey') + stat('Profit', money(r.sm.profit), '', r.sm.profit < 0 ? 'red' : '') : '') +
        stat('New unpaid balances', money(r.newDebt), '', r.newDebt > 0 ? 'red' : 'grey') + stat('Best-selling product', r.best ? esc(r.best.name) : '—', r.best ? qtyU(r.best.qty, r.best.unit) + ' · ' + money(r.best.revenue) : 'no sales', 'amber');
      $('#dyProducts', root).innerHTML = r.prods.length ? '<table class="t"><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Sales</th>' + (admin ? '<th class="num">Cost</th><th class="num">Profit</th>' : '') + '</tr></thead><tbody>' + r.prods.map((p) => '<tr><td>' + esc(p.name) + '</td><td class="num">' + esc(qtyU(p.qty, p.unit)) + '</td><td class="num">' + fmtNum(p.revenue) + '</td>' + (admin ? '<td class="num">' + fmtNum(p.cost) + '</td><td class="num">' + fmtNum(p.profit) + '</td>' : '') + '</tr>').join('') + '</tbody></table>' : '<div class="empty">No products sold on this day.</div>';
      const mk = Object.keys(r.methods);
      $('#dyMethods', root).innerHTML = mk.length ? '<ul class="list-plain">' + mk.map((k) => '<li><span>' + esc(k) + '</span><b>' + money(r.methods[k]) + '</b></li>').join('') + '</ul>' : '<div class="muted">No payments received.</div>';
      const sel = $('#dySellers', root);
      if (sel) { const sk = Object.keys(r.sellers); sel.innerHTML = sk.length ? '<ul class="list-plain">' + sk.map((k) => '<li><span>' + who(k, r.sellers[k].name) + ' <span class="muted small">' + r.sellers[k].count + ' sales</span></span><span class="right"><b>' + money(r.sellers[k].revenue) + '</b><div class="small muted">profit ' + money(r.sellers[k].profit) + '</div></span></li>').join('') + '</ul>' : '<div class="muted">No sales.</div>'; }
      $('#dySales', root).innerHTML = r.sales.length ? '<table class="t"><thead><tr><th>Receipt</th><th>Time</th><th>Products</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th><th>Method</th><th>Seller</th></tr></thead><tbody>' + r.sales.map((s) => '<tr><td><a href="javascript:void 0" data-sale="' + esc(s.id) + '">' + esc(s.receiptNo) + '</a></td><td>' + fmtT(s.at) + '</td><td>' + esc(s.items.map((l) => l.name + ' × ' + lineQty(l)).join(', ')) + '</td><td class="num">' + fmtNum(s.total) + '</td><td class="num">' + fmtNum(s.balanceDue) + '</td><td>' + payBadge(s) + '</td><td>' + esc(s.method) + '</td><td>' + esc(s.sellerName) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">No transactions on this day.</div>';
    },
  };

  // ---------------------------------------------------------------- Messages
  function composeDialog(toUid, preset) {
    const admin = isAdmin();
    const sellers = S.users.filter((u) => u.id !== S.uid && u.active !== false);
    const m = openModal({
      title: admin ? 'New message to sellers' : 'Message the administrator',
      body: (admin ? '<div class="field"><label>To</label><select class="input" id="cmTo"><option value="all">📢 All sellers</option>' + sellers.map((u) => '<option value="' + esc(u.id) + '" ' + (u.id === toUid ? 'selected' : '') + '>' + esc(u.name) + ' (' + (u.role === 'admin' ? 'admin' : 'seller') + ')</option>').join('') + '</select></div>' : '<p class="muted">Your message goes to the shop administrator.</p>') +
        '<div class="field"><label>Message</label><textarea class="input" id="cmText" rows="5" maxlength="2000" placeholder="e.g. Please recount the sugar stock before closing.">' + esc(preset || '') + '</textarea></div>',
      footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>' + icon('send') + 'Send</button>',
    });
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => {
      const to = admin ? $('#cmTo', m.el).value : 'admins';
      const msg = await S.logic.sendMessage(to, $('#cmText', m.el).value);
      m.close();
      toast('Message sent.');
      V.msg = Object.assign(V.msg || {}, { thread: msg.threadId });
      if (S.route === 'messages') S.view.update(); else go('messages');
    });
  }
  function threadTitle(root) {
    if (!root) return '';
    if (root.toUid === 'all') return '📢 All sellers';
    if (isAdmin()) {
      const other = root.fromRole === 'admin' ? (root.toUid === 'admins' ? null : root.toUid) : root.fromUid;
      const u = other && userById(other);
      return u ? u.name : root.fromRole === 'admin' ? 'Administrators' : root.fromName;
    }
    return root.fromUid === S.uid ? 'Administrator' : root.fromName + ' (Admin)';
  }
  VIEWS.messages = {
    title: 'Messages',
    render(root) {
      V.msg = V.msg || { thread: null };
      root.innerHTML = `<div class="card"><div class="card-h"><h3>${isAdmin() ? 'Messages with sellers' : 'Messages with the administrator'}</h3><button class="btn" id="msgNew">${icon('plus')}${isAdmin() ? 'New message' : 'Message admin'}</button></div>
        <div class="msg-layout"><div class="thread-list" id="thList"></div><div class="thread-view" id="thView"></div></div></div>`;
      $('#msgNew', root).onclick = () => composeDialog();
      on(root, 'click', '[data-thread]', (el) => { V.msg.thread = el.dataset.thread; this.update(); });
    },
    update() {
      const root = this.root;
      const groups = {};
      S.messages.forEach((m) => { (groups[m.threadId] = groups[m.threadId] || []).push(m); });
      const threads = Object.entries(groups).map(([id, arr]) => { arr.sort((a, b) => a.at - b.at); return { id, msgs: arr, last: arr[arr.length - 1], root: arr[0] }; }).sort((a, b) => b.last.at - a.last.at);
      const unreadIds = new Set(myUnread().map((m) => m.id));
      if (!V.msg.thread || !groups[V.msg.thread]) V.msg.thread = threads[0] ? threads[0].id : null;
      $('#thList', root).innerHTML = threads.length ? threads.map((t) => {
        const unread = t.msgs.filter((m) => unreadIds.has(m.id)).length;
        const otherUid = t.root.toUid === 'all' ? null : isAdmin() ? (t.root.fromRole === 'admin' ? t.root.toUid : t.root.fromUid) : t.root.fromUid === S.uid ? null : t.root.fromUid;
        return '<div class="thread-item ' + (t.id === V.msg.thread ? 'on ' : '') + (unread ? 'unread' : '') + '" data-thread="' + esc(t.id) + '">' + (otherUid ? avatar(otherUid, threadTitle(t.root)) : '<span class="avatar">' + (t.root.toUid === 'all' ? '📢' : 'A') + '</span>') + '<div style="min-width:0;flex:1"><div style="display:flex;gap:6px;justify-content:space-between"><span class="tt">' + esc(threadTitle(t.root)) + '</span><span class="small muted nowrap">' + ago(t.last.at) + '</span></div><div class="snip">' + esc(t.last.fromUid === S.uid ? 'You: ' + t.last.text : t.last.text) + '</div></div>' + (unread ? '<span class="count-badge">' + unread + '</span>' : '') + '</div>';
      }).join('') : '<div class="empty">No messages yet.</div>';
      const view = $('#thView', root);
      const t = threads.find((x) => x.id === V.msg.thread);
      if (!t) { view.innerHTML = '<div class="empty">' + (isAdmin() ? 'Send a message to one seller or to all sellers. They will see it pop up on their screens and can reply.' : 'Messages from the administrator appear here. You can reply to them.') + '</div>'; return; }
      const prevText = $('#thReply', view) ? $('#thReply', view).value : '';
      const hadFocus = document.activeElement && document.activeElement.id === 'thReply';
      view.innerHTML = '<div class="card-h"><h3>' + esc(threadTitle(t.root)) + '</h3></div><div class="bubbles" id="thBubbles">' + t.msgs.map((m) => '<div class="bubble ' + (m.fromUid === S.uid ? 'mine' : '') + '">' + avatar(m.fromUid, m.fromName, 'sm') + '<div><div class="body">' + esc(m.text) + '</div><div class="meta">' + esc(m.fromUid === S.uid ? 'You' : m.fromName) + ' · ' + fmtDT(m.at) + (m.fromUid === S.uid && m.toUid !== 'admins' ? ' · ' + (Object.keys(m.readBy || {}).filter((k) => k !== S.uid).length ? 'seen' : 'sent') : '') + '</div></div></div>').join('') + '</div>' +
        '<form class="composer" id="thForm"><textarea class="input" id="thReply" maxlength="2000" placeholder="Write a reply…"></textarea><button class="btn" type="submit">' + icon('send') + 'Reply</button></form>';
      const ta = $('#thReply', view);
      ta.value = prevText;
      if (hadFocus) ta.focus();
      ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#thForm', view).requestSubmit(); } };
      const bub = $('#thBubbles', view);
      bub.scrollTop = bub.scrollHeight;
      $('#thForm', view).onsubmit = (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        guard(btn, async () => { await S.logic.sendMessage(replyTarget(t.id), ta.value, t.id); ta.value = ''; });
      };
      const mine = t.msgs.filter((m) => unreadIds.has(m.id)).map((m) => m.id);
      if (mine.length) { mine.forEach((id) => S.popped.add('m' + id)); S.logic.markRead(mine); }
    },
  };

  // ---------------------------------------------------------------- Users (admin)
  VIEWS.users = {
    title: 'Users & Sellers',
    render(root) {
      root.innerHTML = `<div class="card"><div class="card-h"><h3>User accounts</h3><button class="btn" id="uAdd">${icon('plus')}Add seller / user</button></div><div class="card-b flush table-wrap" id="uTable"></div></div>
        <div class="alert blue"><div>Give each seller their <b>username</b> and <b>password</b> and the website link. Sellers can record sales, view stock, print receipts, follow up their debts, see their own sales and reply to your messages. Only administrators see profits and financial reports.</div></div>`;
      $('#uAdd', root).onclick = () => this.addDialog();
      on(root, 'click', '[data-act]', async (el) => {
        const u = S.users.find((x) => x.id === el.dataset.id);
        if (!u) return;
        const a = el.dataset.act;
        if (a === 'edit') this.editDialog(u);
        if (a === 'msg') composeDialog(u.id);
        if (a === 'toggle') {
          const enable = u.active === false;
          if (await confirmBox(enable ? 'Enable account' : 'Disable account', (enable ? 'Allow <b>' + esc(u.name) + '</b> to log in again?' : '<b>' + esc(u.name) + '</b> will be logged out and will not be able to log in. Their sales records are kept.'), enable ? 'Enable' : 'Disable', !enable))
            guard(null, async () => { await S.logic.adminUpdateUser(u.id, { active: enable }); toast('Account ' + (enable ? 'enabled' : 'disabled') + '.'); });
        }
        if (a === 'pw') this.pwDialog(u);
      });
    },
    update() {
      const t0 = startOfDay(Date.now());
      const list = S.users.slice().sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) || a.name.localeCompare(b.name));
      $('#uTable', this.root).innerHTML = '<table class="t"><thead><tr><th>User</th><th>Username</th><th>Role</th><th>Phone</th><th>Status</th><th class="num">Sales today</th><th class="num">All-time sales</th><th class="num">Owed by their customers</th><th></th></tr></thead><tbody>' +
        list.map((u) => {
          const mine = S.sales.filter((s) => s.sellerId === u.id && !s.reversed);
          const today = mine.filter((s) => s.at >= t0);
          const owed = r2(mine.reduce((a, s) => a + s.balanceDue, 0));
          return '<tr><td>' + who(u.id, u.name) + (u.id === S.uid ? ' <span class="badge b-blue">You</span>' : '') + '</td><td><code>' + esc(u.username) + '</code></td><td>' + (u.role === 'admin' ? '<span class="badge b-green">ADMIN</span>' : '<span class="badge b-grey">SELLER</span>') + '</td><td>' + esc(u.phone || '—') + '</td><td>' + (u.active === false ? '<span class="badge b-red">Disabled</span>' : '<span class="badge b-green">Active</span>') + '</td>' +
            '<td class="num">' + today.length + ' · ' + fmtNum(today.reduce((a, s) => a + s.total, 0)) + '</td><td class="num">' + mine.length + ' · ' + fmtNum(mine.reduce((a, s) => a + s.total, 0)) + '</td><td class="num ' + (owed > 0 ? 'text-red' : '') + '">' + fmtNum(owed) + '</td>' +
            '<td class="nowrap"><div class="btn-row"><button class="btn sm secondary" data-act="edit" data-id="' + esc(u.id) + '">Edit</button>' + (u.id !== S.uid ? '<button class="btn sm secondary" data-act="msg" data-id="' + esc(u.id) + '">Message</button><button class="btn sm ' + (u.active === false ? '' : 'ghost text-red') + '" data-act="toggle" data-id="' + esc(u.id) + '">' + (u.active === false ? 'Enable' : 'Disable') + '</button>' : '') + (S.backend.mode === 'local' && u.id !== S.uid ? '<button class="btn sm secondary" data-act="pw" data-id="' + esc(u.id) + '">Reset password</button>' : '') + '</div></td></tr>';
        }).join('') + '</tbody></table>';
    },
    addDialog() {
      const m = openModal({
        title: 'Add seller / user',
        body: `<form id="uForm" class="form-grid" autocomplete="off">
          <div class="field full"><label>Full name *</label><input class="input" name="name" required maxlength="60"></div>
          <div class="field"><label>Username *</label><input class="input" name="username" required maxlength="30" autocapitalize="none" placeholder="e.g. jane"><span class="hint">Used to log in. No spaces.</span></div>
          <div class="field"><label>Password *</label><input class="input" name="password" type="text" required minlength="6" value="${esc(genId().slice(-8))}"><span class="hint">At least 6 characters. Share it with the seller.</span></div>
          <div class="field"><label>Phone</label><input class="input" name="phone" type="tel" maxlength="16"></div>
          <div class="field"><label>Role</label><select class="input" name="role"><option value="seller">Seller / Cashier</option><option value="admin">Administrator (full access)</option></select></div>
        </form>`,
        footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>Create account</button>',
      });
      m.el.querySelector('[data-x]').onclick = m.close;
      m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => {
        const d = formData($('#uForm', m.el));
        await S.logic.createUser(d);
        m.close();
        const info = openModal({ title: 'Account created', cls: 'narrow', body: '<p>Give these login details to <b>' + esc(d.name) + '</b>:</p><div class="receipt-preview"><div><b>Website:</b> ' + esc(location.href.split('#')[0]) + '</div><div><b>Username:</b> ' + esc(C.cleanUsername(d.username)) + '</div><div><b>Password:</b> ' + esc(d.password) + '</div></div>', footer: '<button class="btn" data-x>Done</button>' });
        info.el.querySelector('[data-x]').onclick = info.close;
      });
    },
    editDialog(u) {
      const m = openModal({
        title: 'Edit user · ' + esc(u.username),
        body: `<form id="ueForm" class="form-grid"><div class="field full"><label>Full name</label><input class="input" name="name" value="${esc(u.name)}"></div>
          <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(u.phone || '')}"></div>
          <div class="field"><label>Role</label><select class="input" name="role" ${u.id === S.uid ? 'disabled' : ''}><option value="seller" ${u.role !== 'admin' ? 'selected' : ''}>Seller / Cashier</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div></form>`,
        footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>Save</button>',
      });
      m.el.querySelector('[data-x]').onclick = m.close;
      m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => {
        const d = formData($('#ueForm', m.el));
        if (u.id === S.uid) delete d.role;
        await S.logic.adminUpdateUser(u.id, d);
        m.close();
        toast('User updated.');
      });
    },
    pwDialog(u) {
      const m = openModal({ title: 'Reset password · ' + esc(u.username), cls: 'narrow', body: '<div class="field"><label>New password</label><input class="input" id="npw" value="' + esc(genId().slice(-8)) + '" minlength="6"></div>', footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>Reset</button>' });
      m.el.querySelector('[data-x]').onclick = m.close;
      m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => { await S.backend.adminResetPassword(u.username, $('#npw', m.el).value); m.close(); toast('Password reset.'); });
    },
  };

  // ---------------------------------------------------------------- Settings (admin)
  VIEWS.settings = {
    title: 'Settings',
    render(root) {
      const st = S.settings;
      root.innerHTML = `
        <div class="two-col">
          <div class="card"><div class="card-h"><h3>Shop &amp; receipt settings</h3></div><div class="card-b">
            <form id="stForm" class="form-grid">
              <div class="field full"><label>Business name</label><input class="input" name="shopName" value="${esc(st.shopName)}" maxlength="60"></div>
              <div class="field full"><label>Address / location</label><input class="input" name="address" value="${esc(st.address)}" maxlength="100"></div>
              <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(st.phone)}" maxlength="30"></div>
              <div class="field"><label>Email</label><input class="input" name="email" value="${esc(st.email)}" maxlength="60"></div>
              <div class="field"><label>KRA PIN (optional)</label><input class="input" name="kraPin" value="${esc(st.kraPin)}" maxlength="20"></div>
              <div class="field"><label>Currency</label><input class="input" name="currency" value="${esc(st.currency)}" maxlength="6"></div>
              <div class="field"><label>Default minimum stock level</label><input class="input" type="number" min="0" name="lowStockDefault" value="${esc(st.lowStockDefault)}"></div>
              <div class="field"><label>Debt alert after (hours)</label><input class="input" type="number" min="1" name="debtAlertHours" value="${esc(st.debtAlertHours)}"></div>
              <div class="field"><label>Receipt paper size</label><select class="input" name="receiptPaper"><option value="80mm">80 mm thermal</option><option value="58mm">58 mm thermal</option><option value="A4">A4 / standard printer</option></select></div>
              <div class="field full"><label>Receipt footer message</label><input class="input" name="receiptFooter" value="${esc(st.receiptFooter)}" maxlength="140"></div>
              <div class="field full"><label>Product categories (one per line)</label><textarea class="input" name="categories" rows="6">${esc((st.categories || []).join('\n'))}</textarea></div>
              <div class="full"><button class="btn" type="submit">Save settings</button></div>
            </form></div></div>
          <div>
            <div class="card"><div class="card-h"><h3>Database</h3></div><div class="card-b">
              ${S.backend.mode === 'firebase' ? '<div class="alert green"><div><b>LIVE:</b> connected to the online Firebase database (project <code>' + esc(window.SHALOM_FIREBASE_CONFIG.projectId) + '</code>). All sellers share the same data in real time.</div></div>' : '<div class="alert blue"><div><b>Storage:</b> records are saved in this browser on this device. They stay after refresh and logout. When you host the system, follow README.md to switch to the shared online database.</div></div>'}
              <p class="muted">Download a full backup of products, sales, debts, stock movements and messages.</p>
              <button class="btn secondary" id="stBackup">${icon('download')}Download backup (JSON)</button>
            </div></div>
            <div class="card"><div class="card-h"><h3>Audit trail</h3></div><div class="card-b flush table-wrap" id="stAudit" style="max-height:420px;overflow:auto"></div></div>
          </div>
        </div>`;
      const form = $('#stForm', root);
      form.elements.receiptPaper.value = st.receiptPaper || '80mm';
      form.onsubmit = (e) => {
        e.preventDefault();
        guard(form.querySelector('button[type=submit]'), async () => {
          const d = formData(form);
          d.categories = d.categories.split('\n');
          await S.logic.saveSettings(d);
          toast('Settings saved.');
        });
      };
      $('#stBackup', root).onclick = () => {
        const data = { exportedAt: new Date().toISOString(), shop: S.settings.shopName, settings: S.settings, products: S.products, sales: S.sales, stockMoves: S.stockMoves, users: S.users.map((u) => Object.assign({}, u, { photo: undefined })), messages: S.messages, audit: S.audit };
        const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'shalom-backup-' + dayKey(Date.now()) + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      };
    },
    update() {
      const LABELS = { sale_reversed: 'Sale reversed', product_deleted: 'Product deleted', user_created: 'User created', user_updated: 'User updated', settings_updated: 'Settings updated' };
      $('#stAudit', this.root).innerHTML = S.audit.length ? '<table class="t"><thead><tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr></thead><tbody>' + S.audit.slice(0, 200).map((a) => '<tr><td class="nowrap small">' + fmtDT(a.at) + '</td><td><b>' + esc(LABELS[a.action] || a.action) + '</b></td><td>' + esc(a.byName) + '</td><td class="small">' + esc(Object.entries(a.details || {}).filter(([k]) => !/uid|Id$/.test(k)).map(([k, v]) => k + ': ' + v).join(' · ')) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">No audited actions yet.</div>';
    },
  };

  // ---------------------------------------------------------------- Team Sales (everyone sees all sellers)
  function rangeSeg(f, kinds) {
    return '<div class="seg">' + kinds.map((x) => '<button type="button" data-range="' + x[0] + '" class="' + (f.range === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>' +
      '<input class="input ' + (f.range === 'custom' ? '' : 'hidden') + '" type="date" data-f="from" value="' + esc(f.from) + '" style="width:auto" aria-label="From"> <input class="input ' + (f.range === 'custom' ? '' : 'hidden') + '" type="date" data-f="to" value="' + esc(f.to) + '" style="width:auto" aria-label="To">';
  }
  const commissionOf = (profit, rate) => r2(Math.max(0, profit) * (Number(rate) || 0) / 100);
  VIEWS.team = {
    title: 'Team Sales',
    render(root) {
      V.team = V.team || { range: 'today', from: '', to: '' };
      root.innerHTML = `
        <div class="card"><div class="card-h">${rangeSeg(V.team, [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Dates'], ['all', 'All time']])}</div>
          <div class="card-b"><div id="tmLabel" class="muted" style="margin-bottom:8px"></div><div class="chart-box"><canvas id="tmChart" aria-label="Sales by seller"></canvas></div></div></div>
        <div class="card"><div class="card-h"><h3>Sales made by each seller</h3></div><div class="card-b flush table-wrap" id="tmTable"></div></div>`;
      bindFilters(root, V.team, () => this.update());
    },
    update() {
      const root = this.root;
      const admin = isAdmin();
      const [from, to, label] = rangeFor(V.team.range, V.team.from, V.team.to);
      $('#tmLabel', root).textContent = 'Period: ' + label;
      const rows = Reports.bySeller(Reports.between(S.sales, from, to));
      S.users.filter((u) => u.active !== false && !rows.some((r) => r.sellerId === u.id)).forEach((u) => rows.push({ sellerId: u.id, name: u.name, count: 0, revenue: 0, cost: 0, profit: 0, balance: 0, collected: 0 }));
      rows.forEach((r) => { const u = userById(r.sellerId); if (u) r.name = u.name; r.rate = u ? Number(u.commissionRate) || 0 : 0; });
      const medal = ['🥇', '🥈', '🥉'];
      const tot = rows.reduce((a, r) => ({ count: a.count + r.count, revenue: a.revenue + r.revenue, collected: a.collected + r.collected, balance: a.balance + r.balance, profit: a.profit + r.profit }), { count: 0, revenue: 0, collected: 0, balance: 0, profit: 0 });
      $('#tmTable', root).innerHTML = '<table class="t"><thead><tr><th>#</th><th>Seller</th><th class="num">Sales made</th><th class="num">Sales value</th><th class="num">Money collected</th><th class="num">Unpaid by customers</th>' + (admin ? '<th class="num">Profit generated</th><th class="num">Commission</th>' : '') + '</tr></thead><tbody>' +
        rows.map((r, i) => '<tr' + (r.sellerId === S.uid ? ' style="font-weight:700"' : '') + '><td>' + (r.revenue > 0 && i < 3 ? medal[i] : i + 1) + '</td><td class="nowrap">' + who(r.sellerId, r.name) + (r.sellerId === S.uid ? ' <span class="badge b-blue">You</span>' : '') + '</td><td class="num">' + r.count + '</td><td class="num"><b>' + money(r.revenue) + '</b></td><td class="num">' + money(r.collected) + '</td><td class="num ' + (r.balance > 0 ? 'text-red' : '') + '">' + money(r.balance) + '</td>' +
          (admin ? '<td class="num">' + money(r.profit) + '</td><td class="num">' + (r.rate ? money(commissionOf(r.profit, r.rate)) + ' <span class="muted small">(' + r.rate + '%)</span>' : '<span class="muted">—</span>') + '</td>' : '') + '</tr>').join('') +
        '</tbody><tfoot><tr><td></td><td>TOTAL</td><td class="num">' + tot.count + '</td><td class="num">' + money(tot.revenue) + '</td><td class="num">' + money(tot.collected) + '</td><td class="num">' + money(tot.balance) + '</td>' + (admin ? '<td class="num">' + money(tot.profit) + '</td><td></td>' : '') + '</tr></tfoot></table>';
      const withSales = rows.filter((r) => r.revenue > 0);
      barChart($('#tmChart', root), 'team', withSales.map((r) => r.name), [{ label: 'Sales value', data: withSales.map((r) => r.revenue), color: COLS.sales }]);
    },
  };

  // ---------------------------------------------------------------- Salaries & Commission (admin)
  const PAY_LABEL = { salary: 'Salary', commission: 'Commission', bonus: 'Bonus', advance: 'Advance', other: 'Other payment' };
  function salaryPeriod(u, which) {
    const now = Date.now();
    if ((u.salaryPeriod || 'monthly') === 'weekly') {
      let s = startOfWeek(now);
      if (which === 'previous') s = addDays(s, -7);
      return { key: 'W' + dayKey(s), label: 'Week ' + fmtD(s) + ' – ' + fmtD(addDays(s, 6)), from: s, to: addDays(s, 7) };
    }
    let s = startOfMonth(now);
    if (which === 'previous') s = addMonths(s, -1);
    return { key: 'M' + dayKey(s).slice(0, 7), label: MONTHS[new Date(s).getMonth()] + ' ' + new Date(s).getFullYear(), from: s, to: addMonths(s, 1) };
  }
  const activePay = (id) => S.payroll.find((p) => p.id === id && p.status !== 'void');
  function payStatus(p) {
    if (!p) return '<span class="badge b-amber">NOT PAID</span>';
    return '<span class="badge b-green">PAID</span> <span class="small muted">' + fmtD(p.paidAt) + ' · ' + esc(p.method) + '</span>' + (p.receivedAt ? ' <span class="badge b-blue">✓ Received</span>' : '');
  }
  function payDialog(opts) {
    // opts: {id, user, type, amount, periodKey, periodLabel, from, to, basis, title, note}
    const users = S.users.filter((u) => u.id !== S.uid && u.active !== false);
    const m = openModal({
      title: esc(opts.title || 'Pay staff'), cls: 'narrow',
      body: `<form id="pyForm">
        ${opts.user ? '<p>' + who(opts.user.id, opts.user.name) + (opts.periodLabel ? '<br><span class="muted small">' + esc(PAY_LABEL[opts.type]) + ' · ' + esc(opts.periodLabel) + '</span>' : '') + '</p>' : '<div class="field"><label>Pay to</label><select class="input" name="uid">' + users.map((u) => '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>').join('') + '</select></div><div class="field"><label>Type</label><select class="input" name="type"><option value="bonus">Bonus</option><option value="advance">Salary advance</option><option value="salary">Salary (extra)</option><option value="commission">Commission (extra)</option><option value="other">Other</option></select></div>'}
        ${opts.basis ? '<div class="alert blue"><div>' + opts.basis + '</div></div>' : ''}
        <div class="field"><label>Amount (${esc(cur())})</label><input class="input" type="number" name="amount" min="0" step="0.01" value="${opts.amount != null ? opts.amount : ''}" required></div>
        <div class="field"><label>Paid via</label><select class="input" name="method"><option>M-Pesa</option><option>Cash</option><option>Bank</option><option>Other</option></select></div>
        <div class="field"><label>Reference (optional)</label><input class="input" name="reference" maxlength="40" placeholder="e.g. M-Pesa code"></div>
        <div class="field"><label>Note (optional)</label><input class="input" name="note" maxlength="120" value="${esc(opts.note || '')}"></div>
      </form><p class="small muted">The seller gets a pop-up message and sees this payment in <b>My Earnings</b>.</p>`,
      footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>' + icon('cash') + 'Record payment</button>',
    });
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => {
      const d = formData($('#pyForm', m.el));
      const u = opts.user || userById(d.uid);
      if (!u) throw new Error('Choose who to pay.');
      const type = opts.type || d.type;
      const label = opts.periodLabel || '';
      const msg = '💰 Payment received from ' + (S.settings.shopName || 'SHALOM GENERAL STORE') + ': ' + PAY_LABEL[type] + (label ? ' for ' + label : '') + ' - ' + money(Number(d.amount)) + ' via ' + d.method + (d.reference ? ' (ref ' + d.reference + ')' : '') + (d.note ? '. Note: ' + d.note : '') + '. Open "My Earnings" to confirm you received it.';
      await S.logic.payStaff({ id: opts.id, sellerId: u.id, type, amount: d.amount, method: d.method, reference: d.reference, note: d.note, periodKey: opts.periodKey, periodLabel: label, from: opts.from, to: opts.to, basis: opts.basisData || null, message: msg });
      m.close();
      toast(PAY_LABEL[type] + ' of ' + money(Number(d.amount)) + ' recorded for ' + u.name + '.');
    });
  }
  function paySettingsDialog(u) {
    const m = openModal({
      title: 'Pay settings · ' + esc(u.name), cls: 'narrow',
      body: `<form id="psForm">
        <div class="field"><label>Salary amount (${esc(cur())})</label><input class="input" type="number" name="salary" min="0" step="0.01" value="${u.salary || 0}"></div>
        <div class="field"><label>Salary is paid</label><select class="input" name="salaryPeriod"><option value="monthly" ${u.salaryPeriod !== 'weekly' ? 'selected' : ''}>Monthly</option><option value="weekly" ${u.salaryPeriod === 'weekly' ? 'selected' : ''}>Weekly</option></select></div>
        <div class="field"><label>Commission (% of the profit from their sales)</label><input class="input" type="number" name="commissionRate" min="0" max="100" step="0.1" value="${u.commissionRate || 0}"><span class="hint">Example: 10% of KSh 5,000 profit = KSh 500 commission. Use 0 for no commission.</span></div>
      </form>`,
      footer: '<button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>Save</button>',
    });
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => {
      await S.logic.adminUpdateUser(u.id, formData($('#psForm', m.el)));
      m.close();
      toast('Pay settings saved for ' + u.name + '.');
    });
  }
  VIEWS.payroll = {
    title: 'Salaries & Commission',
    render(root) {
      V.py = V.py || { which: 'current', range: 'month', from: '', to: '', seller: '' };
      root.innerHTML = `
        <div class="grid stats" id="pyStats"></div>
        <div class="card"><div class="card-h"><h3>Salaries</h3><div class="seg"><button type="button" data-which="current" class="${V.py.which === 'current' ? 'on' : ''}">Current period</button><button type="button" data-which="previous" class="${V.py.which === 'previous' ? 'on' : ''}">Previous period</button></div></div>
          <div class="card-b flush table-wrap" id="pySal"></div></div>
        <div class="card"><div class="card-h" style="display:block"><h3 style="margin-bottom:10px">Commission on profit made by each seller</h3><div class="toolbar">${rangeSeg(V.py, [['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Dates']])}</div></div>
          <div class="card-b flush table-wrap" id="pyCom"></div></div>
        <div class="card"><div class="card-h"><h3>Payment history</h3><select class="input" id="pySeller" style="width:auto"></select><button class="btn secondary" id="pyOther">${icon('plus')}Bonus / advance / other</button></div>
          <div class="card-b flush table-wrap" id="pyHist"></div></div>`;
      on(root, 'click', '[data-which]', (el) => { V.py.which = el.dataset.which; $$('[data-which]', root).forEach((b) => b.classList.toggle('on', b === el)); this.update(); });
      bindFilters(root, V.py, () => this.update());
      $('#pySeller', root).onchange = (e) => { V.py.seller = e.target.value; this.update(); };
      $('#pyOther', root).onclick = () => payDialog({ title: 'Bonus / advance / other payment' });
      on(root, 'click', '[data-act]', async (el) => {
        const u = userById(el.dataset.uid);
        const a = el.dataset.act;
        if (a === 'settings' && u) paySettingsDialog(u);
        if (a === 'paysal' && u) {
          const per = salaryPeriod(u, V.py.which);
          payDialog({ id: 'sal_' + u.id + '_' + per.key, user: u, type: 'salary', amount: u.salary || 0, periodKey: per.key, periodLabel: per.label, from: per.from, to: per.to, title: 'Pay salary' });
        }
        if (a === 'paycom' && u) {
          const [from, to, label] = rangeFor(V.py.range, V.py.from, V.py.to);
          const r = Reports.bySeller(Reports.between(S.sales, from, to)).find((x) => x.sellerId === u.id) || { profit: 0, revenue: 0, count: 0 };
          const amt = commissionOf(r.profit, u.commissionRate);
          payDialog({ id: 'com_' + u.id + '_' + dayKey(from) + '_' + dayKey(to - 1), user: u, type: 'commission', amount: amt, periodKey: dayKey(from) + '_' + dayKey(to - 1), periodLabel: label, from, to, title: 'Pay commission',
            basis: 'Profit from ' + esc(u.name) + "'s sales: <b>" + money(r.profit) + '</b> (' + r.count + ' sales, ' + money(r.revenue) + ') × ' + (u.commissionRate || 0) + '% = <b>' + money(amt) + '</b>', basisData: { profit: r.profit, revenue: r.revenue, rate: Number(u.commissionRate) || 0 } });
        }
        if (a === 'void') {
          const p = S.payroll.find((x) => x.id === el.dataset.id);
          if (!p) return;
          const m = openModal({ title: 'Cancel payment', cls: 'narrow', body: '<p>Cancel the ' + esc(PAY_LABEL[p.type]) + ' of <b>' + money(p.amount) + '</b> to ' + esc(p.sellerName) + '? Use this only if it was recorded by mistake.</p><div class="field"><label>Reason</label><input class="input" id="pyVoid" maxlength="120"></div>', footer: '<button class="btn secondary" data-x>Back</button><button class="btn danger" data-ok>Cancel payment</button>' });
          m.el.querySelector('[data-x]').onclick = m.close;
          m.el.querySelector('[data-ok]').onclick = (e) => guard(e.currentTarget, async () => { await S.logic.voidPayment(p.id, $('#pyVoid', m.el).value); m.close(); toast('Payment cancelled.'); });
        }
      });
    },
    update() {
      const root = this.root;
      const staff = S.users.filter((u) => u.id !== S.uid).sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name));
      const m0 = startOfMonth(Date.now());
      const monthPays = S.payroll.filter((p) => p.status !== 'void' && p.paidAt >= m0);
      const sumT = (t) => r2(monthPays.filter((p) => !t || p.type === t).reduce((a, p) => a + p.amount, 0));
      const stat = (l, v, sub, c) => '<div class="stat ' + (c || '') + '"><div class="label">' + l + '</div><div class="value">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      $('#pyStats', root).innerHTML = stat('Staff paid this month', money(sumT()), monthPays.length + ' payment(s)') + stat('Salaries this month', money(sumT('salary')), '', 'grey') + stat('Commission this month', money(sumT('commission'))) + stat('Bonuses & advances', money(sumT('bonus') + sumT('advance') + sumT('other')), '', 'grey') +
        stat('Waiting for seller to confirm', String(S.payroll.filter((p) => p.status !== 'void' && !p.receivedAt).length), 'payments not yet marked received', 'amber');
      $('#pySal', root).innerHTML = staff.length ? '<table class="t"><thead><tr><th>Seller</th><th>Salary</th><th>Period</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>' + staff.map((u) => {
        const per = salaryPeriod(u, V.py.which);
        const paid = activePay('sal_' + u.id + '_' + per.key);
        return '<tr><td class="nowrap">' + who(u.id, u.name) + (u.active === false ? ' <span class="badge b-grey">disabled</span>' : '') + '</td><td>' + (u.salary ? money(u.salary) + ' <span class="muted small">' + (u.salaryPeriod === 'weekly' ? 'weekly' : 'monthly') + '</span>' : '<span class="muted">Not set</span>') + '</td><td class="nowrap">' + esc(per.label) + '</td><td class="num">' + (paid ? money(paid.amount) : u.salary ? money(u.salary) : '—') + '</td><td>' + payStatus(paid) + '</td>' +
          '<td class="nowrap"><div class="btn-row">' + (!paid && u.salary ? '<button class="btn sm" data-act="paysal" data-uid="' + esc(u.id) + '">Pay salary</button>' : '') + '<button class="btn sm secondary" data-act="settings" data-uid="' + esc(u.id) + '">Pay settings</button></div></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">Add sellers in <a href="#users">Users</a> first.</div>';
      const [from, to, label] = rangeFor(V.py.range, V.py.from, V.py.to);
      const by = Reports.bySeller(Reports.between(S.sales, from, to));
      $('#pyCom', root).innerHTML = staff.length ? '<div class="muted small" style="padding:10px 18px 0">' + esc(label) + '</div><table class="t"><thead><tr><th>Seller</th><th class="num">Sales</th><th class="num">Sales value</th><th class="num">Profit generated</th><th class="num">Rate</th><th class="num">Commission</th><th>Status</th><th></th></tr></thead><tbody>' + staff.map((u) => {
        const r = by.find((x) => x.sellerId === u.id) || { count: 0, revenue: 0, profit: 0 };
        const amt = commissionOf(r.profit, u.commissionRate);
        const paid = activePay('com_' + u.id + '_' + dayKey(from) + '_' + dayKey(to - 1));
        return '<tr><td class="nowrap">' + who(u.id, u.name) + '</td><td class="num">' + r.count + '</td><td class="num">' + money(r.revenue) + '</td><td class="num ' + (r.profit < 0 ? 'text-red' : '') + '">' + money(r.profit) + '</td><td class="num">' + (Number(u.commissionRate) || 0) + '%</td><td class="num"><b>' + money(paid ? paid.amount : amt) + '</b></td><td>' + (paid ? payStatus(paid) : amt > 0 ? '<span class="badge b-amber">NOT PAID</span>' : '<span class="muted small">nothing due</span>') + '</td>' +
          '<td class="nowrap"><div class="btn-row">' + (!paid && amt > 0 ? '<button class="btn sm" data-act="paycom" data-uid="' + esc(u.id) + '">Pay commission</button>' : '') + (!u.commissionRate ? '<button class="btn sm secondary" data-act="settings" data-uid="' + esc(u.id) + '">Set rate</button>' : '') + '</div></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">No sellers yet.</div>';
      const sel = $('#pySeller', root);
      sel.innerHTML = '<option value="">All staff</option>' + staff.map((u) => '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>').join('');
      sel.value = V.py.seller;
      const hist = S.payroll.filter((p) => !V.py.seller || p.sellerId === V.py.seller);
      $('#pyHist', root).innerHTML = hist.length ? '<table class="t"><thead><tr><th>Date paid</th><th>Paid to</th><th>Type</th><th>For</th><th class="num">Amount</th><th>Via</th><th>Status</th><th></th></tr></thead><tbody>' + hist.map((p) =>
        '<tr class="' + (p.status === 'void' ? 'row-reversed' : '') + '"><td class="nowrap">' + fmtDT(p.paidAt) + '</td><td class="nowrap">' + who(p.sellerId, p.sellerName) + '</td><td><span class="badge ' + (p.type === 'salary' ? 'b-green' : p.type === 'commission' ? 'b-blue' : 'b-amber') + '">' + esc(PAY_LABEL[p.type] || p.type) + '</span></td><td class="small">' + esc(p.periodLabel || p.note || '—') + '</td><td class="num"><b>' + money(p.amount) + '</b></td><td class="small">' + esc(p.method) + (p.reference ? ' · ' + esc(p.reference) : '') + '</td>' +
        '<td>' + (p.status === 'void' ? '<span class="badge b-grey">CANCELLED</span> <span class="small muted">' + esc(p.voidReason || '') + '</span>' : p.receivedAt ? '<span class="badge b-blue">✓ Received ' + fmtD(p.receivedAt) + '</span>' : '<span class="badge b-amber">Sent - not yet confirmed</span>') + '</td>' +
        '<td>' + (p.status !== 'void' ? '<button class="btn sm ghost text-red" data-act="void" data-id="' + esc(p.id) + '">Cancel</button>' : '') + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">No staff payments recorded yet.</div>';
    },
  };

  // ---------------------------------------------------------------- My Earnings (sellers)
  VIEWS.earnings = {
    title: 'My Earnings',
    render(root) {
      root.innerHTML = '<div class="grid stats" id="erStats"></div><div class="card"><div class="card-h"><h3>Payments from the administrator</h3></div><div class="card-b flush table-wrap" id="erTable"></div></div>';
      on(root, 'click', '[data-confirm]', (el) => guard(el, async () => { await S.logic.confirmReceived(el.dataset.confirm); toast('Thank you - marked as received.'); }));
    },
    update() {
      const root = this.root;
      const me = S.me;
      const mine = S.payroll.filter((p) => p.sellerId === S.uid);
      const ok = mine.filter((p) => p.status !== 'void');
      const per = salaryPeriod(me, 'current');
      const salPaid = activePay('sal_' + S.uid + '_' + per.key);
      const [m0, m1] = rangeFor('month');
      const myMonth = Reports.summarize(Reports.between(mySales(), m0, m1));
      const rate = Number(me.commissionRate) || 0;
      const stat = (l, v, sub, c) => '<div class="stat ' + (c || '') + '"><div class="label">' + l + '</div><div class="value">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      $('#erStats', root).innerHTML =
        stat('My salary', me.salary ? money(me.salary) : '—', me.salary ? (me.salaryPeriod === 'weekly' ? 'paid weekly' : 'paid monthly') : 'not set by the administrator') +
        stat('Salary for ' + per.label, salPaid ? 'PAID' : me.salary ? 'Not yet paid' : '—', salPaid ? money(salPaid.amount) + ' on ' + fmtD(salPaid.paidAt) : '', salPaid ? '' : 'amber') +
        stat('My sales this month', money(myMonth.revenue), myMonth.count + ' sales', 'grey') +
        (rate ? stat('Commission earned this month', money(commissionOf(myMonth.profit, rate)), rate + '% of the profit from my sales (estimate)') : stat('Commission', '—', 'no commission rate set', 'grey')) +
        stat('Received this month', money(ok.filter((p) => p.paidAt >= m0).reduce((a, p) => a + p.amount, 0)), '', 'grey') +
        stat('Total received', money(ok.reduce((a, p) => a + p.amount, 0)), ok.length + ' payment(s)');
      $('#erTable', root).innerHTML = mine.length ? '<table class="t"><thead><tr><th>Date</th><th>Type</th><th>For</th><th class="num">Amount</th><th>Via</th><th>Paid by</th><th>Status</th></tr></thead><tbody>' + mine.map((p) =>
        '<tr class="' + (p.status === 'void' ? 'row-reversed' : '') + '"><td class="nowrap">' + fmtDT(p.paidAt) + '</td><td><span class="badge ' + (p.type === 'salary' ? 'b-green' : p.type === 'commission' ? 'b-blue' : 'b-amber') + '">' + esc(PAY_LABEL[p.type] || p.type) + '</span></td><td class="small">' + esc(p.periodLabel || '—') + (p.note ? '<div class="muted">' + esc(p.note) + '</div>' : '') + '</td><td class="num"><b>' + money(p.amount) + '</b></td><td class="small">' + esc(p.method) + (p.reference ? ' · ' + esc(p.reference) : '') + '</td><td>' + esc(p.paidByName) + '</td>' +
        '<td>' + (p.status === 'void' ? '<span class="badge b-grey">CANCELLED</span>' : p.receivedAt ? '<span class="badge b-green">✓ Received ' + fmtD(p.receivedAt) + '</span>' : '<button class="btn sm" data-confirm="' + esc(p.id) + '">Confirm received</button>') + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">No payments yet. When the administrator pays your salary or commission it will appear here.</div>';
    },
  };

  // ---------------------------------------------------------------- Theme & colours
  VIEWS.theme = {
    title: 'Theme & Colours',
    render(root) {
      root.innerHTML = `
        <div class="card"><div class="card-h"><h3>Main colour</h3><span class="muted small">Used for buttons, highlights, menus and charts</span></div><div class="card-b">
          <div class="swatches">${PRESETS.map((p) => '<button type="button" class="swatch" data-accent="' + p[1] + '"><div class="chips"><span style="background:' + mix(p[1], '#000000', 0.45) + '"></span><span style="background:' + p[1] + '"></span><span style="background:' + mix(p[1], '#ffffff', 0.84) + '"></span></div><b>' + esc(p[0]) + '</b></button>').join('')}</div>
          <div class="field" style="margin:16px 0 0"><label>Or choose your own colour</label>
            <div class="btn-row"><input type="color" class="color-input" id="thCustom" aria-label="Custom colour"><span class="muted small">Tap the box to pick any colour.</span></div></div>
        </div></div>
        <div class="two-col even">
          <div class="card"><div class="card-h"><h3>Side menu style</h3></div><div class="card-b"><div class="opt-row">
            ${[['dark', 'Dark', '#111827'], ['colored', 'Coloured', 'accent'], ['light', 'Light', '#ffffff']].map((o) => '<button type="button" class="opt" data-sidebar="' + o[0] + '"><span class="mini"><i style="background:' + (o[2] === 'accent' ? 'var(--green-900)' : o[2]) + '"></i><span style="flex:1;background:var(--grey-100)"></span></span>' + o[1] + '</button>').join('')}
          </div></div></div>
          <div class="card"><div class="card-h"><h3>Display</h3></div><div class="card-b">
            <div class="field"><label>Mode</label><div class="opt-row"><button type="button" class="opt" data-mode="light">${icon('sun')} Light</button><button type="button" class="opt" data-mode="dark">${icon('moon')} Dark</button></div></div>
            <div class="field" style="margin:0"><label>Text size</label><div class="opt-row"><button type="button" class="opt" data-font="normal">Normal</button><button type="button" class="opt" data-font="large" style="font-size:16px">Large</button></div></div>
          </div></div>
        </div>
        <div class="card"><div class="card-h"><h3>Preview</h3><button type="button" class="btn secondary sm" id="thReset">Reset to default</button></div><div class="card-b"><div class="preview-box">
          <div class="grid stats" style="margin:0"><div class="stat"><div class="label">Sales value today</div><div class="value">${esc(cur())} 12,450.00</div><div class="sub">value of goods sold</div></div><div class="stat grey"><div class="label">Products sold today</div><div class="value">58</div><div class="sub">units</div></div></div>
          <div class="btn-row"><button type="button" class="btn">Confirm sale</button><button type="button" class="btn secondary">Cancel</button><button type="button" class="btn dark">Record payment</button><span class="badge b-green">PAID FULL</span><span class="badge b-amber">PART PAID</span><span class="badge b-red">OVERDUE</span></div>
          <div class="alert green" style="margin:0"><div>Sale recorded and stock updated.</div></div>
        </div><p class="muted small" style="margin:10px 0 0">Theme choices are saved on this device. Each person can choose their own.</p></div></div>`;
      const change = (patch) => { const t = Object.assign(loadTheme(), patch); saveTheme(t); applyTheme(t); this.update(); };
      on(root, 'click', '[data-accent]', (el) => change({ accent: el.dataset.accent }));
      on(root, 'click', '[data-sidebar]', (el) => change({ sidebar: el.dataset.sidebar }));
      on(root, 'click', '[data-mode]', (el) => { change({ mode: el.dataset.mode }); const mb = $('#topMode'); if (mb) mb.innerHTML = icon(el.dataset.mode === 'dark' ? 'sun' : 'moon'); });
      on(root, 'click', '[data-font]', (el) => change({ font: el.dataset.font }));
      const ci = $('#thCustom', root);
      ci.addEventListener('input', () => { const t = Object.assign(loadTheme(), { accent: ci.value }); applyTheme(t); });
      ci.addEventListener('change', () => change({ accent: ci.value }));
      $('#thReset', root).onclick = () => { saveTheme(Object.assign({}, DEFAULT_THEME)); applyTheme(DEFAULT_THEME); const mb = $('#topMode'); if (mb) mb.innerHTML = icon('moon'); this.update(); toast('Theme reset to Shalom Green.'); };
    },
    update() {
      const t = loadTheme();
      const root = this.root;
      $$('[data-accent]', root).forEach((b) => b.classList.toggle('on', b.dataset.accent.toLowerCase() === String(t.accent).toLowerCase()));
      $$('[data-sidebar]', root).forEach((b) => b.classList.toggle('on', b.dataset.sidebar === t.sidebar));
      $$('[data-mode]', root).forEach((b) => b.classList.toggle('on', b.dataset.mode === t.mode));
      $$('[data-font]', root).forEach((b) => b.classList.toggle('on', b.dataset.font === t.font));
      const ci = $('#thCustom', root);
      if (document.activeElement !== ci) ci.value = t.accent;
    },
  };

  // ---------------------------------------------------------------- Profile
  function resizeImage(file, size) {
    return new Promise((res, rej) => {
      if (!/^image\//.test(file.type)) { rej(new Error('Choose an image file (JPG or PNG).')); return; }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        const m = Math.min(img.width, img.height);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image.')); };
      img.src = url;
    });
  }
  VIEWS.profile = {
    title: 'My Profile',
    render(root) {
      root.innerHTML = `
        <div class="two-col even">
          <div class="card"><div class="card-h"><h3>Profile</h3></div><div class="card-b">
            <div class="profile-head"><span id="pfAv"></span><div><div class="btn-row"><label class="btn secondary sm" style="cursor:pointer">Upload photo<input type="file" accept="image/*" id="pfFile" hidden></label><button class="btn ghost sm" id="pfRm">Remove photo</button></div><div class="small muted" style="margin-top:6px">Your photo appears on your sales, debts and messages.</div></div></div>
            <form id="pfForm"><div class="field"><label>Full name</label><input class="input" name="name" maxlength="60"></div>
            <div class="field"><label>Phone</label><input class="input" name="phone" maxlength="16"></div>
            <div class="field"><label>Username</label><input class="input" id="pfUser" readonly></div>
            <div class="field"><label>Role</label><input class="input" id="pfRole" readonly></div>
            <button class="btn" type="submit">Save profile</button></form>
          </div></div>
          <div class="card"><div class="card-h"><h3>Change password</h3></div><div class="card-b">
            <form id="pwForm"><div class="field"><label>Current password</label><input class="input" type="password" name="old" required autocomplete="current-password"></div>
            <div class="field"><label>New password</label><input class="input" type="password" name="n1" required minlength="6" autocomplete="new-password"></div>
            <div class="field"><label>Confirm new password</label><input class="input" type="password" name="n2" required minlength="6" autocomplete="new-password"></div>
            <button class="btn dark" type="submit">Change password</button></form>
          </div></div>
        </div>`;
      const pf = $('#pfForm', root);
      pf.elements.name.value = S.me.name || '';
      pf.elements.phone.value = S.me.phone || '';
      $('#pfUser', root).value = S.me.username;
      $('#pfRole', root).value = isAdmin() ? 'Administrator / Shop owner' : 'Seller / Cashier';
      pf.onsubmit = (e) => { e.preventDefault(); guard(pf.querySelector('button'), async () => { await S.logic.updateMyProfile({ name: pf.elements.name.value, phone: pf.elements.phone.value }); toast('Profile saved.'); }); };
      $('#pfFile', root).onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        guard(null, async () => { const data = await resizeImage(f, 192); await S.logic.updateMyProfile({ photo: data }); toast('Profile picture updated.'); });
        e.target.value = '';
      };
      $('#pfRm', root).onclick = () => guard(null, async () => { await S.logic.updateMyProfile({ photo: '' }); toast('Photo removed.'); });
      const pw = $('#pwForm', root);
      pw.onsubmit = (e) => {
        e.preventDefault();
        guard(pw.querySelector('button'), async () => {
          const d = formData(pw);
          if (d.n1 !== d.n2) throw new Error('The new passwords do not match.');
          if (d.n1.length < 6) throw new Error('Password must be at least 6 characters.');
          await S.backend.changePassword(S.me.username, d.old, d.n1);
          if (S.me.mustChangePassword) await S.logic.updateMyProfile({ mustChangePassword: false });
          pw.reset();
          toast('Password changed.');
        });
      };
    },
    update() { $('#pfAv', this.root).innerHTML = avatar(S.uid, S.me.name, 'lg'); },
  };

  // expose for automated tests
  window.ShalomApp = { S, V, go, cartCalc, addToCart, receiptHTML };
  if (!window.SHALOM_NO_BOOT) boot();
})();