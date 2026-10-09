'use strict';
// Parolni unutgan bo'lsangiz serverda ishga tushiring:
//   docker compose exec nazorat node reset-password.js <login> <yangi parol>
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');

const [, , username, password] = process.argv;
if (!username || !password || password.length < 8) {
  console.log('Ishlatish: node reset-password.js <login> <yangi parol (kamida 8 belgi)>');
  process.exit(1);
}
const db = new DatabaseSync(path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'nazorat.db'));
const u = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (!u) {
  console.log("Bunday login yo'q.");
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const h = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
db.prepare('UPDATE users SET pass = ? WHERE id = ?').run('s1$' + salt.toString('hex') + '$' + h.toString('hex'), u.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
console.log("Parol o'zgartirildi. Eski sessiyalar tugatildi.");
