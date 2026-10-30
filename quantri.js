/* Màn cấu hình cho IT (tài khoản, danh mục, kho, hộc, cấu hình chung, số liệu so sánh).
 * Script thường nạp sau app.js, dùng api, esc, qtDocExcel của chung.js và ask, toast, S, isIT, loadDm, loadQl, applyLogin, search của app.js.
 * Máy chủ vẫn từ chối người không phải IT; việc ẩn nút chỉ để gọn giao diện. */
'use strict';

const QT_VAI = { DEM: 'Người đếm', TO_TRUONG: 'Tổ trưởng', IT: 'IT', TAP: 'Tập (không tính)' };
const qtInput = (id, label, val, attrs) => `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" value="${esc(val)}" autocomplete="off"${attrs || ''}></div>`;
const qtSelect = (id, label, opts, cur) => `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}">${opts.map(o =>
  `<option value="${esc(o[0])}"${o[0] === cur ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
const qtText = (id, label, val) => `<div class="field"><label for="${id}">${esc(label)}</label><textarea id="${id}" rows="5" autocomplete="off">${esc(val)}</textarea></div>`;
const qtV = id => $(id).value.trim();
const qtKhoOpts = () => ((S.user && S.user.khos) || []).map(k => [k.ma, k.tenNgan]);
const qtLoi = e => toast(e.message, 'bad', null, 5000);

/** Ô cấu hình trong tab Quản lý (chỉ IT); mỗi nút gọi một hàm bên dưới. */
const QT_NUT = [['qtTaiKhoan', 'Tài khoản'], ['qtDanhMuc', 'Danh mục'], ['qtKho', 'Kho'], ['qtHoc', 'Hộc'], ['qtCauHinh', 'Cấu hình chung'], ['qtSoSanh', 'Số liệu so sánh']];
function qtMenu() {
  return `<details open><summary>Cấu hình</summary><div class="inner"><div class="qitem"><div class="qa">${QT_NUT.map(n => `<button class="btn small" data-qt="${n[0]}">${esc(n[1])}</button>`).join('')}</div></div></div></details>`;
}
$('qlCfg').addEventListener('click', e => {
  const t = e.target.closest('[data-qt]'), n = t && QT_NUT.find(x => x[0] === t.dataset.qt);
  if (n && isIT()) window[n[0]]();
});

/** Hộp thoại danh sách: bấm phần tử có data-pick thì đóng hộp và trả giá trị đó. after() chạy khi hộp đã hiện. */
async function qtList(title, body, buttons, after) {
  let pick = null;
  const p = ask(title, body, buttons.concat([{ text: 'Đóng', cls: 'ghost', value: () => pick }]));
  $('mBody').onclick = e => { const t = e.target.closest('[data-pick]'); if (t) { pick = t.dataset.pick; $('mBtns').lastChild.click(); } };
  if (after) after();
  const v = await p; $('mBody').onclick = null; return v;
}
/** Hộp thoại biểu mẫu: check() trả câu báo lỗi (hoặc rỗng); collect() lấy giá trị khi bấm nút chính. */
const qtForm = (title, body, okText, collect, check, extra) => ask(title, body + '<p id="qtMsg" class="msg"></p>',
  [{ text: okText, cls: 'primary', value: collect, check: () => { const m = check ? check() : ''; $('qtMsg').textContent = m || ''; return !m; } }]
    .concat(extra || [], [{ text: 'Huỷ', cls: 'ghost', value: null }]));
/** Sau khi đổi kho hoặc cấu hình: lấy lại dữ liệu đăng nhập để app dùng giá trị mới. */
async function qtLamMoi() { const r = await api('login'); if (r.ok) { applyLogin(r); if (!$('tab-ql').classList.contains('hidden')) loadQl(); } }
const qtGoi = async (action, data, timeout) => { const r = await api(action, data, timeout); if (!r.ok) throw new Error(r.error); return r; };
const qtDongLoi = (loi, so) => loi.length ? '<div class="msg">' + loi.map(x => `Dòng ${esc(so ? so[x.dong - 1] : x.dong)}: ${esc(x.error)}`).join('<br>') + '</div>' : '';

const qtFileBody = () => '<div class="field"><label for="qtFile">Tệp Excel</label><input id="qtFile" type="file" accept=".xlsx,.xls"></div>';
const qtHoiFile = (title, extraBody, extraCheck) => ask(title, (extraBody || '') + qtFileBody() + '<p id="qtMsg" class="msg"></p>',
  [{ text: 'Nhập', cls: 'primary', value: () => $('qtFile').files[0],
    check: () => { const m = !$('qtFile').files[0] ? 'Chọn tệp Excel' : extraCheck ? extraCheck() : ''; $('qtMsg').textContent = m || ''; return !m; } },
  { text: 'Huỷ', cls: 'ghost', value: null }]);
const qtKetQua = body => ask('Kết quả nhập', body, [{ text: 'Đóng', cls: 'primary', value: true }]);

// ===================================================================== Tài khoản
async function qtTaiKhoan() {
  for (;;) {
    let r; try { r = await qtGoi('dsTaiKhoan'); } catch (e) { return qtLoi(e); }
    const body = r.list.map(t => `<div class="qitem flex items-center justify-between gap-2"><span><b>${esc(t.ten)}</b> <span class="muted small">${esc(t.tk)} · ${esc(t.roleTen)}${t.active ? '' : ' · Đã khoá'}</span></span>
      <button class="btn small" data-pick="${esc(t.tk)}">Sửa</button></div>`).join('');
    const v = await qtList('Tài khoản', body, [{ text: 'Thêm tài khoản', icon: 'plus', cls: 'primary', value: '+' }]);
    if (!v) return;
    const t = v === '+' ? null : r.list.find(x => x.tk === v);
    if (v === '+' || t) await qtSuaTaiKhoan(t);
  }
}
const qtHienPin = (ten, pin) => ask('PIN của ' + ten, `<div id="qtPin" class="text-center text-3xl font-semibold tracking-widest">${esc(pin)}</div>`, [{ text: 'Đóng', cls: 'primary', value: true }]);
async function qtSuaTaiKhoan(t) {
  const body = qtInput('qtTen', 'Tên hiển thị', t ? t.ten : '') + qtSelect('qtVai', 'Vai trò', Object.entries(QT_VAI), t ? t.role : 'DEM')
    + qtInput('qtGhi', 'Ghi chú', t ? t.ghiChu : '')
    + (t ? `<label class="tiny"><input type="checkbox" id="qtAct"${t.active ? ' checked' : ''}><span>Đang hoạt động</span></label>` : '');
  const v = await qtForm(t ? 'Sửa tài khoản' : 'Thêm tài khoản', body, 'Lưu',
    () => ({ tk: t ? t.tk : '', ten: qtV('qtTen'), role: $('qtVai').value, ghiChu: qtV('qtGhi'), active: t ? $('qtAct').checked : undefined }),
    () => qtV('qtTen') ? '' : 'Nhập tên hiển thị', t ? [{ text: 'Đặt lại PIN', cls: 'danger', value: 'pin' }] : []);
  if (!v) return;
  try {
    if (v === 'pin') {
      if (!await ask('Đặt lại PIN của ' + t.ten + '?', '', [{ text: 'Đặt lại', cls: 'danger', value: true }, { text: 'Huỷ', cls: 'ghost', value: false }])) return;
      await qtHienPin(t.ten, (await qtGoi('datLaiPin', { tk: t.tk })).pin); return;
    }
    const r = await qtGoi('luuTaiKhoan', v);
    if (!t) await qtHienPin(r.taiKhoan.ten, r.taiKhoan.pin); else toast('Đã lưu', 'ok');
  } catch (e) { qtLoi(e); }
}

// ===================================================================== Danh mục
async function qtDanhMuc() {
  let q = '';
  for (;;) {
    const draw = () => { $('qtRes').innerHTML = search(q).map(o => `<div class="qitem flex items-center justify-between gap-2"><span><b>${esc(o.ma)}</b> ${esc(o.ten)} <span class="muted small">${esc(o.dvt)}</span></span>
      <button class="btn small" data-pick="${esc(o.ma)}">Sửa</button></div>`).join(''); };
    const v = await qtList('Danh mục', `<div class="field"><input id="qtQ" type="search" value="${esc(q)}" placeholder="Gõ tên hoặc mã thuốc…" aria-label="Tìm thuốc" autocomplete="off"></div><div id="qtRes"></div>`,
      [{ text: 'Thêm thuốc', icon: 'plus', cls: 'primary', value: '+' }, { text: 'Nhập từ Excel', icon: 'file', value: 'xlsx' }],
      () => { draw(); $('qtQ').oninput = () => { q = $('qtQ').value; draw(); }; });
    if (!v) return;
    if (v === 'xlsx') await qtNhapDanhMuc(); else if (v === '+') await qtSuaThuoc(null); else if (S.dmMap[v]) await qtSuaThuoc(S.dmMap[v]);
  }
}
async function qtSuaThuoc(o) {
  const dvts = DVT_LIST.includes(o && o.dvt) || !o || !o.dvt ? DVT_LIST : DVT_LIST.concat(o.dvt);
  const body = qtInput('qtMa', 'Mã', o ? o.ma : '', o ? ' readonly' : ' autocapitalize="characters"') + qtInput('qtTen', 'Tên thuốc', o ? o.ten : '')
    + qtInput('qtDvtn', 'ĐVT nhập', o ? o.dvtn : '') + qtInput('qtQc', 'Quy cách', o ? o.qc : '', ' inputmode="decimal"')
    + qtSelect('qtDvt', 'ĐVT nhỏ nhất', dvts.map(x => [x, x]), o ? o.dvt : dvts[0])
    + qtSelect('qtKho', 'Kho mặc định', [['', '']].concat(qtKhoOpts()), o ? o.kho : '') + qtInput('qtGtin', 'Mã vạch GTIN', o ? o.gtin : '');
  const v = await qtForm(o ? 'Sửa thuốc' : 'Thêm thuốc', body, 'Lưu',
    () => ({ ma: qtV('qtMa'), ten: qtV('qtTen'), dvtn: qtV('qtDvtn'), qc: qtV('qtQc'), dvt: $('qtDvt').value, kho: $('qtKho').value, gtin: qtV('qtGtin') }),
    () => !qtV('qtMa') ? 'Nhập mã thuốc' : !qtV('qtTen') ? 'Nhập tên thuốc' : '');
  if (!v) return;
  try { await qtGoi('luuThuoc', v); await loadDm(true); toast('Đã lưu', 'ok'); } catch (e) { qtLoi(e); }
}
async function qtNhapDanhMuc() {
  const f = await qtHoiFile('Nhập danh mục từ Excel');
  if (!f) return;
  try {
    const { list, so } = await qtDocExcel(f);
    const r = await qtGoi('nhapThuoc', { list }, 180000);
    await loadDm(true);
    await qtKetQua(`<p>Thêm ${r.them} · Sửa ${r.sua} · Lỗi ${r.loi.length}</p>` + qtDongLoi(r.loi, so));
  } catch (e) { qtLoi(e); }
}

// ===================================================================== Kho
async function qtKho() {
  for (;;) {
    const body = ((S.user && S.user.khos) || []).map(k => `<div class="qitem flex items-center justify-between gap-2"><span><b>${esc(k.ten)}</b> <span class="muted small">${esc(k.ma)} · ${esc(k.tenNgan)}</span></span>
      <button class="btn small" data-pick="${esc(k.ma)}">Sửa</button></div>`).join('');
    const v = await qtList('Kho', body, [{ text: 'Thêm kho', icon: 'plus', cls: 'primary', value: '+' }]);
    if (!v) return;
    const k = v === '+' ? null : S.user.khos.find(x => x.ma === v);
    if (v === '+' || k) await qtSuaKho(k);
  }
}
async function qtSuaKho(k) {
  const body = qtInput('qtMa', 'Mã kho', k ? k.ma : '', k ? ' readonly' : ' autocapitalize="characters"') + qtInput('qtTen', 'Tên kho', k ? k.ten : '')
    + qtInput('qtNgan', 'Tên ngắn', k ? k.tenNgan : '') + qtInput('qtThuTu', 'Thứ tự', '', ' inputmode="numeric"')
    + `<label class="tiny"><input type="checkbox" id="qtAct" checked><span>Đang dùng</span></label>`;
  const v = await qtForm(k ? 'Sửa kho' : 'Thêm kho', body, 'Lưu',
    () => ({ ma: qtV('qtMa'), ten: qtV('qtTen'), tenNgan: qtV('qtNgan'), thuTu: qtV('qtThuTu'), hoatDong: $('qtAct').checked }),
    () => !qtV('qtMa') ? 'Nhập mã kho' : !qtV('qtTen') ? 'Nhập tên kho' : !qtV('qtNgan') ? 'Nhập tên ngắn' : '');
  if (!v) return;
  try { await qtGoi('luuKho', v); await qtLamMoi(); toast('Đã lưu', 'ok'); } catch (e) { qtLoi(e); }
}

// ===================================================================== Hộc
async function qtHoc() {
  if (!khoOfDot().length) return;
  let kho = khoOfDot().includes(S.kho) ? S.kho : khoOfDot()[0];
  const ve = async () => {
    const box = $('qtHocDs'); if (!box) return;
    try {
      const r = await qtGoi('dsHoc', { kho });
      box.innerHTML = r.list.map(x => `<div class="qitem flex items-center justify-between gap-2"><span><b>${esc(x.hoc)}</b> <span class="muted small">${esc(HOC_ST_TEN[x.st])}</span></span>
        ${x.st === 'CHUA_NHAN' ? `<button class="btn small danger" data-pick="${esc(x.hoc)}">Xoá</button>` : ''}</div>`).join('');
    } catch (e) { box.innerHTML = `<p class="msg">${esc(e.message)}</p>`; }
  };
  const body = qtSelect('qtKhoHoc', 'Kho', khoOfDot().map(k => [k, KHO_TEN[k]]), kho) + qtText('qtHocs', 'Danh sách hộc, mỗi dòng một hộc', '') + '<div id="qtHocDs"></div>';
  const p = qtList('Hộc', body, [{ text: 'Thêm', icon: 'plus', cls: 'primary', value: () => ({ kho: $('qtKhoHoc').value, them: $('qtHocs').value.split('\n').map(x => x.trim()).filter(Boolean) }) }], () => {
    ve(); $('qtKhoHoc').onchange = () => { kho = $('qtKhoHoc').value; ve(); };
  });
  // a row's Xoá button resolves the dialog with its hộc name; delete it and reopen the dialog
  const v = await p;
  if (!v) return;
  try {
    if (typeof v === 'string') { await qtGoi('luuHoc', { kho, xoa: [v] }); toast('Đã xoá hộc ' + v, 'ok'); return qtHoc(); }
    if (!v.them.length) return;
    const r = await qtGoi('luuHoc', v);
    toast('Đã thêm ' + r.them + ' hộc', 'ok');
  } catch (e) { qtLoi(e); }
}

// ===================================================================== Cấu hình chung
async function qtCauHinh() {
  const u = S.user || {}, ds = a => (Array.isArray(a) ? a : []).join(', ');
  const cur = { HSD_CANH_BAO_NGAY: String(u.hsdCanhBao == null ? '' : u.hsdCanhBao), HSD_MAC_DINH: String(u.hsdMacDinh || ''), LO_MAC_DINH: String(u.loMacDinh || ''), LO_NGHI: ds(u.loNghi), DVT_LIST: ds(u.dvt) };
  const body = qtInput('qtHsd', 'Cảnh báo HSD còn dưới (ngày)', cur.HSD_CANH_BAO_NGAY, ' inputmode="numeric"') + qtInput('qtHsdMd', 'HSD mặc định', cur.HSD_MAC_DINH)
    + qtInput('qtLo', 'Số lô mặc định', cur.LO_MAC_DINH) + qtText('qtNghi', 'Chữ nghi là số lô, cách nhau bằng dấu phẩy', cur.LO_NGHI) + qtText('qtDvtList', 'Đơn vị tính, cách nhau bằng dấu phẩy', cur.DVT_LIST);
  const tach = id => qtV(id).split(',').map(x => x.trim()).filter(Boolean);
  const v = await qtForm('Cấu hình chung', body, 'Lưu', () => ({ HSD_CANH_BAO_NGAY: qtV('qtHsd'), HSD_MAC_DINH: qtV('qtHsdMd'), LO_MAC_DINH: qtV('qtLo'), LO_NGHI: tach('qtNghi'), DVT_LIST: tach('qtDvtList') }));
  if (!v) return;
  try {
    for (const khoa of Object.keys(v)) {                      // send only the keys that changed
      if ((Array.isArray(v[khoa]) ? v[khoa].join(', ') : v[khoa]) !== cur[khoa]) await qtGoi('luuCauHinh', { khoa, giaTri: v[khoa] });
    }
    await qtLamMoi(); toast('Đã lưu', 'ok');
  } catch (e) { qtLoi(e); await qtLamMoi().catch(() => {}); }
}

// ===================================================================== Số liệu so sánh
async function qtSoSanh() {
  const f = await qtHoiFile('Nhập số liệu so sánh từ Excel');
  if (!f) return;
  try {
    const { list, so } = await qtDocExcel(f, 4);              // columns: Kho, Mã, Tên, Số lô, HSD, SL, ĐVT, Hộc, Người đếm
    const ks = khoOfDot(), theoKho = {}, loi = [];
    list.forEach((r, i) => {
      const k = r[0].toUpperCase();
      if (!ks.includes(k)) loi.push({ dong: i + 1, error: 'Kho ' + (r[0] || '(trống)') + ' không có trong đợt này' });
      else (theoKho[k] = theoKho[k] || { rows: [], so: [] }, theoKho[k].rows.push(r.slice(1)), theoKho[k].so.push(so[i]));
    });
    let html = '';
    if (loi.length) html = '<p>Chưa nhập gì</p>' + qtDongLoi(loi, so);
    else for (const k of Object.keys(theoKho)) {
      const r = await qtGoi('nhapSoSanh', { kho: k, list: theoKho[k].rows }, 180000);
      html += `<p>${esc(KHO_TEN[k])}: ${r.soDong} dòng</p>` + qtDongLoi(r.loi, theoKho[k].so);
    }
    await qtKetQua(html || '<p>Tệp không có dòng nào</p>');
  } catch (e) { qtLoi(e); }
}
