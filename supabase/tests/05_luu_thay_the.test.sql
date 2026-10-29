begin;
select plan(46);

-- helper: base request on DOT01 / CHAN / TT-0001 (TK04 by default), with overrides merged on top
create function pg_temp.luu(extra jsonb, pin text default '444444') returns jsonb language sql as $$
  select public.api(jsonb_build_object('action', 'luu', 'pin', pin, 'dot', 'DOT01', 'kho', 'CHAN', 'ma', 'TT-0001') || extra);
$$;
-- line id of the newest row matching lô + hộc
create function pg_temp.id_cua(p_lo text, p_hoc text) returns text language sql as $$
  select 'D' || lpad(max(so)::text, 5, '0') from kk.dong where dot_id = 'DOT01' and lo = p_lo and hoc = p_hoc;
$$;

-- HSD_KHAC: same lô, other HSD
select pg_temp.luu('{"hoc":"h 1","le":5,"lo":"h1","hsd":"15/03/2027"}');
create temp table r_hsd as select pg_temp.luu('{"hoc":"h 2","le":3,"lo":"h1","hsd":"16/03/2027"}') as j;
select is((select j->>'ok' from r_hsd), 'false', 'hsd_khac_ok_false');
select is((select j->>'need' from r_hsd), 'HSD_KHAC', 'hsd_khac_need');
select is((select j->'hsdCu' from r_hsd), '["15/03/2027"]'::jsonb, 'hsd_khac_hsd_cu');
select is((select j->>'error' from r_hsd), 'Lô H1 đã ghi HSD 15/03/2027', 'hsd_khac_error');
select is((select count(*)::int from kk.dong where lo = 'H1'), 1, 'hsd_khac_khong_ghi');
select is(pg_temp.luu('{"hoc":"h 2","le":3,"lo":"h1","hsd":"16/03/2027","okHsd":true}')->>'st', 'HIEU_LUC', 'hsd_khac_ok_hsd_luu_duoc');

-- CUNG_HOC: TK05 counts the same lô in TK04's hộc
select pg_temp.luu('{"hoc":"c 1","le":5,"lo":"c1","hsd":"15/03/2027"}');
create temp table r_ch as select pg_temp.luu('{"hoc":"c 1","le":2,"lo":"c1","hsd":"15/03/2027"}', '555555') as j;
select is((select j->>'need' from r_ch), 'CUNG_HOC', 'cung_hoc_nguoi_khac_need');
select is((select j->>'error' from r_ch), 'Hộc C 1 đã có Người đếm 4 đếm lô này', 'cung_hoc_nguoi_khac_error');
select is((select j->'lines'->0->>'tk' from r_ch), 'TK04', 'cung_hoc_nguoi_khac_lines');
select is((select j->>'ok' from r_ch), 'false', 'cung_hoc_nguoi_khac_ok_false');
select is(pg_temp.luu('{"hoc":"c 1","le":2,"lo":"c1","hsd":"15/03/2027","okCungHoc":true}', '555555')->>'st', 'HIEU_LUC', 'cung_hoc_ok_luu_duoc');
select is(pg_temp.luu('{"hoc":"c 1","le":1,"lo":"c1","hsd":"15/03/2027"}', '222222')->>'need', 'CUNG_HOC', 'cung_hoc_to_truong_cung_hoi');

-- DEM_LAI_HOC by the owner
select pg_temp.luu('{"hoc":"a 1","le":5,"lo":"a1","hsd":"15/03/2027"}');
create temp table a_cu as select so from kk.dong where lo = 'A1' and hoc = 'A 1';
create temp table r_dl as select pg_temp.luu('{"hoc":"a 1","le":7,"lo":"a1","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC"}') as j;
select is((select j->>'st' from r_dl), 'HIEU_LUC', 'dem_lai_hoc_st');
select results_eq($$select trang_thai, 'D' || lpad(thay_boi::text, 5, '0'), cap_nhat like '% TK04' from kk.dong where so = (select so from a_cu)$$,
  $$select 'THAY_THE'::text, (select j->>'id' from r_dl), true$$, 'dem_lai_hoc_dong_cu_thay_the');
select is((select jsonb_agg(x->>'id') from r_dl, jsonb_array_elements(j->'lines') x where x->>'lo' = 'A1'), jsonb_build_array((select j->>'id' from r_dl)), 'dem_lai_hoc_lines');
select is((select thao_tac from kk.dong where 'D' || lpad(so::text, 5, '0') = (select j->>'id' from r_dl)), 'DEM_LAI_HOC', 'dem_lai_hoc_thao_tac');

-- DEM_LAI_HOC on someone else's hộc: refused for DEM, allowed for TO_TRUONG
select is(pg_temp.luu('{"hoc":"a 1","le":8,"lo":"a1","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC"}', '555555')->>'error',
  'Hộc này do Người đếm 4 đếm – chỉ người đó hoặc tổ trưởng được đếm lại', 'dem_lai_hoc_nguoi_khac');
select is(pg_temp.luu('{"hoc":"a 1","le":8,"lo":"a1","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC"}', '222222')->>'st', 'HIEU_LUC', 'dem_lai_hoc_to_truong');
select is((select count(*)::int from kk.dong where lo = 'A1' and hoc = 'A 1' and trang_thai = 'HIEU_LUC'), 1, 'dem_lai_hoc_con_mot_dong');
select is(pg_temp.luu('{"hoc":"a 2","le":8,"lo":"a1","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC"}')->>'error',
  'Hộc A 2 chưa có dòng nào của lô này – dùng "Cộng thêm"', 'dem_lai_hoc_chua_co');

-- DON_LO
select is(pg_temp.luu('{"hoc":"a 9","le":9,"lo":"a1","hsd":"15/03/2027","thaoTac":"DON_LO","lyDo":"gộp"}')->>'error',
  'Tài khoản Người đếm 4 không có quyền này', 'don_lo_can_quyen');
select is(pg_temp.luu('{"hoc":"a 9","le":9,"lo":"a1","hsd":"15/03/2027","thaoTac":"DON_LO"}', '222222')->>'error',
  'Dồn cả lô cần ghi lý do', 'don_lo_can_ly_do');
select is(pg_temp.luu('{"hoc":"a 9","le":9,"lo":"zz","hsd":"15/03/2027","thaoTac":"DON_LO","lyDo":"gộp"}', '222222')->>'error',
  'Lô này chưa có dòng nào để dồn', 'don_lo_lo_trong');
select pg_temp.luu('{"hoc":"a 2","le":4,"lo":"a1","hsd":"15/03/2027"}', '555555');
create temp table r_don as select pg_temp.luu('{"hoc":"a 9","le":9,"lo":"a1","hsd":"15/03/2027","thaoTac":"DON_LO","lyDo":" gộp "}', '222222') as j;
select is((select j->>'st' from r_don), 'HIEU_LUC', 'don_lo_st');
select is((select array_agg('D' || lpad(so::text, 5, '0')) from kk.dong where lo = 'A1' and trang_thai = 'HIEU_LUC'),
  array[(select j->>'id' from r_don)], 'don_lo_con_dong_moi');
select is((select count(*)::int from kk.dong where lo = 'A1' and trang_thai = 'THAY_THE'
  and 'D' || lpad(thay_boi::text, 5, '0') = (select j->>'id' from r_don)), 2, 'don_lo_dong_cu_thay_the');
select is((select ghi from kk.dong where lo = 'A1' and trang_thai = 'HIEU_LUC'), 'gộp', 'don_lo_ghi_ly_do');

-- seen: someone changed the lô since the screen was loaded
select pg_temp.luu('{"hoc":"s 1","le":5,"lo":"s1","hsd":"15/03/2027"}');
create temp table r_seen as select pg_temp.luu('{"hoc":"s 1","le":6,"lo":"s1","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC","seen":[]}') as j;
select is((select j->>'conflict' from r_seen), 'true', 'seen_xung_dot');
select is((select j->>'error' from r_seen), 'Vừa có người cập nhật lô này – xem lại số mới rồi lưu lại', 'seen_xung_dot_error');
select is((select jsonb_agg(x->>'id') from r_seen, jsonb_array_elements(j->'lines') x where x->>'lo' = 'S1'), jsonb_build_array(pg_temp.id_cua('S1', 'S 1')), 'seen_xung_dot_lines');
select is(pg_temp.luu(jsonb_build_object('hoc', 's 1', 'le', 6, 'lo', 's1', 'hsd', '15/03/2027', 'thaoTac', 'DEM_LAI_HOC',
  'seen', jsonb_build_array(pg_temp.id_cua('S1', 'S 1'))))->>'st', 'HIEU_LUC', 'seen_khop_luu_duoc');

-- closed kho: needs a reason, then goes to CHO_DUYET and keeps the old line
select pg_temp.luu('{"kho":"LE","hoc":"k 1","le":5,"lo":"k1","hsd":"15/03/2027"}');
create temp table k_cu as select so from kk.dong where lo = 'K1';
update kk.dot_kho set trang_thai = 'DA_CHOT' where dot_id = 'DOT01' and kho = 'LE';
select is(pg_temp.luu('{"kho":"LE","hoc":"k 1","le":6,"lo":"k1","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC"}')->>'error',
  'Kho lẻ đã chốt – ghi lý do bổ sung để IT duyệt', 'kho_chot_can_ly_do');
create temp table r_kc as select pg_temp.luu('{"kho":"LE","hoc":"k 1","le":6,"lo":"k1","hsd":"15/03/2027","thaoTac":"DEM_LAI_HOC","lyDo":"sót"}') as j;
select is((select j->>'st' from r_kc), 'CHO_DUYET', 'kho_chot_cho_duyet_st');
select results_eq($$select thao_tac, se_thay from kk.dong where 'D' || lpad(so::text, 5, '0') = (select j->>'id' from r_kc)$$,
  $$select 'BO_SUNG_DEM_LAI_HOC'::text, array[(select so from k_cu)]$$, 'kho_chot_cho_duyet_tt_se_thay');
select is((select trang_thai from kk.dong where so = (select so from k_cu)), 'HIEU_LUC', 'kho_chot_dong_cu_van_hieu_luc');
select is((select jsonb_array_length(j->'lines') from r_kc), 2, 'kho_chot_lines_ca_hai');
select is(pg_temp.luu('{"kho":"LE","hoc":"k 2","le":1,"lo":"k2","hsd":"15/03/2027","lyDo":"sót"}')->>'st', 'CHO_DUYET', 'kho_chot_cong_them_cho_duyet');
select is((select thao_tac from kk.dong where lo = 'K2'), 'BO_SUNG_CONG_THEM', 'kho_chot_cong_them_tt');

-- new drug (MOI-Mnnn): accepted while pending, always CHO_DUYET
insert into kk.thuoc_moi (dot_id, so, ten, dvt, kho, nguoi) values ('DOT01', 1, 'Thuốc lạ 10mg', 'Viên', 'CHAN', 'Người đếm 4 (TK04)');
insert into kk.thuoc_moi (dot_id, so, ten, dvt, kho, nguoi, trang_thai) values ('DOT01', 2, 'Thuốc đã duyệt', 'Viên', 'CHAN', 'x', 'DA_DUYET');
create temp table r_moi as select pg_temp.luu('{"ma":"MOI-M001","dvt":"Viên","hoc":"m 1","le":2,"lo":"m1","hsd":"15/03/2027","gtin":"8930000000999"}') as j;
select is((select j->>'st' from r_moi), 'CHO_DUYET', 'thuoc_moi_cho_duyet');
select results_eq($$select ma, ten, dvt from kk.dong where lo = 'M1'$$, $$values ('MOI-M001', 'Thuốc lạ 10mg', 'Viên')$$, 'thuoc_moi_dong');
select is(pg_temp.luu('{"ma":"MOI-M002","dvt":"Viên","hoc":"m 1","le":2,"lo":"m1","hsd":"15/03/2027"}')->>'error',
  'Mã MOI-M002 không có trong danh mục', 'thuoc_moi_da_duyet_tu_choi');
select is(pg_temp.luu('{"ma":"MOI-M001","hoc":"m 1","le":2,"lo":"m1","hsd":"15/03/2027"}')->>'error', 'Chưa chọn ĐVT', 'thuoc_moi_can_dvt');

-- reqId reused by another account / drug: error instead of returning someone else's row
select pg_temp.luu('{"hoc":"q 1","le":1,"lo":"q1","hsd":"15/03/2027","reqId":"q1"}');
select is(pg_temp.luu('{"hoc":"q 1","le":1,"lo":"q1","hsd":"15/03/2027","reqId":"q1","okCungHoc":true}', '555555')->>'error',
  'Mã yêu cầu bị trùng – tải lại trang rồi lưu lại', 'reqid_trung_nguoi_khac');
select is(pg_temp.luu('{"ma":"TT-0009","hoc":"q 1","le":1,"lo":"q1","hsd":"15/03/2027","reqId":"q1"}')->>'error',
  'Mã yêu cầu bị trùng – tải lại trang rồi lưu lại', 'reqid_trung_thuoc_khac');
select is(pg_temp.luu('{"hoc":"q 1","le":1,"lo":"q1","hsd":"15/03/2027","reqId":"q1"}')->>'trungLap', 'true', 'reqid_gui_lai_van_trung_lap');

-- GTIN already on another drug is not learned
update kk.thuoc set gtin = '{8930000000017}' where ma = 'TT-0009';
select pg_temp.luu('{"hoc":"g 1","le":1,"lo":"g1","hsd":"15/03/2027","gtin":"8930000000017"}');
select is((select gtin from kk.thuoc where ma = 'TT-0001'), '{}'::text[], 'gtin_cua_thuoc_khac_khong_hoc');

select * from finish();
rollback;
