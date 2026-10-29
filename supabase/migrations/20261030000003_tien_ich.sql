-- Utility functions: HSD parsing, lot/shelf keys, line JSON, warnings. Internal (not granted to anon).
-- kk.norm_ten already lives in migration 000002.

-- Like parseHsd_: d/m/yyyy, d-m-yy, d.m.yyyy and m/yyyy (last day of month); anything invalid returns null.
create function kk.parse_hsd(s text) returns date
language plpgsql immutable set search_path = kk, extensions, pg_temp as $$
declare
  m text[];
  y int;
begin
  s := btrim(coalesce(s, ''));
  m := regexp_match(s, '^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$');
  if m is not null then
    y := m[3]::int;
    if y < 100 then y := y + 2000; end if;
    if y < 2000 or y > 2100 then return null; end if;
    return make_date(y, m[2]::int, m[1]::int);  -- raises on impossible dates (31/02, month 13)
  end if;
  m := regexp_match(s, '^(\d{1,2})[/\-.](\d{4})$');
  if m is not null then
    return (make_date(m[2]::int, m[1]::int, 1) + interval '1 month - 1 day')::date;
  end if;
  return null;
exception when others then
  return null;
end $$;

create function kk.lo_key(s text) returns text
language sql immutable set search_path = kk, extensions, pg_temp as $$
  select regexp_replace(regexp_replace(upper(coalesce(s, '')), '\s+', '', 'g'), '^[.\-_#:]+|[.\-_#:]+$', '', 'g');
$$;

create function kk.lo_text(s text) returns text
language sql immutable set search_path = kk, extensions, pg_temp as $$
  select regexp_replace(regexp_replace(upper(coalesce(s, '')), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g');
$$;

create function kk.hoc_key(s text) returns text
language sql immutable set search_path = kk, extensions, pg_temp as $$
  select kk.lo_text(s);
$$;

-- Like rowOfId_ (returns the line number instead of the sheet row)
create function kk.so_dong(id text) returns int
language plpgsql immutable set search_path = kk, extensions, pg_temp as $$
declare m text[];
begin
  m := regexp_match(coalesce(id, ''), '^D(\d+)$');
  if m is null then raise exception 'Mã dòng không hợp lệ'; end if;
  return m[1]::int;
end $$;

-- Like lineObj_
create function kk.dong_json(r kk.dong) returns jsonb
language sql stable set search_path = kk, extensions, pg_temp as $$
  select jsonb_build_object(
    'id', 'D' || lpad(r.so::text, 5, '0'),
    'tg', to_char(r.tg at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'),
    'kho', r.kho, 'ma', r.ma, 'ten', r.ten, 'lo', r.lo,
    'hsd', coalesce(to_char(r.hsd, 'DD/MM/YYYY'), ''),
    'hoc', r.hoc,
    'hop', coalesce(to_jsonb(r.hop), '""'::jsonb),
    'qc', coalesce(to_jsonb(r.qc), '""'::jsonb),
    'le', coalesce(to_jsonb(r.le), '""'::jsonb),
    'sl', to_jsonb(r.sl),
    'dvt', r.dvt, 'nguoi', r.nguoi, 'tk', r.tk,
    'tt', r.thao_tac, 'st', r.trang_thai, 'ghi', r.ghi, 'cb', r.canh_bao,
    'seThay', coalesce((select string_agg('D' || lpad(x::text, 5, '0'), ',') from unnest(r.se_thay) x), ''));
$$;

-- Like linesOf_: active or pending lines of one drug in one kho
create function kk.dong_cua(dot_id text, tap bool, kho text, ma text) returns jsonb
language sql stable set search_path = kk, extensions, pg_temp as $$
  select coalesce(jsonb_agg(kk.dong_json(d) order by d.so), '[]'::jsonb)
  from kk.dong d
  where d.dot_id = dong_cua.dot_id and d.tap = dong_cua.tap and d.kho = dong_cua.kho and d.ma = dong_cua.ma
    and d.trang_thai in ('HIEU_LUC', 'CHO_DUYET');
$$;

-- Like canhBao_; t may be null (new drug). Thresholds come from kk.cau_hinh.
create function kk.canh_bao(t kk.thuoc, kho text, lo text, hsd date, hop numeric, qc numeric) returns text[]
language plpgsql stable set search_path = kk, extensions, pg_temp as $$
declare
  cb text[] := '{}';
  ngay numeric := coalesce((select (gia_tri #>> '{}')::numeric from kk.cau_hinh where khoa = 'HSD_CANH_BAO_NGAY'), 90);
  pat text;
  hit text[];
  days numeric;
  kt text;
begin
  if t.ma is not null then
    if coalesce(hop, 0) > 0 and coalesce(t.quy_cach, 0) <> 0 and coalesce(qc, 0) <> 0 and qc <> t.quy_cach then
      cb := cb || ('Quy cách ' || qc::text || ' khác gợi ý ' || t.quy_cach::text);
    end if;
    if t.kho_mac_dinh is not null and t.kho_mac_dinh <> kho then
      select k.ten into kt from kk.kho k where k.ma = t.kho_mac_dinh;
      cb := cb || ('Thuốc thuộc ' || coalesce(kt, t.kho_mac_dinh));
    end if;
  end if;
  if coalesce(lo, '') <> '' then
    select string_agg(regexp_replace(x, '([\\.^$|?*+()\[\]{}-])', '\\\1', 'g'), '|') into pat
      from kk.cau_hinh c, jsonb_array_elements_text(c.gia_tri) x where c.khoa = 'LO_NGHI';
    if pat is not null then
      hit := regexp_match(lo, pat, 'i');
      if hit is not null then cb := cb || ('Số lô có chữ ' || hit[1]); end if;
    end if;
    if lo ~ '^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}$' then cb := array_append(cb, 'Số lô trông giống ngày tháng'::text); end if;
  end if;
  if hsd is not null then
    days := extract(epoch from (hsd::timestamp at time zone 'Asia/Ho_Chi_Minh') - now()) / 86400;
    if days < 0 then cb := array_append(cb, 'HSD đã quá hạn'::text);
    elsif days < ngay then cb := cb || ('HSD còn dưới ' || ngay::text || ' ngày'); end if;
  end if;
  return cb;
end $$;
