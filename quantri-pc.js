/* Trang quản trị cho máy tính (quantri.html), chỉ IT dùng.
 * Script thường nạp sau config.js, chung.js, xuatexcel.js; dùng $, esc, norm, api, qtTaiSheetJS, qtDocExcel (chung.js) và các hàm file Excel (xuatexcel.js).
 * PIN chỉ giữ trong sessionStorage của tab: đóng tab là phải nhập lại. Máy chủ vẫn chặn người không phải IT ở mọi hàm. */
'use strict';

const S = { pin: '', dot: '', user: null, dotInfo: null, dots: [] };      // api() in chung.js reads S.pin and S.dot
const PIN_KEY = 'kkqt_pin';
const pinNho = {
  get() { try { return sessionStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } },
  set(v) { try { sessionStorage.setItem(PIN_KEY, v); } catch (e) {} },
  del() { try { sessionStorage.removeItem(PIN_KEY); } catch (e) {} },
};
const QT_VAI = { DEM: 'Người đếm', TO_TRUONG: 'Tổ trưởng', IT: 'IT', TAP: 'Tập (không tính)' };
const soVN = n => n.toLocaleString('vi-VN');
const goi = async (action, data, timeout) => { const r = await api(action, data, timeout); if (!r.ok) throw new Error(r.error); return r; };
const oNhap = (id, nhan, gt, them) => `<div class="field"><label for="${id}">${esc(nhan)}</label><input id="${id}" value="${esc(gt)}" autocomplete="off"${them || ''}></div>`;
const oChon = (id, nhan, ds, gt) => `<div class="field"><label for="${id}">${esc(nhan)}</label><select id="${id}">${ds.map(o =>
  `<option value="${esc(o[0])}"${o[0] === gt ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
const oDanh = (id, nhan, bat) => `<label class="tiny"><input type="checkbox" id="${id}"${bat ? ' checked' : ''}><span>${esc(nhan)}</span></label>`;
const locChon = (id, tatCa, ds) => `<select id="${id}" aria-label="${esc(tatCa)}"><option value="">${esc(tatCa)}</option>${ds.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`;
const oTim = () => '<input id="tim" type="search" placeholder="Tìm" aria-label="Tìm" autocomplete="off">';

// ===================================================================== khung chung
/** Draws a table into hop. dong = rows of raw cell text; loc(i) says whether row i shows; chon(i) runs on a row click.
 * At most 500 matching rows are drawn; the count line reads "<shown> / <total>". dangChon = index of the selected row (or -1). */
function veBang(hop, cot, dong, loc, chon, dangChon) {
  const hien = [];
  for (let i = 0; i < dong.length; i++) if (loc(i)) hien.push(i);
  // ponytail: draws the first 500 matches only; the search box narrows the rest (fine at 5.000 rows)
  hop.innerHTML = `<div class="dem">${soVN(hien.length)} / ${soVN(dong.length)}</div><table class="ds"><thead><tr>${cot.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`
    + hien.slice(0, 500).map(i => `<tr data-i="${i}"${i === dangChon ? ' class="chon"' : ''}>${dong[i].map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
  hop.querySelector('tbody').onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr || e.target.closest('button')) return;
    hop.querySelectorAll('tr.chon').forEach(x => x.classList.remove('chon'));
    tr.classList.add('chon');
    chon(+tr.dataset.i);
  };
}
/** Opens the edit panel on the right. luu() returns a Promise; a thrown Error shows its message (the server's words) in #khungLoi. */
function moKhung(tieuDe, oHtml, luu) {
  const k = $('khung');
  k.innerHTML = `<h2>${esc(tieuDe)}</h2><form id="khungForm" novalidate>${oHtml}<p id="khungLoi" class="msg"></p>
    <div class="nut"><button type="submit" class="btn primary">Lưu</button><button type="button" id="khungHuy" class="btn ghost">Huỷ</button></div></form>`;
  k.classList.remove('hidden'); $('qt').classList.add('co-khung');
  $('khungHuy').onclick = dongKhung;
  $('khungForm').onsubmit = async e => {
    e.preventDefault();
    const nut = e.submitter || k.querySelector('[type=submit]');
    nut.disabled = true; $('khungLoi').textContent = '';
    try { await luu(); } catch (err) { if ($('khungLoi')) $('khungLoi').textContent = err.message; } finally { nut.disabled = false; }
  };
}
function dongKhung() { $('khung').classList.add('hidden'); $('khung').innerHTML = ''; $('qt').classList.remove('co-khung'); }
/** Confirmation dialog. nut = [{ text, value, cls }]; resolves with the value of the pressed button (undefined on Esc). */
function hoi(tieuDe, noiDungHtml, nut) {
  const d = $('hop');
  d.innerHTML = `<h2>${esc(tieuDe)}</h2><div>${noiDungHtml}</div><div class="nut">${nut.map((n, i) =>
    `<button type="button" class="btn ${n.cls || ''}" data-i="${i}">${esc(n.text)}</button>`).join('')}</div>`;
  return new Promise(ok => {
    let v;
    d.onclick = e => { const b = e.target.closest('button[data-i]'); if (b) { v = nut[b.dataset.i].value; d.close(); } };
    d.onclose = () => { d.innerHTML = ''; ok(v); };                 // emptied so a shown PIN does not stay in the page
    d.showModal();
  });
}
const baoLoi = e => hoi('Lỗi', `<p class="msg">${esc(e.message)}</p>`, [{ text: 'Đóng', value: true, cls: 'primary' }]);
const hienPin = (ten, pin) => hoi('PIN của ' + ten, `<div id="pinMoi">${esc(pin)}</div>`, [{ text: 'Đóng', value: true, cls: 'primary' }]);
async function taiFile(sheets, tenFile) {
  await qtTaiSheetJS();
  XLSX.writeFile(xlSach(sheets), tenFile);
}

// ===================================================================== đăng nhập và chọn đợt
function raLogin(msg) {
  S.pin = ''; pinNho.del();
  $('main').classList.add('hidden'); $('login').classList.remove('hidden');
  $('loginMsg').textContent = msg || '';
}
async function dangNhap(pin) {
  if (!pin) return;
  S.pin = pin; S.dot = '';
  $('btnLogin').disabled = true; $('loginMsg').textContent = '';
  let r;
  try { r = await api('login'); } catch (e) { r = { ok: false, error: e.message }; }
  $('btnLogin').disabled = false;
  if (!r.ok) return raLogin(r.error);
  if (r.role !== 'IT') return raLogin('Trang này chỉ dành cho IT');
  pinNho.set(pin);
  const mo = r.dots.filter(d => d.st === 'MO'), d = (mo.length ? mo : r.dots).slice(-1)[0];   // dots come sorted by id
  $('login').classList.add('hidden'); $('main').classList.remove('hidden');
  $('pin').value = '';
  $('menu').innerHTML = MUC.map(m => `<button type="button" class="btn" data-muc="${m[0]}">${esc(m[1])}</button>`).join('');
  await chonDot(d ? d.id : '');
}
/** Picks the đợt: reloads the login data for it, marks a closed đợt on <body> (hides the write buttons) and redraws the open section. */
async function chonDot(id) {
  S.dot = id || '';
  let r;
  try { r = await goi('login', { dot: S.dot }); } catch (e) { return baoLoi(e); }
  S.user = r; S.dots = r.dots; S.dotInfo = r.dotInfo || null;
  if (S.dotInfo && S.dotInfo.st !== 'MO') document.body.dataset.dong = '1'; else delete document.body.dataset.dong;
  $('dot').innerHTML = S.dots.map(d => `<option value="${esc(d.id)}"${d.id === S.dot ? ' selected' : ''}>${esc(d.id + ' · ' + d.ten + (d.st === 'MO' ? '' : ' (đã đóng)'))}</option>`).join('');
  await moMuc(mucMo);
}
let mucMo = 'taiKhoan';
async function moMuc(key) {
  mucMo = key;
  $('menu').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.muc === key));
  dongKhung();
  $('bang').innerHTML = '';
  await MUC.find(m => m[0] === key)[2]();
}

// ===================================================================== Tài khoản
const TK = { list: [], key: [], chon: '' };
async function veTaiKhoan() {
  $('bang').innerHTML = `<div class="cong-cu">${oTim()}${locChon('locVai', 'Mọi vai trò', Object.entries(QT_VAI))}
    ${locChon('locTt', 'Mọi trạng thái', [['1', 'Đang dùng'], ['0', 'Đã khoá']])}
    <button type="button" id="btnThem" class="btn primary">Thêm</button><button type="button" id="btnXuat" class="btn">Xuất danh sách</button></div><div id="ds"></div>`;
  $('tim').oninput = $('locVai').onchange = $('locTt').onchange = veBangTk;
  $('btnThem').onclick = () => suaTaiKhoan(null);
  $('btnXuat').onclick = () => taiFile(soTaiKhoan(TK.list), 'TAI-KHOAN.xlsx').catch(baoLoi);
  await taiTaiKhoan();
}
async function taiTaiKhoan() {
  let r;
  try { r = await goi('dsTaiKhoan'); } catch (e) { r = e; }
  if (mucMo !== 'taiKhoan') return;                             // IT moved to another section while waiting
  if (r instanceof Error) return void ($('ds').innerHTML = `<p class="msg">${esc(r.message)}</p>`);
  TK.list = r.list;
  TK.key = TK.list.map(t => norm(t.tk + ' ' + t.ten + ' ' + t.ghiChu));
  veBangTk();
}
function veBangTk() {
  if (!$('ds')) return;
  const q = norm($('tim').value.trim()), vai = $('locVai').value, tt = $('locTt').value;
  veBang($('ds'), ['Mã TK', 'Tên', 'Vai trò', 'Trạng thái', 'Ghi chú'],
    TK.list.map(t => [t.tk, t.ten, t.roleTen, t.active ? 'Đang dùng' : 'Đã khoá', t.ghiChu]),
    i => (!q || TK.key[i].includes(q)) && (!vai || TK.list[i].role === vai) && (!tt || String(+TK.list[i].active) === tt),
    i => suaTaiKhoan(TK.list[i]), TK.list.findIndex(t => t.tk === TK.chon));
}
function suaTaiKhoan(t) {
  TK.chon = t ? t.tk : '';
  moKhung(t ? 'Sửa tài khoản' : 'Thêm tài khoản',
    (t ? oNhap('oTk', 'Mã TK', t.tk, ' readonly') : '') + oNhap('oTen', 'Tên hiển thị', t ? t.ten : '')
    + oChon('oVai', 'Vai trò', Object.entries(QT_VAI), t ? t.role : 'DEM') + oNhap('oGhi', 'Ghi chú', t ? t.ghiChu : '')
    + (t ? oDanh('oAct', 'Đang hoạt động', t.active) + '<div class="nut"><button type="button" id="btnPin" class="btn danger small">Đặt lại PIN</button></div>' : ''),
    async () => {
      const r = await goi('luuTaiKhoan', { tk: t ? t.tk : '', ten: $('oTen').value.trim(), role: $('oVai').value, ghiChu: $('oGhi').value.trim(),
        active: t ? $('oAct').checked : undefined });
      if (!t) await hienPin(r.taiKhoan.ten, r.taiKhoan.pin);
      await sauKhiLuuTk(r.taiKhoan.tk);
    });
  if (t) $('btnPin').onclick = async () => {
    if (!await hoi('Đặt lại PIN của ' + t.ten + '?', '', [{ text: 'Đặt lại', value: true, cls: 'danger' }, { text: 'Huỷ', value: false, cls: 'ghost' }])) return;
    try { await hienPin(t.ten, (await goi('datLaiPin', { tk: t.tk })).pin); } catch (e) { $('khungLoi').textContent = e.message; }
  };
}
async function sauKhiLuuTk(tk) {
  TK.chon = tk;
  await taiTaiKhoan();
  const t = TK.list.find(x => x.tk === tk);
  if (t && mucMo === 'taiKhoan') suaTaiKhoan(t);
}

// ===================================================================== Danh mục thuốc
const DM = { list: [], key: [], chon: '', khos: [] };
const dongLoi = (loi, so) => loi.length ? '<p class="msg">' + loi.map(x => `Dòng ${esc(so ? so[x.dong - 1] : x.dong)}: ${esc(x.error)}`).join('<br>') + '</p>' : '';
const ketQua = html => hoi('Kết quả nhập', html, [{ text: 'Đóng', value: true, cls: 'primary' }]);
/** Hidden file input behind a "Nhập từ Excel" button; nhap(file) runs on pick, its Error is shown in a dialog. */
const nutNhap = cls => `<button type="button" id="btnNhap" class="btn ${cls || ''}">Nhập từ Excel</button><input type="file" id="fileNhap" accept=".xlsx,.xls" class="hidden">`;
function ganNhap(nhap) {
  $('btnNhap').onclick = () => $('fileNhap').click();
  $('fileNhap').onchange = async () => {
    const f = $('fileNhap').files[0];
    $('fileNhap').value = '';                                      // the same file can be picked again
    if (f) try { await nhap(f); } catch (e) { await baoLoi(e); }
  };
}
async function veDanhMuc() {
  $('bang').innerHTML = `<div class="cong-cu">${oTim()}<span id="locKhoO"></span>
    <button type="button" id="btnThem" class="btn primary">Thêm</button><button type="button" id="btnMau" class="btn">Tải file mẫu</button>
    <button type="button" id="btnXuat" class="btn">Xuất danh sách hiện có</button>${nutNhap()}</div><div id="ds"></div>`;
  $('tim').oninput = veBangDm;
  $('btnThem').onclick = () => suaThuoc(null);
  $('btnMau').onclick = () => taiFile(soDanhMuc([VIDU_DANH_MUC]), 'DANH-MUC-MAU.xlsx').catch(baoLoi);
  $('btnXuat').onclick = () => taiFile(soDanhMuc(DM.list), 'DANH-MUC.xlsx').catch(baoLoi);
  ganNhap(nhapDanhMuc);
  await taiDanhMuc();
}
async function taiDanhMuc() {
  let r, k;
  try { [r, k] = await Promise.all([goi('danhMuc', { v: '' }), goi('dsKho')]); } catch (e) { r = e; }
  if (mucMo !== 'danhMuc') return;
  if (r instanceof Error) return void ($('ds').innerHTML = `<p class="msg">${esc(r.message)}</p>`);
  DM.list = r.list; DM.khos = k.list;
  DM.key = DM.list.map(t => norm(t[0] + ' ' + t[1] + ' ' + t[6]));      // computed once per load, not per keystroke
  if (!$('locKho')) {
    $('locKhoO').innerHTML = locChon('locKho', 'Mọi kho mặc định', DM.khos.map(x => [x.ma, x.tenNgan]));
    $('locKho').onchange = veBangDm;
  }
  veBangDm();
}
function veBangDm() {
  if (!$('ds')) return;
  const q = norm($('tim').value.trim()), kho = $('locKho') ? $('locKho').value : '';
  veBang($('ds'), ['Mã', 'Tên thuốc', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho mặc định', 'Mã vạch GTIN'], DM.list,
    i => (!q || DM.key[i].includes(q)) && (!kho || DM.list[i][5] === kho), i => suaThuoc(DM.list[i]), DM.list.findIndex(t => t[0] === DM.chon));
}
function suaThuoc(t) {
  DM.chon = t ? t[0] : '';
  const dvt = (S.user && S.user.dvt) || [], dvts = t && t[4] && !dvt.includes(t[4]) ? dvt.concat(t[4]) : dvt;
  moKhung(t ? 'Sửa thuốc' : 'Thêm thuốc',
    oNhap('oMa', 'Mã', t ? t[0] : '', t ? ' readonly' : '') + oNhap('oTen', 'Tên thuốc', t ? t[1] : '') + oNhap('oDvtn', 'ĐVT nhập', t ? t[2] : '')
    + oNhap('oQc', 'Quy cách', t ? t[3] : '', ' inputmode="decimal"') + oChon('oDvt', 'ĐVT nhỏ nhất', dvts.map(x => [x, x]), t ? t[4] : dvts[0])
    + oChon('oKho', 'Kho mặc định', [['', '']].concat(DM.khos.map(x => [x.ma, x.tenNgan])), t ? t[5] : '') + oNhap('oGtin', 'Mã vạch GTIN', t ? t[6] : ''),
    async () => {
      const ma = $('oMa').value.trim();
      await goi('luuThuoc', { ma, ten: $('oTen').value.trim(), dvtn: $('oDvtn').value.trim(), qc: $('oQc').value.trim(), dvt: $('oDvt').value,
        kho: $('oKho').value, gtin: $('oGtin').value.trim() });
      DM.chon = ma;
      await taiDanhMuc();
      const x = DM.list.find(y => y[0] === ma);
      if (x && mucMo === 'danhMuc') suaThuoc(x);
    });
}
async function nhapDanhMuc(f) {
  const { tieuDe, list, so } = await qtDocExcel(f);
  if (!dungTieuDe(tieuDe, DANH_MUC_MAU_HEADER)) throw new Error('File không đúng mẫu danh mục');
  const vd = timDongViDu(list, so, 0);
  if (vd) throw new Error('Dòng ' + vd + ' là dòng ví dụ của file mẫu');
  const r = await goi('nhapThuoc', { list }, 180000);
  await taiDanhMuc();
  await ketQua(`<p>Thêm ${r.them} · Sửa ${r.sua} · Lỗi ${r.loi.length}</p>` + dongLoi(r.loi, so));
}

// ===================================================================== Kho và hộc
const HOC_ST_TEN = { CHUA_NHAN: 'Chưa ai nhận', DANG_DEM: 'Đang đếm', XONG: 'Đã xong' };
const KH = { list: [], chon: '', hoc: [], khoHoc: '' };
const tenKho = ma => { const k = KH.list.find(x => x.ma === ma); return k ? k.tenNgan : ma; };
const chuaCoDot = () => '<p class="muted">Chưa có đợt kiểm</p>';
async function veKho() {
  $('bang').innerHTML = `<div class="cong-cu"><button type="button" id="btnThem" class="btn primary">Thêm kho</button></div><div id="dsKho"></div><div id="phanHoc" class="muc-phu"></div>`;
  $('btnThem').onclick = () => suaKho(null);
  let r;
  try { r = await goi('dsKho'); } catch (e) { r = e; }
  if (mucMo !== 'kho') return;
  if (r instanceof Error) return void ($('dsKho').innerHTML = `<p class="msg">${esc(r.message)}</p>`);
  KH.list = r.list;
  veBangKho();
  if (!S.dotInfo) return void ($('phanHoc').innerHTML = chuaCoDot());
  const ks = S.dotInfo.kho;
  if (!ks.includes(KH.khoHoc)) KH.khoHoc = ks[0];
  $('phanHoc').innerHTML = `<div class="cong-cu">${oChon('khoHoc', 'Kho', ks.map(k => [k, tenKho(k)]), KH.khoHoc)}</div>
    <div class="ghi-dot"><div class="field"><label for="oHocMoi">Hộc mới</label><textarea id="oHocMoi" rows="4" autocomplete="off"></textarea></div>
    <button type="button" id="btnThemHoc" class="btn primary ghi-dot">Thêm hộc</button></div><div id="dsHoc" class="muc-phu"></div>`;
  $('khoHoc').onchange = () => { KH.khoHoc = $('khoHoc').value; taiHoc(); };
  $('btnThemHoc').onclick = themHoc;
  $('dsHoc').onclick = e => { const b = e.target.closest('[data-xoa]'); if (b) xoaHoc(KH.hoc[b.dataset.xoa].hoc); };
  await taiHoc();
}
function veBangKho() {
  veBang($('dsKho'), ['Mã kho', 'Tên kho', 'Tên ngắn', 'Thứ tự', 'Đang dùng'],
    KH.list.map(k => [k.ma, k.ten, k.tenNgan, String(k.thuTu), k.hoatDong ? 'Có' : 'Không']),
    () => true, i => suaKho(KH.list[i]), KH.list.findIndex(k => k.ma === KH.chon));
}
function suaKho(k) {
  KH.chon = k ? k.ma : '';
  moKhung(k ? 'Sửa kho' : 'Thêm kho',
    oNhap('oMa', 'Mã kho', k ? k.ma : '', k ? ' readonly' : '') + oNhap('oTen', 'Tên kho', k ? k.ten : '') + oNhap('oNgan', 'Tên ngắn', k ? k.tenNgan : '')
    + oNhap('oThuTu', 'Thứ tự', k ? String(k.thuTu) : '', ' inputmode="numeric"') + oDanh('oHd', 'Đang dùng', k ? k.hoatDong : true),
    async () => {
      const ma = $('oMa').value.trim().toUpperCase();
      await goi('luuKho', { ma, ten: $('oTen').value.trim(), tenNgan: $('oNgan').value.trim(), thuTu: $('oThuTu').value.trim(), hoatDong: $('oHd').checked });
      KH.chon = ma;
      await chonDot(S.dot);                                        // kho names and the đợt's kho list in S.user change too
      const x = KH.list.find(y => y.ma === ma);
      if (x && mucMo === 'kho') suaKho(x);
    });
}
async function taiHoc() {
  const kho = KH.khoHoc;
  let r;
  try { r = await goi('dsHoc', { kho }); } catch (e) { r = e; }
  if (mucMo !== 'kho' || kho !== KH.khoHoc || !$('dsHoc')) return;
  if (r instanceof Error) return void ($('dsHoc').innerHTML = `<p class="msg">${esc(r.message)}</p>`);
  KH.hoc = r.list;
  veBang($('dsHoc'), ['Hộc', 'Trạng thái', 'Người đếm', 'Bắt đầu', 'Xong lúc', ''],
    KH.hoc.map(h => [h.hoc, HOC_ST_TEN[h.st] || h.st, h.nguoi, h.batDau, h.xongLuc, '']), () => true, () => {}, -1);
  $('dsHoc').querySelectorAll('tbody tr').forEach(tr => {
    if (KH.hoc[tr.dataset.i].st === 'CHUA_NHAN') tr.lastChild.innerHTML = `<button type="button" class="btn small danger ghi-dot" data-xoa="${tr.dataset.i}">Xoá</button>`;
  });
}
async function themHoc() {
  const them = $('oHocMoi').value.split('\n').map(x => x.trim()).filter(Boolean);
  if (!them.length) return;
  try { await goi('luuHoc', { kho: KH.khoHoc, them }); } catch (e) { return baoLoi(e); }
  $('oHocMoi').value = '';
  await taiHoc();
}
async function xoaHoc(hoc) {
  if (!await hoi('Xoá hộc ' + hoc + '?', '', [{ text: 'Xoá', value: true, cls: 'danger' }, { text: 'Huỷ', value: false, cls: 'ghost' }])) return;
  try { await goi('luuHoc', { kho: KH.khoHoc, xoa: [hoc] }); } catch (e) { return baoLoi(e); }
  await taiHoc();
}

// ===================================================================== menu: [key, label, draw()]
const MUC = [
  ['taiKhoan', 'Tài khoản', veTaiKhoan],
  ['danhMuc', 'Danh mục thuốc', veDanhMuc],
  ['kho', 'Kho và hộc', veKho],
  ['soSanh', 'Số liệu so sánh', async () => {}],
  ['dot', 'Đợt kiểm', async () => {}],
];

// ===================================================================== khởi động
$('btnLogin').onclick = () => dangNhap($('pin').value.trim());
$('pin').onkeydown = e => { if (e.key === 'Enter') $('btnLogin').click(); };
$('btnThoat').onclick = () => { pinNho.del(); location.reload(); };
$('dot').onchange = () => chonDot($('dot').value);
$('menu').onclick = e => { const b = e.target.closest('[data-muc]'); if (b) moMuc(b.dataset.muc); };
dangNhap(pinNho.get());
