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
-- Unlike legacy, a GTIN already attached to another drug is not learned (IT fixes shared barcodes in Danh mục).
create function kk.hoc_gtin(t kk.thuoc, gtin text) returns void
language plpgsql set search_path = kk, extensions, pg_temp as $$
begin
  gtin := regexp_replace(coalesce(gtin, ''), '\D', '', 'g');
  if length(gtin) < 8 or length(gtin) > 14 then return; end if;
  update kk.thuoc x set gtin = array_append(x.gtin, hoc_gtin.gtin), cap_nhat = now()
   where x.ma = t.ma and not hoc_gtin.gtin = any (x.gtin)
     and not exists (select 1 from kk.thuoc y where y.ma <> t.ma and hoc_gtin.gtin = any (y.gtin));
end $$;

-- Like markReplaced_
create function kk.danh_dau_thay(dot_id text, so int, boi int, u kk.tai_khoan) returns void
language sql set search_path = kk, extensions, pg_temp as $$
  update kk.dong x set trang_thai = 'THAY_THE', thay_boi = boi,
         cap_nhat = to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') || ' ' || u.tk
   where x.dot_id = danh_dau_thay.dot_id and x.so = danh_dau_thay.so;
$$;

-- Appends one line: takes the next number of the đợt (r.so is ignored), returns it. r must have every not-null column set.
create function kk.them_dong(r kk.dong) returns int
language plpgsql set search_path = kk, extensions, pg_temp as $$
begin
  update kk.dot set so_dong = so_dong + 1 where id = r.dot_id returning so_dong into r.so;
  insert into kk.dong select r.*;
  return r.so;
end $$;

-- Like API.luu. thaoTac: CONG_THEM | DEM_LAI_HOC | DON_LO
create function kk.a_luu(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
<<fn>>
declare
  v_tap bool := u.vai_tro = 'TAP';
  kho text; v_ma text; t kk.thuoc; hoc text;
  hop numeric; qc numeric; le numeric; sl numeric;
  lo_in text; hsd_in text; lo text; hsd date;
  tt text; dvt text; v_req text; ex kk.dong;
  cb text[]; r kk.dong; tm kk.thuoc_moi;
  lot kk.dong[]; targets kk.dong[] := '{}'; hsd_cu text[]; v_hoc_cu kk.dong[];
  ly_do text := btrim(coalesce(req->>'lyDo', ''));
  chot bool;
begin
  kho := kk.kiem_kho(d, req->>'kho');
  v_ma := btrim(coalesce(req->>'ma', ''));
  -- offline resend of a line already saved: answer from that line even if the drug code changed since
  -- (IT approved the MOI-Mnnn proposal, so the line now carries the official code)
  v_req := nullif(req->>'reqId', '');
  if v_req is not null then
    select * into ex from kk.dong x where x.dot_id = d.id and x.req_id = v_req;
    if found then
      if ex.tk = u.tk and ex.kho = kho and (ex.ma = v_ma or exists (
           select 1 from kk.thuoc_moi m where m.dot_id = d.id and 'MOI-M' || lpad(m.so::text, 3, '0') = v_ma
              and m.trang_thai = 'DA_DUYET' and m.ma_chinh_thuc = ex.ma)) then
        return jsonb_build_object('id', 'D' || lpad(ex.so::text, 5, '0'), 'st', ex.trang_thai, 'trungLap', true,
                                  'lines', kk.dong_cua(d.id, v_tap, ex.kho, ex.ma));
      end if;
      raise exception 'Mã yêu cầu bị trùng – tải lại trang rồi lưu lại';
    end if;
  end if;
  select * into t from kk.thuoc x where x.ma = v_ma;
  if not found then
    -- new drug still waiting for IT: temporary code MOI-Mnnn.
    -- "for share" meets the row lock a_duyetthuocmoi takes, so a count is never saved against a proposal being approved
    -- (after the approval commits the CHO_DUYET condition fails and the code is unknown). Lock order: proposal row, then khoa_lo.
    select * into tm from kk.thuoc_moi x
     where x.dot_id = d.id and 'MOI-M' || lpad(x.so::text, 3, '0') = v_ma and x.trang_thai = 'CHO_DUYET' for share;
    if not found then raise exception 'Mã % không có trong danh mục', v_ma; end if;
  end if;
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

  -- offline queue resends the same reqId after the server already saved it
  if v_req is not null then
    select * into ex from kk.dong x where x.dot_id = d.id and x.req_id = v_req;
    if found then
      if (ex.tk, ex.kho, ex.ma) is distinct from (u.tk, kho, v_ma) then
        raise exception 'Mã yêu cầu bị trùng – tải lại trang rồi lưu lại';
      end if;
      return jsonb_build_object('id', 'D' || lpad(ex.so::text, 5, '0'), 'st', ex.trang_thai, 'trungLap', true,
                                'lines', kk.dong_cua(d.id, v_tap, kho, v_ma));
    end if;
  end if;

  lot := array(select x from kk.dong x
                 where x.dot_id = d.id and x.tap = v_tap and x.kho = fn.kho and x.ma = v_ma
                   and kk.lo_key(x.lo) = kk.lo_key(fn.lo) and x.trang_thai = 'HIEU_LUC' order by x.so);

  -- HSD differs from the lô's existing lines
  hsd_cu := array(select h from (select to_char(x.hsd, 'DD/MM/YYYY') h, min(x.so) m from unnest(lot) x
                                 where x.hsd is not null group by 1) y order by m);
  if hsd is not null and cardinality(hsd_cu) > 0 and not to_char(hsd, 'DD/MM/YYYY') = any (hsd_cu)
     and not coalesce((req->>'okHsd')::bool, false) then
    return jsonb_build_object('ok', false, 'need', 'HSD_KHAC', 'hsdCu', to_jsonb(hsd_cu),
                              'error', 'Lô ' || lo || ' đã ghi HSD ' || array_to_string(hsd_cu, ', '));
  end if;

  if tt = 'CONG_THEM' then
    v_hoc_cu := array(select x from unnest(lot) x where x.hoc = fn.hoc and x.tk <> u.tk);
    if cardinality(v_hoc_cu) > 0 and not coalesce((req->>'okCungHoc')::bool, false) then
      return jsonb_build_object('ok', false, 'need', 'CUNG_HOC',
        'lines', (select jsonb_agg(kk.dong_json(x) order by x.so) from unnest(v_hoc_cu) x),
        'error', 'Hộc ' || hoc || ' đã có ' || (select string_agg(x.nguoi, ', ' order by x.so) from unnest(v_hoc_cu) x) || ' đếm lô này');
    end if;
  else
    -- someone else changed this lô since the screen loaded? (seen = line ids the phone saw)
    if req ? 'seen' and jsonb_typeof(req->'seen') <> 'null' and req->'seen' not in ('false', '""', '0') then
      if array(select 'D' || lpad(x.so::text, 5, '0') from unnest(lot) x order by 1)
         is distinct from
         array(select v from jsonb_array_elements_text(case jsonb_typeof(req->'seen') when 'array' then req->'seen'
                                                            else jsonb_build_array(req->'seen') end) v order by 1) then
        return jsonb_build_object('ok', false, 'conflict', true, 'lines', kk.dong_cua(d.id, v_tap, kho, v_ma),
                                  'error', 'Vừa có người cập nhật lô này – xem lại số mới rồi lưu lại');
      end if;
    end if;
    targets := case when tt = 'DEM_LAI_HOC' then array(select x from unnest(lot) x where x.hoc = fn.hoc order by x.so)
                    else lot end;
    if cardinality(targets) = 0 then
      if tt = 'DEM_LAI_HOC' then raise exception 'Hộc % chưa có dòng nào của lô này – dùng "Cộng thêm"', hoc; end if;
      raise exception 'Lô này chưa có dòng nào để dồn';
    end if;
    if tt = 'DEM_LAI_HOC' and not u.vai_tro = any ('{TO_TRUONG,IT}') and exists (select 1 from unnest(targets) x where x.tk <> u.tk) then
      raise exception 'Hộc này do % đếm – chỉ người đó hoặc tổ trưởng được đếm lại',
        (select string_agg(x.nguoi, ', ' order by x.so) from unnest(targets) x);
    end if;
    if tt = 'DON_LO' and ly_do = '' then raise exception 'Dồn cả lô cần ghi lý do'; end if;
  end if;

  chot := kk.trang_thai_kho(d, kho) = 'DA_CHOT';
  if chot and ly_do = '' then
    raise exception '% đã chốt – ghi lý do bổ sung để IT duyệt', (select k.ten from kk.kho k where k.ma = fn.kho);
  end if;

  cb := kk.canh_bao(t, kho, lo, hsd, hop, qc);
  r.dot_id := d.id; r.tap := v_tap; r.tg := now(); r.kho := kho; r.ma := v_ma; r.ten := coalesce(t.ten, tm.ten); r.lo := lo; r.hsd := hsd;
  r.hoc := hoc; r.hop := hop; r.qc := qc; r.le := le; r.sl := sl; r.dvt := dvt; r.nguoi := u.ten; r.tk := u.tk;
  r.thao_tac := case when chot then 'BO_SUNG_' || tt else tt end;
  r.trang_thai := case when chot or t.ma is null then 'CHO_DUYET' else 'HIEU_LUC' end;
  r.req_id := v_req; r.cap_nhat := '';
  r.se_thay := case when r.trang_thai = 'CHO_DUYET' then array(select x.so from unnest(targets) x) else '{}' end;
  r.ghi := concat_ws(' · ', case when coalesce((req->>'khongLo')::bool, false) then 'Hàng không có lô/HSD' end,
                     nullif(btrim(coalesce(nullif(req->>'lyDo', ''), req->>'ghiChu', '')), ''));
  r.canh_bao := array_to_string(cb, '; ');
  r.so := kk.them_dong(r);
  if r.trang_thai = 'HIEU_LUC' then
    perform kk.danh_dau_thay(d.id, x.so, r.so, u) from unnest(targets) x;
  end if;
  if not v_tap and t.ma is not null then perform kk.hoc_gtin(t, req->>'gtin'); end if;
  return jsonb_build_object('id', 'D' || lpad(r.so::text, 5, '0'), 'st', r.trang_thai, 'canhBao', to_jsonb(cb),
                            'lines', kk.dong_cua(d.id, v_tap, kho, v_ma));
end $$;
