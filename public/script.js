/* ==========================================================================
   RISE JAYA KUSEN — Frontend
   ==========================================================================
   Versi Node.js: semua penyimpanan (login, harga, riwayat nota, draft nota
   aktif, nomor urut nota) sekarang lewat API server (/api/*), disimpan di
   file data/db.json di server — bukan lagi localStorage/sessionStorage di
   browser. Logika kalkulator & tampilan nota TIDAK berubah dari versi lama.
   ========================================================================== */

/* ---------------- HELPER PANGGIL API ---------------- */
async function apiRequest(method, url, body) {
    const opts = { method, credentials: 'include' };
    if (body !== undefined) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
    }
    let res, data = null;
    try {
        res = await fetch(url, opts);
        try { data = await res.json(); } catch (e) { /* respons kosong, tidak apa */ }
        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        // Server tidak terjangkau (mati / offline)
        return { ok: false, status: 0, data: null, networkError: true };
    }
}

/* Cache data aplikasi yang diambil dari server sekali saat boot, lalu
   disinkronkan lagi setiap kali disimpan. Berperan seperti "localStorage
   di server" yang disepakati. */
let appDataCache = { prices: null, history: [], draft: null, activeTab: 'pelanggan', counter: 0 };

async function loadAppData() {
    const { ok, data } = await apiRequest('GET', '/api/data');
    if (ok && data) appDataCache = data;
}

/* ---------------- AUTH (server-side session) ---------------- */
async function checkSession() {
    const { ok, data } = await apiRequest('GET', '/api/session');
    return ok && data && data.authenticated;
}
async function initAuth() {
    const authScreen = document.getElementById('authScreen');
    const appRoot = document.getElementById('appRoot');
    const authed = await checkSession();
    if (authed) {
        authScreen.style.display = 'none';
        appRoot.style.display = 'block';
        return true;
    }
    authScreen.style.display = 'flex';
    appRoot.style.display = 'none';
    document.getElementById('loginPass').focus();
    return false;
}
async function attemptLogin() {
    const pw = document.getElementById('loginPass').value;
    const err = document.getElementById('authLoginError');
    const btn = document.querySelector('#authLoginView .btn-primary');
    if (btn) btn.disabled = true;
    const { ok, data, networkError } = await apiRequest('POST', '/api/login', { password: pw });
    if (btn) btn.disabled = false;
    if (ok && data && data.ok) {
        err.textContent = '';
        document.getElementById('loginPass').value = '';
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appRoot').style.display = 'block';
        bootApp();
    } else if (networkError) {
        err.textContent = 'Tidak bisa menghubungi server. Pastikan server sedang berjalan.';
    } else {
        err.textContent = (data && data.error) || 'Password salah. Coba lagi.';
    }
}
async function logout() {
    if (!confirm('Keluar dari aplikasi? Anda perlu memasukkan password lagi untuk masuk kembali.')) return;
    await apiRequest('POST', '/api/logout');
    location.reload();
}
async function promptChangePassword() {
    const oldPw = prompt('Masukkan password saat ini untuk verifikasi:');
    if (oldPw === null) return;
    const newPw = prompt('Masukkan password baru (minimal 4 karakter):');
    if (newPw === null) return;
    if (newPw.length < 4) { alert('Password baru minimal 4 karakter.'); return; }
    const confirmPw = prompt('Ulangi password baru:');
    if (newPw !== confirmPw) { alert('Password baru tidak sama. Dibatalkan.'); return; }
    const { ok, data } = await apiRequest('POST', '/api/change-password', { oldPassword: oldPw, newPassword: newPw });
    if (ok && data && data.ok) {
        showToast('Password berhasil diganti.');
    } else {
        alert((data && data.error) || 'Gagal mengganti password.');
    }
}

/* ---------------- DEFAULT PRICES (sesuai Daftar Harga 2026) ---------------- */
const DEFAULT_PRICES = {
    kusenPintu:   { perMeter:{jati:250000, kamper:220000, meranti:155000, bayur:70000},
                     standard:{jati:1250000, kamper:1100000, meranti:775000, bayur:350000} },
    kusenJendela: { perMeter:{jati:250000, kamper:220000, meranti:155000, bayur:70000},
                     standard:{jati:1000000, kamper:880000, meranti:620000, bayur:300000} },
    kusenBovenlicht:{ perMeter:{jati:250000, kamper:220000, meranti:155000, bayur:70000},
                     standard:{jati:790000, kamper:700000, meranti:505000, bayur:250000}, potonganTanpaKaca:40000 },
    losterPintu:  { standard:{jati:300000, kamper:270000, meranti:210000, bayur:150000},
                     perMeter:{jati:100000, kamper:90000, meranti:70000, bayur:50000} },
    losterJendela:{ standard:{jati:175000, kamper:160000, meranti:125000, bayur:80000},
                     perMeter:{jati:87500, kamper:80000, meranti:62500, bayur:40000} },
    daunPintuFull:{jati:2400000, kamper:2200000, meranti:1600000, bayur:700000},
    daunPintuSemi:{jati:1200000, kamper:1000000, meranti:800000, bayur:450000},
    daunJendelaKaca:{jati:750000, kamper:650000, meranti:550000, bayur:350000, potonganTanpaKaca:50000},
    perlengkapan: { single:250000, dobel:600000, jendela:80000 }
};

const WOOD_LABELS = {jati:'Jati', kamper:'Kamper', meranti:'Meranti', bayur:'Bayur'};

/* Nama kayu lengkap, disamakan persis dengan teks di masing-masing form */
const WOOD_LABELS_KUSEN       = {jati:'Jati Super Jabar', kamper:'Kamper Samarinda Oven', meranti:'Meranti Merah Oven', bayur:'Bayur Lokal Non Oven'};
const WOOD_LABELS_LOSTER      = {jati:'Jati', kamper:'Kamper', meranti:'Meranti', bayur:'Bayur'};
const WOOD_LABELS_DAUN_FULL   = {jati:'Jati Jabar', kamper:'Kamper Samarinda Oven', meranti:'Meranti Merah Oven', bayur:'Bayur Lokal Non Oven'};
const WOOD_LABELS_DAUN_SEMI   = {jati:'Jati + Taekwondo 3mm', kamper:'Kamper + Triplek 4mm', meranti:'Meranti + Triplek 4mm', bayur:'Bayur + Triplek 4mm'};
const WOOD_LABELS_JENDELA_KACA= {jati:'Jati', kamper:'Kamper Oven', meranti:'Meranti Oven', bayur:'Bayur'};

const PRICE_FIELDS = [
    ['kusenPintu.perMeter.jati','pp_kp_pm_jati'],['kusenPintu.perMeter.kamper','pp_kp_pm_kamper'],
    ['kusenPintu.perMeter.meranti','pp_kp_pm_meranti'],['kusenPintu.perMeter.bayur','pp_kp_pm_bayur'],
    ['kusenPintu.standard.jati','pp_kp_std_jati'],['kusenPintu.standard.kamper','pp_kp_std_kamper'],
    ['kusenPintu.standard.meranti','pp_kp_std_meranti'],['kusenPintu.standard.bayur','pp_kp_std_bayur'],
    ['kusenJendela.perMeter.jati','pp_kj_pm_jati'],['kusenJendela.perMeter.kamper','pp_kj_pm_kamper'],
    ['kusenJendela.perMeter.meranti','pp_kj_pm_meranti'],['kusenJendela.perMeter.bayur','pp_kj_pm_bayur'],
    ['kusenJendela.standard.jati','pp_kj_std_jati'],['kusenJendela.standard.kamper','pp_kj_std_kamper'],
    ['kusenJendela.standard.meranti','pp_kj_std_meranti'],['kusenJendela.standard.bayur','pp_kj_std_bayur'],
    ['kusenBovenlicht.perMeter.jati','pp_kb_pm_jati'],['kusenBovenlicht.perMeter.kamper','pp_kb_pm_kamper'],
    ['kusenBovenlicht.perMeter.meranti','pp_kb_pm_meranti'],['kusenBovenlicht.perMeter.bayur','pp_kb_pm_bayur'],
    ['kusenBovenlicht.standard.jati','pp_kb_std_jati'],['kusenBovenlicht.standard.kamper','pp_kb_std_kamper'],
    ['kusenBovenlicht.standard.meranti','pp_kb_std_meranti'],['kusenBovenlicht.standard.bayur','pp_kb_std_bayur'],
    ['kusenBovenlicht.potonganTanpaKaca','pp_kb_potongan'],
    ['losterPintu.standard.jati','pp_lp_std_jati'],['losterPintu.standard.kamper','pp_lp_std_kamper'],['losterPintu.standard.meranti','pp_lp_std_meranti'],['losterPintu.standard.bayur','pp_lp_std_bayur'],
    ['losterPintu.perMeter.jati','pp_lp_pm_jati'],['losterPintu.perMeter.kamper','pp_lp_pm_kamper'],['losterPintu.perMeter.meranti','pp_lp_pm_meranti'],['losterPintu.perMeter.bayur','pp_lp_pm_bayur'],
    ['losterJendela.standard.jati','pp_lj_std_jati'],['losterJendela.standard.kamper','pp_lj_std_kamper'],['losterJendela.standard.meranti','pp_lj_std_meranti'],['losterJendela.standard.bayur','pp_lj_std_bayur'],
    ['losterJendela.perMeter.jati','pp_lj_pm_jati'],['losterJendela.perMeter.kamper','pp_lj_pm_kamper'],['losterJendela.perMeter.meranti','pp_lj_pm_meranti'],['losterJendela.perMeter.bayur','pp_lj_pm_bayur'],
    ['daunPintuFull.jati','pp_dpf_jati'],['daunPintuFull.kamper','pp_dpf_kamper'],['daunPintuFull.meranti','pp_dpf_meranti'],['daunPintuFull.bayur','pp_dpf_bayur'],
    ['daunPintuSemi.jati','pp_dps_jati'],['daunPintuSemi.kamper','pp_dps_kamper'],['daunPintuSemi.meranti','pp_dps_meranti'],['daunPintuSemi.bayur','pp_dps_bayur'],
    ['daunJendelaKaca.jati','pp_djk_jati'],['daunJendelaKaca.kamper','pp_djk_kamper'],['daunJendelaKaca.meranti','pp_djk_meranti'],['daunJendelaKaca.bayur','pp_djk_bayur'],
    ['daunJendelaKaca.potonganTanpaKaca','pp_djk_potongan'],
    ['perlengkapan.single','pp_pl_single'],['perlengkapan.dobel','pp_pl_dobel'],['perlengkapan.jendela','pp_pl_jendela']
];

function getPath(obj, path){ return path.split('.').reduce((o,k)=> o && o[k], obj); }
function setPath(obj, path, val){ const keys=path.split('.'); let o=obj; for(let i=0;i<keys.length-1;i++){ o=o[keys[i]]; } o[keys[keys.length-1]]=val; }
function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function escHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function newCatalogId(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

let prices = clone(DEFAULT_PRICES);
let cart = [];
let cartSeq = 0;
let editingItemPrefix = null;
let invoiceNumber = '';
let invoiceCreatedLabel = '';
let isEditingHistory = false;
let currentTab = 'pelanggan';
let history = [];
let currentHistoryFilter = 'semua';

/* ---------------- HELPERS ---------------- */
function formatRupiah(n){ n = Math.round(n||0); return 'Rp ' + n.toLocaleString('id-ID'); }
function roundUp(val, step){ step = Number(step); return step>0 ? Math.ceil(val/step)*step : val; }
function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}
function todayIndonesian(){
    const bulan=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const d = new Date();
    return d.getDate()+' '+bulan[d.getMonth()]+' '+d.getFullYear();
}
function nowTime(){
    const d = new Date();
    return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
}
/* Nomor nota sekarang dibuat & disimpan di SERVER (counter global di
   data/db.json), jadi tetap urut walau dibuka dari beberapa perangkat. */
async function generateInvoiceNumber(){
    const { ok, data } = await apiRequest('POST', '/api/next-invoice-number');
    if(ok && data && data.number){
        appDataCache.counter = data.counter;
        return data.number;
    }
    // Fallback kalau server sempat tidak terjangkau: tetap buat nomor lokal
    // supaya alur kerja tidak macet (nomor bisa dirapikan lagi nanti).
    const d = new Date();
    const ymd = d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
    appDataCache.counter = (appDataCache.counter||0)+1;
    return 'RJK-'+ymd+'-'+String(appDataCache.counter).padStart(4,'0');
}
async function startNewInvoice(){
    invoiceNumber = await generateInvoiceNumber();
    invoiceCreatedLabel = todayIndonesian()+', '+nowTime();
}

/* ---------------- SIDEBAR TOGGLE ---------------- */
function toggleSidebar(){
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebarOverlay');
    const tg = document.getElementById('sidebarToggle');
    if(!sb) return;
    const willOpen = !sb.classList.contains('open');
    sb.classList.toggle('open', willOpen);
    if(ov) ov.classList.toggle('show', willOpen);
    if(tg) tg.classList.toggle('open', willOpen);
}
function closeSidebar(){
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebarOverlay');
    const tg = document.getElementById('sidebarToggle');
    if(sb) sb.classList.remove('open');
    if(ov) ov.classList.remove('show');
    if(tg) tg.classList.remove('open');
}

/* ---------------- SIDEBAR TAB NAVIGATION ---------------- */
const TAB_NAMES = ['pelanggan','harga','kalkulator','nota','pembayaran','riwayat'];
function showTab(name){
    if(TAB_NAMES.indexOf(name)===-1) name = 'pelanggan';
    currentTab = name;
    TAB_NAMES.forEach(t=>{
        const panel = document.getElementById('tab-'+t);
        const btn = document.getElementById('navBtn-'+t);
        if(panel) panel.classList.toggle('active', t===name);
        if(btn) btn.classList.toggle('active', t===name);
    });
    appDataCache.activeTab = name;
    apiRequest('PUT', '/api/data', { activeTab: name }); // tersimpan di background, tidak perlu ditunggu
    const main = document.querySelector('.main-content');
    if(main) main.scrollTop = 0;
    window.scrollTo({top:0, behavior:'smooth'});
    closeSidebar();
}
function updateEditBanner(){
    const banner = document.getElementById('editBanner');
    if(!banner) return;
    if(isEditingHistory && invoiceNumber){
        const name = document.getElementById('customerName').value;
        document.getElementById('editBannerText').textContent =
            '✏️ Sedang mengedit nota '+invoiceNumber+(name ? ' — '+name : '')+'. Klik "Selesai Edit" setelah selesai.';
        banner.classList.add('show');
    } else {
        banner.classList.remove('show');
    }
}

/* ---------------- PRICE SETTINGS ---------------- */
function togglePriceSettings(){
    const el = document.getElementById('priceSettings');
    el.style.display = el.style.display==='none' ? 'block' : 'none';
}
function cleanNumericString(value){
    return String(value || '').replace(/[^0-9]/g, '') || '0';
}
function formatIntegerWithDots(value){
    const n = parseInt(cleanNumericString(value), 10) || 0;
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function parseNumericValue(value){
    return parseInt(cleanNumericString(value), 10) || 0;
}
function fillPriceInputs(){
    PRICE_FIELDS.forEach(([path,id])=>{
        const el = document.getElementById(id);
        if(el) el.value = formatIntegerWithDots(getPath(prices, path));
    });
}
async function savePrices(auto=false){
    PRICE_FIELDS.forEach(([path,id])=>{
        const el = document.getElementById(id);
        if(el) setPath(prices, path, parseNumericValue(el.value));
    });
    appDataCache.prices = prices;
    await apiRequest('PUT', '/api/data', { prices });
    showToast(auto ? 'Harga disimpan otomatis' : 'Harga tersimpan ✔');
}
async function resetPrices(){
    if(!confirm('Kembalikan semua harga ke Daftar Harga 2026 default? (Tabel & produk tambahan, serta daftar Poin buatan Anda sendiri tidak akan terhapus)')) return;
    const keepCustom = prices.customTables;
    const keepPoints = prices.pointsCatalog;
    prices = clone(DEFAULT_PRICES);
    prices.customTables = keepCustom || [];
    prices.pointsCatalog = keepPoints || [];
    fillPriceInputs();
    await savePrices();
    renderCustomTables();
    renderCustomProducts();
    renderPointsCatalog();
}
/* Katalog "Produk Tambahan" (Kelola Tabel & Kelola Produk) — disimpan di
   prices.customTables, dikirim/diterima apa adanya oleh /api/data karena
   backend memperlakukan "prices" sebagai blob JSON bebas. */
function ensureCustomTables(){
    if(!Array.isArray(prices.customTables)) prices.customTables = [];
    prices.customTables.forEach(t=>{
        if(!Array.isArray(t.items)) t.items = [];
        if(t.kolom!==2 && t.kolom!==3) t.kolom = 3;
    });
    if(!Array.isArray(prices.pointsCatalog)) prices.pointsCatalog = [];
}
function loadPrices(){
    const saved = appDataCache.prices;
    if(saved){
        try{ prices = saved; }catch(e){ prices = clone(DEFAULT_PRICES); }
    } else {
        prices = clone(DEFAULT_PRICES);
    }
    ensureCustomTables();
    // migration guard: data lama mungkin masih pakai struktur loster yang datar
    if(!prices.losterPintu || typeof prices.losterPintu.standard !== 'object'){
        prices.losterPintu = clone(DEFAULT_PRICES.losterPintu);
    }
    if(!prices.losterJendela || typeof prices.losterJendela.standard !== 'object'){
        prices.losterJendela = clone(DEFAULT_PRICES.losterJendela);
    }
    // migration guard: data lama mungkin masih pakai struktur kusenBovenlicht
    // yang datar (jati/kamper/meranti/bayur langsung, tanpa perMeter/standard)
    if(!prices.kusenBovenlicht || typeof prices.kusenBovenlicht.standard !== 'object'){
        const oldFlat = (prices.kusenBovenlicht && typeof prices.kusenBovenlicht.jati === 'number') ? prices.kusenBovenlicht : null;
        prices.kusenBovenlicht = clone(DEFAULT_PRICES.kusenBovenlicht);
        if(oldFlat){
            prices.kusenBovenlicht.standard = {jati:oldFlat.jati, kamper:oldFlat.kamper, meranti:oldFlat.meranti, bayur:oldFlat.bayur};
            if(typeof oldFlat.potonganTanpaKaca === 'number') prices.kusenBovenlicht.potonganTanpaKaca = oldFlat.potonganTanpaKaca;
        }
    }
    fillPriceInputs();
}

/* ---------------- CUSTOM BOX TOGGLE ---------------- */
function toggleCustom(prefix){
    const sel = document.getElementById(prefix+'_kayu').value;
    const box = document.getElementById(prefix+'_custom_box');
    if(box) box.classList.toggle('show', sel==='custom');
    updatePreview(prefix);
}

/* ---------------- LIVE PRICE ESTIMATE (custom ukuran) ---------------- */
const CUSTOM_CONFIG = {
    p1:{ type:'keliling', getPrices:()=>prices.kusenPintu.perMeter },
    p2:{ type:'keliling', getPrices:()=>prices.kusenJendela.perMeter },
    p3:{ type:'keliling', getPrices:()=>prices.losterPintu.perMeter },
    p4:{ type:'keliling', getPrices:()=>prices.losterJendela.perMeter },
    p5:{ type:'area', std:80*200, getPrices:()=>prices.daunPintuFull },
    p6:{ type:'area', std:80*200, getPrices:()=>prices.daunPintuSemi },
    p7:{ type:'area', std:45*150, getPrices:()=>prices.daunJendelaKaca, hasKaca:true },
    pkb:{ type:'area', std:40*100, getPrices:()=>({...prices.kusenBovenlicht.standard, potonganTanpaKaca:prices.kusenBovenlicht.potonganTanpaKaca}), hasKaca:true }
};

/* Urutan tetap tiap produk di menu Kalkulator (1..11) — dipakai supaya urutan
   item di Nota & pesan WhatsApp selalu konsisten mengikuti urutan menu,
   bukan urutan klik "Tambah". Jadi kalau sebuah item dihapus lalu
   ditambahkan lagi, posisinya kembali ke slot semula, bukan pindah ke bawah. */
const PRODUCT_META = {
    p1:  { order:1,  hasWood:true,  hasKaca:false },
    p2:  { order:2,  hasWood:true,  hasKaca:false },
    pkb: { order:3,  hasWood:true,  hasKaca:true  },
    p3:  { order:4,  hasWood:true,  hasKaca:false },
    p4:  { order:5,  hasWood:true,  hasKaca:false },
    p5:  { order:6,  hasWood:true,  hasKaca:false },
    p6:  { order:7,  hasWood:true,  hasKaca:false },
    p7:  { order:8,  hasWood:true,  hasKaca:true  },
    p8:  { order:9,  hasWood:false, hasKaca:false },
    p9:  { order:10, hasWood:false, hasKaca:false },
    p10: { order:11, hasWood:false, hasKaca:false }
};

function updatePreview(prefix){
    const previewEl = document.getElementById(prefix+'_preview');
    if(!previewEl) return;
    const kayuSel = document.getElementById(prefix+'_kayu');
    const cfg = CUSTOM_CONFIG[prefix];
    if(!cfg || !kayuSel || kayuSel.value!=='custom'){ return; }

    const wood = document.getElementById(prefix+'_custom_kayu').value;
    const lebar = parseFloat(document.getElementById(prefix+'_l').value)||0;
    const tinggi = parseFloat(document.getElementById(prefix+'_t').value)||0;
    const dimStep = document.getElementById(prefix+'_round').value;
    const priceStep = document.getElementById(prefix+'_price_round').value;
    const qty = Math.max(1, parseInt(document.getElementById(prefix+'_qty').value)||1);

    if(lebar<=0 || tinggi<=0){
        previewEl.innerHTML = '💡 Isi ukuran lebar &amp; tinggi untuk melihat estimasi harga';
        return;
    }

    const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
    let unitPrice, ukuranText;
    if(cfg.type==='keliling'){
        const meter = (2*rt + rl)/100;
        unitPrice = roundUp(meter * cfg.getPrices()[wood], priceStep);
        ukuranText = `${rl}×${rt} cm (dibulatkan) ≈ ${meter.toFixed(2)} m kayu`;
    } else {
        const ratio = (rl*rt) / cfg.std;
        unitPrice = roundUp(ratio * cfg.getPrices()[wood], priceStep);
        ukuranText = `${rl}×${rt} cm (dibulatkan)`;
    }
    if(cfg.hasKaca){
        const tanpaKacaEl = document.getElementById(prefix+'_tanpakaca');
        if(tanpaKacaEl && tanpaKacaEl.checked){
            unitPrice = Math.max(0, unitPrice - cfg.getPrices().potonganTanpaKaca);
            ukuranText += ' • tanpa kaca';
        }
    }

    const totalPrice = unitPrice * qty;
    previewEl.innerHTML = `💡 Estimasi harga: <strong>${formatRupiah(unitPrice)}</strong> / unit`
        + (qty>1 ? ` &nbsp;•&nbsp; Total ${qty}x = <strong>${formatRupiah(totalPrice)}</strong>` : '')
        + `<br><span class="pv-note">${ukuranText}</span>`;
}

function wirePriceAutoSave(){
    PRICE_FIELDS.forEach(([path,id])=>{
        const el = document.getElementById(id);
        if(el){
            el.addEventListener('change', ()=>{
                el.value = formatIntegerWithDots(el.value);
                savePrices(true);
            });
            el.addEventListener('blur', ()=>{ el.value = formatIntegerWithDots(el.value); });
            el.addEventListener('focus', ()=>{ el.value = cleanNumericString(el.value); });
        }
    });
}

function wireLivePreviewForPrefix(prefix){
    ['_custom_kayu','_l','_t','_round','_price_round','_qty'].forEach(suffix=>{
        const el = document.getElementById(prefix+suffix);
        if(el) el.addEventListener('input', ()=>updatePreview(prefix));
    });
    const tanpaKacaEl = document.getElementById(prefix+'_tanpakaca');
    if(tanpaKacaEl) tanpaKacaEl.addEventListener('change', ()=>updatePreview(prefix));
}
function wireLivePreview(){
    Object.keys(CUSTOM_CONFIG).forEach(prefix=> wireLivePreviewForPrefix(prefix));
}

/* ---------------- CART ---------------- */
function sortCart(){
    cart.sort((a,b)=> (a.sortOrder-b.sortOrder) || (a.seq-b.seq));
}
function hideAllFinishEditRows(){
    Object.keys(PRODUCT_META).forEach(prefix=>{
        const row = document.getElementById(prefix+'_finish_row');
        if(row) row.style.display = 'none';
    });
}
function showFinishEditRow(prefix){
    hideAllFinishEditRows();
    const row = document.getElementById(prefix+'_finish_row');
    if(row) row.style.display = 'block';
}
async function addToCart(item){
    if(!invoiceNumber) await startNewInvoice();
    const prefix = item.raw && item.raw.productKey;
    if(prefix){
        const checkedPoints = getCheckedPointTexts(prefix);
        if(checkedPoints.length) item.detail = (item.detail ? item.detail+' • ' : '') + checkedPoints.join(' • ');
    }
    item.id = 'c'+Date.now()+Math.random().toString(16).slice(2);
    item.total = item.unitPrice * item.qty;
    const meta = item.raw ? PRODUCT_META[item.raw.productKey] : null;
    item.sortOrder = meta ? meta.order : 999;
    item.seq = cartSeq++;
    cart.push(item);
    sortCart();
    if(editingItemPrefix && item.raw && item.raw.productKey===editingItemPrefix){
        hideAllFinishEditRows();
        editingItemPrefix = null;
    }
    renderCart(); updateSummary(); await saveState(); renderInvoiceHead();
    showToast(item.label+' ditambahkan');
}
async function changeQty(id, delta){
    const it = cart.find(c=>c.id===id); if(!it) return;
    it.qty = Math.max(1, it.qty+delta);
    it.total = it.unitPrice*it.qty;
    renderCart(); updateSummary(); await saveState();
}
async function removeItem(id){
    cart = cart.filter(c=>c.id!==id);
    renderCart(); updateSummary(); await saveState();
}
async function clearCart(){
    if(cart.length && !confirm('Kosongkan semua item di nota ini?')) return;
    cart = [];
    renderCart(); updateSummary(); await saveState();
}
/* Pindahkan item nota kembali ke Kalkulator untuk diedit. Item dihapus dari
   nota lebih dulu; saat ditambahkan lagi, addToCart() akan mengembalikannya
   ke posisi urutan produk semula (lihat sortCart / PRODUCT_META), bukan ke
   posisi paling bawah. */
async function editItem(id){
    const idx = cart.findIndex(c=>c.id===id);
    if(idx===-1) return;
    const item = cart[idx];
    const raw = item.raw;
    if(!raw || !raw.productKey){
        showToast('Item ini tidak bisa diedit langsung — hapus lalu tambahkan ulang secara manual.');
        return;
    }
    cart.splice(idx,1);
    renderCart(); updateSummary(); await saveState();

    const prefix = raw.productKey;
    const meta = PRODUCT_META[prefix] || {};

    if(meta.hasWood){
        const kayuSel = document.getElementById(prefix+'_kayu');
        if(kayuSel){
            if(raw.mode==='custom'){
                kayuSel.value = 'custom';
                toggleCustom(prefix);
                const setVal = (suffix, val)=>{ const el=document.getElementById(prefix+suffix); if(el && val!==undefined) el.value = val; };
                setVal('_custom_kayu', raw.wood);
                setVal('_l', raw.lebar);
                setVal('_t', raw.tinggi);
                setVal('_round', raw.round);
                setVal('_price_round', raw.priceRound);
            } else {
                kayuSel.value = raw.wood;
                toggleCustom(prefix);
            }
        }
    }
    if(meta.hasKaca){
        const tk = document.getElementById(prefix+'_tanpakaca');
        if(tk) tk.checked = !!raw.tanpaKaca;
    }
    if(meta.hasPilihan){
        const pilihanSel = document.getElementById(prefix+'_pilihan');
        if(pilihanSel && raw.itemId) pilihanSel.value = raw.itemId;
    }
    const qtyEl = document.getElementById(prefix+'_qty');
    if(qtyEl) qtyEl.value = raw.qty || 1;
    const noteEl = document.getElementById(prefix+'_note');
    if(noteEl) noteEl.value = raw.note || '';

    updatePreview(prefix);
    editingItemPrefix = prefix;
    showFinishEditRow(prefix);
    showTab('kalkulator');
    showToast('Item dipindahkan ke Kalkulator — sesuaikan lalu klik "Selesai Edit"');
    setTimeout(()=>{
        const anchor = qtyEl || document.getElementById(prefix+'_note');
        const block = anchor ? anchor.closest('.product') : null;
        if(block) block.scrollIntoView({behavior:'smooth', block:'center'});
    }, 150);
}
function renderCart(){
    const wrap = document.getElementById('cartList');
    if(cart.length===0){
        wrap.innerHTML = '<div class="empty">Keranjang masih kosong — tambahkan produk dari Kalkulator di atas.</div>';
        return;
    }
    wrap.innerHTML = cart.map(item=>`
        <div class="cart-item">
            <div class="cart-info">
                <div class="cart-name">${item.label}</div>
                <div class="cart-detail">${item.detail}</div>
                <div class="cart-price">${formatRupiah(item.unitPrice)} × ${item.qty} = ${formatRupiah(item.total)}</div>
            </div>
            <div class="actions no-print">
                <button class="btn-light" onclick="changeQty('${item.id}',-1)">−</button>
                <button class="btn-light" onclick="changeQty('${item.id}',1)">+</button>
                <button class="btn-warning" onclick="editItem('${item.id}')">✏️ Edit</button>
                <button class="btn-danger" onclick="removeItem('${item.id}')">Hapus</button>
            </div>
        </div>`).join('');
}

/* ---------------- INVOICE HEAD ---------------- */
function renderInvoiceHead(){
    const name = document.getElementById('customerName').value || '-';
    const phone = document.getElementById('customerPhone').value || '-';
    const addr = document.getElementById('customerAddress').value || '-';
    const project = document.getElementById('projectName').value || '-';
    const noLabel = invoiceNumber ? invoiceNumber : 'Draft (nomor dibuat otomatis saat item pertama ditambahkan)';
    document.getElementById('invoiceHead').innerHTML = `
        <span class="ino">No. Nota: ${noLabel} &nbsp;•&nbsp; ${todayIndonesian()}, ${nowTime()}</span>
        <strong>Pelanggan:</strong> ${name} &nbsp;|&nbsp; <strong>WA:</strong> ${phone}<br>
        <strong>Alamat:</strong> ${addr}<br>
        <strong>Proyek:</strong> ${project}`;
    document.getElementById('invoiceNumberDisplay').textContent = invoiceNumber ? ('No. Nota: '+invoiceNumber) : 'Draft';
    updateEditBanner();
}

/* ---------------- SUMMARY ---------------- */
function getPaymentStatus(sisa, dp, itemCount){
    itemCount = (itemCount===undefined) ? cart.length : itemCount;
    if(itemCount===0) return {text:'', cls:'status', chat:''};
    if(sisa<=0) return {text:'✅ LUNAS', cls:'status status-lunas', chat:'✅ LUNAS'};
    if(dp>0) return {text:'🟡 DP — BELUM LUNAS', cls:'status status-dp', chat:'🟡 DP — BELUM LUNAS'};
    return {text:'🔴 BELUM BAYAR', cls:'status status-belum', chat:'🔴 BELUM BAYAR'};
}

function updateSummary(){
    const subtotal = cart.reduce((s,i)=>s+i.total,0);
    const diskonNominal = parseFloat(document.getElementById('diskonNominal').value)||0;
    const diskonPersen = parseFloat(document.getElementById('diskonPersen').value)||0;
    const diskonTotal = diskonNominal + subtotal*diskonPersen/100;
    const total = Math.max(0, subtotal - diskonTotal);
    const dp = parseFloat(document.getElementById('dpAmount').value)||0;
    const sisa = Math.max(0, total - dp);

    document.getElementById('sumSubtotal').textContent = formatRupiah(subtotal);
    document.getElementById('sumDiskon').textContent = formatRupiah(diskonTotal);
    document.getElementById('sumTotal').textContent = formatRupiah(total);
    document.getElementById('sumDp').textContent = formatRupiah(dp);
    document.getElementById('sumSisa').textContent = formatRupiah(sisa);

    const badge = document.getElementById('statusBadge');
    const status = getPaymentStatus(sisa, dp);
    badge.textContent = status.text;
    badge.className = status.cls;
}

/* ---------------- PRODUCT CALCULATORS ---------------- */
async function tambahPoint1(){
    const qty = Math.max(1, parseInt(document.getElementById('p1_qty').value)||1);
    const sel = document.getElementById('p1_kayu').value;
    const note = document.getElementById('p1_note').value.trim();
    let unitPrice, label, detail, raw;
    if(sel==='custom'){
        const wood = document.getElementById('p1_custom_kayu').value;
        const lebar = parseFloat(document.getElementById('p1_l').value)||0;
        const tinggi = parseFloat(document.getElementById('p1_t').value)||0;
        const dimStep = document.getElementById('p1_round').value;
        const priceStep = document.getElementById('p1_price_round').value;
        const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
        const meter = (2*rt + rl)/100;
        const rawPrice = meter * prices.kusenPintu.perMeter[wood];
        unitPrice = roundUp(rawPrice, priceStep);
        label = `Kusen Pintu ISI Custom (${WOOD_LABELS_KUSEN[wood]})`;
        detail = `${rl}×${rt} cm (dibulatkan) ≈ ${meter.toFixed(2)} m kayu × ${formatRupiah(prices.kusenPintu.perMeter[wood])}/m`;
        raw = {productKey:'p1', mode:'custom', wood, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note};
    } else {
        unitPrice = prices.kusenPintu.standard[sel];
        label = `Kusen Pintu ISI Standar (${WOOD_LABELS_KUSEN[sel]})`;
        detail = 'Ukuran standar 80×200 cm';
        raw = {productKey:'p1', mode:sel, wood:sel, qty, note};
    }
    if(note) detail += ' • '+note;
    await addToCart({label, detail, qty, unitPrice, raw});
    document.getElementById('p1_note').value='';
}

async function tambahPoint2(){
    const qty = Math.max(1, parseInt(document.getElementById('p2_qty').value)||1);
    const sel = document.getElementById('p2_kayu').value;
    const note = document.getElementById('p2_note').value.trim();
    let unitPrice, label, detail, raw;
    if(sel==='custom'){
        const wood = document.getElementById('p2_custom_kayu').value;
        const lebar = parseFloat(document.getElementById('p2_l').value)||0;
        const tinggi = parseFloat(document.getElementById('p2_t').value)||0;
        const dimStep = document.getElementById('p2_round').value;
        const priceStep = document.getElementById('p2_price_round').value;
        const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
        const meter = (2*rt + rl)/100;
        const rawPrice = meter * prices.kusenJendela.perMeter[wood];
        unitPrice = roundUp(rawPrice, priceStep);
        label = `Kusen Jendela U LL Custom (${WOOD_LABELS_KUSEN[wood]})`;
        detail = `${rl}×${rt} cm (dibulatkan) ≈ ${meter.toFixed(2)} m kayu × ${formatRupiah(prices.kusenJendela.perMeter[wood])}/m`;
        raw = {productKey:'p2', mode:'custom', wood, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note};
    } else {
        unitPrice = prices.kusenJendela.standard[sel];
        label = `Kusen Jendela U LL Standar (${WOOD_LABELS_KUSEN[sel]})`;
        detail = 'Ukuran standar 40/50×150 cm';
        raw = {productKey:'p2', mode:sel, wood:sel, qty, note};
    }
    if(note) detail += ' • '+note;
    await addToCart({label, detail, qty, unitPrice, raw});
    document.getElementById('p2_note').value='';
}

async function tambahPoint3(){
    const qty = Math.max(1, parseInt(document.getElementById('p3_qty').value)||1);
    const sel = document.getElementById('p3_kayu').value;
    const note = document.getElementById('p3_note').value.trim();
    let unitPrice, label, detail, raw;
    if(sel==='custom'){
        const wood = document.getElementById('p3_custom_kayu').value;
        const lebar = parseFloat(document.getElementById('p3_l').value)||0;
        const tinggi = parseFloat(document.getElementById('p3_t').value)||0;
        const dimStep = document.getElementById('p3_round').value;
        const priceStep = document.getElementById('p3_price_round').value;
        const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
        const meter = (2*rt + rl)/100;
        const rawPrice = meter * prices.losterPintu.perMeter[wood];
        unitPrice = roundUp(rawPrice, priceStep);
        label = `Loster Kusen Pintu Custom (${WOOD_LABELS_LOSTER[wood]})`;
        detail = `${rl}×${rt} cm (dibulatkan) ≈ ${meter.toFixed(2)} m × ${formatRupiah(prices.losterPintu.perMeter[wood])}/m`;
        raw = {productKey:'p3', mode:'custom', wood, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note};
    } else {
        unitPrice = prices.losterPintu.standard[sel];
        label = `Loster Kusen Pintu Standar (${WOOD_LABELS_LOSTER[sel]})`;
        detail = 'Sesuai ukuran kusen pintu';
        raw = {productKey:'p3', mode:sel, wood:sel, qty, note};
    }
    if(note) detail += ' • '+note;
    await addToCart({label, detail, qty, unitPrice, raw});
    document.getElementById('p3_note').value='';
}

async function tambahPoint4(){
    const qty = Math.max(1, parseInt(document.getElementById('p4_qty').value)||1);
    const sel = document.getElementById('p4_kayu').value;
    const note = document.getElementById('p4_note').value.trim();
    let unitPrice, label, detail, raw;
    if(sel==='custom'){
        const wood = document.getElementById('p4_custom_kayu').value;
        const lebar = parseFloat(document.getElementById('p4_l').value)||0;
        const tinggi = parseFloat(document.getElementById('p4_t').value)||0;
        const dimStep = document.getElementById('p4_round').value;
        const priceStep = document.getElementById('p4_price_round').value;
        const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
        const meter = (2*rt + rl)/100;
        const rawPrice = meter * prices.losterJendela.perMeter[wood];
        unitPrice = roundUp(rawPrice, priceStep);
        label = `Loster Kusen Jendela Custom (${WOOD_LABELS_LOSTER[wood]})`;
        detail = `${rl}×${rt} cm (dibulatkan) ≈ ${meter.toFixed(2)} m × ${formatRupiah(prices.losterJendela.perMeter[wood])}/m`;
        raw = {productKey:'p4', mode:'custom', wood, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note};
    } else {
        unitPrice = prices.losterJendela.standard[sel];
        label = `Loster Kusen Jendela Standar (${WOOD_LABELS_LOSTER[sel]})`;
        detail = 'Sesuai ukuran kusen jendela';
        raw = {productKey:'p4', mode:sel, wood:sel, qty, note};
    }
    if(note) detail += ' • '+note;
    await addToCart({label, detail, qty, unitPrice, raw});
    document.getElementById('p4_note').value='';
}

async function tambahPoint5(){
    const qty = Math.max(1, parseInt(document.getElementById('p5_qty').value)||1);
    const sel = document.getElementById('p5_kayu').value;
    const note = document.getElementById('p5_note').value.trim();
    let unitPrice, label, detail, raw;
    if(sel==='custom'){
        const wood = document.getElementById('p5_custom_kayu').value;
        const lebar = parseFloat(document.getElementById('p5_l').value)||0;
        const tinggi = parseFloat(document.getElementById('p5_t').value)||0;
        const dimStep = document.getElementById('p5_round').value;
        const priceStep = document.getElementById('p5_price_round').value;
        const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
        const ratio = (rl*rt) / (80*200);
        const rawPrice = ratio * prices.daunPintuFull[wood];
        unitPrice = roundUp(rawPrice, priceStep);
        label = `Daun Pintu Full ISI Custom (${WOOD_LABELS_DAUN_FULL[wood]})`;
        detail = `${rl}×${rt} cm (dibulatkan) • proporsional dari standar 80×200`;
        raw = {productKey:'p5', mode:'custom', wood, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note};
    } else {
        unitPrice = prices.daunPintuFull[sel];
        label = `Daun Pintu Full ISI Standar (${WOOD_LABELS_DAUN_FULL[sel]})`;
        detail = 'Ukuran standar 80×200 cm';
        raw = {productKey:'p5', mode:sel, wood:sel, qty, note};
    }
    if(note) detail += ' • '+note;
    await addToCart({label, detail, qty, unitPrice, raw});
    document.getElementById('p5_note').value='';
}

async function tambahPoint6(){
    const qty = Math.max(1, parseInt(document.getElementById('p6_qty').value)||1);
    const sel = document.getElementById('p6_kayu').value;
    const note = document.getElementById('p6_note').value.trim();
    let unitPrice, label, detail, raw;
    if(sel==='custom'){
        const wood = document.getElementById('p6_custom_kayu').value;
        const lebar = parseFloat(document.getElementById('p6_l').value)||0;
        const tinggi = parseFloat(document.getElementById('p6_t').value)||0;
        const dimStep = document.getElementById('p6_round').value;
        const priceStep = document.getElementById('p6_price_round').value;
        const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
        const ratio = (rl*rt) / (80*200);
        const rawPrice = ratio * prices.daunPintuSemi[wood];
        unitPrice = roundUp(rawPrice, priceStep);
        label = `Daun Pintu Triplek Semi Custom (${WOOD_LABELS_DAUN_SEMI[wood]})`;
        detail = `${rl}×${rt} cm (dibulatkan) • proporsional dari standar 80×200`;
        raw = {productKey:'p6', mode:'custom', wood, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note};
    } else {
        unitPrice = prices.daunPintuSemi[sel];
        label = `Daun Pintu Triplek Semi Standar (${WOOD_LABELS_DAUN_SEMI[sel]})`;
        detail = 'Ukuran standar 80×200 cm';
        raw = {productKey:'p6', mode:sel, wood:sel, qty, note};
    }
    if(note) detail += ' • '+note;
    await addToCart({label, detail, qty, unitPrice, raw});
    document.getElementById('p6_note').value='';
}

async function tambahPoint7(){
    const qty = Math.max(1, parseInt(document.getElementById('p7_qty').value)||1);
    const sel = document.getElementById('p7_kayu').value;
    const note = document.getElementById('p7_note').value.trim();
    const tanpaKaca = document.getElementById('p7_tanpakaca').checked;
    let unitPrice, label, detail, raw;
    if(sel==='custom'){
        const wood = document.getElementById('p7_custom_kayu').value;
        const lebar = parseFloat(document.getElementById('p7_l').value)||0;
        const tinggi = parseFloat(document.getElementById('p7_t').value)||0;
        const dimStep = document.getElementById('p7_round').value;
        const priceStep = document.getElementById('p7_price_round').value;
        const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
        const ratio = (rl*rt) / (45*150);
        const rawPrice = ratio * prices.daunJendelaKaca[wood];
        unitPrice = roundUp(rawPrice, priceStep);
        label = `Daun Jendela + Kaca Custom (${WOOD_LABELS_JENDELA_KACA[wood]})`;
        detail = `${rl}×${rt} cm (dibulatkan) • proporsional dari standar 45×150`;
        raw = {productKey:'p7', mode:'custom', wood, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note, tanpaKaca};
    } else {
        unitPrice = prices.daunJendelaKaca[sel];
        label = `Daun Jendela + Kaca Standar (${WOOD_LABELS_JENDELA_KACA[sel]})`;
        detail = 'Ukuran standar 40/50×150 cm';
        raw = {productKey:'p7', mode:sel, wood:sel, qty, note, tanpaKaca};
    }
    if(tanpaKaca){
        unitPrice = Math.max(0, unitPrice - prices.daunJendelaKaca.potonganTanpaKaca);
        label += ' — Tanpa Kaca';
        detail += ` • tanpa kaca (potongan ${formatRupiah(prices.daunJendelaKaca.potonganTanpaKaca)})`;
    } else {
        label += ' — Dengan Kaca';
        detail += ' • dengan kaca (harga standar)';
    }
    if(note) detail += ' • '+note;
    await addToCart({label, detail, qty, unitPrice, raw});
    document.getElementById('p7_note').value='';
}

async function tambahPointKB(){
    const qty = Math.max(1, parseInt(document.getElementById('pkb_qty').value)||1);
    const sel = document.getElementById('pkb_kayu').value;
    const note = document.getElementById('pkb_note').value.trim();
    const tanpaKaca = document.getElementById('pkb_tanpakaca').checked;
    let unitPrice, label, detail, raw;
    if(sel==='custom'){
        const wood = document.getElementById('pkb_custom_kayu').value;
        const lebar = parseFloat(document.getElementById('pkb_l').value)||0;
        const tinggi = parseFloat(document.getElementById('pkb_t').value)||0;
        const dimStep = document.getElementById('pkb_round').value;
        const priceStep = document.getElementById('pkb_price_round').value;
        const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
        const ratio = (rl*rt) / (40*100);
        const rawPrice = ratio * prices.kusenBovenlicht.standard[wood];
        unitPrice = roundUp(rawPrice, priceStep);
        label = `Kusen Bovenlicht + Kaca Custom (${WOOD_LABELS_KUSEN[wood]})`;
        detail = `${rl}×${rt} cm (dibulatkan) • proporsional dari standar 40×100`;
        raw = {productKey:'pkb', mode:'custom', wood, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note, tanpaKaca};
    } else {
        unitPrice = prices.kusenBovenlicht.standard[sel];
        label = `Kusen Bovenlicht + Kaca Standar (${WOOD_LABELS_KUSEN[sel]})`;
        detail = 'Ukuran standar 40×100 cm';
        raw = {productKey:'pkb', mode:sel, wood:sel, qty, note, tanpaKaca};
    }
    if(tanpaKaca){
        unitPrice = Math.max(0, unitPrice - prices.kusenBovenlicht.potonganTanpaKaca);
        label += ' — Tanpa Kaca';
        detail += ` • tanpa kaca (potongan ${formatRupiah(prices.kusenBovenlicht.potonganTanpaKaca)})`;
    } else {
        label += ' — Dengan Kaca';
        detail += ' • dengan kaca (harga standar)';
    }
    if(note) detail += ' • '+note;
    await addToCart({label, detail, qty, unitPrice, raw});
    document.getElementById('pkb_note').value='';
}

async function tambahPoint8(){
    const qty = Math.max(1, parseInt(document.getElementById('p8_qty').value)||1);
    const note = document.getElementById('p8_note').value.trim();
    let detail = 'Kunci besar SLG + engsel';
    if(note) detail += ' • '+note;
    const raw = {productKey:'p8', qty, note};
    await addToCart({label:'Perlengkapan Pintu Single', detail, qty, unitPrice: prices.perlengkapan.single, raw});
    document.getElementById('p8_note').value='';
}
async function tambahPoint9(){
    const qty = Math.max(1, parseInt(document.getElementById('p9_qty').value)||1);
    const note = document.getElementById('p9_note').value.trim();
    let detail = 'Kunci B Pelor IGM + selot tanam + engsel + hendel 4';
    if(note) detail += ' • '+note;
    const raw = {productKey:'p9', qty, note};
    await addToCart({label:'Perlengkapan Pintu Dobel', detail, qty, unitPrice: prices.perlengkapan.dobel, raw});
    document.getElementById('p9_note').value='';
}
async function tambahPoint10(){
    const qty = Math.max(1, parseInt(document.getElementById('p10_qty').value)||1);
    const note = document.getElementById('p10_note').value.trim();
    let detail = 'Engsel + selot kenife + hak angin';
    if(note) detail += ' • '+note;
    const raw = {productKey:'p10', qty, note};
    await addToCart({label:'Perlengkapan Jendela', detail, qty, unitPrice: prices.perlengkapan.jendela, raw});
    document.getElementById('p10_note').value='';
}

/* Peta prefix produk -> fungsi "Tambah" masing-masing, dipakai oleh tombol
   "Selesai Edit" supaya bisa memanggil fungsi yang tepat secara generik. */
const TAMBAH_FUNCS = {
    p1: tambahPoint1, p2: tambahPoint2, pkb: tambahPointKB, p3: tambahPoint3,
    p4: tambahPoint4, p5: tambahPoint5, p6: tambahPoint6, p7: tambahPoint7,
    p8: tambahPoint8, p9: tambahPoint9, p10: tambahPoint10
};
/* Dipanggil oleh tombol "✅ Selesai Edit" pada produk yang sedang diedit:
   menambahkan item dengan nilai form saat ini (sama seperti tombol Tambah),
   lalu otomatis kembali ke tab Nota. */
async function finishEditProduct(prefix){
    const fn = TAMBAH_FUNCS[prefix];
    if(fn) await fn();
    hideAllFinishEditRows();
    editingItemPrefix = null;
    showTab('nota');
}

/* ==========================================================================
   KELOLA POIN — daftar keterangan/spesifikasi singkat yang bisa dipakai
   ulang untuk produk mana saja.
   ==========================================================================
   Disimpan sebagai daftar tunggal di prices.pointsCatalog: [{id, text}].
   Setiap blok produk di Kalkulator (bawaan maupun tambahan) otomatis dapat
   checklist untuk memilih poin mana yang berlaku pada item itu; poin yang
   dicentang ditambahkan ke "detail" item saat masuk keranjang — jadi ikut
   otomatis ke Nota, Riwayat, Cetak, dan pesan WhatsApp lewat mekanisme yang
   sudah ada, tanpa perlu mengubah satu-satu fungsi tambahPointN().
   ========================================================================== */
function renderPointsCatalog(){
    const wrap = document.getElementById('pointsCatalogWrap');
    if(!wrap) return;
    ensureCustomTables();
    if(prices.pointsCatalog.length===0){
        wrap.innerHTML = '<div class="empty">Belum ada poin. Klik "Tambah Poin" di bawah.</div>';
        return;
    }
    wrap.innerHTML = '<div class="price-table-wrap"><table class="price-table"><thead><tr><th>Poin</th><th></th></tr></thead><tbody>'
        + prices.pointsCatalog.map(p=>`<tr>
            <td><input value="${escHtml(p.text)}" onchange="updatePoint('${p.id}',this.value)"></td>
            <td><button class="btn-danger" onclick="deletePoint('${p.id}')">🗑</button></td>
        </tr>`).join('')
        + '</tbody></table></div>';
}
async function addPoint(){
    const text = prompt('Tulis poin/keterangan baru (contoh: "Termasuk pemasangan", "Garansi 1 tahun"):');
    if(text===null || !text.trim()) return;
    ensureCustomTables();
    prices.pointsCatalog.push({ id:newCatalogId('pt_'), text:text.trim() });
    await savePrices();
    renderPointsCatalog();
    renderPointsChecklists();
    showToast('Poin ditambahkan.');
}
async function updatePoint(pointId, value){
    const p = prices.pointsCatalog.find(x=>x.id===pointId); if(!p) return;
    p.text = value.trim() || p.text;
    await savePrices(true);
    renderPointsChecklists();
}
async function deletePoint(pointId){
    if(!confirm('Hapus poin ini?')) return;
    prices.pointsCatalog = prices.pointsCatalog.filter(x=>x.id!==pointId);
    await savePrices();
    renderPointsCatalog();
    renderPointsChecklists();
}

/* ---------- Suntikkan checklist poin ke setiap blok produk di Kalkulator ---------- */
function pointsChecklistHTML(prefix){
    if(!prices.pointsCatalog || prices.pointsCatalog.length===0) return '';
    const boxes = prices.pointsCatalog.map(p=>
        `<label class="point-check"><input type="checkbox" value="${escHtml(p.text)}"> ${escHtml(p.text)}</label>`
    ).join('');
    return `<div id="${prefix}_points" class="field note-row points-box"><label>Poin Tambahan (opsional)</label><div class="points-list">${boxes}</div></div>`;
}
function renderPointsChecklistFor(prefix){
    const noteField = document.getElementById(prefix+'_note');
    if(!noteField) return;
    const noteRow = noteField.closest('.note-row') || noteField.parentElement;
    if(!noteRow) return;
    const old = document.getElementById(prefix+'_points');
    if(old) old.remove();
    if(!prices.pointsCatalog || prices.pointsCatalog.length===0) return;
    const holder = document.createElement('div');
    holder.innerHTML = pointsChecklistHTML(prefix);
    noteRow.parentNode.insertBefore(holder.firstElementChild, noteRow);
}
function renderPointsChecklists(){
    Object.keys(PRODUCT_META).forEach(prefix=> renderPointsChecklistFor(prefix));
}
function getCheckedPointTexts(prefix){
    const box = document.getElementById(prefix+'_points');
    if(!box) return [];
    const texts = Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(el=>el.value);
    box.querySelectorAll('input[type=checkbox]:checked').forEach(el=> el.checked=false);
    return texts;
}

/* ==========================================================================
   PRODUK TAMBAHAN — "Kelola Tabel" & "Kelola Produk"
   ==========================================================================
   Katalog bebas yang bisa ditambah/edit/hapus sendiri oleh pengguna dari tab
   Pengaturan Harga, disimpan di prices.customTables. Setiap tabel yang dibuat
   otomatis mendapat blok kalkulatornya sendiri di tab Kalkulator Produk,
   memakai mesin yang sama (PRODUCT_META/CUSTOM_CONFIG/TAMBAH_FUNCS/addToCart)
   dengan 9 kategori produk bawaan — jadi otomatis ikut masuk ke Nota,
   Riwayat, Cetak, dan pesan WhatsApp.

   - kolom 3 -> "Ukuran Custom": Nama Produk | Harga/Meter | Harga Standar.
     Berperilaku sama seperti Kusen Pintu/Jendela/Loster (rumus keliling).
   - kolom 2 -> "Pilihan Harga Tetap": Nama Produk | Harga. Tidak ada
     kalkulator ukuran, tinggal pilih & qty (seperti Perlengkapan).
   ========================================================================== */

/* ---------- Kelola Tabel (render di Pengaturan Harga) ---------- */
function renderCustomTables(){
    const wrap = document.getElementById('customTablesWrap');
    if(!wrap) return;
    ensureCustomTables();
    if(prices.customTables.length===0){
        wrap.innerHTML = '<div class="empty">Belum ada tabel produk tambahan. Klik "Tambah Tabel Baru" di bawah.</div>';
        return;
    }
    wrap.innerHTML = prices.customTables.map(t=>{
        const rows = t.items.map(it=>{
            if(t.kolom===3){
                return `<tr>
                    <td><input value="${escHtml(it.label)}" onchange="updateCustomItem('${t.id}','${it.id}','label',this.value)"></td>
                    <td><input type="text" inputmode="numeric" pattern="[0-9]*" value="${formatIntegerWithDots(it.perMeter)}" onfocus="this.value=cleanNumericString(this.value)" onblur="this.value=formatIntegerWithDots(this.value); updateCustomItem('${t.id}','${it.id}','perMeter',this.value)"></td>
                    <td><input type="text" inputmode="numeric" pattern="[0-9]*" value="${formatIntegerWithDots(it.standard)}" onfocus="this.value=cleanNumericString(this.value)" onblur="this.value=formatIntegerWithDots(this.value); updateCustomItem('${t.id}','${it.id}','standard',this.value)"></td>
                    <td><button class="btn-danger" onclick="deleteCustomItem('${t.id}','${it.id}')">🗑</button></td>
                </tr>`;
            }
            return `<tr>
                <td><input value="${escHtml(it.label)}" onchange="updateCustomItem('${t.id}','${it.id}','label',this.value)"></td>
                <td><input type="text" inputmode="numeric" pattern="[0-9]*" value="${formatIntegerWithDots(it.harga)}" onfocus="this.value=cleanNumericString(this.value)" onblur="this.value=formatIntegerWithDots(this.value); updateCustomItem('${t.id}','${it.id}','harga',this.value)"></td>
                <td><button class="btn-danger" onclick="deleteCustomItem('${t.id}','${it.id}')">🗑</button></td>
            </tr>`;
        }).join('');
        const head = t.kolom===3
            ? '<tr><th>Nama Produk</th><th>Harga / Meter</th><th>Harga Standar</th><th></th></tr>'
            : '<tr><th>Nama Produk</th><th>Harga</th><th></th></tr>';
        const emptyRow = t.items.length===0 ? `<tr><td colspan="${t.kolom===3?4:3}" style="color:var(--wood-dark);opacity:.7">Belum ada produk di tabel ini.</td></tr>` : '';
        return `<div class="price-section">
<h3 style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
<span>📦 ${escHtml(t.title)} <small style="font-weight:400;opacity:.7">(${t.kolom} kolom)</small></span>
<span>
<button class="btn-light" onclick="renameCustomTable('${t.id}')">✏️ Ganti Judul</button>
<button class="btn-danger" onclick="deleteCustomTable('${t.id}')">🗑 Hapus Tabel</button>
</span>
</h3>
<div class="price-table-wrap"><table class="price-table"><thead>${head}</thead><tbody>${rows}${emptyRow}</tbody></table></div>
<button class="btn-light" onclick="addCustomItem('${t.id}')">➕ Tambah Produk</button>
</div>`;
    }).join('');
}
function showAddTableForm(){
    const f = document.getElementById('addTableForm');
    if(f) f.style.display = 'block';
}
function hideAddTableForm(){
    const f = document.getElementById('addTableForm');
    if(f) f.style.display = 'none';
    const t = document.getElementById('newTableTitle');
    if(t) t.value = '';
}
async function createCustomTable(){
    const titleEl = document.getElementById('newTableTitle');
    const title = (titleEl.value||'').trim();
    if(!title){ alert('Judul tabel wajib diisi.'); return; }
    const kolom = document.getElementById('newTableKolom').value==='2' ? 2 : 3;
    ensureCustomTables();
    prices.customTables.push({ id:newCatalogId('ct_'), title, kolom, items: [] });
    hideAddTableForm();
    await savePrices();
    renderCustomTables();
    renderCustomProducts();
    showToast('Tabel "'+title+'" dibuat. Sekarang tambahkan produknya.');
}
async function renameCustomTable(tableId){
    const t = prices.customTables.find(x=>x.id===tableId); if(!t) return;
    const val = prompt('Judul baru untuk tabel ini:', t.title);
    if(val===null || !val.trim()) return;
    t.title = val.trim();
    await savePrices();
    renderCustomTables();
    renderCustomProducts();
}
async function deleteCustomTable(tableId){
    const t = prices.customTables.find(x=>x.id===tableId); if(!t) return;
    if(!confirm('Hapus tabel "'+t.title+'" beserta semua produk di dalamnya?\n\n(Nota lama yang sudah memakai produk ini di Riwayat Nota tidak akan berubah.)')) return;
    prices.customTables = prices.customTables.filter(x=>x.id!==tableId);
    delete PRODUCT_META[tableId]; delete CUSTOM_CONFIG[tableId]; delete TAMBAH_FUNCS[tableId];
    await savePrices();
    renderCustomTables();
    renderCustomProducts();
}

/* ---------- Kelola Produk (baris di dalam sebuah tabel) ---------- */
async function addCustomItem(tableId){
    const t = prices.customTables.find(x=>x.id===tableId); if(!t) return;
    const label = prompt('Nama produk / varian baru:');
    if(label===null || !label.trim()) return;
    const item = { id:newCatalogId('it_'), label: label.trim() };
    if(t.kolom===3){ item.perMeter = 0; item.standard = 0; } else { item.harga = 0; }
    t.items.push(item);
    await savePrices();
    renderCustomTables();
    renderCustomProducts();
    showToast('Produk "'+item.label+'" ditambahkan — isi harganya di tabel.');
}
async function updateCustomItem(tableId, itemId, field, value){
    const t = prices.customTables.find(x=>x.id===tableId); if(!t) return;
    const it = t.items.find(x=>x.id===itemId); if(!it) return;
    if(field==='label') it.label = value.trim() || it.label;
    else it[field] = parseNumericValue(value);
    await savePrices(true);
    renderCustomTables();
    renderCustomProducts();
}
async function deleteCustomItem(tableId, itemId){
    const t = prices.customTables.find(x=>x.id===tableId); if(!t) return;
    if(!confirm('Hapus produk ini dari tabel?')) return;
    t.items = t.items.filter(x=>x.id!==itemId);
    await savePrices();
    renderCustomTables();
    renderCustomProducts();
}

/* ---------- Render blok Kalkulator untuk tiap tabel produk tambahan ---------- */
const ROUND_DIM_OPTIONS = '<option value="5">Kelipatan 5 cm</option><option value="10">Kelipatan 10 cm</option><option value="15">Kelipatan 15 cm</option><option value="20">Kelipatan 20 cm</option><option value="25">Kelipatan 25 cm</option><option value="30">Kelipatan 30 cm</option><option value="40">Kelipatan 40 cm</option><option value="50">Kelipatan 50 cm</option><option value="0">Tanpa Pembulatan</option>';
const ROUND_PRICE_OPTIONS = '<option value="10000" selected>Ke atas Rp10.000</option><option value="15000">Ke atas Rp15.000</option><option value="20000">Ke atas Rp20.000</option><option value="25000">Ke atas Rp25.000</option><option value="0">Tanpa Pembulatan</option>';

function customProductBlockHTML(t){
    const prefix = t.id;
    if(t.kolom===3){
        const opts = t.items.map(it=>`<option value="${it.id}">${escHtml(it.label)} (Standar)</option>`).join('');
        const customOpts = t.items.map(it=>`<option value="${it.id}">${escHtml(it.label)}</option>`).join('');
        return `<div class="product">
<div class="product-header">📦 ${escHtml(t.title)}</div>
<div class="product-body">
<div class="product-row">
<div class="field"><label>Pilihan</label>
<select id="${prefix}_kayu" onchange="toggleCustom('${prefix}')">
${opts}
<option value="custom">-- UKURAN CUSTOM --</option>
</select></div>
<div class="field"><label>Qty</label><input id="${prefix}_qty" type="number" value="1" min="1"></div>
<button class="btn-primary" onclick="tambahCustomProduct('${t.id}')">Tambah</button>
</div>
<div id="${prefix}_custom_box" class="custom">
<div class="field"><label>Pilihan</label>
<select id="${prefix}_custom_kayu">${customOpts}</select></div>
<div class="field"><label>Lebar (cm)</label><input id="${prefix}_l" type="number" value="100"></div>
<div class="field"><label>Tinggi (cm)</label><input id="${prefix}_t" type="number" value="100"></div>
<div class="field"><label>Pembulatan Ukuran</label><select id="${prefix}_round">${ROUND_DIM_OPTIONS}</select></div>
<div class="field"><label>Pembulatan Harga</label><select id="${prefix}_price_round">${ROUND_PRICE_OPTIONS}</select></div>
<div id="${prefix}_preview" class="preview-price">💡 Isi ukuran untuk melihat estimasi harga</div>
</div>
<div class="field note-row"><label>Catatan (opsional)</label><input id="${prefix}_note" placeholder="Catatan tambahan"></div>
<div id="${prefix}_finish_row" class="field note-row" style="display:none"><button class="btn-success" style="width:100%" onclick="finishEditProduct('${prefix}')">✅ Selesai Edit — Simpan &amp; Kembali ke Nota</button></div>
</div>
</div>`;
    }
    const opts2 = t.items.map(it=>`<option value="${it.id}">${escHtml(it.label)} — ${formatRupiah(it.harga)}</option>`).join('');
    return `<div class="product">
<div class="product-header">📦 ${escHtml(t.title)}</div>
<div class="product-body">
<div class="product-row">
<div class="field"><label>Pilihan</label><select id="${prefix}_pilihan">${opts2}</select></div>
<div class="field"><label>Qty</label><input id="${prefix}_qty" type="number" value="1" min="1"></div>
<button class="btn-primary" onclick="tambahCustomProduct('${t.id}')">Tambah</button>
</div>
<div class="field note-row"><label>Catatan (opsional)</label><input id="${prefix}_note" placeholder="Catatan tambahan"></div>
<div id="${prefix}_finish_row" class="field note-row" style="display:none"><button class="btn-success" style="width:100%" onclick="finishEditProduct('${prefix}')">✅ Selesai Edit — Simpan &amp; Kembali ke Nota</button></div>
</div>
</div>`;
}

function renderCustomProducts(){
    const wrap = document.getElementById('customProductsContainer');
    if(!wrap) return;
    ensureCustomTables();

    // Bersihkan registrasi dinamis lama sebelum menulis ulang (tabel/produk
    // bisa saja sudah dihapus/diubah sejak render terakhir).
    Object.keys(PRODUCT_META).forEach(k=>{ if(k.indexOf('ct_')===0) delete PRODUCT_META[k]; });
    Object.keys(CUSTOM_CONFIG).forEach(k=>{ if(k.indexOf('ct_')===0) delete CUSTOM_CONFIG[k]; });
    Object.keys(TAMBAH_FUNCS).forEach(k=>{ if(k.indexOf('ct_')===0) delete TAMBAH_FUNCS[k]; });

    const usable = prices.customTables.filter(t=>t.items && t.items.length>0);
    if(usable.length===0){ wrap.innerHTML=''; return; }

    usable.forEach((t, idx)=>{
        const prefix = t.id;
        PRODUCT_META[prefix] = { order: 100+idx, hasWood: t.kolom===3, hasKaca:false, hasPilihan: t.kolom===2 };
        if(t.kolom===3){
            CUSTOM_CONFIG[prefix] = { type:'keliling', getPrices: ()=>{
                const map = {};
                t.items.forEach(it=> map[it.id]=it.perMeter||0);
                return map;
            }};
        }
        TAMBAH_FUNCS[prefix] = ()=>tambahCustomProduct(t.id);
    });

    wrap.innerHTML = usable.map(t=>customProductBlockHTML(t)).join('');
    usable.forEach(t=>{ if(t.kolom===3) wireLivePreviewForPrefix(t.id); });
    renderPointsChecklists();
}

async function tambahCustomProduct(tableId){
    const t = prices.customTables.find(x=>x.id===tableId);
    if(!t){ showToast('Tabel produk ini sudah tidak ada.'); return; }
    const prefix = t.id;
    const qtyEl = document.getElementById(prefix+'_qty');
    const noteEl = document.getElementById(prefix+'_note');
    if(!qtyEl || !noteEl) return;
    const qty = Math.max(1, parseInt(qtyEl.value)||1);
    const note = (noteEl.value||'').trim();
    let unitPrice, label, detail, raw;

    if(t.kolom===3){
        const sel = document.getElementById(prefix+'_kayu').value;
        if(sel==='custom'){
            const itemId = document.getElementById(prefix+'_custom_kayu').value;
            const it = t.items.find(x=>x.id===itemId);
            const lebar = parseFloat(document.getElementById(prefix+'_l').value)||0;
            const tinggi = parseFloat(document.getElementById(prefix+'_t').value)||0;
            const dimStep = document.getElementById(prefix+'_round').value;
            const priceStep = document.getElementById(prefix+'_price_round').value;
            const rl = roundUp(lebar, dimStep), rt = roundUp(tinggi, dimStep);
            const meter = (2*rt + rl)/100;
            const rawPrice = meter * (it ? (it.perMeter||0) : 0);
            unitPrice = roundUp(rawPrice, priceStep);
            label = `${t.title} Custom (${it?it.label:'?'})`;
            detail = `${rl}×${rt} cm (dibulatkan) ≈ ${meter.toFixed(2)} m × ${formatRupiah(it?(it.perMeter||0):0)}/m`;
            raw = {productKey:prefix, mode:'custom', wood:itemId, lebar, tinggi, round:dimStep, priceRound:priceStep, qty, note};
        } else {
            const it = t.items.find(x=>x.id===sel);
            unitPrice = it ? (it.standard||0) : 0;
            label = `${t.title} Standar (${it?it.label:'?'})`;
            detail = 'Harga standar';
            raw = {productKey:prefix, mode:sel, wood:sel, qty, note};
        }
    } else {
        const sel = document.getElementById(prefix+'_pilihan').value;
        const it = t.items.find(x=>x.id===sel);
        unitPrice = it ? (it.harga||0) : 0;
        label = t.title + (it ? ' — '+it.label : '');
        detail = it ? it.label : '';
        raw = {productKey:prefix, qty, note, itemId:sel};
    }
    if(note) detail += (detail ? ' • ' : '') + note;
    await addToCart({label, detail, qty, unitPrice, raw});
    noteEl.value = '';
}

/* ---------------- WHATSAPP ---------------- */
function sendWhatsApp(){
    if(cart.length===0){ showToast('Nota masih kosong'); return; }
    const rawPhone = document.getElementById('customerPhone').value.replace(/\D/g,'');
    if(!rawPhone){ showToast('Isi nomor WhatsApp pelanggan dulu'); return; }
    const waPhone = rawPhone.startsWith('0') ? '62'+rawPhone.slice(1) : rawPhone;

    const subtotal = cart.reduce((s,i)=>s+i.total,0);
    const diskonNominal = parseFloat(document.getElementById('diskonNominal').value)||0;
    const diskonPersen = parseFloat(document.getElementById('diskonPersen').value)||0;
    const diskonTotal = diskonNominal + subtotal*diskonPersen/100;
    const total = Math.max(0, subtotal - diskonTotal);
    const dp = parseFloat(document.getElementById('dpAmount').value)||0;
    const sisa = Math.max(0, total - dp);
    const status = getPaymentStatus(sisa, dp);

    let text = `*RISE JAYA KUSEN*\nNo. Nota: ${invoiceNumber}\nTanggal: ${todayIndonesian()}, ${nowTime()}\n\n`;
    text += `Pelanggan: ${document.getElementById('customerName').value||'-'}\n`;
    text += `No. WA: ${document.getElementById('customerPhone').value||'-'}\n`;
    text += `Alamat: ${document.getElementById('customerAddress').value||'-'}\n`;
    text += `Proyek: ${document.getElementById('projectName').value||'-'}\n\n`;
    cart.forEach((it,idx)=>{
        text += `${idx+1}. ${it.label} (${it.qty}x)\n`;
        text += `    ${it.detail}\n`;
        text += `    ${formatRupiah(it.unitPrice)} x ${it.qty} = ${formatRupiah(it.total)}\n`;
    });
    text += `\nSubtotal: ${formatRupiah(subtotal)}`;
    text += `\nDiskon: ${formatRupiah(diskonTotal)}`;
    text += `\n*Total: ${formatRupiah(total)}*`;
    text += `\nUang Muka / DP: ${formatRupiah(dp)}`;
    text += `\n*Sisa Bayar: ${formatRupiah(sisa)}*`;
    text += `\n\nStatus: ${status.chat}`;

    window.open('https://wa.me/'+waPhone+'?text='+encodeURIComponent(text), '_blank');
}

/* ---------------- RIWAYAT NOTA (HISTORY) ---------------- */
function loadHistory(){
    history = appDataCache.history || [];
}
async function saveHistory(){
    appDataCache.history = history;
    await apiRequest('PUT', '/api/data', { history });
}
function computeTotals(cartArr, diskonNominal, diskonPersen, dpAmount){
    const subtotal = cartArr.reduce((s,i)=>s+i.total,0);
    const diskonTotal = (parseFloat(diskonNominal)||0) + subtotal*(parseFloat(diskonPersen)||0)/100;
    const total = Math.max(0, subtotal - diskonTotal);
    const dp = parseFloat(dpAmount)||0;
    const sisa = Math.max(0, total - dp);
    return {subtotal, diskonTotal, total, dp, sisa};
}
async function syncCurrentInvoiceToHistory(){
    if(!invoiceNumber || cart.length===0) return;
    const diskonNominal = document.getElementById('diskonNominal').value;
    const diskonPersen = document.getElementById('diskonPersen').value;
    const dpAmount = document.getElementById('dpAmount').value;
    const totals = computeTotals(cart, diskonNominal, diskonPersen, dpAmount);
    const statusKey = totals.sisa<=0 ? 'lunas' : (totals.dp>0 ? 'dp' : 'belum');

    const record = {
        invoiceNumber,
        dateLabel: invoiceCreatedLabel || (todayIndonesian()+', '+nowTime()),
        customerName: document.getElementById('customerName').value,
        customerPhone: document.getElementById('customerPhone').value,
        customerAddress: document.getElementById('customerAddress').value,
        projectName: document.getElementById('projectName').value,
        cart: clone(cart),
        diskonNominal, diskonPersen, dpAmount,
        subtotal: totals.subtotal, diskonTotal: totals.diskonTotal, total: totals.total, dp: totals.dp, sisa: totals.sisa,
        statusKey,
        updatedAt: Date.now()
    };

    const idx = history.findIndex(h=>h.invoiceNumber===invoiceNumber);
    if(idx>=0){ record.createdAt = history[idx].createdAt || Date.now(); history[idx] = record; }
    else { record.createdAt = Date.now(); history.unshift(record); }
    await saveHistory();
    renderHistory(currentHistoryFilter);
}
function renderHistory(filter){
    currentHistoryFilter = filter || currentHistoryFilter;
    const wrap = document.getElementById('historyList');
    if(!wrap) return;

    const tabs = {semua:'histTabSemua', belum:'histTabBelum', dp:'histTabDp', lunas:'histTabLunas'};
    Object.keys(tabs).forEach(key=>{
        const btn = document.getElementById(tabs[key]);
        if(!btn) return;
        btn.classList.toggle('btn-primary', key===currentHistoryFilter);
        btn.classList.toggle('btn-light', key!==currentHistoryFilter);
    });

    document.getElementById('historyCount').textContent = history.length ? `${history.length} nota tersimpan` : '';

    const badge = document.getElementById('navBadgeRiwayat');
    if(badge) badge.textContent = history.filter(h=>h.statusKey!=='lunas').length;

    let list = history.slice().sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0));
    if(currentHistoryFilter!=='semua') list = list.filter(h=>h.statusKey===currentHistoryFilter);

    const searchEl = document.getElementById('historySearch');
    const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
    if(q){
        list = list.filter(h=>
            (h.customerName||'').toLowerCase().includes(q) ||
            (h.customerPhone||'').toLowerCase().includes(q) ||
            (h.invoiceNumber||'').toLowerCase().includes(q) ||
            (h.projectName||'').toLowerCase().includes(q)
        );
    }

    if(list.length===0){
        wrap.innerHTML = `<div class="empty">${q ? 'Tidak ada nota yang cocok dengan pencarian "'+searchEl.value+'".' : 'Belum ada riwayat nota untuk kategori ini.'}</div>`;
        return;
    }

    wrap.innerHTML = list.map(rec=>{
        const st = getPaymentStatus(rec.sisa, rec.dp, rec.cart.length);
        const activeTag = rec.invoiceNumber===invoiceNumber ? ' <span style="color:var(--wood);font-weight:700">(sedang dibuka)</span>' : '';
        return `
        <div class="cart-item">
            <div class="cart-info">
                <div class="cart-name">${rec.customerName || '(tanpa nama)'} <span style="font-weight:400;color:var(--muted)">— ${rec.invoiceNumber}</span>${activeTag}</div>
                <div class="cart-detail">${rec.projectName || '-'} • ${rec.dateLabel} • ${rec.cart.length} item</div>
                <div class="cart-price">Total ${formatRupiah(rec.total)} &nbsp;•&nbsp; Sisa ${formatRupiah(rec.sisa)}</div>
                <div class="${st.cls}" style="margin-top:6px">${st.text}</div>
            </div>
            <div class="actions">
                <button class="btn-primary" onclick="openHistoryInvoice('${rec.invoiceNumber}')">Buka / Edit</button>
                <button class="btn-success" onclick="quickWhatsAppHistory('${rec.invoiceNumber}')">WA</button>
                <button class="btn-danger" onclick="deleteHistoryInvoice('${rec.invoiceNumber}')">Hapus</button>
            </div>
        </div>`;
    }).join('');
}
async function openHistoryInvoice(num){
    const rec = history.find(h=>h.invoiceNumber===num);
    if(!rec) return false;

    if(rec.invoiceNumber!==invoiceNumber){
        if(cart.length && !confirm('Buka nota '+num+'? Nota yang sedang aktif akan otomatis tersimpan ke Riwayat Nota sebelum berpindah.')) return false;
        await syncCurrentInvoiceToHistory();
    }

    invoiceNumber = rec.invoiceNumber;
    invoiceCreatedLabel = rec.dateLabel;
    isEditingHistory = true;
    cart = clone(rec.cart);
    cart.forEach(it=>{
        if(typeof it.sortOrder!=='number'){
            const meta = (it.raw && it.raw.productKey) ? PRODUCT_META[it.raw.productKey] : null;
            it.sortOrder = meta ? meta.order : 999;
        }
        if(typeof it.seq!=='number') it.seq = cartSeq++;
    });
    cartSeq = cart.reduce((m,it)=>Math.max(m, (it.seq||0)+1), cartSeq);
    sortCart();
    document.getElementById('customerName').value = rec.customerName || '';
    document.getElementById('customerPhone').value = rec.customerPhone || '';
    document.getElementById('customerAddress').value = rec.customerAddress || '';
    document.getElementById('projectName').value = rec.projectName || '';
    document.getElementById('diskonNominal').value = rec.diskonNominal || '';
    document.getElementById('diskonPersen').value = rec.diskonPersen || '';
    document.getElementById('dpAmount').value = rec.dpAmount || '';

    renderInvoiceHead(); renderCart(); updateSummary(); await saveState();
    renderHistory(currentHistoryFilter);
    showTab('nota');
    showToast('Nota '+num+' dibuka — silakan diedit / update status bayar');
    return true;
}
async function quickWhatsAppHistory(num){
    if(await openHistoryInvoice(num)) sendWhatsApp();
}
async function deleteHistoryInvoice(num){
    if(!confirm('Hapus riwayat nota '+num+'? Data nota ini tidak bisa dikembalikan lagi.')) return;
    history = history.filter(h=>h.invoiceNumber!==num);
    await saveHistory();
    renderHistory(currentHistoryFilter);
    showToast('Riwayat nota '+num+' dihapus');
}

/* ---------------- NOTA BARU / SELESAI EDIT / STATE ---------------- */
async function resetForNewCustomer(){
    cart = [];
    ['customerName','customerPhone','customerAddress','projectName','diskonNominal','diskonPersen','dpAmount'].forEach(id=>{
        document.getElementById(id).value = '';
    });
    invoiceNumber = '';
    invoiceCreatedLabel = '';
    isEditingHistory = false;
    hideAllFinishEditRows();
    editingItemPrefix = null;
    renderInvoiceHead(); renderCart(); updateSummary(); await saveState();
    renderHistory(currentHistoryFilter);
}
async function notaBaru(){
    if(cart.length){
        await syncCurrentInvoiceToHistory();
        if(!confirm('Nota pelanggan saat ini sudah otomatis tersimpan di Riwayat Nota (bisa dibuka lagi kapan saja). Buat nota baru untuk pelanggan berikutnya?')) return;
    }
    await resetForNewCustomer();
    showToast('Form nota baru siap. Nomor nota dibuat otomatis saat item pertama ditambahkan, jadi urutannya tetap rapi.');
    showTab('pelanggan');
}
async function selesaiEdit(){
    await syncCurrentInvoiceToHistory();
    await resetForNewCustomer();
    showToast('Edit selesai — nota tersimpan. Form siap untuk pelanggan berikutnya.');
    showTab('pelanggan');
}

async function saveState(){
    const state = {
        cart, invoiceNumber, invoiceCreatedLabel, isEditingHistory,
        customerName: document.getElementById('customerName').value,
        customerPhone: document.getElementById('customerPhone').value,
        customerAddress: document.getElementById('customerAddress').value,
        projectName: document.getElementById('projectName').value,
        diskonNominal: document.getElementById('diskonNominal').value,
        diskonPersen: document.getElementById('diskonPersen').value,
        dpAmount: document.getElementById('dpAmount').value
    };
    appDataCache.draft = state;
    await apiRequest('PUT', '/api/data', { draft: state });
    await syncCurrentInvoiceToHistory();
}
function loadState(){
    const s = appDataCache.draft;
    if(s){
        try{
            cart = s.cart || [];
            // Migrasi: item lama (sebelum fitur urutan tetap) mungkin belum
            // punya sortOrder/seq/raw.productKey — beri nilai default aman
            // supaya tetap tampil, meski tidak bisa diedit langsung.
            cart.forEach(it=>{
                if(typeof it.sortOrder!=='number'){
                    const meta = (it.raw && it.raw.productKey) ? PRODUCT_META[it.raw.productKey] : null;
                    it.sortOrder = meta ? meta.order : 999;
                }
                if(typeof it.seq!=='number') it.seq = cartSeq++;
            });
            cartSeq = cart.reduce((m,it)=>Math.max(m, (it.seq||0)+1), cartSeq);
            sortCart();
            invoiceNumber = s.invoiceNumber || '';
            invoiceCreatedLabel = s.invoiceCreatedLabel || '';
            isEditingHistory = !!s.isEditingHistory;
            document.getElementById('customerName').value = s.customerName||'';
            document.getElementById('customerPhone').value = s.customerPhone||'';
            document.getElementById('customerAddress').value = s.customerAddress||'';
            document.getElementById('projectName').value = s.projectName||'';
            document.getElementById('diskonNominal').value = s.diskonNominal||'';
            document.getElementById('diskonPersen').value = s.diskonPersen||'';
            document.getElementById('dpAmount').value = s.dpAmount||'';
        }catch(e){ cart = []; invoiceNumber = ''; invoiceCreatedLabel = ''; isEditingHistory = false; }
    }
    // Tidak ada pembuatan nomor nota di sini — nota kosong/baru baru dapat
    // nomornya saat item pertama benar-benar ditambahkan (lihat addToCart),
    // supaya urutan nomor di Riwayat Nota tidak ada yang bolong.
}

/* ---------------- APP BOOTSTRAP ---------------- */
async function bootApp(){
    if(window._appBooted) return;
    window._appBooted = true;
    await loadAppData();
    loadPrices();
    loadHistory();
    loadState();
    renderInvoiceHead();
    renderCart();
    updateSummary();
    renderHistory('semua');
    wireLivePreview();
    wirePriceAutoSave();
    renderCustomTables();
    renderCustomProducts();
    renderPointsCatalog();
    ['customerName','customerPhone','customerAddress','projectName','diskonNominal','diskonPersen','dpAmount'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', saveState);
    });
    showTab(isEditingHistory ? 'nota' : (appDataCache.activeTab || 'pelanggan'));
    updateEditBanner();
    setInterval(renderInvoiceHead, 1000);
}

document.addEventListener('DOMContentLoaded', async ()=>{
    const authed = await initAuth();
    if(authed) bootApp();
});
