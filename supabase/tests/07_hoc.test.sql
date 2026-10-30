begin;
select plan(65);

-- helper: request on DOT01 / CHAN (TK04 by default), overrides merged on top
create function pg_temp.api(act text, extra jsonb default '{}', pin text default '444444') returns jsonb language sql as $$
  select public.api(jsonb_build_object('action', act, 'pin', pin, 'dot', 'DOT01', 'kho', 'CHAN') || extra);
$$;
create function pg_temp.luu(extra jsonb, pin text default '444444') returns jsonb language sql as $$
  select pg_temp.api('luu', jsonb_build_object('ma', 'TT-0001', 'le', 5, 'hsd', '15/03/2027') || extra, pin);
$$;

-- ---------------------------------------------------------------- nhanHoc
create temp table r_nh as select pg_temp.api('nhanhoc', '{"hoc":"a 1"}') as j;
select is((select j->>'ok' from r_nh), 'true', 'nhan_hoc_moi_ok');
select is((select j->'hoc'->>'st' from r_nh), 'DANG_DEM', 'nhan_hoc_moi_st');
select is((select j->'hoc'->>'stTen' from r_nh), 'Đang đếm', 'nhan_hoc_moi_st_ten');
select is((select j->'hoc'->>'nguoi' from r_nh), 'Người đếm 4', 'nhan_hoc_moi_nguoi');
select is((select j->'hoc'->>'hoc' from r_nh), 'A 1', 'nhan_hoc_moi_hoc_chuan_hoa');
select is((select array_agg(k order by k) from r_nh, jsonb_object_keys(j->'hoc') k),
  array['batDau','ghi','hoc','kho','nguoi','nguoiXong','st','stTen','xongLuc'], 'nhan_hoc_moi_khoa_json');
select matches((select j->'hoc'->>'batDau' from r_nh), '^\d\d/\d\d \d\d:\d\d$', 'nhan_hoc_moi_bat_dau_dinh_dang');
select results_eq($$select xong_luc is null, nguoi_xong, ghi from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and hoc = 'A 1' and not tap$$,
  $$values (true, ''::text, ''::text)$$, 'nhan_hoc_moi_dong_hoc');
select is((select j->'hoc'->>'xongLuc' from r_nh), '', 'nhan_hoc_moi_xong_luc_rong');

-- second person joins: names joined with a comma, first start time kept
create temp table bd1 as select bat_dau from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and hoc = 'A 1';
select is(pg_temp.api('nhanhoc', '{"hoc":"a 1"}', '555555')->'hoc'->>'nguoi', 'Người đếm 4, Người đếm 5', 'nhan_hoc_hai_nguoi');
select is(pg_temp.api('nhanhoc', '{"hoc":"A  1"}', '555555')->'hoc'->>'nguoi', 'Người đếm 4, Người đếm 5', 'nhan_hoc_nhan_lai_khong_them_ten');
select is((select bat_dau from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and hoc = 'A 1'), (select bat_dau from bd1), 'nhan_hoc_giu_bat_dau_dau_tien');
select is((select count(*)::int from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and not tap), 1, 'nhan_hoc_mot_dong_hoc');

-- errors
select is(pg_temp.api('nhanhoc', '{"hoc":"  "}')->>'error', 'Chưa nhập hộc', 'nhan_hoc_thieu_hoc');
select is(pg_temp.api('nhanhoc', '{"hoc":"a 1","kho":"XX"}')->>'error', 'Chưa chọn kho', 'nhan_hoc_kho_la');
select matches(pg_temp.api('nhanhoc', '{"hoc":"a 1","dot":"DOT02"}')->>'error', 'đã đóng', 'nhan_hoc_dot_dong');

-- ---------------------------------------------------------------- xongHoc + daXong + moLai
select pg_temp.luu('{"hoc":"a 1","lo":"l1"}');
select pg_temp.luu('{"hoc":"a 1","lo":"l2"}');
select pg_temp.luu('{"hoc":"a 1","lo":"l3"}');
update kk.dong set trang_thai = 'HUY' where lo = 'L3';        -- inactive rows are not counted
select pg_temp.luu('{"hoc":"a 2","lo":"l4"}');                 -- other hộc, not counted
create temp table r_xh as select pg_temp.api('xonghoc', '{"hoc":"a 1"}', '555555') as j;
select is((select j->>'soDong' from r_xh), '2', 'xong_hoc_so_dong');
select is((select j->'hoc'->>'st' from r_xh), 'XONG', 'xong_hoc_st');
select is((select j->'hoc'->>'stTen' from r_xh), 'Đã xong', 'xong_hoc_st_ten');
select is((select j->'hoc'->>'nguoiXong' from r_xh), 'Người đếm 5', 'xong_hoc_nguoi_xong');
select matches((select j->'hoc'->>'xongLuc' from r_xh), '^\d\d/\d\d \d\d:\d\d$', 'xong_hoc_xong_luc');
select is((select j->'hoc'->>'nguoi' from r_xh), 'Người đếm 4, Người đếm 5', 'xong_hoc_giu_nguoi_dem');
select is((select count(*)::int from kk.nhat_ky where hanh_dong = 'XONG_HOC' and chi_tiet = 'CHAN A 1'), 1, 'xong_hoc_nhat_ky');
-- never claimed: creates the row, then marks it done
create temp table r_xh2 as select pg_temp.api('xonghoc', '{"hoc":"b 7"}') as j;
select is((select j->'hoc'->>'st' from r_xh2), 'XONG', 'xong_hoc_chua_nhan_xong');
select is((select j->'hoc'->>'nguoi' from r_xh2), 'Người đếm 4', 'xong_hoc_chua_nhan_nguoi');
select is((select j->>'soDong' from r_xh2), '0', 'xong_hoc_chua_nhan_so_dong_0');

-- already done: reported, not reopened
create temp table r_dx as select pg_temp.api('nhanhoc', '{"hoc":"a 1"}', '555555') as j;
select is((select j->>'daXong' from r_dx), 'true', 'nhan_hoc_da_xong_co_co');
select is((select j->'hoc'->>'st' from r_dx), 'XONG', 'nhan_hoc_da_xong_giu_xong');
select is((select nguoi_xong from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and hoc = 'A 1'), 'Người đếm 5', 'nhan_hoc_da_xong_khong_doi');
-- reopen
create temp table r_ml as select pg_temp.api('nhanhoc', '{"hoc":"a 1","moLai":true}', '222222') as j;
select is((select j->'hoc'->>'st' from r_ml), 'DANG_DEM', 'nhan_hoc_mo_lai_st');
select is((select j ? 'daXong' from r_ml), false, 'nhan_hoc_mo_lai_khong_co_co');
select matches((select j->'hoc'->>'ghi' from r_ml), '^Mở lại bởi Tổ trưởng 1 \d\d/\d\d \d\d:\d\d$', 'nhan_hoc_mo_lai_ghi');
select is((select j->'hoc'->>'xongLuc' from r_ml) || (select j->'hoc'->>'nguoiXong' from r_ml), '', 'nhan_hoc_mo_lai_xoa_xong');
select is((select j->'hoc'->>'nguoi' from r_ml), 'Người đếm 4, Người đếm 5, Tổ trưởng 1', 'nhan_hoc_mo_lai_them_ten');
select is((select count(*)::int from kk.nhat_ky where hanh_dong = 'MO_LAI_HOC' and chi_tiet = 'CHAN A 1'), 1, 'nhan_hoc_mo_lai_nhat_ky');
-- moLai on a hộc that is not done changes nothing else
select is(pg_temp.api('nhanhoc', '{"hoc":"a 1","moLai":true}', '222222')->'hoc'->>'ghi' like 'Mở lại bởi%', true, 'nhan_hoc_mo_lai_hoc_dang_dem_giu_ghi');
select is((select count(*)::int from kk.nhat_ky where hanh_dong = 'MO_LAI_HOC'), 1, 'nhan_hoc_mo_lai_khong_ghi_nhat_ky_lan_hai');

-- ---------------------------------------------------------------- dsHoc
-- ordering: kho LE, rows inserted out of order
insert into kk.hoc (dot_id, tap, kho, hoc, trang_thai, nguoi) values
  ('DOT01', false, 'LE', 'X 10', 'XONG', 'n'), ('DOT01', false, 'LE', 'Y 10', 'DANG_DEM', 'n'),
  ('DOT01', false, 'LE', 'Z 10', 'CHUA_NHAN', ''), ('DOT01', false, 'LE', 'X 2', 'XONG', 'n'),
  ('DOT01', false, 'LE', 'Y 2', 'DANG_DEM', 'n'), ('DOT01', false, 'LE', 'Z 2', 'CHUA_NHAN', ''),
  ('DOT01', false, 'LE', 'Z 1', 'CHUA_NHAN', '');
create temp table r_ds as select pg_temp.api('dshoc', '{"kho":"LE"}') as j;
select is((select jsonb_agg(x->>'hoc') from r_ds, jsonb_array_elements(j->'list') x),
  '["Z 1","Z 2","Z 10","Y 2","Y 10","X 2","X 10"]'::jsonb, 'ds_hoc_thu_tu');
select is((select jsonb_build_array(j->'chua', j->'dang', j->'xong') from r_ds), '[3,2,2]'::jsonb, 'ds_hoc_dem_trang_thai');
select is((select x->>'stTen' from r_ds, jsonb_array_elements(j->'list') x where x->>'hoc' = 'Z 1'), 'Chưa ai nhận', 'ds_hoc_st_ten_chua_nhan');
select is((select array_agg(k order by k) from r_ds, jsonb_array_elements(j->'list') x, jsonb_object_keys(x) k where x->>'hoc' = 'Z 1'),
  array['batDau','ghi','hoc','kho','nguoi','nguoiDem','nguoiXong','soDong','soMa','st','stTen','xongLuc'], 'ds_hoc_khoa_json');
select is((select x->'nguoiDem' from r_ds, jsonb_array_elements(j->'list') x where x->>'hoc' = 'Z 1'), '[]'::jsonb, 'ds_hoc_nguoi_dem_rong');

-- counted but never claimed: appears as DANG_DEM with no owner; soDong / soMa / nguoiDem from HIEU_LUC rows only
select pg_temp.luu('{"hoc":"q 1","lo":"q1"}');
select pg_temp.luu('{"hoc":"q 1","lo":"q2"}', '555555');
select pg_temp.luu('{"hoc":"q 1","lo":"q3","ma":"TT-0009"}');
select pg_temp.luu('{"hoc":"q 1","lo":"q4","ma":"TT-0009"}', '555555');
update kk.dong set trang_thai = 'CHO_DUYET' where lo = 'Q4';
create temp table r_q as select x as h from (select jsonb_array_elements(pg_temp.api('dshoc')->'list') x) s where x->>'hoc' = 'Q 1';
select is((select h->>'st' from r_q), 'DANG_DEM', 'ds_hoc_tu_dong_dem_st');
select is((select h->>'nguoi' from r_q), '', 'ds_hoc_tu_dong_dem_nguoi_rong');
select is((select h->>'stTen' from r_q), 'Đang đếm', 'ds_hoc_tu_dong_dem_st_ten');
select is((select h->>'soDong' from r_q), '3', 'ds_hoc_so_dong');
select is((select h->>'soMa' from r_q), '2', 'ds_hoc_so_ma');
select is((select h->'nguoiDem' from r_q), '["Người đếm 4","Người đếm 5"]'::jsonb, 'ds_hoc_nguoi_dem_theo_thu_tu_dem');
select is((select x->>'soDong' from jsonb_array_elements(pg_temp.api('dshoc')->'list') x where x->>'hoc' = 'A 1'), '2', 'ds_hoc_so_dong_hoc_da_nhan');
select is((select x->>'nguoi' from jsonb_array_elements(pg_temp.api('dshoc')->'list') x where x->>'hoc' = 'A 1'), 'Người đếm 4, Người đếm 5, Tổ trưởng 1', 'ds_hoc_nguoi_hoc_da_nhan');

-- the TAP account keeps its own hộc list
create temp table r_tap as select pg_temp.api('nhanhoc', '{"hoc":"t 1"}', '999999') as j;
select is((select j->'hoc'->>'nguoi' from r_tap), 'Tập dượt', 'tap_nhan_hoc');
select is((select tap from kk.hoc where hoc = 'T 1'), true, 'tap_hoc_ghi_rieng');
select is((select count(*)::int from jsonb_array_elements(pg_temp.api('dshoc')->'list') x where x->>'hoc' = 'T 1'), 0, 'tap_khong_lan_sang_dem_that');
select is((select count(*)::int from jsonb_array_elements(pg_temp.api('dshoc', '{}', '999999')->'list') x where x->>'hoc' = 'T 1'), 1, 'tap_thay_hoc_cua_minh');
select is(pg_temp.api('dshoc', '{"dot":"DOT02"}')->>'ok', 'true', 'ds_hoc_dot_dong_van_xem');

-- ---------------------------------------------------------------- tienDo (kho LE)
delete from kk.hoc where kho = 'LE';
select pg_temp.api('nhanhoc', '{"kho":"LE","hoc":"t 1"}');
select pg_temp.api('xonghoc', '{"kho":"LE","hoc":"t 2"}');
insert into kk.hoc (dot_id, tap, kho, hoc) values ('DOT01', false, 'LE', 'ZZ');
select pg_temp.luu('{"kho":"LE","hoc":"t 1","lo":"a"}');
select pg_temp.luu('{"kho":"LE","hoc":"t 2","lo":"b"}');
select pg_temp.luu('{"kho":"LE","hoc":"t 1","lo":"c","ma":"TT-0009"}');
select pg_temp.luu('{"kho":"LE","hoc":"t 1","lo":"d"}');
select pg_temp.luu('{"kho":"LE","hoc":"t 1","lo":"e","ma":"TT-0009"}');
update kk.dong set trang_thai = 'CHO_DUYET' where kho = 'LE' and lo = 'D';
update kk.dong set trang_thai = 'HUY' where kho = 'LE' and lo = 'E';
insert into kk.so_sanh (dot_id, kho, ma, ten, lo, sl, dvt) values
  ('DOT01', 'LE', 'TT-0001', 'A', 'x', 3, 'Viên'), ('DOT01', 'LE', 'TT-0001', 'A', 'y', 4, 'Viên'),
  ('DOT01', 'LE', 'TT-0009', 'B', 'x', 1, 'Viên'), ('DOT01', 'LE', 'TT-0777', 'C', 'x', 2, 'Viên'),
  ('DOT01', 'LE', '', 'blank', 'x', 2, 'Viên'), ('DOT01', 'CHAN', 'TT-0555', 'D', 'x', 2, 'Viên');
update kk.dot set so_voi = 'Đợt so sánh 7' where id = 'DOT01';
create temp table r_td as select pg_temp.api('tiendo', '{"kho":"LE"}') as j;
select is((select array_agg(k order by k) from r_td, jsonb_object_keys(j) k),
  array['choDuyet','hocChua','hocDang','hocXong','lan1','lan1DaDemLai','ok','soDong','soMa','soVoi','tongDanhMuc','trangThai'], 'tien_do_du_khoa');
select is((select j->'soDong' from r_td), '3'::jsonb, 'tien_do_so_dong');
select is((select j->'soMa' from r_td), '2'::jsonb, 'tien_do_so_ma');
select is((select j->'choDuyet' from r_td), '1'::jsonb, 'tien_do_cho_duyet');
select is((select jsonb_build_array(j->'hocXong', j->'hocDang', j->'hocChua') from r_td), '[1,1,1]'::jsonb, 'tien_do_hoc');
select is((select jsonb_build_array(j->'lan1', j->'lan1DaDemLai') from r_td), '[3,2]'::jsonb, 'tien_do_lan1');
select is((select (j->>'tongDanhMuc')::int from r_td), (select count(*)::int from kk.thuoc), 'tien_do_tong_danh_muc');
select is((select j->>'trangThai' from r_td), 'DANG_KIEM', 'tien_do_trang_thai');
select is((select j->>'soVoi' from r_td), 'Đợt so sánh 7', 'tien_do_so_voi');
update kk.dot_kho set trang_thai = 'DA_CHOT' where dot_id = 'DOT01' and kho = 'LE';
select is(pg_temp.api('tiendo', '{"kho":"LE"}')->>'trangThai', 'DA_CHOT', 'tien_do_da_chot');

select * from finish();
rollback;
