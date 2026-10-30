import test from 'node:test';
import assert from 'node:assert/strict';
await import('../canxem.js');
const tinh = globalThis.tinhCanXem;

const cfg = { khoTen: { CHAN: 'Kho chẵn', LE: 'Kho lẻ' }, loNghi: ['MFG', 'MFD', 'NSX', 'EXP', 'HSD', 'LOT', 'BATCH'] };
let n = 0;
const dong = (o) => Object.assign({ id: 'D' + String(++n).padStart(5, '0'), tg: '', kho: 'CHAN', ma: 'A-1', ten: 'Thuốc A', lo: 'L1', hsd: '15/03/2027',
  hoc: 'A1', hop: '', qc: '', le: '', sl: 10, dvt: 'Viên', nguoi: 'N1', tk: 'TK04', tt: 'LUU', st: 'HIEU_LUC', ghi: '', cb: '', seThay: '' }, o);
const data = (o) => Object.assign({ live: [], soSanh: {}, dm: {}, soVoi: 'Đợt cũ', choDuyet: 0 }, o);
const loai = (r, k) => r.items.filter((x) => x.loai === k);

test('hai_hsd_cung_lo', () => {
  const r = tinh(data({ live: [dong({ lo: 'L1', hsd: '01/01/2027' }), dong({ lo: 'l 1', hsd: '02/02/2027' })] }), cfg);
  const x = loai(r, 'HSD_KHAC');
  assert.equal(x.length, 1);
  assert.equal(x[0].muc, 3);
  assert.equal(x[0].chiTiet, 'Cùng lô nhưng HSD: 01/01/2027 / 02/02/2027');
});

test('lo_gan_giong', () => {
  let r = tinh(data({ live: [dong({ lo: 'ABC123' }), dong({ lo: 'ABC124' })] }), cfg);
  assert.equal(loai(r, 'LO_GAN_GIONG').length, 1);
  assert.equal(loai(r, 'LO_GAN_GIONG')[0].lo2, 'ABC124');
  r = tinh(data({ live: [dong({ lo: 'AB1' }), dong({ lo: 'AB2' })] }), cfg);
  assert.equal(loai(r, 'LO_GAN_GIONG').length, 0);
});

test('lo_nghi', () => {
  assert.equal(loai(tinh(data({ live: [dong({ lo: 'EXP2027' })] }), cfg), 'LO_NGHI').length, 1);
  assert.equal(loai(tinh(data({ live: [dong({ lo: '1/5/27' })] }), cfg), 'LO_NGHI').length, 1);
  assert.equal(loai(tinh(data({ live: [dong({ lo: 'AB' })] }), cfg), 'LO_NGHI').length, 1);
  assert.equal(loai(tinh(data({ live: [dong({ lo: 'ABC' })] }), cfg), 'LO_NGHI').length, 0);
  // word list comes from cfg, regex specials are escaped
  const c2 = { khoTen: cfg.khoTen, loNghi: ['A.C'] };
  assert.equal(loai(tinh(data({ live: [dong({ lo: 'XABCX' })] }), c2), 'LO_NGHI').length, 0);
  assert.equal(loai(tinh(data({ live: [dong({ lo: 'XA.CX' })] }), c2), 'LO_NGHI').length, 1);
});

test('lech_so_sanh', () => {
  const r = tinh(data({ live: [dong({ sl: 90 })], soSanh: { 'A-1': { sl: 100, dvt: 'Viên' } } }), cfg);
  assert.equal(r.lech[0].loai, 'LECH_LAN1');
  assert.equal(r.lech[0].chiTiet, 'Đợt cũ: 100 Viên → đợt này: 90 Viên');
  assert.equal(r.chuaDem.length, 0);
});

test('moi_so_lan1', () => {
  const r = tinh(data({ live: [dong({ ma: 'B-2', sl: 4 })], soSanh: { 'A-1': { sl: 1, dvt: 'Viên' } } }), cfg);
  assert.equal(r.lech.filter((x) => x.loai === 'MOI_SO_LAN1').length, 1);
});

test('chua_dem', () => {
  const r = tinh(data({ soSanh: { 'Z-9': { sl: 7, dvt: 'Hộp' } }, dm: { 'Z-9': { ten: 'Thuốc Z', qc: '', kho: '' } } }), cfg);
  assert.deepEqual(r.chuaDem, [{ ma: 'Z-9', ten: 'Thuốc Z', lan1: 7, dvt: 'Hộp' }]);
});

test('sai_kho_va_qc_khac', () => {
  const r = tinh(data({ live: [dong({ hop: 2, qc: 50, sl: 100 })], dm: { 'A-1': { ten: 'Thuốc A', qc: 100, kho: 'LE' } } }), cfg);
  assert.equal(loai(r, 'SAI_KHO')[0].chiTiet, 'Danh mục ghi thuộc Kho lẻ');
  assert.equal(loai(r, 'QC_KHAC').length, 1);
});

test('nhieu_hoc_va_cung_hoc_khac_nguoi', () => {
  let r = tinh(data({ live: [dong({ hoc: 'A1' }), dong({ hoc: 'B2' })] }), cfg);
  assert.equal(loai(r, 'NHIEU_HOC').length, 1);
  r = tinh(data({ live: [dong({ tk: 'TK04' }), dong({ tk: 'TK05', nguoi: 'N2' })] }), cfg);
  assert.equal(loai(r, 'CUNG_HOC_KHAC_NGUOI').length, 1);
});

test('sap_xep', () => {
  const r = tinh(data({ live: [
    dong({ ma: 'B-1', ten: 'B', lo: 'EXP1' }),
    dong({ ma: 'A-1', ten: 'A', lo: 'L1', hsd: '01/01/2027' }), dong({ ma: 'A-1', ten: 'A', lo: 'L1', hsd: '02/02/2027' }),
  ] }), cfg);
  assert.equal(r.items[0].loai, 'HSD_KHAC');
  assert.deepEqual(r.items.map((x) => x.muc), r.items.map((x) => x.muc).sort((a, b) => b - a));
});

test('cho_duyet_chuyen_tiep', () => {
  assert.equal(tinh(data({ choDuyet: 3 }), cfg).choDuyet, 3);
});
