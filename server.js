/* Menjalankan aplikasi secara LOKAL (npm start).
   Di Vercel, entry point yang dipakai adalah api/index.js — file ini
   tidak dipakai di Vercel karena di sana tidak ada proses long-running. */
const path = require('path');
const express = require('express');
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`RISE JAYA KUSEN jalan di http://localhost:${PORT}`);
});
