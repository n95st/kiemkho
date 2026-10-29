-- Task 2: đợt kiểm, kho state, medicine catalogue.

create extension if not exists unaccent with schema extensions;

-- Same as normTen_ in legacy/Code.gs: strip accents, upper-case, keep A-Z0-9 only.
create function kk.norm_ten(s text) returns text
language sql stable set search_path = kk, extensions, pg_temp as $$
  select upper(regexp_replace(unaccent(replace(replace(coalesce(s, ''), 'đ', 'd'), 'Đ', 'D')), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Like needRole_
create function kk.can_vai(u kk.tai_khoan, roles text[]) returns void
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
begin
  if not u.vai_tro = any (roles) then
    raise exception 'Tài khoản % không có quyền này', u.ten;
  end if;
end $$;

-- Like checkKho_: kho must exist and belong to the đợt (when there is one)
create function kk.kiem_kho(d kk.dot, kho text) returns text
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare k kk.kho;
begin
  select * into k from kk.kho x where x.ma = upper(coalesce(kiem_kho.kho, ''));
  if not found then raise exception 'Chưa chọn kho'; end if;
  if d.id is not null and not k.ma = any (d.kho) then
    raise exception 'Đợt "%" không kiểm %', d.ten, k.ten;
  end if;
  return k.ma;
end $$;

-- Like khoState_
create function kk.trang_thai_kho(d kk.dot, kho text) returns text
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  select coalesce((select dk.trang_thai from kk.dot_kho dk where dk.dot_id = d.id and dk.kho = trang_thai_kho.kho), 'DANG_KIEM');
$$;

create function kk.a_dsdot(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  select jsonb_build_object(
    'list', (select coalesce(jsonb_agg(kk.dot_json(t, u) order by t.id), '[]') from kk.dot t
              where t.trang_thai = 'MO' or u.vai_tro in ('TO_TRUONG', 'IT')),
    'hubUrl', '');
$$;

create function kk.a_taodot(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
declare
  tn text := trim(coalesce(req->>'ten', ''));
  khos text[]; sv text := coalesce(req->>'soVoi', ''); src kk.dot; n int; nid text; nd kk.dot;
begin
  perform kk.can_vai(u, '{IT}');
  if length(tn) < 3 then raise exception 'Nhập tên đợt (VD: Kiểm kho cuối năm 2026)'; end if;
  select coalesce(array_agg(k.ma order by k.thu_tu, k.ma), '{}') into khos from kk.kho k
   where k.ma in (select upper(x) from jsonb_array_elements_text(
           case jsonb_typeof(req->'kho') when 'array' then req->'kho' when 'string' then jsonb_build_array(req->'kho') else '[]'::jsonb end) x);
  if cardinality(khos) = 0 then raise exception 'Chọn ít nhất 1 kho'; end if;
  -- lock before the duplicate-name check so concurrent calls serialize (the check sees the other's row)
  perform pg_advisory_xact_lock(hashtext('taoDot'));
  if exists (select 1 from kk.dot t where kk.norm_ten(t.ten) = kk.norm_ten(tn)) then
    raise exception 'Đã có đợt tên "%"', tn;
  end if;

  if sv <> '' then
    select * into src from kk.dot t where t.id = sv;
    if not found then raise exception 'Không thấy đợt so sánh %', sv; end if;
  end if;
  select count(*) + 1 into n from kk.dot;
  loop
    nid := 'DOT' || lpad(n::text, 2, '0');
    exit when not exists (select 1 from kk.dot t where t.id = nid);
    n := n + 1;
  end loop;

  insert into kk.dot (id, ten, kho, nguoi_tao, so_voi) values (nid, tn, khos, u.ten, coalesce(src.ten, ''))
    returning * into nd;
  insert into kk.dot_kho (dot_id, kho) select nid, k from unnest(khos) k;
  if src.id is not null then
    insert into kk.so_sanh (dot_id, kho, ma, ten, lo, hsd, sl, dvt, hoc, nguoi)
      select nid, g.kho, g.ma, g.ten, g.lo, g.hsd, g.sl, g.dvt, g.hoc, g.nguoi
        from kk.dong g where g.dot_id = src.id and g.trang_thai = 'HIEU_LUC' and not g.tap and g.kho = any (khos);
    if coalesce(req->'copyHoc', 'true') <> 'false' then
      insert into kk.hoc (dot_id, tap, kho, hoc) select distinct nid, false, h.kho, h.hoc
        from kk.hoc h where h.dot_id = src.id and not h.tap and h.kho = any (khos);
    end if;
  end if;
  perform kk.ghi_nhat_ky(u, nid, 'TAO_DOT',
    nid || ' ' || tn || ' · ' || array_to_string(khos, ',') || case when src.id is not null then ' · so với ' || src.ten else '' end);
  return jsonb_build_object('dot', kk.dot_json(nd, u));
end $$;

create function kk.a_dattrangthaidot(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
declare st text := upper(coalesce(req->>'st', '')); x kk.dot;
begin
  perform kk.can_vai(u, '{IT}');
  if not exists (select 1 from kk.dot t where t.id = req->>'id') then
    raise exception 'Không thấy đợt %', coalesce(req->>'id', '');
  end if;
  if st not in ('MO', 'DONG') then raise exception 'Trạng thái đợt không hợp lệ'; end if;
  update kk.dot t set trang_thai = st,
         ghi_chu = case when st = 'DONG' then 'Đóng ' else 'Mở lại ' end
                   || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') || ' bởi ' || u.ten
   where t.id = req->>'id' returning * into x;
  perform kk.ghi_nhat_ky(u, x.id, case when st = 'DONG' then 'DONG_DOT' else 'MO_DOT' end, x.id || ' ' || x.ten);
  return jsonb_build_object('dot', kk.dot_json(x, u));
end $$;

create function kk.a_dattrangthaikho(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
declare k text; t text := coalesce(req->>'trangThai', '');
begin
  perform kk.can_vai(u, '{IT}');
  k := kk.kiem_kho(d, req->>'kho');
  if t not in ('DANG_KIEM', 'DA_CHOT') then raise exception 'Trạng thái không hợp lệ'; end if;
  insert into kk.dot_kho as dk (dot_id, kho, trang_thai, cap_nhat)
    values (d.id, k, t, to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') || ' ' || u.ten)
  on conflict (dot_id, kho) do update set trang_thai = excluded.trang_thai, cap_nhat = excluded.cap_nhat;
  perform kk.ghi_nhat_ky(u, d.id, case when t = 'DA_CHOT' then 'CHOT_KHO' else 'MO_KHO' end, k);
  return jsonb_build_object('trangThai', t);
end $$;

create function kk.a_danhmuc(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare lst jsonb; v text;
begin
  select coalesce(jsonb_agg(jsonb_build_array(t.ma, t.ten, t.dvt_nhap, coalesce(to_jsonb(t.quy_cach), '""'::jsonb), t.dvt,
           coalesce(t.kho_mac_dinh, ''), array_to_string(t.gtin, ' ')) order by t.ma collate "C"), '[]') into lst from kk.thuoc t;
  v := left(md5(lst::text), 12);
  if req->>'v' = v then return jsonb_build_object('v', v, 'same', true); end if;
  return jsonb_build_object('v', v, 'list', lst);
end $$;
