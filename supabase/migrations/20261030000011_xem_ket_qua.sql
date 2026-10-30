-- Kết quả kiểm on the desktop page: the whole đợt for reading (xemDot: same data as xuatDot, but no
-- "XUAT_DOT" log line each time the page is opened) and the action log of the đợt (nhatKy).

-- The whole đợt as xuatDot sends it (lifted unchanged from a_xuatdot in 000008), shared by xuatDot and xemDot.
create function kk.du_lieu_dot(d kk.dot, u kk.tai_khoan) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare vn text := 'DD/MM HH24:MI'; full_vn text := 'YYYY-MM-DD HH24:MI:SS';   -- full_vn: timestamps with the year, for the Excel date-time cells
begin
  return jsonb_build_object(
    'dot', kk.dot_json(d, u),
    'khos', (select coalesce(jsonb_agg(jsonb_build_object('ma', k.ma, 'ten', k.ten, 'tenNgan', k.ten_ngan) order by k.thu_tu, k.ma), '[]')
               from kk.kho k where k.ma = any (d.kho)),
    -- same cell order as the DANH_MUC sheet: ma, ten, ĐVT nhập, quy cách, ĐVT nhỏ nhất, kho mặc định, GTIN, nguồn
    'danhMuc', (select coalesce(jsonb_agg(jsonb_build_array(t.ma, t.ten, t.dvt_nhap, coalesce(to_jsonb(t.quy_cach), '""'::jsonb), t.dvt,
                  coalesce(t.kho_mac_dinh, ''), array_to_string(t.gtin, ' '), t.nguon) order by t.ma collate "C"), '[]') from kk.thuoc t),
    'dong', (select coalesce(jsonb_agg(kk.dong_json(x) || jsonb_build_object(
                  'thayBoi', coalesce('D' || lpad(x.thay_boi::text, 5, '0'), ''), 'req', coalesce(x.req_id, ''), 'capNhat', x.cap_nhat,
                  'tgDay', to_char(x.tg at time zone 'Asia/Ho_Chi_Minh', full_vn)) order by x.so), '[]')
               from kk.dong x where x.dot_id = d.id and not x.tap),
    'hoc', (select coalesce(jsonb_agg(kk.hoc_json(h) || jsonb_build_object(
                  'batDauDay', coalesce(to_char(h.bat_dau at time zone 'Asia/Ho_Chi_Minh', full_vn), ''),
                  'xongLucDay', coalesce(to_char(h.xong_luc at time zone 'Asia/Ho_Chi_Minh', full_vn), '')) order by h.kho, kk.hoc_key(h.hoc) collate kk.tu_nhien), '[]')
              from kk.hoc h where h.dot_id = d.id and not h.tap),
    'thuocMoi', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', 'M' || lpad(m.so::text, 3, '0'), 'tg', to_char(m.tg at time zone 'Asia/Ho_Chi_Minh', vn),
                    'tgDay', to_char(m.tg at time zone 'Asia/Ho_Chi_Minh', full_vn),
                    'maDeXuat', m.ma_de_xuat, 'ten', m.ten, 'dvtn', m.dvt_nhap, 'qc', coalesce(to_jsonb(m.qc_goc), '""'::jsonb),
                    'dvt', m.dvt, 'kho', m.kho, 'nguoi', m.nguoi, 'st', m.trang_thai, 'maChinhThuc', m.ma_chinh_thuc, 'ghi', m.ghi_chu) order by m.so), '[]')
                   from kk.thuoc_moi m where m.dot_id = d.id),
    -- same cell order as the LAN1 sheet: kho, ma, ten, lô, HSD, SL, ĐVT, hộc, người đếm
    'soSanh', (select coalesce(jsonb_agg(jsonb_build_array(s.kho, s.ma, s.ten, s.lo, coalesce(to_char(s.hsd, 'DD/MM/YYYY'), ''),
                  coalesce(to_jsonb(s.sl), '""'::jsonb), s.dvt, s.hoc, s.nguoi) order by s.kho, s.ctid), '[]')
                 from kk.so_sanh s where s.dot_id = d.id));
end $$;

-- ---------------------------------------------------------------- export (readable on a closed đợt; TO_TRUONG allowed)
create or replace function kk.a_xuatdot(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
begin
  perform kk.can_vai(u, '{TO_TRUONG,IT}');
  perform kk.ghi_nhat_ky(u, d.id, 'XUAT_DOT', d.id || ' ' || d.ten);
  return kk.du_lieu_dot(d, u);
end $$;

-- ---------------------------------------------------------------- read the đợt without logging it (readable on a closed đợt)
create function kk.a_xemdot(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
begin
  perform kk.can_vai(u, '{TO_TRUONG,IT}');
  return kk.du_lieu_dot(d, u);
end $$;

-- ---------------------------------------------------------------- action log: this đợt plus the actions tied to no đợt
-- (accounts, danh mục, kho), newest first, latest 3000. Viewing the account list is not a change, so it is left out.
create function kk.a_nhatky(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
begin
  perform kk.can_vai(u, '{IT}');
  return jsonb_build_object('list', (select coalesce(jsonb_agg(jsonb_build_object(
      'tg', to_char(n.tg at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI'), 'tk', coalesce(n.tk, ''), 'ten', coalesce(n.ten, ''),
      'hanhDong', n.hanh_dong, 'chiTiet', coalesce(n.chi_tiet, ''), 'dot', coalesce(n.dot_id, '')) order by n.id desc), '[]')
    from (select * from kk.nhat_ky x where (x.dot_id = d.id or x.dot_id is null) and x.hanh_dong <> 'DS_TAI_KHOAN'
           order by x.id desc limit 3000) n));
end $$;

-- belt and braces: nothing in kk is callable from the API roles
revoke execute on all functions in schema kk from public, anon, authenticated;
