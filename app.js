/* ==========================================================================
   RISE JAYA KUSEN — Express app (dipakai bareng oleh server lokal & Vercel)
   ==========================================================================
   Penyimpanan data sekarang pakai Upstash Redis (lewat REST API, cocok untuk
   serverless/Vercel — tidak butuh koneksi TCP persisten seperti Redis biasa).

   - Satu key "rjk:db" menyimpan blob JSON: {passwordHash, prices, history, draft, activeTab}
   - Nomor nota pakai key terpisah "rjk:counter" dengan INCR (atomic),
     supaya tidak ada 2 nota kebagian nomor sama walau diklik hampir bersamaan.
   - Sesi login disimpan sebagai key "session:<token>" dengan TTL 7 hari,
     token dikirim ke browser lewat cookie httpOnly biasa (tanpa express-session,
     supaya tidak bergantung pada memori server yang di serverless bisa hilang
     kapan saja).

   PENTING: Express 4 TIDAK otomatis menangkap error dari async handler —
   kalau ada yang gagal (misalnya kredensial Redis belum ada/salah) dan tidak
   ditangani, request akan menggantung tanpa balasan sama sekali ke browser.
   Karena itu SEMUA route async di sini dibungkus asyncHandler() supaya
   error apa pun selalu berakhir jadi balasan JSON yang jelas, bukan macet.
   ========================================================================== */

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const DEFAULT_ADMIN_PASSWORD = 'admin123';
const SALT = 'rjk_salt_2026::';
const DB_KEY = 'rjk:db';
const COUNTER_KEY = 'rjk:counter';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari

/* Inisialisasi Redis dibungkus try/catch: kalau environment variable belum
   ada sama sekali (database belum disambungkan di Vercel), ini tidak boleh
   menjatuhkan seluruh aplikasi — cukup ditandai, lalu setiap route yang
   butuh Redis akan membalas error yang jelas ("Database belum terhubung"). */
let redis = null;
let redisInitError = null;
try {
    redis = Redis.fromEnv(); // otomatis baca UPSTASH_REDIS_REST_URL/TOKEN atau KV_REST_API_URL/TOKEN
} catch (e) {
    redisInitError = e;
    console.error('[RJK] Gagal inisialisasi Redis:', e.message);
}

function hashPassword(pw) {
    return crypto.createHash('sha256').update(SALT + String(pw)).digest('hex');
}

function defaultDb() {
    return {
        passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
        prices: null,   // null = frontend pakai DEFAULT_PRICES bawaan
        history: [],
        draft: null,
        activeTab: 'pelanggan'
    };
}

function ensureRedis() {
    if (!redis) {
        const err = new Error(
            'Database Redis belum terhubung. Di Vercel: buka project -> Storage -> ' +
            'Marketplace -> sambungkan Upstash Redis, lalu Redeploy. ' +
            (redisInitError ? ('(Detail: ' + redisInitError.message + ')') : '')
        );
        err.isConfigError = true;
        throw err;
    }
}

async function readDb() {
    ensureRedis();
    const data = await redis.get(DB_KEY); // @upstash/redis otomatis (de)serialize JSON
    if (!data) {
        const fresh = defaultDb();
        await redis.set(DB_KEY, fresh);
        return fresh;
    }
    return Object.assign(defaultDb(), data);
}
async function writeDb(db) {
    ensureRedis();
    await redis.set(DB_KEY, db);
}

/* Bungkus setiap async route handler dengan ini supaya reject/exception apa
   pun otomatis diteruskan ke middleware error di bawah (bukan menggantung). */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/* ---------------- COOKIE HELPERS (tanpa dependency tambahan) ---------------- */
function parseCookies(req) {
    const header = req.headers.cookie;
    const out = {};
    if (!header) return out;
    header.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx < 0) return;
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    });
    return out;
}
function setSessionCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `rjk_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${secure}`);
}
function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', 'rjk_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

const requireAuth = asyncHandler(async (req, res, next) => {
    ensureRedis();
    const token = parseCookies(req).rjk_session;
    if (!token) return res.status(401).json({ ok: false, error: 'Belum login' });
    const valid = await redis.get('session:' + token);
    if (!valid) return res.status(401).json({ ok: false, error: 'Sesi berakhir, silakan login lagi' });
    next();
});

const app = express();
app.use(express.json({ limit: '5mb' })); // riwayat nota bisa lumayan besar

/* Endpoint kecil untuk cek cepat status server & koneksi database —
   buka langsung di browser: https://domain-kamu.vercel.app/api/health */
app.get('/api/health', (req, res) => {
    res.json({
        ok: !redisInitError,
        redisConnected: !!redis,
        error: redisInitError ? redisInitError.message : null
    });
});

/* ---------------------------- AUTH ROUTES ---------------------------- */

app.get('/api/session', asyncHandler(async (req, res) => {
    ensureRedis();
    const token = parseCookies(req).rjk_session;
    if (!token) return res.json({ authenticated: false });
    const valid = await redis.get('session:' + token);
    res.json({ authenticated: !!valid });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
    const { password } = req.body || {};
    const db = await readDb();
    if (typeof password === 'string' && hashPassword(password) === db.passwordHash) {
        const token = crypto.randomBytes(24).toString('hex');
        await redis.set('session:' + token, '1', { ex: SESSION_TTL_SECONDS });
        setSessionCookie(res, token);
        return res.json({ ok: true });
    }
    return res.status(401).json({ ok: false, error: 'Password salah. Coba lagi.' });
}));

app.post('/api/logout', asyncHandler(async (req, res) => {
    ensureRedis();
    const token = parseCookies(req).rjk_session;
    if (token) await redis.del('session:' + token);
    clearSessionCookie(res);
    res.json({ ok: true });
}));

app.post('/api/change-password', requireAuth, asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    const db = await readDb();
    if (hashPassword(oldPassword || '') !== db.passwordHash) {
        return res.status(400).json({ ok: false, error: 'Password lama salah.' });
    }
    if (!newPassword || String(newPassword).length < 4) {
        return res.status(400).json({ ok: false, error: 'Password baru minimal 4 karakter.' });
    }
    db.passwordHash = hashPassword(newPassword);
    await writeDb(db);
    res.json({ ok: true });
}));

/* ---------------------------- DATA ROUTES ----------------------------- */

app.get('/api/data', requireAuth, asyncHandler(async (req, res) => {
    const db = await readDb();
    const counter = (await redis.get(COUNTER_KEY)) || 0;
    res.json({
        prices: db.prices,
        history: db.history || [],
        draft: db.draft,
        activeTab: db.activeTab || 'pelanggan',
        counter
    });
}));

app.put('/api/data', requireAuth, asyncHandler(async (req, res) => {
    const db = await readDb();
    const body = req.body || {};
    if ('prices' in body) db.prices = body.prices;
    if ('history' in body) db.history = Array.isArray(body.history) ? body.history : [];
    if ('draft' in body) db.draft = body.draft;
    if ('activeTab' in body) db.activeTab = body.activeTab;
    await writeDb(db);
    res.json({ ok: true });
}));

app.post('/api/next-invoice-number', requireAuth, asyncHandler(async (req, res) => {
    ensureRedis();
    const counter = await redis.incr(COUNTER_KEY); // atomic di Redis, aman walau diklik bersamaan
    const now = new Date();
    const ymd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    res.json({ number: 'RJK-' + ymd + '-' + String(counter).padStart(4, '0'), counter });
}));

/* ---------------------------- ERROR HANDLER ---------------------------- */
/* Jaring pengaman terakhir: apa pun yang gagal di route manapun di atas akan
   selalu berakhir sebagai balasan JSON yang jelas ke browser — tidak pernah
   menggantung tanpa respons. */
app.use((err, req, res, next) => {
    console.error('[RJK] Error:', err);
    res.status(err.isConfigError ? 503 : 500).json({
        ok: false,
        error: err.isConfigError
            ? err.message
            : 'Terjadi kesalahan di server. Cek log deployment di Vercel untuk detail.'
    });
});

module.exports = app;
