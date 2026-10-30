begin;
select plan(24);

-- helper: IT (TK01) by default, on DOT01 / CHAN
create function pg_temp.api(act text, extra jsonb default '{}', pin text default '111111') returns jsonb language sql as $$
  select public.api(jsonb_build_object('action', act, 'pin', pin, 'dot', 'DOT01', 'kho', 'CHAN') || extra);
$$;

-- ---------------------------------------------------------------- dsKho
select is(pg_temp.api('dsKho', '{}', '222222')->>'ok', 'false', 'dskho_chi_it');
select is(public.api('{"action":"dsKho","pin":"111111"}')->>'ok', 'true', 'dskho_khong_can_dot');
select is(pg_temp.api('luuKho', '{"ma":"K9","ten":"Kho 9","tenNgan":"K9","thuTu":"5","hoatDong":false}')->>'ok', 'true', 'dskho_tao_kho_an');
select is((select e from jsonb_array_elements(pg_temp.api('dsKho')->'list') e where e->>'ma' = 'K9'),
  '{"ma":"K9","ten":"Kho 9","tenNgan":"K9","thuTu":5,"hoatDong":false}'::jsonb, 'dskho_co_kho_an');
select is((select array_agg(e->>'ma' order by o) from jsonb_array_elements(pg_temp.api('dsKho')->'list') with ordinality t(e, o)),
  (select array_agg(ma order by thu_tu, ma) from kk.kho), 'dskho_thu_tu');

-- ---------------------------------------------------------------- nhapSoSanh nhieuKho
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":[]}', '222222')->>'ok', 'false', 'nhieu_kho_chi_it');
select is(pg_temp.api('nhapSoSanh', $j${"nhieuKho":[
    {"kho":"CHAN","list":[["TT-0001","Paracetamol","L1","15/03/2027","10,5","Viên","A1","Lan"],["TT-0002","B","L2","",3,"Viên","",""]]},
    {"kho":"LE","list":[["TT-0009","Vitamin C","V1","",7,"Viên","B1","Minh"]]}]}$j$) - 'ok',
  '{"theoKho":{"CHAN":2,"LE":1},"loi":[]}'::jsonb, 'nhieu_kho_dung_ca_hai');
select is((select count(*)::int from kk.so_sanh where dot_id = 'DOT01'), 3, 'nhieu_kho_ghi_du');
create temp table r_loi as select pg_temp.api('nhapSoSanh', $j${"nhieuKho":[
    {"kho":"CHAN","list":[["TT-0005","X","L9","",1,"Viên","",""]]},
    {"kho":"LE","list":[["TT-0009","Vitamin C","V1","31/02/2027",7,"Viên","",""]]}]}$j$) as j;
select is((select j->'loi' from r_loi), '[{"kho":"LE","dong":1,"error":"HSD không hợp lệ: 31/02/2027"}]'::jsonb, 'nhieu_kho_bao_loi_kho_sau');
select is((select string_agg(lo, ',' order by lo) from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN'), 'L1,L2', 'nhieu_kho_loi_kho_sau_giu_kho_dau');
-- chiKiem: counts valid rows, writes nothing, logs nothing
create temp table nk0 as select count(*) n from kk.nhat_ky where hanh_dong = 'NHAP_SO_SANH';
select is(pg_temp.api('nhapSoSanh', $j${"chiKiem":true,"nhieuKho":[{"kho":"CHAN","list":[["TT-0007","Y","L7","",1,"Viên","",""]]}]}$j$)->'theoKho',
  '{"CHAN":1}'::jsonb, 'nhieu_kho_chi_kiem_dem');
select is((select string_agg(lo, ',' order by lo) from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN'), 'L1,L2', 'nhieu_kho_chi_kiem_khong_ghi');
select is((select count(*) from kk.nhat_ky where hanh_dong = 'NHAP_SO_SANH'), (select n from nk0), 'nhieu_kho_chi_kiem_khong_nhat_ky');
select is(pg_temp.api('nhapSoSanh', $j${"chiKiem":true,"nhieuKho":[{"kho":"CHAN","list":[["","Y","L7","",1,"Viên","",""]]}]}$j$)->'loi',
  '[{"kho":"CHAN","dong":1,"error":"Thiếu mã thuốc"}]'::jsonb, 'nhieu_kho_chi_kiem_bao_loi');
select is(pg_temp.api('nhapSoSanh', '{"chiKiem":true,"list":[["TT-0007","Y","L7","",1,"Viên","",""]]}')->'soDong', '1', 'cach_goi_cu_chi_kiem_dem');
select is((select string_agg(lo, ',' order by lo) from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN'), 'L1,L2', 'cach_goi_cu_chi_kiem_khong_ghi');
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":[{"kho":"K9","list":[]}]}')->>'error', 'Đợt "Đợt thử" không kiểm Kho 9', 'nhieu_kho_kho_ngoai_dot');
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":[{"kho":"CHAN","list":[]},{"kho":"chan","list":[]}]}')->>'error', 'Kho CHAN bị lặp trong tệp', 'nhieu_kho_lap_kho');
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":"x"}')->>'error', 'Danh sách số liệu không hợp lệ', 'nhieu_kho_khong_phai_mang');
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":[],"dot":"DOT02"}')->>'ok', 'false', 'nhieu_kho_dot_dong_bi_chan');

-- ---------------------------------------------------------------- dsSoSanh
select is(pg_temp.api('dsSoSanh', '{}', '222222')->>'ok', 'false', 'dssosanh_chi_it');
select is(pg_temp.api('dsSoSanh', '{"kho":""}')->'list', pg_temp.api('xuatDot')->'soSanh', 'dssosanh_giong_xuat_dot');
select is(jsonb_array_length(pg_temp.api('dsSoSanh', '{"kho":"LE"}')->'list'), 1, 'dssosanh_loc_kho');
select is(pg_temp.api('dsSoSanh', '{"dot":"DOT02"}')->>'ok', 'true', 'dssosanh_dot_dong_xem_duoc');

select * from finish();
rollback;
