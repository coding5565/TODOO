# Xodimlar nazorati

Xodimlarga kunlik, haftalik va oylik reja yoki limit berib, bajarilishini nazorat qilish dasturi. Super admin hammasini boshqaradi, xodimlar o'z hisobotini o'zlari kiritadi.

## Imkoniyatlar

- **Reja va limit.** Reja: kamida shuncha qilish kerak, yetmagan qism ertangi rejaga qo'shiladi, ortiqchasi qolaveradi
  (7 mln reja + 12 mln qarz = bugun 19 mln). Limit: shundan oshmasligi kerak (masalan leadlar), oshgan qismi ertangi limitdan ayriladi.
- **Bir marta kiritiladi, qolgani o'zi hisoblanadi.** Reja kuniga, haftasiga yoki oyiga yoziladi, ish kunlari belgilanadi.
  Qolgan ikkita muddat o'zi chiqadi (oyiga 32 va Du–Sha ish kuni bo'lsa, kuniga ≈ 1,19 va haftasiga ≈ 7,11). Bajarildi va qoldi ham o'zi ko'rinadi.
- **Fakt qachon kiritiladi: tanlanadi.** Har kuni, hafta oxirida yoki oy oxirida. Kunlik kiritilganlarning haftalik va oylik natijasi o'zi yig'iladi.
  Oylik/haftalik reja kunlik kiritilsa, yetmagan qism davrning qolgan kunlariga teng taqsimlanadi.
- **Rollar.** Bir nechta super admin (maxfiy kod bilan, odatda 3 tagacha), har biri faqat o'z xodimlarini ko'radi.
  Super admin xodimga login/parol beradi; xodim kirib faqat o'z rejasini va topshiriqlarini ko'radi va faktni kiritadi, parolini o'zgartira oladi.
- **Faollik tarixi.** Xodim nima kiritgani va qachon, super admin shu yerda ko'radi.
- **Topshiriqlar** (bajardi / bajarmadi), takrorlanuvchilari bilan.
- **Word (.docx) hisobot.** Istalgan davr uchun: umumiy natija, diqqat talab qiladiganlar, har xodim alohida sahifada.
- Telefonda qulay, yorug' va qorong'i rejim.

## Tuzilma

| Yo'l | Nima |
| --- | --- |
| `server/server.js` | Server: Express + Node.js ichki SQLite, login, rollar, xodim API'lari |
| `server/public/assets/core.js` | Hisob-kitob (reja, limit, taqsimlash) va Word hisobot yig'ish |
| `server/public/assets/app.js`, `app.css` | Interfeys |
| `server/public/app.html`, `login.html` | Sahifalar |
| `server/Dockerfile`, `docker-compose.yml` | Serverga o'rnatish |

O'rnatish, HTTPS, zaxira va yangilash: [server/README.md](server/README.md)

## Kompyuterda ishga tushirish

Node.js 24+ kerak.

    cd server
    npm ci --omit=dev
    node server.js

Terminalda super admin ochish kodi chiqadi. `http://localhost:3000` ni oching, "Super admin sifatida ro'yxatdan o'tish" ni bosing,
kodni kiriting va o'zingizga login/parol tanlang.
