-- Desktop admin page (quantri.html): read-only lists for kho and comparison data,
-- and nhapSoSanh taking a whole multi-kho file in one all-or-nothing call.

-- ---------------------------------------------------------------- comparison data helpers
-- Row checks of nhapSoSanh: [{dong, error}], dong counts from 1 within list.
create function kk.so_sanh_loi(list jsonb) returns jsonb
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('dong', o, 'error', err) order by o), '[]')
    from (select o, case
            when jsonb_typeof(e) <> 'array' then 'Dòng không hợp lệ'
            when btrim(coalesce(e->>0, '')) = '' then 'Thiếu mã thuốc'
            when btrim(coalesce(e->>3, '')) <> '' and kk.parse_hsd(e->>3) is null then 'HSD không hợp lệ: ' || btrim(e->>3)
            when replace(btrim(coalesce(e->>4, '')), ',', '.') !~ '^\d+(\.\d+)?$' then 'Số lượng không hợp lệ: ' || btrim(coalesce(e->>4, ''))
          end err
          from jsonb_array_elements(list) with ordinality t(e, o)) x
   where err is not null;
$$;

-- Replaces the comparison rows of one kho with list (rows already checked). The caller holds the lock.
create function kk.so_sanh_ghi(u kk.tai_khoan, d kk.dot, kho text, list jsonb) returns int
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare n int;
begin
  delete from kk.so_sanh s where s.dot_id = d.id and s.kho = so_sanh_ghi.kho;
  insert into kk.so_sanh (dot_id, kho, ma, ten, lo, hsd, sl, dvt, hoc, nguoi)
  select d.id, so_sanh_ghi.kho, btrim(e->>0), btrim(coalesce(e->>1, '')), btrim(coalesce(e->>2, '')), kk.parse_hsd(e->>3),
         replace(btrim(e->>4), ',', '.')::numeric, btrim(coalesce(e->>5, '')), btrim(coalesce(e->>6, '')), btrim(coalesce(e->>7, ''))
    from jsonb_array_elements(list) with ordinality t(e, o) order by o;
  get diagnostics n = row_count;
  perform kk.ghi_nhat_ky(u, d.id, 'NHAP_SO_SANH', so_sanh_ghi.kho || ' · ' || n || ' dòng');
  return n;
end $$;

-- All-or-nothing over the whole call: any bad row (in any kho) means nothing is replaced.
-- nhieuKho: [{kho, list}] for a whole file; without it the old {kho, list} call still works.
-- chiKiem: check only, never writes.
create or replace function kk.a_nhapsosanh(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_chi_kiem bool := coalesce(kk.json_bool(req->'chiKiem'), false);
  v_kho text; l jsonb; loi jsonb := '[]'; ds jsonb := '{}'; theo_kho jsonb := '{}'; r record;
begin
  perform kk.can_vai(u, '{IT}');
  if not req ? 'nhieuKho' then
    v_kho := kk.kiem_kho(d, req->>'kho');
    if jsonb_typeof(req->'list') is distinct from 'array' then raise exception 'Danh sách số liệu không hợp lệ'; end if;
    loi := kk.so_sanh_loi(req->'list');
    if v_chi_kiem then
      return jsonb_build_object('soDong', jsonb_array_length(req->'list') - jsonb_array_length(loi), 'loi', loi);
    end if;
    if jsonb_array_length(loi) > 0 then return jsonb_build_object('soDong', 0, 'loi', loi); end if;
    perform pg_advisory_xact_lock(hashtext('soSanh|' || d.id || '|' || v_kho));
    return jsonb_build_object('soDong', kk.so_sanh_ghi(u, d, v_kho, req->'list'), 'loi', '[]'::jsonb);
  end if;

  if jsonb_typeof(req->'nhieuKho') is distinct from 'array' then raise exception 'Danh sách số liệu không hợp lệ'; end if;
  for r in select e from jsonb_array_elements(req->'nhieuKho') t(e) loop
    v_kho := kk.kiem_kho(d, r.e->>'kho');
    if ds ? v_kho then raise exception 'Kho % bị lặp trong tệp', v_kho; end if;
    if jsonb_typeof(r.e->'list') is distinct from 'array' then raise exception 'Danh sách số liệu không hợp lệ'; end if;
    l := kk.so_sanh_loi(r.e->'list');
    loi := loi || coalesce((select jsonb_agg(x || jsonb_build_object('kho', v_kho) order by o)
                              from jsonb_array_elements(l) with ordinality t(x, o)), '[]');
    ds := ds || jsonb_build_object(v_kho, r.e->'list');
    theo_kho := theo_kho || jsonb_build_object(v_kho, jsonb_array_length(r.e->'list') - jsonb_array_length(l));
  end loop;
  if jsonb_array_length(loi) > 0 or v_chi_kiem then
    return jsonb_build_object('theoKho', theo_kho, 'loi', loi);
  end if;

  -- lock every kho in one fixed order, so two concurrent imports never wait on each other forever
  for v_kho in select k from jsonb_object_keys(ds) k order by k collate "C" loop
    perform pg_advisory_xact_lock(hashtext('soSanh|' || d.id || '|' || v_kho));
  end loop;
  for v_kho in select k from jsonb_object_keys(ds) k order by k collate "C" loop
    theo_kho := theo_kho || jsonb_build_object(v_kho, kk.so_sanh_ghi(u, d, v_kho, ds->v_kho));
  end loop;
  return jsonb_build_object('theoKho', theo_kho, 'loi', '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- read-only lists (IT)
-- Every kho, hidden ones included, so IT can turn them back on.
create function kk.a_dskho(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
begin
  perform kk.can_vai(u, '{IT}');
  return jsonb_build_object('list', (select coalesce(jsonb_agg(jsonb_build_object(
      'ma', k.ma, 'ten', k.ten, 'tenNgan', k.ten_ngan, 'thuTu', k.thu_tu, 'hoatDong', k.hoat_dong) order by k.thu_tu, k.ma), '[]')
    from kk.kho k));
end $$;

-- Comparison rows of the đợt, same cells and order as soSanh of xuatDot; kho blank = every kho.
-- Read-only (works on a closed đợt) and leaves no nhat_ky row, unlike xuatDot.
create function kk.a_dssosanh(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare v_kho text;
begin
  perform kk.can_vai(u, '{IT}');
  if btrim(coalesce(req->>'kho', '')) <> '' then v_kho := kk.kiem_kho(d, btrim(req->>'kho')); end if;
  return jsonb_build_object('list', (select coalesce(jsonb_agg(jsonb_build_array(s.kho, s.ma, s.ten, s.lo, coalesce(to_char(s.hsd, 'DD/MM/YYYY'), ''),
      coalesce(to_jsonb(s.sl), '""'::jsonb), s.dvt, s.hoc, s.nguoi) order by s.kho, s.ctid), '[]')
    from kk.so_sanh s where s.dot_id = d.id and (v_kho is null or s.kho = v_kho)));
end $$;

-- ---------------------------------------------------------------- gateway: dskho needs no đợt
create or replace function public.api(req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
declare
  hdr text; xff text[]; ip text; act text; u kk.tai_khoan; d kk.dot; r jsonb;
  -- actions that need no đợt (lower-case: kk.a_<name> functions are folded to lower case)
  hub text[] := '{login,danhmuc,dstaikhoan,dsdot,dskho,taodot,dattrangthaidot,luutaikhoan,datlaipin,luuthuoc,nhapthuoc,luukho,luucauhinh}';
  wr text[] := '{luu,hoantac,thuocmoi,nhanhoc,xonghoc,duyetdong,duyetthuocmoi,goplo,dattrangthaikho,luuhoc,nhapsosanh}';
begin
  -- Client IP: cf-connecting-ip, else the RIGHT-most x-forwarded-for entry (the left ones are client-supplied).
  hdr := nullif(current_setting('request.headers', true), '');
  xff := string_to_array(coalesce(hdr::json->>'x-forwarded-for', ''), ',');
  ip := left(coalesce(nullif(trim(hdr::json->>'cf-connecting-ip'), ''),
                      nullif(trim(xff[array_length(xff, 1)]), ''), 'unknown'), 64);

  u := kk.xac_thuc(req->>'pin', ip);
  if u.tk is null or not u.hoat_dong then
    delete from kk.pin_sai where het_han < now();
    insert into kk.pin_sai as p (khoa, so_lan, het_han) values (ip, 1, now() + interval '10 minutes')
    on conflict (khoa) do update
      set so_lan = case when p.het_han > now() then p.so_lan + 1 else 1 end,
          het_han = now() + interval '10 minutes';
    if u.tk is null then
      return jsonb_build_object('ok', false, 'error', 'Sai mã PIN');
    end if;
    return jsonb_build_object('ok', false, 'error', 'Tài khoản ' || u.ten || ' đang bị khoá – báo IT');
  end if;

  act := coalesce(req->>'action', '');
  if act !~ '^[A-Za-z]+$' or to_regprocedure('kk.a_' || act || '(kk.tai_khoan,kk.dot,jsonb)') is null then
    return jsonb_build_object('ok', false, 'error', 'Không có chức năng: ' || act);
  end if;
  act := lower(act);

  if not act = any (hub) then
    d := kk.dung_dot(req->>'dot', u, act = any (wr));
  end if;
  execute format('select kk.%I($1,$2,$3)', 'a_' || act) into r using u, d, req;
  return jsonb_build_object('ok', true) || coalesce(r, '{}');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;


-- belt and braces: nothing in kk is callable from the API roles
revoke execute on all functions in schema kk from public, anon, authenticated;
