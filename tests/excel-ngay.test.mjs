// Excel date cells must convert to DD/MM/YYYY without time-zone drift (SheetJS Dates are off by 7:06:30 in Asia/Ho_Chi_Minh).
// Run:  TZ=Asia/Ho_Chi_Minh node --test tests/excel-ngay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

globalThis.XLSX = createRequire(import.meta.url)('../vendor/sheetjs/xlsx.full.min.js');
globalThis.$ = () => ({ addEventListener() {} });               // quantri.js binds #qlCfg at load time
new vm.Script(readFileSync(new URL('../quantri.js', import.meta.url), 'utf8')).runInThisContext();

const serial = (d, m, y) => Date.UTC(y, m - 1, d) / 864e5 + 25569;      // 1900 date system, pure arithmetic
const book = (cells, date1904) => {
  const ws = XLSX.utils.aoa_to_sheet([['Mã', 'HSD'], ...cells.map(c => ['X', c])]);
  cells.forEach((c, i) => { if (typeof c === 'number') ws['B' + (i + 2)].z = 'dd/mm/yyyy'; });
  const wb = { SheetNames: ['S'], Sheets: { S: ws }, Workbook: { WBProps: { date1904: !!date1904 } } };
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
};

test('so_serial_ra_dung_ngay', () => {
  const want = [[15, 3, 2027], [1, 1, 2027], [31, 12, 2099], [29, 2, 2028]];
  const rows = oExcelDoc(book(want.map(([d, m, y]) => serial(d, m, y))), 1);
  assert.deepEqual(rows.map(r => r[1]), ['15/03/2027', '01/01/2027', '31/12/2099', '29/02/2028']);
});
test('chu_giu_nguyen_va_so_o_cot_khac_thanh_chu', () => {
  const rows = oExcelDoc(book(['15/04/2027', serial(1, 5, 2027)]), 1);
  assert.equal(rows[0][1], '15/04/2027');
  assert.equal(oExcelSangChu(120, 5, 1, false), '120');
});
test('he_ngay_1904', () => {
  const rows = oExcelDoc(book([serial(15, 3, 2027) - 1462], true), 1);
  assert.equal(rows[0][1], '15/03/2027');
});
