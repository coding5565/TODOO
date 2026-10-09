# Xodimlar nazorati: server versiyasi

Login va parol bilan kiriladi. Ma'lumotlar serverda (SQLite) saqlanadi, server har kuni o'zi zaxira nusxa oladi.

## 1. O'rnatish (Ubuntu VPS)

Docker o'rnatilmagan bo'lsa:

    curl -fsSL https://get.docker.com | sh

Papkani serverga yuklang (kompyuteringizdan):

    scp nazorat-server.zip user@SERVER_IP:~

Serverda:

    unzip nazorat-server.zip -d nazorat && cd nazorat
    docker compose up -d --build

## 2. Birinchi akkaunt (siz uchun)

Server birinchi marta ishga tushganda "sozlash kodi" chiqaradi:

    docker compose logs nazorat

Logdan `SOZLASH KODI: ...` ni toping. Brauzerda `http://SERVER_IP:3000` ni oching,
kodni kiriting, o'zingizga login va parol (kamida 8 belgi) tanlang. Shu bilan akkaunt ochiladi.
Keyingi safar faqat login va parol bilan kirasiz. Sozlash kodi akkaunt ochilgach ishlamaydi.

## 3. HTTPS (juda tavsiya etiladi)

HTTPS bo'lmasa parol internetda ochiq yuriladi. Domeningizni (masalan `nazorat.sizningdomen.uz`)
server IP manziliga yo'naltiring (A yozuv), keyin:

    sudo apt install -y caddy
    sudo tee /etc/caddy/Caddyfile <<'CADDY'
    nazorat.sizningdomen.uz {
        reverse_proxy 127.0.0.1:3000
    }
    CADDY
    sudo systemctl reload caddy

Caddy sertifikatni o'zi oladi. Keyin ilovani faqat Caddy orqali ochiq qiling:

1. `.env` fayl yarating: `TRUST_PROXY=1`
2. `docker-compose.yml` da `"3000:3000"` ni `"127.0.0.1:3000:3000"` ga o'zgartiring
3. `docker compose up -d`

Saytga `https://nazorat.sizningdomen.uz` orqali kirasiz. Serverda 80 va 443 portlar ochiq bo'lsin.

## 4. Zaxira va tiklash

- Server har kuni `/data/backups` papkasiga nusxa oladi (oxirgi 14 kun).
- Nusxalarni serverdan olish: `docker compose cp nazorat:/data/backups ./backups`
- Tiklash: `docker compose stop`, kerakli `nazorat-YYYY-MM-DD.db` faylni
  `nazorat.db` nomi bilan `/data` ga qo'ying (`docker compose cp ... nazorat:/data/nazorat.db`), keyin `docker compose start`.
- Dastur ichida ham: "Zaxira" bo'limidan JSON fayl saqlab, shu yerdan qayta yuklash mumkin.
- Muhim: zaxiralarni boshqa joyga ham ko'chirib turing (server buzilsa, ular ham yo'qolmasin).

## 5. Parolni unutsangiz

    docker compose exec nazorat node reset-password.js LOGIN YANGI_PAROL

## 6. Yangilash

Yangi fayllarni yuklab, `docker compose up -d --build` ni qayta ishga tushiring. Ma'lumotlar saqlanib qoladi.

## 7. Eski (artifact) versiyadagi ma'lumotlarni ko'chirish

Eski sahifada "Zaxira" > "Fayl sifatida saqlash", yangi saytda "Zaxira" > faylni tanlab "Tiklash".

## Docker'siz ishga tushirish (ixtiyoriy)

Node.js 24+ kerak:

    npm ci --omit=dev
    node server.js

Muhit o'zgaruvchilari: `PORT` (3000), `DATA_DIR` (./data), `TRUST_PROXY=1` (Caddy/Nginx orqasida), `SETUP_CODE` (o'zingiz tanlagan sozlash kodi).

## Xavfsizlik haqida

- Parollar scrypt bilan xeshlanadi, sessiya cookie `HttpOnly` va `SameSite=Strict`.
- Ketma-ket 8 ta noto'g'ri urinishdan keyin 15 daqiqaga bloklanadi.
- Hozir bitta akkaunt rejimi: ochilgan akkaunt hamma ma'lumotni ko'radi.
