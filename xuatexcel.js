/* Xuất Excel của đợt: cùng sheet và cột với file đợt Google Sheets cũ (legacy/Code.gs, setupDot_).
 * taoSoExcel(data) là hàm thuần (Node test được, không cần SheetJS); xuatExcel(dotId) gọi máy chủ rồi ghi file bằng SheetJS.
 * Dùng các hàm chung đã có: api (app.js), qtTaiSheetJS (quantri.js). */
'use strict';

// Sheet order follows the legacy DOT_SHEETS list (TONG_HOP first), restricted to the sheets the export carries
const DONG_HEADER = ['ID', 'Thời điểm', 'Kho', 'Mã', 'Tên thuốc', 'Số lô', 'HSD', 'Hộc', 'Số hộp', '1 hộp có mấy', 'Số lẻ',
  'SL (ĐVT nhỏ nhất)', 'ĐVT', 'Người đếm', 'Tài khoản', 'Thao tác', 'Trạng thái', 'Bị thay bởi', 'Lý do / Ghi chú',
  'Cảnh báo', 'Mã yêu cầu', 'Cập nhật', 'Sẽ thay (chờ duyệt)'];
const HOC_HEADER = ['Kho', 'Hộc', 'Trạng thái', 'Người đếm', 'Bắt đầu', 'Xong lúc', 'Người báo xong', 'Ghi chú'];
const THUOC_MOI_HEADER = ['ID', 'Thời điểm', 'Mã đề xuất', 'Tên', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho', 'Người đề xuất', 'Trạng thái', 'Mã chính thức', 'Ghi chú'];
const LAN1_HEADER = ['Kho', 'Mã', 'Tên', 'Số lô', 'HSD', 'SL', 'ĐVT', 'Hộc', 'Người đếm'];
const DANH_MUC_HEADER = ['Mã', 'Tên thuốc', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho mặc định (CHAN/LE)', 'Mã vạch GTIN (tự học khi quét)', 'Nguồn'];
const TONG_HOP_LO_HEADER = ['Kho', 'Mã', 'Tên', 'Số lô', 'HSD', 'SL', 'ĐVT', 'Số dòng'];

// 0-based columns that hold an HSD date (written as a serial number) and a lot code (always text)
const XL_COT_NGAY = { DONG: [6], LAN1: [4], TONG_HOP_LO: [4] };
const XL_COT_LO = { DONG: [5], LAN1: [3], TONG_HOP_LO: [3] };

/** 'DD/MM/YYYY' -> Excel serial (days since 1899-12-30) by pure UTC arithmetic, so no time zone can shift it. Other text is returned unchanged. */
function xlNgay(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s == null ? '' : s).trim());
  return m ? (Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 864e5 : s;
}
const xlSo = x => Math.round(x * 1e6) / 1e6;                       // drop float noise from summing decimals
const xlCong = (map, k, v) => map.set(k, (map.get(k) || 0) + (Number(v) || 0));

/** Filename of the export: characters not allowed in file names become '-'. */
const tenFileExcel = ten => ('KIEM-KHO-' + String(ten == null ? '' : ten).trim()).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-') + '.xlsx';

/** data = response of API xuatDot. Returns {sheetName: rows[][]} with the header as the first row of each sheet. */
globalThis.taoSoExcel = function (data) {
  const khos = data.khos || [], live = (data.dong || []).filter(x => x.st === 'HIEU_LUC');
  const dong = (data.dong || []).map(x => [x.id, x.tg, x.kho, x.ma, x.ten, String(x.lo), xlNgay(x.hsd), String(x.hoc), x.hop, x.qc, x.le, x.sl, x.dvt,
    x.nguoi, x.tk, x.tt, x.st, x.thayBoi, x.ghi, x.cb, x.req, x.capNhat, x.seThay]);
  const hoc = (data.hoc || []).map(h => [h.kho, String(h.hoc), h.st, h.nguoi, h.batDau, h.xongLuc, h.nguoiXong, h.ghi]);
  const thuocMoi = (data.thuocMoi || []).map(t => [t.id, t.tg, t.maDeXuat, t.ten, t.dvtn, t.qc, t.dvt, t.kho, t.nguoi, t.st, t.maChinhThuc, t.ghi]);
  const lan1 = (data.soSanh || []).map(r => r.map((c, i) => i === 3 ? String(c) : i === 4 ? xlNgay(c) : c));

  // TONG_HOP: one row per danh mục drug; per kho: this đợt (sum of HIEU_LUC SL), comparison (sum of LAN1 SL), difference
  const demMap = new Map(), ssMap = new Map();
  live.forEach(x => xlCong(demMap, x.kho + '|' + x.ma, x.sl));
  (data.soSanh || []).forEach(r => xlCong(ssMap, r[0] + '|' + r[1], r[5]));
  const tongHop = [['Mã', 'Tên', 'ĐVT', 'Kho mặc định'].concat(...khos.map(k => [k.tenNgan + ' đợt này', k.tenNgan + ' so sánh', 'Lệch ' + k.tenNgan]), 'Tổng đợt này', 'Trạng thái')];
  (data.danhMuc || []).forEach(d => {
    let tong = 0, ss = 0;
    const row = [d[0], d[1], d[4], d[5]];
    khos.forEach(k => {
      const a = xlSo(demMap.get(k.ma + '|' + d[0]) || 0), b = xlSo(ssMap.get(k.ma + '|' + d[0]) || 0);
      row.push(a, b, xlSo(a - b)); tong += a; ss += b;
    });
    tong = xlSo(tong);
    row.push(tong, tong > 0 ? 'Đã đếm' : ss > 0 ? 'CHƯA ĐẾM (đợt so sánh có)' : 'Chưa thấy');
    tongHop.push(row);
  });

  // TONG_HOP_LO: HIEU_LUC lines grouped by kho, mã, tên, lô, HSD, ĐVT; ordered by kho then mã
  const nhom = new Map();
  live.forEach(x => {
    const k = [x.kho, x.ma, x.ten, String(x.lo), x.hsd, x.dvt].join('\u0001'), g = nhom.get(k);
    if (g) { g[5] += Number(x.sl) || 0; g[7]++; } else nhom.set(k, [x.kho, x.ma, x.ten, String(x.lo), xlNgay(x.hsd), Number(x.sl) || 0, x.dvt, 1]);
  });
  const lo = [...nhom.values()].map(g => (g[5] = xlSo(g[5]), g)).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);

  return {
    TONG_HOP: tongHop, TONG_HOP_LO: [TONG_HOP_LO_HEADER].concat(lo), DONG: [DONG_HEADER].concat(dong), HOC: [HOC_HEADER].concat(hoc),
    THUOC_MOI: [THUOC_MOI_HEADER].concat(thuocMoi), LAN1: [LAN1_HEADER].concat(lan1), DANH_MUC: [DANH_MUC_HEADER].concat(data.danhMuc || [])
  };
};

/** Build a SheetJS workbook from taoSoExcel output: HSD cells get the dd/mm/yyyy format, lot cells are forced to text. */
globalThis.xlSach = function (sheets) {
  const wb = XLSX.utils.book_new();
  Object.keys(sheets).forEach(name => {
    const ws = XLSX.utils.aoa_to_sheet(sheets[name]);
    for (let r = 1; r < sheets[name].length; r++) {
      (XL_COT_NGAY[name] || []).forEach(c => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = 'dd/mm/yyyy'; });
      (XL_COT_LO[name] || []).forEach(c => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell) { cell.t = 's'; cell.v = String(cell.v); delete cell.z; } });
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  return wb;
};

/** Ask the server for the whole đợt and save it as KIEM-KHO-<tên đợt>.xlsx. Throws Error with a Vietnamese message. */
async function xuatExcel(dotId) {
  const r = await api('xuatDot', { dot: dotId }, 60000);
  if (!r.ok) throw new Error(r.error);
  await qtTaiSheetJS();
  XLSX.writeFile(xlSach(taoSoExcel(r)), tenFileExcel(r.dot.ten));
}
