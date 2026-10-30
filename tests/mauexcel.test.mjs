// Template, list export, header check and kho split for the desktop admin page (quantri.html).
// Every template and export must read back through the import reader (oExcelDoc) unchanged.
// Run:  TZ=Asia/Ho_Chi_Minh node --test tests/mauexcel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

globalThis.XLSX = createRequire(import.meta.url)('../vendor/sheetjs/xlsx.full.min.js');
for (const f of ['../chung.js', '../xuatexcel.js']) new vm.Script(readFileSync(new URL(f, import.meta.url), 'utf8')).runInThisContext();

const vong = (sheets, cotNgay) => oExcelDoc(XLSX.write(xlSach(sheets), { type: 'array', bookType: 'xlsx' }), cotNgay);

test('vong_danh_muc', () => {
  const list = [['00045', 'Thuốc A', 'Hộp', 10, 'Viên', 'CHAN', '0893456789012'], ['B-2', 'Thuốc B', 'Chai', '', 'Chai', '', '']];
  const rows = vong(soDanhMuc(list));
  assert.ok(dungTieuDe(rows[0], DANH_MUC_MAU_HEADER));
  assert.deepEqual(rows.slice(1), list.map(r => r.map(String)));
});
test('vong_so_sanh', () => {
  const list = [['CHAN', 'TT-0001', 'Para', '00123', '15/03/2027', 10.5, 'Viên', 'A 1', 'Lan'], ['LE', 'TT-0009', 'Vit C', 'V1', '', 7, 'Viên', '', '']];
  const rows = vong(soSoSanh(list), 4);
  assert.ok(dungTieuDe(rows[0], LAN1_HEADER));
  assert.deepEqual(rows.slice(1), list.map(r => r.map(String)));
});
test('mau_co_dong_vi_du', () => {
  assert.equal(timDongViDu(vong(soDanhMuc([VIDU_DANH_MUC])).slice(1), [2], 0), 2);
  assert.equal(timDongViDu(vong(soSoSanh([VIDU_SO_SANH]), 4).slice(1), [2], 1), 2);
  assert.equal(timDongViDu([['TT-1'], ['vidu']], [2, 5], 0), 5);
  assert.equal(timDongViDu([['TT-1']], [2], 0), 0);
});
test('tieu_de_lech', () => {
  assert.ok(dungTieuDe([' Mã ', 'Tên thuốc', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho mặc định (CHAN/LE)', 'Mã vạch GTIN (tự học khi quét)', '', ''], DANH_MUC_MAU_HEADER));
  assert.ok(!dungTieuDe(LAN1_HEADER, DANH_MUC_MAU_HEADER));
  assert.ok(!dungTieuDe(DANH_MUC_MAU_HEADER, LAN1_HEADER));
  assert.ok(!dungTieuDe([], LAN1_HEADER));
});
test('tach_theo_kho', () => {
  const r = tachTheoKho([[' chan', 'A'], ['LE', 'B'], ['CHAN', 'C']], [2, 3, 5], ['CHAN', 'LE']);
  assert.deepEqual(r, { loi: [], nhieuKho: [{ kho: 'CHAN', list: [['A'], ['C']], so: [2, 5] }, { kho: 'LE', list: [['B']], so: [3] }] });
  assert.deepEqual(tachTheoKho([['K9', 'A'], ['', 'B']], [2, 4], ['CHAN']).loi,
    [{ dong: 2, error: 'Kho K9 không có trong đợt này' }, { dong: 4, error: 'Kho (trống) không có trong đợt này' }]);
});
test('doi_dong_loi', () => {
  const nk = [{ kho: 'CHAN', list: [[], []], so: [2, 5] }, { kho: 'LE', list: [[]], so: [3] }];
  assert.deepEqual(doiDongLoi([{ kho: 'CHAN', dong: 2, error: 'x' }, { kho: 'LE', dong: 1, error: 'y' }], nk),
    [{ dong: 3, error: 'y' }, { dong: 5, error: 'x' }]);
});
test('tai_khoan_khong_co_pin', () => {
  const s = soTaiKhoan([{ tk: 'TK04', ten: 'Lan', pin: '444444', role: 'DEM', roleTen: 'Người đếm', active: false, ghiChu: 'ca tối' }]);
  assert.deepEqual(s.TAI_KHOAN, [['Mã TK', 'Tên', 'Vai trò', 'Trạng thái', 'Ghi chú'], ['TK04', 'Lan', 'Người đếm', 'Đã khoá', 'ca tối']]);
  assert.ok(!JSON.stringify(s).includes('444444'));
});
test('thong_ke_nguoi', () => {
  const d = (tk, nguoi, ma, hoc, st, tgDay) => ({ tk, nguoi, ma, hoc, st, tgDay });
  const rows = thongKeNguoi([
    d('TK04', 'Lan', 'A', 'A 1', 'HIEU_LUC', '2026-10-30 08:05:00'), d('TK04', 'Lan', 'B', 'A 1', 'HIEU_LUC', '2026-10-30 09:00:00'),
    d('TK04', 'Lan', 'A', 'A 2', 'HUY', '2026-10-30 08:30:00'), d('TK04', 'Lan', 'C', 'A 3', 'THAY_THE', '2026-10-30 07:59:00'),
    d('TK05', 'Minh', 'A', 'B 1', 'CHO_DUYET', '2026-10-30 10:00:00'), d('TK05', 'Minh', 'A', 'B 1', 'TU_CHOI', '2026-10-30 10:10:00')]);
  assert.deepEqual(rows[0], ['Mã TK', 'Người đếm', 'Dòng đang tính', 'Số mã', 'Số hộc', 'Chờ duyệt', 'Đã huỷ', 'Bị thay', 'Từ chối', 'Bắt đầu', 'Lần cuối']);
  // counted mã and hộc come from the lines still in force; start and end span every line of the person
  assert.deepEqual(rows.slice(1), [['TK04', 'Lan', 2, 2, 1, 0, 1, 1, 0, '30/10 07:59', '30/10 09:00'], ['TK05', 'Minh', 0, 0, 0, 1, 0, 0, 1, '30/10 10:00', '30/10 10:10']]);
});
test('so_dong_dem_giong_sheet_dong', () => {
  const x = { id: 'D00001', tgDay: '2026-10-30 08:00:00', kho: 'CHAN', ma: 'A-1', ten: 'Thuốc A', lo: '00123', hsd: '15/03/2027', hoc: 'A 1', hop: 1, qc: 10, le: 0, sl: 10,
    dvt: 'Viên', nguoi: 'Lan', tk: 'TK04', tt: 'CONG_THEM', st: 'HIEU_LUC', thayBoi: '', ghi: 'ghi', cb: '', req: 'r1', capNhat: '', seThay: '' };
  assert.deepEqual(soDongDem([x]).DONG, taoSoExcel({ dong: [x] }).DONG);
});
test('so_nhat_ky', () => {
  assert.deepEqual(soNhatKy([{ tg: '30/10/2026 08:00', tk: 'TK01', ten: 'IT', hanhDong: 'CHOT_KHO', chiTiet: 'CHAN', dot: 'DOT01' }]).NHAT_KY,
    [['Thời điểm', 'Mã TK', 'Người', 'Thao tác', 'Chi tiết', 'Đợt'], ['30/10/2026 08:00', 'TK01', 'IT', 'Chốt kho', 'CHAN', 'DOT01']]);
});
