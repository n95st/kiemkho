// Export of an đợt to Excel: sheet names, legacy columns, TONG_HOP numbers, TONG_HOP_LO grouping, date/lot cell types.
// Run:  TZ=Asia/Ho_Chi_Minh node --test tests/xuatexcel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

new vm.Script(readFileSync(new URL('../xuatexcel.js', import.meta.url), 'utf8')).runInThisContext();   // classic script, no SheetJS needed
const legacy = readFileSync(new URL('../legacy/Code.gs', import.meta.url), 'utf8');

let n = 0;
const dong = o => Object.assign({ id: 'D' + String(++n).padStart(5, '0'), tg: '30/10 08:00', tgDay: '2026-10-30 08:00:00', kho: 'CHAN', ma: 'A-1', ten: 'Thuốc A', lo: 'L1', hsd: '15/03/2027', hoc: 'A 1',
  hop: 1, qc: 10, le: 0, sl: 10, dvt: 'Viên', nguoi: 'Lan', tk: 'TK04', tt: 'LUU', st: 'HIEU_LUC', ghi: '', cb: '', seThay: '', thayBoi: '', req: 'r' + n, capNhat: '' }, o);
const data = o => Object.assign({
  dot: { id: 'DOT01', ten: 'Kiểm kho 10/2026', st: 'MO', kho: ['CHAN', 'LE'] },
  khos: [{ ma: 'CHAN', ten: 'Kho chẵn', tenNgan: 'CHẴN' }, { ma: 'LE', ten: 'Kho lẻ', tenNgan: 'LẺ' }],
  danhMuc: [['A-1', 'Thuốc A', 'Hộp', 10, 'Viên', 'CHAN', '8934567890123', 'iSOFH'], ['B-2', 'Thuốc B', 'Chai', '', 'Chai', '', '', 'iSOFH']],
  dong: [], hoc: [], thuocMoi: [], soSanh: [] }, o);
const col = (rows, name) => rows[0].indexOf(name);
const tong = rows => Object.fromEntries(rows.slice(1).map(r => [r[0], Object.fromEntries(rows[0].map((h, i) => [h, r[i]]))]));

test('ten_sheet', () => {
  assert.deepEqual(Object.keys(taoSoExcel(data())), ['TONG_HOP', 'TONG_HOP_LO', 'DONG', 'HOC', 'THUOC_MOI', 'LAN1', 'DANH_MUC']);
});

test('tieu_de_dong', () => {
  const want = JSON.parse(/const DONG_HEADER = (\[[^\]]*\])/.exec(legacy)[1].replace(/'/g, '"'));
  const s = taoSoExcel(data({ dong: [dong({})] }));
  assert.deepEqual(s.DONG[0], want);
  assert.equal(s.DONG[1].length, want.length);
  assert.equal(s.DONG[1][col(s.DONG, 'Số lô')], 'L1');
});

test('tong_hop_lech', () => {
  const s = taoSoExcel(data({ dong: [dong({ sl: 90 })], soSanh: [['CHAN', 'A-1', 'Thuốc A', 'L1', '15/03/2027', 100, 'Viên', 'A 1', 'Lan']] }));
  assert.deepEqual(s.TONG_HOP[0], ['Mã', 'Tên', 'ĐVT', 'Kho mặc định', 'CHẴN đợt này', 'CHẴN so sánh', 'Lệch CHẴN', 'LẺ đợt này', 'LẺ so sánh', 'Lệch LẺ', 'Tổng đợt này', 'Trạng thái']);
  const a = tong(s.TONG_HOP)['A-1'];
  assert.equal(a['CHẴN đợt này'], 90);
  assert.equal(a['CHẴN so sánh'], 100);
  assert.equal(a['Lệch CHẴN'], -10);
  assert.equal(a['Tổng đợt này'], 90);
  assert.equal(a['Trạng thái'], 'Đã đếm');
  assert.equal(tong(s.TONG_HOP)['B-2']['Trạng thái'], 'Chưa thấy');
});

test('tong_hop_chua_dem', () => {
  const s = taoSoExcel(data({ soSanh: [['LE', 'B-2', 'Thuốc B', 'L9', '', 5, 'Chai', '', '']] }));
  const b = tong(s.TONG_HOP)['B-2'];
  assert.equal(b['Trạng thái'], 'CHƯA ĐẾM (đợt so sánh có)');
  assert.equal(b['LẺ so sánh'], 5);
  assert.equal(b['Lệch LẺ'], -5);
});

test('tong_hop_chi_tinh_hieu_luc', () => {
  const s = taoSoExcel(data({ dong: [dong({ sl: 4 }), dong({ sl: 7, st: 'THAY_THE' }), dong({ sl: 9, st: 'CHO_DUYET' }), dong({ kho: 'LE', sl: 3 })] }));
  const a = tong(s.TONG_HOP)['A-1'];
  assert.deepEqual([a['CHẴN đợt này'], a['LẺ đợt này'], a['Tổng đợt này']], [4, 3, 7]);
  assert.equal(s.TONG_HOP_LO.length, 3);                                        // header + 2 groups, the THAY_THE/CHO_DUYET rows are out
});

test('tong_hop_lo_gop', () => {
  const s = taoSoExcel(data({ dong: [dong({ sl: 10, hoc: 'A 1' }), dong({ sl: 5, hoc: 'A 2' }), dong({ lo: 'L2', sl: 1 })] }));
  assert.deepEqual(s.TONG_HOP_LO[0], ['Kho', 'Mã', 'Tên', 'Số lô', 'HSD', 'SL', 'ĐVT', 'Số dòng']);
  assert.equal(s.TONG_HOP_LO.length, 3);
  const l1 = s.TONG_HOP_LO.find(r => r[3] === 'L1');
  assert.equal(l1[5], 15);
  assert.equal(l1[7], 2);
});

test('tong_hop_lo_thu_tu_kho_ma', () => {
  const s = taoSoExcel(data({ dong: [dong({ kho: 'LE', ma: 'A-1' }), dong({ ma: 'B-2' }), dong({ ma: 'A-1', lo: 'Z' })] }));
  assert.deepEqual(s.TONG_HOP_LO.slice(1).map(r => r[0] + r[1]), ['CHANA-1', 'CHANB-2', 'LEA-1']);
});

test('hsd_la_so_serial_va_lo_la_chu', () => {
  const s = taoSoExcel(data({ dong: [dong({ lo: '00123', hsd: '15/03/2027' }), dong({ hsd: '' })] }));
  assert.equal(s.DONG[1][col(s.DONG, 'HSD')], 46461);                            // 2027-03-15
  assert.equal(s.DONG[2][col(s.DONG, 'HSD')], '');
  assert.equal(s.DONG[1][col(s.DONG, 'Số lô')], '00123');
  assert.equal(typeof s.TONG_HOP_LO[1][3], 'string');
  assert.equal(xlNgay('31/12/2099'), 73050);
});

test('hoc_thuoc_moi_lan1_danh_muc', () => {
  const s = taoSoExcel(data({
    hoc: [{ kho: 'CHAN', hoc: 'A 1', st: 'XONG', nguoi: 'Lan', batDau: '30/10 08:00', xongLuc: '30/10 09:00', nguoiXong: 'Lan', ghi: '', batDauDay: '2026-10-30 08:00:00', xongLucDay: '' }],
    thuocMoi: [{ id: 'M001', tg: '30/10 08:10', tgDay: '2026-10-30 08:10:00', maDeXuat: 'X', ten: 'Mới', dvtn: 'Hộp', qc: 10, dvt: 'Viên', kho: 'CHAN', nguoi: 'Lan', st: 'CHO_DUYET', maChinhThuc: '', ghi: '' }],
    soSanh: [['CHAN', 'A-1', 'Thuốc A', '0042', '15/03/2027', 100, 'Viên', 'A 1', 'Lan']] }));
  assert.deepEqual(s.HOC[1], ['CHAN', 'A 1', 'XONG', 'Lan', xlGio('2026-10-30 08:00:00'), '', 'Lan', '']);   // empty xongLucDay stays empty
  assert.equal(s.THUOC_MOI[1][0], 'M001');
  assert.equal(s.THUOC_MOI[1][1], xlGio('2026-10-30 08:10:00'));
  assert.equal(s.LAN1[1][3], '0042');
  assert.equal(s.LAN1[1][4], 46461);
  assert.equal(s.DANH_MUC.length, 3);
  assert.deepEqual(s.DANH_MUC[1], data().danhMuc[0]);
});

test('ten_file', () => {
  assert.equal(tenFileExcel('Kiểm kho 10/2026'), 'KIEM-KHO-Kiểm kho 10-2026.xlsx');
  assert.equal(tenFileExcel('a:b*c?"d<e>f|g\\h'), 'KIEM-KHO-a-b-c--d-e-f-g-h.xlsx');
});

test('sach_excel_kieu_o', () => {
  globalThis.XLSX = createRequire(import.meta.url)('../vendor/sheetjs/xlsx.full.min.js');
  const wb = xlSach(taoSoExcel(data({ dong: [dong({ lo: '00123' })] })));
  const out = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  assert.deepEqual(out.SheetNames, ['TONG_HOP', 'TONG_HOP_LO', 'DONG', 'HOC', 'THUOC_MOI', 'LAN1', 'DANH_MUC']);
  const lo = out.Sheets.DONG.F2, hsd = out.Sheets.DONG.G2;
  assert.equal(lo.t, 's'); assert.equal(lo.v, '00123');
  assert.equal(hsd.t, 'n'); assert.equal(hsd.v, 46461); assert.equal(hsd.w, '15/03/2027');
});

test('thoi_diem_la_so_serial_co_phan_ngay', () => {
  assert.equal(xlGio('2026-12-31 23:45:00'), 46387 + (23 * 3600 + 45 * 60) / 86400);       // 2026-12-31 = serial 46387
  assert.equal(xlGio('2027-01-01 00:00:00'), 46388);
  assert.equal(xlGio(''), '');
  assert.equal(xlGio(undefined), '');
  const s = taoSoExcel(data({ dong: [dong({ tgDay: '2026-12-31 23:45:00' })] }));
  assert.equal(s.DONG[1][col(s.DONG, 'Thời điểm')], 46387 + 85500 / 86400);
  assert.equal(s.DONG[1][col(s.DONG, 'Cập nhật')], '');                                 // stays text, as in the legacy sheet
});

test('o_thoi_diem_co_dinh_dang_ngay_gio', () => {
  globalThis.XLSX = createRequire(import.meta.url)('../vendor/sheetjs/xlsx.full.min.js');
  const wb = xlSach(taoSoExcel(data({ dong: [dong({ tgDay: '2026-12-31 23:45:00' })], hoc: [{ kho: 'CHAN', hoc: 'A 1', st: 'XONG', nguoi: '', batDau: '', xongLuc: '', nguoiXong: '', ghi: '', batDauDay: '2026-12-31 23:45:00', xongLucDay: '' }] })));
  const out = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array', cellNF: true });
  assert.equal(out.Sheets.DONG.B2.t, 'n');
  assert.equal(out.Sheets.DONG.B2.z, 'dd/mm/yyyy hh:mm');
  assert.equal(out.Sheets.DONG.B2.w, '31/12/2026 23:45');
  assert.equal(out.Sheets.HOC.E2.w, '31/12/2026 23:45');
  assert.equal(out.Sheets.HOC.F2.t, 's');                                              // empty xong lúc: no number format on a text cell
});
