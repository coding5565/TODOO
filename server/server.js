'use strict';
// Xodimlar nazorati: super adminlar (har biri o'z xodimlari bilan) va xodim akkauntlari
// Express + Node.js ichki SQLite
const express = require('express');
const { DatabaseSync, backup } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAX_ADMINS = Math.max(1, Number(process.env.MAX_ADMINS) || 3);
const SESSION_DAYS = 30;
const DAY = 86400e3;

fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'nazorat.db'));
db.exec('PRAGMA journal_mode = WAL');

/* ---------- jadvallar va eski bazani yangilash ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pass TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS log(id INTEGER PRIMARY KEY, ws INTEGER NOT NULL, ts INTEGER NOT NULL, who TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS log_ws ON log(ws, id);
`);
const colsOf = t => db.prepare(`PRAGMA table_info(${t})`).all().map(r => r.name);
if (!colsOf('users').includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  db.exec('ALTER TABLE users ADD COLUMN ws INTEGER');
  db.exec('ALTER TABLE users ADD COLUMN emp_id TEXT');
}
db.exec("UPDATE users SET ws = id WHERE role = 'admin' AND ws IS NULL");
{
  const dc = colsOf('docs');
  const NEW_DOCS = 'ws INTEGER NOT NULL, col TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(ws, col, id)';
  if (!dc.length) db.exec(`CREATE TABLE docs(${NEW_DOCS})`);
  else if (!dc.includes('ws')) {
    // eski bitta foydalanuvchili baza: barcha ma'lumot birinchi super adminniki bo'ladi
    const first = (db.prepare("SELECT MIN(id) AS m FROM users WHERE role = 'admin'").get() || {}).m || 1;
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE docs_new(${NEW_DOCS})`);
      db.prepare('INSERT INTO docs_new(ws, col, id, body, updated) SELECT ?, col, id, body, updated FROM docs').run(first);
      db.exec('DROP TABLE docs');
      db.exec('ALTER TABLE docs_new RENAME TO docs');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  adminCount: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'"),
  userCount: db.prepare('SELECT COUNT(*) AS c FROM users'),
  addUser: db.prepare('INSERT INTO users(username, pass, created, role, ws, emp_id) VALUES(?,?,?,?,?,?)'),
  setWs: db.prepare('UPDATE users SET ws = ? WHERE id = ?'),
  setPass: db.prepare('UPDATE users SET pass = ? WHERE id = ?'),
  staffOf: db.prepare("SELECT id, emp_id, username, created FROM users WHERE ws = ? AND role = 'staff' ORDER BY id"),
  staffByEmp: db.prepare("SELECT id, username FROM users WHERE ws = ? AND role = 'staff' AND emp_id = ?"),
  delUser: db.prepare('DELETE FROM users WHERE id = ?'),
  addSession: db.prepare('INSERT INTO sessions(token, user_id, expires) VALUES(?,?,?)'),
  getSession: db.prepare('SELECT s.token, s.expires, u.id AS uid, u.username, u.role, u.ws, u.emp_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?'),
  touchSession: db.prepare('UPDATE sessions SET expires = ? WHERE token = ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?'),
  purge: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
  getDoc: db.prepare('SELECT body FROM docs WHERE ws = ? AND col = ? AND id = ?'),
  putDoc: db.prepare('INSERT INTO docs(ws, col, id, body, updated) VALUES(?,?,?,?,?) ON CONFLICT(ws, col, id) DO UPDATE SET body = excluded.body, updated = excluded.updated'),
  delDoc: db.prepare('DELETE FROM docs WHERE ws = ? AND col = ? AND id = ?'),
  listDocs: db.prepare('SELECT id, body FROM docs WHERE ws = ? AND col = ? ORDER BY id LIMIT 5000'),
  likeDocs: db.prepare("SELECT id, body FROM docs WHERE ws = ? AND col = ? AND id LIKE ? ESCAPE '\\' ORDER BY id"),
  getSetting: db.prepare('SELECT v FROM settings WHERE k = ?'),
  putSetting: db.prepare('INSERT INTO settings(k, v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
  addLog: db.prepare('INSERT INTO log(ws, ts, who, role, text) VALUES(?,?,?,?,?)'),
  listLog: db.prepare('SELECT ts, who, role, text FROM log WHERE ws = ? ORDER BY id DESC LIMIT ?'),
  purgeLog: db.prepare('DELETE FROM log WHERE ts < ?'),
};

/* ---------- parol va sessiya ---------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return 's1$' + salt.toString('hex') + '$' + h.toString('hex');
}
async function checkPw(pw, stored) {
  const [v, s, h] = String(stored).split('$');
  if (v !== 's1' || !s || !h) return false;
  const hh = await scrypt(pw, Buffer.from(s, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(h, 'hex');
  return hh.length === want.length && crypto.timingSafeEqual(hh, want);
}
let DUMMY = null; // mavjud bo'lmagan foydalanuvchi uchun ham bir xil vaqt sarflash
hashPw('dummy-password').then(h => (DUMMY = h));

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setSessionCookie(req, res, token, maxAgeSec) {
  const parts = ['sid=' + token, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=' + maxAgeSec];
  if (req.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function newSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  q.addSession.run(sha(token), userId, Date.now() + SESSION_DAYS * DAY);
  setSessionCookie(req, res, token, SESSION_DAYS * 86400);
}
function sessionOf(req) {
  const t = parseCookies(req).sid;
  if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
  const s = q.getSession.get(sha(t), Date.now());
  if (!s) return null;
  if (s.expires - Date.now() < (SESSION_DAYS - 1) * DAY) q.touchSession.run(Date.now() + SESSION_DAYS * DAY, s.token);
  return s;
}

/* ---------- urinishlarni cheklash ---------- */
const fails = new Map();
const locked = ip => { const f = fails.get(ip); return f && f.until > Date.now(); };
function failed(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until && f.until <= Date.now()) { f.n = 0; f.until = 0; }
  f.n++;
  if (f.n >= 8) f.until = Date.now() + 15 * 60e3;
  fails.set(ip, f);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of fails) if (v.until < now && v.n < 8) fails.delete(k); }, 3600e3).unref();

/* ---------- super admin ro'yxatdan o'tish kodi (maxfiy kod) ---------- */
let adminCode = process.env.ADMIN_CODE || process.env.SETUP_CODE || (q.getSetting.get('admin_code') || {}).v;
if (!adminCode) { adminCode = crypto.randomBytes(4).toString('hex'); q.putSetting.run('admin_code', adminCode); }
function printCode() {
  const n = q.adminCount.get().c;
  if (n >= MAX_ADMINS) return;
  console.log('\n==============================================');
  console.log(` Super admin akkaunt ochish kodi: ${adminCode}`);
  console.log(` (hozir ${n} ta super admin, eng ko'pi ${MAX_ADMINS} ta)`);
  console.log('==============================================\n');
}
printCode();

/* ---------- sana yordamchilari (server vaqti bo'yicha) ---------- */
const pad2 = n => String(n).padStart(2, '0');
const dstr = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return dstr(d); };
const localToday = () => dstr(new Date());
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = s => typeof s === 'string' && DATE_RE.test(s) && dstr(pd(s)) === s;
const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');

/* ---------- hujjatlar (har super adminning o'z maydoni) ---------- */
function readDoc(ws, col, id) {
  const r = q.getDoc.get(ws, col, id);
  if (!r) return null;
  try { return JSON.parse(r.body); } catch (e) { return null; }
}
const writeDoc = (ws, col, id, obj) => q.putDoc.run(ws, col, id, JSON.stringify(obj), Date.now());
const likeEsc = s => String(s).replace(/[\\%_]/g, c => '\\' + c);

/* takrorlanuvchi topshiriqlarni (har kuni/hafta/oy) serverda yaratish */
function ensureRules(ws) {
  const meta = readDoc(ws, 'app', 'meta');
  if (!meta || !Array.isArray(meta.rules) || !meta.rules.length) return;
  const t = localToday(), floor = addDays(t, -60), docs = new Map();
  const load = id => {
    if (!docs.has(id)) { const d = readDoc(ws, 'tasks', id); docs.set(id, { items: d && Array.isArray(d.items) ? d.items : [], changed: false }); }
    return docs.get(id);
  };
  for (const r of meta.rules) {
    if (!r || !r.id || !r.emp || !validDate(r.start)) continue;
    const dates = [];
    if (r.rep === 'day') { for (let d = r.start < floor ? floor : r.start; d <= t; d = addDays(d, 1)) dates.push(d); }
    else if (r.rep === 'week') { for (let d = r.start; d <= t; d = addDays(d, 7)) if (d >= floor) dates.push(d); }
    else if (r.rep === 'month') {
      const s = pd(r.start);
      for (let k = 0; k < 600; k++) {
        const dim = new Date(s.getFullYear(), s.getMonth() + k + 1, 0).getDate();
        const x = dstr(new Date(s.getFullYear(), s.getMonth() + k, Math.min(s.getDate(), dim)));
        if (x > t) break;
        if (x >= floor) dates.push(x);
      }
    }
    for (const d of dates) {
      if ((r.skip || []).includes(d)) continue;
      const doc = load(d.slice(0, 7) + '_' + r.emp);
      if (doc.items.some(x => x.rule === r.id && x.due === d)) continue;
      doc.items.push({ id: uid(), emp: r.emp, title: r.title, per: r.rep, due: d, done: false, doneAt: '', note: '', rule: r.id });
      doc.changed = true;
    }
  }
  for (const [id, doc] of docs) if (doc.changed) writeDoc(ws, 'tasks', id, { items: doc.items });
}

function logAct(user, text) {
  q.addLog.run(user.ws, Date.now(), user.username, user.role, String(text).slice(0, 500));
}

/* ---------- ilova ---------- */
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  // CSRF: boshqa saytdan o'zboshimcha so'rov yuborib bo'lmaydigan maxsus sarlavha talab qilinadi
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'nazorat') return res.status(403).json({ error: 'forbidden' });
  next();
});
app.use(express.json({ limit: '1mb' }));

const auth = (req, res, next) => {
  const s = sessionOf(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  req.user = s;
  next();
};
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Bu amal faqat super admin uchun' }));
const staffOnly = (req, res, next) => (req.user.role === 'staff' ? next() : res.status(403).json({ error: 'Bu amal faqat xodim uchun' }));
const page = name => (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'public', name)); };

app.get('/', (req, res) => (sessionOf(req) ? page('app.html')(req, res) : res.redirect('/login')));
app.get('/login', (req, res) => (sessionOf(req) ? res.redirect('/') : page('login.html')(req, res)));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { etag: true, maxAge: 0, setHeaders: r => r.setHeader('Cache-Control', 'no-cache') }));
app.get('/vendor/jszip.min.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules', 'jszip', 'dist', 'jszip.min.js')));
app.get('/healthz', (req, res) => res.type('text').send('ok'));

app.get('/api/status', (req, res) => {
  const s = sessionOf(req);
  res.json({ hasUsers: q.userCount.get().c > 0, loggedIn: !!s, canRegister: q.adminCount.get().c < MAX_ADMINS });
});

const NAME_RE = /^[A-Za-z0-9_.@-]{3,40}$/;
const NAME_MSG = 'Login 3-40 belgi bo\'lsin: lotin harflari, raqam, nuqta, pastki chiziq';
const tooMany = res => res.status(429).json({ error: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urining' });

/* super admin ro'yxatdan o'tishi (maxfiy kod bilan) */
app.post('/api/register-admin', async (req, res) => {
  try {
    if (locked(req.ip)) return tooMany(res);
    if (q.adminCount.get().c >= MAX_ADMINS) return res.status(409).json({ error: `Super adminlar soni to'lgan (${MAX_ADMINS} ta)` });
    const { code, username, password } = req.body || {};
    const a = Buffer.from(String(code || '')), b = Buffer.from(adminCode);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { failed(req.ip); return res.status(403).json({ error: 'Maxfiy kod noto\'g\'ri' }); }
    if (!NAME_RE.test(String(username || ''))) return res.status(400).json({ error: NAME_MSG });
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Parol kamida 8 belgi bo\'lsin' });
    if (q.userByName.get(username)) return res.status(409).json({ error: 'Bu login band, boshqasini tanlang' });
    const r = q.addUser.run(username, await hashPw(password), Date.now(), 'admin', null, null);
    q.setWs.run(r.lastInsertRowid, r.lastInsertRowid);
    newSession(req, res, r.lastInsertRowid);
    printCode();
    res.json({ ok: true, role: 'admin' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server xatosi' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    if (locked(req.ip)) return tooMany(res);
    const { username, password } = req.body || {};
    const u = typeof username === 'string' ? q.userByName.get(username) : null;
    const ok = await checkPw(typeof password === 'string' ? password.slice(0, 200) : '', u ? u.pass : DUMMY || 's1$00$00');
    if (!u || !ok) { failed(req.ip); return res.status(401).json({ error: 'Login yoki parol noto\'g\'ri' }); }
    fails.delete(req.ip);
    newSession(req, res, u.id);
    res.json({ ok: true, role: u.role });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server xatosi' }); }
});

app.post('/api/logout', (req, res) => {
  const t = parseCookies(req).sid;
  if (t) q.delSession.run(sha(t));
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json({ username: req.user.username, role: req.user.role, empId: req.user.emp_id || null }));

/* parolni o'zgartirish (hammada) */
app.post('/api/password', auth, async (req, res) => {
  try {
    if (locked(req.ip)) return tooMany(res);
    const { old, next } = req.body || {};
    const u = q.userById.get(req.user.uid);
    const min = u.role === 'admin' ? 8 : 6;
    if (typeof old !== 'string' || !(await checkPw(old.slice(0, 200), u.pass))) { failed(req.ip); return res.status(403).json({ error: 'Hozirgi parol noto\'g\'ri' }); }
    if (typeof next !== 'string' || next.length < min || next.length > 200) return res.status(400).json({ error: `Yangi parol kamida ${min} belgi bo'lsin` });
    q.setPass.run(await hashPw(next), u.id);
    q.delOtherSessions.run(u.id, req.user.token);
    if (u.role === 'staff') logAct(req.user, 'Parolini o\'zgartirdi');
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server xatosi' }); }
});

/* ---------- super admin: ma'lumotlar (hujjatlar) ---------- */
const COLS = new Set(['app', 'tasks', 'vals']);
const ID_RE = /^[A-Za-z0-9_.:@+~-]{1,200}$/;
const MAX_DOC = 256 * 1024;
const okPath = (req, res, next) => {
  if (!COLS.has(req.params.col) || (req.params.id !== undefined && !ID_RE.test(req.params.id))) return res.status(400).json({ error: 'bad path' });
  next();
};
app.get('/api/doc/:col/:id', auth, adminOnly, okPath, (req, res) => {
  const r = q.getDoc.get(req.user.ws, req.params.col, req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.type('json').send(r.body);
});
app.put('/api/doc/:col/:id', auth, adminOnly, okPath, (req, res) => {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ error: 'object kerak' });
  const s = JSON.stringify(b);
  if (Buffer.byteLength(s) > MAX_DOC) return res.status(413).json({ error: 'hujjat juda katta' });
  q.putDoc.run(req.user.ws, req.params.col, req.params.id, s, Date.now());
  res.status(204).end();
});
app.delete('/api/doc/:col/:id', auth, adminOnly, okPath, (req, res) => {
  q.delDoc.run(req.user.ws, req.params.col, req.params.id);
  res.status(204).end();
});
app.get('/api/col/:col', auth, adminOnly, okPath, (req, res) => {
  if (req.params.col === 'tasks') ensureRules(req.user.ws);
  const rows = q.listDocs.all(req.user.ws, req.params.col);
  res.type('json').send('[' + rows.map(r => '{"id":' + JSON.stringify(r.id) + ',"body":' + r.body + '}').join(',') + ']');
});

/* ---------- super admin: xodim akkauntlari ---------- */
app.get('/api/staff', auth, adminOnly, (req, res) => {
  res.json(q.staffOf.all(req.user.ws).map(r => ({ empId: r.emp_id, username: r.username, created: r.created })));
});
app.post('/api/staff', auth, adminOnly, async (req, res) => {
  try {
    const { empId, username, password } = req.body || {};
    if (typeof empId !== 'string' || !ID_RE.test(empId)) return res.status(400).json({ error: 'Xodim aniqlanmadi' });
    if (!NAME_RE.test(String(username || ''))) return res.status(400).json({ error: NAME_MSG });
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) return res.status(400).json({ error: 'Parol kamida 6 belgi bo\'lsin' });
    if (q.staffByEmp.get(req.user.ws, empId)) return res.status(409).json({ error: 'Bu xodimning akkaunti allaqachon bor' });
    if (q.userByName.get(username)) return res.status(409).json({ error: 'Bu login band, boshqasini tanlang' });
    q.addUser.run(username, await hashPw(password), Date.now(), 'staff', req.user.ws, empId);
    logAct(req.user, `Xodim akkaunti ochildi: ${username}`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server xatosi' }); }
});
app.put('/api/staff/:empId/password', auth, adminOnly, async (req, res) => {
  try {
    const row = q.staffByEmp.get(req.user.ws, req.params.empId);
    if (!row) return res.status(404).json({ error: 'Akkaunt topilmadi' });
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) return res.status(400).json({ error: 'Parol kamida 6 belgi bo\'lsin' });
    q.setPass.run(await hashPw(password), row.id);
    q.delUserSessions.run(row.id);
    logAct(req.user, `${row.username} uchun yangi parol qo'yildi`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server xatosi' }); }
});
app.delete('/api/staff/:empId', auth, adminOnly, (req, res) => {
  const row = q.staffByEmp.get(req.user.ws, req.params.empId);
  if (!row) return res.status(404).json({ error: 'Akkaunt topilmadi' });
  q.delUserSessions.run(row.id);
  q.delUser.run(row.id);
  logAct(req.user, `Xodim akkaunti o'chirildi: ${row.username}`);
  res.json({ ok: true });
});
app.get('/api/log', auth, adminOnly, (req, res) => {
  const n = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  res.json(q.listLog.all(req.user.ws, n));
});

/* ---------- xodim: faqat o'zining ma'lumotlari ---------- */
function staffMetric(req, mid) {
  const meta = readDoc(req.user.ws, 'app', 'meta');
  if (!meta) return {};
  const emp = (meta.emps || []).find(e => e.id === req.user.emp_id);
  const metric = (meta.metrics || []).find(m => m.id === mid && m.emp === req.user.emp_id);
  return { emp, metric };
}
const staffTaskDocs = req => q.likeDocs.all(req.user.ws, 'tasks', '%\\_' + likeEsc(req.user.emp_id));

app.get('/api/staff-state', auth, staffOnly, (req, res) => {
  const ws = req.user.ws, empId = req.user.emp_id;
  ensureRules(ws);
  const meta = readDoc(ws, 'app', 'meta') || {};
  const emp = (meta.emps || []).find(e => e.id === empId);
  if (!emp) return res.json({ emp: null, metrics: [], vals: {}, tasks: [], today: localToday() });
  const metrics = (meta.metrics || []).filter(m => m.emp === empId);
  const vals = {};
  for (const m of metrics) {
    vals[m.id] = {};
    for (const r of q.likeDocs.all(ws, 'vals', likeEsc(m.id) + '\\_%')) {
      try { Object.assign(vals[m.id], JSON.parse(r.body).d || {}); } catch (e) { /* buzilgan hujjat */ }
    }
  }
  const from = addDays(localToday(), -60), tasks = [];
  for (const r of staffTaskDocs(req)) {
    try { for (const t of JSON.parse(r.body).items || []) if (!t.done || t.due >= from) tasks.push(t); } catch (e) { /* buzilgan hujjat */ }
  }
  res.json({ emp: { id: emp.id, name: emp.name }, metrics, vals, tasks, today: localToday() });
});

/* davr (hafta/oy) chegaralari: xodim jami sonni davr kalitiga yozadi */
function periodRangeOf(kind, key) {
  if (kind === 'week') { const dw = (pd(key).getDay() + 6) % 7, from = addDays(key, -dw); return { from, to: addDays(from, 6) }; }
  const [y, mo] = key.split('-').map(Number);
  return { from: dstr(new Date(y, mo - 1, 1)), to: dstr(new Date(y, mo, 0)) };
}
app.post('/api/staff-val', auth, staffOnly, (req, res) => {
  const { mid, key, value } = req.body || {};
  if (typeof mid !== 'string' || !ID_RE.test(mid) || !validDate(key)) return res.status(400).json({ error: 'Noto\'g\'ri so\'rov' });
  const { emp, metric } = staffMetric(req, mid);
  if (!emp || !metric) return res.status(404).json({ error: 'Ko\'rsatkich topilmadi' });
  const today = localToday();
  if (key > today) return res.status(400).json({ error: 'Kelgusi sana uchun fakt kiritib bo\'lmaydi' });
  if (key < addDays(today, -120)) return res.status(400).json({ error: 'Bu sana juda eski' });
  const lvl = metric.entry || metric.kind;
  const kind = lvl === 'week' || lvl === 'month' ? lvl : 'day';
  if (kind === 'week' && pd(key).getDay() !== 1) return res.status(400).json({ error: 'Noto\'g\'ri davr' });
  if (kind === 'month' && key.slice(8) !== '01') return res.status(400).json({ error: 'Noto\'g\'ri davr' });
  const del = value === null || value === undefined || value === '';
  if (!del && !(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12)) return res.status(400).json({ error: 'Faqat musbat raqam yozing' });
  const docId = mid + '_' + key.slice(0, 4);
  const doc = readDoc(req.user.ws, 'vals', docId) || {};
  const d = doc.d && typeof doc.d === 'object' ? doc.d : {};
  let old;
  if (kind === 'day') old = d[key];
  else {
    const r = periodRangeOf(kind, key);
    for (const k of Object.keys(d)) if (k >= r.from && k <= r.to) { old = (old || 0) + d[k]; if (k !== key) delete d[k]; }
  }
  if (del) delete d[key]; else d[key] = Math.round(value * 1e6) / 1e6;
  if (Object.keys(d).length) writeDoc(req.user.ws, 'vals', docId, { d }); else q.delDoc.run(req.user.ws, 'vals', docId);
  const unit = metric.unit ? ' ' + metric.unit : '';
  logAct(req.user, `${emp.name}: «${metric.name}» ${key}: ${old === undefined ? '—' : old + unit} → ${del ? 'o\'chirildi' : value + unit}`);
  res.json({ ok: true });
});
app.post('/api/staff-task', auth, staffOnly, (req, res) => {
  const { id, done } = req.body || {};
  if (typeof id !== 'string' || typeof done !== 'boolean') return res.status(400).json({ error: 'Noto\'g\'ri so\'rov' });
  for (const r of staffTaskDocs(req)) {
    let doc; try { doc = JSON.parse(r.body); } catch (e) { continue; }
    const t = (doc.items || []).find(x => x.id === id);
    if (!t) continue;
    t.done = done; t.doneAt = done ? localToday() : '';
    writeDoc(req.user.ws, 'tasks', r.id, doc);
    logAct(req.user, `Topshiriq ${done ? 'bajarildi' : 'bajarilmagan deb belgilandi'}: «${t.title}»`);
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'Topshiriq topilmadi' });
});

app.use((req, res) => res.status(404).type('text').send('Topilmadi'));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'juda katta' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'noto\'g\'ri JSON' });
  console.error(err);
  res.status(500).json({ error: 'Server xatosi' });
});

/* ---------- kunlik zaxira nusxa (oxirgi 14 kun) va tozalash ---------- */
function dailyBackup() {
  const dir = path.join(DATA_DIR, 'backups');
  const f = path.join(dir, 'nazorat-' + new Date().toISOString().slice(0, 10) + '.db');
  if (fs.existsSync(f)) return;
  backup(db, f).then(() => {
    const files = fs.readdirSync(dir).filter(n => /^nazorat-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort();
    files.slice(0, Math.max(0, files.length - 14)).forEach(n => fs.unlinkSync(path.join(dir, n)));
  }).catch(e => console.error('Zaxira xatosi:', e.message));
}
const housekeeping = () => { q.purge.run(Date.now()); q.purgeLog.run(Date.now() - 120 * DAY); dailyBackup(); };
setInterval(housekeeping, 3600e3).unref();
housekeeping();

if (require.main === module) {
  app.listen(PORT, () => console.log('Nazorat serveri ishga tushdi: http://localhost:' + PORT));
}
module.exports = app;
