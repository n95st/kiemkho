/* Phần dùng chung cho index.html (app điện thoại) và quantri.html (trang quản trị máy tính).
 * Script thường, nạp ngay sau config.js. api() đọc biến toàn cục S (S.pin, S.dot) lúc gọi, nên trang nạp file này phải tự khai S. */
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase();

// ===================================================================== API
async function api(action, data, timeout) {
  const c = window.KK_CONFIG || {}, key = c.SUPABASE_KEY || '';
  if (!c.SUPABASE_URL || !key) throw Object.assign(new Error('Chưa cấu hình máy chủ'), { isNet: true });   // keeps the queue pending
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;                                      // legacy JWT anon key only
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout || 30000);
  let r;
  try {
    r = await fetch(c.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/api', { method: 'POST', signal: ctl.signal, headers,
      body: JSON.stringify({ req: Object.assign({ action: action, pin: S.pin, dot: S.dot }, data || {}) }) });
  } catch (e) {
    throw Object.assign(new Error(e.name === 'AbortError' ? 'Mạng chậm – quá thời gian chờ' : 'Không kết nối được máy chủ'), { isNet: true });
  } finally { clearTimeout(t); }
  if (r.status >= 500 || r.status === 401 || r.status === 403 || r.status === 429)                          // incl. a paused project, gateway or rate limit
    throw Object.assign(new Error('Không kết nối được máy chủ'), { isNet: true });
  let j = null; try { j = JSON.parse(await r.text()); } catch (e) {}
  if (r.ok && j !== null) return j;
  throw new Error((j && j.message) || 'Máy chủ trả về không đúng');
}


// ===================================================================== Excel
let qtXlsxP = null;
function qtTaiSheetJS() {                                   // load SheetJS only when an import is used
  if (window.XLSX) return Promise.resolve();
  if (!qtXlsxP) qtXlsxP = new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = 'vendor/sheetjs/xlsx.full.min.js';
    s.onload = ok; s.onerror = () => { qtXlsxP = null; bad(new Error('Không tải được thư viện đọc Excel – cần có mạng')); };
    document.head.appendChild(s);
  });
  return qtXlsxP;
}
/** Đổi một ô Excel thành chữ. Số ở cột ngày (cotNgay) là số serial: đổi bằng phép tính thuần, không qua Date nên không lệch múi giờ. */
globalThis.oExcelSangChu = (c, i, cotNgay, date1904) => {
  if (typeof c === 'number' && i === cotNgay) {
    const p = XLSX.SSF.parse_date_code(c, { date1904: !!date1904 }), z = n => ('0' + n).slice(-2);
    return p ? z(p.d) + '/' + z(p.m) + '/' + p.y : String(c);
  }
  return String(c).trim();
};
/** Đọc sheet đầu của bộ nhớ file Excel, kể cả dòng tiêu đề; mọi ô thành chữ. */
globalThis.oExcelDoc = (buf, cotNgay) => {
  const wb = XLSX.read(buf, { type: 'array' }), d1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  return rows.map(r => r.map((c, i) => oExcelSangChu(c, i, cotNgay, d1904)));
};
/** Đọc sheet đầu của file Excel, kể cả dòng tiêu đề. Số ở cột cotNgay đổi thành chữ DD/MM/YYYY, ô khác thành chữ. */
async function docFileExcel(file, cotNgay) {
  await qtTaiSheetJS();
  return oExcelDoc(await file.arrayBuffer(), cotNgay);
}
/** Như docFileExcel nhưng tách dòng tiêu đề (tieuDe), bỏ dòng trống và nhớ số dòng thật trong file (để báo lỗi đúng dòng). */
async function qtDocExcel(file, cotNgay) {
  const rows = await docFileExcel(file, cotNgay), list = [], so = [];
  rows.slice(1).forEach((r, i) => { if (r.some(c => c !== '')) { list.push(r); so.push(i + 2); } });
  return { tieuDe: rows[0] || [], list, so };
}
