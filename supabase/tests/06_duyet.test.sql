begin;
select plan(93);

-- helpers: base request on DOT01 / CHAN / TT-0001 (TK04 by default), overrides merged on top
create function pg_temp.api(act text, extra jsonb default '{}', pin text default '444444') returns jsonb language sql as $$
  select public.api(jsonb_build_object('action', act, 'pin', pin, 'dot', 'DOT01', 'kho', 'CHAN', 'ma', 'TT-0001') || extra);
$$;
create function pg_temp.luu(extra jsonb, pin text default '444444') returns jsonb language sql as $$
  select pg_temp.api('luu', extra, pin);
$$;
-- line id of the newest row matching lô + hộc
create function pg_temp.id_cua(p_lo text, p_hoc text) returns text language sql as $$
  select 'D' || lpad(max(so)::text, 5, '0') from kk.dong where dot_id = 'DOT01' and lo = p_lo and hoc = p_hoc;
$$;
create function pg_temp.st(id text) returns text language sql as $$
  select trang_thai from kk.dong where dot_id = 'DOT01' and so = substr(id, 2)::int;
$$;
create function pg_temp.cn(id text) returns text language sql as $$
  select cap_nhat from kk.dong where dot_id = 'DOT01' and so = substr(id, 2)::int;
$$;

-- ---------------------------------------------------------------- hoanTac
select pg_temp.luu('{"hoc":"a 1","le":5,"lo":"a1","hsd":"15/03/2027"}');
create temp table h_cu as select pg_temp.id_cua('A1', 'A 1') as id;
create temp table h_moi as
  select pg_temp.luu('{"hoc":"a 1","le":7,"lo":"a1","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC"}')->>'id' as id;
create temp table r_ht as select pg_temp.api('hoantac', jsonb_build_object('id', (select id from h_moi))) as j;
select is((select j->'restored' from r_ht), '1'::jsonb, 'hoan_tac_khoi_phuc_restored');
select is(pg_temp.st((select id from h_moi)), 'HUY', 'hoan_tac_khoi_phuc_dong_moi_huy');
select results_eq($$select pg_temp.st((select id from h_cu)), (select thay_boi from kk.dong where so = substr((select id from h_cu), 2)::int)$$,
  $$select 'HIEU_LUC'::text, null::int$$, 'hoan_tac_khoi_phuc_dong_cu_hieu_luc');
select is(pg_temp.cn((select id from h_moi)) like '__/__ __:__ huỷ bởi TK04', true, 'hoan_tac_cap_nhat');
select is((select jsonb_agg(x->>'id') from r_ht, jsonb_array_elements(j->'lines') x where x->>'lo' = 'A1'),
  jsonb_build_array((select id from h_cu)), 'hoan_tac_lines');
select is(pg_temp.api('hoantac', jsonb_build_object('id', (select id from h_moi)))->>'error',
  'Dòng ' || (select id from h_moi) || ' đang ở trạng thái HUY – không hoàn tác được', 'hoan_tac_dong_da_huy');
select is(pg_temp.api('hoantac', '{"id":"D99999"}')->>'error', 'Không thấy dòng D99999', 'hoan_tac_khong_thay');

-- someone else's line: refused for DEM, allowed for TO_TRUONG
select pg_temp.luu('{"hoc":"b 1","le":5,"lo":"b1","hsd":"15/03/2027"}');
create temp table b_id as select pg_temp.id_cua('B1', 'B 1') as id;
select is(pg_temp.api('hoantac', jsonb_build_object('id', (select id from b_id)), '555555')->>'error',
  'Chỉ hoàn tác được dòng của mình', 'hoan_tac_dong_nguoi_khac');
select is(pg_temp.api('hoantac', jsonb_build_object('id', (select id from b_id)), '222222')->'restored', '0'::jsonb, 'hoan_tac_to_truong_duoc');
select is(pg_temp.st((select id from b_id)), 'HUY', 'hoan_tac_to_truong_dong_huy');

-- ---------------------------------------------------------------- xemThuoc
select pg_temp.luu('{"ma":"TT-0009","hoc":"x 1","le":5,"lo":"x1","hsd":"15/03/2027"}');
select pg_temp.luu('{"ma":"TT-0009","hoc":"x 2","le":6,"lo":"x2","hsd":"15/03/2027"}');
select pg_temp.luu('{"ma":"TT-0009","kho":"LE","hoc":"x 3","le":4,"lo":"x3","hsd":"15/03/2027"}');
select pg_temp.luu('{"ma":"TT-0009","kho":"LE","hoc":"x 4","le":3,"lo":"x4","hsd":"15/03/2027"}');
create temp table r_xem as select pg_temp.api('xemthuoc', '{"ma":"TT-0009"}') as j;
select is((select j->'khac' from r_xem), '{"LE":7}'::jsonb, 'xem_thuoc_kho_khac');
select is((select jsonb_array_length(j->'lines') from r_xem), 2, 'xem_thuoc_lines_kho_nay');
select is((select j->>'trangThai' from r_xem), 'DANG_KIEM', 'xem_thuoc_trang_thai');
select is(pg_temp.api('xemthuoc', '{"ma":"TT-0009","kho":"LE"}')->'khac', '{"CHAN":11}'::jsonb, 'xem_thuoc_kho_le');
select is(pg_temp.api('xemthuoc', '{"ma":"TT-0009","kho":"XX"}')->>'error', 'Chưa chọn kho', 'xem_thuoc_kho_la');

-- ---------------------------------------------------------------- cuaToi
select pg_temp.luu(jsonb_build_object('hoc', 'n ' || i, 'le', 1, 'lo', 'nn', 'hsd', '15/03/2027')) from generate_series(1, 105) i;
create temp table r_ct as select pg_temp.api('cuatoi', '{"n":500}') as j;
select is((select jsonb_array_length(j->'lines') from r_ct), 100, 'cua_toi_gioi_han');
select is((select j->'lines'->0->>'id' from r_ct), pg_temp.id_cua('NN', 'N 105'), 'cua_toi_moi_nhat_truoc');
select is((select j->'lines'->99->>'id' from r_ct), pg_temp.id_cua('NN', 'N 6'), 'cua_toi_dong_thu_100');
select is(jsonb_array_length(pg_temp.api('cuatoi')->'lines'), 20, 'cua_toi_mac_dinh_20');
select is(jsonb_array_length(pg_temp.api('cuatoi', '{"n":3}')->'lines'), 3, 'cua_toi_n_3');

-- the TAP account's rows stay on its own side
select pg_temp.luu('{"hoc":"t 1","le":9,"lo":"tp","hsd":"15/03/2027"}', '999999');
select is((select tap from kk.dong where lo = 'TP'), true, 'cua_toi_tap_dong_ghi_rieng');
select is((select count(*)::int from jsonb_array_elements(pg_temp.api('cuatoi', '{"n":100}')->'lines') x where x->>'lo' = 'TP'), 0,
  'cua_toi_khong_thay_tap');
select is(pg_temp.api('cuatoi', '{"n":100}', '999999')->'lines'->0->>'lo', 'TP', 'cua_toi_tap_thay_dong_cua_minh');
select is(jsonb_array_length(pg_temp.api('cuatoi', '{"n":100}', '999999')->'lines'), 1, 'cua_toi_tap_khong_thay_dong_that');

-- ---------------------------------------------------------------- thuocMoi
create temp table r_tm1 as select pg_temp.api('thuocmoi',
  '{"ten":"Paracetamol  500 MG","dvt":"Viên","dvtn":"Hộp","qcGoc":100,"hoc":"m 1","le":2,"lo":"m1","hsd":"15/03/2027"}') as j;
select is((select j->>'maTam' from r_tm1), 'MOI-M001', 'thuoc_moi_ma_tam');
select is((select j->>'st' from r_tm1), 'CHO_DUYET', 'thuoc_moi_dong_cho_duyet');
select results_eq($$select ten, dvt_nhap, qc_goc, dvt, kho, nguoi, trang_thai from kk.thuoc_moi where so = 1$$,
  $$values ('Paracetamol  500 MG', 'Hộp', 100::numeric, 'Viên', 'CHAN', 'Người đếm 4 (TK04)', 'CHO_DUYET')$$, 'thuoc_moi_ghi_de_xuat');
select is((select so_thuoc_moi from kk.dot where id = 'DOT01'), 1, 'thuoc_moi_so_tu_dot');
select is(pg_temp.api('thuocmoi', '{"ten":"paracetamol 500 mg","dvt":"Viên","hoc":"m 2","le":1,"lo":"m2","hsd":"15/03/2027"}', '555555')->>'maTam',
  'MOI-M001', 'thuoc_moi_trung_ten');
select is((select count(*)::int from kk.thuoc_moi), 1, 'thuoc_moi_trung_ten_khong_them_de_xuat');
select is((select count(*)::int from kk.dong where ma = 'MOI-M001'), 2, 'thuoc_moi_trung_ten_van_ghi_dong');
select pg_temp.api('thuocmoi', '{"ten":"Thuốc lạ khác","maDeXuat":"xx-1","dvt":"Viên","hoc":"m 3","le":1,"lo":"m3","hsd":"15/03/2027"}');
select is(pg_temp.api('thuocmoi', '{"ten":"Tên khác hẳn","maDeXuat":"XX-1","dvt":"Viên","hoc":"m 4","le":1,"lo":"m4","hsd":"15/03/2027"}')->>'maTam',
  'MOI-M002', 'thuoc_moi_trung_ma_de_xuat');
select is((select ma_de_xuat from kk.thuoc_moi where so = 2), 'XX-1', 'thuoc_moi_ma_de_xuat_viet_hoa');
select is(pg_temp.api('thuocmoi', '{"ten":"ab","dvt":"Viên"}')->>'error', 'Nhập tên thuốc (kèm hàm lượng, quy cách)', 'thuoc_moi_ten_ngan');
select is(pg_temp.api('thuocmoi', '{"ten":"Thuốc abc","maDeXuat":"tt-0001","dvt":"Viên"}')->>'error',
  'Mã TT-0001 đã có trong danh mục: Paracetamol 500mg – tìm và chọn thuốc này', 'thuoc_moi_ma_da_co');
select is(pg_temp.api('thuocmoi', '{"ten":"Thuốc abc"}')->>'error', 'Chọn ĐVT nhỏ nhất', 'thuoc_moi_thieu_dvt');
select is((select count(*)::int from kk.thuoc_moi), 2, 'thuoc_moi_loi_khong_ghi');

create temp table r_tap as select pg_temp.api('thuocmoi', '{"ten":"Thuốc tập 10mg","dvt":"Viên"}', '999999') as j;
select is((select j from r_tap), '{"ok":true,"maTam":"MOI-TAP","st":"CHO_DUYET","tap":true}'::jsonb, 'thuoc_moi_tap');
select is((select count(*)::int from kk.thuoc_moi), 2, 'thuoc_moi_tap_khong_ghi');

-- ---------------------------------------------------------------- choDuyet (new drugs)
create temp table r_cd as select pg_temp.api('choduyet', '{}', '111111') as j;
select is((select jsonb_array_length(j->'thuocMoi') from r_cd), 2, 'cho_duyet_thuoc_moi_so_luong');
select is((select array_agg(k order by k) from r_cd, jsonb_object_keys(j->'thuocMoi'->0) k),
  array['dvt', 'dvtn', 'ghi', 'id', 'kho', 'maDeXuat', 'nguoi', 'qc', 'ten', 'tg'], 'cho_duyet_thuoc_moi_khoa');
select is((select j->'thuocMoi'->0->>'id' from r_cd), 'M001', 'cho_duyet_thuoc_moi_id');
select is((select j->'thuocMoi'->0->'qc' from r_cd), '100'::jsonb, 'cho_duyet_qc_co_so');
select is((select j->'thuocMoi'->1->'qc' from r_cd), '""'::jsonb, 'cho_duyet_qc_rong');
select is((select jsonb_array_length(j->'dong') from r_cd), 4, 'cho_duyet_dong');
select is(pg_temp.api('choduyet')->>'error', 'Tài khoản Người đếm 4 không có quyền này', 'cho_duyet_can_quyen');
select is(pg_temp.api('duyetdong', jsonb_build_object('id', pg_temp.id_cua('M1', 'M 1'), 'chapNhan', true), '111111')->>'error',
  'Dòng thuốc mới – duyệt ở mục Thuốc chưa có danh mục', 'duyet_dong_dong_thuoc_moi');

-- ---------------------------------------------------------------- closed kho (LE): duyetDong, hoanTac
select pg_temp.luu('{"kho":"LE","hoc":"d 1","le":5,"lo":"dd","hsd":"15/03/2027"}');
select pg_temp.luu('{"kho":"LE","hoc":"f 1","le":5,"lo":"df","hsd":"15/03/2027"}');
select pg_temp.luu('{"kho":"LE","hoc":"k 1","le":5,"lo":"dk","hsd":"15/03/2027"}');
create temp table d_cu as select pg_temp.id_cua('DD', 'D 1') as id;
create temp table f_cu as select pg_temp.id_cua('DF', 'F 1') as id;
create temp table k_id as select pg_temp.id_cua('DK', 'K 1') as id;
update kk.dot_kho set trang_thai = 'DA_CHOT' where dot_id = 'DOT01' and kho = 'LE';
create temp table d_moi as
  select pg_temp.luu('{"kho":"LE","hoc":"d 1","le":6,"lo":"dd","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC","lyDo":"sót"}')->>'id' as id;
create temp table f_moi as
  select pg_temp.luu('{"kho":"LE","hoc":"f 1","le":6,"lo":"df","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC","lyDo":"sót"}')->>'id' as id;
create temp table t_moi as
  select pg_temp.luu('{"kho":"LE","hoc":"t 2","le":1,"lo":"dt","hsd":"15/03/2027","lyDo":"sót"}')->>'id' as id;

select is(pg_temp.api('hoantac', jsonb_build_object('id', (select id from k_id)), '222222')->>'error', 'Kho đã chốt – báo IT', 'hoan_tac_kho_chot');
select is(pg_temp.api('hoantac', jsonb_build_object('id', (select id from k_id)), '111111')->'restored', '0'::jsonb, 'hoan_tac_kho_chot_it_duoc');
select is(pg_temp.api('hoantac', jsonb_build_object('id', (select id from t_moi), 'kho', 'LE'))->'restored', '0'::jsonb, 'hoan_tac_dong_cho_duyet_cua_minh');

select is(pg_temp.api('duyetdong', jsonb_build_object('id', (select id from f_moi), 'chapNhan', false), '222222')->>'error',
  'Tài khoản Tổ trưởng 1 không có quyền này', 'duyet_dong_can_it');
select is(pg_temp.api('duyetdong', jsonb_build_object('id', (select id from f_cu), 'chapNhan', true), '111111')->>'error',
  'Dòng ' || (select id from f_cu) || ' không ở trạng thái chờ duyệt', 'duyet_dong_khong_cho_duyet');
-- an older line changed after the slip was sent
update kk.dong set trang_thai = 'HUY' where so = substr((select id from f_cu), 2)::int;
select is(pg_temp.api('duyetdong', jsonb_build_object('id', (select id from f_moi), 'chapNhan', true), '111111')->>'error',
  'Các dòng ' || (select id from f_cu) || ' đã thay đổi sau khi gửi phiếu – từ chối phiếu này và nhập lại', 'duyet_dong_dong_cu_doi');
select is(pg_temp.st((select id from f_moi)), 'CHO_DUYET', 'duyet_dong_dong_cu_doi_giu_cho_duyet');
-- reject
select is(pg_temp.api('duyetdong', jsonb_build_object('id', (select id from f_moi), 'chapNhan', false), '111111'), '{"ok":true}'::jsonb, 'duyet_dong_tu_choi');
select is(pg_temp.st((select id from f_moi)), 'TU_CHOI', 'duyet_dong_tu_choi_st');
select is(pg_temp.cn((select id from f_moi)) like '__/__ __:__ từ chối bởi TK01', true, 'duyet_dong_tu_choi_cap_nhat');
-- accept
select is(pg_temp.api('duyetdong', jsonb_build_object('id', (select id from d_moi), 'chapNhan', true), '111111'), '{"ok":true}'::jsonb, 'duyet_dong_chap_nhan');
select results_eq($$select pg_temp.st((select id from d_moi)), pg_temp.st((select id from d_cu)),
    (select 'D' || lpad(thay_boi::text, 5, '0') from kk.dong where so = substr((select id from d_cu), 2)::int)$$,
  $$select 'HIEU_LUC'::text, 'THAY_THE'::text, (select id from d_moi)$$, 'duyet_dong_chap_nhan_thay_dong_cu');
select is(pg_temp.cn((select id from d_moi)) like '__/__ __:__ duyệt bởi TK01', true, 'duyet_dong_chap_nhan_cap_nhat');
select is(pg_temp.api('duyetdong', jsonb_build_object('id', (select id from d_moi), 'chapNhan', true), '111111')->>'error',
  'Dòng ' || (select id from d_moi) || ' không ở trạng thái chờ duyệt', 'duyet_dong_hai_lan');

-- ---------------------------------------------------------------- duyetThuocMoi
create temp table m1_dong as select so from kk.dong where ma = 'MOI-M001';
select is(pg_temp.api('duyetthuocmoi', '{"id":"M001","chapNhan":true,"ma":""}', '111111')->>'error', 'Nhập mã iSOFH chính thức', 'duyet_thuoc_moi_thieu_ma');
select is(pg_temp.api('duyetthuocmoi', '{"id":"M001","chapNhan":true,"ma":"tt-0100"}')->>'error', 'Tài khoản Người đếm 4 không có quyền này', 'duyet_thuoc_moi_can_it');
select is(pg_temp.api('duyetthuocmoi', '{"id":"M999","chapNhan":true,"ma":"tt-0100"}', '111111')->>'error', 'Không thấy đề xuất M999 đang chờ', 'duyet_thuoc_moi_khong_thay');
select is(pg_temp.api('duyetthuocmoi', '{"id":"M001","chapNhan":true,"ma":"tt-0100"}', '111111'), '{"ok":true,"ma":"TT-0100"}'::jsonb, 'duyet_thuoc_moi');
select results_eq($$select ten, dvt_nhap, quy_cach, dvt, kho_mac_dinh, nguon from kk.thuoc where ma = 'TT-0100'$$,
  $$values ('Paracetamol  500 MG', 'Hộp', 100::numeric, 'Viên', null::text, 'MOI M001')$$, 'duyet_thuoc_moi_them_vao_danh_muc');
select results_eq($$select ma, ten, trang_thai, cap_nhat like '__/__ __:__ duyệt mã TT-0100 bởi TK01' from kk.dong where so in (select so from m1_dong) order by so$$,
  $$values ('TT-0100', 'Paracetamol  500 MG', 'HIEU_LUC', true), ('TT-0100', 'Paracetamol  500 MG', 'HIEU_LUC', true)$$, 'duyet_thuoc_moi_doi_ma_dong');
select results_eq($$select trang_thai, ma_chinh_thuc from kk.thuoc_moi where so = 1$$, $$values ('DA_DUYET', 'TT-0100')$$, 'duyet_thuoc_moi_de_xuat_da_duyet');
select is(pg_temp.api('duyetthuocmoi', '{"id":"M001","chapNhan":true,"ma":"tt-0100"}', '111111')->>'error', 'Không thấy đề xuất M001 đang chờ', 'duyet_thuoc_moi_hai_lan');
-- offline resend of a MOI count after IT approved the proposal: trungLap, no new row
create temp table r_moi_gui as
  select pg_temp.luu('{"ma":"MOI-M002","dvt":"Viên","hoc":"m 5","le":1,"lo":"m5","hsd":"15/03/2027","reqId":"r-moi"}') as j;
select is((select j->>'st' from r_moi_gui), 'CHO_DUYET', 'gui_lai_moi_luu_lan_dau_cho_duyet');
create temp table n_dong as select count(*)::int n from kk.dong;
-- accept onto a code that already exists: no new catalogue row, name comes from the catalogue
select is(pg_temp.api('duyetthuocmoi', '{"id":"M002","chapNhan":true,"ma":"tt-0009"}', '111111')->>'ma', 'TT-0009', 'duyet_thuoc_moi_ma_co_san');
select results_eq($$select (select count(*)::int from kk.thuoc where nguon = 'MOI M002'), (select ten from kk.dong where lo = 'M3')$$,
  $$select 0, 'Vitamin C'::text$$, 'duyet_thuoc_moi_ma_co_san_ten_danh_muc');
create temp table r_moi_lai as
  select pg_temp.luu('{"ma":"MOI-M002","dvt":"Viên","hoc":"m 5","le":1,"lo":"m5","hsd":"15/03/2027","reqId":"r-moi"}') as j;
select is((select j->>'trungLap' from r_moi_lai), 'true', 'gui_lai_moi_sau_duyet_trung_lap');
select results_eq($$select j->>'id', j->>'st' from r_moi_lai$$,
  $$select j->>'id', 'HIEU_LUC'::text from r_moi_gui$$, 'gui_lai_moi_sau_duyet_dong_cu');
select is((select count(*)::int from jsonb_array_elements((select j->'lines' from r_moi_lai)) x where x->>'ma' = 'TT-0009' and x->>'lo' = 'M5'), 1,
  'gui_lai_moi_sau_duyet_lines');
select is((select count(*)::int from kk.dong), (select n from n_dong), 'gui_lai_moi_sau_duyet_khong_them_dong');
select is(pg_temp.luu('{"ma":"MOI-M002","dvt":"Viên","hoc":"m 5","le":1,"lo":"m5","hsd":"15/03/2027","reqId":"r-moi"}', '555555')->>'error',
  'Mã yêu cầu bị trùng – tải lại trang rồi lưu lại', 'gui_lai_moi_nguoi_khac_bi_chan');
select is(pg_temp.luu('{"ma":"MOI-M002","dvt":"Viên","hoc":"m 6","le":1,"lo":"m6","hsd":"15/03/2027"}')->>'error',
  'Mã MOI-M002 không có trong danh mục', 'luu_moi_sau_duyet_khong_con_ma_tam');
-- reject
select pg_temp.api('thuocmoi', '{"ten":"Thuốc bị từ chối 5mg","dvt":"Viên","hoc":"r 1","le":1,"lo":"r1","hsd":"15/03/2027"}');
select is((select so_thuoc_moi from kk.dot where id = 'DOT01'), 3, 'duyet_thuoc_moi_so_tiep_theo');
select is(pg_temp.api('duyetthuocmoi', '{"id":"M003","chapNhan":false}', '111111'), '{"ok":true}'::jsonb, 'duyet_thuoc_moi_tu_choi');
select results_eq($$select (select trang_thai from kk.thuoc_moi where so = 3), (select trang_thai from kk.dong where lo = 'R1')$$,
  $$select 'TU_CHOI'::text, 'TU_CHOI'::text$$, 'duyet_thuoc_moi_tu_choi_dong');
select is(jsonb_array_length(pg_temp.api('choduyet', '{}', '111111')->'thuocMoi'), 0, 'cho_duyet_het_thuoc_moi');

-- ---------------------------------------------------------------- gopLo
select pg_temp.luu('{"hoc":"g 1","le":5,"lo":"g1","hsd":"15/03/2027"}');
select pg_temp.luu('{"hoc":"g 2","le":3,"lo":"g2","hsd":"16/03/2027"}');
select pg_temp.luu('{"hoc":"g 3","le":4,"lo":"g2","hsd":"16/03/2027"}');
create temp table g2_cu as select so, 'D' || lpad(so::text, 5, '0') as id, hoc from kk.dong where lo = 'G2';
select is(pg_temp.api('goplo', '{"loGiu":"g1","loBo":"g2"}')->>'error', 'Tài khoản Người đếm 4 không có quyền này', 'gop_lo_can_it');
select is(pg_temp.api('goplo', '{"loGiu":"g1","loBo":" G1"}', '111111')->>'error', 'Chọn 2 lô khác nhau', 'gop_lo_cung_lo');
select is(pg_temp.api('goplo', '{"loGiu":"g1","loBo":""}', '111111')->>'error', 'Chọn 2 lô khác nhau', 'gop_lo_thieu_lo');
select is(pg_temp.api('goplo', '{"loGiu":"g1","loBo":"zz"}', '111111')->>'error', 'Không thấy đủ 2 lô đang hiệu lực', 'gop_lo_lo_la');
create temp table r_gop as select pg_temp.api('goplo', '{"loGiu":"g1","loBo":"g2"}', '111111') as j;
select is((select j->>'ok' from r_gop), 'true', 'gop_lo');
select is((select count(*)::int from kk.dong where lo = 'G2' and trang_thai = 'THAY_THE'), 2, 'gop_lo_lo_bo_thay_the');
select is((select count(*)::int from kk.dong where lo = 'G2' and trang_thai = 'HIEU_LUC'), 0, 'gop_lo_lo_bo_het_hieu_luc');
select results_eq($$select hoc, sl, lo, hsd, thao_tac, tk, trang_thai, ghi from kk.dong where lo = 'G1' and thao_tac = 'GOP_LO' order by hoc$$,
  $$values ('G 2', 3::numeric, 'G1', date '2027-03-15', 'GOP_LO', 'TK04', 'HIEU_LUC', 'Gộp từ lô G2 (' || (select id from g2_cu where hoc = 'G 2') || ') bởi Quản trị IT'),
           ('G 3', 4::numeric, 'G1', date '2027-03-15', 'GOP_LO', 'TK04', 'HIEU_LUC', 'Gộp từ lô G2 (' || (select id from g2_cu where hoc = 'G 3') || ') bởi Quản trị IT')$$,
  'gop_lo_dong_moi');
select is((select count(*)::int from kk.dong o join kk.dong n on n.so = o.thay_boi
           where o.lo = 'G2' and n.thao_tac = 'GOP_LO' and n.hoc = o.hoc), 2, 'gop_lo_dong_cu_tro_dong_moi');
select is((select count(*)::int from jsonb_array_elements((select j->'lines' from r_gop)) x where x->>'lo' = 'G1'), 3, 'gop_lo_lines');
select is((select count(*)::int from kk.nhat_ky where hanh_dong = 'GOP_LO'), 1, 'gop_lo_nhat_ky');

select * from finish();
rollback;
