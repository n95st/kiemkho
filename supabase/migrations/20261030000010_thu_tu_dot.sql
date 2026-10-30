-- Đợt codes sort as numbers (DOT99 before DOT100), not as text: login and dsDot list đợt in that order,
-- and the phone and the desktop page take the last open đợt as the newest. Bodies copied unchanged otherwise.

create or replace function kk.a_login(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare vis kk.dot[]; x kk.dot; picked kk.dot; info jsonb;
begin
  select coalesce(array_agg(t order by t.id collate kk.tu_nhien), '{}') into vis from kk.dot t
   where t.trang_thai = 'MO' or u.vai_tro in ('TO_TRUONG', 'IT');
  foreach x in array vis loop
    if x.id = req->>'dot' then picked := x; end if;
  end loop;
  if picked.id is not null then info := kk.dot_info(picked, u); end if;
  return jsonb_build_object(
    'tk', u.tk, 'ten', u.ten, 'role', u.vai_tro,
    'roleTen', case u.vai_tro when 'DEM' then 'Người đếm' when 'TO_TRUONG' then 'Tổ trưởng' when 'IT' then 'IT' else 'Tập (không tính)' end,
    'tap', u.vai_tro = 'TAP',
    'loMacDinh', (select gia_tri from kk.cau_hinh where khoa = 'LO_MAC_DINH'),
    'hsdMacDinh', (select gia_tri from kk.cau_hinh where khoa = 'HSD_MAC_DINH'),
    'hsdCanhBao', (select gia_tri from kk.cau_hinh where khoa = 'HSD_CANH_BAO_NGAY'),
    'loNghi', (select gia_tri from kk.cau_hinh where khoa = 'LO_NGHI'),
    'dvt', (select gia_tri from kk.cau_hinh where khoa = 'DVT_LIST'),
    'khos', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'tenNgan', ten_ngan) order by thu_tu, ma), '[]')
               from kk.kho where hoat_dong),
    'dots', (select coalesce(jsonb_agg(kk.dot_json(v, u) order by v.id collate kk.tu_nhien), '[]') from unnest(vis) v),
    'dotInfo', info,
    'dot', coalesce(info->>'ten', ''),
    'trangThai', coalesce(info->'trangThai', '{}'),
    'hubUrl', '');
end $$;

create or replace function kk.a_dsdot(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  select jsonb_build_object(
    'list', (select coalesce(jsonb_agg(kk.dot_json(t, u) order by t.id collate kk.tu_nhien), '[]') from kk.dot t
              where t.trang_thai = 'MO' or u.vai_tro in ('TO_TRUONG', 'IT')),
    'hubUrl', '');
$$;

-- belt and braces: nothing in kk is callable from the API roles
revoke execute on all functions in schema kk from public, anon, authenticated;
