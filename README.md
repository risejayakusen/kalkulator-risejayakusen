# RISE JAYA KUSEN — Kalkulator & Nota (Node.js + Vercel + Upstash Redis)

Tampilan & fitur sama persis dengan versi lama, tapi semua data (harga,
riwayat nota, nota yang sedang dikerjakan, nomor urut nota, password)
sekarang disimpan di database **Upstash Redis** — bukan lagi
`localStorage` browser, dan bukan file lokal di server (karena Vercel
tidak punya disk permanen).

## Struktur proyek

```
app.js            -> inti Express app (semua route /api/*, baca/tulis Redis)
server.js         -> menjalankan app.js secara LOKAL (npm start)
api/index.js       -> entry point untuk Vercel (serverless function)
vercel.json         -> aturan routing di Vercel (/api/* -> function, sisanya -> file statis)
public/
  index.html         -> tampilan (tidak berubah dari versi lama)
  style.css           -> tampilan (tidak berubah dari versi lama)
  script.js            -> logika kalkulator & nota, bicara ke server lewat fetch('/api/...')
package.json
.env.example         -> contoh isi file .env untuk development lokal
```

---

## BAGIAN 1 — Siapkan database Upstash Redis dulu

Paling gampang lewat Vercel langsung (jadi sekalian tersambung nanti):

1. Push dulu kode ini ke GitHub (lihat Bagian 2), atau siapkan repo-nya.
2. Nanti setelah project di-import ke Vercel (Bagian 2), buka
   **project → Storage tab → Marketplace Database Storage → cari
   "Upstash" → pilih Redis → Create**.
3. Vercel otomatis membuatkan database Upstash dan **otomatis menambahkan
   environment variable** `KV_REST_API_URL` / `KV_REST_API_TOKEN` (atau
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, tergantung versi
   integrasi) ke project kamu — tidak perlu diketik manual.
4. Kode di `app.js` sudah otomatis mendeteksi kedua kemungkinan nama
   variabel itu lewat `Redis.fromEnv()`, jadi tidak perlu ubah apa-apa.

*(Alternatif: bikin database dulu langsung di upstash.com, lalu salin
"REST URL" & "REST TOKEN" manual ke Environment Variables di Vercel.)*

---

## BAGIAN 2 — Push ke GitHub

Dari folder proyek ini (setelah di-extract dari zip):

```bash
git init
git add .
git commit -m "Rise Jaya Kusen - versi Node.js"
```

Buat repo baru di GitHub (github.com → New repository), lalu:

```bash
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git branch -M main
git push -u origin main
```

> `.env` dan `node_modules/` sudah otomatis diabaikan lewat `.gitignore`
> — jangan pernah commit file `.env` (isinya kredensial rahasia).

---

## BAGIAN 3 — Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → login (bisa pakai akun GitHub).
2. **Add New → Project** → pilih repo GitHub yang barusan dibuat → **Import**.
3. Framework Preset: biarkan **"Other"** (jangan pilih Next.js dll) —
   `vercel.json` di proyek ini sudah mengatur semuanya secara manual.
4. Klik **Deploy**. Deployment pertama ini akan gagal/berjalan tanpa data
   kalau database Redis belum disambungkan — tidak apa, lanjut ke langkah 5.
5. Sambungkan database Redis (ikuti **Bagian 1** di atas kalau belum).
6. Setelah database tersambung (environment variable otomatis muncul di
   **Settings → Environment Variables**), buka tab **Deployments** →
   klik titik tiga (⋯) pada deployment terakhir → **Redeploy**, supaya
   environment variable yang baru ditambahkan ikut terbaca.
7. Selesai — buka domain yang diberikan Vercel (misalnya
   `nama-project.vercel.app`). Login pakai password default **admin123**,
   lalu segera ganti lewat tombol "🔑 Ganti Password" di sidebar.

Setiap kali kamu `git push` ke branch `main`, Vercel otomatis build &
deploy ulang.

---

## Menjalankan di komputer sendiri (opsional, untuk development)

```bash
npm install
cp .env.example .env
# lalu isi .env dengan REST URL & TOKEN dari database Upstash yang sama
npm start
```

Buka `http://localhost:3000`.

---

## Fitur baru: Produk Tambahan (Kelola Tabel & Kelola Produk)

Di tab **Pengaturan Harga**, di bagian bawah (setelah tabel Perlengkapan), ada
seksi **"📦 Produk Tambahan"**:

- **Kelola Tabel**: klik "➕ Tambah Tabel Baru" untuk membuat kategori produk
  baru sendiri — beri judul, lalu pilih:
  - **3 Kolom** (Nama, Harga/Meter, Harga Standar) — cocok untuk produk yang
    perlu dihitung per ukuran custom (kayu keliling), sama seperti Kusen/Loster.
  - **2 Kolom** (Nama, Harga) — untuk produk dengan harga tetap, tinggal pilih
    & isi qty (seperti Perlengkapan).
  - Tabel bisa diganti judul (✏️) atau dihapus (🗑) kapan saja.
- **Kelola Produk**: di dalam setiap tabel, klik "➕ Tambah Produk" untuk
  menambah varian/produk baru, isi harganya langsung di kolom tabel, atau
  hapus (🗑) baris yang tidak dipakai.

Begitu sebuah tabel punya minimal 1 produk, **otomatis muncul blok
kalkulatornya sendiri** di tab "Kalkulator Produk" (di bagian paling bawah,
setelah Perlengkapan Jendela) — lengkap dengan pilihan ukuran custom (untuk
tabel 3 kolom) atau pilih-langsung (untuk tabel 2 kolom), dan otomatis bisa
ditambahkan ke Nota, muncul di Riwayat, Cetak, dan pesan WhatsApp — persis
seperti 9 kategori produk bawaan.

Menghapus sebuah tabel produk tambahan tidak mengubah nota yang sudah
tersimpan di Riwayat Nota sebelumnya.

## Catatan

- **Backup data**: karena semua data ada di database Upstash, cukup
  gunakan fitur backup/export bawaan dashboard Upstash secara berkala.
- **Nomor nota** dibuat dengan `INCR` di Redis (atomic), jadi tetap urut
  & tidak bentrok walau ada 2 nota ditambahkan hampir bersamaan.
- **Sesi login** disimpan sebagai key terpisah dengan masa berlaku 7 hari
  — cukup untuk kebutuhan 1 admin/toko, bukan sistem multi-user dengan role.
- Free tier Upstash Redis cukup luas untuk skala 1 toko (jumlah nota per
  hari yang wajar) — kalau suatu saat kena limit, tinggal upgrade plan
  di dashboard Upstash, tidak perlu ubah kode.
