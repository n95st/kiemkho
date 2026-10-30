// E2E of the counting flows on the phone app, pressed for real, each step checked against kk.dong.
// The cases run in order on one database: each one builds on the lines the earlier ones saved.
// Run from the repo root after `supabase db reset`:  node tests/e2e/dem.mjs
import { chromium } from 'playwright';
import { execFileSync, execSync, spawn } from 'node:child_process';

const PORT = 8773, BASE = `http://127.0.0.1:${PORT}/`;
const env = Object.fromEntries(execSync('supabase status -o env 2>/dev/null', { encoding: 'utf8' })
  .split('\n').map(l => l.match(/^(\w+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const CONFIG_JS = `window.KK_CONFIG = ${JSON.stringify({ SUPABASE_URL: env.API_URL, SUPABASE_KEY: env.ANON_KEY })};`;
const sql = q => execFileSync('docker', ['exec', 'supabase_db_kiem_kho', 'psql', '-U', 'postgres', '-At', '-c', q], { encoding: 'utf8' }).trim();
// Lines of one drug, one per row: lô|HSD|SL|hộc|tài khoản|thao tác|trạng thái, in save order
const dong = (ma, them = '') => sql(`select string_agg(lo || '|' || coalesce(to_char(hsd, 'DD/MM/YYYY'), '') || '|' || sl::float8 || '|' || hoc || '|' || tk || '|' || thao_tac || '|' || trang_thai, E'\\n' order by so)
  from kk.dong where dot_id = 'DOT01' and not tap and ma = '${ma}' ${them}`);
const tongLo = (ma, lo, them = '') => sql(`select coalesce(sum(sl), 0)::float8 from kk.dong where dot_id = 'DOT01' and not tap and ma = '${ma}' and lo = '${lo}' and trang_thai = 'HIEU_LUC' ${them}`);
const idDong = (ma, them) => sql(`select 'D' || lpad(so::text, 5, '0') from kk.dong where dot_id = 'DOT01' and not tap and ma = '${ma}' ${them} order by so desc limit 1`);

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
async function vao(pin, hoc = 'A 1', kho = 'Kho CHẴN') {
  const page = await newPage();
  await page.fill('#pin', pin);
  await page.click('#btnLogin');
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('hidden') ||
      (!document.getElementById('main').classList.contains('hidden') && /Hộc/.test(document.getElementById('btnHoc').textContent) && !/Chọn hộc/.test(document.getElementById('btnHoc').textContent)), null, { timeout: 15000 });
    if (await page.locator('#modal.hidden').count()) return page;
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
const thuoc = async (p, q, ma) => { await p.fill('#q', q); await p.click(`.res[data-ma="${ma}"]`); await p.waitForSelector('#card:not(.hidden)'); };
const lo = (p, key) => p.click(`#lots .lot[data-k="${key}"]`);
const bam = (p, chu) => p.click(`#actions .act:has-text("${chu}")`);
const hop = (p, chu) => p.click(`#mBtns button:has-text("${chu}")`);
// Every queued line has reached the server (no line waiting, sending or needing an answer)
const choGui = p => p.waitForFunction(() => { const q = JSON.parse(localStorage.kk_queue || '[]'); return q.length && q.every(x => x.state === 'done'); }, null, { timeout: 15000 });
const cho = (f, m) => (async () => { for (let i = 0; i < 50; i++) { if (f()) return; await new Promise(r => setTimeout(r, 200)); } throw new Error(m()); })();
const xong = async p => { ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | ')); await p.context().close(); };

try {
  await new Promise(r => setTimeout(r, 800));                       // let the static server bind

  await run('lo_moi_kem_han', async () => {
    const p = await vao('444444');
    await thuoc(p, 'para', 'TT-0001');
    await p.fill('#lo', 'L-A'); await p.fill('#hsd', '15032027');
    await p.fill('#hop', '2'); await p.fill('#qc', '100'); await p.fill('#le', '5');
    ok(/205 Viên/.test(await p.textContent('#total')), 'tổng trên màn: ' + await p.textContent('#total'));
    await bam(p, 'Lưu lô mới');
    await choGui(p);
    ok(dong('TT-0001') === 'L-A|15/03/2027|205|A 1|TK04|CONG_THEM|HIEU_LUC', 'kk.dong: ' + dong('TT-0001'));
    await xong(p);
  });

  await run('cong_them_lo_co_san', async () => {
    const p = await vao('444444');
    await thuoc(p, 'para', 'TT-0001');
    await lo(p, 'L-A');
    ok(await p.inputValue('#hsd') === '15/03/2027', 'chọn lô có sẵn mà HSD không tự điền');
    await p.fill('#le', '10');
    await bam(p, 'Cộng thêm');
    await choGui(p);
    ok(tongLo('TT-0001', 'L-A') === '215', 'tổng lô L-A: ' + tongLo('TT-0001', 'L-A'));
    await p.waitForFunction(() => /215/.test(document.querySelector('#lots .lot[data-k="L-A"]').textContent), null, { timeout: 10000 });
    await xong(p);
  });

  await run('cung_lo_khac_hsd_hoi_lai', async () => {
    const p = await vao('444444');
    await thuoc(p, 'para', 'TT-0001');
    // typing an existing lô into "Lô mới" picks that lô and locks its HSD (no duplicate lô), so a different HSD
    // goes through the lô's "đổi" link, which unlocks the lô and HSD fields
    await lo(p, 'L-A');
    await p.click('#lotUnlock');
    await p.fill('#hsd', '20032027'); await p.fill('#le', '3');
    await bam(p, 'Cộng vào lô L-A');
    // the server holds the line back and asks: the line waits in "Của tôi" until the counter confirms the HSD on the box
    await p.waitForFunction(() => JSON.parse(localStorage.kk_queue || '[]').some(x => x.state === 'need' && x.need === 'HSD_KHAC'), null, { timeout: 15000 });
    ok(tongLo('TT-0001', 'L-A') === '215', 'dòng HSD khác đã vào dù chưa xác nhận');
    await p.click('.tabs [data-tab="toi"]');
    await p.click('#toiList button:has-text("Vẫn lưu HSD này")');
    await choGui(p);
    ok(dong('TT-0001', "and hsd = date '2027-03-20'") === 'L-A|20/03/2027|3|A 1|TK04|CONG_THEM|HIEU_LUC', 'dòng HSD 20/03: ' + dong('TT-0001', "and hsd = date '2027-03-20'"));
    await xong(p);
  });

  await run('nguoi_khac_cung_hoc_hoi_lai', async () => {
    const p = await vao('555555');
    await thuoc(p, 'para', 'TT-0001');
    await lo(p, 'L-A');
    await p.fill('#le', '7');
    ok(await p.locator('#actions .act:has-text("Đếm lại hộc A 1")').isDisabled(), 'người khác được đếm lại hộc của TK04');
    await bam(p, 'Cộng thêm');
    await p.waitForFunction(() => document.getElementById('mTitle').textContent === 'Hộc này đã có người đếm lô này', null, { timeout: 10000 });
    await hop(p, 'Hàng khác – cộng thêm');
    await choGui(p);
    ok(dong('TT-0001', "and tk = 'TK05'") === 'L-A|15/03/2027|7|A 1|TK05|CONG_THEM|HIEU_LUC', 'dòng TK05: ' + dong('TT-0001', "and tk = 'TK05'"));
    await xong(p);
  });

  await run('dem_lai_hoc', async () => {
    const p = await vao('444444', 'A 2');
    await thuoc(p, 'para', 'TT-0001');
    await lo(p, 'L-A'); await p.fill('#le', '50'); await bam(p, 'Cộng thêm');
    await choGui(p);
    await lo(p, 'L-A'); await p.fill('#le', '40');
    await bam(p, 'Đếm lại hộc A 2');
    await cho(() => tongLo('TT-0001', 'L-A', "and hoc = 'A 2'") === '40', () => 'hộc A 2 sau khi đếm lại: ' + tongLo('TT-0001', 'L-A', "and hoc = 'A 2'"));
    ok(dong('TT-0001', "and hoc = 'A 2'") === 'L-A|15/03/2027|50|A 2|TK04|CONG_THEM|THAY_THE\nL-A|15/03/2027|40|A 2|TK04|DEM_LAI_HOC|HIEU_LUC', 'kk.dong hộc A 2: ' + dong('TT-0001', "and hoc = 'A 2'"));
    ok(tongLo('TT-0001', 'L-A', "and hoc = 'A 1'") === '225', 'đếm lại A 2 làm đổi hộc A 1: ' + tongLo('TT-0001', 'L-A', "and hoc = 'A 1'"));
    await xong(p);
  });

  await run('sua_dong_cua_toi', async () => {
    const id = idDong('TT-0001', "and hoc = 'A 1' and tk = 'TK04' and sl = 10");
    const p = await vao('444444', 'A 2');
    await p.click('.tabs [data-tab="toi"]');
    await p.click(`#toiList [data-edit="${id}"]`);
    await hop(p, 'Sửa');
    // the old line is cancelled and its numbers are put back on the card, in its own hộc
    await p.waitForFunction(() => document.getElementById('le').value === '10' && /A 1/.test(document.getElementById('btnHoc').textContent), null, { timeout: 10000 });
    await p.fill('#le', '12');
    await bam(p, 'Cộng thêm');
    await p.waitForFunction(() => document.getElementById('mTitle').textContent === 'Hộc này đã có người đếm lô này', null, { timeout: 10000 });
    await hop(p, 'Hàng khác – cộng thêm');
    await choGui(p);
    ok(sql(`select trang_thai from kk.dong where 'D' || lpad(so::text, 5, '0') = '${id}'`) === 'HUY', 'dòng cũ ' + id + ' chưa bị huỷ');
    ok(tongLo('TT-0001', 'L-A', "and hoc = 'A 1'") === '227', 'hộc A 1 sau khi sửa 10 thành 12: ' + tongLo('TT-0001', 'L-A', "and hoc = 'A 1'"));
    await xong(p);
  });

  await run('hoan_tac', async () => {
    const id = idDong('TT-0001', "and hsd = date '2027-03-20'");
    const p = await vao('444444');
    await p.click('.tabs [data-tab="toi"]');
    await p.click(`#toiList [data-undo="${id}"]`);
    await hop(p, 'Hoàn tác');
    await cho(() => sql(`select trang_thai from kk.dong where 'D' || lpad(so::text, 5, '0') = '${id}'`) === 'HUY', () => 'dòng ' + id + ' chưa bị huỷ');
    ok(tongLo('TT-0001', 'L-A', "and hoc = 'A 1'") === '224', 'hộc A 1 sau khi hoàn tác 3: ' + tongLo('TT-0001', 'L-A', "and hoc = 'A 1'"));
    await xong(p);
  });

  await run('hang_khong_lo', async () => {
    const p = await vao('444444', 'B 1', 'Kho LẺ');
    await thuoc(p, 'vitamin', 'TT-0009');
    await p.check('#khongLo');
    ok(await p.inputValue('#lo') === 'KHONGLO' && await p.inputValue('#hsd') === '31/12/2099', 'không lô không tự điền KHONGLO / 31/12/2099');
    await p.fill('#le', '4');
    await bam(p, 'Lưu lô mới');
    await choGui(p);
    ok(sql("select kho || '|' || lo || '|' || to_char(hsd, 'DD/MM/YYYY') || '|' || sl::float8 from kk.dong where ma = 'TT-0009' and not tap") === 'LE|KHONGLO|31/12/2099|4', 'dòng không lô: ' + sql("select kho || '|' || lo || '|' || hsd || '|' || sl from kk.dong where ma = 'TT-0009' and not tap"));
    await xong(p);
  });

  await run('quy_cach_khac_hoi_lai', async () => {
    const p = await vao('444444');
    await thuoc(p, 'para', 'TT-0001');
    await lo(p, 'NEW');
    await p.fill('#lo', 'L-B'); await p.fill('#hsd', '01012028'); await p.fill('#hop', '1'); await p.fill('#qc', '50');
    await bam(p, 'Lưu lô mới');
    await p.waitForFunction(() => document.getElementById('mTitle').textContent === 'Kiểm tra quy cách', null, { timeout: 10000 });
    await hop(p, 'Đúng, vỏ hộp ghi 50');
    await choGui(p);
    ok(tongLo('TT-0001', 'L-B') === '50', 'lô L-B: ' + tongLo('TT-0001', 'L-B'));
    await xong(p);
  });

  await run('thuoc_kho_khac_hoi_lai', async () => {
    const p = await vao('444444');                                   // kho CHAN; TT-0009 belongs to kho LE in the danh mục
    await thuoc(p, 'vitamin', 'TT-0009');
    await lo(p, 'NEW');
    await p.fill('#lo', 'V-C'); await p.fill('#hsd', '01012028'); await p.fill('#le', '9');
    await bam(p, 'Lưu lô mới');
    await p.waitForFunction(() => /^Thuốc của kho/.test(document.getElementById('mTitle').textContent), null, { timeout: 10000 });
    await hop(p, 'Đúng, đang ở kho');
    await choGui(p);
    ok(sql("select kho || '|' || sl::float8 from kk.dong where ma = 'TT-0009' and lo = 'V-C'") === 'CHAN|9', 'dòng kho khác: ' + sql("select kho || '|' || sl from kk.dong where ma = 'TT-0009' and lo = 'V-C'"));
    await xong(p);
  });

  await run('thuoc_moi_va_it_duyet', async () => {
    const p = await vao('444444');
    await p.click('.tabs [data-tab="moi"]');
    await p.fill('#nTen', 'Siro ho thử 100ml'); await p.fill('#nMa', 'SR-001'); await p.selectOption('#nDvt', 'Chai');
    await p.fill('#nLo', 's1'); await p.fill('#nHsd', '01062027'); await p.fill('#nLe', '6');
    await p.click('#btnMoi');
    await p.waitForFunction(() => /Đã gửi/.test(document.getElementById('moiMsg').textContent), null, { timeout: 10000 });
    await xong(p);
    ok(sql("select count(*) from kk.dong where ma like 'MOI-%' and lo = 'S1' and sl = 6") === '1', 'dòng thuốc mới chưa ghi');
    const it = await vao('111111');
    await it.click('.tabs [data-tab="ql"]');
    await it.waitForSelector('#qlDuyet [data-tm][data-ok="1"]', { timeout: 15000 });
    ok(await it.inputValue('#qlDuyet [data-ma-for]') === 'SR-001', 'ô mã chính thức không điền sẵn mã đề xuất');
    await it.click('#qlDuyet [data-tm][data-ok="1"]');
    await cho(() => sql("select count(*) from kk.thuoc where ma = 'SR-001'") === '1', () => 'SR-001 chưa vào danh mục');
    ok(sql("select lo || '|' || sl::float8 || '|' || trang_thai from kk.dong where ma = 'SR-001'") === 'S1|6|HIEU_LUC', 'dòng thuốc mới sau duyệt: ' + sql("select lo || '|' || sl || '|' || trang_thai from kk.dong where ma = 'SR-001'"));
    await xong(it);
  });

  await run('kho_chot_phieu_bo_sung', async () => {
    sql("update kk.dot_kho set trang_thai = 'DA_CHOT' where dot_id = 'DOT01' and kho = 'CHAN'");
    const p = await vao('444444');
    await p.waitForSelector('#chotBanner:not(.hidden)', { timeout: 10000 });
    await thuoc(p, 'para', 'TT-0001');
    await lo(p, 'L-B'); await p.fill('#le', '2');
    ok(await p.locator('#actions .act:has-text("Cộng thêm")').isDisabled(), 'kho đã chốt mà lưu được khi chưa ghi lý do');
    await p.fill('#lyDo', 'Sót 2 viên dưới kệ');
    await bam(p, 'Cộng thêm');
    await choGui(p);
    ok(dong('TT-0001', "and lo = 'L-B' and sl = 2") === 'L-B|01/01/2028|2|A 1|TK04|BO_SUNG_CONG_THEM|CHO_DUYET', 'phiếu bổ sung: ' + dong('TT-0001', "and lo = 'L-B' and sl = 2"));
    ok(tongLo('TT-0001', 'L-B') === '50', 'phiếu bổ sung đã cộng khi chưa duyệt');
    await xong(p);
    const it = await vao('111111');
    await it.click('.tabs [data-tab="ql"]');
    await it.waitForSelector('#qlDuyet [data-dd][data-ok="1"]', { timeout: 15000 });
    await it.click('#qlDuyet [data-dd][data-ok="1"]');
    await cho(() => tongLo('TT-0001', 'L-B') === '52', () => 'lô L-B sau duyệt: ' + tongLo('TT-0001', 'L-B'));
    await xong(it);
    sql("update kk.dot_kho set trang_thai = 'DANG_KIEM' where dot_id = 'DOT01' and kho = 'CHAN'");
  });

  await run('to_truong_don_lo', async () => {
    const p = await vao('222222', 'C 1');
    await thuoc(p, 'para', 'TT-0001');
    await lo(p, 'L-A'); await p.fill('#le', '260');
    await bam(p, 'Dồn cả lô về hộc C 1');
    await p.waitForFunction(() => document.getElementById('mTitle').textContent === 'Lý do dồn cả lô', null, { timeout: 10000 });
    await p.fill('#lyIn', 'Gom cả lô về C 1 đếm lại');
    await hop(p, 'Dồn cả lô');
    await cho(() => tongLo('TT-0001', 'L-A') === '260', () => 'lô L-A sau khi dồn: ' + tongLo('TT-0001', 'L-A'));
    ok(dong('TT-0001', "and lo = 'L-A' and trang_thai = 'HIEU_LUC'") === 'L-A|15/03/2027|260|C 1|TK02|DON_LO|HIEU_LUC', 'lô L-A còn hiệu lực: ' + dong('TT-0001', "and lo = 'L-A' and trang_thai = 'HIEU_LUC'"));
    await xong(p);
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `${fails} ca FAIL` : 'Tất cả PASS');
process.exit(fails ? 1 : 0);
