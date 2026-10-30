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
 * The count line reads "<shown> / <total>". dangChon = index of the selected row (or -1). */
function veBang(hop, cot, dong, loc, chon, dangChon) {
  const hien = [];
  for (let i = 0; i < dong.length; i++) if (loc(i)) hien.push(i);
  // ponytail: draws every matching row (~150 ms for 6.000 rows on a full redraw); add paging if the lists grow well past that
  hop.innerHTML = `<div class="dem">${soVN(hien.length)} / ${soVN(dong.length)}</div><table class="ds"><thead><tr>${cot.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`
    + hien.map(i => `<tr data-i="${i}"${i === dangChon ? ' class="chon"' : ''}>${dong[i].map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
  hop.querySelector('tbody').onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr || e.target.closest('button')) return;
    hop.querySelectorAll('tr.chon').forEach(x => x.classList.remove('chon'));
    tr.classList.add('chon');
    chon(+tr.dataset.i);
  };
}
/** Opens the edit panel on the right. luu() returns a Promise; a thrown Error shows its message (the server's words) in #khungLoi. */
function moKhung(tieuDe, oHtml, luu) {                         // without luu the panel is read-only: no Lưu, Huỷ reads Đóng
  const k = $('khung');
  k.innerHTML = `<h2>${esc(tieuDe)}</h2><form id="khungForm" novalidate>${oHtml}<p id="khungLoi" class="msg"></p>
    <div class="nut">${luu ? '<button type="submit" class="btn primary">Lưu</button>' : ''}<button type="button" id="khungHuy" class="btn ghost">${luu ? 'Huỷ' : 'Đóng'}</button></div></form>`;
  k.classList.remove('hidden'); $('qt').classList.add('co-khung');
  $('khungHuy').onclick = dongKhung;
  $('khungForm').onsubmit = async e => {
    e.preventDefault();
    if (!luu) return;
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
  const mo = r.dots.filter(d => d.st === 'MO'), d = (mo.length ? mo : r.dots).slice(-1)[0];   // dots come in number order of their code (DOT99 before DOT100)
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
let mucMo = 'ketQua';
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
    try {
      const pin = (await goi('datLaiPin', { tk: t.tk })).pin;
      if (t.tk === S.user.tk) { S.pin = pin; pinNho.set(pin); }      // own PIN: keep working with the new one, not the stale one
      await hienPin(t.ten, pin);
    } catch (e) { $('khungLoi').textContent = e.message; }
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
/** Hidden file input behind a "Nhập từ Excel" button; nhap(file) runs on pick, its Error is shown in a dialog.
 * The đợt picker and the button stay disabled until the import ends, so the đợt cannot change under it. */
const nutNhap = cls => `<button type="button" id="btnNhap" class="btn ${cls || ''}">Nhập từ Excel</button><input type="file" id="fileNhap" accept=".xlsx,.xls" class="hidden">`;
function ganNhap(nhap) {
  $('btnNhap').onclick = () => $('fileNhap').click();
  $('fileNhap').onchange = async () => {
    const f = $('fileNhap').files[0];
    $('fileNhap').value = '';                                      // the same file can be picked again
    if (!f) return;
    $('dot').disabled = $('btnNhap').disabled = true;
    try { await nhap(f); } catch (e) { await baoLoi(e); } finally { $('dot').disabled = false; if ($('btnNhap')) $('btnNhap').disabled = false; }
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

// ===================================================================== Số liệu so sánh
const SSO = { list: [], key: [], kho: '' };
async function veSoSanh() {
  if (!S.dotInfo) return void ($('bang').innerHTML = chuaCoDot());
  if (SSO.kho && !S.dotInfo.kho.includes(SSO.kho)) SSO.kho = '';
  $('bang').innerHTML = `<div class="cong-cu">${oTim()}${locChon('locKhoSs', 'Tất cả', S.dotInfo.kho.map(k => [k, k]))}
    <button type="button" id="btnMau" class="btn">Tải file mẫu</button><button type="button" id="btnXuat" class="btn">Xuất danh sách hiện có</button>${nutNhap('ghi-dot')}</div><div id="ds"></div>`;
  $('locKhoSs').value = SSO.kho;
  $('tim').oninput = veBangSs;
  $('locKhoSs').onchange = () => { SSO.kho = $('locKhoSs').value; taiSoSanh(); };
  $('btnMau').onclick = () => taiFile(soSoSanh([VIDU_SO_SANH]), 'SO-SANH-MAU.xlsx').catch(baoLoi);
  $('btnXuat').onclick = () => taiFile(soSoSanh(SSO.list), tenFileExcel(S.dotInfo.ten).replace('KIEM-KHO-', 'SO-SANH-')).catch(baoLoi);
  ganNhap(nhapSoSanh);
  await taiSoSanh();
}
async function taiSoSanh() {
  const kho = SSO.kho;
  let r;
  try { r = await goi('dsSoSanh', { kho }); } catch (e) { r = e; }
  if (mucMo !== 'soSanh' || kho !== SSO.kho || !$('ds')) return;
  if (r instanceof Error) return void ($('ds').innerHTML = `<p class="msg">${esc(r.message)}</p>`);
  SSO.list = r.list;
  SSO.key = SSO.list.map(x => norm(x[1] + ' ' + x[2] + ' ' + x[3]));
  veBangSs();
}
function veBangSs() {
  const q = norm($('tim').value.trim());
  veBang($('ds'), LAN1_HEADER, SSO.list.map(x => x.map(String)), i => !q || SSO.key[i].includes(q), () => {}, -1);
}
/** All or nothing over the whole file: check-only call, confirm with per-kho consequences, then one real call for every kho. */
async function nhapSoSanh(f) {
  const dot = S.dot, info = S.dotInfo;                             // every call below names this đợt, whatever the header shows later
  const { tieuDe, list, so } = await qtDocExcel(f, 4);
  if (!dungTieuDe(tieuDe, LAN1_HEADER)) throw new Error('File không đúng mẫu số liệu so sánh');
  const vd = timDongViDu(list, so, 1);
  if (vd) throw new Error('Dòng ' + vd + ' là dòng ví dụ của file mẫu');
  const { loi, nhieuKho } = tachTheoKho(list, so, info.kho);
  if (loi.length) return ketQua('<p>Chưa nhập gì</p>' + dongLoi(loi));
  if (!nhieuKho.length) return ketQua('<p>Tệp không có dòng nào</p>');
  const gui = nhieuKho.map(k => ({ kho: k.kho, list: k.list }));
  const kt = await goi('nhapSoSanh', { dot, nhieuKho: gui, chiKiem: true }, 180000);
  if (kt.loi.length) return ketQua('<p>Chưa nhập gì</p>' + dongLoi(doiDongLoi(kt.loi, nhieuKho)));
  const dang = (await goi('dsSoSanh', { dot, kho: '' })).list;
  const xn = nhieuKho.map(k => `<p>Kho ${esc(k.kho)}: thay ${dang.filter(x => x[0] === k.kho).length} dòng đang có bằng ${k.list.length} dòng trong file</p>`).join('');
  if (!await hoi('Nhập số liệu so sánh vào đợt ' + info.ten, xn, [{ text: 'Nhập', value: true, cls: 'danger' }, { text: 'Huỷ', value: false, cls: 'ghost' }])) return;
  let r;
  try { r = await goi('nhapSoSanh', { dot, nhieuKho: gui }, 180000); } catch (e) {
    if (!e.isNet) throw e;
    await taiSoSanh();                                             // each kho is either all old or all new: the table shows which
    return ketQua('<p class="msg">Không rõ đã nhập xong chưa</p>');
  }
  if (r.loi.length) return ketQua('<p>Chưa nhập gì</p>' + dongLoi(doiDongLoi(r.loi, nhieuKho)));
  await taiSoSanh();
  await ketQua(nhieuKho.map(k => `<p>Kho ${esc(k.kho)}: ${r.theoKho[k.kho]} dòng</p>`).join(''));
}

// ===================================================================== Đợt kiểm
const DT = { list: [] };
const KHO_ST_TEN = { DANG_KIEM: 'Đang kiểm', DA_CHOT: 'Đã chốt' };
const nutO = (tr, html) => { tr.lastChild.innerHTML = html; };
async function veDot() {
  $('bang').innerHTML = `<div class="cong-cu"><button type="button" id="btnTaoDot" class="btn primary">Tạo đợt</button></div><div id="dsDot"></div><div id="phanKhoDot" class="muc-phu"></div>`;
  $('btnTaoDot').onclick = () => taoDot().catch(baoLoi);
  $('dsDot').onclick = $('phanKhoDot').onclick = e => {
    const b = e.target.closest('[data-dotst],[data-dotxls],[data-khost]');
    if (!b) return;
    if (b.dataset.dotxls) return xuatExcel(b.dataset.dotxls).catch(baoLoi);
    if (b.dataset.dotst) return doiTrangThai('datTrangThaiDot', { id: b.dataset.dotid, st: b.dataset.dotst }, b.textContent + ' ' + b.dataset.dotid + '?', b.textContent);
    doiTrangThai('datTrangThaiKho', { kho: b.dataset.kho, trangThai: b.dataset.khost }, b.textContent + ' ' + b.dataset.kho + '?', b.textContent);
  };
  let r;
  try { r = await goi('dsDot'); } catch (e) { r = e; }
  if (mucMo !== 'dot') return;
  if (r instanceof Error) return void ($('dsDot').innerHTML = `<p class="msg">${esc(r.message)}</p>`);
  DT.list = r.list;
  veBang($('dsDot'), ['Mã đợt', 'Tên', 'Kho', 'Ngày tạo', 'So với đợt', 'Người tạo', 'Trạng thái', 'Ghi chú', ''],
    DT.list.map(d => [d.id, d.ten, d.kho.join(', '), d.ngay, d.soVoi, d.nguoi, d.st === 'MO' ? 'Đang mở' : 'Đã đóng', d.ghi, '']),
    () => true, () => {}, DT.list.findIndex(d => d.id === S.dot));
  $('dsDot').querySelectorAll('tbody tr').forEach(tr => {
    const d = DT.list[tr.dataset.i];
    nutO(tr, `<div class="flex gap-2"><button type="button" class="btn small" data-dotid="${esc(d.id)}" data-dotst="${d.st === 'MO' ? 'DONG' : 'MO'}">${d.st === 'MO' ? 'Đóng đợt' : 'Mở lại đợt'}</button>
      <button type="button" class="btn small" data-dotxls="${esc(d.id)}">Xuất Excel đợt</button></div>`);
  });
  if (!S.dotInfo) return void ($('phanKhoDot').innerHTML = chuaCoDot());
  $('phanKhoDot').innerHTML = '<div id="dsKhoDot"></div>';
  const ks = S.dotInfo.kho, tt = S.dotInfo.trangThai || {};
  veBang($('dsKhoDot'), ['Kho', 'Trạng thái', ''], ks.map(k => [k, KHO_ST_TEN[tt[k]] || KHO_ST_TEN.DANG_KIEM, '']), () => true, () => {}, -1);
  $('dsKhoDot').querySelectorAll('tbody tr').forEach(tr => {
    const k = ks[tr.dataset.i], chot = tt[k] === 'DA_CHOT';
    nutO(tr, `<button type="button" class="btn small ghi-dot" data-kho="${esc(k)}" data-khost="${chot ? 'DANG_KIEM' : 'DA_CHOT'}">${chot ? 'Mở lại kho' : 'Chốt kho'}</button>`);
  });
}
/** Confirms, sends the đợt / kho state change, then reloads the đợt (S.dotInfo) and redraws. */
async function doiTrangThai(action, data, cauHoi, nut) {
  if (!await hoi(cauHoi, '', [{ text: nut, value: true, cls: 'danger' }, { text: 'Huỷ', value: false, cls: 'ghost' }])) return;
  try { await goi(action, data); } catch (e) { return baoLoi(e); }
  await chonDot(S.dot);
}
async function taoDot() {
  const khos = (await goi('dsKho')).list.filter(k => k.hoatDong);
  moKhung('Tạo đợt', oNhap('oTen', 'Tên', '')
    + `<div class="field"><label>Kho</label><div class="flex flex-wrap gap-4">${khos.map(k => `<label class="tiny"><input type="checkbox" class="oKhoDot" value="${esc(k.ma)}" checked><span>${esc(k.tenNgan)}</span></label>`).join('')}</div></div>`
    + oChon('oSoVoi', 'So với đợt', [['', '']].concat(S.dots.slice().reverse().map(d => [d.id, d.id + ' · ' + d.ten])), S.dot)
    + oDanh('oHoc', 'Chép danh sách hộc', true),
    async () => {
      const r = await goi('taoDot', { ten: $('oTen').value.trim(), kho: [...document.querySelectorAll('.oKhoDot:checked')].map(x => x.value),
        soVoi: $('oSoVoi').value, copyHoc: $('oHoc').checked }, 180000);
      await chonDot(S.dot);                                        // the new đợt joins the đợt picker; the current one stays
      if (mucMo === 'dot') $('dsDot').querySelectorAll('tbody tr').forEach(tr => tr.classList.toggle('chon', DT.list[tr.dataset.i].id === r.dot.id));
    });
}

// ===================================================================== Kết quả kiểm
const KQ = { data: null, xem: 'dong', nhatKy: null, nguoi: '' };
const KQ_XEM = [['dong', 'Dòng đã đếm'], ['nguoi', 'Theo người kiểm'], ['thuoc', 'Tổng hợp theo thuốc'], ['nhatKy', 'Nhật ký']];
const tenFileDot = dau => tenFileExcel(S.dotInfo.ten).replace('KIEM-KHO-', dau + '-');
const soVNo = v => typeof v === 'number' ? soVN(v) : String(v == null ? '' : v);
async function veKetQua() {
  if (!S.dotInfo) return void ($('bang').innerHTML = chuaCoDot());
  $('bang').innerHTML = `<div class="nut" id="kqXem" style="margin:0 0 8px">${KQ_XEM.map(x => `<button type="button" class="btn small" data-xem="${x[0]}">${esc(x[1])}</button>`).join('')}</div>
    <div class="cong-cu" id="kqCongCu"></div><div id="ds"></div>`;
  $('kqXem').onclick = e => { const b = e.target.closest('[data-xem]'); if (b) { KQ.xem = b.dataset.xem; dongKhung(); veXemKq(); } };
  KQ.data = KQ.nhatKy = null;                                     // fresh numbers every time the section or the đợt is opened
  const dot = S.dot;
  let r;
  try { r = await goi('xemDot', {}, 60000); } catch (e) { r = e; }
  if (mucMo !== 'ketQua' || dot !== S.dot) return;
  if (r instanceof Error) return void ($('ds').innerHTML = `<p class="msg">${esc(r.message)}</p>`);
  KQ.data = r;
  await veXemKq();
}
/** Draws the chosen view: its filters, its table and its "Tải Excel" button (the rows shown, as they are filtered). */
async function veXemKq() {
  $('kqXem').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.xem === KQ.xem));
  const cc = $('kqCongCu'), dong = KQ.data.dong;
  if (KQ.xem === 'dong') {
    const nguoi = [...new Map(dong.map(x => [x.tk, x.nguoi]))].sort();
    cc.innerHTML = oTim() + locChon('locKho', 'Mọi kho', S.dotInfo.kho.map(k => [k, k])) + locChon('locNguoi', 'Mọi người', nguoi)
      + locChon('locSt', 'Mọi trạng thái', Object.entries(ST_TEN).slice(0, 5))
      + '<button type="button" id="btnXuat" class="btn">Tải Excel</button><button type="button" id="btnDot" class="btn">Tải file đợt đầy đủ</button>';
    $('locNguoi').value = KQ.nguoi;
    const key = dong.map(x => norm([x.id, x.ma, x.ten, x.lo, x.hoc, x.ghi].join(' ')));
    const hien = () => {
      const q = norm($('tim').value.trim()), kho = $('locKho').value, tk = $('locNguoi').value, st = $('locSt').value;
      return i => (!q || key[i].includes(q)) && (!kho || dong[i].kho === kho) && (!tk || dong[i].tk === tk) && (!st || dong[i].st === st);
    };
    const ve = () => veBang($('ds'), ['Mã dòng', 'Thời điểm', 'Kho', 'Hộc', 'Mã', 'Tên thuốc', 'Số lô', 'HSD', 'SL', 'ĐVT', 'Người đếm', 'Thao tác', 'Trạng thái', 'Ghi chú'],
      dong.map(x => [x.id, x.tg, x.kho, x.hoc, x.ma, x.ten, x.lo, x.hsd, soVNo(x.sl), x.dvt, x.nguoi, TT_TEN[x.tt] || x.tt, ST_TEN[x.st] || x.st, x.ghi]),
      hien(), i => chiTietDong(dong[i]), -1);
    $('tim').oninput = $('locKho').onchange = $('locSt').onchange = ve;
    $('locNguoi').onchange = () => { KQ.nguoi = $('locNguoi').value; ve(); };
    $('btnXuat').onclick = () => { const f = hien(); taiFile(soDongDem(dong.filter((x, i) => f(i))), tenFileDot('DONG-DEM')).catch(baoLoi); };
    $('btnDot').onclick = () => xuatExcel(S.dot).catch(baoLoi);
    return ve();
  }
  if (KQ.xem === 'nguoi') {
    const [cot, ...rows] = thongKeNguoi(dong);
    cc.innerHTML = '<button type="button" id="btnXuat" class="btn">Tải Excel</button>';
    $('btnXuat').onclick = () => taiFile({ THONG_KE: [cot].concat(rows) }, tenFileDot('THONG-KE-NGUOI')).catch(baoLoi);
    return veBang($('ds'), cot, rows.map(r => r.map(soVNo)), () => true, i => { KQ.nguoi = rows[i][0]; KQ.xem = 'dong'; veXemKq(); }, -1);
  }
  if (KQ.xem === 'thuoc') {
    const [cot, ...rows] = taoSoExcel(KQ.data).TONG_HOP, lech = cot.map((c, i) => /^Lệch /.test(c) ? i : -1).filter(i => i >= 0);
    cc.innerHTML = oTim() + locChon('locThuoc', 'Mọi thuốc', [['lech', 'Có lệch'], ['chua', 'Chưa đếm']]) + '<button type="button" id="btnXuat" class="btn">Tải Excel</button>';
    const key = rows.map(r => norm(r[0] + ' ' + r[1]));
    const hien = () => {
      const q = norm($('tim').value.trim()), loc = $('locThuoc').value;
      return i => (!q || key[i].includes(q)) && (loc !== 'lech' || lech.some(c => Number(rows[i][c]))) && (loc !== 'chua' || /^CHƯA ĐẾM/.test(rows[i][cot.length - 1]));
    };
    const ve = () => veBang($('ds'), cot, rows.map(r => r.map(soVNo)), hien(), () => {}, -1);
    $('tim').oninput = $('locThuoc').onchange = ve;
    $('btnXuat').onclick = () => { const f = hien(); taiFile({ TONG_HOP: [cot].concat(rows.filter((r, i) => f(i))) }, tenFileDot('TONG-HOP')).catch(baoLoi); };
    return ve();
  }
  // nhật ký: loaded the first time it is opened for this đợt
  cc.innerHTML = '';
  if (!KQ.nhatKy) {
    const dot = S.dot;
    let r;
    try { r = await goi('nhatKy'); } catch (e) { r = e; }
    if (mucMo !== 'ketQua' || KQ.xem !== 'nhatKy' || dot !== S.dot) return;
    if (r instanceof Error) return void ($('ds').innerHTML = `<p class="msg">${esc(r.message)}</p>`);
    KQ.nhatKy = r.list;
  }
  const nk = KQ.nhatKy, hd = [...new Set(nk.map(n => n.hanhDong))].map(h => [h, NHAT_KY_TEN[h] || h]).sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  cc.innerHTML = oTim() + locChon('locHd', 'Mọi thao tác', hd) + '<button type="button" id="btnXuat" class="btn">Tải Excel</button>';
  const key = nk.map(n => norm([n.tk, n.ten, n.chiTiet, NHAT_KY_TEN[n.hanhDong] || n.hanhDong].join(' ')));
  const hien = () => { const q = norm($('tim').value.trim()), h = $('locHd').value; return i => (!q || key[i].includes(q)) && (!h || nk[i].hanhDong === h); };
  const ve = () => veBang($('ds'), ['Thời điểm', 'Người', 'Thao tác', 'Chi tiết', 'Đợt'],
    nk.map(n => [n.tg, n.ten, NHAT_KY_TEN[n.hanhDong] || n.hanhDong, n.chiTiet, n.dot]), hien(), () => {}, -1);
  $('tim').oninput = $('locHd').onchange = ve;
  $('btnXuat').onclick = () => { const f = hien(); taiFile(soNhatKy(nk.filter((n, i) => f(i))), tenFileDot('NHAT-KY')).catch(baoLoi); };
  ve();
}
/** Read-only panel of one line, with the history of its lô in that kho (every line of the same mã and lô, oldest first). */
function chiTietDong(x) {
  const o = [['Mã dòng', x.id], ['Thời điểm', x.tg], ['Kho', x.kho], ['Hộc', x.hoc], ['Mã thuốc', x.ma], ['Tên thuốc', x.ten], ['Số lô', x.lo], ['HSD', x.hsd],
    ['Số hộp', x.hop], ['1 hộp có mấy', x.qc], ['Số lẻ', x.le], ['SL', soVNo(x.sl) + ' ' + x.dvt], ['Người đếm', x.nguoi + ' · ' + x.tk],
    ['Thao tác', TT_TEN[x.tt] || x.tt], ['Trạng thái', ST_TEN[x.st] || x.st], ['Bị thay bởi', x.thayBoi], ['Thay các dòng', x.seThay],
    ['Ghi chú', x.ghi], ['Cảnh báo', x.cb], ['Cập nhật', x.capNhat]].filter(r => r[1] !== '' && r[1] != null);
  const ls = KQ.data.dong.filter(y => y.kho === x.kho && y.ma === x.ma && y.lo === x.lo);
  moKhung('Dòng ' + x.id,
    `<table class="ds">${o.map(r => `<tr><th>${esc(r[0])}</th><td style="white-space:normal">${esc(r[1])}</td></tr>`).join('')}</table>
    <h2 class="muc-phu">Lịch sử lô ${esc(x.lo)}</h2><table class="ds" id="lichSuLo"><thead><tr><th>Mã dòng</th><th>Thời điểm</th><th>Hộc</th><th>SL</th><th>Người</th><th>Thao tác</th><th>Trạng thái</th></tr></thead><tbody>
    ${ls.map(y => `<tr><td>${esc(y.id)}</td><td>${esc(y.tg)}</td><td>${esc(y.hoc)}</td><td>${esc(soVNo(y.sl))}</td><td>${esc(y.nguoi)}</td><td>${esc(TT_TEN[y.tt] || y.tt)}</td><td>${esc(ST_TEN[y.st] || y.st)}</td></tr>`).join('')}</tbody></table>`);
}

// ===================================================================== menu: [key, label, draw()]
const MUC = [
  ['ketQua', 'Kết quả kiểm', veKetQua],
  ['taiKhoan', 'Tài khoản', veTaiKhoan],
  ['danhMuc', 'Danh mục thuốc', veDanhMuc],
  ['kho', 'Kho và hộc', veKho],
  ['soSanh', 'Số liệu so sánh', veSoSanh],
  ['dot', 'Đợt kiểm', veDot],
];

// ===================================================================== khởi động
$('btnLogin').onclick = () => dangNhap($('pin').value.trim());
$('pin').onkeydown = e => { if (e.key === 'Enter') $('btnLogin').click(); };
$('btnThoat').onclick = () => { pinNho.del(); location.reload(); };
$('dot').onchange = () => chonDot($('dot').value);
$('menu').onclick = e => { const b = e.target.closest('[data-muc]'); if (b) moMuc(b.dataset.muc); };
dangNhap(pinNho.get());
