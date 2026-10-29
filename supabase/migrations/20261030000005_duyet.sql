-- Task 6: undo, drug view, my lines, new-drug proposals, approvals, lot merge.
-- Every writer that touches a lô's rows takes kk.khoa_lo(dot, kho, ma) BEFORE reading them (same lock as a_luu).

-- Like API.hoanTac
create function kk.a_hoantac(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
<<fn>>
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_so int := kk.so_dong(req->>'id');
  r kk.dong; v_restored int;
begin
  -- read kho/ma first (no lock), lock the lô, then re-read under the lock
  select * into r from kk.dong x where x.dot_id = d.id and x.so = v_so and x.tap = v_tap;
  if not found then raise exception 'Không thấy dòng %', req->>'id'; end if;
  perform kk.khoa_lo(d.id, r.kho, r.ma);
  select * into r from kk.dong x where x.dot_id = d.id and x.so = v_so and x.tap = v_tap for update;
  if r.trang_thai not in ('HIEU_LUC', 'CHO_DUYET') then
    raise exception 'Dòng % đang ở trạng thái % – không hoàn tác được', req->>'id', r.trang_thai;
  end if;
  if r.tk <> u.tk and not u.vai_tro in ('TO_TRUONG', 'IT') then raise exception 'Chỉ hoàn tác được dòng của mình'; end if;
  if r.trang_thai = 'HIEU_LUC' and kk.trang_thai_kho(d, r.kho) = 'DA_CHOT' and u.vai_tro <> 'IT' then
    raise exception 'Kho đã chốt – báo IT';
  end if;
  update kk.dong x set trang_thai = 'HUY',
         cap_nhat = to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') || ' huỷ bởi ' || u.tk
   where x.dot_id = d.id and x.so = v_so;
  update kk.dong x set trang_thai = 'HIEU_LUC', thay_boi = null
   where x.dot_id = d.id and x.tap = v_tap and x.trang_thai = 'THAY_THE' and x.thay_boi = v_so;
  get diagnostics v_restored = row_count;
  perform kk.ghi_nhat_ky(u, d.id, 'HOAN_TAC',
    (req->>'id') || case when v_restored > 0 then ' (khôi phục ' || v_restored || ' dòng)' else '' end);
  return jsonb_build_object('restored', v_restored, 'lines', kk.dong_cua(d.id, v_tap, r.kho, r.ma));
end $$;

-- Like API.xemThuoc: this kho's active/pending lines + HIEU_LUC totals of the same drug in other kho
create function kk.a_xemthuoc(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_kho text := kk.kiem_kho(d, req->>'kho');
  v_ma text := coalesce(req->>'ma', '');
begin
  return jsonb_build_object(
    'lines', kk.dong_cua(d.id, v_tap, v_kho, v_ma),
    'khac', coalesce((select jsonb_object_agg(s.kho, s.sl) from (
                select x.kho, sum(x.sl) sl from kk.dong x
                 where x.dot_id = d.id and x.tap = v_tap and x.ma = v_ma and x.kho <> v_kho and x.trang_thai = 'HIEU_LUC'
                 group by x.kho) s), '{}'::jsonb),
    'trangThai', kk.trang_thai_kho(d, v_kho));
end $$;

-- Like API.cuaToi: caller's own newest lines (default 20, at most 100)
create function kk.a_cuatoi(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_n numeric := 20;
  s text := btrim(coalesce(req->>'n', ''));
begin
  if s ~ '^[+-]?(\d+\.?\d*|\.\d+)$' and s::numeric <> 0 then v_n := s::numeric; end if;
  return jsonb_build_object('lines', coalesce((select jsonb_agg(kk.dong_json(x) order by x.so desc) from (
      select * from kk.dong y where y.dot_id = d.id and y.tap = (u.vai_tro = 'TAP') and y.tk = u.tk
       order by y.so desc limit greatest(ceil(least(v_n, 100)), 0)::int) x), '[]'::jsonb));
end $$;

-- Like API.thuocMoi: propose a drug missing from the catalogue, then save the count under MOI-Mnnn
create function kk.a_thuocmoi(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
<<fn>>
declare
  v_kho text := kk.kiem_kho(d, req->>'kho');
  v_ten text; v_ma_dx text; v_dvt text; v_so int; v_temp text; v_old kk.thuoc;
begin
  if u.vai_tro = 'TAP' then return jsonb_build_object('maTam', 'MOI-TAP', 'st', 'CHO_DUYET', 'tap', true); end if;
  v_ten := btrim(coalesce(req->>'ten', ''));
  if length(v_ten) < 3 then raise exception 'Nhập tên thuốc (kèm hàm lượng, quy cách)'; end if;
  v_ma_dx := upper(btrim(coalesce(req->>'maDeXuat', '')));
  select * into v_old from kk.thuoc x where v_ma_dx <> '' and x.ma = v_ma_dx;
  if found then raise exception 'Mã % đã có trong danh mục: % – tìm và chọn thuốc này', v_ma_dx, v_old.ten; end if;
  v_dvt := btrim(coalesce(req->>'dvt', ''));
  if v_dvt = '' then raise exception 'Chọn ĐVT nhỏ nhất'; end if;

  perform pg_advisory_xact_lock(hashtext(d.id || '|thuocMoi'));
  select x.so into v_so from kk.thuoc_moi x
   where x.dot_id = d.id and x.trang_thai = 'CHO_DUYET'
     and ((v_ma_dx <> '' and x.ma_de_xuat = v_ma_dx) or kk.norm_ten(x.ten) = kk.norm_ten(v_ten))
   order by x.so limit 1;
  if not found then
    update kk.dot set so_thuoc_moi = so_thuoc_moi + 1 where id = d.id returning so_thuoc_moi into v_so;
    insert into kk.thuoc_moi (dot_id, so, ma_de_xuat, ten, dvt_nhap, qc_goc, dvt, kho, nguoi, ghi_chu)
    values (d.id, v_so, v_ma_dx, v_ten, coalesce(req->>'dvtn', ''), nullif(kk.num(req->>'qcGoc'), 0), v_dvt, v_kho,
            u.ten || ' (' || u.tk || ')', coalesce(req->>'ghiChu', ''));
    perform kk.ghi_nhat_ky(u, d.id, 'THUOC_MOI', 'M' || lpad(v_so::text, 3, '0') || ' ' || v_ten);
  end if;
  v_temp := 'MOI-M' || lpad(v_so::text, 3, '0');
  return kk.a_luu(u, d, req || jsonb_build_object('ma', v_temp, 'thaoTac', 'CONG_THEM', 'dvt', v_dvt))
         || jsonb_build_object('maTam', v_temp);
end $$;

-- Like API.choDuyet: pending lines (caller's side) + pending drug proposals
create function kk.a_choduyet(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
begin
  perform kk.can_vai(u, '{TO_TRUONG,IT}');
  return jsonb_build_object(
    'dong', coalesce((select jsonb_agg(kk.dong_json(x) order by x.so) from kk.dong x
                       where x.dot_id = d.id and x.tap = (u.vai_tro = 'TAP') and x.trang_thai = 'CHO_DUYET'), '[]'::jsonb),
    'thuocMoi', coalesce((select jsonb_agg(jsonb_build_object(
        'id', 'M' || lpad(m.so::text, 3, '0'),
        'tg', to_char(m.tg at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'),
        'maDeXuat', m.ma_de_xuat, 'ten', m.ten, 'dvtn', m.dvt_nhap,
        'qc', coalesce(to_jsonb(m.qc_goc), '""'::jsonb), 'dvt', m.dvt, 'kho', m.kho, 'nguoi', m.nguoi, 'ghi', m.ghi_chu)
        order by m.so) from kk.thuoc_moi m where m.dot_id = d.id and m.trang_thai = 'CHO_DUYET'), '[]'::jsonb));
end $$;

-- Like API.duyetDong
create function kk.a_duyetdong(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
<<fn>>
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_so int; r kk.dong; bad text;
  v_now text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI');
begin
  perform kk.can_vai(u, '{IT}');
  v_so := kk.so_dong(req->>'id');
  select * into r from kk.dong x where x.dot_id = d.id and x.so = v_so and x.tap = v_tap;
  if not found then raise exception 'Dòng % không ở trạng thái chờ duyệt', req->>'id'; end if;
  perform kk.khoa_lo(d.id, r.kho, r.ma);
  select * into r from kk.dong x where x.dot_id = d.id and x.so = v_so and x.tap = v_tap for update;
  if r.trang_thai <> 'CHO_DUYET' then raise exception 'Dòng % không ở trạng thái chờ duyệt', req->>'id'; end if;
  if r.ma like 'MOI-%' then raise exception 'Dòng thuốc mới – duyệt ở mục Thuốc chưa có danh mục'; end if;
  if not coalesce((req->>'chapNhan')::bool, false) then
    update kk.dong x set trang_thai = 'TU_CHOI', cap_nhat = v_now || ' từ chối bởi ' || u.tk where x.dot_id = d.id and x.so = v_so;
    perform kk.ghi_nhat_ky(u, d.id, 'TU_CHOI', req->>'id');
    return '{}'::jsonb;
  end if;
  select string_agg('D' || lpad(t::text, 5, '0'), ', ' order by ord) into bad
    from unnest(r.se_thay) with ordinality as a(t, ord)
   where not exists (select 1 from kk.dong y where y.dot_id = d.id and y.tap = v_tap and y.so = a.t and y.trang_thai = 'HIEU_LUC');
  if bad is not null then
    raise exception 'Các dòng % đã thay đổi sau khi gửi phiếu – từ chối phiếu này và nhập lại', bad;
  end if;
  update kk.dong x set trang_thai = 'HIEU_LUC', cap_nhat = v_now || ' duyệt bởi ' || u.tk where x.dot_id = d.id and x.so = v_so;
  perform kk.danh_dau_thay(d.id, t, v_so, u) from unnest(r.se_thay) t;
  perform kk.ghi_nhat_ky(u, d.id, 'DUYET', req->>'id');
  return '{}'::jsonb;
end $$;

-- Like API.duyetThuocMoi
create function kk.a_duyetthuocmoi(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
<<fn>>
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_id text := coalesce(req->>'id', '');
  v_so int; m kk.thuoc_moi; v_temp text; v_ma text; t kk.thuoc; p record;
  v_now text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI');
  v_chap bool := coalesce((req->>'chapNhan')::bool, false);
begin
  perform kk.can_vai(u, '{IT}');
  if v_id !~ '^M\d+$' then raise exception 'Không thấy đề xuất % đang chờ', v_id; end if;
  v_so := substr(v_id, 2)::int;
  select * into m from kk.thuoc_moi x where x.dot_id = d.id and x.so = v_so and x.trang_thai = 'CHO_DUYET' for update;
  if not found then raise exception 'Không thấy đề xuất % đang chờ', v_id; end if;
  v_temp := 'MOI-M' || lpad(v_so::text, 3, '0');
  v_ma := upper(btrim(coalesce(req->>'ma', '')));
  if v_chap and v_ma = '' then raise exception 'Nhập mã iSOFH chính thức'; end if;

  -- lock every affected (kho, drug): the temporary code and, on accept, the official code, in one sorted order
  for p in select distinct x.kho, c.ma from kk.dong x
             cross join (select v_temp as ma union select v_ma where v_chap) c
            where x.dot_id = d.id and x.tap = v_tap and x.ma = v_temp and x.trang_thai = 'CHO_DUYET'
            order by 1, 2 loop
    perform kk.khoa_lo(d.id, p.kho, p.ma);
  end loop;

  if not v_chap then
    update kk.thuoc_moi x set trang_thai = 'TU_CHOI' where x.dot_id = d.id and x.so = v_so;
    update kk.dong x set trang_thai = 'TU_CHOI'
     where x.dot_id = d.id and x.tap = v_tap and x.ma = v_temp and x.trang_thai = 'CHO_DUYET';
    perform kk.ghi_nhat_ky(u, d.id, 'TU_CHOI_THUOC_MOI', v_id);
    return '{}'::jsonb;
  end if;

  insert into kk.thuoc (ma, ten, dvt_nhap, quy_cach, dvt, nguon)
  values (v_ma, coalesce(nullif(req->>'ten', ''), m.ten), coalesce(nullif(req->>'dvtn', ''), m.dvt_nhap),
          nullif(case when req->>'qc' is not null then kk.num(req->>'qc') else m.qc_goc end, 0),
          coalesce(nullif(req->>'dvt', ''), m.dvt), 'MOI ' || v_id)
  on conflict (ma) do nothing;
  select * into t from kk.thuoc x where x.ma = v_ma;

  update kk.dong x set ma = v_ma, ten = t.ten, trang_thai = 'HIEU_LUC',
         cap_nhat = v_now || ' duyệt mã ' || v_ma || ' bởi ' || u.tk
   where x.dot_id = d.id and x.tap = v_tap and x.ma = v_temp and x.trang_thai = 'CHO_DUYET';
  update kk.thuoc_moi x set trang_thai = 'DA_DUYET', ma_chinh_thuc = v_ma where x.dot_id = d.id and x.so = v_so;
  perform kk.ghi_nhat_ky(u, d.id, 'DUYET_THUOC_MOI', v_id || ' → ' || v_ma);
  return jsonb_build_object('ma', v_ma);
end $$;

-- Like API.gopLo: copy the dropped lô's lines onto the kept lô text/HSD, then mark the originals replaced
create function kk.a_goplo(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
<<fn>>
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_kho text; v_ma text := coalesce(req->>'ma', '');
  v_giu text := kk.lo_key(req->>'loGiu'); v_bo text := kk.lo_key(req->>'loBo');
  giu_rows kk.dong[]; bo_rows kk.dong[]; x kk.dong; nr kk.dong; v_new int;
begin
  perform kk.can_vai(u, '{IT}');
  v_kho := kk.kiem_kho(d, req->>'kho');
  if v_giu = '' or v_bo = '' or v_giu = v_bo then raise exception 'Chọn 2 lô khác nhau'; end if;
  perform kk.khoa_lo(d.id, v_kho, v_ma);
  giu_rows := array(select y from kk.dong y where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho and y.ma = v_ma
                      and y.trang_thai = 'HIEU_LUC' and kk.lo_key(y.lo) = v_giu order by y.so);
  bo_rows := array(select y from kk.dong y where y.dot_id = d.id and y.tap = v_tap and y.kho = v_kho and y.ma = v_ma
                     and y.trang_thai = 'HIEU_LUC' and kk.lo_key(y.lo) = v_bo order by y.so);
  if cardinality(giu_rows) = 0 or cardinality(bo_rows) = 0 then raise exception 'Không thấy đủ 2 lô đang hiệu lực'; end if;
  foreach x in array bo_rows loop
    nr := x;
    nr.tg := now(); nr.lo := giu_rows[1].lo; nr.hsd := giu_rows[1].hsd; nr.thao_tac := 'GOP_LO'; nr.trang_thai := 'HIEU_LUC';
    nr.thay_boi := null; nr.ghi := 'Gộp từ lô ' || x.lo || ' (D' || lpad(x.so::text, 5, '0') || ') bởi ' || u.ten;
    nr.req_id := null; nr.cap_nhat := ''; nr.se_thay := '{}';
    v_new := kk.them_dong(nr);
    perform kk.danh_dau_thay(d.id, x.so, v_new, u);
  end loop;
  perform kk.ghi_nhat_ky(u, d.id, 'GOP_LO', v_kho || ' ' || v_ma || ': ' || (req->>'loBo') || ' → ' || (req->>'loGiu'));
  return jsonb_build_object('lines', kk.dong_cua(d.id, v_tap, v_kho, v_ma));
end $$;
