/* Kiểm kho iSOFH – web app (GitHub Pages) · dữ liệu lưu ở Supabase */
'use strict';
const APP_VER = '4.1.2';
const $ = id => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem('kk_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('kk_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('kk_' + k); } catch (e) {} },
};
let DVT_LIST = ['Viên', 'Gói', 'Ống', 'Chai', 'Lọ', 'Tuýp', 'Hộp', 'Vỉ', 'Miếng', 'Cái', 'Bịch', 'Túi', 'Tép', 'Que', 'Bộ', 'Hũ', 'Bình', 'Can', 'Máy', 'Cuộn', 'Đôi', 'Liều'];
let KHO_TEN = { CHAN: 'CHẴN', LE: 'LẺ' };          // defaults until the server sends S.user.khos / dvt (see applyUserConfig)
const TT_TEN = { CONG_THEM: 'Cộng thêm', DEM_LAI_HOC: 'Đếm lại hộc', DON_LO: 'Dồn cả lô', GOP_LO: 'Gộp lô', THUOC_MOI: 'Thuốc mới',
  BO_SUNG_CONG_THEM: 'Bổ sung (cộng)', BO_SUNG_DEM_LAI_HOC: 'Bổ sung (đếm lại hộc)', BO_SUNG_DON_LO: 'Bổ sung (dồn lô)' };
const ST_TEN = { HIEU_LUC: 'Đã lưu', THAY_THE: 'Đã bị thay', HUY: 'Đã huỷ', CHO_DUYET: 'Chờ duyệt', TU_CHOI: 'Từ chối',
  pending: 'Chờ gửi', sending: 'Đang gửi', need: 'Cần xử lý', error: 'Lỗi', done: 'Đã lưu' };


// ---- Biểu tượng (Lucide, giấy phép ISC) ----
const ICON = {
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  merge: '<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  diff: '<path d="M12 3v14"/><path d="M5 10h14"/><path d="M5 21h14"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
};
const ico = (n, cls) => `<svg class="i${cls ? ' ' + cls : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`;

const S = { pin: LS.get('pin', ''), user: LS.get('user', null), kho: LS.get('kho', ''), hoc: LS.get('hoc', ''),
  dm: [], dmMap: {}, gtinMap: {}, drug: null, lines: [], lineCache: {}, lotSel: null, lotLocked: false,
  trangThai: LS.get('trangThai', {}), scanGtin: '', pendingScan: null,
  dot: LS.get('dot', ''), dotInfo: LS.get('dotInfo', null), dots: LS.get('dots', []) };
let Q = LS.get('queue', []);
/** Kho names, unit list and the lot/HSD thresholds come from the server (kk.a_login); keep the defaults when an old cached user lacks them. */
function applyUserConfig() {
  const u = S.user || {};
  if (Array.isArray(u.khos) && u.khos.length) KHO_TEN = Object.fromEntries(u.khos.map(k => [k.ma, k.tenNgan]));
  if (Array.isArray(u.dvt) && u.dvt.length) DVT_LIST = u.dvt;
  const nd = $('nDvt'), keep = nd.value; nd.innerHTML = '';
  DVT_LIST.forEach(v => { const o = document.createElement('option'); o.value = o.textContent = v; nd.appendChild(o); });
  if (DVT_LIST.includes(keep)) nd.value = keep;
}

// ===================================================================== tiện ích
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Only link to Google Docs/Drive over https; anything else (javascript:, other hosts) is dropped.
const safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' && /^(docs|drive)\.google\.com$/.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase();
const loKey = s => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/^[.\-_#:]+|[.\-_#:]+$/g, '');
const hocKey = s => String(s || '').toUpperCase().trim().replace(/\s+/g, ' ');
const numv = id => { const v = $(id).value.trim().replace(',', '.'); return v === '' ? '' : Number(v); };
const fmtN = n => (Math.round(Number(n || 0) * 1000) / 1000).toLocaleString('vi-VN');
const pad2 = n => ('0' + n).slice(-2);
const fmtDate = d => pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const canAll = () => S.user && (S.user.role === 'TO_TRUONG' || S.user.role === 'IT');
const isIT = () => S.user && S.user.role === 'IT';
function parseHsd(s, monthMode) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{4})$/)) && (monthMode || true)) { const mo = +m[1]; if (mo >= 1 && mo <= 12) return new Date(+m[2], mo, 0); return null; }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    let y = +m[3]; if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (d.getMonth() !== +m[2] - 1 || y < 2000 || y > 2100) return null;
    return d;
  }
  return null;
}
const loNghiWords = () => Array.isArray(S.user && S.user.loNghi) ? S.user.loNghi : ['MFG', 'MFD', 'NSX', 'EXP', 'HSD', 'LOT', 'BATCH'];
const hsdCanhBao = () => { const n = Number(S.user && S.user.hsdCanhBao); return n > 0 ? n : 90; };
function loNghi(lo) {
  if (!lo) return '';
  const words = loNghiWords().filter(Boolean).map(w => String(w).replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'));
  const m = words.length ? lo.match(new RegExp(words.join('|'), 'i')) : null; if (m) return 'Số lô có chữ "' + m[0] + '" – có thể đọc nhầm dòng ngày SX/HSD';
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(lo)) return 'Số lô trông giống ngày tháng';
  if (loKey(lo).length < 3) return 'Số lô quá ngắn';
  return '';
}

function toast(msg, cls, btn, ms) {
  const t = $('toast'); t.className = 'toast ' + (cls || ''); t.innerHTML = ico(cls === 'bad' ? 'error' : cls === 'ok' ? 'check' : 'info') + '<span>' + esc(msg) + '</span>';
  if (btn) { const b = document.createElement('button'); b.textContent = btn.text; b.onclick = () => { t.classList.add('hidden'); btn.fn(); }; t.appendChild(b); }
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms || (btn ? 6000 : 2600));
}
function flash(id) { const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

/** Hộp thoại: buttons [{text, cls, value}] → Promise(value) */
function ask(title, bodyHtml, buttons) {
  return new Promise(res => {
    $('mTitle').textContent = title; $('mBody').innerHTML = bodyHtml || '';
    const box = $('mBtns'); box.innerHTML = '';
    (buttons || [{ text: 'OK', cls: 'primary', value: true }]).forEach(b => {
      const el = document.createElement('button'); el.className = 'btn big ' + (b.cls || ''); el.innerHTML = (b.icon ? ico(b.icon) : '') + esc(b.text);
      el.onclick = () => { if (b.check && !b.check()) return; $('modal').classList.add('hidden'); res(typeof b.value === 'function' ? b.value() : b.value); };
      box.appendChild(el);
    });
    $('modal').classList.remove('hidden');
  });
}

// ===================================================================== API
async function api(action, data, timeout) {
  const c = window.KK_CONFIG || {}, key = c.SUPABASE_KEY || '';
  if (!c.SUPABASE_URL || !key) throw Object.assign(new Error('Chưa cấu hình máy chủ'), { isNet: true });   // keeps the queue pending
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;                                      // legacy JWT anon key only
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout || 30000);
  let r;
  try {
    r = await fetch(c.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/api', { method: 'POST', signal: ctl.signal, headers,
      body: JSON.stringify({ req: Object.assign({ action: action, pin: S.pin, dot: S.dot }, data || {}) }) });
  } catch (e) {
    throw Object.assign(new Error(e.name === 'AbortError' ? 'Mạng chậm – quá thời gian chờ' : 'Không kết nối được máy chủ'), { isNet: true });
  } finally { clearTimeout(t); }
  if (r.status >= 500) throw Object.assign(new Error('Không kết nối được máy chủ'), { isNet: true });      // incl. a paused project
  let j = null; try { j = JSON.parse(await r.text()); } catch (e) {}
  if (r.ok && j !== null) return j;
  throw new Error((j && j.message) || 'Máy chủ trả về không đúng');
}

// ===================================================================== DANH MỤC
function setDm(list) {
  S.dm = list.map(r => {
    const o = { ma: r[0], ten: r[1], dvtn: r[2], qc: r[3] === '' ? '' : Number(r[3]) || '', dvt: r[4], kho: r[5] || '', gtin: r[6] || '' };
    o.key = norm(o.ma + ' ' + o.ten); o.keyNs = o.key.replace(/[^A-Z0-9]/g, '');
    return o;
  });
  S.dmMap = {}; S.gtinMap = {};
  S.dm.forEach(o => { S.dmMap[o.ma] = o; String(o.gtin).split(/[\s;,]+/).filter(Boolean).forEach(g => S.gtinMap[g.padStart(14, '0')] = o); });
}
async function loadDm(force) {
  const cached = LS.get('dm', null);
  if (cached && !S.dm.length) setDm(cached.list);
  try {
    const r = await api('danhMuc', { v: force ? '' : cached && cached.v });
    if (r.ok && !r.same) { LS.set('dm', { v: r.v, list: r.list }); setDm(r.list); }
  } catch (e) { if (!S.dm.length) toast('Chưa tải được danh mục: ' + e.message, 'bad'); }
}
function search(q) {
  const toks = norm(q).split(/\s+/).filter(Boolean); if (!toks.length) return [];
  const qn = norm(q).replace(/[^A-Z0-9]/g, '');
  const res = [];
  for (const o of S.dm) {
    if (toks.every(t => o.key.includes(t)) || (qn.length >= 4 && o.keyNs.includes(qn))) {
      let score = 0;
      if (norm(o.ma) === norm(q).trim()) score += 100;
      if (o.key.startsWith(toks[0]) || norm(o.ten).startsWith(toks[0])) score += 10;
      if (o.kho && o.kho !== S.kho) score -= 5;
      res.push([score, o]);
    }
  }
  return res.sort((a, b) => b[0] - a[0]).slice(0, 12).map(x => x[1]);
}

// ===================================================================== ĐĂNG NHẬP
async function doLogin() {
  const pin = $('pin').value.trim();
  if (!pin) { $('loginMsg').textContent = 'Nhập mã PIN'; return; }
  $('btnLogin').disabled = true; $('loginMsg').className = 'msg'; $('loginMsg').textContent = 'Đang kiểm tra…';
  S.pin = pin;
  try {
    const r = await api('login');
    if (!r.ok) throw new Error(r.error);
    LS.set('pin', pin); applyLogin(r);
    $('pin').value = ''; $('loginMsg').textContent = '';
    await enterMain();
  } catch (e) { $('loginMsg').textContent = e.message; S.pin = ''; }
  finally { $('btnLogin').disabled = false; }
}
function logout() {
  if (Q.some(x => x.state !== 'done')) { toast('Còn dòng chưa gửi xong – đợi có mạng rồi mới đăng xuất', 'bad'); return; }
  LS.del('pin'); LS.del('user'); S.pin = ''; S.user = null; location.reload();
}
/** Nhận kết quả đăng nhập: tài khoản + danh sách đợt + (nếu có) thông tin đợt đang chọn */
function applyLogin(r) {
  S.user = r; LS.set('user', r);
  S.dots = r.dots || []; LS.set('dots', S.dots);
  if (r.dotInfo) setDot(r.dotInfo);
  else if (S.dot) { S.dotInfo = null; LS.set('dotInfo', null); }
  applyUserConfig(); renderHeader(); $('tabQl').classList.toggle('hidden', !canAll());
}
const dotOk = () => S.dotInfo && S.dotInfo.id === S.dot && S.dots.some(d => d.id === S.dot);
const khoOfDot = () => (S.dotInfo && S.dotInfo.kho) || Object.keys(KHO_TEN);
async function enterMain() {
  $('login').classList.add('hidden'); $('main').classList.remove('hidden');
  renderHeader(); renderSync();
  $('tabQl').classList.toggle('hidden', !canAll());
  await loadDm();
  if (!dotOk() && !(await chooseDot(true))) return;
  if (!S.kho || !khoOfDot().includes(S.kho)) await chooseKho(true);
  if (!S.hoc) await chooseHoc();
  refreshProg(); qRun();
  setTimeout(() => { const a = document.activeElement; if (!a || !/INPUT|SELECT|TEXTAREA/.test(a.tagName)) $('q').focus(); }, 200);   // không giật con trỏ khi đang gõ
}
async function revalidate() {               // mở app lại khi đã đăng nhập: kiểm tra PIN còn đúng (không chặn khi mất mạng)
  try {
    const r = await api('login');
    if (r.ok) { applyLogin(r); if (!dotOk()) await chooseDot(true); }
    else if (/PIN|khoá/i.test(r.error || '')) { LS.del('pin'); LS.del('user'); toast(r.error, 'bad'); setTimeout(() => location.reload(), 1500); }
  } catch (e) {}
}

// ===================================================================== HEADER / KHO / HỘC
function renderHeader() {
  $('btnKho').innerHTML = '<span class="hide-xs">Kho </span>' + esc(KHO_TEN[S.kho] || '?');
  $('btnHoc').innerHTML = ico('pin') + (S.hoc ? '<span class="hide-xs">Hộc&nbsp;</span><span class="truncate">' + esc(S.hoc) + '</span>' : 'Chọn hộc!');
  $('btnHoc').classList.toggle('empty', !S.hoc);
  $('who').innerHTML = (S.dotInfo ? ico('calendar') + '<b>' + esc(S.dotInfo.ten) + '</b> · ' : '') + esc(S.user ? S.user.ten : '');
  $('dongBanner').classList.toggle('hidden', !(S.dotInfo && S.dotInfo.st === 'DONG'));
  $('hocBarTxt').innerHTML = S.hoc ? 'Đang đếm hộc <b>' + esc(S.hoc) + '</b>' : 'Chưa chọn hộc';
  $('btnXongHoc').classList.toggle('hidden', !S.hoc);
  $('tapBanner').classList.toggle('hidden', !(S.user && S.user.tap));
  const chot = S.trangThai && S.trangThai[S.kho] === 'DA_CHOT';
  $('chotBanner').classList.toggle('hidden', !chot);
  $('lLyDo').textContent = chot ? 'Lý do bổ sung *' : 'Ghi chú';
  $('lyDo').placeholder = chot ? 'VD: tìm thấy thêm trong thùng ở kệ D4' : '(không bắt buộc)';
}
/** Chọn đợt kiểm. auto=true: chỉ có 1 đợt đang mở thì vào luôn. Trả về true nếu đã có đợt. */
function chooseDot(auto) {                    // không mở 2 hộp thoại chọn đợt cùng lúc
  if (!chooseDot.p) chooseDot.p = chooseDot0(auto).finally(() => { chooseDot.p = null; });
  return chooseDot.p;
}
async function chooseDot0(auto) {
  const open = S.dots.filter(d => d.st === 'MO'), list = canAll() ? S.dots : open;
  let id;
  if (auto && open.length === 1) id = open[0].id;
  else if (!list.length) {
    const v = await ask('Chưa có đợt kiểm nào đang mở', isIT() ? '<p>Tạo đợt mới ở tab <b>Quản lý → Đợt kiểm</b>.</p>' : '<p>Báo IT mở đợt kiểm, rồi bấm <b>Thử lại</b>.</p>',
      (isIT() ? [{ text: 'Tạo đợt mới', icon: 'plus', cls: 'primary', value: 'new' }] : []).concat([{ text: 'Thử lại', icon: 'refresh', cls: isIT() ? 'ghost' : 'primary', value: 'retry' },
        { text: 'Đăng xuất', icon: 'logout', cls: 'ghost', value: 'out' }]));
    if (v === 'new') { switchTab('ql'); return false; }
    if (v === 'out') { logout(); return false; }
    try { const r = await api('login'); if (r.ok) applyLogin(r); } catch (e) { toast(e.message, 'bad'); }
    return dotOk() || chooseDot0(true);
  } else {
    id = await ask('Chọn đợt kiểm', '<p class="muted">Số đếm được ghi vào đợt bạn chọn. Đổi lại được ở ☰ → Đổi đợt kiểm.</p>',
      list.map(d => ({ text: d.ten + (d.st === 'DONG' ? ' (đã đóng – chỉ xem)' : '') + ' · ' + d.kho.map(k => KHO_TEN[k]).join('+'), icon: d.st === 'DONG' ? 'lock' : 'calendar',
        cls: d.id === S.dot ? 'primary' : 'ghost', value: d.id })).concat(dotOk() ? [{ text: 'Đóng', cls: 'ghost', value: '' }] : []));
    if (!id) return dotOk();
  }
  if (id === S.dot && dotOk()) return true;
  try {
    const r = await api('login', { dot: id }); if (!r.ok) throw new Error(r.error);
    applyLogin(r); if (!r.dotInfo) throw new Error('Không mở được đợt này');
  } catch (e) { toast((e.isNet ? 'Cần có mạng để đổi đợt: ' : '') + e.message, 'bad', null, 5000); return dotOk(); }
  if (!S.kho || !khoOfDot().includes(S.kho)) await chooseKho(true);
  if (!S.hoc) chooseHoc();
  refreshProg(); toast('Đang ở đợt: ' + S.dotInfo.ten, 'ok');
  if (!$('tab-ql').classList.contains('hidden')) loadQl();
  return true;
}
function setDot(d) {
  if (d.id !== S.dot) {
    S.dot = d.id; LS.set('dot', d.id); S.lineCache = {}; S.hoc = ''; LS.set('hoc', '');
    if (S.drug) clearDrug();
    if (S.kho && !d.kho.includes(S.kho)) { S.kho = ''; LS.set('kho', ''); }
  }
  S.dotInfo = d; LS.set('dotInfo', d);
  S.trangThai = d.trangThai || {}; LS.set('trangThai', S.trangThai);
}
async function chooseKho(auto) {
  const ks = khoOfDot();
  let v;
  if (ks.length === 1) { v = ks[0]; if (!auto && S.kho === v) toast('Đợt này chỉ kiểm kho ' + KHO_TEN[v]); }
  else v = await ask('Đang kiểm kho nào?', '<p class="muted">Chọn đúng kho đang đứng đếm. Đổi lại được bằng nút Kho ở trên.</p>',
    ks.map((k, i) => ({ text: 'Kho ' + KHO_TEN[k], icon: i % 2 ? 'pill' : 'box', cls: i ? 'ghost' : 'primary', value: k })));
  if (v !== S.kho) { S.kho = v; LS.set('kho', v); S.lineCache = {}; if (S.drug) selectDrug(S.drug.ma); if (S.hoc) { S.hoc = ''; LS.set('hoc', ''); renderHeader(); chooseHoc(); } }
  renderHeader(); refreshProg();
}
const HOC_ST_TEN = { CHUA_NHAN: 'Chưa ai nhận', DANG_DEM: 'Đang đếm', XONG: 'Đã xong' };
async function chooseHoc() {
  const recent = LS.get('hocs', []);
  const chip = x => `<button class="hocchip ${esc(x.st || '')}" data-h="${esc(x.hoc)}"><b>${esc(x.hoc)}</b>${x.st ? `<span>${x.st === 'XONG' ? 'xong · ' + esc(x.nguoiXong || '') : x.st === 'DANG_DEM'
    ? esc((x.nguoiDem && x.nguoiDem.length ? x.nguoiDem : String(x.nguoi || '').split(', ')).filter(Boolean).join(', ') || 'đang đếm') + (x.soDong ? ' · ' + x.soDong + ' dòng' : '') : 'chưa ai nhận'}</span>` : ''}</button>`;
  const bindChips = () => document.querySelectorAll('#mBody [data-h]').forEach(b => b.onclick = () => { $('hocIn').value = b.dataset.h; $('mBtns').firstChild.click(); });
  const recentHtml = recent.length ? '<div class="muted small mb-1.5 mt-3">Gần đây</div><div class="flex flex-wrap gap-1.5">' + recent.map(h => chip({ hoc: h })).join('') + '</div>' : '';
  const body = `<div class="field mb-0"><label>Gõ tên hộc / kệ / vị trí, hoặc bấm chọn bên dưới</label><input id="hocIn" value="${esc(S.hoc)}" placeholder="VD: A3, Kệ D1, Thùng 2" autocomplete="off" autocapitalize="characters"></div>
    <div id="hocLists"><div class="muted small mt-3">Đang tải danh sách hộc…</div>${recentHtml}</div>`;
  setTimeout(() => {
    const inp = $('hocIn'); if (!inp) return; inp.focus(); inp.select(); bindChips();
    inp.onkeydown = e => { if (e.key === 'Enter') $('mBtns').firstChild.click(); };
  }, 30);
  api('dsHoc', { kho: S.kho }, 10000).then(ds => {
    const box = $('hocLists'); if (!box || !ds.ok) return;
    let lists = '';
    ['CHUA_NHAN', 'DANG_DEM', 'XONG'].forEach(st => { const l = ds.list.filter(x => x.st === st); if (l.length)
      lists += `<div class="muted small mb-1.5 mt-3">${HOC_ST_TEN[st]} (${l.length})</div><div class="flex flex-wrap gap-1.5">${l.map(chip).join('')}</div>`; });
    box.innerHTML = lists || recentHtml; bindChips();
  }).catch(() => { const box = $('hocLists'); if (box) box.innerHTML = recentHtml; bindChips(); });
  const v = await ask('Chọn hộc để đếm · kho ' + KHO_TEN[S.kho], body, [{ text: 'Bắt đầu đếm hộc này', icon: 'pin', cls: 'primary', value: () => hocKey($('hocIn').value),
    check: () => { if (!hocKey($('hocIn').value)) { $('hocIn').focus(); return false; } return true; } }]);
  try {
    const r = await api('nhanHoc', { kho: S.kho, hoc: v }, 10000);
    if (r.ok && r.daXong) {
      const re = await ask('Hộc ' + v + ' đã đếm xong', `<p><b>${esc(r.hoc.nguoiXong || '')}</b> đã báo xong lúc ${esc(r.hoc.xongLuc || '')}.</p><p>Chỉ mở lại khi phát hiện còn hàng chưa đếm.</p>`,
        [{ text: 'Mở lại và đếm tiếp', icon: 'unlock', cls: 'primary', value: true }, { text: 'Chọn hộc khác', cls: 'ghost', value: false }]);
      if (!re) return chooseHoc();
      await api('nhanHoc', { kho: S.kho, hoc: v, moLai: true }, 10000);
    }
  } catch (e) {}
  S.hoc = v; LS.set('hoc', v);
  LS.set('hocs', [v].concat(recent.filter(x => x !== v)).slice(0, 12));
  renderHeader(); if (S.drug) renderAll();
}
async function xongHoc() {
  if (!S.hoc) return chooseHoc();
  const mine = Q.filter(x => x.state !== 'done' && (x.payload.dot || S.dot) === S.dot && x.payload.kho === S.kho && hocKey(x.payload.hoc) === S.hoc);
  if (mine.some(x => x.state === 'need' || x.state === 'error')) { toast('Hộc này còn dòng cần xử lý – xem tab "Của tôi"', 'bad', { text: 'Xem', fn: () => switchTab('toi') }); return; }
  const ok = await ask('Đã đếm hết hộc ' + S.hoc + '?', `<p>Kiểm tra lần cuối: mọi hàng trong hộc đã nhập, kể cả <b>thùng, góc khuất, hàng xếp sau</b>.</p>
    ${mine.length ? '<p>Còn ' + mine.length + ' dòng đang chờ gửi – máy sẽ gửi trước.</p>' : ''}`,
    [{ text: 'Xong hộc ' + S.hoc, icon: 'check', cls: 'primary', value: true }, { text: 'Chưa, đếm tiếp', cls: 'ghost', value: false }]);
  if (!ok) return;
  if (mine.length) { await qRun(); if (Q.some(x => x.state !== 'done' && (x.payload.dot || S.dot) === S.dot && x.payload.kho === S.kho && hocKey(x.payload.hoc) === S.hoc)) { toast('Chưa gửi được hết dòng của hộc này – đợi có mạng rồi bấm lại', 'bad'); return; } }
  try {
    const r = await api('xongHoc', { kho: S.kho, hoc: S.hoc }); if (!r.ok) throw new Error(r.error);
    toast('Đã xong hộc ' + S.hoc + ' · ' + r.soDong + ' dòng', 'ok');
    clearDrug(); S.hoc = ''; LS.set('hoc', ''); renderHeader(); chooseHoc();
  } catch (e) { toast((e.isNet ? 'Cần có mạng: ' : '') + e.message, 'bad'); }
}
async function refreshProg() {
  if (!S.kho || !dotOk()) return;
  try {
    const r = await api('tienDo', { kho: S.kho });
    if (r.ok) {
      $('prog').textContent = `Kho ${KHO_TEN[S.kho]}: ${r.soMa} mã · ${r.soDong} dòng` + (r.choDuyet ? ` · ${r.choDuyet} chờ duyệt` : '');
      if (S.trangThai[S.kho] !== r.trangThai) { S.trangThai[S.kho] = r.trangThai; LS.set('trangThai', S.trangThai); renderHeader(); if (S.drug) renderAll(); }
    }
  } catch (e) { $('prog').textContent = 'Đang ngoại tuyến'; }
}

// ===================================================================== TÌM / CHỌN THUỐC
function renderResults() {
  const q = $('q').value;
  const list = q.trim() ? search(q) : [];
  $('results').innerHTML = list.map(o => `<div class="res${o.kho && o.kho !== S.kho ? ' other' : ''}" data-ma="${esc(o.ma)}">
      <b>${esc(o.ten)}</b><div class="ma">${esc(o.ma)} · ${esc(o.dvtn ? o.dvtn + ' ' + (o.qc || '') + ' ' + o.dvt : o.dvt)}${o.kho && o.kho !== S.kho ? ' · <span class="text-amber-700">thuộc kho ' + esc(KHO_TEN[o.kho]) + '</span>' : ''}</div></div>`).join('')
    + (q.trim().length >= 2 ? `<div class="res other" data-new="1"><b class="flex items-center gap-1.5">${ico('plus')} Không thấy? Báo thuốc chưa có trong danh mục</b><div class="ma">Gửi IT duyệt, số lượng vẫn được giữ</div></div>` : '');
  $('card').classList.toggle('hidden', !!q.trim() || !S.drug);
  $('hint').classList.toggle('hidden', !!S.drug || !!q.trim());
}
$('results').addEventListener('click', e => {
  const el = e.target.closest('.res'); if (!el) return;
  if (el.dataset.new) { $('nTen').value = $('q').value.trim(); switchTab('moi'); $('q').value = ''; renderResults(); return; }
  selectDrug(el.dataset.ma);
});

async function selectDrug(ma, keepLot) {
  const d = S.dmMap[ma]; if (!d) return;
  if (!S.drug || S.drug.ma !== ma) { S.scanGtin = S.scanGtin && S.pendingScan ? S.scanGtin : ''; }
  S.drug = d; $('q').value = ''; $('results').innerHTML = '';
  if (!keepLot) { S.lotSel = null; S.lotLocked = false; $('lo').value = ''; $('hsd').value = ''; $('khongLo').checked = false; }
  ['hop', 'le', 'lyDo'].forEach(id => $(id).value = '');
  S.lines = S.lineCache[S.kho + '|' + ma] || [];
  setupQty(); renderAll();
  $('card').classList.remove('hidden'); $('hint').classList.add('hidden');
  $('card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (S.pendingScan) { const p = S.pendingScan; S.pendingScan = null; applyLotFromScan(p.lot, p.exp); }
  await fetchLines();
}
async function fetchLines() {
  if (!S.drug) return;
  const ma = S.drug.ma, kho = S.kho;
  $('dTotal').textContent = '(đang tải…)';
  try {
    const r = await api('xemThuoc', { kho: kho, ma: ma });
    if (!r.ok) throw new Error(r.error);
    S.lineCache[kho + '|' + ma] = r.lines;
    if (S.drug && S.drug.ma === ma && S.kho === kho) { S.lines = r.lines; S.khac = r.khac; renderAll(); }
  } catch (e) { $('dTotal').textContent = '(ngoại tuyến – hiện số đã lưu trên máy)'; }
}
function clearDrug() { S.drug = null; S.lotSel = null; S.scanGtin = ''; $('card').classList.add('hidden'); $('hint').classList.remove('hidden'); $('q').focus(); }

function setupQty() {
  const d = S.drug;
  const sel = $('dvt'); sel.innerHTML = '';
  const lineDvt = (S.lines.find(l => l.st === 'HIEU_LUC') || {}).dvt;
  const opts = [d.dvt, d.dvtn].concat(DVT_LIST).filter((v, i, a) => v && a.indexOf(v) === i);
  if (!d.dvt && !lineDvt) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Chọn…'; sel.appendChild(o); }
  opts.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v + (v === d.dvt ? ' ✓' : ''); sel.appendChild(o); });
  sel.value = lineDvt && opts.includes(lineDvt) ? lineDvt : (d.dvt || '');
  applyQtyLabels(true);
}
function applyQtyLabels(prefill) {
  const d = S.drug, dvt = $('dvt').value;
  const hasBox = d.dvtn && d.dvtn !== d.dvt && Number(d.qc) > 1 && dvt === d.dvt;
  if (hasBox) {
    $('fHop').classList.remove('hidden'); $('fQc').classList.remove('hidden');
    $('lHop').textContent = 'Số ' + d.dvtn.toLowerCase() + ' chưa bóc';
    $('lQc').textContent = '1 ' + d.dvtn.toLowerCase() + ' có mấy ' + dvt.toLowerCase();
    $('lLe').textContent = 'Số ' + dvt.toLowerCase() + ' lẻ';
    if (prefill || !$('qc').value) $('qc').value = d.qc;
  } else {
    const generic = dvt !== d.dvt;
    $('fHop').classList.toggle('hidden', !generic); $('fQc').classList.toggle('hidden', !generic);
    $('lHop').textContent = 'Số hộp chưa bóc'; $('lQc').textContent = '1 hộp có mấy ' + dvt.toLowerCase();
    $('lLe').textContent = generic ? 'Số ' + (dvt || 'lẻ').toLowerCase() + (dvt ? ' lẻ' : '') : 'Số lượng' + (dvt ? ' (' + dvt + ')' : '');
    if (prefill) { $('hop').value = ''; $('qc').value = ''; }
  }
}

// ===================================================================== LÔ
function lotGroups() {
  const g = {};
  const add = (l, pend) => {
    const k = loKey(l.lo); if (!k && !pend) return;
    const x = g[k] || (g[k] = { key: k, lo: l.lo, hsd: {}, total: 0, live: [], wait: [], pend: [] });
    if (l.hsd) x.hsd[l.hsd] = 1;
    if (pend) { x.pend.push(l); x.total += Number(l.sl) || 0; }
    else if (l.st === 'HIEU_LUC') { x.live.push(l); x.total += Number(l.sl) || 0; }
    else x.wait.push(l);
  };
  S.lines.forEach(l => add(l, false));
  Q.filter(it => it.state !== 'done' && it.payload.kho === S.kho && it.payload.ma === (S.drug && S.drug.ma))
    .forEach(it => add({ lo: it.payload.lo, hsd: it.payload.hsd, hoc: it.payload.hoc, sl: it.sl, dvt: it.payload.dvt, nguoi: S.user.ten, state: it.state }, true));
  return Object.values(g).sort((a, b) => a.key.localeCompare(b.key));
}
function renderLots() {
  const groups = lotGroups();
  const unit = $('dvt').value;
  const sum = groups.reduce((a, x) => a + x.total, 0);
  $('dTotal').textContent = groups.length ? `· ${fmtN(sum)} ${unit} / ${groups.length} lô` : '· chưa ai đếm';
  let h = groups.map(x => {
    const lines = x.live.map(l => `<div class="ln">${esc(l.hoc)}: <b>${fmtN(l.sl)} ${esc(l.dvt)}</b> · ${esc(l.nguoi)} <span class="muted">${esc(l.tg)}</span></div>`).join('')
      + x.pend.map(l => `<div class="ln pend">${ico('clock')} ${esc(l.hoc)}: <b>${fmtN(l.sl)} ${esc(l.dvt)}</b> · ${l.state === 'need' ? 'cần xử lý' : 'chờ gửi'}</div>`).join('')
      + x.wait.map(l => `<div class="ln wait">${esc(l.hoc)}: ${fmtN(l.sl)} ${esc(l.dvt)} · chờ IT duyệt</div>`).join('');
    return `<div class="lot${S.lotSel === x.key ? ' on' : ''}" data-k="${esc(x.key)}">
      <div class="l1"><span>Lô ${esc(x.lo)}</span><span>${fmtN(x.total)} ${esc((x.live[0] || x.pend[0] || {}).dvt || unit)}</span></div>
      <div class="l2">HSD ${esc(Object.keys(x.hsd).join(' / ') || '?')}${Object.keys(x.hsd).length > 1 ? ' · <span class="font-semibold text-red-600">2 HSD</span>' : ''}</div>${lines}</div>`;
  }).join('');
  h += `<div class="lot new${S.lotSel === 'NEW' ? ' on' : ''}" data-k="NEW">${ico('plus')}Lô mới (chưa có ở trên)</div>`;
  $('lots').innerHTML = h;
  if (!groups.length && S.lotSel == null) { S.lotSel = 'NEW'; $('lots').lastChild.classList.add('on'); }
  $('lotForm').classList.toggle('hidden', S.lotSel == null);
}
$('lots').addEventListener('click', e => {
  const el = e.target.closest('.lot'); if (!el) return;
  const k = el.dataset.k;
  $('khongLo').checked = k === loKey(defLo());
  if (k === 'NEW') { S.lotSel = 'NEW'; S.lotLocked = false; if (lotGroups().some(g => g.key === loKey($('lo').value))) { $('lo').value = ''; $('hsd').value = ''; } }
  else {
    const g = lotGroups().find(x => x.key === k); S.lotSel = k; S.lotLocked = true;
    $('lo').value = g.lo; $('hsd').value = Object.keys(g.hsd)[0] || ''; $('hsdMonth').checked = false;
  }
  renderAll();
  if (k === 'NEW') $('lo').focus(); else (($('fHop').classList.contains('hidden') ? $('le') : $('hop'))).focus();
});
const defLo = () => (S.user && S.user.loMacDinh) || 'KHONGLO';
const defHsd = () => (S.user && S.user.hsdMacDinh) || '31/12/2099';
function onKhongLo() {
  if ($('khongLo').checked) {
    const g = lotGroups().find(x => x.key === loKey(defLo()));
    S.lotSel = g ? g.key : 'NEW'; S.lotLocked = false;
    $('lo').value = defLo(); $('hsd').value = defHsd(); $('hsdMonth').checked = false;
  } else { S.lotSel = 'NEW'; S.lotLocked = false; $('lo').value = ''; $('hsd').value = ''; }
  renderAll();
}
function applyLotFromScan(lot, exp) {
  if (lot) {
    const g = lotGroups().find(x => x.key === loKey(lot));
    if (g) { S.lotSel = g.key; S.lotLocked = true; $('lo').value = g.lo; $('hsd').value = Object.keys(g.hsd)[0] || (exp ? fmtDate(exp) : ''); }
    else { S.lotSel = 'NEW'; S.lotLocked = false; $('lo').value = lot.toUpperCase(); if (exp) $('hsd').value = fmtDate(exp); }
    flash('lo');
  } else if (exp) { if (S.lotSel == null) S.lotSel = 'NEW'; $('hsd').value = fmtDate(exp); }
  if (exp) { $('hsdMonth').checked = false; flash('hsd'); }
  renderAll();
}

// ===================================================================== KIỂM TRA + NÚT LƯU
function curInput() {
  const hop = numv('hop'), qc = numv('qc'), le = numv('le');
  const hopHidden = $('fHop').classList.contains('hidden');
  const H = hopHidden ? '' : hop, QC = hopHidden ? '' : qc;
  const sl = (Number(H) || 0) * (Number(QC) || 0) + (Number(le) || 0);
  return { hop: H, qc: QC, le: le, sl: sl, lo: $('lo').value.trim().toUpperCase(), hsdStr: $('hsd').value.trim(), dvt: $('dvt').value, lyDo: $('lyDo').value.trim() };
}
function checks(inp) {
  const d = S.drug, errs = [], warns = [];
  const chot = S.trangThai[S.kho] === 'DA_CHOT';
  if (!S.hoc) errs.push('Chưa chọn hộc (bấm nút vàng ở trên)');
  if (S.lotSel == null) errs.push('Chọn 1 lô ở trên hoặc "+ Lô mới"');
  if (!inp.dvt) errs.push('Danh mục chưa có ĐVT – chọn ĐVT đếm (Chai, Lọ, Viên…)');
  const noQty = inp.hop === '' && inp.le === '';
  if (noQty) errs.push('Nhập số lượng');
  [inp.hop, inp.qc, inp.le].forEach(v => { if (v !== '' && (isNaN(v) || v < 0)) errs.push('Số lượng không hợp lệ'); });
  if (inp.hop > 0 && !(inp.qc > 0)) errs.push('Có số hộp thì phải nhập "1 hộp có mấy"');
  const hsd = inp.hsdStr ? parseHsd(inp.hsdStr) : null;
  if (inp.sl > 0 && !inp.lo) errs.push('Thiếu số lô');
  if (inp.sl > 0 && !hsd) errs.push(inp.hsdStr ? 'HSD sai dạng (dd/mm/yyyy)' : 'Thiếu HSD');
  if (chot && !inp.lyDo) errs.push('Kho đã chốt – ghi lý do bổ sung');
  if (d.kho && d.kho !== S.kho) warns.push('Danh mục ghi thuốc này thuộc kho ' + KHO_TEN[d.kho] + ' – bạn đang đếm kho ' + KHO_TEN[S.kho]);
  if (S.khac && Object.keys(S.khac).length) warns.push('Kho khác đã có: ' + Object.keys(S.khac).map(k => KHO_TEN[k] + ' ' + fmtN(S.khac[k])).join(', '));
  if (inp.hop > 0 && d.qc && inp.dvt === d.dvt && Number(inp.qc) !== Number(d.qc)) warns.push(`"1 ${(d.dvtn || 'hộp').toLowerCase()} có mấy" = ${inp.qc} khác danh mục (${d.qc}) – đọc lại trên vỏ hộp`);
  if (inp.dvt && d.dvt && inp.dvt !== d.dvt) warns.push('Đang đếm theo ' + inp.dvt + ', danh mục là ' + d.dvt);
  const g = S.lotSel && S.lotSel !== 'NEW' ? lotGroups().find(x => x.key === S.lotSel) : null;
  const lotDvt = g && (g.live[0] || g.pend[0] || {}).dvt;
  if (lotDvt && inp.dvt !== lotDvt) warns.push('Lô này đang ghi theo ' + lotDvt + ', bạn đang nhập ' + inp.dvt);
  const ln = loNghi(inp.lo); if (ln) warns.push(ln);
  if (hsd) { const days = (hsd - new Date()) / 864e5; if (days < 0) warns.push('HSD đã QUÁ HẠN'); else if (days < hsdCanhBao()) warns.push('HSD còn dưới ' + hsdCanhBao() + ' ngày'); }
  if (g && hsd && Object.keys(g.hsd).length && !g.hsd[fmtDate(hsd)]) warns.push('HSD khác với HSD đã ghi của lô (' + Object.keys(g.hsd).join(', ') + ')');
  if (!noQty && inp.sl === 0) warns.push('Số lượng = 0 (ghi nhận hết hàng)');
  return { errs: errs.filter((v, i, a) => a.indexOf(v) === i), warns: warns, hsd: hsd, g: g };
}
function renderAll() {
  if (!S.drug) return;
  const d = S.drug;
  $('dName').textContent = d.ten;
  $('dMeta').textContent = `${d.ma} · ${d.dvtn ? d.dvtn + ' ' + (d.qc || '') + ' ' + d.dvt : d.dvt}` + (S.scanGtin ? ' · mã vạch ' + S.scanGtin : '');
  $('dWarn').classList.toggle('hidden', !(d.kho && d.kho !== S.kho));
  $('dWarn').textContent = d.kho && d.kho !== S.kho ? `Thuốc này thuộc kho ${KHO_TEN[d.kho]}. Chỉ nhập nếu thực sự đang nằm ở kho ${KHO_TEN[S.kho]}.` : '';
  renderLots();
  const kl = $('khongLo').checked;
  $('lo').readOnly = !!S.lotLocked || kl; $('hsd').readOnly = !!S.lotLocked || kl; $('hsdMonth').disabled = kl;
  $('btnScan2d').disabled = kl; $('btnOcr').disabled = kl;
  $('lotUnlock').classList.toggle('hidden', !S.lotLocked || kl);
  const inp = curInput(), c = checks(inp);
  $('total').textContent = `${fmtN(inp.sl)} ${inp.dvt}`;
  const started = inp.hop !== '' || inp.le !== '' || inp.lyDo;            // chưa nhập gì thì chưa báo lỗi đỏ
  $('checks').innerHTML = (started ? c.errs.map(x => `<li class="e">${ico('error')}<span>${esc(x)}</span></li>`).join('') : '') + c.warns.map(x => `<li class="w">${ico('alert')}<span>${esc(x)}</span></li>`).join('');
  renderActions(inp, c);
}
function renderActions(inp, c) {
  const box = $('actions'); box.innerHTML = '';
  if (S.lotSel == null) return;
  const dis = c.errs.length > 0, u = inp.dvt, hoc = S.hoc, add = (cls, t, p, fn, disabled) => {
    const b = document.createElement('button'); b.className = 'act ' + cls; b.disabled = !!disabled;
    b.innerHTML = `<span class="t">${t}</span><span class="p">${p}</span>`; b.onclick = fn; box.appendChild(b);
  };
  if (S.lotSel === 'NEW' || !c.g) {
    const exists = lotGroups().find(x => x.key === loKey(inp.lo) && inp.lo);
    add('main', exists ? ico('plus') + 'Cộng vào lô ' + esc(inp.lo) : ico('save') + 'Lưu lô mới',
      `Lô ${esc(inp.lo || '?')} · HSD ${esc(inp.hsdStr || '?')} · hộc ${esc(hoc)}: <b>${fmtN(inp.sl)} ${esc(u)}</b>`, () => save('CONG_THEM'), dis);
    return;
  }
  const g = c.g, T = g.total, here = g.live.filter(l => hocKey(l.hoc) === hocKey(hoc)), H = here.reduce((a, l) => a + Number(l.sl || 0), 0);
  add('main', ico('plus') + 'Cộng thêm', `Lô ${esc(g.lo)}: ${fmtN(T)} → <b>${fmtN(T + inp.sl)}</b> ${esc(u)} · thêm ${fmtN(inp.sl)} ở hộc ${esc(hoc)}`, () => save('CONG_THEM'), dis);
  if (here.length) {
    const others = here.filter(l => l.tk !== S.user.tk);
    const allowed = !others.length || canAll();
    add('re', ico('rotate') + 'Đếm lại hộc ' + esc(hoc), allowed
      ? `Hộc ${esc(hoc)}: ${fmtN(H)} → <b>${fmtN(inp.sl)}</b> · tổng lô ${fmtN(T)} → <b>${fmtN(T - H + inp.sl)}</b> ${esc(u)}`
      : `Hộc này do ${esc(others.map(l => l.nguoi).join(', '))} đếm – chỉ người đó hoặc tổ trưởng được đếm lại`, () => save('DEM_LAI_HOC'), dis || !allowed || g.pend.length > 0);
  }
  if (canAll() && (g.live.length > 1 || (g.live.length === 1 && hocKey(g.live[0].hoc) !== hocKey(hoc)))) {
    add('don', ico('merge') + 'Dồn cả lô về hộc ' + esc(hoc), `Thay ${g.live.length} dòng (${fmtN(T)}) bằng <b>${fmtN(inp.sl)}</b> tại ${esc(hoc)} · tổng ${fmtN(T)} → <b>${fmtN(inp.sl)}</b> ${esc(u)} · cần lý do`,
      () => save('DON_LO'), dis || g.pend.length > 0);
  }
}

// ===================================================================== LƯU
async function save(thaoTac) {
  const d = S.drug, inp = curInput(), c = checks(inp);
  if (c.errs.length) { toast(c.errs[0], 'bad'); return; }
  const g = c.g;
  const payload = { dot: S.dot, kho: S.kho, ma: d.ma, lo: inp.lo, hsd: c.hsd ? fmtDate(c.hsd) : '', hoc: S.hoc, hop: inp.hop, qc: inp.qc, le: inp.le,
    dvt: inp.dvt, thaoTac: thaoTac, lyDo: inp.lyDo, reqId: uid(), gtin: S.scanGtin || '', khongLo: $('khongLo').checked };
  // --- xác nhận những chỗ dễ sai ---
  if (inp.hop > 0 && d.qc && inp.dvt === d.dvt && Number(inp.qc) !== Number(d.qc)) {
    const ok = await ask('Kiểm tra quy cách', `<p>Bạn nhập <b>1 ${esc((d.dvtn || 'hộp').toLowerCase())} = ${inp.qc} ${esc(inp.dvt)}</b>, danh mục ghi <b>${d.qc}</b>.</p><p>Tổng sẽ là <b>${fmtN(inp.sl)} ${esc(inp.dvt)}</b>. Đọc lại quy cách trên vỏ hộp.</p>`,
      [{ text: 'Đúng, vỏ hộp ghi ' + inp.qc, cls: 'primary', value: true }, { text: 'Sửa lại', value: false }]);
    if (!ok) { $('qc').focus(); return; }
  }
  if (d.kho && d.kho !== S.kho) {
    const ok = await ask('Thuốc của kho ' + KHO_TEN[d.kho], `<p>Danh mục ghi <b>${esc(d.ten)}</b> thuộc kho ${esc(KHO_TEN[d.kho])}. Bạn chắc chắn hàng này đang nằm ở kho ${esc(KHO_TEN[S.kho])}?</p>`,
      [{ text: 'Đúng, đang ở kho ' + KHO_TEN[S.kho], cls: 'primary', value: true }, { text: 'Huỷ', value: false }]);
    if (!ok) return;
  }
  if (inp.sl === 0) {
    const ok = await ask('Số lượng = 0', '<p>Ghi nhận lô này <b>hết hàng</b> (0)?</p>', [{ text: 'Đúng, hết hàng', cls: 'primary', value: true }, { text: 'Huỷ', value: false }]);
    if (!ok) return;
  }
  if (g && c.hsd && Object.keys(g.hsd).length && !g.hsd[fmtDate(c.hsd)]) {
    const ok = await ask('HSD khác', `<p>Lô <b>${esc(g.lo)}</b> đã ghi HSD <b>${esc(Object.keys(g.hsd).join(', '))}</b>, bạn nhập <b>${fmtDate(c.hsd)}</b>.</p><p>Xem lại vỏ hộp – cùng lô thường cùng HSD.</p>`,
      [{ text: 'Vỏ hộp ghi đúng ' + fmtDate(c.hsd), cls: 'primary', value: true }, { text: 'Sửa lại', value: false }]);
    if (!ok) return; payload.okHsd = true;
  }
  if (thaoTac === 'CONG_THEM' && g) {
    const here = g.live.filter(l => hocKey(l.hoc) === hocKey(S.hoc) && l.tk !== S.user.tk);
    if (here.length) {
      const allowRe = canAll();
      const v = await ask('Hộc này đã có người đếm lô này', `<div class="lots">${here.map(l => `<div class="lot"><div class="l1"><span>${esc(l.nguoi)} · ${esc(l.hoc)}</span><span>${fmtN(l.sl)} ${esc(l.dvt)}</span></div><div class="l2">${esc(l.tg)}</div></div>`).join('')}</div>
        <p>Bạn đang nhập thêm <b>${fmtN(inp.sl)} ${esc(inp.dvt)}</b>. Đây là hàng <b>KHÁC</b> (chưa ai đếm) hay bạn <b>đếm lại</b> đúng chỗ hàng đó?</p>`,
        [{ text: 'Hàng khác – cộng thêm', icon: 'plus', cls: 'primary', value: 'add' }].concat(allowRe ? [{ text: 'Đếm lại – thay số cũ', icon: 'rotate', cls: 'ghost', value: 're' }] : [])
          .concat([{ text: 'Huỷ', value: '' }]));
      if (!v) return;
      if (v === 're') return save('DEM_LAI_HOC');
      payload.okCungHoc = true;
    }
  }
  if (thaoTac === 'DON_LO' && !inp.lyDo) {
    const ly = await ask('Lý do dồn cả lô', `<p>Thay toàn bộ ${g.live.length} dòng của lô ${esc(g.lo)} (${fmtN(g.total)}) bằng ${fmtN(inp.sl)} tại hộc ${esc(S.hoc)}.</p>
      <div class="field"><label>Lý do *</label><input id="lyIn" placeholder="VD: gom hết lô về A3 và đếm lại"></div>`,
      [{ text: 'Dồn cả lô', cls: 'primary', value: () => $('lyIn').value.trim(), check: () => !!$('lyIn').value.trim() }, { text: 'Huỷ', value: null }]);
    if (!ly) return; payload.lyDo = ly;
  }
  if (thaoTac === 'CONG_THEM') {                         // đưa vào hàng đợi – lưu ngay cả khi mạng yếu
    Q.push({ reqId: payload.reqId, payload: payload, sl: inp.sl, ten: d.ten, t: Date.now(), state: 'pending' });
    qSave(); afterSave(`Đã lưu ${fmtN(inp.sl)} ${inp.dvt} – lô ${inp.lo}`); qRun();
    return;
  }
  // Đếm lại / Dồn: phải có mạng để chắc chắn không ai vừa sửa
  payload.seen = g.live.map(l => l.id);
  await sendDirect(payload);
}
async function sendDirect(payload) {
  const btns = $('actions').querySelectorAll('button'); btns.forEach(b => b.disabled = true);
  try {
    const r = await api('luu', payload);
    if (r.ok) {
      S.lines = r.lines || S.lines; S.lineCache[payload.kho + '|' + payload.ma] = S.lines;
      recordDone(payload, r); afterSave((payload.thaoTac === 'DON_LO' ? 'Đã dồn lô ' : 'Đã đếm lại hộc – lô ') + payload.lo + (r.st === 'CHO_DUYET' ? ' (chờ IT duyệt)' : ''));
    } else if (r.conflict) {
      S.lines = r.lines || S.lines; renderAll();
      await ask('Vừa có người cập nhật lô này', '<p>Số trên màn hình đã được làm mới. Xem lại rồi bấm lưu lần nữa.</p>');
    } else if (r.need === 'HSD_KHAC') {
      const ok = await ask('HSD khác', `<p>${esc(r.error)}. Vẫn lưu HSD ${esc(payload.hsd)}?</p>`, [{ text: 'Vẫn lưu', cls: 'primary', value: true }, { text: 'Huỷ', value: false }]);
      if (ok) { payload.okHsd = true; return sendDirect(payload); }
    } else { toast(r.error || 'Lỗi', 'bad', null, 5000); if (/đã đóng|chọn đợt|Không thấy đợt/i.test(r.error || '')) revalidate(); }
  } catch (e) { toast((e.isNet ? 'Cần có mạng cho thao tác này: ' : '') + e.message, 'bad', null, 5000); }
  finally { renderAll(); }
}
function afterSave(msg) {
  ['hop', 'le', 'lyDo'].forEach(id => $(id).value = '');
  if (!$('fQc').classList.contains('hidden') && S.drug.qc && $('dvt').value === S.drug.dvt) $('qc').value = S.drug.qc;
  S.lotSel = null; S.lotLocked = false; $('lo').value = ''; $('hsd').value = ''; S.scanGtin = ''; $('khongLo').checked = false;
  renderAll(); renderSync();
  const ma = S.drug.ma;
  toast(msg, 'ok', { text: 'Thuốc khác', fn: () => clearDrug() }, 3500);
  if (navigator.vibrate) navigator.vibrate(60);
  setTimeout(() => { if (S.drug && S.drug.ma === ma) $('q').focus(); }, 50);
}
function recordDone(payload, r) {
  Q.push({ reqId: payload.reqId, payload: payload, sl: ((Number(payload.hop) || 0) * (Number(payload.qc) || 0) + (Number(payload.le) || 0)),
    ten: S.drug ? S.drug.ten : payload.ma, t: Date.now(), state: 'done', id: r.id, st: r.st });
  qSave();
}

// ===================================================================== HÀNG ĐỢI GỬI
let qBusy = false, qTimer = null;
function qSave() {
  const now = Date.now();
  Q = Q.filter(x => x.state !== 'done' || now - (x.doneAt || x.t) < 864e5).slice(-300);
  LS.set('queue', Q); renderSync();
}
function renderSync() {
  const pend = Q.filter(x => x.state === 'pending' || x.state === 'sending').length, bad = Q.filter(x => x.state === 'need' || x.state === 'error').length;
  const el = $('sync');
  el.className = 'sync ' + (bad ? 'err' : pend ? 'pending' : 'ok');
  el.innerHTML = bad ? ico('alert') + bad : pend ? ico('clock') + pend : ico('check');
  el.title = bad ? bad + ' dòng cần xử lý' : pend ? pend + ' dòng đang chờ gửi' : 'Đã gửi hết';
  $('toiBadge').textContent = bad; $('toiBadge').classList.toggle('hidden', !bad);
}
async function qRun() {
  if (qBusy) return; qBusy = true; clearTimeout(qTimer);
  try {
    for (;;) {
      const it = Q.find(x => x.state === 'pending'); if (!it) break;
      it.state = 'sending'; qSave();
      let r;
      try { r = await api('luu', it.payload); }
      catch (e) {
        it.state = 'pending'; it.tries = (it.tries || 0) + 1; qSave();
        if (!e.isNet) { it.state = 'error'; it.error = e.message; qSave(); continue; }
        qTimer = setTimeout(qRun, Math.min(60000, 2000 * Math.pow(2, Math.min(it.tries, 5)))); break;
      }
      if (r.ok) {
        it.state = 'done'; it.id = r.id; it.st = r.st; it.doneAt = Date.now(); it.canhBao = r.canhBao;
        const k = it.payload.kho + '|' + it.payload.ma; if (r.lines && (it.payload.dot || S.dot) === S.dot) S.lineCache[k] = r.lines;
        if (S.drug && S.drug.ma === it.payload.ma && S.kho === it.payload.kho && (it.payload.dot || S.dot) === S.dot && r.lines) { S.lines = r.lines; }
      } else if (r.need || r.conflict) { it.state = 'need'; it.need = r.need; it.error = r.error; it.info = r; toast('Có dòng cần xử lý – xem tab "Của tôi"', 'bad', { text: 'Xem', fn: () => switchTab('toi') }); }
      else { it.state = 'error'; it.error = r.error; toast('Lỗi lưu: ' + r.error, 'bad', { text: 'Xem', fn: () => switchTab('toi') });
        if (/đã đóng|chọn đợt|Không thấy đợt/i.test(r.error || '')) revalidate(); }
      qSave();
      if (S.drug && S.drug.ma === it.payload.ma) renderAll();
    }
  } finally { qBusy = false; renderSync(); }
  refreshProgSoon();
}
let progT = null; function refreshProgSoon() { clearTimeout(progT); progT = setTimeout(refreshProg, 4000); }
window.addEventListener('online', () => qRun());
document.addEventListener('visibilitychange', () => { if (!document.hidden) { qRun(); if (S.drug) fetchLines(); } });

// ===================================================================== TAB CỦA TÔI
async function loadToi() {
  const local = Q.filter(x => x.state !== 'done').slice().reverse();
  let html = local.map(it => {
    const p = it.payload;
    const btns = it.state === 'need'
      ? (it.need === 'CUNG_HOC' ? `<button class="btn small primary" data-q="okCungHoc" data-r="${esc(it.reqId)}">Hàng khác – vẫn cộng</button>` : '')
        + (it.need === 'HSD_KHAC' ? `<button class="btn small primary" data-q="okHsd" data-r="${esc(it.reqId)}">Vẫn lưu HSD này</button>` : '')
        + `<button class="btn small danger" data-q="drop" data-r="${esc(it.reqId)}">Bỏ dòng này</button>`
      : it.state === 'error' ? `<button class="btn small" data-q="retry" data-r="${esc(it.reqId)}">Gửi lại</button><button class="btn small danger" data-q="drop" data-r="${esc(it.reqId)}">Bỏ</button>` : '';
    const edit = it.state !== 'sending' ? `<button class="btn small" data-q="edit" data-r="${esc(it.reqId)}">${ico('rotate')}Sửa</button>` : '';
    return `<div class="item"><div class="h"><span>${esc(it.ten)}</span><span class="st ${it.state}">${ST_TEN[it.state]}</span></div>
      <div class="s">${p.dot && p.dot !== S.dot ? '<b>' + esc(dotTen(p.dot)) + '</b> · ' : ''}Kho ${esc(KHO_TEN[p.kho])} · ${esc(p.hoc)} · lô ${esc(p.lo)} · ${esc(p.hsd)} · <b>${fmtN(it.sl)} ${esc(p.dvt)}</b></div>
      ${it.error ? `<div class="s text-red-600">${esc(it.error)}</div>` : ''}<div class="b">${edit}${btns}</div></div>`;
  }).join('');
  $('toiList').innerHTML = html + '<p class="muted small">Đang tải các dòng đã lưu…</p>';
  try {
    const r = await api('cuaToi', { n: 40 });
    if (!r.ok) throw new Error(r.error);
    S.toiLines = {}; r.lines.forEach(l => S.toiLines[l.id] = l);
    html += r.lines.map(l => `<div class="item"><div class="h"><span>${esc(l.ten)}</span><span class="st ${esc(l.st)}">${esc(ST_TEN[l.st] || l.st)}</span></div>
      <div class="s">${esc(l.id)} · ${esc(l.tg)} · Kho ${esc(KHO_TEN[l.kho] || l.kho)} · ${esc(l.hoc)} · lô ${esc(l.lo)} · ${esc(l.hsd)} · <b>${fmtN(l.sl)} ${esc(l.dvt)}</b> · ${esc(TT_TEN[l.tt] || l.tt)}</div>
      ${l.cb ? `<div class="s flex gap-1.5 text-amber-700">${ico('alert')}<span>${esc(l.cb)}</span></div>` : ''}
      ${(l.st === 'HIEU_LUC' || l.st === 'CHO_DUYET') ? `<div class="b">${l.st === 'HIEU_LUC' && l.tt === 'CONG_THEM' && !/^MOI-/.test(l.ma) ? `<button class="btn small" data-edit="${esc(l.id)}">${ico('rotate')}Sửa</button>` : ''}<button class="btn small danger" data-undo="${esc(l.id)}">${ico('undo')}Hoàn tác</button></div>` : ''}</div>`).join('');
    $('toiList').innerHTML = html || '<p class="muted">Chưa có dòng nào.</p>';
  } catch (e) { $('toiList').innerHTML = html + `<p class="muted small">Không tải được dòng đã lưu (${esc(e.message)})</p>`; }
}
$('toiList').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.undo) {
    const ok = await ask('Hoàn tác dòng ' + b.dataset.undo + '?', '<p>Dòng này sẽ bị huỷ. Nếu nó đã thay số của người khác (đếm lại / dồn lô), số cũ được khôi phục.</p>',
      [{ text: 'Hoàn tác', cls: 'danger', value: true }, { text: 'Không', value: false }]);
    if (!ok) return;
    try { const r = await api('hoanTac', { id: b.dataset.undo }); if (!r.ok) throw new Error(r.error);
      toast('Đã hoàn tác' + (r.restored ? ', khôi phục ' + r.restored + ' dòng cũ' : ''), 'ok'); S.lineCache = {}; loadToi(); if (S.drug) fetchLines(); refreshProgSoon();
    } catch (er) { toast(er.message, 'bad'); }
    return;
  }
  if (b.dataset.edit) {
    const l = S.toiLines[b.dataset.edit]; if (!l) return;
    const ok = await ask('Sửa dòng này?', `<p>${esc(l.ten)} · hộc ${esc(l.hoc)} · lô ${esc(l.lo)} · <b>${fmtN(l.sl)} ${esc(l.dvt)}</b></p><p>Dòng cũ sẽ được huỷ, số cũ điền sẵn để bạn sửa rồi bấm <b>Lưu</b> lại.</p>`,
      [{ text: 'Sửa', icon: 'rotate', cls: 'primary', value: true }, { text: 'Không', cls: 'ghost', value: false }]);
    if (!ok) return;
    try { const r = await api('hoanTac', { id: l.id }); if (!r.ok) throw new Error(r.error); }
    catch (er) { toast((er.isNet ? 'Cần có mạng: ' : '') + er.message, 'bad'); return; }
    S.lineCache = {}; refreshProgSoon();
    return prefill({ kho: l.kho, hoc: l.hoc, ma: l.ma, lo: l.lo, hsd: l.hsd, hop: l.hop, qc: l.qc, le: l.le, dvt: l.dvt, khongLo: /không có lô/i.test(l.ghi || '') });
  }
  const it = Q.find(x => x.reqId === b.dataset.r); if (!it) return;
  if (b.dataset.q === 'edit') {
    if (it.payload.dot && it.payload.dot !== S.dot && S.dots.some(d => d.id === it.payload.dot && d.st === 'MO')) { toast('Dòng này thuộc đợt "' + dotTen(it.payload.dot) + '" – đổi đợt trước (☰ → Đổi đợt kiểm)', 'bad', null, 5000); return; }
    Q = Q.filter(x => x !== it); qSave(); return prefill(it.payload);
  }
  if (b.dataset.q === 'drop') { Q = Q.filter(x => x !== it); }
  else { if (b.dataset.q === 'okCungHoc') it.payload.okCungHoc = true; if (b.dataset.q === 'okHsd') it.payload.okHsd = true;
    it.state = 'pending'; it.error = ''; it.need = ''; }
  qSave(); loadToi(); qRun();
});

async function prefill(o) {
  if (o.kho !== S.kho) { S.kho = o.kho; LS.set('kho', o.kho); }
  if (hocKey(o.hoc) !== S.hoc) { S.hoc = hocKey(o.hoc); LS.set('hoc', S.hoc); }
  renderHeader(); switchTab('dem');
  await selectDrug(o.ma);
  if (!S.drug) return;
  if (o.dvt && [...$('dvt').options].some(x => x.value === o.dvt)) $('dvt').value = o.dvt;
  applyQtyLabels(false);
  $('khongLo').checked = !!o.khongLo;
  const g = lotGroups().find(x => x.key === loKey(o.lo));
  if (g) { S.lotSel = g.key; S.lotLocked = true; $('lo').value = g.lo; $('hsd').value = Object.keys(g.hsd)[0] || o.hsd; }
  else { S.lotSel = 'NEW'; S.lotLocked = false; $('lo').value = o.lo; $('hsd').value = o.hsd; }
  const sl = (Number(o.hop) || 0) * (Number(o.qc) || 0) + (Number(o.le) || 0);
  if ($('fHop').classList.contains('hidden')) { $('hop').value = ''; $('le').value = sl || (o.le === '' ? '' : o.le); }
  else { $('hop').value = o.hop === '' || o.hop == null ? '' : o.hop; if (o.qc !== '' && o.qc != null) $('qc').value = o.qc; $('le').value = o.le === '' || o.le == null ? '' : o.le; }
  renderAll();
  toast('Đã điền số cũ – sửa rồi bấm Lưu', 'ok');
  setTimeout(() => (($('fHop').classList.contains('hidden') ? $('le') : $('hop'))).focus(), 100);
}

// ===================================================================== TAB THUỐC MỚI
async function sendMoi() {
  const v = id => $(id).value.trim();
  const hop = v('nHop'), qc = v('nQc'), le = v('nLe');
  const hsd = parseHsd(v('nHsd'));
  const msg = $('moiMsg'); msg.className = 'msg';
  if (v('nTen').length < 3) { msg.textContent = 'Nhập tên thuốc'; return; }
  if (!S.hoc) { msg.textContent = 'Chọn hộc trước'; return; }
  if (!v('nLo') || !hsd) { msg.textContent = 'Nhập số lô và HSD (dd/mm/yyyy)'; return; }
  if (!hop && !le) { msg.textContent = 'Nhập số lượng'; return; }
  if (Number(hop) > 0 && !(Number(qc) > 0)) { msg.textContent = 'Có số hộp thì nhập "1 hộp có mấy"'; return; }
  $('btnMoi').disabled = true; msg.textContent = 'Đang gửi…';
  try {
    const r = await api('thuocMoi', { dot: S.dot, kho: S.kho, ten: v('nTen'), maDeXuat: v('nMa'), dvt: $('nDvt').value, dvtn: Number(hop) > 0 ? 'Hộp' : '', qcGoc: qc,
      lo: v('nLo').toUpperCase(), hsd: fmtDate(hsd), hoc: S.hoc, hop: hop, qc: qc, le: le, ghiChu: v('nGhi'), reqId: uid() });
    if (!r.ok) throw new Error(r.error);
    msg.className = 'msg ok'; msg.textContent = 'Đã gửi (' + r.maTam + ') – IT sẽ duyệt và gán mã iSOFH.';
    ['nTen', 'nMa', 'nLo', 'nHsd', 'nHop', 'nQc', 'nLe', 'nGhi'].forEach(id => $(id).value = '');
  } catch (e) { msg.textContent = e.message; }
  finally { $('btnMoi').disabled = false; }
}

// ===================================================================== TAB QUẢN LÝ
const LOAI_TEN = { HSD_KHAC: 'Cùng lô nhưng 2 HSD', CUNG_HOC_KHAC_NGUOI: 'Cùng hộc – 2 người cùng đếm (dễ trùng)', LO_GAN_GIONG: 'Số lô gần giống nhau (có thể gõ sai)',
  QC_KHAC: 'Quy cách khác danh mục', LO_NGHI: 'Số lô đáng ngờ', SAI_KHO: 'Thuốc thuộc kho khác', NHIEU_HOC: 'Cùng lô ở nhiều hộc (để xem, thường là đúng)' };
async function loadQl() {
  if (!isIT()) $('qlCfg').innerHTML = ''; else if (!$('qlCfg').firstChild) $('qlCfg').innerHTML = qtMenu();
  if (isIT()) loadDots();
  if (!dotOk()) { ['qlProg', 'qlHoc', 'qlDuyet', 'qlCanXem', 'qlKho'].forEach(id => $(id).innerHTML = ''); $('qlTitle').textContent = 'Quản lý'; return; }
  $('qlTitle').textContent = 'Quản lý · ' + S.dotInfo.ten + ' · Kho ' + KHO_TEN[S.kho];
  if (!$('qlProg').innerHTML) $('qlProg').innerHTML = '<div class="box muted">Đang tải…</div>';
  try {
    const ks = khoOfDot(), rs = await Promise.all(ks.map(k => api('tienDo', { kho: k })));
    $('qlProg').innerHTML = ks.map((k, i) => { const r = rs[i]; return r.ok ? `<div class="box"><div class="flex items-center gap-1.5 font-medium">Kho ${esc(KHO_TEN[k])} ${r.trangThai === 'DA_CHOT' ? ico('lock', 'text-red-600') : ''}</div>
      <b>${r.soMa}</b> mã · ${r.soDong} dòng<br><span class="muted small">${r.soVoi && r.lan1 ? esc(r.soVoi) + ' có ' + r.lan1 + ' mã – đợt này đã đếm ' + r.lan1DaDemLai : 'Không có số liệu so sánh'}${r.choDuyet ? ' · ' + r.choDuyet + ' chờ duyệt' : ''}</span></div>` : `<div class="box">${esc(r.error)}</div>`; }).join('');
    $('qlKho').innerHTML = isIT() && S.dotInfo.st === 'MO' ? ks.map((k, i) => {
      const r = rs[i], chot = r.ok && r.trangThai === 'DA_CHOT';
      return `<button class="btn ${chot ? 'ok' : 'danger'}" data-kho="${esc(k)}" data-tt="${chot ? 'DANG_KIEM' : 'DA_CHOT'}">${chot ? ico('unlock') + 'Mở lại kho ' : ico('lock') + 'Chốt kho '}${esc(KHO_TEN[k])}</button>`;
    }).join('') : isIT() ? '' : `<button class="btn" data-dotxls="${esc(S.dot)}">${ico('file')}Xuất Excel</button>`;
  } catch (e) { $('qlProg').innerHTML = `<div class="box">${esc(e.message)}</div>`; }
  // tiến độ hộc
  try {
    const h = await api('dsHoc', { kho: S.kho });
    if (h.ok) $('qlHoc').innerHTML = `<details${h.chua || h.dang ? ' open' : ''}><summary>${ico('pin', 'text-zinc-500')} Hộc kho ${esc(KHO_TEN[S.kho])}: ${h.xong} xong · ${h.dang} đang · ${h.chua} chưa nhận</summary><div class="inner">
      ${h.list.map(x => `<div class="qitem flex items-center justify-between gap-2"><span><b>${esc(x.hoc)}</b> <span class="muted small">${esc((x.nguoiDem || []).join(', ') || x.nguoi || '')}${x.soDong ? ' · ' + x.soDong + ' dòng, ' + x.soMa + ' mã' : ''}</span></span><span class="st ${x.st === 'XONG' ? 'HIEU_LUC' : x.st === 'DANG_DEM' ? 'CHO_DUYET' : 'THAY_THE'}">${HOC_ST_TEN[x.st]}</span></div>`).join('') || '<p class="muted small py-2">Chưa có hộc nào.</p>'}
    </div></details>`;
  } catch (e) {}
  // chờ duyệt
  try {
    const r = await api('choDuyet');
    if (r.ok) {
      const dongBs = r.dong.filter(l => !/^MOI-/.test(l.ma)), n = dongBs.length + r.thuocMoi.length;
      $('qlBadge').textContent = n; $('qlBadge').classList.toggle('hidden', !n);
      $('qlDuyet').innerHTML = !n ? '' : `<details open><summary>${ico('clock', 'text-amber-600')} Chờ duyệt (${n})</summary><div class="inner">
        ${r.thuocMoi.map(t => `<div class="qitem"><b>Thuốc mới ${esc(t.id)}:</b> ${esc(t.ten)} <span class="muted">· ${esc(t.dvt)} · kho ${esc(KHO_TEN[t.kho] || t.kho)} · ${esc(t.nguoi)} · ${esc(t.tg)}</span>
          ${t.maDeXuat ? `<div class="small">Mã đề xuất: ${esc(t.maDeXuat)}</div>` : ''}
          ${isIT() ? `<div class="qa"><input data-ma-for="${esc(t.id)}" value="${esc(t.maDeXuat)}" placeholder="Mã iSOFH chính thức">
          <button class="btn small ok" data-tm="${esc(t.id)}" data-ok="1">Duyệt</button><button class="btn small danger" data-tm="${esc(t.id)}" data-ok="">Từ chối</button></div>` : ''}</div>`).join('')}
        ${dongBs.map(l => `<div class="qitem"><b>${esc(l.id)}</b> ${esc(l.ten)} · kho ${esc(KHO_TEN[l.kho])} · ${esc(l.hoc)} · lô ${esc(l.lo)} · <b>${fmtN(l.sl)} ${esc(l.dvt)}</b> · ${esc(TT_TEN[l.tt] || l.tt)}
          <div class="small muted">${esc(l.nguoi)} · ${esc(l.tg)} · Lý do: ${esc(l.ghi)}${l.seThay ? ' · sẽ thay ' + esc(l.seThay) : ''}</div>
          ${isIT() ? `<div class="qa"><button class="btn small ok" data-dd="${esc(l.id)}" data-ok="1">Duyệt</button><button class="btn small danger" data-dd="${esc(l.id)}" data-ok="">Từ chối</button></div>` : ''}</div>`).join('')}
      </div></details>`;
    }
  } catch (e) {}
  // cần xem
  $('qlCanXem').innerHTML = '<p class="muted">Đang tải danh sách cần xem…</p>';
  try {
    const raw = await api('canXemDuLieu', { kho: S.kho });
    if (!raw.ok) throw new Error(raw.error);
    const khoTen = Object.fromEntries(((S.user && S.user.khos) || []).map(k => [k.ma, k.ten]));
    const r = tinhCanXem(raw, { khoTen: Object.assign({}, KHO_TEN, khoTen), loNghi: loNghiWords() });
    const groups = {};
    r.items.forEach(x => (groups[x.loai] = groups[x.loai] || []).push(x));
    const order = ['HSD_KHAC', 'CUNG_HOC_KHAC_NGUOI', 'LO_GAN_GIONG', 'QC_KHAC', 'LO_NGHI', 'SAI_KHO', 'NHIEU_HOC'];
    let h = order.filter(k => groups[k]).map(k => `<details${k !== 'NHIEU_HOC' ? ' open' : ''}><summary>${k === 'NHIEU_HOC' ? ico('info', 'text-zinc-400') : ico('alert', 'text-amber-600')} ${LOAI_TEN[k]} (${groups[k].length})</summary><div class="inner">
      ${groups[k].map(x => `<div class="qitem"><a class="link" data-open="${esc(x.ma)}">${esc(x.ma)}</a> ${esc(x.ten)}${x.lo ? ' · lô ' + esc(x.lo) : ''}<div class="small muted">${esc(x.chiTiet)}</div>
        ${k === 'LO_GAN_GIONG' && isIT() ? `<div class="qa"><button class="btn small" data-gop="${esc(x.ma)}" data-giu="${esc(x.lo)}" data-bo="${esc(x.lo2)}">Gộp vào ${esc(x.lo)}</button><button class="btn small" data-gop="${esc(x.ma)}" data-giu="${esc(x.lo2)}" data-bo="${esc(x.lo)}">Gộp vào ${esc(x.lo2)}</button></div>` : ''}</div>`).join('')}
      </div></details>`).join('');
    const sv = esc(S.dotInfo.soVoi || 'đợt so sánh');
    if (r.lech.length) h += `<details><summary>${ico('diff', 'text-blue-600')} Lệch so với ${sv} (${r.lech.length})</summary><div class="inner">${r.lech.map(x => `<div class="qitem"><a class="link" data-open="${esc(x.ma)}">${esc(x.ma)}</a> ${esc(x.ten)}<div class="small muted">${esc(x.chiTiet)}</div></div>`).join('')}</div></details>`;
    if (r.chuaDem.length) h += `<details><summary>${ico('square', 'text-zinc-400')} ${sv} có nhưng đợt này chưa đếm (${r.chuaDem.length})</summary><div class="inner">${r.chuaDem.map(x => `<div class="qitem"><a class="link" data-open="${esc(x.ma)}">${esc(x.ma)}</a> ${esc(x.ten)}</div>`).join('')}</div></details>`;
    $('qlCanXem').innerHTML = h || '<p class="muted flex items-center gap-2">' + ico('check', 'text-emerald-600') + 'Không có gì cần xem.</p>';
  } catch (e) { $('qlCanXem').innerHTML = `<p class="msg">${esc(e.message)}</p>`; }
}
// ---- Đợt kiểm (IT) ----
const dotTen = id => (S.dots.find(d => d.id === id) || { ten: id }).ten;
async function loadDots() {
  let box = $('qlDot');
  try {
    const r = await api('dsDot'); if (!r.ok) throw new Error(r.error);
    S.dots = r.list; LS.set('dots', S.dots);
    box.innerHTML = `<details open><summary>${ico('calendar', 'text-zinc-500')} Đợt kiểm (${r.list.length})</summary><div class="inner">
      ${r.list.slice().reverse().map(d => `<div class="qitem"><div class="flex items-center justify-between gap-2"><span><b>${esc(d.ten)}</b> <span class="muted small">${esc(d.id)}</span></span>
        <span class="st ${d.st === 'MO' ? 'HIEU_LUC' : 'THAY_THE'}">${d.st === 'MO' ? 'Đang mở' : 'Đã đóng'}</span></div>
        <div class="small muted">Kho ${d.kho.map(k => esc(KHO_TEN[k])).join(' + ')} · tạo ${esc(d.ngay)}${d.soVoi ? ' · so với ' + esc(d.soVoi) : ''}${d.ghi ? ' · ' + esc(d.ghi) : ''}</div>
        <div class="qa">${d.id === S.dot ? '<span class="small font-medium text-emerald-700">Đang dùng</span>' : `<button class="btn small" data-dotgo="${esc(d.id)}">${ico('swap')}Chuyển sang</button>`}
          <button class="btn small" data-dotxls="${esc(d.id)}">${ico('file')}Xuất Excel</button>
          <button class="btn small ${d.st === 'MO' ? 'danger' : 'ok'}" data-dotst="${esc(d.id)}" data-st="${d.st === 'MO' ? 'DONG' : 'MO'}">${d.st === 'MO' ? ico('lock') + 'Đóng đợt' : ico('unlock') + 'Mở lại'}</button></div></div>`).join('')}
      <button class="btn primary mt-2 w-full" data-dotnew="1">${ico('plus')}Tạo đợt mới</button></div></details>`;
  } catch (e) { box.innerHTML = `<p class="msg">${esc(e.message)}</p>`; }
}
async function dotXuat(t) {
  t.disabled = true;
  try { await xuatExcel(t.dataset.dotxls); toast('Đã tạo file Excel', 'ok'); }
  catch (e) { toast((e.isNet ? 'Cần có mạng: ' : '') + e.message, 'bad', null, 5000); }
  finally { t.disabled = false; }
}
async function dotAction(t) {
  try {
    if (t.dataset.dotgo) { await chooseDotId(t.dataset.dotgo); return; }
    if (t.dataset.dotst) {
      const d = S.dots.find(x => x.id === t.dataset.dotst) || { ten: t.dataset.dotst }, dong = t.dataset.st === 'DONG';
      const ok = await ask((dong ? 'Đóng' : 'Mở lại') + ' đợt "' + d.ten + '"?', dong
        ? '<p>Sau khi đóng, <b>không ai nhập thêm được</b> vào đợt này (vẫn xem được). Dữ liệu giữ nguyên để tra lại; cần chốt hoặc đổ iSOFH thì bấm Xuất Excel.</p>'
        : '<p>Mở lại để mọi người nhập tiếp vào đợt này.</p>',
        [{ text: dong ? 'Đóng đợt' : 'Mở lại', icon: dong ? 'lock' : 'unlock', cls: dong ? 'danger' : 'primary', value: true }, { text: 'Huỷ', value: false }]);
      if (!ok) return;
      const r = await api('datTrangThaiDot', { id: t.dataset.dotst, st: t.dataset.st }); if (!r.ok) throw new Error(r.error);
      if (r.dot.id === S.dot) { S.dotInfo = Object.assign({}, S.dotInfo, { st: r.dot.st }); LS.set('dotInfo', S.dotInfo); renderHeader(); }
      toast(dong ? 'Đã đóng đợt' : 'Đã mở lại đợt', 'ok'); loadDots(); return;
    }
    if (t.dataset.dotnew) return taoDotForm();
  } catch (er) { toast(er.message, 'bad', null, 5000); }
}
async function chooseDotId(id) {
  try {
    const r = await api('login', { dot: id }); if (!r.ok) throw new Error(r.error);
    applyLogin(r); if (!r.dotInfo) throw new Error('Không mở được đợt này');
  } catch (e) { toast((e.isNet ? 'Cần có mạng: ' : '') + e.message, 'bad', null, 5000); return; }
  if (!S.kho || !khoOfDot().includes(S.kho)) await chooseKho(true);
  refreshProg(); toast('Đang ở đợt: ' + S.dotInfo.ten, 'ok'); loadQl();
}
async function taoDotForm() {
  const now = new Date(), def = 'Kiểm kho ' + pad2(now.getMonth() + 1) + '/' + now.getFullYear();
  const opts = S.dots.slice().reverse().map(d => `<option value="${esc(d.id)}"${d.id === S.dot ? ' selected' : ''}>${esc(d.ten)}</option>`).join('');
  const body = `<div class="field"><label for="dTen">Tên đợt *</label><input id="dTen" value="${esc(def)}" autocomplete="off"></div>
    <div class="field"><label>Kiểm kho</label><div class="flex gap-4">
      ${Object.keys(KHO_TEN).map(k => `<label class="tiny"><input type="checkbox" class="dKho" value="${esc(k)}" checked><span>Kho ${esc(KHO_TEN[k])}</span></label>`).join('')}</div></div>
    <div class="field"><label for="dSoVoi">So sánh với (để thấy lệch, mã chưa đếm)</label><select id="dSoVoi">${opts}<option value="">Không so sánh</option></select></div>
    <label class="tiny"><input type="checkbox" id="dHoc" checked><span>Dùng lại danh sách hộc của đợt so sánh</span></label>
    <p id="dMsg" class="msg"></p>`;
  const v = await ask('Tạo đợt kiểm mới', body, [{ text: 'Tạo đợt', icon: 'plus', cls: 'primary', value: () => ({ ten: $('dTen').value.trim(),
      kho: [...document.querySelectorAll('.dKho:checked')].map(x => x.value), soVoi: $('dSoVoi').value, copyHoc: $('dHoc').checked }),
    check: () => { const m = $('dMsg'); if ($('dTen').value.trim().length < 3) { m.textContent = 'Nhập tên đợt'; return false; }
      if (!document.querySelector('.dKho:checked')) { m.textContent = 'Chọn ít nhất 1 kho'; return false; } return true; } }, { text: 'Huỷ', cls: 'ghost', value: null }]);
  if (!v) return;
  try {
    const r = await api('taoDot', v, 180000); if (!r.ok) throw new Error(r.error);
    await loadDots();
    const go = await ask('Đã tạo "' + r.dot.ten + '"', '<p>Chuyển sang đợt mới ngay? Mọi người cần chọn lại đợt (☰ → Đổi đợt kiểm), hoặc đóng đợt cũ để máy tự chuyển.</p>',
      [{ text: 'Chuyển sang đợt mới', icon: 'swap', cls: 'primary', value: true }, { text: 'Để sau', cls: 'ghost', value: false }]);
    if (go) await chooseDotId(r.dot.id);
  } catch (e) { toast('Không tạo được đợt: ' + e.message, 'bad', null, 6000); }
}
$('tab-ql').addEventListener('click', async e => {
  const t = e.target.closest('[data-open],[data-gop],[data-dd],[data-tm],[data-kho],[data-dotgo],[data-dotst],[data-dotnew],[data-dotxls]'); if (!t) return;
  if (t.dataset.dotxls) return dotXuat(t);
  if (t.dataset.dotgo || t.dataset.dotst || t.dataset.dotnew) return dotAction(t);
  try {
    if (t.dataset.open) { switchTab('dem'); selectDrug(t.dataset.open); return; }
    if (t.dataset.gop) {
      const ok = await ask('Gộp lô', `<p>Chuyển mọi dòng lô <b>${esc(t.dataset.bo)}</b> sang lô <b>${esc(t.dataset.giu)}</b> (mã ${esc(t.dataset.gop)}, kho ${esc(KHO_TEN[S.kho])})?</p>`,
        [{ text: 'Gộp', cls: 'primary', value: true }, { text: 'Huỷ', value: false }]);
      if (!ok) return;
      const r = await api('gopLo', { kho: S.kho, ma: t.dataset.gop, loGiu: t.dataset.giu, loBo: t.dataset.bo }); if (!r.ok) throw new Error(r.error);
      toast('Đã gộp lô', 'ok');
    } else if (t.dataset.dd) {
      const r = await api('duyetDong', { id: t.dataset.dd, chapNhan: !!t.dataset.ok }); if (!r.ok) throw new Error(r.error);
      toast(t.dataset.ok ? 'Đã duyệt' : 'Đã từ chối', 'ok');
    } else if (t.dataset.tm) {
      const ma = (document.querySelector(`[data-ma-for="${t.dataset.tm}"]`) || {}).value || '';
      if (t.dataset.ok && !ma.trim()) { toast('Nhập mã iSOFH chính thức', 'bad'); return; }
      const r = await api('duyetThuocMoi', { id: t.dataset.tm, chapNhan: !!t.dataset.ok, ma: ma.trim() }); if (!r.ok) throw new Error(r.error);
      toast(t.dataset.ok ? 'Đã duyệt mã ' + r.ma : 'Đã từ chối', 'ok'); loadDm(true);
    } else if (t.dataset.kho) {
      const chot = t.dataset.tt === 'DA_CHOT';
      const ok = await ask((chot ? 'Chốt' : 'Mở lại') + ' kho ' + KHO_TEN[t.dataset.kho] + '?',
        chot ? '<p>Sau khi chốt, người đếm chỉ gửi được <b>phiếu bổ sung</b> (có lý do), IT duyệt mới được cộng. Cần chốt hoặc đổ iSOFH thì bấm Xuất Excel ở tab Quản lý.</p>' : '<p>Mở lại để mọi người nhập bình thường.</p>',
        [{ text: chot ? 'Chốt kho' : 'Mở lại', icon: chot ? 'lock' : 'unlock', cls: chot ? 'danger' : 'primary', value: true }, { text: 'Huỷ', value: false }]);
      if (!ok) return;
      const r = await api('datTrangThaiKho', { kho: t.dataset.kho, trangThai: t.dataset.tt }); if (!r.ok) throw new Error(r.error);
      S.trangThai[t.dataset.kho] = r.trangThai; LS.set('trangThai', S.trangThai); renderHeader();
    }
    S.lineCache = {}; loadQl();
  } catch (er) { toast(er.message, 'bad', null, 5000); }
});

// ===================================================================== TABS / MENU
function switchTab(t) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  ['dem', 'toi', 'moi', 'ql'].forEach(x => $('tab-' + x).classList.toggle('hidden', x !== t));
  if (t === 'toi') loadToi();
  if (t === 'ql') loadQl();
  window.scrollTo(0, 0);
}
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) switchTab(b.dataset.tab); });
async function menu() {
  const v = await ask(S.user.ten, `<p class="muted small">${esc(S.user.tk)} · ${esc(S.user.roleTen)} · phiên bản ${APP_VER}<br>Đợt: ${esc(S.dotInfo ? S.dotInfo.ten : 'chưa chọn')} · Danh mục: ${S.dm.length} mã</p>`, [
    { text: 'Đổi đợt kiểm', icon: 'calendar', value: 'dot' }, { text: 'Đổi kho', icon: 'box', value: 'kho' }, { text: 'Đổi hộc', icon: 'pin', value: 'hoc' }, { text: 'Tải lại danh mục', icon: 'refresh', value: 'dm' },
    { text: 'In hướng dẫn + mã QR', icon: 'info', value: 'guide' }].concat(isIT() ? [{ text: 'In phiếu PIN', icon: 'lock', value: 'pin' }] : []).concat([
    { text: 'Đăng xuất', icon: 'logout', cls: 'danger', value: 'out' }, { text: 'Đóng', cls: 'ghost', value: '' }]));
  if (v === 'dot') chooseDot(false); else if (v === 'kho') chooseKho(); else if (v === 'hoc') chooseHoc(); else if (v === 'out') logout();
  else if (v === 'guide') window.open('huong-dan.html', '_blank'); else if (v === 'pin') window.open('huong-dan.html#pin', '_blank');
  else if (v === 'dm') { await loadDm(true); toast('Đã tải ' + S.dm.length + ' mã', 'ok'); }
}

// ===================================================================== HSD gõ liền
function maskHsd(el, monthMode) {
  const digits = el.value.replace(/\D/g, '');
  if (monthMode()) { el.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2, 6) : digits; }
  else {
    let v = digits.slice(0, 2);
    if (digits.length > 2) v += '/' + digits.slice(2, 4);
    if (digits.length > 4) v += '/' + digits.slice(4, 8);
    el.value = v;
  }
}
function finishHsd(el, monthMode) {
  const s = el.value.trim(); if (!s) return;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); if (m) el.value = pad2(m[1]) + '/' + pad2(m[2]) + '/20' + m[3];
  if (monthMode() && (m = el.value.match(/^(\d{1,2})\/(\d{4})$/))) { const d = parseHsd(el.value); if (d) el.value = fmtDate(d); }
}
function bindHsd(id, monthFn) {
  const el = $(id);
  el.addEventListener('input', () => { maskHsd(el, monthFn); if (id === 'hsd') renderAll(); });
  el.addEventListener('blur', () => { finishHsd(el, monthFn); if (id === 'hsd') renderAll(); });
}

// ===================================================================== QUÉT MÃ 2D + CHỤP CHỮ
const SC = { stream: null, timer: null, mode: '2d', busy: false, det: undefined, zx: null, tess: null, track: null };
const AI_FIX = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
const AI_VAR = ['10', '21', '22', '240', '241', '250', '251', '30', '37', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99', '710', '711', '712', '713', '714', '715'];
function parseGS1(text) {
  let s = String(text || '').trim().replace(/^\]d2|^\]C1|^\]Q3|^\]e0/, '');
  const out = {};
  if (/\(\d{2,4}\)/.test(s)) { const re = /\((\d{2,4})\)([^(]*)/g; let m; while ((m = re.exec(s))) out[m[1]] = m[2].replace(/\x1d/g, '').trim(); }
  else if (/^\d{8}$|^\d{12,14}$/.test(s)) { out['01'] = s.padStart(14, '0'); }
  else {
    s = s.replace(/^\x1d/, ''); let i = 0, guard = 0;
    while (i < s.length && guard++ < 30) {
      if (s[i] === '\x1d') { i++; continue; }
      let ai = null;
      for (const L of [2, 3, 4]) { const c = s.substr(i, L); if (AI_FIX[c] || AI_VAR.includes(c) || /^31\d\d$|^32\d\d$|^39\d\d$/.test(c)) { ai = c; break; } }
      if (!ai) break;
      i += ai.length;
      const len = AI_FIX[ai] || (/^3[129]\d\d$/.test(ai) ? 6 : 0); let val;
      if (len) { val = s.substr(i, len); i += len; } else { const gs = s.indexOf('\x1d', i); val = gs < 0 ? s.slice(i) : s.slice(i, gs); i = gs < 0 ? s.length : gs + 1; }
      out[ai] = val;
    }
  }
  const r = { gtin: (out['01'] || out['02'] || '').padStart(out['01'] || out['02'] ? 14 : 0, '0'), lot: (out['10'] || '').trim(), exp: null, raw: text };
  const e = out['17'] || out['15'];
  if (e && /^\d{6}$/.test(e)) { const y = 2000 + +e.slice(0, 2), mo = +e.slice(2, 4), d = +e.slice(4, 6);
    if (mo >= 1 && mo <= 12) r.exp = d === 0 ? new Date(y, mo, 0) : new Date(y, mo - 1, d); }
  return r;
}
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Không tải được ' + src)); document.head.appendChild(s); }); }
async function getZX() {
  if (SC.zx) return SC.zx;
  await loadScript('vendor/zxing/zxing-reader.js');
  const Z = window.ZXingWASM;
  Z.prepareZXingModule({ overrides: { locateFile: (p, prefix) => p.endsWith('.wasm') ? new URL('vendor/zxing/' + p, location.href).href : prefix + p }, fireImmediately: true });
  SC.zx = Z; return Z;
}
async function getNative() {
  if (SC.det !== undefined) return SC.det;
  SC.det = null;
  try { if ('BarcodeDetector' in window) { const f = await BarcodeDetector.getSupportedFormats();
    if (f.includes('data_matrix')) SC.det = new BarcodeDetector({ formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13'].filter(x => f.includes(x)) }); } } catch (e) {}
  return SC.det;
}
async function decodeCanvas(cv, hard) {
  const nat = await getNative();
  if (nat && !hard) { try { const r = await nat.detect(cv); const best = r.sort((a, b) => (parseGS1(b.rawValue).lot ? 1 : 0) - (parseGS1(a.rawValue).lot ? 1 : 0))[0];
    if (best) return best.rawValue; } catch (e) {} }
  const Z = await getZX();
  const img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  const res = await Z.readBarcodes(img, { formats: ['DataMatrix', 'QRCode', 'Code128', 'DataBarExpanded', 'EAN13'], tryHarder: !!hard, tryRotate: !!hard,
    tryInvert: !!hard, tryDownscale: true, maxNumberOfSymbols: 4 });
  const ok = res.filter(r => r.isValid && r.text).sort((a, b) => (parseGS1(b.text).lot ? 1 : 0) - (parseGS1(a.text).lot ? 1 : 0));
  return ok.length ? ok[0].text : null;
}
function cropGuide(scaleUp) {                              // cắt đúng vùng khung trên màn hình từ khung hình camera
  const v = $('video'), vr = v.getBoundingClientRect(), gr = $('guide').getBoundingClientRect();
  const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return null;
  const sc = Math.max(vr.width / vw, vr.height / vh), ox = (vr.width - vw * sc) / 2, oy = (vr.height - vh * sc) / 2;
  const pad = SC.mode === '2d' ? 0.25 : 0.06;
  let sx = (gr.left - vr.left - ox) / sc, sy = (gr.top - vr.top - oy) / sc, sw = gr.width / sc, sh = gr.height / sc;
  sx -= sw * pad; sy -= sh * pad; sw *= 1 + 2 * pad; sh *= 1 + 2 * pad;
  sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(vw - sx, sw); sh = Math.min(vh - sy, sh);
  const k = Math.min(scaleUp || 1, 1600 / sw);
  const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
  cv.getContext('2d', { willReadFrequently: true }).drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  return cv;
}
async function openScan(mode) {
  SC.mode = mode || '2d';
  $('scanOv').classList.remove('hidden'); $('ocrResult').classList.add('hidden');
  setScanMode(SC.mode);
  $('scanMsg').textContent = 'Đang mở camera…';
  if (SC.mode === '2d') getZX().catch(() => {});
  try {
    SC.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    const v = $('video'); v.srcObject = SC.stream; await v.play();
    SC.track = SC.stream.getVideoTracks()[0];
    try { const cap = SC.track.getCapabilities ? SC.track.getCapabilities() : {}; $('btnTorch').classList.toggle('hidden', !cap.torch);
      if (cap.focusMode && cap.focusMode.includes('continuous')) SC.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}); } catch (e) {}
    setScanMode(SC.mode);
    if (SC.mode === '2d') scanLoop();
  } catch (e) {
    $('scanMsg').textContent = 'Không mở được camera (' + (e.name || e.message) + '). Bấm "Chọn ảnh" để chụp bằng máy ảnh.';
  }
}
function setScanMode(m) {
  SC.mode = m;
  $('mode2d').classList.toggle('on', m === '2d'); $('modeOcr').classList.toggle('on', m === 'ocr');
  $('guide').classList.toggle('ocr', m === 'ocr'); $('btnShot').classList.toggle('hidden', m !== 'ocr');
  $('ocrResult').classList.add('hidden');
  if (SC.stream) $('scanMsg').textContent = m === '2d' ? 'Đưa MÃ VUÔNG trên hộp vào khung xanh, cách ~10–15 cm' : 'Đưa dòng Số lô / HSD (Batch, Lot, EXP…) vào khung vàng rồi bấm Chụp';
  clearTimeout(SC.timer); if (m === '2d' && SC.stream) scanLoop();
}
function closeScan() {
  clearTimeout(SC.timer); SC.timer = null;
  if (SC.stream) SC.stream.getTracks().forEach(t => t.stop()); SC.stream = null;
  $('scanOv').classList.add('hidden');
}
let frameNo = 0;
async function scanLoop() {
  if (!SC.stream || SC.mode !== '2d') return;
  if (!SC.busy) {
    SC.busy = true;
    try {
      const cv = cropGuide(1);
      if (cv) { const txt = await decodeCanvas(cv, (++frameNo % 5) === 0); if (txt) { SC.busy = false; return onCode(txt); } }
    } catch (e) { $('scanMsg').textContent = 'Lỗi đọc mã: ' + e.message; }
    SC.busy = false;
  }
  SC.timer = setTimeout(scanLoop, 180);
}
function onCode(text) {
  const g = parseGS1(text);
  let msg = '';
  if (navigator.vibrate) navigator.vibrate(120);
  const byGtin = g.gtin && S.gtinMap[g.gtin];
  if (g.gtin) S.scanGtin = g.gtin;
  if (!S.drug && byGtin) { closeScan(); S.pendingScan = { lot: g.lot, exp: g.exp }; selectDrug(byGtin.ma); toast('Nhận ra ' + byGtin.ten, 'ok'); return; }
  if (S.drug && byGtin && byGtin.ma !== S.drug.ma) {
    closeScan();
    ask('Mã vạch của thuốc khác', `<p>Mã vạch này đã được gắn với <b>${esc(byGtin.ten)}</b> (${esc(byGtin.ma)}), không phải ${esc(S.drug.ten)}.</p>`,
      [{ text: 'Chuyển sang ' + byGtin.ma, cls: 'primary', value: true }, { text: 'Giữ thuốc đang chọn', value: false }]).then(sw => {
        if (sw) { S.pendingScan = { lot: g.lot, exp: g.exp }; selectDrug(byGtin.ma); } else if (g.lot || g.exp) applyLotFromScan(g.lot, g.exp); });
    return;
  }
  if (!g.lot && !g.exp) {
    msg = g.gtin ? 'Mã này chỉ có mã sản phẩm, KHÔNG có số lô/HSD → dùng "Chụp chữ" hoặc gõ tay.' : 'Đọc được: ' + String(text).slice(0, 40) + ' – không có lô/HSD.';
    $('scanMsg').textContent = msg;
    if (!S.drug) { closeScan(); toast('Chưa nhận ra thuốc từ mã vạch – tìm theo tên, lần sau quét sẽ tự nhận', 'bad', null, 4500); return; }
    setTimeout(() => setScanMode('ocr'), 1600);
    return;
  }
  closeScan();
  if (!S.drug) { S.pendingScan = { lot: g.lot, exp: g.exp }; toast(`Đọc được lô ${g.lot || '?'} · HSD ${g.exp ? fmtDate(g.exp) : '?'} – giờ chọn thuốc`, 'ok', null, 4500); $('q').focus(); return; }
  applyLotFromScan(g.lot, g.exp);
  toast(`Lô ${g.lot || '(không có)'} · HSD ${g.exp ? fmtDate(g.exp) : '(không có)'} – nhập số lượng`, 'ok');
  setTimeout(() => (($('fHop').classList.contains('hidden') ? $('le') : $('hop'))).focus(), 100);
}
// ---- Chụp chữ (OCR chạy ngay trên điện thoại, không gửi ảnh đi đâu) ----
async function getTess() {
  if (SC.tess) return SC.tess;
  await loadScript('vendor/tesseract/tesseract.min.js');
  const base = new URL('vendor/tesseract/', location.href).href;
  SC.tess = await Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', gzip: true });
  await SC.tess.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  return SC.tess;
}
function prep(cv) {                                      // xám + tăng tương phản cho OCR
  const c = cv.getContext('2d'), img = c.getImageData(0, 0, cv.width, cv.height), d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = y; if (y < min) min = y; if (y > max) max = y; }
  const k = 255 / Math.max(30, max - min);
  for (let i = 0; i < d.length; i += 4) { const y = (d[i] - min) * k; d[i] = d[i + 1] = d[i + 2] = y; }
  c.putImageData(img, 0, 0); return cv;
}
async function runOcr(cv) {
  $('scanMsg').textContent = 'Đang đọc chữ… (lần đầu tải bộ đọc ~7MB)';
  $('btnShot').disabled = true;
  try {
    const w = await getTess();
    const { data } = await w.recognize(prep(cv));
    const res = parseLabelText(data.text || '');
    showOcr(res, data.text || '');
  } catch (e) { $('scanMsg').textContent = 'Không đọc được chữ: ' + e.message; }
  finally { $('btnShot').disabled = false; }
}
function showOcr(res, raw) {
  const box = $('ocrResult'); box.classList.remove('hidden');
  const ok = res.lot || res.exp;
  $('scanMsg').textContent = ok ? 'Kiểm tra kết quả rồi bấm Dùng' : 'Chưa tìm thấy Số lô / HSD – chụp gần hơn, đủ sáng, hoặc gõ tay';
  box.innerHTML = `<div class="grid2"><div class="field"><label>Số lô</label><input id="oLo" value="${esc(res.lot)}"></div>
    <div class="field"><label>HSD</label><input id="oHsd" value="${esc(res.exp ? fmtDate(res.exp) : '')}" placeholder="dd/mm/yyyy"></div></div>
    <div class="scan-btns"><button class="btn primary" id="oUse">${ico('check')}Dùng</button><button class="btn" id="oAgain">Chụp lại</button></div>
    <div class="raw">${esc(raw.trim())}</div>`;
  $('oUse').onclick = () => {
    const lo = $('oLo').value.trim().toUpperCase(), exp = parseHsd($('oHsd').value);
    closeScan();
    if (!S.drug) { S.pendingScan = { lot: lo, exp: exp }; toast('Đã đọc lô/HSD – giờ chọn thuốc', 'ok'); return; }
    applyLotFromScan(lo, exp);
  };
  $('oAgain').onclick = () => { box.classList.add('hidden'); setScanMode('ocr'); };
}
async function onPickImage(file) {
  if (!file) return;
  const img = new Image(); img.src = URL.createObjectURL(file); await img.decode();
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, cv.width, cv.height);
  if (SC.mode === 'ocr') return runOcr(cv);
  $('scanMsg').textContent = 'Đang đọc mã trong ảnh…';
  try { const t = await decodeCanvas(cv, true); if (t) onCode(t); else $('scanMsg').textContent = 'Không thấy mã 2D trong ảnh – chụp gần, rõ nét hơn'; }
  catch (e) { $('scanMsg').textContent = 'Lỗi: ' + e.message; }
}

// ===================================================================== GẮN SỰ KIỆN
function bind() {
  $('btnLogin').onclick = doLogin;
  $('pin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('btnKho').onclick = () => chooseKho(); $('btnHoc').onclick = () => chooseHoc(); $('btnMenu').onclick = menu; $('who').onclick = () => chooseDot(false);
  $('q').addEventListener('input', renderResults);
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('results').querySelector('.res[data-ma]'); if (f) selectDrug(f.dataset.ma); } });
  $('btnClear').onclick = clearDrug;
  $('lotUnlock').onclick = () => { S.lotSel = 'NEW'; S.lotLocked = false; renderAll(); $('lo').focus(); };
  $('lo').addEventListener('input', () => {
    if (S.lotSel === 'NEW') { const g = lotGroups().find(x => x.key === loKey($('lo').value) && x.key); if (g && $('lo').value.trim().length >= 3) {
      S.lotSel = g.key; S.lotLocked = true; $('lo').value = g.lo; $('hsd').value = Object.keys(g.hsd)[0] || ''; toast('Lô này đã có – đã chọn sẵn', 'ok'); } }
    renderAll();
  });
  bindHsd('hsd', () => $('hsdMonth').checked); bindHsd('nHsd', () => false);
  $('hsdMonth').onchange = () => { $('hsd').value = ''; $('hsd').placeholder = $('hsdMonth').checked ? 'mm/yyyy' : 'dd/mm/yyyy'; $('hsd').maxLength = $('hsdMonth').checked ? 7 : 10; $('hsd').focus(); };
  ['hop', 'qc', 'le', 'lyDo'].forEach(id => $(id).addEventListener('input', renderAll));
  $('dvt').onchange = () => { applyQtyLabels(true); renderAll(); };
  ['hop', 'qc', 'le'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $('actions').querySelector('.act.main'); if (b && !b.disabled) b.click(); } }));
  $('btnScanTop').onclick = () => openScan('2d'); $('btnScan2d').onclick = () => openScan('2d'); $('btnOcr').onclick = () => openScan('ocr');
  $('btnScanClose').onclick = closeScan;
  $('mode2d').onclick = () => setScanMode('2d'); $('modeOcr').onclick = () => setScanMode('ocr');
  $('btnShot').onclick = () => { const cv = cropGuide(2); if (cv) runOcr(cv); };
  $('btnPickImg').onclick = () => $('imgFile').click();
  $('imgFile').onchange = e => { onPickImage(e.target.files[0]); e.target.value = ''; };
  $('btnTorch').onclick = () => { if (!SC.track) return; SC.torch = !SC.torch; SC.track.applyConstraints({ advanced: [{ torch: SC.torch }] }).catch(() => {}); };
  $('btnXongHoc').onclick = xongHoc; $('khongLo').onchange = onKhongLo;
  $('btnToiReload').onclick = loadToi; $('btnQlReload').onclick = loadQl; $('btnMoi').onclick = sendMoi;
  applyUserConfig();
}

// ===================================================================== KHỞI ĐỘNG
(function start() {
  document.querySelectorAll('i[data-i]').forEach(el => { el.outerHTML = ico(el.dataset.i); });
  bind();
  Q.forEach(x => { if (x.state === 'sending') x.state = 'pending'; }); LS.set('queue', Q);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (S.pin && S.user) { enterMain(); revalidate(); }
  else { $('pin').focus(); }
  setInterval(() => { if (S.user && !document.hidden) refreshProg(); }, 90000);
})();
