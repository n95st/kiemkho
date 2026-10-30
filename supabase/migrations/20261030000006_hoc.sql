-- Task 7: hộc (nhận / xong / mở lại / danh sách) và tiến độ kho.

-- Natural order like JS localeCompare(..., 'vi', {numeric:true}): 'A 2' before 'A 10'
create collation kk.tu_nhien (provider = icu, locale = 'vi-u-kn-true');

-- Like hocObj_
create function kk.hoc_json(h kk.hoc) returns jsonb
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  select jsonb_build_object(
    'kho', h.kho, 'hoc', kk.hoc_key(h.hoc), 'st', h.trang_thai,
    'stTen', case h.trang_thai when 'CHUA_NHAN' then 'Chưa ai nhận' when 'DANG_DEM' then 'Đang đếm' else 'Đã xong' end,
    'nguoi', h.nguoi,
    'batDau', coalesce(to_char(h.bat_dau at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'), ''),
    'xongLuc', coalesce(to_char(h.xong_luc at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'), ''),
    'nguoiXong', h.nguoi_xong, 'ghi', h.ghi);
$$;

-- Hộc list of one kho (tap side picked by caller): shared by dsHoc and tienDo
create function kk.ds_hoc(d kk.dot, v_tap bool, v_kho text) returns jsonb
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  with hs as (
    select h.* from kk.hoc h
     where h.dot_id = d.id and h.tap = v_tap and h.kho = v_kho and kk.hoc_key(h.hoc) <> ''
    union all
    -- counted but never claimed: shown as DANG_DEM with no owner
    select ((d.id, v_tap, v_kho, x.hoc, 'DANG_DEM', '', null, null, '', '')::kk.hoc).*
      from (select distinct kk.hoc_key(y.hoc) hoc from kk.dong y
             where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho and y.trang_thai = 'HIEU_LUC') x
     where not exists (select 1 from kk.hoc h where h.dot_id = d.id and h.tap = v_tap and h.kho = v_kho and kk.hoc_key(h.hoc) = x.hoc)
  ), dm as (
    select kk.hoc_key(y.hoc) hoc, count(*) so_dong, count(distinct y.ma) so_ma
      from kk.dong y
     where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho and y.trang_thai = 'HIEU_LUC' group by 1
  ), ng as (
    select s.hoc, jsonb_agg(s.nguoi order by s.dau) arr
      from (select kk.hoc_key(y.hoc) hoc, y.nguoi, min(y.so) dau from kk.dong y
             where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho and y.trang_thai = 'HIEU_LUC' group by 1, 2) s group by 1
  ), it as (
    select h.trang_thai, kk.hoc_key(h.hoc) k,
           kk.hoc_json(h) || jsonb_build_object('soDong', coalesce(dm.so_dong, 0), 'soMa', coalesce(dm.so_ma, 0),
                                                  'nguoiDem', coalesce(ng.arr, '[]')) j
      from hs h left join dm on dm.hoc = kk.hoc_key(h.hoc) left join ng on ng.hoc = kk.hoc_key(h.hoc)
  )
  select jsonb_build_object(
    'list', coalesce((select jsonb_agg(j order by case trang_thai when 'CHUA_NHAN' then 0 when 'DANG_DEM' then 1 else 2 end,
                                                  k collate kk.tu_nhien) from it), '[]'),
    'xong', (select count(*) from it where trang_thai = 'XONG'),
    'dang', (select count(*) from it where trang_thai = 'DANG_DEM'),
    'chua', (select count(*) from it where trang_thai = 'CHUA_NHAN'));
$$;

-- Like API.dsHoc
create function kk.a_dshoc(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  select kk.ds_hoc(d, u.vai_tro = 'TAP', kk.kiem_kho(d, req->>'kho'));
$$;

-- Like API.nhanHoc: claim a hộc; a second person is appended to the names; a done hộc needs moLai
create function kk.a_nhanhoc(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_kho text := kk.kiem_kho(d, req->>'kho');
  v_hoc text := kk.hoc_key(req->>'hoc');
  v_mo bool := coalesce(req->'moLai', 'null'::jsonb) not in ('null', 'false', '0', '""');
  v_old text; h kk.hoc;
begin
  if v_hoc = '' then raise exception 'Chưa nhập hộc'; end if;
  -- row lock only when the hộc exists (no global lock); tells us whether this call reopens it
  select trang_thai into v_old from kk.hoc x where x.dot_id = d.id and x.tap = v_tap and x.kho = v_kho and x.hoc = v_hoc for update;
  insert into kk.hoc as t (dot_id, tap, kho, hoc, trang_thai, nguoi, bat_dau)
  values (d.id, v_tap, v_kho, v_hoc, 'DANG_DEM', u.ten, now())
  on conflict (dot_id, tap, kho, hoc) do update set
    trang_thai = 'DANG_DEM',
    nguoi = (select string_agg(n, ', ' order by o)
               from (select n, o from regexp_split_to_table(btrim(t.nguoi), '\s*,\s*') with ordinality a(n, o) where n <> ''
                     union all
                     select u.ten, 1000000
                      where u.ten not in (select regexp_split_to_table(btrim(t.nguoi), '\s*,\s*'))) s),
    bat_dau = coalesce(t.bat_dau, now()),
    xong_luc = case when t.trang_thai = 'XONG' then null else t.xong_luc end,
    nguoi_xong = case when t.trang_thai = 'XONG' then '' else t.nguoi_xong end,
    ghi = case when t.trang_thai = 'XONG'
               then 'Mở lại bởi ' || u.ten || ' ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') else t.ghi end
  where t.trang_thai <> 'XONG' or v_mo
  returning t.* into h;
  if not found then
    select * into h from kk.hoc x where x.dot_id = d.id and x.tap = v_tap and x.kho = v_kho and x.hoc = v_hoc;
    return jsonb_build_object('hoc', kk.hoc_json(h), 'daXong', true);
  end if;
  if v_old = 'XONG' then perform kk.ghi_nhat_ky(u, d.id, 'MO_LAI_HOC', v_kho || ' ' || v_hoc); end if;
  return jsonb_build_object('hoc', kk.hoc_json(h));
end $$;

-- Like API.xongHoc: mark done (creating the row when nobody claimed it), report HIEU_LUC line count
create function kk.a_xonghoc(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_kho text := kk.kiem_kho(d, req->>'kho');
  v_hoc text := kk.hoc_key(req->>'hoc');
  h kk.hoc;
begin
  if v_hoc = '' then raise exception 'Chưa nhập hộc'; end if;
  insert into kk.hoc as t (dot_id, tap, kho, hoc, trang_thai, nguoi, bat_dau, xong_luc, nguoi_xong)
  values (d.id, v_tap, v_kho, v_hoc, 'XONG', u.ten, now(), now(), u.ten)
  on conflict (dot_id, tap, kho, hoc) do update set trang_thai = 'XONG', xong_luc = now(), nguoi_xong = u.ten
  returning t.* into h;
  perform kk.ghi_nhat_ky(u, d.id, 'XONG_HOC', v_kho || ' ' || v_hoc);
  return jsonb_build_object('hoc', kk.hoc_json(h), 'soDong',
    (select count(*) from kk.dong y where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho
        and y.trang_thai = 'HIEU_LUC' and kk.hoc_key(y.hoc) = v_hoc));
end $$;

-- Like API.tienDo
create function kk.a_tiendo(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_kho text := kk.kiem_kho(d, req->>'kho');
  hs jsonb := kk.ds_hoc(d, v_tap, v_kho);
  lan1 text[] := array(select distinct s.ma from kk.so_sanh s where s.dot_id = d.id and s.kho = v_kho and s.ma <> '');
  ma_dem text[];
begin
  ma_dem := array(select distinct y.ma from kk.dong y
                   where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho and y.trang_thai = 'HIEU_LUC');
  return jsonb_build_object(
    'soMa', cardinality(ma_dem),
    'soDong', (select count(*) from kk.dong y where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho and y.trang_thai = 'HIEU_LUC'),
    'choDuyet', (select count(*) from kk.dong y where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho and y.trang_thai = 'CHO_DUYET'),
    'lan1', cardinality(lan1),
    'hocXong', hs->'xong', 'hocDang', hs->'dang', 'hocChua', hs->'chua',
    'lan1DaDemLai', (select count(*) from unnest(lan1) m where m = any (ma_dem)),
    'tongDanhMuc', (select count(*) from kk.thuoc),
    'trangThai', kk.trang_thai_kho(d, v_kho),
    'soVoi', d.so_voi);
end $$;
