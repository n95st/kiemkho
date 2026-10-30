-- Task 10: server-side configuration for IT (accounts, PINs, drugs, kho, hộc, general config, comparison data, export).
-- Gateway sets in public.api (migration 000001) already list these actions: the hub set needs no đợt,
-- luuhoc / nhapsosanh are writes (refused on a closed đợt), xuatdot is a plain đợt action (readable when closed).

-- ---------------------------------------------------------------- helpers
-- Item of dsTaiKhoan
create function kk.tk_json(t kk.tai_khoan) returns jsonb
language sql stable set search_path = kk, extensions, pg_temp as $$
  select jsonb_build_object('tk', t.tk, 'ten', t.ten, 'pin', t.pin, 'role', t.vai_tro,
    'roleTen', case t.vai_tro when 'DEM' then 'Người đếm' when 'TO_TRUONG' then 'Tổ trưởng' when 'IT' then 'IT' else 'Tập (không tính)' end,
    'active', t.hoat_dong, 'ghiChu', t.ghi_chu);
$$;

-- Random 6-digit PIN (first digit 1-9) not used by any account; gen_random_uuid() is cryptographically random.
-- Callers hold the 'taiKhoan' advisory lock so two calls cannot pick the same PIN.
create function kk.pin_moi() returns text
language plpgsql volatile set search_path = kk, extensions, pg_temp as $$
declare p text;
begin
  loop
    p := (100000 + (('x' || substr(gen_random_uuid()::text, 1, 8))::bit(32)::bigint % 900000))::text;
    exit when not exists (select 1 from kk.tai_khoan t where t.pin = p);
  end loop;
  return p;
end $$;

-- Boolean field of a request: true/false, or null when absent or not a JSON boolean
create function kk.json_bool(j jsonb) returns bool
language sql immutable set search_path = kk, extensions, pg_temp as $$
  select case when jsonb_typeof(j) = 'boolean' then (j #>> '{}')::bool end;
$$;

-- Hộc names of a request list: normalised with hoc_key, blanks and duplicates dropped, first-seen order kept
create function kk.hoc_chuan_ds(j jsonb) returns text[]
language plpgsql immutable set search_path = kk, extensions, pg_temp as $$
begin
  if j is null or jsonb_typeof(j) = 'null' then return '{}'; end if;
  if jsonb_typeof(j) <> 'array' then raise exception 'Danh sách hộc không hợp lệ'; end if;
  return coalesce((select array_agg(s.h order by s.o)
                     from (select h, min(o) o from (select kk.hoc_key(x) h, o from jsonb_array_elements_text(j) with ordinality t(x, o)) q
                            where h <> '' group by h) s), '{}');
end $$;

-- One drug row of luuThuoc / nhapThuoc: validates, then adds or edits by ma. Returns true when the row was added.
-- v_giu_gtin: an empty GTIN cell keeps the barcodes already learned (bulk import must not wipe them).
create function kk.luu_thuoc_dong(v_ma text, v_ten text, v_dvtn text, v_qc text, v_dvt text, v_kho text, v_gtin text, v_giu_gtin bool)
returns bool
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  c_ma text := btrim(coalesce(v_ma, ''));
  c_ten text := btrim(coalesce(v_ten, ''));
  c_dvt text := btrim(coalesce(v_dvt, ''));
  c_q text := replace(btrim(coalesce(v_qc, '')), ',', '.');
  c_k text := upper(btrim(coalesce(v_kho, '')));
  tok text; gt text[]; v_new bool;
begin
  if c_ma = '' then raise exception 'Nhập mã thuốc'; end if;
  if c_ten = '' then raise exception 'Nhập tên thuốc'; end if;
  if c_dvt = '' then raise exception 'Nhập đơn vị tính nhỏ nhất'; end if;
  if c_q <> '' and c_q !~ '^\d+(\.\d+)?$' then raise exception 'Quy cách phải là số'; end if;
  if c_k <> '' and not exists (select 1 from kk.kho x where x.ma = c_k) then
    raise exception 'Kho mặc định % không tồn tại', btrim(v_kho);
  end if;
  for tok in select x from regexp_split_to_table(btrim(coalesce(v_gtin, '')), '[\s,;]+') x where x <> '' loop
    if tok !~ '^\d{8,14}$' then raise exception 'Mã vạch phải gồm 8–14 chữ số: %', tok; end if;
  end loop;
  gt := coalesce((select array_agg(s.t order by s.o)
                    from (select t, min(o) o from regexp_split_to_table(btrim(coalesce(v_gtin, '')), '[\s,;]+') with ordinality x(t, o)
                           where t <> '' group by t) s), '{}');

  insert into kk.thuoc as t (ma, ten, dvt_nhap, quy_cach, dvt, kho_mac_dinh, gtin, nguon)
  values (c_ma, c_ten, btrim(coalesce(v_dvtn, '')), nullif(c_q, '')::numeric, c_dvt, nullif(c_k, ''), gt, 'IT')
  on conflict (ma) do update set ten = excluded.ten, dvt_nhap = excluded.dvt_nhap, quy_cach = excluded.quy_cach,
    dvt = excluded.dvt, kho_mac_dinh = excluded.kho_mac_dinh, cap_nhat = now(),
    gtin = case when v_giu_gtin and cardinality(excluded.gtin) = 0 then t.gtin else excluded.gtin end
  returning (t.xmax = 0) into v_new;
  return v_new;
end $$;

-- ---------------------------------------------------------------- accounts
create function kk.a_dstaikhoan(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
begin
  perform kk.can_vai(u, '{IT}');
  perform kk.ghi_nhat_ky(u, null, 'DS_TAI_KHOAN', '');
  return jsonb_build_object('list', (select coalesce(jsonb_agg(kk.tk_json(t) order by t.tk), '[]') from kk.tai_khoan t));
end $$;

create function kk.a_luutaikhoan(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_tk text := nullif(btrim(coalesce(req->>'tk', '')), '');
  v_ten text := btrim(coalesce(req->>'ten', ''));
  v_role text := coalesce(req->>'role', '');
  v_act bool := kk.json_bool(req->'active');
  v_ghi text := case when req ? 'ghiChu' then btrim(coalesce(req->>'ghiChu', '')) end;
  t kk.tai_khoan; n int;
begin
  perform kk.can_vai(u, '{IT}');
  if v_ten = '' then raise exception 'Nhập tên hiển thị'; end if;
  if v_role not in ('DEM', 'TO_TRUONG', 'IT', 'TAP') then raise exception 'Vai trò không hợp lệ'; end if;
  perform pg_advisory_xact_lock(hashtext('taiKhoan'));
  if v_tk is not null then
    select * into t from kk.tai_khoan x where x.tk = v_tk;
    if not found then raise exception 'Không thấy tài khoản %', v_tk; end if;
    if t.tk = u.tk and (v_act is false or v_role <> u.vai_tro) then
      raise exception 'Không tự khoá hoặc đổi vai của chính mình';
    end if;
    update kk.tai_khoan x set ten = v_ten, vai_tro = v_role, hoat_dong = coalesce(v_act, x.hoat_dong), ghi_chu = coalesce(v_ghi, x.ghi_chu)
     where x.tk = v_tk returning * into t;
  else
    select coalesce(max(substr(x.tk, 3)::int), 0) + 1 into n from kk.tai_khoan x where x.tk ~ '^TK\d{1,9}$';
    insert into kk.tai_khoan (tk, ten, pin, vai_tro, hoat_dong, ghi_chu)
    values ('TK' || lpad(n::text, greatest(2, length(n::text)), '0'), v_ten, kk.pin_moi(), v_role, coalesce(v_act, true), coalesce(v_ghi, ''))
    returning * into t;
  end if;
  perform kk.ghi_nhat_ky(u, null, 'LUU_TAI_KHOAN', t.tk || ' ' || t.ten || ' · ' || t.vai_tro || case when t.hoat_dong then '' else ' · khoá' end);
  return jsonb_build_object('taiKhoan', kk.tk_json(t));
end $$;

create function kk.a_datlaipin(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare v_tk text := btrim(coalesce(req->>'tk', '')); t kk.tai_khoan; p text;
begin
  perform kk.can_vai(u, '{IT}');
  perform pg_advisory_xact_lock(hashtext('taiKhoan'));
  select * into t from kk.tai_khoan x where x.tk = v_tk;
  if not found then raise exception 'Không thấy tài khoản %', v_tk; end if;
  p := kk.pin_moi();
  update kk.tai_khoan x set pin = p where x.tk = v_tk;
  perform kk.ghi_nhat_ky(u, null, 'DAT_LAI_PIN', t.tk || ' ' || t.ten);   -- never log the PIN itself
  return jsonb_build_object('pin', p);
end $$;

-- ---------------------------------------------------------------- drugs
create function kk.a_luuthuoc(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
begin
  perform kk.can_vai(u, '{IT}');
  perform kk.luu_thuoc_dong(req->>'ma', req->>'ten', req->>'dvtn', req->>'qc', req->>'dvt', req->>'kho',
    case when jsonb_typeof(req->'gtin') = 'array' then (select string_agg(x, ' ') from jsonb_array_elements_text(req->'gtin') x) else req->>'gtin' end,
    false);
  perform kk.ghi_nhat_ky(u, null, 'LUU_THUOC', btrim(req->>'ma'));
  return '{}'::jsonb;
end $$;

create function kk.a_nhapthuoc(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare r record; v_them int := 0; v_sua int := 0; loi jsonb := '[]';
begin
  perform kk.can_vai(u, '{IT}');
  if jsonb_typeof(req->'list') is distinct from 'array' then raise exception 'Danh sách thuốc không hợp lệ'; end if;
  for r in select e, o from jsonb_array_elements(req->'list') with ordinality t(e, o) loop
    begin   -- own subtransaction: a bad row is reported and skipped, the other rows stay
      if jsonb_typeof(r.e) <> 'array' then raise exception 'Dòng không hợp lệ'; end if;
      if kk.luu_thuoc_dong(r.e->>0, r.e->>1, r.e->>2, r.e->>3, r.e->>4, r.e->>5, r.e->>6, true) then v_them := v_them + 1; else v_sua := v_sua + 1; end if;
    exception when others then
      loi := loi || jsonb_build_object('dong', r.o, 'error', sqlerrm);
    end;
  end loop;
  perform kk.ghi_nhat_ky(u, null, 'NHAP_THUOC', 'thêm ' || v_them || ', sửa ' || v_sua || ', lỗi ' || jsonb_array_length(loi));
  return jsonb_build_object('them', v_them, 'sua', v_sua, 'loi', loi);
end $$;

-- ---------------------------------------------------------------- kho
create function kk.a_luukho(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_ma text := upper(btrim(coalesce(req->>'ma', '')));
  v_ten text := btrim(coalesce(req->>'ten', ''));
  v_ngan text := btrim(coalesce(req->>'tenNgan', ''));
  v_tt text := btrim(coalesce(req->>'thuTu', ''));
  v_hd bool := kk.json_bool(req->'hoatDong');
  old kk.kho; dd kk.dot;
begin
  perform kk.can_vai(u, '{IT}');
  if v_ma !~ '^[A-Z0-9_]{1,10}$' then raise exception 'Mã kho chỉ gồm chữ, số, gạch dưới (tối đa 10 ký tự)'; end if;
  if v_ten = '' then raise exception 'Nhập tên kho'; end if;
  if v_ngan = '' then raise exception 'Nhập tên ngắn của kho'; end if;
  if v_tt <> '' and v_tt !~ '^-?\d{1,6}$' then raise exception 'Thứ tự phải là số nguyên'; end if;
  select * into old from kk.kho x where x.ma = v_ma;
  if v_hd is false then
    select * into dd from kk.dot x where x.trang_thai = 'MO' and v_ma = any (x.kho) order by x.id limit 1;
    if found then raise exception 'Kho % đang dùng trong đợt %', coalesce(old.ten, v_ten), dd.ten; end if;
  end if;
  insert into kk.kho as k (ma, ten, ten_ngan, thu_tu, hoat_dong) values (v_ma, v_ten, v_ngan, coalesce(nullif(v_tt, '')::int, 0), coalesce(v_hd, true))
  on conflict (ma) do update set ten = excluded.ten, ten_ngan = excluded.ten_ngan,
    thu_tu = coalesce(nullif(v_tt, '')::int, k.thu_tu), hoat_dong = coalesce(v_hd, k.hoat_dong);
  perform kk.ghi_nhat_ky(u, null, 'LUU_KHO', v_ma || ' ' || v_ten || case when v_hd is false then ' · ẩn' else '' end);
  return '{}'::jsonb;
end $$;

-- ---------------------------------------------------------------- hộc list (IT side, tap = false)
create function kk.a_luuhoc(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_kho text := kk.kiem_kho(d, req->>'kho');
  v_them text[] := kk.hoc_chuan_ds(req->'them');
  v_xoa text[] := kk.hoc_chuan_ds(req->'xoa');
  h text; n int; v_n_them int := 0; v_n_xoa int := 0;
begin
  perform kk.can_vai(u, '{IT}');
  -- all-or-nothing: any refused hộc raises and rolls the whole call back
  foreach h in array v_xoa loop
    if exists (select 1 from kk.dong y where y.dot_id = d.id and not y.tap and y.kho = v_kho and kk.hoc_key(y.hoc) = h)
       or exists (select 1 from kk.hoc x where x.dot_id = d.id and not x.tap and x.kho = v_kho and kk.hoc_key(x.hoc) = h and x.trang_thai <> 'CHUA_NHAN') then
      raise exception 'Hộc % đã có người đếm – không xoá được', h;
    end if;
    delete from kk.hoc x where x.dot_id = d.id and not x.tap and x.kho = v_kho and kk.hoc_key(x.hoc) = h;
    get diagnostics n = row_count;
    v_n_xoa := v_n_xoa + n;
  end loop;
  foreach h in array v_them loop
    insert into kk.hoc (dot_id, tap, kho, hoc) values (d.id, false, v_kho, h) on conflict do nothing;
    get diagnostics n = row_count;
    v_n_them := v_n_them + n;
  end loop;
  perform kk.ghi_nhat_ky(u, d.id, 'LUU_HOC', v_kho || ' · thêm ' || v_n_them || ', xoá ' || v_n_xoa);
  return jsonb_build_object('them', v_n_them, 'xoa', v_n_xoa);
end $$;

-- ---------------------------------------------------------------- general config (5 keys from Task 1)
create function kk.a_luucauhinh(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_khoa text := coalesce(req->>'khoa', '');
  g jsonb := req->'giaTri';
  v jsonb; s text; dt date;
begin
  perform kk.can_vai(u, '{IT}');
  if v_khoa = 'HSD_CANH_BAO_NGAY' then
    -- integer 0-3650 as a JSON number, or a string of digits only ('30.0' and text are refused)
    if jsonb_typeof(g) = 'number' and (g #>> '{}')::numeric = trunc((g #>> '{}')::numeric)
       and (g #>> '{}')::numeric between 0 and 3650 then
      v := to_jsonb((g #>> '{}')::numeric::int);
    elsif jsonb_typeof(g) = 'string' and btrim(g #>> '{}') ~ '^\d{1,4}$' and btrim(g #>> '{}')::int <= 3650 then
      v := to_jsonb(btrim(g #>> '{}')::int);
    else
      raise exception 'Số ngày cảnh báo HSD phải là số nguyên từ 0 đến 3650';
    end if;
  elsif v_khoa = 'HSD_MAC_DINH' then
    dt := case when jsonb_typeof(g) = 'string' then kk.parse_hsd(g #>> '{}') end;
    if dt is null then raise exception 'Hạn dùng mặc định không hợp lệ – nhập dạng ngày/tháng/năm'; end if;
    v := to_jsonb(to_char(dt, 'DD/MM/YYYY'));
  elsif v_khoa = 'LO_MAC_DINH' then
    s := case when jsonb_typeof(g) = 'string' then btrim(g #>> '{}') end;
    if coalesce(s, '') = '' then raise exception 'Số lô mặc định không được để trống'; end if;
    v := to_jsonb(s);
  elsif v_khoa in ('LO_NGHI', 'DVT_LIST') then
    if jsonb_typeof(g) <> 'array' or jsonb_array_length(g) = 0
       or exists (select 1 from jsonb_array_elements(g) e where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '') then
      s := case v_khoa when 'LO_NGHI' then 'Danh sách chữ nghi là số lô phải có ít nhất 1 chữ, không để ô trống'
                       else 'Danh sách đơn vị tính phải có ít nhất 1 đơn vị, không để ô trống' end;
      raise exception '%', s;
    end if;
    v := (select jsonb_agg(to_jsonb(btrim(e #>> '{}')) order by o) from jsonb_array_elements(g) with ordinality t(e, o));
  else
    raise exception 'Không có mục cấu hình %', v_khoa;
  end if;
  update kk.cau_hinh c set gia_tri = v where c.khoa = v_khoa;
  perform kk.ghi_nhat_ky(u, null, 'LUU_CAU_HINH', v_khoa);
  return '{}'::jsonb;
end $$;

-- ---------------------------------------------------------------- comparison data (replaces the LAN1 sheet)
-- All-or-nothing: when any row is bad nothing is replaced and the bad rows are listed in loi.
create function kk.a_nhapsosanh(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_kho text := kk.kiem_kho(d, req->>'kho');
  r record; err text; loi jsonb := '[]'; n int;
begin
  perform kk.can_vai(u, '{IT}');
  if jsonb_typeof(req->'list') is distinct from 'array' then raise exception 'Danh sách số liệu không hợp lệ'; end if;
  for r in select e, o from jsonb_array_elements(req->'list') with ordinality t(e, o) loop
    err := case
      when jsonb_typeof(r.e) <> 'array' then 'Dòng không hợp lệ'
      when btrim(coalesce(r.e->>0, '')) = '' then 'Thiếu mã thuốc'
      when btrim(coalesce(r.e->>3, '')) <> '' and kk.parse_hsd(r.e->>3) is null then 'HSD không hợp lệ: ' || btrim(r.e->>3)
      when replace(btrim(coalesce(r.e->>4, '')), ',', '.') !~ '^\d+(\.\d+)?$' then 'Số lượng không hợp lệ: ' || btrim(coalesce(r.e->>4, ''))
    end;
    if err is not null then loi := loi || jsonb_build_object('dong', r.o, 'error', err); end if;
  end loop;
  if jsonb_array_length(loi) > 0 then return jsonb_build_object('soDong', 0, 'loi', loi); end if;

  perform pg_advisory_xact_lock(hashtext('soSanh|' || d.id || '|' || v_kho));
  delete from kk.so_sanh s where s.dot_id = d.id and s.kho = v_kho;
  insert into kk.so_sanh (dot_id, kho, ma, ten, lo, hsd, sl, dvt, hoc, nguoi)
  select d.id, v_kho, btrim(e->>0), btrim(coalesce(e->>1, '')), btrim(coalesce(e->>2, '')), kk.parse_hsd(e->>3),
         replace(btrim(e->>4), ',', '.')::numeric, btrim(coalesce(e->>5, '')), btrim(coalesce(e->>6, '')), btrim(coalesce(e->>7, ''))
    from jsonb_array_elements(req->'list') with ordinality t(e, o) order by o;
  get diagnostics n = row_count;
  perform kk.ghi_nhat_ky(u, d.id, 'NHAP_SO_SANH', v_kho || ' · ' || n || ' dòng');
  return jsonb_build_object('soDong', n, 'loi', '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- export (readable on a closed đợt; TO_TRUONG allowed)
create function kk.a_xuatdot(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql volatile security definer set search_path = kk, extensions, pg_temp as $$
declare vn text := 'DD/MM HH24:MI';
begin
  perform kk.can_vai(u, '{TO_TRUONG,IT}');
  perform kk.ghi_nhat_ky(u, d.id, 'XUAT_DOT', d.id || ' ' || d.ten);
  return jsonb_build_object(
    'dot', kk.dot_json(d, u),
    'khos', (select coalesce(jsonb_agg(jsonb_build_object('ma', k.ma, 'ten', k.ten, 'tenNgan', k.ten_ngan) order by k.thu_tu, k.ma), '[]')
               from kk.kho k where k.ma = any (d.kho)),
    -- same cell order as the DANH_MUC sheet: ma, ten, ĐVT nhập, quy cách, ĐVT nhỏ nhất, kho mặc định, GTIN, nguồn
    'danhMuc', (select coalesce(jsonb_agg(jsonb_build_array(t.ma, t.ten, t.dvt_nhap, coalesce(to_jsonb(t.quy_cach), '""'::jsonb), t.dvt,
                  coalesce(t.kho_mac_dinh, ''), array_to_string(t.gtin, ' '), t.nguon) order by t.ma collate "C"), '[]') from kk.thuoc t),
    'dong', (select coalesce(jsonb_agg(kk.dong_json(x) || jsonb_build_object(
                  'thayBoi', coalesce('D' || lpad(x.thay_boi::text, 5, '0'), ''), 'req', coalesce(x.req_id, ''), 'capNhat', x.cap_nhat) order by x.so), '[]')
               from kk.dong x where x.dot_id = d.id and not x.tap),
    'hoc', (select coalesce(jsonb_agg(kk.hoc_json(h) order by h.kho, kk.hoc_key(h.hoc) collate kk.tu_nhien), '[]')
              from kk.hoc h where h.dot_id = d.id and not h.tap),
    'thuocMoi', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', 'M' || lpad(m.so::text, 3, '0'), 'tg', to_char(m.tg at time zone 'Asia/Ho_Chi_Minh', vn),
                    'maDeXuat', m.ma_de_xuat, 'ten', m.ten, 'dvtn', m.dvt_nhap, 'qc', coalesce(to_jsonb(m.qc_goc), '""'::jsonb),
                    'dvt', m.dvt, 'kho', m.kho, 'nguoi', m.nguoi, 'st', m.trang_thai, 'maChinhThuc', m.ma_chinh_thuc, 'ghi', m.ghi_chu) order by m.so), '[]')
                   from kk.thuoc_moi m where m.dot_id = d.id),
    -- same cell order as the LAN1 sheet: kho, ma, ten, lô, HSD, SL, ĐVT, hộc, người đếm
    'soSanh', (select coalesce(jsonb_agg(jsonb_build_array(s.kho, s.ma, s.ten, s.lo, coalesce(to_char(s.hsd, 'DD/MM/YYYY'), ''),
                  coalesce(to_jsonb(s.sl), '""'::jsonb), s.dvt, s.hoc, s.nguoi) order by s.kho, s.ctid), '[]')
                 from kk.so_sanh s where s.dot_id = d.id));
end $$;

-- belt and braces (Task 1 review): nothing in kk is callable from the API roles, whatever default privileges did
revoke execute on all functions in schema kk from public, anon, authenticated;
