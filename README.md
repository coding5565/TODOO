# Xodimlar nazorati

Xodimlarga kunlik, haftalik va oylik topshiriq hamda kunlik ko'rsatkich (pul, visit, yangi to'lovchi va h.k.) berib, bajarilishini nazorat qilish dasturi.

## Nima qiladi

- **Kunlik ko'rsatkich va me'yor.** Masalan kuniga 5 visit yoki 7 mln tushum. Fakt yozilib "Tasdiqlash" bosiladi.
  Kam bo'lsa yetmagan qism ertangi rejaga qo'shiladi (7 mln reja, 6 mln fakt: ertaga 8 mln). Ortiqcha qismi qolaveradi, keyingi kunni kamaytirmaydi.
- **Rejadan nechta ortda qolgani.** Oy boshidan jami me'yor bilan jami fakt farqi, "Bugungi nazorat"da eng ortdagilar tepada.
- **Topshiriqlar (bajardi / bajarmadi).** Takrorlanuvchi (har kuni, har hafta, har oy) topshiriqlar bilan.
- **Word (.docx) hisobot.** Istalgan davr uchun: umumiy natija, diqqat talab qiladiganlar, har xodim alohida sahifada.
- **Login va parol.** Server versiyasi birinchi kirishda akkaunt ochadi (sozlash kodi bilan), ma'lumotlar SQLite'da, har kuni zaxira nusxa.
- Telefonda ham qulay (pastki menyu, ixcham kartochkalar), yorug' va qorong'i rejim.

## Tuzilma

| Yo'l | Nima |
| --- | --- |
| `nazorat.html` | Dasturning bitta faylli varianti. Asosiy manba, hisob-kitob va Word hisobot kodi shu yerda. |
| `server/` | Login/parolli server (Node.js + Express + Node.js ichki SQLite), Docker fayllari, o'rnatish yo'riqnomasi: [server/README.md](server/README.md) |
| `server/public/app.html` | Server uchun yig'ilgan nusxa. `nazorat.html` dan avtomatik yasaladi. |
| `tools/build_server_app.py` | `nazorat.html` dan `server/public/app.html` ni yasaydi. |

`nazorat.html` ni o'zgartirgach: `python tools/build_server_app.py`

## Tez ishga tushirish (kompyuterda)

Node.js 24+ kerak.

    cd server
    npm ci --omit=dev
    node server.js

Terminalda "SOZLASH KODI" chiqadi. `http://localhost:3000` ni oching, kodni kiriting va o'zingizga login/parol tanlang.

Serverga o'rnatish (Docker, HTTPS, zaxira): [server/README.md](server/README.md)
