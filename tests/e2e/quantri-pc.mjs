// E2E test of the desktop admin page (quantri.html + quantri-pc.js) against the local Supabase stack.
// Run from the repo root after `supabase db reset`:  node tests/e2e/quantri-pc.mjs
import { chromium } from 'playwright';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8767, BASE = `http://127.0.0.1:${PORT}/`;
const env = Object.fromEntries(execSync('supabase status -o env 2>/dev/null', { encoding: 'utf8' })
  .split('\n').map(l => l.match(/^(\w+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const CONFIG_JS = `window.KK_CONFIG = ${JSON.stringify({ SUPABASE_URL: env.API_URL, SUPABASE_KEY: env.ANON_KEY })};`;
const sql = q => execFileSync('docker', ['exec', 'supabase_db_kiem_kho', 'psql', '-U', 'postgres', '-At', '-c', q], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'kk-quantri-pc-'));
// Every cell of the first sheet, one row per line, cells joined by '|'
const docXlsx = file => execFileSync('python3', ['-c', `
import sys
from openpyxl import load_workbook
ws = load_workbook(sys.argv[1]).worksheets[0]
for r in ws.iter_rows(values_only=True): print('|'.join('' if c is None else str(c) for c in r))
`, file], { encoding: 'utf8' }).trim().split('\n');

// Test workbooks (openpyxl): a comparison file, used where a danh mục file is expected
const XLSX_SS = join(dir, 'so-sanh.xlsx');
execFileSync('python3', ['-c', `
import sys, datetime
from openpyxl import Workbook
wb = Workbook(); ws = wb.active
ws.append(['Kho', 'Mã', 'Tên', 'Số lô', 'HSD', 'SL', 'ĐVT', 'Hộc', 'Người đếm'])
ws.append(['CHAN', 'TT-0001', 'Paracetamol 500mg', 'L1', datetime.date(2027, 3, 15), 120, 'Viên', 'A 1', 'Lan'])
wb.save(sys.argv[1])
`, XLSX_SS]);
const goiCo = (p, action) => p.goiApi.filter(b => b.includes(`"action":"${action}"`));

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
const browser = await chromium.launch({ channel: 'chrome' });
let fails = 0;

async function newPage(viewport = { width: 1366, height: 800 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: CONFIG_JS }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.goiApi = [];                                                   // bodies of every rpc/api request, to count server calls
  page.on('request', r => { if (r.url().includes('/rpc/api')) page.goiApi.push(r.postData() || ''); });
  await page.goto(BASE + 'quantri.html');
  return page;
}
async function vao(page, pin) {
  await page.fill('#pin', pin);
  await page.click('#btnLogin');
  await page.waitForSelector('#menu', { state: 'visible', timeout: 15000 });
}
// Open a menu section and wait until its first table has drawn its row count
async function moMuc(page, ten) {
  await page.click(`#menu button:has-text("${ten}")`);
  await page.waitForSelector('#bang .dem', { timeout: 15000 });
}
const dem = p => p.textContent('#bang .dem');
async function taiVe(p, nut, ten) {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click(nut)]);
  const file = join(dir, ten || dl.suggestedFilename());
  await dl.saveAs(file);
  return { file, ten: dl.suggestedFilename() };
}
async function run(name, fn) {
  try { await fn(); console.log('PASS ' + name); }
  catch (e) { fails++; console.log('FAIL ' + name + ' – ' + e.message.split('\n')[0]); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const sachLoi = p => ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
const pins = () => sql('select pin from kk.tai_khoan').split('\n');

try {
  await new Promise(r => setTimeout(r, 800));                       // let the static server bind

  // ------------------------------------------------------------ đăng nhập
  await run('dang_nhap_it', async () => {
    const p = await newPage();
    await vao(p, '111111');
    const menu = (await p.locator('#menu button').allTextContents()).map(s => s.trim());
    for (const t of ['Tài khoản', 'Danh mục thuốc', 'Kho và hộc', 'Số liệu so sánh', 'Đợt kiểm']) ok(menu.includes(t), 'menu thiếu ' + t + ': ' + menu);
    ok(await p.inputValue('#dot') === 'DOT01', 'đợt mặc định: ' + await p.inputValue('#dot'));
    sachLoi(p);
    await p.context().close();
  });

  await run('dang_nhap_khong_phai_it', async () => {
    const p = await newPage();
    await p.fill('#pin', '444444');
    await p.click('#btnLogin');
    await p.waitForFunction(() => document.getElementById('loginMsg').textContent !== '', null, { timeout: 10000 });
    ok(await p.textContent('#loginMsg') === 'Trang này chỉ dành cho IT', 'loginMsg: ' + await p.textContent('#loginMsg'));
    ok(await p.evaluate(() => sessionStorage.getItem('kkqt_pin')) === null, 'PIN còn trong sessionStorage');
    ok(!await p.isVisible('#menu'), 'người đếm thấy menu');
    sachLoi(p);
    await p.context().close();
  });

  await run('sai_pin', async () => {
    const p = await newPage();
    await p.fill('#pin', '123456');
    await p.click('#btnLogin');
    await p.waitForFunction(() => document.getElementById('loginMsg').textContent !== '', null, { timeout: 10000 });
    ok(/Sai mã PIN/.test(await p.textContent('#loginMsg')), 'loginMsg: ' + await p.textContent('#loginMsg'));
    ok(!await p.isVisible('#menu'), 'sai PIN mà thấy menu');
    sachLoi(p);
    await p.context().close();
    sql('delete from kk.pin_sai');
  });

  await run('pin_chi_trong_tab', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await p.reload();
    await p.waitForSelector('#menu', { state: 'visible', timeout: 15000 });
    ok(!(await p.evaluate(() => JSON.stringify(localStorage))).includes('111111'), 'PIN nằm trong localStorage');
    sachLoi(p);
    await p.context().close();
    const q = await newPage();                                        // a new context = a new tab session
    await q.waitForSelector('#pin', { state: 'visible', timeout: 10000 });
    ok(!await q.isVisible('#menu'), 'tab mới vào thẳng menu');
    await q.context().close();
  });

  // ------------------------------------------------------------ tài khoản
  await run('tai_khoan_khong_lo_pin', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Tài khoản');
    const n = sql('select count(*) from kk.tai_khoan');
    ok(await dem(p) === `${n} / ${n}`, 'số đếm: ' + await dem(p));
    const html = await p.content();
    for (const pin of pins()) ok(!html.includes(pin), 'trang lộ PIN ' + pin);
    sachLoi(p);
    await p.context().close();
  });

  await run('tai_khoan_loc_vai', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Tài khoản');
    await p.selectOption('#locVai', { label: 'Người đếm' });
    const vai = await p.$$eval('#ds tbody tr', rs => rs.map(r => r.cells[2].textContent));
    ok(vai.length > 0 && vai.every(v => v === 'Người đếm'), 'lọc vai: ' + vai);
    ok(await dem(p) === `${vai.length} / ${sql('select count(*) from kk.tai_khoan')}`, 'số đếm sau lọc: ' + await dem(p));
    sachLoi(p);
    await p.context().close();
  });

  await run('tai_khoan_them_hien_pin', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Tài khoản');
    await p.click('#bang button:has-text("Thêm")');
    await p.fill('#oTen', 'Người đếm PC');
    await p.click('#khung button:has-text("Lưu")');
    await p.waitForSelector('#pinMoi', { timeout: 10000 });
    const pin = (await p.textContent('#pinMoi')).trim();
    ok(/^\d{6}$/.test(pin), 'PIN không phải 6 số: ' + pin);
    ok(sql("select pin from kk.tai_khoan where ten = 'Người đếm PC'") === pin, 'PIN hiện ra khác PIN trong bảng kk.tai_khoan');
    await p.click('#hop button:has-text("Đóng")');
    await p.waitForFunction(() => /Người đếm PC/.test(document.getElementById('ds').textContent), null, { timeout: 10000 });
    ok(!(await p.content()).includes(pin), 'trang còn PIN sau khi đóng hộp thoại');
    sachLoi(p);
    await p.context().close();
  });

  await run('tai_khoan_tu_khoa_bao_loi', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Tài khoản');
    await p.click('#ds tbody tr:has-text("TK01")');
    await p.uncheck('#oAct');
    await p.click('#khung button:has-text("Lưu")');
    await p.waitForFunction(() => document.getElementById('khungLoi').textContent !== '', null, { timeout: 10000 });
    ok(await p.textContent('#khungLoi') === 'Không tự khoá hoặc đổi vai của chính mình', 'khungLoi: ' + await p.textContent('#khungLoi'));
    ok(sql("select hoat_dong from kk.tai_khoan where tk = 'TK01'") === 't', 'TK01 bị khoá');
    sachLoi(p);
    await p.context().close();
  });

  await run('tai_khoan_dat_lai_pin', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Tài khoản');
    await p.click('#ds tbody tr:has-text("TK05")');
    await p.click('#khung button:has-text("Đặt lại PIN")');
    await p.click('#hop button:has-text("Đặt lại")');
    await p.waitForSelector('#pinMoi', { timeout: 10000 });
    const pin = (await p.textContent('#pinMoi')).trim();
    ok(/^\d{6}$/.test(pin) && pin !== '555555', 'PIN mới không hợp lệ: ' + pin);
    ok(sql("select pin from kk.tai_khoan where tk = 'TK05'") === pin, 'PIN trong bảng không khớp PIN đã hiện');
    sachLoi(p);
    await p.context().close();
  });

  await run('tai_khoan_xuat_khong_pin', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Tài khoản');
    const { file, ten } = await taiVe(p, '#bang button:has-text("Xuất danh sách")');
    ok(ten === 'TAI-KHOAN.xlsx', 'tên file: ' + ten);
    const rows = docXlsx(file);
    ok(rows[0] === 'Mã TK|Tên|Vai trò|Trạng thái|Ghi chú', 'dòng tiêu đề: ' + rows[0]);
    ok(rows.length === Number(sql('select count(*) from kk.tai_khoan')) + 1, 'số dòng: ' + rows.length);
    const cells = rows.join('|').split('|');
    for (const pin of pins()) ok(!cells.includes(pin), 'file lộ PIN ' + pin);
    sachLoi(p);
    await p.context().close();
  });

  await run('xss_ten_tai_khoan', async () => {
    const evil = '<img src=x onerror="window.__x=1">';
    sql(`update kk.tai_khoan set ghi_chu = '${evil}' where tk = 'TK05'`);
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Tài khoản');
    ok((await p.textContent('#bang')).includes(evil), 'chữ thẻ không hiện nguyên văn trong bảng');
    await p.click('#ds tbody tr:has-text("TK05")');
    ok(await p.inputValue('#oGhi') === evil, 'ô Ghi chú không giữ nguyên chữ');
    ok(await p.locator('#bang img, #khung img').count() === 0, 'trang tạo ra thẻ img');
    ok(await p.evaluate(() => window.__x) === undefined, 'mã đã chạy (window.__x)');
    sachLoi(p);
    await p.context().close();
  });

  await run('dien_thoai_khong_vo', async () => {
    const p = await newPage({ width: 390, height: 800 });
    await vao(p, '111111');
    await moMuc(p, 'Tài khoản');
    await p.click('#ds tbody tr:has-text("TK05")');
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 390, 'trang rộng ' + w + ' px trên màn 390 px');
    sachLoi(p);
    await p.context().close();
  });

  // ------------------------------------------------------------ danh mục thuốc
  await run('danh_muc_dem_dong', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Danh mục thuốc');
    const n = sql('select count(*) from kk.thuoc');
    ok(await dem(p) === `${n} / ${n}`, 'số đếm: ' + await dem(p));
    sachLoi(p);
    await p.context().close();
  });

  await run('danh_muc_tim_khong_dau', async () => {
    sql("insert into kk.thuoc (ma, ten, dvt_nhap, quy_cach, dvt) values ('PC-1', 'Thuốc Đau Đầu', 'Hộp', 10, 'Viên')");
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Danh mục thuốc');
    await p.fill('#tim', 'dau dau');
    const ma = await p.$$eval('#ds tbody tr', rs => rs.map(r => r.cells[0].textContent));
    ok(ma.includes('PC-1'), 'tìm "dau dau" không ra PC-1: ' + ma);
    ok(await dem(p) === `${ma.length} / ${sql('select count(*) from kk.thuoc')}`, 'số đếm sau tìm: ' + await dem(p));
    sachLoi(p);
    await p.context().close();
  });

  await run('danh_muc_sua_thuoc', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Danh mục thuốc');
    await p.click('#ds tbody tr:has-text("PC-1")');
    ok(await p.getAttribute('#oMa', 'readonly') !== null, 'ô Mã sửa được khi sửa thuốc');
    await p.fill('#oTen', 'Thuốc Đau Đầu Mới');
    await p.click('#khung button:has-text("Lưu")');
    await p.waitForFunction(() => /Thuốc Đau Đầu Mới/.test(document.getElementById('ds').textContent), null, { timeout: 10000 });
    ok(sql("select ten from kk.thuoc where ma = 'PC-1'") === 'Thuốc Đau Đầu Mới', 'tên thuốc chưa lưu');
    ok(/PC-1/.test(await p.textContent('#ds tr.chon')), 'dòng PC-1 không còn được chọn');
    sachLoi(p);
    await p.context().close();
  });

  await run('danh_muc_xuat_nhap_lai', async () => {
    sql("insert into kk.thuoc (ma, ten, dvt_nhap, quy_cach, dvt, kho_mac_dinh, gtin) values ('00045', 'Thuốc số không', 'Hộp', 20, 'Viên', 'LE', '{0893456789012}')");
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Danh mục thuốc');
    const { file, ten } = await taiVe(p, '#bang button:has-text("Xuất danh sách hiện có")', 'danh-muc-xuat.xlsx');
    ok(ten === 'DANH-MUC.xlsx', 'tên file: ' + ten);
    await p.setInputFiles('#fileNhap', file);
    await p.waitForFunction(() => /Thêm/.test(document.getElementById('hop').textContent), null, { timeout: 20000 });
    const kq = await p.textContent('#hop');
    ok(/Thêm 0/.test(kq) && /Lỗi 0/.test(kq), 'kết quả nhập lại: ' + kq);
    ok(sql("select array_to_string(gtin, ' ') || '|' || quy_cach || '|' || kho_mac_dinh from kk.thuoc where ma = '00045'") === '0893456789012|20|LE', 'thuốc 00045 đổi sau khi nhập lại');
    sachLoi(p);
    await p.context().close();
  });

  await run('danh_muc_con_dong_vi_du', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Danh mục thuốc');
    const { file, ten } = await taiVe(p, '#bang button:has-text("Tải file mẫu")', 'danh-muc-mau.xlsx');
    ok(ten === 'DANH-MUC-MAU.xlsx', 'tên file mẫu: ' + ten);
    await p.setInputFiles('#fileNhap', file);
    await p.waitForFunction(() => /Dòng 2/.test(document.getElementById('hop').textContent), null, { timeout: 10000 });
    ok(!goiCo(p, 'nhapThuoc').length, 'đã gửi nhapThuoc dù còn dòng ví dụ');
    ok(sql("select count(*) from kk.thuoc where ma = 'VIDU'") === '0', 'thuốc VIDU vào danh mục');
    sachLoi(p);
    await p.context().close();
  });

  await run('danh_muc_nham_file_so_sanh', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Danh mục thuốc');
    await p.setInputFiles('#fileNhap', XLSX_SS);
    await p.waitForFunction(() => /File không đúng mẫu danh mục/.test(document.getElementById('hop').textContent), null, { timeout: 10000 });
    ok(!goiCo(p, 'nhapThuoc').length, 'đã gửi nhapThuoc với file số liệu so sánh');
    sachLoi(p);
    await p.context().close();
  });

  await run('xss_ten_thuoc_pc', async () => {
    const evil = '<img src=x onerror="window.__x=1">';
    sql(`insert into kk.thuoc (ma, ten, dvt) values ('XSS-PC', '${evil}', 'Viên')`);
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Danh mục thuốc');
    await p.fill('#tim', 'XSS-PC');
    ok((await p.textContent('#ds')).includes(evil), 'chữ thẻ không hiện nguyên văn trong bảng');
    await p.click('#ds tbody tr:has-text("XSS-PC")');
    ok(await p.inputValue('#oTen') === evil, 'ô Tên thuốc không giữ nguyên chữ');
    ok(await p.locator('#bang img, #khung img').count() === 0, 'trang tạo ra thẻ img');
    ok(await p.evaluate(() => window.__x) === undefined, 'mã đã chạy (window.__x)');
    sachLoi(p);
    await p.context().close();
  });

  await run('danh_muc_5000_dong', async () => {
    sql("insert into kk.thuoc (ma, ten, dvt_nhap, dvt) select 'G' || lpad(i::text, 5, '0'), 'Thuốc thử ' || i, 'Hộp', 'Viên' from generate_series(1, 5000) i");
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Danh mục thuốc');
    const n = Number(sql('select count(*) from kk.thuoc'));
    ok(await dem(p) === `${n.toLocaleString('vi-VN')} / ${n.toLocaleString('vi-VN')}`, 'số đếm: ' + await dem(p));
    const kq = await p.evaluate(() => {
      const o = document.getElementById('tim'), truoc = document.querySelector('#bang .dem').textContent, t0 = performance.now();
      o.value = 'thu 4999';
      o.dispatchEvent(new Event('input'));
      return { ms: performance.now() - t0, truoc, sau: document.querySelector('#bang .dem').textContent };
    });
    ok(kq.sau !== kq.truoc && /^1 \//.test(kq.sau), 'số đếm không đổi khi gõ: ' + JSON.stringify(kq));
    ok(kq.ms < 150, 'gõ tìm mất ' + Math.round(kq.ms) + ' ms');
    sachLoi(p);
    await p.context().close();
  });

  // ------------------------------------------------------------ kho và hộc
  await run('kho_hien_kho_an', async () => {
    sql("insert into kk.kho (ma, ten, ten_ngan, thu_tu, hoat_dong) values ('K9', 'Kho 9', 'K9', 7, false)");
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Kho và hộc');
    await p.click('#dsKho tbody tr:has-text("K9")');
    ok(await p.inputValue('#oThuTu') === '7', 'ô Thứ tự: ' + await p.inputValue('#oThuTu'));
    ok(!await p.isChecked('#oHd'), 'kho đã ẩn mà ô Đang dùng được chọn');
    await p.check('#oHd');
    await p.click('#khung button:has-text("Lưu")');
    await p.waitForFunction(() => document.querySelector('#dsKho tr.chon') && /K9/.test(document.querySelector('#dsKho tr.chon').textContent), null, { timeout: 10000 });
    ok(sql("select hoat_dong || '|' || thu_tu from kk.kho where ma = 'K9'") === 'true|7', 'kk.kho K9: ' + sql("select hoat_dong || '|' || thu_tu from kk.kho where ma = 'K9'"));
    sachLoi(p);
    await p.context().close();
  });

  await run('kho_an_kho_dang_dung_bao_loi', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Kho và hộc');
    await p.click('#dsKho tbody tr:has-text("CHAN")');
    await p.uncheck('#oHd');
    await p.click('#khung button:has-text("Lưu")');
    await p.waitForFunction(() => document.getElementById('khungLoi').textContent !== '', null, { timeout: 10000 });
    ok((await p.textContent('#khungLoi')).includes('đang dùng trong đợt Đợt thử'), 'khungLoi: ' + await p.textContent('#khungLoi'));
    ok(sql("select hoat_dong from kk.kho where ma = 'CHAN'") === 't', 'kho CHAN bị ẩn');
    sachLoi(p);
    await p.context().close();
  });

  await run('hoc_dan_nhieu_dong', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Kho và hộc');
    await p.selectOption('#khoHoc', 'CHAN');
    await p.fill('#oHocMoi', 'P 1\nP 2\n\n P 3 ');
    await p.click('#btnThemHoc');
    await p.waitForFunction(() => /P 3/.test(document.getElementById('dsHoc').textContent), null, { timeout: 10000 });
    ok(sql("select string_agg(hoc, ',' order by hoc) from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and not tap") === 'P 1,P 2,P 3', 'kk.hoc: ' + sql("select string_agg(hoc, ',' order by hoc) from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and not tap"));
    sachLoi(p);
    await p.context().close();
  });

  await run('hoc_xoa_chi_chua_nhan', async () => {
    sql("update kk.hoc set trang_thai = 'DANG_DEM', nguoi = 'Lan' where dot_id = 'DOT01' and kho = 'CHAN' and hoc = 'P 2'");
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Kho và hộc');
    await p.waitForSelector('#dsHoc tbody tr:has-text("P 2")', { timeout: 10000 });
    ok(await p.locator('#dsHoc tbody tr:has-text("P 2") button:has-text("Xoá")').count() === 0, 'hộc đang đếm có nút Xoá');
    await p.click('#dsHoc tbody tr:has-text("P 1") button:has-text("Xoá")');
    await p.click('#hop button:has-text("Xoá")');
    await p.waitForFunction(() => !/P 1/.test(document.getElementById('dsHoc').textContent), null, { timeout: 10000 });
    ok(sql("select count(*) from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and hoc = 'P 1'") === '0', 'hộc P 1 chưa bị xoá');
    sachLoi(p);
    await p.context().close();
  });

  await run('hoc_dot_dong_an_nut', async () => {
    sql("insert into kk.hoc (dot_id, tap, kho, hoc) values ('DOT02', false, 'CHAN', 'Q 1')");
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Kho và hộc');
    await p.selectOption('#dot', 'DOT02');
    await p.waitForSelector('#dsHoc tbody tr:has-text("Q 1")', { timeout: 10000 });
    ok(!await p.isVisible('#btnThemHoc'), 'đợt đã đóng mà còn nút Thêm hộc');
    ok(await p.locator('#dsHoc button:has-text("Xoá"):visible').count() === 0, 'đợt đã đóng mà còn nút Xoá');
    sachLoi(p);
    await p.context().close();
  });

  // ------------------------------------------------------------ không còn đợt nào (chạy cuối vì xoá mọi đợt)
  await run('hoc_chua_co_dot', async () => {
    sql('delete from kk.so_sanh; delete from kk.dong; delete from kk.thuoc_moi; delete from kk.dot_kho; delete from kk.hoc; delete from kk.dot');
    const p = await newPage();
    await vao(p, '111111');
    await moMuc(p, 'Kho và hộc');
    ok(/Chưa có đợt kiểm/.test(await p.textContent('#phanHoc')), 'phần hộc: ' + await p.textContent('#phanHoc'));
    ok(await p.locator('#dsKho tbody tr').count() >= 2, 'bảng Kho không hiện');
    sachLoi(p);
    await p.context().close();
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `${fails} ca FAIL` : 'Tất cả PASS');
process.exit(fails ? 1 : 0);
