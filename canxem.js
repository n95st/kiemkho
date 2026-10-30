'use strict';
// "Cần xem" analysis, ported from legacy API.canXem (Code.gs). The server sends raw data, the browser computes.
// data = {live, soSanh, dm, soVoi, choDuyet} (see kk.a_canxemdulieu); cfg = {khoTen, loNghi}.
(function () {
  const loKey = (s) => String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '').replace(/^[.\-_#:]+|[.\-_#:]+$/g, '');
  const hocKey = (s) => String(s == null ? '' : s).toUpperCase().trim().replace(/\s+/g, ' ');
  const esc = (w) => String(w).replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');

  function gan(a, b) {                                                   // 2 số lô chỉ khác ≤1 ký tự, hoặc lô này là đầu của lô kia
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

  globalThis.tinhCanXem = function (data, cfg) {
    const dm = data.dm || {}, live = data.live || [], l1 = data.soSanh || {}, khoTen = cfg.khoTen || {};
    const words = (cfg.loNghi || []).filter(Boolean).map(esc).join('|');
    const reNghi = words ? new RegExp(words, 'i') : null;
    const byMa = {};
    live.forEach((r) => { (byMa[r.ma] = byMa[r.ma] || []).push(r); });
    const items = [];
    Object.keys(byMa).forEach((ma) => {
      const rows = byMa[ma], ten = rows[0].ten, lots = {};
      rows.forEach((r) => { (lots[loKey(r.lo)] = lots[loKey(r.lo)] || []).push(r); });
      const keys = Object.keys(lots);
      keys.forEach((k) => {
        const lr = lots[k], lo = lr[0].lo;
        const hsds = lr.map((r) => r.hsd).filter((v, i, a) => v && a.indexOf(v) === i);
        if (hsds.length > 1) items.push({ loai: 'HSD_KHAC', muc: 3, ma: ma, ten: ten, lo: lo, chiTiet: 'Cùng lô nhưng HSD: ' + hsds.join(' / ') });
        const hocs = lr.map((r) => hocKey(r.hoc)).filter((v, i, a) => a.indexOf(v) === i);
        if (hocs.length > 1) items.push({ loai: 'NHIEU_HOC', muc: 1, ma: ma, ten: ten, lo: lo,
          chiTiet: lr.map((r) => r.hoc + ': ' + r.sl + ' ' + r.dvt + ' (' + r.nguoi + ')').join(' · ') });
        const dupHoc = lr.filter((r) => lr.findIndex((x) => hocKey(x.hoc) === hocKey(r.hoc) && x.tk !== r.tk) >= 0);
        if (dupHoc.length) items.push({ loai: 'CUNG_HOC_KHAC_NGUOI', muc: 2, ma: ma, ten: ten, lo: lo,
          chiTiet: dupHoc.map((r) => r.hoc + ': ' + r.sl + ' (' + r.nguoi + ')').join(' · ') + ' – có thể đếm trùng' });
        if ((reNghi && reNghi.test(lo)) || /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(lo) || k.length < 3)
          items.push({ loai: 'LO_NGHI', muc: 2, ma: ma, ten: ten, lo: lo, chiTiet: 'Số lô "' + lo + '" đáng ngờ' });
        lr.forEach((r) => { const d = dm[ma];
          if (d && d.qc && Number(r.hop) > 0 && Number(r.qc) !== Number(d.qc))
            items.push({ loai: 'QC_KHAC', muc: 2, ma: ma, ten: ten, lo: lo, id: r.id,
              chiTiet: r.hoc + ': ' + r.hop + ' hộp × ' + r.qc + ' (gợi ý ' + d.qc + ') = ' + r.sl + ' ' + r.dvt + ' – ' + r.nguoi }); });
      });
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++)
        if (gan(keys[i], keys[j])) items.push({ loai: 'LO_GAN_GIONG', muc: 2, ma: ma, ten: ten, lo: lots[keys[i]][0].lo, lo2: lots[keys[j]][0].lo,
          chiTiet: 'Hai lô gần giống nhau: ' + lots[keys[i]][0].lo + ' và ' + lots[keys[j]][0].lo + ' – có thể gõ sai' });
      const d = dm[ma];
      if (d && d.kho && d.kho !== rows[0].kho) items.push({ loai: 'SAI_KHO', muc: 2, ma: ma, ten: ten, chiTiet: 'Danh mục ghi thuộc ' + (khoTen[d.kho] || d.kho) });
    });
    const lech = [], chuaDem = [], sv = data.soVoi || 'Đợt so sánh';
    Object.keys(l1).forEach((ma) => {
      const l2 = (byMa[ma] || []).reduce((a, r) => a + (Number(r.sl) || 0), 0);
      if (!byMa[ma]) chuaDem.push({ ma: ma, ten: dm[ma] ? dm[ma].ten : '', lan1: l1[ma].sl, dvt: l1[ma].dvt });
      else if (Math.abs(l2 - l1[ma].sl) > 1e-9) lech.push({ loai: 'LECH_LAN1', muc: 2, ma: ma, ten: byMa[ma][0].ten,
        chiTiet: sv + ': ' + l1[ma].sl + ' ' + l1[ma].dvt + ' → đợt này: ' + l2 + ' ' + byMa[ma][0].dvt });
    });
    Object.keys(byMa).forEach((ma) => { if (!l1[ma] && Object.keys(l1).length) lech.push({ loai: 'MOI_SO_LAN1', muc: 1, ma: ma, ten: byMa[ma][0].ten,
      chiTiet: sv + ' không có, đợt này: ' + byMa[ma].reduce((a, r) => a + (Number(r.sl) || 0), 0) + ' ' + byMa[ma][0].dvt }); });
    items.sort((a, b) => b.muc - a.muc || String(a.ma).localeCompare(String(b.ma)));
    return { items: items, lech: lech, chuaDem: chuaDem, choDuyet: data.choDuyet || 0 };
  };
})();
