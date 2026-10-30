// E2E smoke test: the real app (static server on :8765) against the local Supabase stack.
// Run from the repo root after `supabase db reset`:  node tests/e2e/smoke.mjs
import { chromium } from 'playwright';
import { execFileSync, execSync, spawn } from 'node:child_process';

const PORT = 8765, BASE = `http://127.0.0.1:${PORT}/`;
const env = Object.fromEntries(execSync('supabase status -o env 2>/dev/null', { encoding: 'utf8' })
  .split('\n').map(l => l.match(/^(\w+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const CONFIG_JS = `window.KK_CONFIG = ${JSON.stringify({ SUPABASE_URL: env.API_URL, SUPABASE_KEY: env.ANON_KEY })};`;
const sql = q => execFileSync('docker', ['exec', 'supabase_db_kiem_kho', 'psql', '-U', 'postgres', '-At', '-c', q], { encoding: 'utf8' }).trim();

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

try {
  await new Promise(r => setTimeout(r, 800));                       // let the static server bind

  await run('dang_nhap_dem', async () => {
    const p = await newPage();
    await vao(p, '444444');
    ok(/CHẴN/.test(await p.textContent('#btnKho')), 'nút kho không hiện CHẴN');
    ok(/A 1/.test(await p.textContent('#btnHoc')), 'nút hộc không hiện A 1');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('luu_va_xem', async () => {
    const p = await newPage();
    await vao(p, '444444');
    await p.fill('#q', 'para');
    await p.click('.res[data-ma="TT-0001"]');
    await p.fill('#lo', 'A1');
    await p.fill('#hsd', '15032027');
    await p.fill('#hop', '2');
    await p.fill('#qc', '100');
    await p.fill('#le', '5');
    await p.click('.act.main');
    await p.waitForFunction(() => JSON.parse(localStorage.kk_queue || '[]').some(x => x.state === 'done'), null, { timeout: 10000 });
    await p.click('.tabs [data-tab="toi"]');
    await p.waitForFunction(() => /205/.test(document.getElementById('toiList').textContent) && /Đã lưu/.test(document.getElementById('toiList').textContent), null, { timeout: 10000 });
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('hang_doi_cu', async () => {
    const ctx = await browser.newContext();
    await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: CONFIG_JS }));
    // Shapes as written by the old Apps Script build (user has no khos/dvt/loNghi).
    const dot = { id: 'DOT01', ten: 'Đợt thử', st: 'MO', kho: ['CHAN', 'LE'], ngay: '', soVoi: '', trangThai: {} };
    const payload = { dot: 'DOT01', kho: 'CHAN', ma: 'TT-0001', lo: 'B7', hsd: '15/03/2027', hoc: 'A 1', hop: 1, qc: 100, le: 0,
      dvt: 'Viên', thaoTac: 'CONG_THEM', lyDo: '', reqId: 'old-1', gtin: '', khongLo: false };
    await ctx.addInitScript(([d, pl]) => {
      if (localStorage.kk_seeded) return; localStorage.kk_seeded = '1';
      const set = (k, v) => localStorage.setItem('kk_' + k, JSON.stringify(v));
      set('pin', '444444'); set('user', { tk: 'TK04', ten: 'Người đếm 4', role: 'DEM', roleTen: 'Người đếm', tap: false, dots: [d] });
      set('dot', 'DOT01'); set('dotInfo', d); set('dots', [d]); set('kho', 'CHAN'); set('hoc', 'A 1');
      set('queue', [{ reqId: 'old-1', payload: pl, sl: 100, ten: 'Paracetamol 500mg', t: Date.now(), state: 'pending' }]);
    }, [dot, payload]);
    const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
    await p.goto(BASE);
    await p.waitForFunction(() => JSON.parse(localStorage.kk_queue || '[]').some(x => x.reqId === 'old-1' && x.state === 'done'), null, { timeout: 10000 });
    ok(sql("select count(*) from kk.dong where req_id = 'old-1'") === '1', 'bảng kk.dong không có đúng 1 dòng req_id old-1');
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await ctx.close();
  });

  // Phone with 3 queued lines (state pending), signed in as TK04; counts "luu" requests that reach the server.
  async function pageWithQueue(tag) {
    const ctx = await browser.newContext();
    await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: CONFIG_JS }));
    const dot = { id: 'DOT01', ten: 'Đợt thử', st: 'MO', kho: ['CHAN', 'LE'], ngay: '', soVoi: '', trangThai: {} };
    const q = [1, 2, 3].map(i => ({ reqId: `${tag}-${i}`, sl: 10, ten: 'Paracetamol 500mg', t: Date.now(), state: 'pending',
      payload: { dot: 'DOT01', kho: 'CHAN', ma: 'TT-0001', lo: 'Q' + i, hsd: '15/03/2027', hoc: 'A 1', hop: '', qc: '', le: 10,
        dvt: 'Viên', thaoTac: 'CONG_THEM', lyDo: '', reqId: `${tag}-${i}`, gtin: '', khongLo: false } }));
    await ctx.addInitScript(([d, queue]) => {
      if (localStorage.kk_seeded) return; localStorage.kk_seeded = '1';
      const set = (k, v) => localStorage.setItem('kk_' + k, JSON.stringify(v));
      set('pin', '444444'); set('user', { tk: 'TK04', ten: 'Người đếm 4', role: 'DEM', roleTen: 'Người đếm', tap: false, dots: [d] });
      set('dot', 'DOT01'); set('dotInfo', d); set('dots', [d]); set('kho', 'CHAN'); set('hoc', 'A 1'); set('queue', queue);
    }, [dot, q]);
    const p = await ctx.newPage(); p.errors = []; p.luu = 0;
    p.on('pageerror', e => p.errors.push(e.message));
    p.on('request', rq => { if (rq.url().endsWith('/rpc/api') && /"action":"luu"/.test(rq.postData() || '')) p.luu++; });
    await p.goto(BASE);
    return p;
  }
  const states = p => p.evaluate(() => JSON.parse(localStorage.kk_queue || '[]').map(x => x.state).join());

  // IT resets the PIN while the phone still holds queued lines: at most ONE luu request goes out, the lines stay pending
  // (never "error"), and the counter lands on the PIN screen.
  await run('hang_doi_pin_doi', async () => {
    sql("delete from kk.pin_sai; delete from kk.dong where req_id like 'pdoi-%'; update kk.tai_khoan set pin = '987654' where tk = 'TK04'");
    try {
      const p = await pageWithQueue('pdoi');
      await p.waitForFunction(() => !document.getElementById('login').classList.contains('hidden'), null, { timeout: 10000 });
      await p.waitForTimeout(1500);
      ok(p.luu <= 1, `${p.luu} yêu cầu luu đã tới máy chủ (mong đợi tối đa 1)`);
      ok(await states(p) === 'pending,pending,pending', 'dòng chờ không còn pending: ' + await states(p));
      ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
      await p.context().close();
    } finally { sql("update kk.tai_khoan set pin = '444444' where tk = 'TK04'; delete from kk.pin_sai"); }
  });

  // Temporary lock (global cap reached): the counter stays signed in, the lines stay pending and are retried later.
  await run('hang_doi_tam_khoa', async () => {
    sql("delete from kk.pin_sai; insert into kk.pin_sai values ('tran-chung', 60, now() + interval '10 minutes')");
    try {
      const p = await pageWithQueue('tkhoa');
      await p.waitForTimeout(3000);
      ok(p.luu <= 1, `${p.luu} yêu cầu luu đã tới máy chủ (mong đợi tối đa 1)`);
      ok(await p.evaluate(() => localStorage.kk_pin) === '"444444"', 'bị đăng xuất khi chỉ tạm khoá');
      ok(await p.evaluate(() => document.getElementById('login').classList.contains('hidden')), 'màn PIN hiện ra khi chỉ tạm khoá');
      ok(await states(p) === 'pending,pending,pending', 'dòng chờ không còn pending: ' + await states(p));
      ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
      await p.context().close();
    } finally { sql("delete from kk.pin_sai"); }
  });

  await run('can_xem', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await p.click('.tabs [data-tab="ql"]');
    await p.waitForFunction(() => { const t = document.getElementById('qlCanXem').textContent; return t && !/Đang tải/.test(t); }, null, { timeout: 10000 });
    ok(await p.locator('#qlCanXem p.msg').count() === 0, 'Cần xem báo lỗi: ' + await p.textContent('#qlCanXem'));
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('tao_dot', async () => {
    const p = await newPage();
    await vao(p, '111111');
    await p.click('.tabs [data-tab="ql"]');
    await p.click('[data-dotnew]');
    await p.fill('#dTen', 'Kiểm kho thử 11/2026');
    await p.selectOption('#dSoVoi', { label: 'Đợt thử' });
    await p.click('#mBtns button:has-text("Tạo đợt")');
    await p.waitForSelector('#mTitle:has-text("Đã tạo")', { timeout: 10000 });
    await p.click('#mBtns button:has-text("Để sau")');
    await p.waitForFunction(() => /Kiểm kho thử 11\/2026/.test(document.getElementById('qlDot').textContent), null, { timeout: 10000 });
    ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
    await p.context().close();
  });

  await run('xss_ten_kho', async () => {
    const evil = '<img src=x onerror="window.__x=1">';
    sql(`update kk.kho set ten_ngan = $x$${evil}$x$ where ma = 'CHAN'`);
    try {
      const p = await newPage();
      await vao(p, '444444', 'A 1', 'Kho <img');                  // kho button text shows the name literally
      await p.fill('#q', 'vitamin');
      await p.click('.res[data-ma="TT-0009"]');                  // kho_mac_dinh = LE, counting in CHAN
      await p.fill('#lo', 'X1');
      await p.fill('#hsd', '15032027');
      await p.fill('#le', '5');
      await p.click('.act.main');
      await p.waitForSelector('#mTitle:has-text("Thuốc của kho")', { timeout: 10000 });
      ok(await p.locator('#mBody img, #btnKho img, #dWarn img').count() === 0, 'tên kho tạo ra thẻ img');
      ok((await p.textContent('#mBody')).includes(evil), 'chữ thẻ không hiện nguyên văn trong hộp thoại');
      ok((await p.innerHTML('#btnKho')).includes('&lt;img'), 'nút Kho không được escape');
      ok(await p.evaluate(() => window.__x) === undefined, 'mã đã chạy (window.__x)');
      ok(!p.errors.length, 'pageerror: ' + p.errors.join(' | '));
      await p.context().close();
    } finally { sql("update kk.kho set ten_ngan = 'CHẴN' where ma = 'CHAN'"); }
  });

  await run('do_toc_do', async () => {
    const p = await newPage();
    await vao(p, '444444');
    const ms = await p.evaluate(async () => { const t0 = performance.now(); for (let i = 0; i < 10; i++) await api('login'); return (performance.now() - t0) / 10; });
    console.log(`     login trung bình ${ms.toFixed(0)} ms (10 lần)`);
    await p.context().close();
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `${fails} ca FAIL` : 'Tất cả PASS');
process.exit(fails ? 1 : 0);
