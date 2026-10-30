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
  try { TK.list = (await goi('dsTaiKhoan')).list; } catch (e) { $('ds').innerHTML = `<p class="msg">${esc(e.message)}</p>`; return; }
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

// ===================================================================== menu: [key, label, draw()]
const MUC = [
  ['taiKhoan', 'Tài khoản', veTaiKhoan],
  ['danhMuc', 'Danh mục thuốc', async () => {}],
  ['kho', 'Kho và hộc', async () => {}],
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
