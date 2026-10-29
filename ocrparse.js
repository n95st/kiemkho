/* Tìm Số lô + HSD trong chữ OCR của vỏ hộp. Dùng chung cho form (nhúng nguyên khối). */
const OCR_LOT = /^(batch\s*(no|number|n°|nr)?|lot\s*(no|number|n°|nr)?|b\.?\s*no|bn|so\s*lo(\s*sx)?|lo\s*sx|s\.?\s*lo|ch\.?\s*-?\s*b|charge|lote|partia)\b\.?/;
const OCR_EXP = /^(exp(iry|iration)?\.?\s*(date)?|best\s*before(\s*end)?|bbe?|use\s*by|use\s*before|han\s*dung|han\s*su\s*dung|hsd|hd|verw\.?\s*bis|verwendbar\s*bis|cad\.?|scad\.?|val\.?)\b\.?/;
const OCR_MFG = /^(mfg|mfd|mf|manuf\.?[\s\-]*(date)?|manufactured|manufacturing\s*date|prod(uction)?\.?\s*(date)?|nsx|ngay\s*sx|ngay\s*san\s*xuat|herg\.?|hergestellt|date\s*of\s*manuf)/;
const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };

function ocrNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }

/* "1 0 . 0 7 . 2 0 2 6" -> "10.07.2026"; trả về {date, partial} */
function ocrDate(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/\s+/g, '').replace(/[oO]/g, '0').replace(/[lI|]/g, '1');
  let m;
  if ((m = s.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4}|\d{2})(?!\d)/))) {
    let y = +m[3]; if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (d.getMonth() === +m[2] - 1 && y >= 2015 && y <= 2050) return { date: d };
  }
  if ((m = s.match(/(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})/))) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getMonth() === +m[2] - 1 && +m[1] >= 2015 && +m[1] <= 2050) return { date: d };
  }
  if ((m = s.match(/(\d{4})[.\/\-](\d{1,2})(?![.\/\-\d])/)) && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 2015) return { date: new Date(+m[1], +m[2], 0) };
  if ((m = s.match(/(?<![\d.\/\-])(\d{1,2})[.\/\-](\d{4}|\d{2})(?![.\/\-\d])/)) && +m[1] >= 1 && +m[1] <= 12) {
    let y = +m[2]; if (y < 100) y += 2000;
    if (y >= 2015 && y <= 2050) return { date: new Date(y, +m[1], 0) };
  }
  const t = ocrNorm(raw).replace(/\s+/g, ' ');
  if ((m = t.match(/(\d{1,2})?\s*[\-\/.]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*[\-\/.]?\s*(\d{4}|\d{2})/))) {
    let y = +m[3]; if (y < 100) y += 2000; const mo = MON[m[2]];
    return { date: m[1] ? new Date(y, mo - 1, +m[1]) : new Date(y, mo, 0) };
  }
  if (/\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d?$/.test(s) || /\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{1,3}$/.test(s)) return { partial: true };
  return null;
}
function ocrLot(raw) {
  let s = String(raw || '').replace(/^[\s:.\-#]+/, '').split(/\s{3,}|\t/)[0];
  s = s.replace(/\s+/g, '').replace(/[.,;:]+$/, '').toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-\/.]{1,24}$/.test(s) || !/\d/.test(s)) return '';
  return s;
}
function lineKind(n) {
  if (OCR_MFG.test(n)) return 'mfg';
  if (OCR_EXP.test(n)) return 'exp';
  if (OCR_LOT.test(n)) return 'lot';
  return '';
}
function stripLabel(line, kind) {
  const n = ocrNorm(line), re = kind === 'lot' ? OCR_LOT : kind === 'exp' ? OCR_EXP : OCR_MFG;
  const m = n.match(re); let rest = line.slice(m ? m[0].length : 0);
  if (kind === 'mfg') rest = rest.replace(/^[\s.\-]*date/i, '');
  return rest.replace(/^[\s:.\-#)]+/, '');
}
function parseLabelText(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const res = { lot: '', exp: null, expPartial: false, expRaw: '', lotRaw: '' };
  const pending = [];                                       // nhãn đứng 1 mình (giá trị ở cột khác)
  for (let i = 0; i < lines.length; i++) {
    const n = ocrNorm(lines[i]);
    const kind = lineKind(n);
    if (kind) {
      const rest = stripLabel(lines[i], kind);
      if (rest && (kind !== 'lot' ? (ocrDate(rest) || /\d/.test(rest)) : ocrLot(rest))) {
        assign(kind, rest);
      } else pending.push(kind);
      continue;
    }
    if (pending.length) {                                   // dòng giá trị: gán cho nhãn chờ theo thứ tự
      const k = pending[0];
      const ok = k === 'lot' ? ocrLot(lines[i]) : (ocrDate(lines[i]) || /\d[.\/\-]\d/.test(lines[i].replace(/\s/g, '')));
      if (ok) { pending.shift(); assign(k, lines[i]); }
    }
  }
  function assign(k, v) {
    if (k === 'lot' && !res.lot) { res.lot = ocrLot(v); res.lotRaw = v; }
    if (k === 'exp' && !res.exp) {
      const d = ocrDate(v); res.expRaw = v;
      if (d && d.date) { res.exp = d.date; res.expPartial = false; } else res.expPartial = true;
    }
  }
  return res;
}
if (typeof module !== 'undefined') module.exports = { parseLabelText, ocrDate, ocrLot };
