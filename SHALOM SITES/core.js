/*
 * SHALOM GENERAL STORE - core data layer
 * Two interchangeable backends with the same interface:
 *   - FirebaseBackend : online Firestore database + Firebase Authentication (LIVE mode)
 *   - LocalBackend    : browser localStorage (DEMO mode / automated tests)
 * All business rules (stock deduction, profit, debts, reversals) live in Logic and run
 * inside database transactions, so stock can never go negative or be deducted twice.
 */
(function (global) {
  'use strict';

  const EMAIL_DOMAIN = 'shalom-store.app';
  const FIREBASE_VER = '10.12.2';

  // ---------------------------------------------------------------- helpers
  const pad = (n, l) => String(n).padStart(l, '0');
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

  // ---------------------------------------------------------------- units of measurement
  // dec: can be sold in fractions (0.5 kg). sub: smaller unit the seller may type in (grams, ml, cm).
  const UNITS = {
    pcs: { name: 'Pieces (pcs)' }, kg: { name: 'Kilograms (kg)', dec: true, sub: ['g', 1000] }, g: { name: 'Grams (g)', dec: true },
    ltr: { name: 'Litres (ltr)', dec: true, sub: ['ml', 1000] }, ml: { name: 'Millilitres (ml)', dec: true }, m: { name: 'Metres (m)', dec: true, sub: ['cm', 100] },
    packet: { name: 'Packets' }, bottle: { name: 'Bottles' }, tin: { name: 'Tins' }, sachet: { name: 'Sachets' }, bar: { name: 'Bars' },
    bag: { name: 'Bags' }, box: { name: 'Boxes' }, carton: { name: 'Cartons' }, bale: { name: 'Bales' }, bundle: { name: 'Bundles' },
    roll: { name: 'Rolls' }, pair: { name: 'Pairs' }, dozen: { name: 'Dozens' }, tray: { name: 'Trays' }, crate: { name: 'Crates' },
    set: { name: 'Sets' }, tablet: { name: 'Tablets' }, piece: { name: 'Piece (single)' },
  };
  const PACK_NAMES = ['bale', 'carton', 'sack', 'box', 'crate', 'dozen', 'bundle', 'tray', 'pack', 'roll', 'bag', 'jerrican'];
  const unitInfo = (p) => UNITS[(p && p.unit) || 'pcs'] || { name: p.unit, dec: false };
  const isDec = (p) => !!unitInfo(p).dec;
  const hasPack = (p) => !!(p && p.packName && Number(p.packSize) > 0);
  const packPrice = (p) => (hasPack(p) ? r2(p.packPrice > 0 ? p.packPrice : p.packSize * p.sellPrice) : 0);
  function fmtQ(n) { const v = r3(n); return Number.isInteger(v) ? String(v) : String(v).replace(/(\.\d*?)0+$/, '$1'); }
  const plural = (w, n) => (Number(n) === 1 ? w : w + 's');
  /** "162 pcs (3 bales + 12 pcs)" */
  function stockText(p, qty) {
    const q = r3(qty == null ? p.qty : qty);
    const u = (p && p.unit) || 'pcs';
    let t = fmtQ(q) + ' ' + u;
    if (hasPack(p) && q > 0) {
      const packs = Math.floor(q / p.packSize + 1e-9);
      const rest = r3(q - packs * p.packSize);
      if (packs > 0) t += ' (' + packs + ' ' + plural(p.packName, packs) + (rest > 0 ? ' + ' + fmtQ(rest) + ' ' + u : '') + ')';
    }
    return t;
  }
  /**
   * Turn what the seller typed into an exact sale line.
   * mode: 'unit' (e.g. 2 kg / 3 pcs) | 'sub' (e.g. 500 g of a kg product) | 'pack' (e.g. 1 bale) | 'amount' (e.g. KSh 50 worth)
   */
  function resolveLine(p, mode, value) {
    const u = unitInfo(p);
    const unit = p.unit || 'pcs';
    const v = Number(value);
    if (value === '' || value == null || !isFinite(v) || v <= 0) throw new Error('Enter a quantity for "' + p.name + '".');
    let qty, subtotal, qtyText, rate, rateUnit;
    if (mode === 'sub') {
      if (!u.sub) throw new Error('"' + p.name + '" cannot be sold in smaller units.');
      qty = v / u.sub[1]; subtotal = r2(qty * p.sellPrice); qtyText = fmtQ(v) + ' ' + u.sub[0]; rate = p.sellPrice; rateUnit = unit;
    } else if (mode === 'pack') {
      if (!hasPack(p)) throw new Error('"' + p.name + '" is not sold in packs.');
      if (!Number.isInteger(v)) throw new Error('Enter whole ' + plural(p.packName, 2) + ' for "' + p.name + '".');
      qty = v * p.packSize; subtotal = r2(v * packPrice(p)); qtyText = v + ' ' + plural(p.packName, v) + ' (' + fmtQ(qty) + ' ' + unit + ')'; rate = packPrice(p); rateUnit = p.packName;
    } else if (mode === 'amount') {
      if (!u.dec) throw new Error('Selling by money amount works only for measured items (kg, litres, metres).');
      if (!(p.sellPrice > 0)) throw new Error('"' + p.name + '" has no selling price.');
      qty = v / p.sellPrice; subtotal = r2(v); qtyText = fmtQ(qty) + ' ' + unit; rate = p.sellPrice; rateUnit = unit;
    } else {
      if (!u.dec && !Number.isInteger(v)) throw new Error('"' + p.name + '" is sold in whole ' + unit + ' - enter a whole number.');
      qty = v; subtotal = r2(v * p.sellPrice); qtyText = fmtQ(v) + ' ' + unit; rate = p.sellPrice; rateUnit = unit;
      mode = 'unit';
    }
    qty = r3(qty);
    if (qty <= 0) throw new Error('Quantity for "' + p.name + '" is too small.');
    return { mode, value: v, qty, subtotal, qtyText, rate: r2(rate), rateUnit };
  }
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  function dayKey(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  }
  function applyUpdate(doc, upd) {
    for (const [k, v] of Object.entries(upd)) {
      if (k.includes('.')) {
        const parts = k.split('.');
        let o = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {};
          o = o[parts[i]];
        }
        o[parts[parts.length - 1]] = v;
      } else doc[k] = v;
    }
    return doc;
  }
  async function hashPw(pw, salt) {
    const text = salt + '::' + pw;
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 5381;
      for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
      return 'x' + (h >>> 0).toString(16);
    }
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load ' + src + ' - check the internet connection.'));
      document.head.appendChild(s);
    });
  }
  function cleanUsername(u) {
    return String(u || '').trim().toLowerCase();
  }
  function validUsername(u) {
    return /^[a-z0-9._-]{3,30}$/.test(u);
  }

  const DEFAULT_SETTINGS = {
    shopName: 'SHALOM GENERAL STORE',
    address: '',
    phone: '',
    email: '',
    kraPin: '',
    currency: 'KSh',
    lowStockDefault: 5,
    debtAlertHours: 24,
    receiptPaper: '80mm',
    receiptFooter: 'THANK YOU FOR SHOPPING WITH SHALOM GENERAL STORE. KARIBU TENA!',
    categories: ['Foodstuffs', 'Beverages', 'Household', 'Toiletries', 'Stationery', 'Electronics', 'Hardware', 'Other'],
  };

  // ---------------------------------------------------------------- Local backend
  class LocalBackend {
    constructor(key) {
      this.mode = 'local';
      this.key = key || 'shalom_store_db_v1';
      this.sessionKey = this.key + '_session';
      this.listeners = [];
      this.queue = Promise.resolve();
      this.authCb = null;
      this.load();
    }
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(this.key)); } catch (e) { d = null; }
      this.data = d && d.cols ? d : { cols: {}, auth: {} };
    }
    save() {
      try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {
        throw new Error('Browser storage is full or blocked. Export a backup in Settings.');
      }
    }
    async init() {
      window.addEventListener('storage', (e) => {
        if (e.key === this.key) { this.load(); this.listeners.forEach((l) => this.emit(l)); }
      });
    }
    col(c) { return this.data.cols[c] || (this.data.cols[c] = {}); }
    emit(l) {
      const all = Object.entries(this.col(l.col)).map(([id, d]) => Object.assign(clone(d), { id }));
      const docs = l.docId ? all.filter((d) => d.id === l.docId) : all.filter((d) => !l.filter || d[l.filter[0]] === l.filter[1]);
      setTimeout(() => { if (this.listeners.includes(l)) l.cb(l.docId ? docs[0] || null : docs); }, 0);
    }
    listen(col, cb, filter) {
      const l = { col, cb, filter };
      this.listeners.push(l);
      this.emit(l);
      return () => { this.listeners = this.listeners.filter((x) => x !== l); };
    }
    listenDoc(col, id, cb) {
      const l = { col, cb, docId: id };
      this.listeners.push(l);
      this.emit(l);
      return () => { this.listeners = this.listeners.filter((x) => x !== l); };
    }
    async get(col, id) {
      const d = this.col(col)[id];
      return d ? Object.assign(clone(d), { id }) : null;
    }
    tx(fn) {
      const run = async () => {
        this.load(); // pick up writes from other tabs first
        const work = clone(this.data.cols);
        const touched = new Set();
        const t = {
          get: async (c, id) => { const d = (work[c] || {})[id]; return d ? Object.assign(clone(d), { id }) : null; },
          set: (c, id, d) => { (work[c] = work[c] || {})[id] = clone(d); touched.add(c); },
          update: (c, id, d) => {
            const cur = (work[c] || {})[id];
            if (!cur) throw new Error('Record not found: ' + c + '/' + id);
            applyUpdate(cur, clone(d));
            touched.add(c);
          },
          delete: (c, id) => { if (work[c]) delete work[c][id]; touched.add(c); },
        };
        const res = await fn(t);
        const prev = this.data.cols;
        this.data.cols = work;
        try { this.save(); } catch (e) { this.data.cols = prev; throw e; }
        this.listeners.filter((l) => touched.has(l.col)).forEach((l) => this.emit(l));
        return res;
      };
      const p = this.queue.then(run, run);
      this.queue = p.catch(() => {});
      return p;
    }
    set(col, id, data) { return this.tx((t) => t.set(col, id, data)); }
    update(col, id, data) { return this.tx((t) => t.update(col, id, data)); }
    del(col, id) { return this.tx((t) => t.delete(col, id)); }

    // ---- auth
    onAuth(cb) {
      this.authCb = cb;
      let uid = null;
      try { uid = localStorage.getItem(this.sessionKey); } catch (e) {}
      setTimeout(() => cb(uid || null), 0);
    }
    async signIn(username, pw) {
      const u = this.data.auth[cleanUsername(username)];
      if (!u || u.hash !== (await hashPw(pw, u.salt))) throw new Error('Wrong username or password.');
      try { localStorage.setItem(this.sessionKey, u.uid); } catch (e) {}
      if (this.authCb) this.authCb(u.uid);
    }
    async signOut() {
      try { localStorage.removeItem(this.sessionKey); } catch (e) {}
      if (this.authCb) this.authCb(null);
    }
    async createAccount(username, pw) {
      const key = cleanUsername(username);
      this.load();
      if (this.data.auth[key]) throw new Error('That username is already taken.');
      if (String(pw).length < 6) throw new Error('Password must be at least 6 characters.');
      const uid = genId();
      const salt = genId();
      this.data.auth[key] = { uid, salt, hash: await hashPw(pw, salt) };
      this.save();
      return uid;
    }
    async createFirstAdmin(username, pw, profile) {
      const existing = await this.get('meta', 'setup');
      if (existing) throw new Error('The administrator account has already been created. Please log in.');
      const uid = await this.createAccount(username, pw);
      const now = Date.now();
      await this.tx((t) => {
        t.set('meta', 'setup', { adminUid: uid, at: now });
        t.set('users', uid, Object.assign({ uid, username: cleanUsername(username), role: 'admin', active: true, createdAt: now, photo: '', phone: '' }, profile));
        t.set('meta', 'settings', Object.assign(clone(DEFAULT_SETTINGS), { updatedAt: now }));
        t.set('meta', 'counters', { product: 0, sale: 0 });
      });
      return uid;
    }
    async changePassword(username, oldPw, newPw) {
      const key = cleanUsername(username);
      const u = this.data.auth[key];
      if (!u || u.hash !== (await hashPw(oldPw, u.salt))) throw new Error('Current password is wrong.');
      if (String(newPw).length < 6) throw new Error('Password must be at least 6 characters.');
      u.salt = genId();
      u.hash = await hashPw(newPw, u.salt);
      this.save();
    }
    async adminResetPassword(username, newPw) {
      const u = this.data.auth[cleanUsername(username)];
      if (!u) throw new Error('Login not found.');
      if (String(newPw).length < 6) throw new Error('Password must be at least 6 characters.');
      u.salt = genId();
      u.hash = await hashPw(newPw, u.salt);
      this.save();
    }
    exportAll() { return clone(this.data.cols); }
  }

  // ---------------------------------------------------------------- Firebase backend
  function friendlyAuthError(e) {
    const c = (e && e.code) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'Wrong username or password.';
    if (/email-already-in-use/.test(c)) return 'That username is already taken.';
    if (/weak-password/.test(c)) return 'Password must be at least 6 characters.';
    if (/too-many-requests/.test(c)) return 'Too many attempts. Wait a few minutes and try again.';
    if (/network-request-failed/.test(c)) return 'No internet connection. Check your network and try again.';
    if (/operation-not-allowed|configuration-not-found/.test(c)) return 'Email/Password sign-in is not enabled in the Firebase console (Authentication > Sign-in method).';
    if (/requires-recent-login/.test(c)) return 'Please log out and log in again, then retry.';
    return (e && e.message) || 'Something went wrong.';
  }

  class FirebaseBackend {
    constructor(cfg) { this.mode = 'firebase'; this.cfg = cfg; }
    async init() {
      const base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VER + '/';
      await loadScript(base + 'firebase-app-compat.js');
      await loadScript(base + 'firebase-auth-compat.js');
      await loadScript(base + 'firebase-firestore-compat.js');
      this.app = firebase.initializeApp(this.cfg);
      this.auth = firebase.auth();
      this.fs = firebase.firestore();
      this.onError = null;
    }
    ref(c, id) { return this.fs.collection(c).doc(id); }
    listen(col, cb, filter) {
      let q = this.fs.collection(col);
      if (filter) q = q.where(filter[0], '==', filter[1]);
      return q.onSnapshot(
        (s) => cb(s.docs.map((d) => Object.assign(d.data(), { id: d.id }))),
        (e) => { console.error(col, e); if (this.onError) this.onError(e, col); }
      );
    }
    listenDoc(col, id, cb) {
      return this.ref(col, id).onSnapshot(
        (s) => cb(s.exists ? Object.assign(s.data(), { id: s.id }) : null),
        (e) => { console.error(col, e); if (this.onError) this.onError(e, col); }
      );
    }
    async get(col, id) {
      const s = await this.ref(col, id).get();
      return s.exists ? Object.assign(s.data(), { id: s.id }) : null;
    }
    tx(fn) {
      return this.fs.runTransaction(async (T) => {
        const t = {
          get: async (c, id) => { const s = await T.get(this.ref(c, id)); return s.exists ? Object.assign(s.data(), { id: s.id }) : null; },
          set: (c, id, d) => { T.set(this.ref(c, id), d); },
          update: (c, id, d) => { T.update(this.ref(c, id), d); },
          delete: (c, id) => { T.delete(this.ref(c, id)); },
        };
        return fn(t);
      });
    }
    set(col, id, data) { return this.ref(col, id).set(data); }
    update(col, id, data) { return this.ref(col, id).update(data); }
    del(col, id) { return this.ref(col, id).delete(); }

    email(u) { return cleanUsername(u) + '@' + EMAIL_DOMAIN; }
    onAuth(cb) { this.auth.onAuthStateChanged((u) => cb(u ? u.uid : null)); }
    async signIn(username, pw) {
      try { await this.auth.signInWithEmailAndPassword(this.email(username), pw); } catch (e) { throw new Error(friendlyAuthError(e)); }
    }
    async signOut() { await this.auth.signOut(); }
    async createAccount(username, pw) {
      // A secondary app instance creates the login without signing the admin out.
      const sec = firebase.initializeApp(this.cfg, 'sec-' + genId());
      try {
        const c = await sec.auth().createUserWithEmailAndPassword(this.email(username), pw);
        return c.user.uid;
      } catch (e) {
        throw new Error(friendlyAuthError(e));
      } finally {
        try { await sec.auth().signOut(); } catch (e) {}
        try { await sec.delete(); } catch (e) {}
      }
    }
    async createFirstAdmin(username, pw, profile) {
      const existing = await this.get('meta', 'setup');
      if (existing) throw new Error('The administrator account has already been created. Please log in.');
      let cred;
      try { cred = await this.auth.createUserWithEmailAndPassword(this.email(username), pw); } catch (e) {
        // login exists from an interrupted earlier setup: sign in and finish it
        if (/email-already-in-use/.test(e.code || '')) { try { cred = await this.auth.signInWithEmailAndPassword(this.email(username), pw); } catch (e2) { throw new Error(friendlyAuthError(e2)); } }
        else throw new Error(friendlyAuthError(e));
      }
      const uid = cred.user.uid;
      const now = Date.now();
      const b = this.fs.batch();
      b.set(this.ref('meta', 'setup'), { adminUid: uid, at: now });
      b.set(this.ref('users', uid), Object.assign({ uid, username: cleanUsername(username), role: 'admin', active: true, createdAt: now, photo: '', phone: '' }, profile));
      await b.commit();
      const b2 = this.fs.batch();
      b2.set(this.ref('meta', 'settings'), Object.assign(clone(DEFAULT_SETTINGS), { updatedAt: now }));
      b2.set(this.ref('meta', 'counters'), { product: 0, sale: 0 });
      await b2.commit();
      return uid;
    }
    async changePassword(username, oldPw, newPw) {
      const user = this.auth.currentUser;
      try {
        const cred = firebase.auth.EmailAuthProvider.credential(this.email(username), oldPw);
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(newPw);
      } catch (e) {
        const m = friendlyAuthError(e);
        throw new Error(m === 'Wrong username or password.' ? 'Current password is wrong.' : m);
      }
    }
  }

  // ---------------------------------------------------------------- Business logic
  function Logic(backend, getActor) {
    const actor = () => {
      const a = getActor();
      if (!a || !a.uid) throw new Error('You are not logged in.');
      return a;
    };
    const requireAdmin = () => {
      const a = actor();
      if (a.role !== 'admin') throw new Error('Only the administrator can do this.');
      return a;
    };
    const num = (v, name, opts) => {
      const n = Number(v);
      opts = opts || {};
      if (v === '' || v == null || !isFinite(n)) throw new Error(name + ' must be a number.');
      if (opts.int && !Number.isInteger(n)) throw new Error(name + ' must be a whole number.');
      if (opts.min != null && n < opts.min) throw new Error(name + ' cannot be less than ' + opts.min + '.');
      return n;
    };
    const move = (t, a, p, type, change, before, after, note, ref) => {
      const id = genId();
      t.set('stockMoves', id, {
        productId: p.id, productName: p.name, type, change, before, after,
        note: note || '', ref: ref || '', by: a.uid, byName: a.name, at: Date.now(),
      });
    };
    const audit = (t, a, action, details) => {
      t.set('audit', genId(), { action, details, by: a.uid, byName: a.name, at: Date.now() });
    };

    // shared product field validation (unit of measure + optional pack/bale)
    function productFields(input) {
      const name = String(input.name || '').trim();
      if (!name) throw new Error('Product name is required.');
      const unit = UNITS[input.unit] ? input.unit : 'pcs';
      const dec = !!UNITS[unit].dec;
      const f = {
        name, nameLower: name.toLowerCase(), category: String(input.category || 'Other'), unit,
        buyPrice: r2(num(input.buyPrice, 'Buying price', { min: 0 })),
        sellPrice: r2(num(input.sellPrice, 'Selling price', { min: 0 })),
        minStock: num(input.minStock == null || input.minStock === '' ? 5 : input.minStock, 'Minimum stock level', { min: 0, int: !dec }),
        description: String(input.description || '').trim(),
        dateAdded: input.dateAdded || dayKey(Date.now()),
        packName: '', packSize: 0, packPrice: 0,
      };
      if (input.packEnabled === true || input.packEnabled === 'true' || input.packEnabled === 'on') {
        const pn = String(input.packName || '').trim().toLowerCase();
        if (!pn) throw new Error('Enter the pack name (e.g. bale, carton, sack).');
        const size = num(input.packSize, 'Units inside one ' + pn, { min: 0, int: !dec });
        if (size <= 0) throw new Error('Enter how many ' + unit + ' are inside one ' + pn + '.');
        f.packName = pn;
        f.packSize = r3(size);
        f.packPrice = input.packPrice === '' || input.packPrice == null ? r2(size * f.sellPrice) : r2(num(input.packPrice, 'Selling price per ' + pn, { min: 0 }));
      }
      return f;
    }
    function toUnits(f, amount, amountIn, label) {
      const v = num(amount, label, { min: 0 });
      if (amountIn === 'pack') {
        if (!f.packSize) throw new Error('This product has no pack size.');
        if (!Number.isInteger(v)) throw new Error(label + ': enter whole ' + plural(f.packName, 2) + '.');
        return r3(v * f.packSize);
      }
      if (!UNITS[f.unit || 'pcs'] || !UNITS[f.unit || 'pcs'].dec) { if (!Number.isInteger(v)) throw new Error(label + ' must be a whole number.'); }
      return r3(v);
    }

    async function addProduct(input) {
      const a = requireAdmin();
      const f = productFields(input);
      const qty = toUnits(f, input.qty === '' || input.qty == null ? 0 : input.qty, input.qtyIn, 'Initial stock quantity');
      return backend.tx(async (t) => {
        const counters = (await t.get('meta', 'counters')) || { product: 0, sale: 0 };
        const n = (counters.product || 0) + 1;
        const id = 'P' + pad(n, 4);
        const now = Date.now();
        const p = Object.assign({ id }, f, { qty, createdAt: now, updatedAt: now, createdBy: a.uid });
        t.set('meta', 'counters', Object.assign({}, counters, { product: n }));
        t.set('products', id, p);
        if (qty > 0) move(t, a, p, 'initial', qty, 0, qty, 'Opening stock');
        return p;
      });
    }

    async function updateProduct(id, input) {
      requireAdmin();
      const upd = Object.assign(productFields(input), { updatedAt: Date.now() });
      return backend.tx(async (t) => {
        const p = await t.get('products', id);
        if (!p) throw new Error('Product not found. It may have been deleted.');
        if ((p.unit || 'pcs') !== upd.unit && !UNITS[upd.unit].dec && !Number.isInteger(p.qty)) throw new Error('Current stock (' + p.qty + ') is not a whole number - fix the stock count before changing the unit to ' + upd.unit + '.');
        t.update('products', id, upd);
      });
    }

    /** amountIn: 'unit' (default) or 'pack' - e.g. receive 4 bales. newBuyPrice is per base unit. */
    async function adjustStock(id, mode, amount, note, newBuyPrice, amountIn) {
      const a = requireAdmin();
      return backend.tx(async (t) => {
        const p = await t.get('products', id);
        if (!p) throw new Error('Product not found.');
        const amt = toUnits(p, amount, amountIn, 'Quantity');
        if (mode !== 'set' && amt <= 0) throw new Error('Quantity must be more than 0.');
        const before = p.qty;
        let after = before;
        if (mode === 'add') after = r3(before + amt);
        else if (mode === 'remove') after = r3(before - amt);
        else after = amt;
        if (after < 0) throw new Error('Cannot remove ' + fmtQ(amt) + ' ' + (p.unit || 'pcs') + ' - only ' + fmtQ(before) + ' in stock.');
        const upd = { qty: after, updatedAt: Date.now() };
        if (newBuyPrice !== undefined && newBuyPrice !== '' && newBuyPrice !== null) upd.buyPrice = r2(num(newBuyPrice, 'Buying price', { min: 0 }));
        t.update('products', id, upd);
        const type = mode === 'add' ? 'restock' : mode === 'remove' ? 'removal' : 'adjustment';
        move(t, a, p, type, r3(after - before), before, after, (amountIn === 'pack' ? fmtQ(amount) + ' ' + plural(p.packName, Number(amount)) + '. ' : '') + (note || ''));
        return after;
      });
    }

    async function deleteProduct(id) {
      const a = requireAdmin();
      return backend.tx(async (t) => {
        const p = await t.get('products', id);
        if (!p) return;
        t.delete('products', id);
        audit(t, a, 'product_deleted', { productId: id, name: p.name, qty: p.qty });
      });
    }

    /**
     * Complete a sale atomically.
     * items: [{productId, qty}], payment: {amountPaid, method, customerName, customerPhone}
     * saleId must be generated once per cart - a retry with the same id cannot record twice.
     */
    async function completeSale(saleId, items, payment) {
      const a = actor();
      if (!saleId) throw new Error('Missing sale id.');
      const reqs = (items || []).map((it) => ({ productId: it.productId, mode: it.mode || 'unit', value: it.value != null ? it.value : it.qty }));
      const ids = Array.from(new Set(reqs.map((r) => r.productId)));
      if (!ids.length) throw new Error('Add at least one product to the sale.');
      const paid = r2(num(payment.amountPaid, 'Amount paid', { min: 0 }));
      const method = ['Cash', 'M-Pesa', 'Bank', 'Other'].includes(payment.method) ? payment.method : 'Cash';
      const customerName = String(payment.customerName || '').trim();
      const customerPhone = String(payment.customerPhone || '').trim();
      const reference = String(payment.reference || '').trim();

      return backend.tx(async (t) => {
        // ---- all reads first (required by Firestore transactions)
        const dup = await t.get('sales', saleId);
        if (dup) throw new Error('This sale was already recorded (receipt ' + dup.receiptNo + ').');
        const counters = (await t.get('meta', 'counters')) || { product: 0, sale: 0 };
        const prods = {};
        for (const id of ids) prods[id] = await t.get('products', id);

        // ---- validate & compute
        const lines = [];
        const need = {};
        for (const r of reqs) {
          const p = prods[r.productId];
          if (!p) throw new Error('A product in the cart no longer exists. Remove it and try again.');
          const x = resolveLine(p, r.mode, r.value);
          const unitCost = r2(p.buyPrice);
          const cost = r2(unitCost * x.qty);
          need[p.id] = r3((need[p.id] || 0) + x.qty);
          lines.push({
            productId: p.id, name: p.name, category: p.category || '', unit: p.unit || 'pcs',
            mode: x.mode, value: x.value, qty: x.qty, qtyText: x.qtyText, rate: x.rate, rateUnit: x.rateUnit,
            unitPrice: x.qty ? r2(x.subtotal / x.qty) : 0, unitCost, subtotal: x.subtotal, cost, profit: r2(x.subtotal - cost),
          });
        }
        for (const id of ids) {
          const p = prods[id];
          if (need[id] > p.qty + 1e-9) throw new Error('Not enough stock for "' + p.name + '": only ' + stockText(p) + ' available, you tried to sell ' + fmtQ(need[id]) + ' ' + (p.unit || 'pcs') + '.');
        }
        const total = r2(lines.reduce((s, l) => s + l.subtotal, 0));
        const totalCost = r2(lines.reduce((s, l) => s + l.cost, 0));
        const applied = r2(Math.min(paid, total));
        const balanceDue = r2(total - applied);
        const change = r2(Math.max(0, paid - total));
        if (balanceDue > 0) {
          if (customerName.length < 3) throw new Error("The customer has not paid in full. Enter the customer's full name.");
          if (!/^[+0-9][0-9 ]{8,15}$/.test(customerPhone)) throw new Error("The customer has not paid in full. Enter a valid phone number (e.g. 0712345678).");
        }
        const n = (counters.sale || 0) + 1;
        const now = Date.now();
        const receiptNo = 'SGS-' + dayKey(now).replace(/-/g, '') + '-' + pad(n, 5);
        const sale = {
          id: saleId, receiptNo, seq: n, at: now, dateKey: dayKey(now),
          sellerId: a.uid, sellerName: a.name,
          items: lines, itemCount: r3(lines.reduce((s, l) => s + l.qty, 0)),
          total, totalCost, profit: r2(total - totalCost),
          amountPaid: paid, amountApplied: applied, change, balanceDue,
          paymentStatus: balanceDue <= 0 ? 'paid' : applied > 0 ? 'partial' : 'unpaid',
          method, reference, customerName, customerPhone,
          payments: applied > 0 ? [{ amount: applied, method, at: now, by: a.uid, byName: a.name, note: 'At sale' }] : [],
          reversed: false, status: 'completed', clearedAt: balanceDue <= 0 ? now : null,
        };

        // ---- writes
        for (const id of ids) {
          const p = prods[id];
          const after = r3(p.qty - need[id]);
          t.update('products', id, { qty: after, updatedAt: now });
          move(t, a, p, 'sale', -need[id], p.qty, after, 'Sold ' + lines.filter((l) => l.productId === id).map((l) => l.qtyText).join(' + '), receiptNo);
        }
        t.set('sales', saleId, sale);
        t.set('meta', 'counters', Object.assign({}, counters, { sale: n }));
        return sale;
      });
    }

    async function recordPayment(saleId, amount, method, note) {
      const a = actor();
      const amt = r2(num(amount, 'Amount', { min: 0 }));
      if (amt <= 0) throw new Error('Enter the amount the customer has paid.');
      return backend.tx(async (t) => {
        const s = await t.get('sales', saleId);
        if (!s) throw new Error('Sale not found.');
        if (s.reversed) throw new Error('This sale was reversed.');
        if (a.role !== 'admin' && s.sellerId !== a.uid) throw new Error('Only the seller who made this sale or the administrator can record its payments.');
        if (s.balanceDue <= 0) throw new Error('This sale is already fully paid.');
        if (amt > s.balanceDue + 0.001) throw new Error('Amount is more than the balance due (' + s.balanceDue + ').');
        const now = Date.now();
        const applied = r2(s.amountApplied + amt);
        const balanceDue = r2(s.total - applied);
        const payments = (s.payments || []).concat([{ amount: amt, method: method || 'Cash', at: now, by: a.uid, byName: a.name, note: String(note || 'Debt payment') }]);
        t.update('sales', saleId, {
          payments, amountApplied: applied, balanceDue,
          paymentStatus: balanceDue <= 0 ? 'paid' : 'partial',
          clearedAt: balanceDue <= 0 ? now : null, updatedAt: now,
        });
        return balanceDue;
      });
    }

    async function updateDebtor(saleId, name, phone) {
      const a = actor();
      return backend.tx(async (t) => {
        const s = await t.get('sales', saleId);
        if (!s) throw new Error('Sale not found.');
        if (a.role !== 'admin' && s.sellerId !== a.uid) throw new Error('Not allowed.');
        t.update('sales', saleId, { customerName: String(name || '').trim(), customerPhone: String(phone || '').trim(), updatedAt: Date.now() });
      });
    }

    async function reverseSale(saleId, reason) {
      const a = requireAdmin();
      reason = String(reason || '').trim();
      if (reason.length < 3) throw new Error('Enter the reason for reversing this sale.');
      return backend.tx(async (t) => {
        const s = await t.get('sales', saleId);
        if (!s) throw new Error('Sale not found.');
        if (s.reversed) throw new Error('This sale was already reversed.');
        const prods = {};
        for (const l of s.items) if (!(l.productId in prods)) prods[l.productId] = await t.get('products', l.productId);
        const now = Date.now();
        const qtyNow = {};
        for (const l of s.items) {
          const p = prods[l.productId];
          if (!p) continue; // product deleted - nothing to restock
          const before = qtyNow[p.id] != null ? qtyNow[p.id] : p.qty;
          const after = r3(before + l.qty);
          qtyNow[p.id] = after;
          move(t, a, p, 'reversal', l.qty, before, after, 'Sale reversed: ' + reason, s.receiptNo);
        }
        for (const id of Object.keys(qtyNow)) t.update('products', id, { qty: qtyNow[id], updatedAt: now });
        t.update('sales', saleId, { reversed: true, status: 'reversed', reversedAt: now, reversedBy: a.uid, reversedByName: a.name, reverseReason: reason, updatedAt: now });
        audit(t, a, 'sale_reversed', { saleId, receiptNo: s.receiptNo, total: s.total, sellerName: s.sellerName, reason });
      });
    }

    // ---- users
    async function createUser(input) {
      const a = requireAdmin();
      const username = cleanUsername(input.username);
      if (!validUsername(username)) throw new Error('Username must be 3-30 characters: letters, numbers, dot, dash or underscore (no spaces).');
      const name = String(input.name || '').trim();
      if (!name) throw new Error("Enter the user's full name.");
      if (String(input.password || '').length < 6) throw new Error('Password must be at least 6 characters.');
      const role = input.role === 'admin' ? 'admin' : 'seller';
      const uid = await backend.createAccount(username, input.password);
      const now = Date.now();
      await backend.tx(async (t) => {
        t.set('users', uid, { uid, username, name, role, phone: String(input.phone || '').trim(), photo: '', active: true, createdAt: now, createdBy: a.uid });
        audit(t, a, 'user_created', { uid, username, role });
      });
      return uid;
    }
    async function adminUpdateUser(uid, input) {
      const a = requireAdmin();
      if (uid === a.uid && (input.active === false || input.role === 'seller')) throw new Error('You cannot disable or demote your own account.');
      return backend.tx(async (t) => {
        const u = await t.get('users', uid);
        if (!u) throw new Error('User not found.');
        const upd = {};
        if (input.name != null) upd.name = String(input.name).trim() || u.name;
        if (input.phone != null) upd.phone = String(input.phone).trim();
        if (input.role) upd.role = input.role === 'admin' ? 'admin' : 'seller';
        if (input.active != null) upd.active = !!input.active;
        if (input.salary != null && input.salary !== '') upd.salary = r2(num(input.salary, 'Salary', { min: 0 }));
        if (input.salaryPeriod) upd.salaryPeriod = input.salaryPeriod === 'weekly' ? 'weekly' : 'monthly';
        if (input.commissionRate != null && input.commissionRate !== '') {
          upd.commissionRate = num(input.commissionRate, 'Commission rate', { min: 0 });
          if (upd.commissionRate > 100) throw new Error('Commission rate cannot be more than 100%.');
        }
        t.update('users', uid, upd);
        audit(t, a, 'user_updated', Object.assign({ uid, username: u.username }, upd));
      });
    }
    async function updateMyProfile(input) {
      const a = actor();
      const upd = {};
      if (input.name != null) { const n = String(input.name).trim(); if (!n) throw new Error('Name cannot be empty.'); upd.name = n; }
      if (input.phone != null) upd.phone = String(input.phone).trim();
      if (input.photo != null) {
        if (input.photo && input.photo.length > 200000) throw new Error('Photo is too large.');
        upd.photo = input.photo;
      }
      if (input.mustChangePassword === false) upd.mustChangePassword = false;
      return backend.update('users', a.uid, upd);
    }

    // ---- salaries & commission
    const PAY_TYPES = ['salary', 'commission', 'bonus', 'advance', 'other'];
    /** input: {id?, sellerId, type, amount, method, reference, note, periodKey, periodLabel, from, to, basis, message} */
    async function payStaff(input) {
      const a = requireAdmin();
      const amount = r2(num(input.amount, 'Amount', { min: 0 }));
      if (amount <= 0) throw new Error('Enter the amount to pay.');
      const type = PAY_TYPES.includes(input.type) ? input.type : 'other';
      const id = input.id || genId();
      return backend.tx(async (t) => {
        const u = await t.get('users', input.sellerId);
        if (!u) throw new Error('Seller not found.');
        const ex = await t.get('payroll', id);
        if (ex && ex.status !== 'void') throw new Error('Already paid: ' + (ex.periodLabel || ex.type) + ' - ' + ex.amount + ' was paid on ' + new Date(ex.paidAt).toLocaleDateString('en-GB') + '.');
        const now = Date.now();
        const rec = {
          id, sellerId: input.sellerId, sellerName: u.name, type, amount,
          method: ['Cash', 'M-Pesa', 'Bank', 'Other'].includes(input.method) ? input.method : 'Cash',
          reference: String(input.reference || '').trim(), note: String(input.note || '').trim(),
          periodKey: input.periodKey || '', periodLabel: input.periodLabel || '', from: input.from || null, to: input.to || null,
          basis: input.basis || null, status: 'paid', paidAt: now, paidBy: a.uid, paidByName: a.name, receivedAt: null,
        };
        t.set('payroll', id, rec);
        const mid = genId();
        const readBy = {};
        readBy[a.uid] = true;
        t.set('messages', mid, { id: mid, threadId: mid, fromUid: a.uid, fromName: a.name, fromRole: 'admin', toUid: input.sellerId, text: String(input.message || ('Payment sent: ' + amount)), at: now, readBy, kind: 'payment' });
        audit(t, a, 'staff_paid', { sellerName: u.name, type, amount, period: rec.periodLabel });
        return rec;
      });
    }
    async function voidPayment(id, reason) {
      const a = requireAdmin();
      reason = String(reason || '').trim();
      if (reason.length < 3) throw new Error('Enter the reason for cancelling this payment.');
      return backend.tx(async (t) => {
        const p = await t.get('payroll', id);
        if (!p) throw new Error('Payment not found.');
        if (p.status === 'void') throw new Error('Already cancelled.');
        t.update('payroll', id, { status: 'void', voidReason: reason, voidedAt: Date.now(), voidedBy: a.name });
        audit(t, a, 'staff_payment_cancelled', { sellerName: p.sellerName, type: p.type, amount: p.amount, reason });
      });
    }
    async function confirmReceived(id) {
      const a = actor();
      return backend.tx(async (t) => {
        const p = await t.get('payroll', id);
        if (!p || p.sellerId !== a.uid) throw new Error('Payment not found.');
        if (p.receivedAt) return;
        t.update('payroll', id, { receivedAt: Date.now() });
      });
    }

    // ---- messages
    async function sendMessage(toUid, text, threadId) {
      const a = actor();
      text = String(text || '').trim();
      if (!text) throw new Error('Type a message first.');
      if (text.length > 2000) throw new Error('Message is too long (max 2000 characters).');
      if (a.role !== 'admin') toUid = 'admins';
      if (!toUid) throw new Error('Choose who to send the message to.');
      const id = genId();
      const msg = { id, threadId: threadId || id, fromUid: a.uid, fromName: a.name, fromRole: a.role, toUid, text, at: Date.now(), readBy: {} };
      msg.readBy[a.uid] = true;
      await backend.set('messages', id, msg);
      return msg;
    }
    async function markRead(msgIds) {
      const a = actor();
      for (const id of msgIds) {
        const upd = {};
        upd['readBy.' + a.uid] = true;
        try { await backend.update('messages', id, upd); } catch (e) { console.warn(e); }
      }
    }

    async function saveSettings(input) {
      const a = requireAdmin();
      const s = Object.assign({}, input);
      s.lowStockDefault = num(s.lowStockDefault, 'Default minimum stock', { min: 0, int: true });
      s.debtAlertHours = num(s.debtAlertHours, 'Debt alert hours', { min: 1 });
      s.categories = (s.categories || []).map((c) => String(c).trim()).filter(Boolean);
      if (!s.categories.length) s.categories = ['Other'];
      s.updatedAt = Date.now();
      return backend.tx(async (t) => {
        const cur = (await t.get('meta', 'settings')) || {};
        delete cur.id;
        t.set('meta', 'settings', Object.assign({}, DEFAULT_SETTINGS, cur, s));
        audit(t, a, 'settings_updated', {});
      });
    }

    return { addProduct, updateProduct, adjustStock, deleteProduct, completeSale, recordPayment, updateDebtor, reverseSale, createUser, adminUpdateUser, updateMyProfile, sendMessage, markRead, saveSettings, payStaff, voidPayment, confirmReceived };
  }

  // ---------------------------------------------------------------- Reporting helpers (pure)
  const Reports = {
    valid(sales) { return sales.filter((s) => !s.reversed); },
    between(sales, from, to) { return Reports.valid(sales).filter((s) => s.at >= from && s.at < to); },
    summarize(sales) {
      const o = { count: 0, revenue: 0, cost: 0, profit: 0, units: 0, collectedAtSale: 0, balance: 0 };
      for (const s of sales) {
        o.count++;
        o.revenue += s.total;
        o.cost += s.totalCost;
        o.profit += s.total - s.totalCost;
        o.units += s.itemCount;
        o.balance += s.balanceDue;
      }
      for (const k of Object.keys(o)) o[k] = k === 'units' ? r3(o[k]) : r2(o[k]);
      return o;
    },
    collected(sales, from, to) {
      let sum = 0;
      for (const s of Reports.valid(sales)) for (const p of s.payments || []) if (p.at >= from && p.at < to) sum += p.amount;
      return r2(sum);
    },
    byProduct(sales) {
      const m = {};
      for (const s of Reports.valid(sales)) {
        for (const l of s.items) {
          const x = m[l.productId] || (m[l.productId] = { productId: l.productId, name: l.name, unit: l.unit || 'pcs', qty: 0, revenue: 0, cost: 0, profit: 0 });
          x.name = l.name;
          x.qty += l.qty;
          x.revenue += l.subtotal;
          x.cost += l.cost;
          x.profit += l.profit;
        }
      }
      return Object.values(m).map((x) => Object.assign(x, {
        qty: r3(x.qty), revenue: r2(x.revenue), cost: r2(x.cost), profit: r2(x.profit),
        avgBuy: x.qty ? r2(x.cost / x.qty) : 0, avgSell: x.qty ? r2(x.revenue / x.qty) : 0,
      })).sort((a, b) => b.profit - a.profit);
    },
    bySeller(sales) {
      const m = {};
      for (const s of Reports.valid(sales)) {
        const x = m[s.sellerId] || (m[s.sellerId] = { sellerId: s.sellerId, name: s.sellerName, count: 0, revenue: 0, cost: 0, profit: 0, balance: 0, collected: 0 });
        x.count++;
        x.revenue += s.total;
        x.cost += s.totalCost;
        x.profit += s.total - s.totalCost;
        x.balance += s.balanceDue;
        x.collected += s.amountApplied;
      }
      return Object.values(m).map((x) => Object.assign(x, { revenue: r2(x.revenue), cost: r2(x.cost), profit: r2(x.profit), balance: r2(x.balance), collected: r2(x.collected) })).sort((a, b) => b.revenue - a.revenue);
    },
    staffCost(payroll, from, to) {
      return r2((payroll || []).filter((p) => p.status !== 'void' && p.paidAt >= from && p.paidAt < to).reduce((a, p) => a + p.amount, 0));
    },
    bestSeller(sales) {
      const list = Reports.byProduct(sales).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
      return list[0] || null;
    },
  };

  global.ShalomCore = { LocalBackend, FirebaseBackend, Logic, Reports, DEFAULT_SETTINGS, dayKey, genId, r2, r3, pad, cleanUsername, validUsername, UNITS, PACK_NAMES, unitInfo, isDec, hasPack, packPrice, fmtQ, plural, stockText, resolveLine };
})(window);
