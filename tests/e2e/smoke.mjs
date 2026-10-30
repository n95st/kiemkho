// E2E smoke test: the real app (static server on :8765) against the local Supabase stack.
// Run from the repo root after `supabase db reset`:  node tests/e2e/smoke.mjs
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';

const PORT = 8765, BASE = `http://127.0.0.1:${PORT}/`;
const env = Object.fromEntries(execSync('supabase status -o env 2>/dev/null', { encoding: 'utf8' })
  .split('\n').map(l => l.match(/^(\w+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const CONFIG_JS = `window.KK_CONFIG = ${JSON.stringify({ SUPABASE_URL: env.API_URL, SUPABASE_KEY: env.ANON_KEY })};`;
const sql = q => execSync(`docker exec supabase_db_kiem_kho psql -U postgres -At -c "${q}"`, { encoding: 'utf8' }).trim();

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
async function vao(page, pin, hoc = 'A 1') {
  await page.fill('#pin', pin);
  await page.click('#btnLogin');
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('hidden') ||
      (!document.getElementById('main').classList.contains('hidden') && /Hộc/.test(document.getElementById('btnHoc').textContent) && !/Chọn hộc/.test(document.getElementById('btnHoc').textContent)), null, { timeout: 15000 });
    if (await page.locator('#modal.hidden').count()) return;
    const title = await page.textContent('#mTitle');
    if (/^Chọn đợt/.test(title)) await page.click('#mBtns button:has-text("Đợt thử")');
    else if (/^Đang kiểm kho/.test(title)) await page.click('#mBtns button:has-text("Kho CHẴN")');
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
