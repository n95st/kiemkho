-- Task 4: save a count (API.luu). Validation, insert, offline-resend dedupe, GTIN learning.
-- Task 5 extends kk.a_luu in place (replace / conflict / closed-kho branches).

-- Like num_: empty -> null, accepts a decimal comma, anything else raises.
create function kk.num(v text) returns numeric
language plpgsql immutable set search_path = kk, extensions, pg_temp as $$
begin
  v := btrim(coalesce(v, ''));
  if v = '' then return null; end if;
  v := replace(v, ',', '.');
  if v !~ '^[+-]?(\d+\.?\d*|\.\d+)$' then raise exception 'Số không hợp lệ: %', v; end if;
  return v::numeric;
end $$;

-- One advisory lock per (đợt, kho, drug). Every writer that touches a drug's lot rows takes it first
-- (a_luu now; hoanTac / gopLo reuse it), so two people cannot both replace the same lot at once.
create function kk.khoa_lo(dot_id text, kho text, ma text) returns void
language sql set search_path = kk, extensions, pg_temp as $$
  select pg_advisory_xact_lock(hashtext(dot_id || '|' || kho || '|' || ma));
$$;

-- Like learnGtin_: keep digits only, accept 8..14 of them, append once.
create function kk.hoc_gtin(t kk.thuoc, gtin text) returns void
language plpgsql set search_path = kk, extensions, pg_temp as $$
begin
  gtin := regexp_replace(coalesce(gtin, ''), '\D', '', 'g');
  if length(gtin) < 8 or length(gtin) > 14 then return; end if;
  update kk.thuoc x set gtin = array_append(x.gtin, hoc_gtin.gtin), cap_nhat = now()
   where x.ma = t.ma and not hoc_gtin.gtin = any (x.gtin);
end $$;

-- Appends one line: takes the next number of the đợt (r.so is ignored), returns it. r must have every not-null column set.
create function kk.them_dong(r kk.dong) returns int
language plpgsql set search_path = kk, extensions, pg_temp as $$
begin
  update kk.dot set so_dong = so_dong + 1 where id = r.dot_id returning so_dong into r.so;
  insert into kk.dong select r.*;
  return r.so;
end $$;

-- Like API.luu, CONG_THEM only for now.
create function kk.a_luu(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_tap bool := u.vai_tro = 'TAP';
  kho text; v_ma text; t kk.thuoc; hoc text;
  hop numeric; qc numeric; le numeric; sl numeric;
  lo_in text; hsd_in text; lo text; hsd date;
  tt text; dvt text; v_req text; ex kk.dong;
  cb text[]; r kk.dong;
begin
  kho := kk.kiem_kho(d, req->>'kho');
  v_ma := btrim(coalesce(req->>'ma', ''));
  select * into t from kk.thuoc x where x.ma = v_ma;
  if not found then raise exception 'Mã % không có trong danh mục', v_ma; end if;  -- Task 5: MOI-Mnnn drugs
  perform kk.khoa_lo(d.id, kho, v_ma);

  hoc := kk.hoc_key(req->>'hoc');
  if hoc = '' then raise exception 'Chưa nhập hộc / vị trí'; end if;
  hop := kk.num(req->>'hop'); qc := kk.num(req->>'qc'); le := kk.num(req->>'le');
  if hop is null and le is null then raise exception 'Chưa nhập số lượng'; end if;
  if hop < 0 or qc < 0 or le < 0 then raise exception 'Số lượng không được âm'; end if;
  if hop > 0 and not coalesce(qc, 0) > 0 then raise exception 'Có số hộp thì phải có "1 hộp có mấy"'; end if;
  sl := coalesce(hop, 0) * coalesce(qc, 0) + coalesce(le, 0);

  lo_in := req->>'lo'; hsd_in := req->>'hsd';
  if coalesce((req->>'khongLo')::bool, false) then
    lo_in := coalesce(nullif(btrim((select gia_tri #>> '{}' from kk.cau_hinh where khoa = 'LO_MAC_DINH')), ''), 'KHONGLO');
    hsd_in := coalesce(nullif(btrim((select gia_tri #>> '{}' from kk.cau_hinh where khoa = 'HSD_MAC_DINH')), ''), '31/12/2099');
  end if;
  lo := kk.lo_text(lo_in);
  hsd := case when coalesce(hsd_in, '') <> '' then kk.parse_hsd(hsd_in) end;
  if coalesce(req->>'hsd', '') <> '' and hsd is null then raise exception 'HSD không đúng dạng dd/mm/yyyy'; end if;
  if sl > 0 and (kk.lo_key(lo) = '' or hsd is null) then raise exception 'Có số lượng thì phải có Số lô và HSD'; end if;

  tt := coalesce(nullif(req->>'thaoTac', ''), 'CONG_THEM');
  if not tt = any ('{CONG_THEM,DEM_LAI_HOC,DON_LO}') then raise exception 'Thao tác không hợp lệ'; end if;
  if tt = 'DON_LO' then perform kk.can_vai(u, '{TO_TRUONG,IT}'); end if;
  dvt := btrim(coalesce(nullif(req->>'dvt', ''), t.dvt, ''));
  if dvt = '' then raise exception 'Chưa chọn ĐVT'; end if;
  if tt <> 'CONG_THEM' then raise exception 'Thao tác % chưa được hỗ trợ', tt; end if;  -- Task 5

  -- offline queue resends the same reqId after the server already saved it
  v_req := nullif(req->>'reqId', '');
  if v_req is not null then
    select * into ex from kk.dong x where x.dot_id = d.id and x.tap = v_tap and x.req_id = v_req;
    if found then
      return jsonb_build_object('id', 'D' || lpad(ex.so::text, 5, '0'), 'st', ex.trang_thai, 'trungLap', true,
                                'lines', kk.dong_cua(d.id, v_tap, kho, v_ma));
    end if;
  end if;

  -- Task 5: HSD_KHAC, CUNG_HOC, closed kho and CHO_DUYET go here, before the insert
  cb := kk.canh_bao(t, kho, lo, hsd, hop, qc);
  r.dot_id := d.id; r.tap := v_tap; r.tg := now(); r.kho := kho; r.ma := v_ma; r.ten := t.ten; r.lo := lo; r.hsd := hsd;
  r.hoc := hoc; r.hop := hop; r.qc := qc; r.le := le; r.sl := sl; r.dvt := dvt; r.nguoi := u.ten; r.tk := u.tk;
  r.thao_tac := tt; r.trang_thai := 'HIEU_LUC'; r.req_id := v_req; r.cap_nhat := ''; r.se_thay := '{}';
  r.ghi := concat_ws(' · ', case when coalesce((req->>'khongLo')::bool, false) then 'Hàng không có lô/HSD' end,
                     nullif(btrim(coalesce(nullif(req->>'lyDo', ''), req->>'ghiChu', '')), ''));
  r.canh_bao := array_to_string(cb, '; ');
  r.so := kk.them_dong(r);
  if not v_tap then perform kk.hoc_gtin(t, req->>'gtin'); end if;
  return jsonb_build_object('id', 'D' || lpad(r.so::text, 5, '0'), 'st', r.trang_thai, 'canhBao', to_jsonb(cb),
                            'lines', kk.dong_cua(d.id, v_tap, kho, v_ma));
end $$;
