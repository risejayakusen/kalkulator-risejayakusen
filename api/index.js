/* Entry point untuk Vercel: setiap file di folder /api otomatis jadi
   1 serverless function. Semua request /api/* diarahkan ke sini lewat
   rewrite di vercel.json, lalu ditangani oleh Express app yang sama
   dengan yang dipakai untuk development lokal (lihat ../app.js). */
module.exports = require('../app');
