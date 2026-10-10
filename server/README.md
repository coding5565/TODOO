# Xodimlar nazorati: server

Login/parol bilan himoyalangan server. Ma'lumotlar SQLite'da, server har kuni o'zi zaxira nusxa oladi.

## 1. O'rnatish (Ubuntu VPS)

Docker o'rnatilmagan bo'lsa:

    curl -fsSL https://get.docker.com | sh

Papkani serverga yuklab, serverda:

    cd nazorat
    docker compose up -d --build

## 2. Birinchi super admin akkaunti

Server maxfiy kodni logga yozadi:

    docker compose logs nazorat

`Super admin akkaunt ochish kodi: ...` qatorini toping. Brauzerda `http://SERVER_IP:3000` ni oching,
"Super admin sifatida ro'yxatdan o'tish" ni bosing, kodni kiriting, login va parol (kamida 8 belgi) tanlang.

- Eng ko'pi bilan `MAX_ADMINS` (odatda 3) ta super admin bo'ladi. Qo'shimcha adminlar ham shu kod bilan ro'yxatdan o'tadi.
- Har bir super admin faqat o'z xodimlari va ma'lumotlarini ko'radi.
- Kodni o'zingiz belgilash uchun `.env` fayliga `ADMIN_CODE=meningkodim` yozing, keyin `docker compose up -d`.
- Hamma admin ochilgach, kodni kimgadir bermang: u yangi admin ochish uchun kerak bo'ladi.

## 3. Xodim akkauntlari

Super admin "Xodimlar" bo'limida xodim qo'shganda unga login va parol beradi (yoki keyin "Akkaunt ochish"). Xodim shu login bilan kirib
faqat o'z rejasini ko'radi va faktni kiritadi. Parolni xodim o'zi o'zgartira oladi, super admin ham yangisini qo'yib berishi mumkin.
Xodim nima kiritgani "Menyu > Faollik tarixi" da ko'rinadi.

## 4. HTTPS (juda tavsiya etiladi)

HTTPS bo'lmasa parol internetda ochiq yuradi. Domeningizni (masalan `nazorat.sizningdomen.uz`) server IP manziliga yo'naltiring, keyin:

    sudo apt install -y caddy
    sudo tee /etc/caddy/Caddyfile <<'CADDY'
    nazorat.sizningdomen.uz {
        reverse_proxy 127.0.0.1:3000
    }
    CADDY
    sudo systemctl reload caddy

Keyin ilovani faqat Caddy orqali ochiq qiling: `.env` ga `TRUST_PROXY=1`, `docker-compose.yml` da `"3000:3000"` ni `"127.0.0.1:3000:3000"` ga o'zgartirib `docker compose up -d`.
Agar serverda nginx bo'lsa, `proxy_pass http://127.0.0.1:3000;` bilan shu kabi ulanadi.

## 5. Zaxira va tiklash

- Server har kuni `/data/backups` papkasiga nusxa oladi (oxirgi 14 kun).
- Olish: `docker compose cp nazorat:/data/backups ./backups`
- Tiklash: `docker compose stop`, kerakli `nazorat-YYYY-MM-DD.db` ni `/data/nazorat.db` ga qo'ying, `docker compose start`.
- Boshqa joyga ham nusxa ko'chirib turing.

## 6. Parolni unutsangiz

    docker compose exec nazorat node reset-password.js LOGIN YANGI_PAROL

(super admin yoki xodim, ikkalasi uchun ishlaydi)

## 7. Yangilash

Yangi fayllarni yuklab `docker compose up -d --build`. Eski baza avtomatik yangi tuzilishga ko'chadi, ma'lumot yo'qolmaydi
(eski yagona akkaunt birinchi super admin bo'lib qoladi).

## Docker'siz

Node.js 24+: `npm ci --omit=dev` va `node server.js`.
Sozlamalar: `PORT` (3000), `DATA_DIR` (./data), `TRUST_PROXY=1`, `ADMIN_CODE`, `MAX_ADMINS` (3), `TZ` (vaqt mintaqasi, masalan `Asia/Tashkent`).

## Xavfsizlik

- Parollar scrypt bilan xeshlanadi, sessiya cookie `HttpOnly` va `SameSite=Strict`.
- Ketma-ket 8 ta noto'g'ri urinishdan keyin 15 daqiqaga bloklanadi.
- Xodim faqat o'z ma'lumotini ko'radi va o'zgartiradi, serverning o'zi buni tekshiradi (boshqa xodim yoki admin API'lariga kira olmaydi).
- Har super admin ma'lumotlari boshqa adminlardan to'liq ajratilgan.
