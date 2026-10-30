// E2E test of the IT configuration screens (quantri.js) against the local Supabase stack.
// Run from the repo root after `supabase db reset`:  node tests/e2e/quantri.mjs
import { chromium } from 'playwright';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8766, BASE = `http://127.0.0.1:${PORT}/`;
const env = Object.fromEntries(execSync('supabase status -o env 2>/dev/null', { encoding: 'utf8' })
  .split('\n').map(l => l.match(/^(\w+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const CONFIG_JS = `window.KK_CONFIG = ${JSON.stringify({ SUPABASE_URL: env.API_URL, SUPABASE_KEY: env.ANON_KEY })};`;
const sql = q => execFileSync('docker', ['exec', 'supabase_db_kiem_kho', 'psql', '-U', 'postgres', '-At', '-c', q], { encoding: 'utf8' }).trim();

// Test workbooks (openpyxl): drugs for the danh mục import, one HSD cell is a real date
const dir = mkdtempSync(join(tmpdir(), 'kk-quantri-'));
const XLSX_DM = join(dir, 'danh-muc.xlsx'), XLSX_SS = join(dir, 'so-sanh.xlsx');
execFileSync('python3', ['-c', `
import sys, datetime
from openpyxl import Workbook
wb = Workbook(); ws = wb.active
ws.append(['Mã', 'Tên thuốc', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho mặc định', 'Mã vạch GTIN'])
ws.append(['XL-001', 'Thuốc Excel Một', 'Hộp', 10, 'Viên', 'CHAN', '8934567890123'])
ws.append(['XL-002', 'Thuốc Excel Hai', 'Chai', None, 'Chai', None, None])
ws.append([None] * 7)
ws.append(['XL-003', 'Thiếu đơn vị', None, None, None, None, None])
wb.save(sys.argv[1])
wb = Workbook(); ws = wb.active
ws.append(['Kho', 'Mã', 'Tên', 'Số lô', 'HSD', 'SL', 'ĐVT', 'Hộc', 'Người đếm'])
ws.append(['CHAN', 'TT-0001', 'Paracetamol 500mg', 'L1', datetime.date(2027, 3, 15), 120, 'Viên', 'A 1', 'Lan'])
ws.append(['CHAN', 'TT-0001', 'Paracetamol 500mg', 'L2', 46100, 30, 'Viên', 'A 2', 'Lan'])
ws.append(['LE', 'TT-0009', 'Vitamin C', 'V1', '15/04/2027', 7, 'Viên', 'B 1', 'Minh'])
wb.save(sys.argv[2])
`, XLSX_DM, XLSX_SS]);

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
const browser = await chromium.launch({ channel: 'chrome' });
let fails = 0;

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: CONFIG_JS }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(BASE);
  return page;
}
// Log in and answer the đợt / kho / hộc dialogs until the main screen is ready.
async function vao(page, pin, hoc = 'A 1', kho = 'Kho CHẴN') {
  await page.fill('#pin', pin);
  await page.click('#btnLogin');
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('hidden') ||
      (!document.getElementById('main').classList.contains('hidden') && /Hộc/.test(document.getElementById('btnHoc').textContent) && !/Chọn hộc/.test(document.getElementById('btnHoc').textContent)), null, { timeout: 15000 });
    if (await page.locator('#modal.hidden').count()) return;
    const title = await page.textContent('#mTitle');
    if (/^Chọn đợt/.test(title)) await page.click('#mBtns button:has-text("Đợt thử")');
    else if (/^Đang kiểm kho/.test(title)) await page.click(`#mBtns button:has-text("${kho}")`);
    else if (/^Chọn hộc/.test(title)) { await page.fill('#hocIn', hoc); await page.click('#mBtns button'); }
    else throw new Error('Hộp thoại lạ: ' + title);
    await page.waitForTimeout(150);
  }
  throw new Error('Không vào được màn chính');
}
async function run(name, fn) {
  try { await fn(); console.log('PASS ' + name); }
  catch (e) { fails++; console.log('FAIL ' + name + ' – ' + e.message.split('\n')[0]); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
// IT screens: open the Quản lý tab, press a Cấu hình button, wait for the dialog title
async function moMan(p, qt, title) {
  await p.click('.tabs [data-tab="ql"]');
  await p.click(`#qlCfg [data-qt="${qt}"]`);
  await p.waitForFunction(t => document.getElementById('mTitle').textContent === t && !document.getElementById('modal').classList.contains('hidden'), title, { timeout: 10000 });
}
const dongHop = p => p.click('#mBtns button:has-text("Đóng")');
const cho = (p, re) => p.waitForFunction(s => new RegExp(s).test(document.getElementById('mBody').textContent), re, { timeout: 10000 });

try {
  await new Promise(r => setTimeout(r, 800));                       // let the static server bind

  await run('them_tai_khoan', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMan(p, 'qtTaiKhoan', 'Tài khoản');
    await p.click('#mBtns button:has-text("Thêm tài khoản")');
    await p.fill('#qtTen', 'Người đếm 13');
    await p.selectOption('#qtVai', 'DEM');
    await p.click('#mBtns button:has-text("Lưu")');
    await p.waitForSelector('#qtPin', { timeout: 10000 });
    const pin = (await p.textContent('#qtPin')).trim();
    ok(/^\d{6}$/.test(pin), 'PIN không phải 6 số: ' + pin);
    await dongHop(p);                                                 // PIN dialog -> back to the list
    await p.waitForFunction(() => /Người đếm 13/.test(document.getElementById('mBody').textContent), null, { timeout: 10000 });
    ok(!(await p.textContent('#mBody')).includes(pin), 'danh sách tài khoản lộ PIN');
    await dongHop(p);
    await p.click('#btnMenu'); await p.click('#mBtns button:has-text("Đăng xuất")');
    await p.waitForSelector('#pin');
    await vao(p, pin, 'Q 1');
    ok(/Người đếm 13/.test(await p.textContent('#who')), 'không đăng nhập được bằng PIN mới');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('nhap_danh_muc_excel', async () => {
    const p = await newPage();
    await vao(p, '111111');
    ok(await p.evaluate(() => typeof window.XLSX) === 'undefined', 'SheetJS bị nạp khi chưa nhập Excel');
    await moMan(p, 'qtDanhMuc', 'Danh mục');
    await p.click('#mBtns button:has-text("Nhập từ Excel")');
    await p.setInputFiles('#qtFile', XLSX_DM);
    await p.click('#mBtns button:has-text("Nhập")');
    await p.waitForFunction(() => document.getElementById('mTitle').textContent === 'Kết quả nhập', null, { timeout: 15000 });
    const body = await p.textContent('#mBody');
    ok(/Thêm 2/.test(body) && /Sửa 0/.test(body), 'kết quả nhập sai: ' + body);
    ok(/Dòng 5/.test(body) && /đơn vị tính/i.test(body), 'không báo lỗi dòng 5 (thiếu ĐVT): ' + body);
    ok(sql("select count(*) from kk.thuoc where ma in ('XL-001','XL-002')") === '2', 'thuốc chưa vào bảng kk.thuoc');
    ok(sql("select array_to_string(gtin, ' ') from kk.thuoc where ma = 'XL-001'") === '8934567890123', 'mã vạch GTIN không đúng');
    await dongHop(p); await dongHop(p);                               // result, then the danh mục list
    await p.click('.tabs [data-tab="dem"]');
    await p.fill('#q', 'Excel Một');
    await p.waitForSelector('.res[data-ma="XL-001"]', { timeout: 10000 });
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('them_kho', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMan(p, 'qtKho', 'Kho');
    await p.click('#mBtns button:has-text("Thêm kho")');
    await p.fill('#qtMa', 'kho3'); await p.fill('#qtTen', 'Kho 3'); await p.fill('#qtNgan', '3'); await p.fill('#qtThuTu', '3');
    await p.click('#mBtns button:has-text("Lưu")');
    await p.waitForFunction(() => /Kho 3/.test(document.getElementById('mBody').textContent), null, { timeout: 10000 });
    await dongHop(p);
    ok(sql("select ten from kk.kho where ma = 'KHO3'") === 'Kho 3', 'kho chưa vào bảng kk.kho');
    await p.click('[data-dotnew]');
    await p.waitForSelector('.dKho[value="KHO3"]', { timeout: 10000 });
    ok(/Kho 3/.test(await p.textContent('#mBody')), 'màn tạo đợt không có ô "Kho 3"');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('dan_hoc', async () => {
    const p = await newPage();
    await vao(p, '111111', 'Z 9', 'Kho LẺ');
    await moMan(p, 'qtHoc', 'Hộc');
    await p.fill('#qtHocs', 'A 1\nA 2\nB 1');
    await p.click('#mBtns button:has-text("Thêm")');
    await p.waitForFunction(() => /Đã thêm 3 hộc/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
    await p.click('#btnHoc');
    await p.waitForFunction(() => /Chưa ai nhận \(3\)/.test(document.getElementById('hocLists').textContent), null, { timeout: 10000 });
    ok(await p.locator('#hocLists .hocchip.CHUA_NHAN').count() === 3, 'không có đúng 3 hộc Chưa ai nhận');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('doi_canh_bao_hsd', async () => {
    const p60 = date => { const d = new Date(Date.now() + 60 * 864e5); return String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear(); };
    const canhBao = async () => {
      const d = await newPage();
      await vao(d, '444444');
      await d.fill('#q', 'para'); await d.click('.res[data-ma="TT-0001"]');
      await d.fill('#lo', 'H1'); await d.fill('#hsd', p60());
      const t = await d.textContent('#checks');
      await d.context().close();
      return t;
    };
    ok(/HSD còn dưới 90 ngày/.test(await canhBao()), 'chưa đổi cấu hình mà không thấy cảnh báo 90 ngày');
    const p = await newPage();
    await vao(p, '111111');
    await moMan(p, 'qtCauHinh', 'Cấu hình chung');
    await p.fill('#qtHsd', '30');
    await p.click('#mBtns button:has-text("Lưu")');
    await p.waitForFunction(() => document.getElementById('modal').classList.contains('hidden'), null, { timeout: 10000 });
    ok(sql("select gia_tri from kk.cau_hinh where khoa = 'HSD_CANH_BAO_NGAY'") === '30', 'cấu hình chưa lưu');
    ok(!/HSD còn dưới/.test(await canhBao()), 'đã đặt 30 ngày mà vẫn cảnh báo HSD còn dưới');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('nhap_so_sanh_excel', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMan(p, 'qtSoSanh', 'Nhập số liệu so sánh từ Excel');
    await p.setInputFiles('#qtFile', XLSX_SS);
    await p.click('#mBtns button:has-text("Nhập")');
    await p.waitForFunction(() => document.getElementById('mTitle').textContent === 'Kết quả nhập', null, { timeout: 15000 });
    ok(/CHẴN: 2 dòng/.test(await p.textContent('#mBody')), 'kết quả nhập so sánh sai: ' + await p.textContent('#mBody'));
    ok(sql("select count(*) from kk.so_sanh where dot_id = 'DOT01'") === '3', 'số dòng so sánh không phải 3');
    ok(sql("select string_agg(to_char(hsd,'DD/MM/YYYY'), ',' order by lo) from kk.so_sanh where dot_id = 'DOT01'") === '15/03/2027,' + sql("select to_char(date '1899-12-30' + 46100, 'DD/MM/YYYY')") + ',15/04/2027', 'HSD Excel không đổi đúng ngày');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('xss_ten_thuoc', async () => {
    const evil = '<img src=x onerror="window.__x=1">';
    const p = await newPage();
    await vao(p, '111111');
    await moMan(p, 'qtDanhMuc', 'Danh mục');
    await p.click('#mBtns button:has-text("Thêm thuốc")');
    await p.fill('#qtMa', 'XSS-1'); await p.fill('#qtTen', evil); await p.selectOption('#qtDvt', 'Viên');
    await p.click('#mBtns button:has-text("Lưu")');
    await p.waitForSelector('#qtQ', { timeout: 10000 });
    await p.fill('#qtQ', 'XSS-1');
    await p.waitForSelector('#qtRes [data-pick="XSS-1"]', { timeout: 10000 });
    ok((await p.textContent('#mBody')).includes(evil), 'chữ thẻ không hiện nguyên văn ở màn Danh mục');
    ok(await p.locator('#mBody img').count() === 0, 'màn Danh mục tạo ra thẻ img');
    await p.click('#qtRes [data-pick="XSS-1"]');                      // edit form keeps the name in an attribute
    await p.waitForSelector('#qtTen');
    ok(await p.inputValue('#qtTen') === evil, 'ô tên thuốc không giữ nguyên chữ');
    await p.click('#mBtns button:has-text("Huỷ")'); await dongHop(p);
    await p.click('.tabs [data-tab="dem"]');
    await p.fill('#q', 'XSS-1');
    await p.waitForSelector('.res[data-ma="XSS-1"]', { timeout: 10000 });
    ok((await p.textContent('#results')).includes(evil), 'chữ thẻ không hiện nguyên văn ở màn đếm');
    ok(await p.locator('#results img').count() === 0, 'màn đếm tạo ra thẻ img');
    ok(await p.evaluate(() => window.__x) === undefined, 'mã đã chạy (window.__x)');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('dat_lai_pin', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMan(p, 'qtTaiKhoan', 'Tài khoản');
    await p.click('#mBody .qitem:has-text("TK05") [data-pick]');
    await p.click('#mBtns button:has-text("Đặt lại PIN")');
    await p.click('#mBtns button:has-text("Đặt lại")');
    await p.waitForSelector('#qtPin', { timeout: 10000 });
    const pin = (await p.textContent('#qtPin')).trim();
    ok(/^\d{6}$/.test(pin) && pin !== '555555', 'PIN mới không hợp lệ: ' + pin);
    ok(sql("select pin from kk.tai_khoan where tk = 'TK05'") === pin, 'PIN trong bảng không khớp PIN đã hiện');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('dem_khong_thay_cau_hinh', async () => {
    const p = await newPage();
    await vao(p, '444444');
    ok(!/Cấu hình/.test(await p.innerText('body')), 'người đếm thấy chữ Cấu hình');
    ok(await p.locator('#qlCfg [data-qt]').count() === 0, 'người đếm có nút cấu hình');
    await p.context().close();
    const t = await newPage();                                        // tổ trưởng has the Quản lý tab but no Cấu hình
    await vao(t, '222222');
    await t.click('.tabs [data-tab="ql"]');
    await t.waitForFunction(() => { const x = document.getElementById('qlCanXem').textContent; return x && !/Đang tải/.test(x); }, null, { timeout: 10000 });
    ok(await t.locator('#qlCfg [data-qt]').count() === 0, 'tổ trưởng có nút cấu hình');
    ok(!/Cấu hình/.test(await t.innerText('#tab-ql')), 'tổ trưởng thấy chữ Cấu hình');
    await t.waitForSelector('#qlKho [data-dotxls]', { timeout: 10000 });      // tổ trưởng exports the current đợt from here
    await t.context().close();
  });
  await run('xuat_excel', async () => {
    // one counted line with a numeric-looking lot and a real HSD, then export the đợt from the Quản lý tab
    sql("insert into kk.dong (dot_id, so, tap, tg, kho, ma, ten, lo, hsd, hoc, hop, qc, le, sl, dvt, nguoi, tk, thao_tac, trang_thai, req_id) " +
        "values ('DOT01', 9001, false, timestamptz '2026-12-31 23:45:00+07', 'CHAN', 'TT-0001', 'Paracetamol 500mg', '00123', date '2027-05-01', 'A 1', 1, 10, 0, 10, 'Viên', 'Lan', 'TK04', 'LUU', 'HIEU_LUC', 'xl-9001')");
    const ten = sql("select ten from kk.dot where id = 'DOT01'");
    const p = await newPage();
    await vao(p, '111111');
    await p.click('.tabs [data-tab="ql"]');
    await p.waitForSelector('#qlDot [data-dotxls="DOT01"]', { timeout: 10000 });
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#qlDot [data-dotxls="DOT01"]')]);
    ok(dl.suggestedFilename() === 'KIEM-KHO-' + ten.replace(/[\\/:*?"<>|]/g, '-') + '.xlsx', 'tên file sai: ' + dl.suggestedFilename());
    const file = join(dir, 'xuat.xlsx');
    await dl.saveAs(file);
    const out = execFileSync('python3', ['-c', `
import sys, datetime
from openpyxl import load_workbook
wb = load_workbook(sys.argv[1])
print(','.join(wb.sheetnames))
ws = wb['DONG']
print('|'.join(str(c.value) for c in ws[1]))
r = ws[2]
print(repr(r[5].value), r[5].data_type, repr(r[6].value), r[6].number_format)
print(repr(r[1].value), r[1].number_format, repr(r[21].value))
l1 = wb['LAN1']
print(repr(l1['E2'].value))
`, file], { encoding: 'utf8' }).trim().split('\n');
    ok(out[0] === 'TONG_HOP,TONG_HOP_LO,DONG,HOC,THUOC_MOI,LAN1,DANH_MUC', 'tên sheet: ' + out[0]);
    ok(out[1].startsWith('ID|Thời điểm|Kho|Mã|Tên thuốc|Số lô|HSD|Hộc|') && out[1].split('|').length === 23, 'dòng tiêu đề DONG: ' + out[1]);
    ok(out[2] === "'00123' s datetime.datetime(2027, 5, 1, 0, 0) dd/mm/yyyy", 'ô Số lô/HSD: ' + out[2]);
    ok(out[3] === "datetime.datetime(2026, 12, 31, 23, 45) dd/mm/yyyy hh:mm ''" || out[3] === "datetime.datetime(2026, 12, 31, 23, 45) dd/mm/yyyy hh:mm None", 'Thời điểm của DONG: ' + out[3]);
    ok(out[4] === 'datetime.datetime(2027, 3, 15, 0, 0)', 'HSD của LAN1: ' + out[4]);
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `${fails} ca FAIL` : 'Tất cả PASS');
process.exit(fails ? 1 : 0);
