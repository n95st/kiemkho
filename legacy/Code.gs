/**
 * KIỂM KHO iSOFH  ·  Cổng API cho web app (GitHub Pages). Dữ liệu ở Google Sheets.
 *
 * NHIỀU ĐỢT KIỂM:
 *   - File này = "TRUNG TÂM": tài khoản/PIN (NGUOI_DEM), danh mục gốc + mã vạch đã học (DANH_MUC), danh sách đợt (DOT).
 *   - Mỗi đợt kiểm = 1 file Google Sheets riêng (DONG, HOC, TONG_HOP, LAN1…), tạo bằng nút "Tạo đợt mới" trong app (IT).
 *   - Web app gửi kèm mã đợt trong mọi yêu cầu → ghi đúng file của đợt đó. Chỉ có 1 link API dùng mãi.
 *
 * Nguyên tắc: KHÔNG BAO GIỜ XOÁ DỮ LIỆU. Mỗi lần lưu = 1 dòng mới trong sheet DONG.
 *   - Cộng thêm   : thêm dòng, không đụng dòng cũ.
 *   - Đếm lại hộc : dòng cũ CÙNG lô + CÙNG hộc chuyển "THAY_THE" (trỏ tới dòng mới).
 *   - Dồn cả lô   : mọi dòng cũ của lô (mọi hộc) chuyển "THAY_THE" (chỉ tổ trưởng / IT).
 *   - Hoàn tác    : dòng chuyển "HUY", các dòng nó đã thay được khôi phục.
 *   Tổng tồn = cộng các dòng có Trạng thái = HIEU_LUC.
 *
 * CÀI ĐẶT: dán file này vào Tiện ích mở rộng → Apps Script của file TRUNG TÂM,
 *          chạy hàm caiDat() 1 lần (tạo luôn đợt đầu "Kiểm kho lần 2"),
 *          rồi Triển khai → Ứng dụng web (Thực thi: Tôi · Truy cập: Bất kỳ ai).
 *
 * BẢN THAM CHIẾU (repo kiemkho): đây là hợp đồng gốc cho bản Supabase. Hai mã file Google đã được che.
 */

// ====== Cấu hình nguồn dữ liệu lần 1 (file kiểm kho cũ) ======
const FILE_CHAN_LAN1 = '<đã che>';   // KIỂM KHO CHẴN – iSOFH (nhập online)
const FILE_LE_LAN1   = '<đã che>';   // KIỂM KHO LẺ – iSOFH (nhập online)
const MA_THUOC_KHO_LE = ['TT-0009', 'TT-0015', 'TT-0016', 'TT-0020', 'TT-0024', 'TT-0057', 'TT-0078', 'VK-0004'];

const KHO = { CHAN: 'Kho chẵn', LE: 'Kho lẻ' };
const ROLE = { DEM: 'Người đếm', TO_TRUONG: 'Tổ trưởng', IT: 'IT', TAP: 'Tập (không tính)' };
// Tài khoản TAP ghi vào sheet TAP / TAP_HOC thay cho DONG / HOC (đặt lại mỗi lần gọi API)
let DONG_SHEET = 'DONG', HOC_SHEET = 'HOC';
const LO_MAC_DINH = 'KHONGLO', HSD_MAC_DINH = '31/12/2099';

// ====== Cột sheet DONG (0-based) ======
const C = { ID: 0, TG: 1, KHO: 2, MA: 3, TEN: 4, LO: 5, HSD: 6, HOC: 7, HOP: 8, QC: 9, LE: 10, SL: 11, DVT: 12,
            NGUOI: 13, TK: 14, TT: 15, ST: 16, THAY_BOI: 17, GHI: 18, CANH_BAO: 19, REQ: 20, CAP_NHAT: 21, SE_THAY: 22 };
const NCOL = 23;
const DONG_HEADER = ['ID', 'Thời điểm', 'Kho', 'Mã', 'Tên thuốc', 'Số lô', 'HSD', 'Hộc', 'Số hộp', '1 hộp có mấy', 'Số lẻ',
  'SL (ĐVT nhỏ nhất)', 'ĐVT', 'Người đếm', 'Tài khoản', 'Thao tác', 'Trạng thái', 'Bị thay bởi', 'Lý do / Ghi chú',
  'Cảnh báo', 'Mã yêu cầu', 'Cập nhật', 'Sẽ thay (chờ duyệt)'];

// ====== Đợt kiểm đang dùng trong yêu cầu hiện tại (đặt lại mỗi lần gọi API) ======
let DOT = null, DOT_SS = null;
const DOT_HEADER = ['Mã đợt', 'Tên đợt', 'Trạng thái (MO/DONG)', 'Kho kiểm', 'Ngày tạo', 'Người tạo', 'So sánh với', 'File ID', 'Link file', 'Ghi chú'];
const DOT_SHEETS = ['TONG_HOP', 'TONG_HOP_LO', 'DONG', 'HOC', 'THUOC_MOI', 'LAN1', 'DANH_MUC', 'NHAT_KY', 'CAU_HINH', 'TAP', 'TAP_HOC'];

function hub_() { return SpreadsheetApp.getActiveSpreadsheet(); }                 // file TRUNG TÂM (file chứa script)
function hubSh_(name) { const s = hub_().getSheetByName(name); if (!s) throw new Error('Thiếu sheet ' + name + ' ở file Trung tâm – chạy caiDat()'); return s; }
function ss_() { if (!DOT_SS) throw new Error('Chưa chọn đợt kiểm'); return DOT_SS; }   // file của đợt đang kiểm
function sh_(name) { const s = ss_().getSheetByName(name); if (!s) throw new Error('File đợt thiếu sheet ' + name); return s; }
function tz_() { return hub_().getSpreadsheetTimeZone() || 'Asia/Ho_Chi_Minh'; }
function now_() { return new Date(); }
function fmtDate_(d) { return d instanceof Date && !isNaN(d) ? Utilities.formatDate(d, tz_(), 'dd/MM/yyyy') : (d ? String(d) : ''); }
function fmtTime_(d) { return d instanceof Date && !isNaN(d) ? Utilities.formatDate(d, tz_(), 'dd/MM HH:mm') : (d ? String(d) : ''); }
function loKey_(s) { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '').replace(/^[.\-_#:]+|[.\-_#:]+$/g, ''); }
function loText_(s) { return String(s == null ? '' : s).toUpperCase().trim().replace(/\s+/g, ' '); }
function hocKey_(s) { return String(s == null ? '' : s).toUpperCase().trim().replace(/\s+/g, ' '); }
function num_(v) { if (v === '' || v == null) return ''; const n = Number(String(v).replace(',', '.')); if (isNaN(n)) throw new Error('Số không hợp lệ: ' + v); return n; }
function canEditAll_(u) { return u.role === 'TO_TRUONG' || u.role === 'IT'; }
function needRole_(u, roles) { if (roles.indexOf(u.role) < 0) throw new Error('Tài khoản ' + u.ten + ' không có quyền này'); }

function parseHsd_(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const d = +m[1], mo = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    const dt = Utilities.parseDate(('0' + d).slice(-2) + '/' + ('0' + mo).slice(-2) + '/' + y, tz_(), 'dd/MM/yyyy');
    return fmtDate_(dt) === ('0' + d).slice(-2) + '/' + ('0' + mo).slice(-2) + '/' + y ? dt : null;   // loại 31/02
  }
  m = s.match(/^(\d{1,2})[\/\-.](\d{4})$/);                      // tháng/năm → ngày cuối tháng
  if (m && +m[1] >= 1 && +m[1] <= 12) {
    const last = new Date(+m[2], +m[1], 0).getDate();
    return Utilities.parseDate(last + '/' + m[1] + '/' + m[2], tz_(), 'dd/MM/yyyy');
  }
  return null;
}

// ====================================================================== HTTP
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  return out_({ ok: true, app: 'KIEMKHO_ISOFH', ban: 3, ten: hub_().getName(), luc: fmtTime_(now_()) });
}

// Chức năng chỉ dùng file Trung tâm (không cần mã đợt) · chức năng ghi (bị chặn khi đợt đã đóng)
const HUB_ACTION = { login: 1, danhMuc: 1, dsTaiKhoan: 1, dsDot: 1, taoDot: 1, datTrangThaiDot: 1 };
const WRITE_ACTION = { luu: 1, hoanTac: 1, thuocMoi: 1, nhanHoc: 1, xongHoc: 1, duyetDong: 1, duyetThuocMoi: 1, gopLo: 1, datTrangThaiKho: 1 };

function doPost(e) {
  let req;
  try { req = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
  catch (err) { return out_({ ok: false, error: 'Yêu cầu không hợp lệ' }); }
  try {
    const fn = API[req.action];
    if (!fn) throw new Error('Không có chức năng: ' + req.action);
    const u = auth_(req.pin);
    DONG_SHEET = u.role === 'TAP' ? 'TAP' : 'DONG'; HOC_SHEET = u.role === 'TAP' ? 'TAP_HOC' : 'HOC';
    DOT = null; DOT_SS = null;
    if (!HUB_ACTION[req.action]) useDot_(req.dot, u, !!WRITE_ACTION[req.action]);
    return out_(Object.assign({ ok: true }, fn(u, req) || {}));
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

// ====================================================================== ĐỢT KIỂM
function dots_() {
  const c = CacheService.getScriptCache(), hit = c.get('dots');
  if (hit) return JSON.parse(hit);
  const s = hub_().getSheetByName('DOT'), n = s ? s.getLastRow() - 1 : 0;
  const list = (n > 0 ? s.getRange(2, 1, n, 10).getValues() : []).filter(r => r[0] && r[7]).map(r => {
    const kho = String(r[3] || '').toUpperCase().split(/[\s,;]+/).filter(k => KHO[k]);
    return { id: String(r[0]).trim(), ten: String(r[1] || r[0]).trim(), st: String(r[2]).trim().toUpperCase() === 'DONG' ? 'DONG' : 'MO',
             kho: kho.length ? kho : ['CHAN', 'LE'], ngay: fmtDate_(r[4]), nguoi: String(r[5] || ''), soVoi: String(r[6] || ''),
             fileId: String(r[7]).trim(), url: String(r[8] || ''), ghi: String(r[9] || '') };
  });
  c.put('dots', JSON.stringify(list), 60);
  return list;
}
function dotsChanged_() { CacheService.getScriptCache().remove('dots'); }
function openDotSS_(d) { return d.fileId === hub_().getId() ? hub_() : SpreadsheetApp.openById(d.fileId); }
function useDot_(id, u, write) {
  const d = id && dots_().filter(x => x.id === String(id))[0];
  if (!d) throw new Error(id ? 'Không thấy đợt kiểm ' + id + ' – chọn lại đợt (☰ → Đổi đợt kiểm)' : 'Chưa chọn đợt kiểm – chọn đợt (☰ → Đổi đợt kiểm)');
  if (d.st !== 'MO' && write) throw new Error('Đợt "' + d.ten + '" đã đóng – chỉ xem được. Cần nhập thêm thì báo IT mở lại đợt');
  DOT = d; DOT_SS = openDotSS_(d);
  return d;
}
function dotPublic_(d, u) {
  const o = { id: d.id, ten: d.ten, st: d.st, kho: d.kho, ngay: d.ngay, soVoi: d.soVoi };
  if (u && u.role === 'IT') { o.url = d.url; o.nguoi = d.nguoi; o.ghi = d.ghi; }
  return o;
}
function dotsVisible_(u) { return dots_().filter(d => d.st === 'MO' || canEditAll_(u)); }

// ====================================================================== ĐĂNG NHẬP
function users_() {
  const c = CacheService.getScriptCache(), hit = c.get('users');
  if (hit) return JSON.parse(hit);
  const s = hubSh_('NGUOI_DEM'), n = s.getLastRow() - 1;
  const rows = n > 0 ? s.getRange(2, 1, n, 5).getValues() : [];
  const list = rows.filter(r => r[0] && String(r[2]).trim()).map(r => ({
    tk: String(r[0]).trim(), ten: String(r[1] || r[0]).trim(), pin: String(r[2]).trim(),
    role: ROLE[String(r[3]).trim()] ? String(r[3]).trim() : 'DEM', active: r[4] === true || String(r[4]).toUpperCase() === 'TRUE' }));
  c.put('users', JSON.stringify(list), 60);
  return list;
}

function auth_(pin) {
  const c = CacheService.getScriptCache();
  const fails = +(c.get('pinfail') || 0);
  if (fails >= 40) throw new Error('Tạm khoá đăng nhập 10 phút vì nhập sai PIN quá nhiều lần');
  pin = String(pin || '').trim();
  const u = pin && users_().filter(x => x.pin === pin)[0];
  if (!u) { c.put('pinfail', String(fails + 1), 600); throw new Error('Sai mã PIN'); }
  if (!u.active) throw new Error('Tài khoản ' + u.ten + ' đang bị khoá – báo IT');
  return u;
}

// ====================================================================== ĐỌC DỮ LIỆU
function cfgIn_(ss) {
  const s = ss.getSheetByName('CAU_HINH'), n = s ? s.getLastRow() : 0;
  const o = {};
  if (n >= 1) s.getRange(1, 1, n, 2).getValues().forEach(r => { if (r[0]) o[String(r[0])] = r[1]; });
  return o;
}
function setCfgIn_(ss, k, v) {
  const s = ss.getSheetByName('CAU_HINH') || ss.insertSheet('CAU_HINH'), n = s.getLastRow();
  const keys = n ? s.getRange(1, 1, n, 1).getValues().map(r => String(r[0])) : [];
  const i = keys.indexOf(k);
  if (i >= 0) s.getRange(i + 1, 2).setValue(v); else s.getRange(n + 1, 1, 1, 2).setValues([[k, v]]);
}
function cfg_() { return cfgIn_(ss_()); }                 // cấu hình của đợt (trạng thái kho)
function gcfg_() { return cfgIn_(hub_()); }               // cấu hình chung (lô/HSD mặc định)
function setCfg_(k, v) { setCfgIn_(ss_(), k, v); }
function loMacDinh_() { const g = gcfg_(); return { lo: cfgText_(g.LO_MAC_DINH) || LO_MAC_DINH, hsd: cfgText_(g.HSD_MAC_DINH) || HSD_MAC_DINH }; }
function cfgText_(v) { return v instanceof Date ? fmtDate_(v) : String(v == null ? '' : v).trim().replace(/^'/, ''); }
function khoState_(kho) { return String(cfg_()['TRANG_THAI_' + kho] || 'DANG_KIEM'); }

function dm_() {
  const s = hubSh_('DANH_MUC'), n = s.getLastRow() - 1;
  const rows = n > 0 ? s.getRange(2, 1, n, 8).getValues() : [];
  const map = {}, list = [];
  rows.forEach((r, i) => {
    const ma = String(r[0] || '').trim(); if (!ma) return;
    const o = { ma: ma, ten: String(r[1] || ''), dvtn: String(r[2] || ''), qc: r[3] === '' ? '' : Number(r[3]) || '',
                dvt: String(r[4] || ''), kho: String(r[5] || '').trim().toUpperCase(), gtin: String(r[6] || ''), row: i + 2 };
    map[ma] = o; list.push(o);
  });
  return { map: map, list: list };
}

function readDong_() {
  const s = sh_(DONG_SHEET), n = s.getLastRow() - 1;
  return n > 0 ? s.getRange(2, 1, n, NCOL).getValues() : [];
}
function lineObj_(r) {
  return { id: r[C.ID], tg: fmtTime_(r[C.TG]), kho: r[C.KHO], ma: r[C.MA], ten: r[C.TEN], lo: String(r[C.LO]), hsd: fmtDate_(r[C.HSD]),
           hoc: String(r[C.HOC]), hop: r[C.HOP], qc: r[C.QC], le: r[C.LE], sl: r[C.SL], dvt: r[C.DVT], nguoi: r[C.NGUOI], tk: r[C.TK],
           tt: r[C.TT], st: r[C.ST], ghi: r[C.GHI], cb: r[C.CANH_BAO], seThay: r[C.SE_THAY] };
}
function rowOfId_(id) { const m = String(id || '').match(/^D(\d+)$/); if (!m) throw new Error('Mã dòng không hợp lệ'); return +m[1] + 1; }
function nextId_(s) { return 'D' + ('00000' + s.getLastRow()).slice(-5); }      // dòng mới sẽ nằm ở lastRow+1 → số = lastRow

function log_(u, action, detail) {
  try { (DOT_SS || hub_()).getSheetByName('NHAT_KY').appendRow([now_(), u.tk, u.ten, action, typeof detail === 'string' ? detail : JSON.stringify(detail)]); } catch (e) {}
}

/** Chép DANH_MUC của Trung tâm sang file đợt (để TONG_HOP và bước chốt/đổ iSOFH có đủ mã) */
function syncDm_(ss) {
  const hub = hub_(); if (!ss || ss.getId() === hub.getId()) return;
  const src = hub.getSheetByName('DANH_MUC'), n = src ? src.getLastRow() : 0; if (n < 1) return;
  const vals = src.getRange(1, 1, n, 8).getValues();
  const d = ss.getSheetByName('DANH_MUC') || ss.insertSheet('DANH_MUC');
  const old = d.getLastRow(); if (old > n) d.getRange(n + 1, 1, old - n, 8).clearContent();
  d.getRange(1, 7, n, 1).setNumberFormat('@');
  d.getRange(1, 1, n, 8).setValues(vals);
}
function syncDmAll_() {
  dots_().filter(d => d.st === 'MO').forEach(d => { try { syncDm_(openDotSS_(d)); } catch (e) { Logger.log('Không đồng bộ được danh mục cho ' + d.id + ': ' + e); } });
}

// ====================================================================== API
const API = {};

/** Đăng nhập. Gửi kèm `dot` → trả thêm thông tin đợt (trạng thái kho). Luôn trả danh sách đợt được thấy. */
API.login = function (u, req) {
  const md = loMacDinh_(), vis = dotsVisible_(u);
  let info = null;
  const d = req.dot && vis.filter(x => x.id === String(req.dot))[0];
  if (d) { useDot_(d.id, u, false); info = dotInfo_(d, u); }
  return { tk: u.tk, ten: u.ten, role: u.role, roleTen: ROLE[u.role], tap: u.role === 'TAP', loMacDinh: md.lo, hsdMacDinh: md.hsd,
           dots: vis.map(x => dotPublic_(x, u)), dotInfo: info, dot: info ? info.ten : '', trangThai: info ? info.trangThai : {},
           hubUrl: u.role === 'IT' ? hub_().getUrl() : '' };
};
function dotInfo_(d, u) { return Object.assign(dotPublic_(d, u), { trangThai: { CHAN: khoState_('CHAN'), LE: khoState_('LE') } }); }

API.dsDot = function (u) { return { list: dotsVisible_(u).map(x => dotPublic_(x, u)), hubUrl: u.role === 'IT' ? hub_().getUrl() : '' }; };

/** IT tạo đợt mới: { ten, kho: ['CHAN','LE'], soVoi: '' | 'LAN1_CU' | mã đợt, copyHoc } */
API.taoDot = function (u, req) {
  needRole_(u, ['IT']);
  const ten = String(req.ten || '').trim(); if (ten.length < 3) throw new Error('Nhập tên đợt (VD: Kiểm kho cuối năm 2026)');
  const kho = [].concat(req.kho || []).map(k => String(k).toUpperCase()).filter((k, i, a) => KHO[k] && a.indexOf(k) === i);
  if (!kho.length) throw new Error('Chọn ít nhất 1 kho');
  if (dots_().some(d => normTen_(d.ten) === normTen_(ten))) throw new Error('Đã có đợt tên "' + ten + '"');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const d = taoDot_(ten, kho, String(req.soVoi || ''), req.copyHoc !== false, u.ten);
    log_(u, 'TAO_DOT', d.id + ' ' + ten + ' · ' + kho.join(',') + (d.soVoi ? ' · so với ' + d.soVoi : ''));
    return { dot: dotPublic_(d, u) };
  } finally { lock.releaseLock(); }
};

API.datTrangThaiDot = function (u, req) {
  needRole_(u, ['IT']);
  const d = dots_().filter(x => x.id === String(req.id))[0]; if (!d) throw new Error('Không thấy đợt ' + req.id);
  const st = String(req.st || '').toUpperCase(); if (st !== 'MO' && st !== 'DONG') throw new Error('Trạng thái đợt không hợp lệ');
  const reg = hubSh_('DOT'), ids = reg.getRange(2, 1, reg.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim());
  const row = ids.indexOf(d.id) + 2;
  reg.getRange(row, 3).setValue(st);
  reg.getRange(row, 10).setValue((st === 'DONG' ? 'Đóng ' : 'Mở lại ') + fmtTime_(now_()) + ' bởi ' + u.ten);
  dotsChanged_();
  if (st === 'DONG') { try { syncDm_(openDotSS_(d)); } catch (e) {} }          // chụp lại danh mục cuối cùng vào file đợt
  log_(u, st === 'DONG' ? 'DONG_DOT' : 'MO_DOT', d.id + ' ' + d.ten);
  return { dot: dotPublic_(Object.assign({}, d, { st: st }), u) };
};

API.danhMuc = function (u, req) {
  const cache = CacheService.getScriptCache();
  let v = cache.get('dm_v'), body = cache.get('dm_body');
  if (!v || !body) {
    const list = dm_().list.map(o => [o.ma, o.ten, o.dvtn, o.qc, o.dvt, o.kho, o.gtin]);
    body = JSON.stringify(list);
    v = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body, Utilities.Charset.UTF_8)).slice(0, 12);
    if (body.length < 95000) { cache.put('dm_v', v, 300); cache.put('dm_body', body, 300); }
  }
  if (req.v && req.v === v) return { v: v, same: true };
  return { v: v, list: JSON.parse(body) };
};
function dmChanged_() { const c = CacheService.getScriptCache(); c.remove('dm_v'); c.remove('dm_body'); }

API.xemThuoc = function (u, req) {
  const kho = checkKho_(req.kho), ma = String(req.ma || '');
  const all = readDong_();
  const lines = [], khac = {};
  all.forEach(r => {
    if (r[C.MA] !== ma) return;
    if (r[C.KHO] === kho && (r[C.ST] === 'HIEU_LUC' || r[C.ST] === 'CHO_DUYET')) lines.push(lineObj_(r));
    else if (r[C.KHO] !== kho && r[C.ST] === 'HIEU_LUC') khac[r[C.KHO]] = (khac[r[C.KHO]] || 0) + (Number(r[C.SL]) || 0);
  });
  return { lines: lines, khac: khac, trangThai: khoState_(kho) };
};

API.cuaToi = function (u, req) {
  const all = readDong_(), n = Math.min(+req.n || 20, 100), res = [];
  for (let i = all.length - 1; i >= 0 && res.length < n; i--) if (all[i][C.TK] === u.tk) res.push(lineObj_(all[i]));
  return { lines: res };
};

API.tienDo = function (u, req) {
  const kho = checkKho_(req.kho), all = readDong_();
  const ma = {}; let dong = 0, cho = 0;
  all.forEach(r => { if (r[C.KHO] !== kho) return;
    if (r[C.ST] === 'HIEU_LUC') { ma[r[C.MA]] = 1; dong++; } else if (r[C.ST] === 'CHO_DUYET') cho++; });
  const l1 = lan1Totals_(kho);
  const l1ma = Object.keys(l1);
  const hs = API.dsHoc(u, { kho: kho });
  return { soMa: Object.keys(ma).length, soDong: dong, choDuyet: cho, lan1: l1ma.length, hocXong: hs.xong, hocDang: hs.dang, hocChua: hs.chua,
           lan1DaDemLai: l1ma.filter(m => ma[m]).length, tongDanhMuc: dm_().list.length, trangThai: khoState_(kho), soVoi: DOT ? DOT.soVoi : '' };
};

function checkKho_(k) {
  k = String(k || '').toUpperCase(); if (!KHO[k]) throw new Error('Chưa chọn kho');
  if (DOT && DOT.kho.indexOf(k) < 0) throw new Error('Đợt "' + DOT.ten + '" không kiểm ' + KHO[k]);
  return k;
}

function canhBao_(dmo, kho, lo, hsd, hop, qc) {
  const cb = [];
  if (dmo) {
    if (hop > 0 && dmo.qc && qc && Number(qc) !== Number(dmo.qc)) cb.push('Quy cách ' + qc + ' khác gợi ý ' + dmo.qc);
    if (dmo.kho && dmo.kho !== kho) cb.push('Thuốc thuộc ' + KHO[dmo.kho]);
  }
  if (lo && /MFG|MFD|NSX|EXP|HSD|LOT|BATCH/i.test(lo)) cb.push('Số lô có chữ ' + lo.match(/MFG|MFD|NSX|EXP|HSD|LOT|BATCH/i)[0]);
  if (lo && /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(lo)) cb.push('Số lô trông giống ngày tháng');
  if (hsd) {
    const days = (hsd - now_()) / 864e5;
    if (days < 0) cb.push('HSD đã quá hạn'); else if (days < 90) cb.push('HSD còn dưới 3 tháng');
  }
  return cb;
}

/** LƯU 1 lần đếm. thaoTac: CONG_THEM | DEM_LAI_HOC | DON_LO */
API.luu = function (u, req) {
  const kho = checkKho_(req.kho);
  const ma = String(req.ma || '').trim();
  const dm = dm_(); const dmo = dm.map[ma];
  let ten = dmo ? dmo.ten : '';
  let laThuocMoi = false;
  if (!dmo) {
    const tm = thuocMoiByTemp_(ma);
    if (!tm) throw new Error('Mã ' + ma + ' không có trong danh mục');
    ten = tm.ten; laThuocMoi = true;
  }
  const hoc = hocKey_(req.hoc); if (!hoc) throw new Error('Chưa nhập hộc / vị trí');
  const hop = num_(req.hop), qc = num_(req.qc), le = num_(req.le);
  if (hop === '' && le === '') throw new Error('Chưa nhập số lượng');
  [hop, qc, le].forEach(x => { if (x !== '' && x < 0) throw new Error('Số lượng không được âm'); });
  if (hop > 0 && !(qc > 0)) throw new Error('Có số hộp thì phải có "1 hộp có mấy"');
  const sl = (hop || 0) * (qc || 0) + (le || 0);
  let loIn = req.lo, hsdIn = req.hsd;
  if (req.khongLo) { const md = loMacDinh_(); loIn = md.lo; hsdIn = md.hsd; }
  const lo = loText_(loIn), key = loKey_(lo);
  const hsd = hsdIn ? parseHsd_(hsdIn) : null;
  if (req.hsd && !hsd) throw new Error('HSD không đúng dạng dd/mm/yyyy');
  if (sl > 0 && (!key || !hsd)) throw new Error('Có số lượng thì phải có Số lô và HSD');
  const tt = String(req.thaoTac || 'CONG_THEM');
  if (['CONG_THEM', 'DEM_LAI_HOC', 'DON_LO'].indexOf(tt) < 0) throw new Error('Thao tác không hợp lệ');
  if (tt === 'DON_LO') needRole_(u, ['TO_TRUONG', 'IT']);
  const dvt = String(req.dvt || (dmo && dmo.dvt) || '').trim();
  if (!dvt) throw new Error('Chưa chọn ĐVT');

  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const s = sh_(DONG_SHEET);
    const all = readDong_();
    if (req.reqId) {                                            // chống gửi trùng (hàng đợi offline gửi lại)
      for (let i = all.length - 1; i >= 0; i--) if (all[i][C.REQ] === req.reqId)
        return { id: all[i][C.ID], st: all[i][C.ST], trungLap: true, lines: linesOf_(readDong_(), kho, ma) };
    }
    const lot = all.filter(r => r[C.KHO] === kho && r[C.MA] === ma && loKey_(r[C.LO]) === key && r[C.ST] === 'HIEU_LUC');
    // HSD khác với dòng cũ cùng lô
    const hsdCu = lot.map(r => fmtDate_(r[C.HSD])).filter((v, i, a) => v && a.indexOf(v) === i);
    if (hsd && hsdCu.length && hsdCu.indexOf(fmtDate_(hsd)) < 0 && !req.okHsd)
      return { ok: false, need: 'HSD_KHAC', hsdCu: hsdCu, error: 'Lô ' + lo + ' đã ghi HSD ' + hsdCu.join(', ') };
    let targets = [];
    if (tt === 'CONG_THEM') {
      const cungHoc = lot.filter(r => hocKey_(r[C.HOC]) === hoc && r[C.TK] !== u.tk);
      if (cungHoc.length && !req.okCungHoc)
        return { ok: false, need: 'CUNG_HOC', lines: cungHoc.map(lineObj_),
                 error: 'Hộc ' + hoc + ' đã có ' + cungHoc.map(r => r[C.NGUOI]).join(', ') + ' đếm lô này' };
    } else {
      if (req.seen) {                                           // người khác vừa thay đổi lô này?
        const now = lot.map(r => r[C.ID]).sort().join(','), seen = [].concat(req.seen).sort().join(',');
        if (now !== seen) return { ok: false, conflict: true, lines: linesOf_(all, kho, ma),
                                   error: 'Vừa có người cập nhật lô này – xem lại số mới rồi lưu lại' };
      }
      targets = tt === 'DEM_LAI_HOC' ? lot.filter(r => hocKey_(r[C.HOC]) === hoc) : lot;
      if (!targets.length) throw new Error(tt === 'DEM_LAI_HOC' ? 'Hộc ' + hoc + ' chưa có dòng nào của lô này – dùng "Cộng thêm"'
                                                               : 'Lô này chưa có dòng nào để dồn');
      if (tt === 'DEM_LAI_HOC' && !canEditAll_(u) && targets.some(r => r[C.TK] !== u.tk))
        throw new Error('Hộc này do ' + targets.map(r => r[C.NGUOI]).join(', ') + ' đếm – chỉ người đó hoặc tổ trưởng được đếm lại');
      if (tt === 'DON_LO' && !String(req.lyDo || '').trim()) throw new Error('Dồn cả lô cần ghi lý do');
    }
    const chot = khoState_(kho) === 'DA_CHOT';
    if (chot && !String(req.lyDo || '').trim()) throw new Error(KHO[kho] + ' đã chốt – ghi lý do bổ sung để IT duyệt');
    const st = (chot || laThuocMoi) ? 'CHO_DUYET' : 'HIEU_LUC';
    const cb = canhBao_(dmo, kho, lo, hsd, hop, qc);
    const id = nextId_(s), t = now_();
    const row = new Array(NCOL).fill('');
    row[C.ID] = id; row[C.TG] = t; row[C.KHO] = kho; row[C.MA] = ma; row[C.TEN] = ten; row[C.LO] = lo; row[C.HSD] = hsd || '';
    row[C.HOC] = hoc; row[C.HOP] = hop; row[C.QC] = qc; row[C.LE] = le; row[C.SL] = sl; row[C.DVT] = dvt;
    row[C.NGUOI] = u.ten; row[C.TK] = u.tk; row[C.TT] = chot ? 'BO_SUNG_' + tt : tt; row[C.ST] = st;
    row[C.GHI] = [req.khongLo ? 'Hàng không có lô/HSD' : '', String(req.lyDo || req.ghiChu || '').trim()].filter(Boolean).join(' · '); row[C.CANH_BAO] = cb.join('; '); row[C.REQ] = req.reqId || '';
    if (st === 'CHO_DUYET' && targets.length) row[C.SE_THAY] = targets.map(r => r[C.ID]).join(',');
    const rn = s.getLastRow() + 1;
    s.getRange(rn, C.LO + 1).setNumberFormat('@');
    s.getRange(rn, 1, 1, NCOL).setValues([row]);
    if (st === 'HIEU_LUC') targets.forEach(r => markReplaced_(s, r[C.ID], id, u));
    if (req.gtin && dmo && u.role !== 'TAP') learnGtin_(dmo, req.gtin);
    return { id: id, st: st, canhBao: cb, lines: linesOf_(readDong_(), kho, ma) };
  } finally { lock.releaseLock(); }
};

function markReplaced_(s, targetId, byId, u) {
  const r = rowOfId_(targetId);
  s.getRange(r, C.ST + 1, 1, 2).setValues([['THAY_THE', byId]]);
  s.getRange(r, C.CAP_NHAT + 1).setValue(fmtTime_(now_()) + ' ' + u.tk);
}
function linesOf_(all, kho, ma) {
  return all.filter(r => r[C.KHO] === kho && r[C.MA] === ma && (r[C.ST] === 'HIEU_LUC' || r[C.ST] === 'CHO_DUYET')).map(lineObj_);
}
function learnGtin_(dmo, gtin) {
  gtin = String(gtin).replace(/\D/g, '');
  if (gtin.length < 8 || gtin.length > 14) return;
  const cur = String(dmo.gtin || '').split(/[\s;,]+/).filter(Boolean);
  if (cur.indexOf(gtin) >= 0) return;
  cur.push(gtin);
  const s = hubSh_('DANH_MUC'); s.getRange(dmo.row, 7).setNumberFormat('@'); s.getRange(dmo.row, 7).setValue(cur.join(' '));
  dmChanged_();
}

API.hoanTac = function (u, req) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const s = sh_(DONG_SHEET), rn = rowOfId_(req.id);
    if (rn > s.getLastRow()) throw new Error('Không thấy dòng ' + req.id);
    const r = s.getRange(rn, 1, 1, NCOL).getValues()[0];
    if (r[C.ST] !== 'HIEU_LUC' && r[C.ST] !== 'CHO_DUYET') throw new Error('Dòng ' + req.id + ' đang ở trạng thái ' + r[C.ST] + ' – không hoàn tác được');
    if (r[C.TK] !== u.tk && !canEditAll_(u)) throw new Error('Chỉ hoàn tác được dòng của mình');
    if (r[C.ST] === 'HIEU_LUC' && khoState_(r[C.KHO]) === 'DA_CHOT' && u.role !== 'IT') throw new Error('Kho đã chốt – báo IT');
    s.getRange(rn, C.ST + 1).setValue('HUY');
    s.getRange(rn, C.CAP_NHAT + 1).setValue(fmtTime_(now_()) + ' huỷ bởi ' + u.tk);
    let restored = 0;
    readDong_().forEach(x => { if (x[C.ST] === 'THAY_THE' && x[C.THAY_BOI] === r[C.ID]) {
      const xr = rowOfId_(x[C.ID]); s.getRange(xr, C.ST + 1, 1, 2).setValues([['HIEU_LUC', '']]); restored++; } });
    log_(u, 'HOAN_TAC', req.id + (restored ? ' (khôi phục ' + restored + ' dòng)' : ''));
    return { restored: restored, lines: linesOf_(readDong_(), r[C.KHO], r[C.MA]) };
  } finally { lock.releaseLock(); }
};

// ---------------------------------------------------------------- THUỐC CHƯA CÓ TRONG DANH MỤC
function thuocMoiRows_() { const s = sh_('THUOC_MOI'), n = s.getLastRow() - 1; return n > 0 ? s.getRange(2, 1, n, 12).getValues() : []; }
function thuocMoiByTemp_(ma) {
  const m = String(ma).match(/^MOI-(M\d+)$/); if (!m) return null;
  const r = thuocMoiRows_().filter(x => x[0] === m[1])[0];
  return r && r[9] === 'CHO_DUYET' ? { id: r[0], ten: r[3] } : null;
}
function normTen_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

API.thuocMoi = function (u, req) {
  const kho = checkKho_(req.kho);
  if (u.role === 'TAP') return { maTam: 'MOI-TAP', st: 'CHO_DUYET', tap: true };      // chế độ tập: giả lập, không ghi
  const ten = String(req.ten || '').trim(); if (ten.length < 3) throw new Error('Nhập tên thuốc (kèm hàm lượng, quy cách)');
  const maDx = String(req.maDeXuat || '').trim().toUpperCase();
  const dm = dm_();
  if (maDx && dm.map[maDx]) throw new Error('Mã ' + maDx + ' đã có trong danh mục: ' + dm.map[maDx].ten + ' – tìm và chọn thuốc này');
  const dvt = String(req.dvt || '').trim(); if (!dvt) throw new Error('Chọn ĐVT nhỏ nhất');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  let tempMa;
  try {
    const rows = thuocMoiRows_();
    const same = rows.filter(r => r[9] === 'CHO_DUYET' && ((maDx && r[2] === maDx) || normTen_(r[3]) === normTen_(ten)))[0];
    if (same) tempMa = 'MOI-' + same[0];
    else {
      const s = sh_('THUOC_MOI'), id = 'M' + ('000' + s.getLastRow()).slice(-3);
      s.getRange(s.getLastRow() + 1, 1, 1, 12).setValues([[id, now_(), maDx, ten, String(req.dvtn || ''), num_(req.qcGoc) || '', dvt, kho,
        u.ten + ' (' + u.tk + ')', 'CHO_DUYET', '', String(req.ghiChu || '')]]);
      tempMa = 'MOI-' + id;
      log_(u, 'THUOC_MOI', id + ' ' + ten);
    }
  } finally { lock.releaseLock(); }
  const r = API.luu(u, Object.assign({}, req, { ma: tempMa, thaoTac: 'CONG_THEM', dvt: dvt }));
  return Object.assign(r, { maTam: tempMa });
};

// ---------------------------------------------------------------- IT / TỔ TRƯỞNG
API.choDuyet = function (u) {
  needRole_(u, ['TO_TRUONG', 'IT']);
  const dong = readDong_().filter(r => r[C.ST] === 'CHO_DUYET').map(lineObj_);
  const tm = thuocMoiRows_().filter(r => r[9] === 'CHO_DUYET').map(r => ({ id: r[0], tg: fmtTime_(r[1]), maDeXuat: r[2], ten: r[3],
    dvtn: r[4], qc: r[5], dvt: r[6], kho: r[7], nguoi: r[8], ghi: r[11] }));
  return { dong: dong, thuocMoi: tm };
};

API.duyetDong = function (u, req) {
  needRole_(u, ['IT']);
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const s = sh_(DONG_SHEET), rn = rowOfId_(req.id);
    const r = s.getRange(rn, 1, 1, NCOL).getValues()[0];
    if (r[C.ST] !== 'CHO_DUYET') throw new Error('Dòng ' + req.id + ' không ở trạng thái chờ duyệt');
    if (/^MOI-/.test(r[C.MA])) throw new Error('Dòng thuốc mới – duyệt ở mục Thuốc chưa có danh mục');
    if (!req.chapNhan) {
      s.getRange(rn, C.ST + 1).setValue('TU_CHOI'); s.getRange(rn, C.CAP_NHAT + 1).setValue(fmtTime_(now_()) + ' từ chối bởi ' + u.tk);
      log_(u, 'TU_CHOI', req.id); return {};
    }
    const targets = String(r[C.SE_THAY] || '').split(',').filter(Boolean);
    const all = readDong_(), byId = {}; all.forEach(x => byId[x[C.ID]] = x);
    const bad = targets.filter(t => !byId[t] || byId[t][C.ST] !== 'HIEU_LUC');
    if (bad.length) throw new Error('Các dòng ' + bad.join(', ') + ' đã thay đổi sau khi gửi phiếu – từ chối phiếu này và nhập lại');
    s.getRange(rn, C.ST + 1).setValue('HIEU_LUC'); s.getRange(rn, C.CAP_NHAT + 1).setValue(fmtTime_(now_()) + ' duyệt bởi ' + u.tk);
    targets.forEach(t => markReplaced_(s, t, r[C.ID], u));
    log_(u, 'DUYET', req.id);
    return {};
  } finally { lock.releaseLock(); }
};

API.duyetThuocMoi = function (u, req) {
  needRole_(u, ['IT']);
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const st = sh_('THUOC_MOI'), rows = thuocMoiRows_();
    const i = rows.findIndex(r => r[0] === req.id);
    if (i < 0 || rows[i][9] !== 'CHO_DUYET') throw new Error('Không thấy đề xuất ' + req.id + ' đang chờ');
    const temp = 'MOI-' + req.id, s = sh_(DONG_SHEET), all = readDong_();
    if (!req.chapNhan) {
      st.getRange(i + 2, 10).setValue('TU_CHOI');
      all.forEach(r => { if (r[C.MA] === temp && r[C.ST] === 'CHO_DUYET') s.getRange(rowOfId_(r[C.ID]), C.ST + 1).setValue('TU_CHOI'); });
      log_(u, 'TU_CHOI_THUOC_MOI', req.id); return {};
    }
    const ma = String(req.ma || '').trim().toUpperCase(); if (!ma) throw new Error('Nhập mã iSOFH chính thức');
    const dm = dm_(); let dmo = dm.map[ma];
    const r0 = rows[i];
    if (!dmo) {
      const sd = hubSh_('DANH_MUC'), rn = sd.getLastRow() + 1;
      sd.getRange(rn, 1, 1, 8).setValues([[ma, String(req.ten || r0[3]), String(req.dvtn || r0[4]), num_(req.qc != null ? req.qc : r0[5]) || '',
        String(req.dvt || r0[6]), '', '', 'MOI ' + req.id]]);
      dmChanged_(); syncDmAll_();                          // mã mới có ngay trong file các đợt đang mở
      dmo = { ten: String(req.ten || r0[3]) };
    }
    all.forEach(r => { if (r[C.MA] === temp && r[C.ST] === 'CHO_DUYET') {
      const rn = rowOfId_(r[C.ID]);
      s.getRange(rn, C.MA + 1, 1, 2).setValues([[ma, dmo.ten]]);
      s.getRange(rn, C.ST + 1).setValue('HIEU_LUC');
      s.getRange(rn, C.CAP_NHAT + 1).setValue(fmtTime_(now_()) + ' duyệt mã ' + ma + ' bởi ' + u.tk);
    } });
    st.getRange(i + 2, 10, 1, 2).setValues([['DA_DUYET', ma]]);
    log_(u, 'DUYET_THUOC_MOI', req.id + ' → ' + ma);
    return { ma: ma };
  } finally { lock.releaseLock(); }
};

API.gopLo = function (u, req) {
  needRole_(u, ['IT']);
  const kho = checkKho_(req.kho), ma = String(req.ma || ''), giu = loKey_(req.loGiu), bo = loKey_(req.loBo);
  if (!giu || !bo || giu === bo) throw new Error('Chọn 2 lô khác nhau');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const s = sh_(DONG_SHEET), all = readDong_();
    const lot = r => r[C.KHO] === kho && r[C.MA] === ma && r[C.ST] === 'HIEU_LUC';
    const giuRows = all.filter(r => lot(r) && loKey_(r[C.LO]) === giu), boRows = all.filter(r => lot(r) && loKey_(r[C.LO]) === bo);
    if (!giuRows.length || !boRows.length) throw new Error('Không thấy đủ 2 lô đang hiệu lực');
    const loText = giuRows[0][C.LO], hsd = giuRows[0][C.HSD];
    boRows.forEach(r => {
      const id = nextId_(s), row = r.slice();
      row[C.ID] = id; row[C.TG] = now_(); row[C.LO] = loText; row[C.HSD] = hsd; row[C.TT] = 'GOP_LO'; row[C.ST] = 'HIEU_LUC';
      row[C.THAY_BOI] = ''; row[C.GHI] = 'Gộp từ lô ' + r[C.LO] + ' (' + r[C.ID] + ') bởi ' + u.ten; row[C.REQ] = ''; row[C.CAP_NHAT] = ''; row[C.SE_THAY] = '';
      const rn = s.getLastRow() + 1; s.getRange(rn, C.LO + 1).setNumberFormat('@'); s.getRange(rn, 1, 1, NCOL).setValues([row]);
      markReplaced_(s, r[C.ID], id, u);
    });
    log_(u, 'GOP_LO', kho + ' ' + ma + ': ' + req.loBo + ' → ' + req.loGiu);
    return { lines: linesOf_(readDong_(), kho, ma) };
  } finally { lock.releaseLock(); }
};

API.datTrangThaiKho = function (u, req) {
  needRole_(u, ['IT']);
  const kho = checkKho_(req.kho), t = String(req.trangThai);
  if (t !== 'DANG_KIEM' && t !== 'DA_CHOT') throw new Error('Trạng thái không hợp lệ');
  setCfg_('TRANG_THAI_' + kho, t); setCfg_('TRANG_THAI_' + kho + '_LUC', fmtTime_(now_()) + ' ' + u.ten);
  if (t === 'DA_CHOT') syncDm_(ss_());                                        // file đợt có đủ danh mục khi tải về chốt
  log_(u, t === 'DA_CHOT' ? 'CHOT_KHO' : 'MO_KHO', kho);
  return { trangThai: t };
};

function lan1Totals_(kho) {
  const s = ss_().getSheetByName('LAN1'); if (!s) return {};
  const n = s.getLastRow() - 1; if (n < 1) return {};
  const o = {};
  s.getRange(2, 1, n, 7).getValues().forEach(r => { if (r[0] !== kho || !r[1]) return;
    const x = o[r[1]] || (o[r[1]] = { sl: 0, dvt: r[6], lo: {} }); x.sl += Number(r[5]) || 0; x.lo[loKey_(r[3])] = 1; });
  return o;
}

/** Danh sách cần xem cho IT / tổ trưởng */
API.canXem = function (u, req) {
  needRole_(u, ['TO_TRUONG', 'IT']);
  const kho = checkKho_(req.kho), dm = dm_().map, all = readDong_();
  const live = all.filter(r => r[C.KHO] === kho && r[C.ST] === 'HIEU_LUC');
  const byMa = {};
  live.forEach(r => { (byMa[r[C.MA]] = byMa[r[C.MA]] || []).push(r); });
  const items = [];
  Object.keys(byMa).forEach(ma => {
    const rows = byMa[ma], ten = rows[0][C.TEN], lots = {};
    rows.forEach(r => { (lots[loKey_(r[C.LO])] = lots[loKey_(r[C.LO])] || []).push(r); });
    const keys = Object.keys(lots);
    keys.forEach(k => {
      const lr = lots[k], lo = lr[0][C.LO];
      const hsds = lr.map(r => fmtDate_(r[C.HSD])).filter((v, i, a) => v && a.indexOf(v) === i);
      if (hsds.length > 1) items.push({ loai: 'HSD_KHAC', muc: 3, ma: ma, ten: ten, lo: lo, chiTiet: 'Cùng lô nhưng HSD: ' + hsds.join(' / ') });
      const hocs = lr.map(r => hocKey_(r[C.HOC])).filter((v, i, a) => a.indexOf(v) === i);
      if (hocs.length > 1) items.push({ loai: 'NHIEU_HOC', muc: 1, ma: ma, ten: ten, lo: lo,
        chiTiet: lr.map(r => r[C.HOC] + ': ' + r[C.SL] + ' ' + r[C.DVT] + ' (' + r[C.NGUOI] + ')').join(' · ') });
      const nguoi = lr.map(r => r[C.TK]);
      const dupHoc = lr.filter((r, i) => lr.findIndex(x => hocKey_(x[C.HOC]) === hocKey_(r[C.HOC]) && x[C.TK] !== r[C.TK]) >= 0);
      if (dupHoc.length) items.push({ loai: 'CUNG_HOC_KHAC_NGUOI', muc: 2, ma: ma, ten: ten, lo: lo,
        chiTiet: dupHoc.map(r => r[C.HOC] + ': ' + r[C.SL] + ' (' + r[C.NGUOI] + ')').join(' · ') + ' – có thể đếm trùng' });
      if (/MFG|MFD|NSX|EXP|HSD|LOT|BATCH/i.test(lo) || /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(lo) || k.length < 3)
        items.push({ loai: 'LO_NGHI', muc: 2, ma: ma, ten: ten, lo: lo, chiTiet: 'Số lô "' + lo + '" đáng ngờ' });
      lr.forEach(r => { const d = dm[ma];
        if (d && d.qc && Number(r[C.HOP]) > 0 && Number(r[C.QC]) !== Number(d.qc))
          items.push({ loai: 'QC_KHAC', muc: 2, ma: ma, ten: ten, lo: lo, id: r[C.ID],
            chiTiet: r[C.HOC] + ': ' + r[C.HOP] + ' hộp × ' + r[C.QC] + ' (gợi ý ' + d.qc + ') = ' + r[C.SL] + ' ' + r[C.DVT] + ' – ' + r[C.NGUOI] }); });
    });
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++)
      if (gan_(keys[i], keys[j])) items.push({ loai: 'LO_GAN_GIONG', muc: 2, ma: ma, ten: ten, lo: lots[keys[i]][0][C.LO], lo2: lots[keys[j]][0][C.LO],
        chiTiet: 'Hai lô gần giống nhau: ' + lots[keys[i]][0][C.LO] + ' và ' + lots[keys[j]][0][C.LO] + ' – có thể gõ sai' });
    const d = dm[ma];
    if (d && d.kho && d.kho !== kho) items.push({ loai: 'SAI_KHO', muc: 2, ma: ma, ten: ten, chiTiet: 'Danh mục ghi thuộc ' + KHO[d.kho] });
  });
  const l1 = lan1Totals_(kho), lech = [], chuaDem = [], sv = (DOT && DOT.soVoi) || 'Đợt so sánh';
  Object.keys(l1).forEach(ma => {
    const l2 = (byMa[ma] || []).reduce((a, r) => a + (Number(r[C.SL]) || 0), 0);
    if (!byMa[ma]) chuaDem.push({ ma: ma, ten: dm[ma] ? dm[ma].ten : '', lan1: l1[ma].sl, dvt: l1[ma].dvt });
    else if (Math.abs(l2 - l1[ma].sl) > 1e-9) lech.push({ loai: 'LECH_LAN1', muc: 2, ma: ma, ten: byMa[ma][0][C.TEN],
      chiTiet: sv + ': ' + l1[ma].sl + ' ' + l1[ma].dvt + ' → đợt này: ' + l2 + ' ' + byMa[ma][0][C.DVT] });
  });
  Object.keys(byMa).forEach(ma => { if (!l1[ma] && Object.keys(l1).length) lech.push({ loai: 'MOI_SO_LAN1', muc: 1, ma: ma, ten: byMa[ma][0][C.TEN],
    chiTiet: sv + ' không có, đợt này: ' + byMa[ma].reduce((a, r) => a + (Number(r[C.SL]) || 0), 0) + ' ' + byMa[ma][0][C.DVT] }); });
  items.sort((a, b) => b.muc - a.muc || String(a.ma).localeCompare(String(b.ma)));
  return { items: items, lech: lech, chuaDem: chuaDem, choDuyet: all.filter(r => r[C.ST] === 'CHO_DUYET' && r[C.KHO] === kho).length };
};
function gan_(a, b) {                                                   // 2 số lô chỉ khác ≤1 ký tự, hoặc lô này là đầu của lô kia
  if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return Math.min(a.length, b.length) >= 4;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}


// ---------------------------------------------------------------- HỘC: nhận / xong / mở lại / danh sách
const HOC_HEADER = ['Kho', 'Hộc', 'Trạng thái', 'Người đếm', 'Bắt đầu', 'Xong lúc', 'Người báo xong', 'Ghi chú'];
const HOC_ST = { CHUA_NHAN: 'Chưa ai nhận', DANG_DEM: 'Đang đếm', XONG: 'Đã xong' };
function hocSheet_() {
  let s = ss_().getSheetByName(HOC_SHEET);
  if (!s) { s = ss_().insertSheet(HOC_SHEET); s.getRange(1, 1, 1, HOC_HEADER.length).setValues([HOC_HEADER]); }
  return s;
}
function hocRows_(s) { const n = s.getLastRow() - 1; return n > 0 ? s.getRange(2, 1, n, 8).getValues() : []; }
function hocFind_(rows, kho, hoc) { return rows.findIndex(r => String(r[0]).toUpperCase() === kho && hocKey_(r[1]) === hoc); }
function hocObj_(r) { return { kho: r[0], hoc: hocKey_(r[1]), st: r[2] || 'CHUA_NHAN', stTen: HOC_ST[r[2] || 'CHUA_NHAN'], nguoi: r[3], batDau: fmtTime_(r[4]),
                               xongLuc: fmtTime_(r[5]), nguoiXong: r[6], ghi: r[7] }; }

API.nhanHoc = function (u, req) {
  const kho = checkKho_(req.kho), hoc = hocKey_(req.hoc); if (!hoc) throw new Error('Chưa nhập hộc');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const s = hocSheet_(), rows = hocRows_(s), i = hocFind_(rows, kho, hoc);
    if (i < 0) { s.getRange(s.getLastRow() + 1, 1, 1, 8).setValues([[kho, hoc, 'DANG_DEM', u.ten, now_(), '', '', '']]); return { hoc: hocObj_([kho, hoc, 'DANG_DEM', u.ten, now_()]) }; }
    const r = rows[i];
    if (r[2] === 'XONG' && !req.moLai) return { hoc: hocObj_(r), daXong: true };
    const names = String(r[3] || '').split(/\s*,\s*/).filter(Boolean);
    if (names.indexOf(u.ten) < 0) names.push(u.ten);
    s.getRange(i + 2, 3, 1, 3).setValues([['DANG_DEM', names.join(', '), r[4] || now_()]]);
    if (r[2] === 'XONG') { s.getRange(i + 2, 6, 1, 3).setValues([['', '', 'Mở lại bởi ' + u.ten + ' ' + fmtTime_(now_())]]); log_(u, 'MO_LAI_HOC', kho + ' ' + hoc); }
    return { hoc: hocObj_(s.getRange(i + 2, 1, 1, 8).getValues()[0]) };
  } finally { lock.releaseLock(); }
};

API.xongHoc = function (u, req) {
  const kho = checkKho_(req.kho), hoc = hocKey_(req.hoc); if (!hoc) throw new Error('Chưa nhập hộc');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const s = hocSheet_(), rows = hocRows_(s); let i = hocFind_(rows, kho, hoc);
    if (i < 0) { s.getRange(s.getLastRow() + 1, 1, 1, 8).setValues([[kho, hoc, 'DANG_DEM', u.ten, now_(), '', '', '']]); i = rows.length; }
    s.getRange(i + 2, 3).setValue('XONG'); s.getRange(i + 2, 6, 1, 2).setValues([[now_(), u.ten]]);
    log_(u, 'XONG_HOC', kho + ' ' + hoc);
    const soDong = readDong_().filter(r => r[C.KHO] === kho && r[C.ST] === 'HIEU_LUC' && hocKey_(r[C.HOC]) === hoc).length;
    return { hoc: hocObj_(s.getRange(i + 2, 1, 1, 8).getValues()[0]), soDong: soDong };
  } finally { lock.releaseLock(); }
};

API.dsHoc = function (u, req) {
  const kho = checkKho_(req.kho), map = {};
  hocRows_(hocSheet_()).forEach(r => { if (String(r[0]).toUpperCase() === kho && r[1]) map[hocKey_(r[1])] = Object.assign(hocObj_(r), { soDong: 0, soMa: 0, nguoiDem: [] }); });
  const ma = {};
  readDong_().forEach(r => {
    if (r[C.KHO] !== kho || r[C.ST] !== 'HIEU_LUC') return;
    const h = hocKey_(r[C.HOC]);
    const x = map[h] || (map[h] = { kho: kho, hoc: h, st: 'DANG_DEM', stTen: HOC_ST.DANG_DEM, nguoi: '', soDong: 0, soMa: 0, nguoiDem: [] });
    x.soDong++; (ma[h] = ma[h] || {})[r[C.MA]] = 1;
    if (x.nguoiDem.indexOf(r[C.NGUOI]) < 0) x.nguoiDem.push(r[C.NGUOI]);
  });
  const list = Object.keys(map).map(h => Object.assign(map[h], { soMa: Object.keys(ma[h] || {}).length }));
  const order = { CHUA_NHAN: 0, DANG_DEM: 1, XONG: 2 };
  list.sort((a, b) => order[a.st] - order[b.st] || a.hoc.localeCompare(b.hoc, 'vi', { numeric: true }));
  const dem = k => list.filter(x => x.st === k).length;
  return { list: list, xong: dem('XONG'), dang: dem('DANG_DEM'), chua: dem('CHUA_NHAN') };
};

API.dsTaiKhoan = function (u) {
  needRole_(u, ['IT']);
  return { list: users_().map(x => ({ tk: x.tk, ten: x.ten, pin: x.pin, role: x.role, roleTen: ROLE[x.role], active: x.active })) };
};

/** Chạy tay trong trình soạn thảo khi muốn xoá dữ liệu tập (mọi đợt) */
function xoaDuLieuTap() {
  dots_().forEach(d => {
    try {
      const ss = openDotSS_(d);
      ['TAP', 'TAP_HOC'].forEach(n => { const s = ss.getSheetByName(n); if (s && s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).clearContent(); });
    } catch (e) { Logger.log(d.id + ': ' + e); }
  });
  Logger.log('Đã xoá dữ liệu tập');
}

/** Chạy tay khi IT tự sửa/thêm mã trong DANH_MUC của file Trung tâm → chép sang các đợt đang mở */
function dongBoDanhMuc() {
  CacheService.getScriptCache().removeAll(['dm_v', 'dm_body', 'dots']);
  syncDmAll_();
  Logger.log('Đã đồng bộ danh mục sang ' + dots_().filter(d => d.st === 'MO').length + ' đợt đang mở');
}

// ====================================================================== TẠO ĐỢT
function mkSheet_(ss, name, header, widths) {
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  if (header && s.getLastRow() === 0) {
    s.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#1F4E78').setFontColor('#FFFFFF');
    s.setFrozenRows(1);
    (widths || []).forEach((w, i) => w && s.setColumnWidth(i + 1, w));
  }
  return s;
}
function orderSheets_(ss, names) {
  names.forEach((n, i) => { const s = ss.getSheetByName(n); if (s) { ss.setActiveSheet(s); ss.moveActiveSheet(i + 1); } });
  ss.getSheets().forEach(s => { if (names.indexOf(s.getName()) < 0 && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s); });   // xoá "Sheet1"/"Trang tính1"
}
function moveNextToHub_(ss) {
  try {
    const parents = DriveApp.getFileById(hub_().getId()).getParents();
    if (parents.hasNext()) DriveApp.getFileById(ss.getId()).moveTo(parents.next());
  } catch (e) { Logger.log('Không chuyển được file đợt vào thư mục Trung tâm: ' + e); }
}

/** Số liệu lần 1 từ 2 file kiểm kho cũ (sheet GOP) → dòng LAN1 */
function lan1Cu_() {
  const rows = [];
  [['CHAN', FILE_CHAN_LAN1], ['LE', FILE_LE_LAN1]].forEach(k => {
    try {
      const g = SpreadsheetApp.openById(k[1]).getSheetByName('GOP'); if (!g) return;
      const n = g.getLastRow() - 1; if (n < 1) return;
      g.getRange(2, 1, n, 15).getValues().forEach(r => {
        if (!r[14] || r[9] === '' || r[9] === null) return;
        const hsd = typeof r[4] === 'number' ? new Date(1899, 11, 30 + r[4]) : r[4];      // GOP lưu HSD dạng số seri
        rows.push([k[0], r[14], String(r[1]).split(' | ').slice(1).join(' | '), String(r[3]), hsd, r[9], r[10], r[0], r[12]]);
      });
    } catch (e) { Logger.log('Không đọc được lần 1 ' + k[0] + ': ' + e); }
  });
  return rows;
}
/** Số liệu của 1 đợt trước (các dòng HIEU_LUC) → dòng LAN1 để so sánh */
function lan1TuDot_(src) {
  const s = src.getSheetByName('DONG'), n = s ? s.getLastRow() - 1 : 0;
  return (n > 0 ? s.getRange(2, 1, n, NCOL).getValues() : []).filter(r => r[C.ST] === 'HIEU_LUC')
    .map(r => [r[C.KHO], r[C.MA], r[C.TEN], String(r[C.LO]), r[C.HSD], r[C.SL], r[C.DVT], r[C.HOC], r[C.NGUOI]]);
}

/** Tạo các sheet của 1 đợt trong file ss (chạy lại không sao) */
function setupDot_(ss, o) {
  // CẤU HÌNH ĐỢT
  const cf = cfgIn_(ss);
  [['DOT', o.ten], ['DOT_ID', o.id], ['KHO', o.kho.join(',')], ['SO_VOI', o.soVoi || '(không so sánh)'], ['TRANG_THAI_CHAN', 'DANG_KIEM'], ['TRANG_THAI_LE', 'DANG_KIEM'],
   ['GHI_CHU', 'DANG_KIEM = đang đếm · DA_CHOT = khoá, chỉ nhận phiếu bổ sung chờ IT duyệt']].forEach(kv => { if (!(kv[0] in cf)) setCfgIn_(ss, kv[0], kv[1]); });
  // DANH MỤC (bản sao từ Trung tâm – để TONG_HOP và bước chốt đọc được)
  mkSheet_(ss, 'DANH_MUC', ['Mã', 'Tên thuốc', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho mặc định (CHAN/LE)', 'Mã vạch GTIN (tự học khi quét)', 'Nguồn'],
           [90, 340, 80, 70, 90, 120, 200, 90]);
  syncDm_(ss);
  // DÒNG ĐẾM
  const d = mkSheet_(ss, 'DONG', DONG_HEADER, [70, 120, 55, 80, 260, 110, 90, 70, 60, 70, 60, 80, 60, 110, 60, 110, 90, 70, 220, 220, 120, 140, 120]);
  d.getRange(2, C.LO + 1, d.getMaxRows() - 1, 1).setNumberFormat('@');
  d.getRange(2, C.HSD + 1, d.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
  d.getRange(2, C.TG + 1, d.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  if (!d.getProtections(SpreadsheetApp.ProtectionType.SHEET).length)
    d.protect().setDescription('Dữ liệu đếm – chỉ ghi qua web app. Muốn sửa: dùng Hoàn tác / công cụ IT').setWarningOnly(true);
  const stCol = d.getRange(2, C.ST + 1, d.getMaxRows() - 1, 1);
  d.setConditionalFormatRules([['HIEU_LUC', '#E2EFDA'], ['THAY_THE', '#EDEDED'], ['HUY', '#F8CBAD'], ['CHO_DUYET', '#FFF2CC'], ['TU_CHOI', '#F8CBAD']]
    .map(x => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(x[0]).setBackground(x[1]).setRanges([stCol]).build()));
  // THUỐC MỚI
  mkSheet_(ss, 'THUOC_MOI', ['ID', 'Thời điểm', 'Mã đề xuất', 'Tên', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho', 'Người đề xuất', 'Trạng thái', 'Mã chính thức', 'Ghi chú'],
           [60, 120, 90, 300, 70, 70, 90, 55, 160, 100, 100, 220]);
  // SỐ LIỆU ĐỂ SO SÁNH (người đếm KHÔNG thấy)
  mkSheet_(ss, 'LAN1', ['Kho', 'Mã', 'Tên', 'Số lô', 'HSD', 'SL', 'ĐVT', 'Hộc', 'Người đếm'], [55, 80, 260, 110, 90, 70, 60, 70, 110]);
  // HỘC + DỮ LIỆU TẬP + NHẬT KÝ
  const hs = mkSheet_(ss, 'HOC', HOC_HEADER, [55, 110, 100, 200, 120, 120, 120, 220]);
  hs.getRange(2, 3, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['CHUA_NHAN', 'DANG_DEM', 'XONG'], true).build());
  const tp = mkSheet_(ss, 'TAP', DONG_HEADER);
  tp.getRange(2, C.LO + 1, tp.getMaxRows() - 1, 1).setNumberFormat('@');
  tp.getRange(2, C.HSD + 1, tp.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
  mkSheet_(ss, 'TAP_HOC', HOC_HEADER);
  mkSheet_(ss, 'NHAT_KY', ['Thời điểm', 'Tài khoản', 'Tên', 'Hành động', 'Chi tiết'], [130, 70, 140, 140, 500]);
  // TỔNG HỢP theo mã (công thức)
  const th = mkSheet_(ss, 'TONG_HOP');
  if (th.getLastRow() === 0) {
    th.getRange(1, 1, 1, 12).setValues([['Mã', 'Tên', 'ĐVT', 'Kho mặc định', 'CHẴN đợt này', 'CHẴN so sánh', 'Lệch CHẴN', 'LẺ đợt này', 'LẺ so sánh', 'Lệch LẺ',
      'Tổng đợt này', 'Trạng thái']]).setFontWeight('bold').setBackground('#1F4E78').setFontColor('#FFFFFF');
    th.setFrozenRows(1);
    const f = (kho, src) => src === 'L2'
      ? '=ARRAYFORMULA(IF(A2:A="","",SUMIF(DONG!C2:C&"|"&DONG!D2:D&"|"&DONG!Q2:Q,"' + kho + '|"&A2:A&"|HIEU_LUC",DONG!L2:L)))'
      : '=ARRAYFORMULA(IF(A2:A="","",SUMIF(LAN1!A2:A&"|"&LAN1!B2:B,"' + kho + '|"&A2:A,LAN1!F2:F)))';
    th.getRange(2, 1, 1, 12).setFormulas([['=ARRAYFORMULA(DANH_MUC!A2:A)', '=ARRAYFORMULA(DANH_MUC!B2:B)', '=ARRAYFORMULA(DANH_MUC!E2:E)',
      '=ARRAYFORMULA(DANH_MUC!F2:F)', f('CHAN', 'L2'), f('CHAN', 'L1'), '=ARRAYFORMULA(IF(A2:A="","",E2:E-F2:F))',
      f('LE', 'L2'), f('LE', 'L1'), '=ARRAYFORMULA(IF(A2:A="","",H2:H-I2:I))', '=ARRAYFORMULA(IF(A2:A="","",E2:E+H2:H))',
      '=ARRAYFORMULA(IF(A2:A="","",IF(K2:K>0,"Đã đếm",IF((F2:F+I2:I)>0,"CHƯA ĐẾM (đợt so sánh có)","Chưa thấy"))))']]);
    th.setColumnWidth(2, 320);
    const lech = th.getRange('A2:L');
    th.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A2<>"",OR($G2<>0,$J2<>0),$K2>0)').setBackground('#FCE4D6').setRanges([lech]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$L2="CHƯA ĐẾM (đợt so sánh có)"').setBackground('#FFF2CC').setRanges([lech]).build()]);
  }
  const tl = mkSheet_(ss, 'TONG_HOP_LO');
  if (tl.getLastRow() === 0) {
    tl.getRange('A1').setFormula('=QUERY(DONG!A:W,"select C, D, E, F, G, sum(L), M, count(A) where Q = \'HIEU_LUC\' group by C, D, E, F, G, M ' +
      'order by C, D label C \'Kho\', D \'Mã\', E \'Tên\', F \'Số lô\', G \'HSD\', sum(L) \'SL\', M \'ĐVT\', count(A) \'Số dòng\'",1)');
    tl.setFrozenRows(1); tl.setColumnWidth(3, 300);
  }
}

/** Tạo đợt: file mới (hoặc ssIn), sheet đầy đủ, số liệu so sánh, danh sách hộc, ghi vào sheet DOT */
function taoDot_(ten, kho, soVoi, copyHoc, nguoi, ssIn) {
  const all = dots_();
  let n = all.length + 1, id;
  do { id = 'DOT' + ('0' + n).slice(-2); n++; } while (all.some(d => d.id === id));
  let src = null, soVoiTen = '';
  if (soVoi === 'LAN1_CU') soVoiTen = 'Lần 1 (file cũ)';
  else if (soVoi) { const sd = all.filter(d => d.id === soVoi)[0]; if (!sd) throw new Error('Không thấy đợt so sánh ' + soVoi); src = openDotSS_(sd); soVoiTen = sd.ten; }
  const ss = ssIn || SpreadsheetApp.create('KIỂM KHO – ' + ten);
  if (!ssIn) moveNextToHub_(ss);
  setupDot_(ss, { id: id, ten: ten, kho: kho, soVoi: soVoiTen });
  const l1 = ss.getSheetByName('LAN1');
  if (l1.getLastRow() <= 1 && soVoi) {
    const rows = (soVoi === 'LAN1_CU' ? lan1Cu_() : lan1TuDot_(src)).filter(r => kho.indexOf(r[0]) >= 0);
    if (rows.length) { l1.getRange(2, 4, rows.length, 1).setNumberFormat('@'); l1.getRange(2, 1, rows.length, 9).setValues(rows); }
  }
  if (copyHoc && src) {                                                  // dùng lại danh sách hộc của đợt trước (trạng thái: chưa ai nhận)
    const hs = ss.getSheetByName('HOC'), sh = src.getSheetByName('HOC'), m = sh ? sh.getLastRow() - 1 : 0;
    if (hs.getLastRow() <= 1 && m > 0) {
      const seen = {}, rows = [];
      sh.getRange(2, 1, m, 2).getValues().forEach(r => { const k = String(r[0]).toUpperCase(), h = hocKey_(r[1]);
        if (h && kho.indexOf(k) >= 0 && !seen[k + '|' + h]) { seen[k + '|' + h] = 1; rows.push([k, h, 'CHUA_NHAN', '', '', '', '', '']); } });
      if (rows.length) hs.getRange(2, 1, rows.length, 8).setValues(rows);
    }
  }
  orderSheets_(ss, ssIn ? ['DOT', 'NGUOI_DEM'].concat(DOT_SHEETS) : DOT_SHEETS);
  const reg = hubSh_('DOT');
  reg.getRange(reg.getLastRow() + 1, 1, 1, 10).setValues([[id, ten, 'MO', kho.join(','), now_(), nguoi || '', soVoiTen, ss.getId(), ss.getUrl(), '']]);
  dotsChanged_();
  return dots_().filter(d => d.id === id)[0];
}

// ====================================================================== CÀI ĐẶT (chạy 1 lần trong trình soạn thảo)
function caiDat() {
  const hub = hub_();
  if (!/TRUNG T[AÂ]M/i.test(hub.getName())) hub.rename('KIỂM KHO – TRUNG TÂM (iSOFH)');
  // DANH SÁCH ĐỢT
  const reg = mkSheet_(hub, 'DOT', DOT_HEADER, [70, 220, 120, 90, 100, 120, 180, 120, 260, 260]);
  reg.getRange(2, 3, 200, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['MO', 'DONG'], true).build());
  // CẤU HÌNH CHUNG
  const cf = cfgIn_(hub);
  if (!('LO_MAC_DINH' in cf)) setCfgIn_(hub, 'LO_MAC_DINH', LO_MAC_DINH);
  if (!('HSD_MAC_DINH' in cf)) setCfgIn_(hub, 'HSD_MAC_DINH', "'" + HSD_MAC_DINH);
  if (!('GHI_CHU' in cf)) setCfgIn_(hub, 'GHI_CHU', 'LO_MAC_DINH / HSD_MAC_DINH: ghi cho hàng không có lô/HSD (đổi cho đúng giá trị iSOFH nhận)');
  // NGƯỜI ĐẾM + PIN (dùng chung cho mọi đợt)
  const nd = mkSheet_(hub, 'NGUOI_DEM', ['Tài khoản', 'Tên hiển thị (anh tự sửa)', 'PIN', 'Vai trò', 'Hoạt động', 'Ghi chú'], [90, 220, 90, 110, 90, 260]);
  const used = {}, pin = () => { let p; do { p = String(100000 + Math.floor(Math.random() * 900000)); } while (used[p]); used[p] = 1; return p; };
  if (nd.getLastRow() === 1) {
    const rows = [['TK01', 'Thọ (IT)', pin(), 'IT', true, 'Toàn quyền: tạo/đóng đợt, duyệt, chốt kho, gộp lô']];
    rows.push(['TK02', 'Tổ trưởng 1', pin(), 'TO_TRUONG', true, 'Được Dồn cả lô, đếm lại hộc của người khác, xem Cần xem']);
    rows.push(['TK03', 'Tổ trưởng 2', pin(), 'TO_TRUONG', true, '']);
    for (let i = 4; i <= 15; i++) rows.push(['TK' + ('0' + i).slice(-2), 'Người đếm ' + ('0' + (i - 3)).slice(-2), pin(), 'DEM', true, '']);
    nd.getRange(2, 3, rows.length, 1).setNumberFormat('@');
    nd.getRange(2, 1, rows.length, 6).setValues(rows);
    nd.getRange(2, 4, 50, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['DEM', 'TO_TRUONG', 'IT', 'TAP'], true).build());
    nd.getRange(2, 5, rows.length, 1).insertCheckboxes();
  }
  {
    const nrow = nd.getLastRow(), cur = nrow > 1 ? nd.getRange(2, 1, nrow - 1, 4).getValues() : [];
    if (!cur.some(r => r[3] === 'TAP')) {
      cur.forEach(r => used[String(r[2])] = 1);
      const start = cur.length + 1, rows = [];
      for (let i = 0; i < 3; i++) rows.push(['TK' + ('0' + (start + i)).slice(-2), 'Tập ' + (i + 1), pin(), 'TAP', true, 'Chế độ tập: ghi vào sheet TAP của đợt, không tính vào kết quả']);
      nd.getRange(nrow + 1, 3, rows.length, 1).setNumberFormat('@');
      nd.getRange(nrow + 1, 1, rows.length, 6).setValues(rows);
      nd.getRange(nrow + 1, 5, rows.length, 1).insertCheckboxes();
    }
  }
  // DANH MỤC GỐC (mã vạch học được ghi ở đây, dùng cho mọi đợt)
  const dmS = mkSheet_(hub, 'DANH_MUC', ['Mã', 'Tên thuốc', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho mặc định (CHAN/LE)', 'Mã vạch GTIN (tự học khi quét)', 'Nguồn'],
                       [90, 340, 80, 70, 90, 120, 200, 90]);
  if (dmS.getLastRow() === 1) {
    const src = SpreadsheetApp.openById(FILE_CHAN_LAN1).getSheetByName('DANH_MUC');
    const v = src.getRange(2, 1, src.getLastRow() - 1, 5).getValues().filter(r => r[0]);
    const rows = v.map(r => [String(r[0]).trim(), r[1], r[2], r[3], r[4], MA_THUOC_KHO_LE.indexOf(String(r[0]).trim()) >= 0 ? 'LE' : '', '', 'GOC']);
    dmS.getRange(2, 7, rows.length, 1).setNumberFormat('@');
    dmS.getRange(2, 1, rows.length, 8).setValues(rows);
    dmS.getRange(2, 6, 2000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['CHAN', 'LE'], true).setAllowInvalid(false).build());
  }
  mkSheet_(hub, 'NHAT_KY', ['Thời điểm', 'Tài khoản', 'Tên', 'Hành động', 'Chi tiết'], [130, 70, 140, 140, 500]);
  CacheService.getScriptCache().removeAll(['users', 'dm_v', 'dm_body', 'dots']);
  // ĐỢT ĐẦU TIÊN: "Kiểm kho lần 2", so sánh với số liệu lần 1 ở 2 file cũ
  let msg = '';
  if (!dots_().length) {
    const legacy = !!hub.getSheetByName('DONG');                         // đã từng cài bản 1 file → dùng luôn file này làm đợt đầu
    const d = taoDot_('Kiểm kho lần 2', ['CHAN', 'LE'], 'LAN1_CU', false, 'caiDat', legacy ? hub : null);
    msg = ' · Đã tạo đợt ' + d.id + ' "' + d.ten + '": ' + d.url;
  }
  orderSheets_(hub, ['DOT', 'NGUOI_DEM', 'DANH_MUC', 'CAU_HINH', 'NHAT_KY'].concat(hub.getSheetByName('DONG') ? DOT_SHEETS : []));
  Logger.log('XONG. File Trung tâm: ' + hub.getUrl() + ' · Danh mục: ' + (dmS.getLastRow() - 1) + ' mã · Tài khoản: ' + (nd.getLastRow() - 1) + msg +
             '. Mở sheet NGUOI_DEM để xem PIN, sheet DOT để xem link file từng đợt.');
}
