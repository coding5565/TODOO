'use strict';
// Xodimlar nazorati: login/parol bilan himoyalangan server (Express + Node.js ichki SQLite)
const express = require('express');
const { DatabaseSync, backup } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SESSION_DAYS = 30;
const DAY = 86400e3;

fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'nazorat.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pass TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS docs(col TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(col,id));
`);

const q = {
  userCount: db.prepare('SELECT COUNT(*) AS c FROM users'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  addUser: db.prepare('INSERT INTO users(username, pass, created) VALUES(?,?,?)'),
  setPass: db.prepare('UPDATE users SET pass = ? WHERE id = ?'),
  addSession: db.prepare('INSERT INTO sessions(token, user_id, expires) VALUES(?,?,?)'),
  getSession: db.prepare('SELECT s.token, s.expires, u.id AS uid, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?'),
  touchSession: db.prepare('UPDATE sessions SET expires = ? WHERE token = ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?'),
  purge: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
  getDoc: db.prepare('SELECT body FROM docs WHERE col = ? AND id = ?'),
  putDoc: db.prepare('INSERT INTO docs(col,id,body,updated) VALUES(?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET body = excluded.body, updated = excluded.updated'),
  delDoc: db.prepare('DELETE FROM docs WHERE col = ? AND id = ?'),
  listDocs: db.prepare('SELECT id, body FROM docs WHERE col = ? ORDER BY id LIMIT 5000'),
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
  return sha(token);
}
function sessionOf(req) {
  const t = parseCookies(req).sid;
  if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
  const s = q.getSession.get(sha(t), Date.now());
  if (!s) return null;
  if (s.expires - Date.now() < (SESSION_DAYS - 1) * DAY) q.touchSession.run(Date.now() + SESSION_DAYS * DAY, s.token);
  return s;
}

/* ---------- login urinishlarini cheklash ---------- */
const fails = new Map();
function locked(ip) {
  const f = fails.get(ip);
  return f && f.until > Date.now();
}
function failed(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until && f.until <= Date.now()) { f.n = 0; f.until = 0; }
  f.n++;
  if (f.n >= 8) f.until = Date.now() + 15 * 60e3;
  fails.set(ip, f);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of fails) if (v.until < now && v.n < 8) fails.delete(k); }, 3600e3).unref();

/* ---------- birinchi sozlash kodi ---------- */
let setupCode = null;
if (q.userCount.get().c === 0) {
  setupCode = process.env.SETUP_CODE || crypto.randomBytes(4).toString('hex');
  console.log('\n==============================================');
  console.log(' Hali akkaunt yo\'q. Birinchi akkaunt ochish uchun');
  console.log(' brauzerda saytni oching va shu kodni kiriting:');
  console.log('\n     SOZLASH KODI: ' + setupCode + '\n');
  console.log('==============================================\n');
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
const page = name => (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'public', name)); };

app.get('/', (req, res, next) => (sessionOf(req) ? page('app.html')(req, res) : res.redirect('/login')));
app.get('/login', (req, res) => (sessionOf(req) ? res.redirect('/') : page('login.html')(req, res)));
app.get('/vendor/jszip.min.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules', 'jszip', 'dist', 'jszip.min.js')));
app.get('/healthz', (req, res) => res.type('text').send('ok'));

app.get('/api/status', (req, res) => res.json({ hasUsers: q.userCount.get().c > 0, loggedIn: !!sessionOf(req) }));

const NAME_RE = /^[A-Za-z0-9_.@-]{3,40}$/;
app.post('/api/setup', async (req, res) => {
  try {
    if (q.userCount.get().c > 0 || !setupCode) return res.status(409).json({ error: 'Akkaunt allaqachon ochilgan' });
    if (locked(req.ip)) return res.status(429).json({ error: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urining' });
    const { code, username, password } = req.body || {};
    const a = Buffer.from(String(code || '')), b = Buffer.from(setupCode);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { failed(req.ip); return res.status(403).json({ error: 'Sozlash kodi noto\'g\'ri' }); }
    if (!NAME_RE.test(String(username || ''))) return res.status(400).json({ error: 'Login 3-40 belgi: harf, raqam, nuqta, pastki chiziq' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Parol kamida 8 belgi bo\'lsin' });
    const r = q.addUser.run(username, await hashPw(password), Date.now());
    setupCode = null;
    newSession(req, res, r.lastInsertRowid);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server xatosi' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    if (locked(req.ip)) return res.status(429).json({ error: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urining' });
    const { username, password } = req.body || {};
    const u = typeof username === 'string' ? q.userByName.get(username) : null;
    const ok = await checkPw(typeof password === 'string' ? password.slice(0, 200) : '', u ? u.pass : DUMMY || 's1$00$00');
    if (!u || !ok) { failed(req.ip); return res.status(401).json({ error: 'Login yoki parol noto\'g\'ri' }); }
    fails.delete(req.ip);
    newSession(req, res, u.id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server xatosi' }); }
});

app.post('/api/logout', (req, res) => {
  const t = parseCookies(req).sid;
  if (t) q.delSession.run(sha(t));
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json({ username: req.user.username }));

app.post('/api/password', auth, async (req, res) => {
  try {
    if (locked(req.ip)) return res.status(429).json({ error: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urining' });
    const { old, next } = req.body || {};
    const u = q.userById.get(req.user.uid);
    if (typeof old !== 'string' || !(await checkPw(old.slice(0, 200), u.pass))) { failed(req.ip); return res.status(403).json({ error: 'Hozirgi parol noto\'g\'ri' }); }
    if (typeof next !== 'string' || next.length < 8 || next.length > 200) return res.status(400).json({ error: 'Yangi parol kamida 8 belgi bo\'lsin' });
    q.setPass.run(await hashPw(next), u.id);
    q.delUserSessions.run(u.id, req.user.token); // boshqa qurilmalardan chiqarib yuboradi
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server xatosi' }); }
});

/* ---------- ma'lumotlar (hujjatlar) ---------- */
const COLS = new Set(['app', 'tasks', 'vals']);
const ID_RE = /^[A-Za-z0-9_.:@+~-]{1,200}$/;
const MAX_DOC = 256 * 1024;
const okPath = (req, res, next) => {
  if (!COLS.has(req.params.col) || (req.params.id !== undefined && !ID_RE.test(req.params.id))) return res.status(400).json({ error: 'bad path' });
  next();
};
app.get('/api/doc/:col/:id', auth, okPath, (req, res) => {
  const r = q.getDoc.get(req.params.col, req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.type('json').send(r.body);
});
app.put('/api/doc/:col/:id', auth, okPath, (req, res) => {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ error: 'object kerak' });
  const s = JSON.stringify(b);
  if (Buffer.byteLength(s) > MAX_DOC) return res.status(413).json({ error: 'hujjat juda katta' });
  q.putDoc.run(req.params.col, req.params.id, s, Date.now());
  res.status(204).end();
});
app.delete('/api/doc/:col/:id', auth, okPath, (req, res) => {
  q.delDoc.run(req.params.col, req.params.id);
  res.status(204).end();
});
app.get('/api/col/:col', auth, okPath, (req, res) => {
  const rows = q.listDocs.all(req.params.col);
  res.type('json').send('[' + rows.map(r => '{"id":' + JSON.stringify(r.id) + ',"body":' + r.body + '}').join(',') + ']');
});

app.use((req, res) => res.status(404).type('text').send('Topilmadi'));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'juda katta' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'noto\'g\'ri JSON' });
  console.error(err);
  res.status(500).json({ error: 'Server xatosi' });
});

/* ---------- kunlik zaxira nusxa (oxirgi 14 kun) ---------- */
function dailyBackup() {
  const dir = path.join(DATA_DIR, 'backups');
  const f = path.join(dir, 'nazorat-' + new Date().toISOString().slice(0, 10) + '.db');
  if (fs.existsSync(f)) return;
  backup(db, f).then(() => {
    const files = fs.readdirSync(dir).filter(n => /^nazorat-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort();
    files.slice(0, Math.max(0, files.length - 14)).forEach(n => fs.unlinkSync(path.join(dir, n)));
  }).catch(e => console.error('Zaxira xatosi:', e.message));
}
setInterval(() => { q.purge.run(Date.now()); dailyBackup(); }, 3600e3).unref();
q.purge.run(Date.now());
dailyBackup();

if (require.main === module) {
  app.listen(PORT, () => console.log('Nazorat serveri ishga tushdi: http://localhost:' + PORT));
}
module.exports = app;
