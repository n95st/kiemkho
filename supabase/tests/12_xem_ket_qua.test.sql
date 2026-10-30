begin;
select plan(11);

-- helper: IT (TK01) by default, on DOT01 / CHAN
create function pg_temp.api(act text, extra jsonb default '{}', pin text default '111111') returns jsonb language sql as $$
  select public.api(jsonb_build_object('action', act, 'pin', pin, 'dot', 'DOT01', 'kho', 'CHAN') || extra);
$$;
insert into kk.dong (dot_id, so, tap, tg, kho, ma, ten, lo, hsd, hoc, hop, qc, le, sl, dvt, nguoi, tk, thao_tac, trang_thai, req_id, ghi)
values ('DOT01', 9001, false, now(), 'CHAN', 'TT-0001', 'Paracetamol 500mg', 'L1', date '2027-05-01', 'A 1', 1, 10, 0, 10, 'Viên', 'Người đếm 4', 'TK04', 'CONG_THEM', 'HIEU_LUC', 'r9001', 'ghi thử');

-- ---------------------------------------------------------------- xemDot: the whole đợt for reading, no XUAT_DOT log line
select is(pg_temp.api('xemDot', '{}', '444444')->>'ok', 'false', 'xemdot_dem_bi_chan');
select is(pg_temp.api('xemDot') - 'ok', pg_temp.api('xuatDot') - 'ok', 'xemdot_giong_xuatdot');
create temp table xd0 as select count(*) n from kk.nhat_ky where hanh_dong = 'XUAT_DOT';
select is(pg_temp.api('xemDot')->'dong'->0->>'ghi', 'ghi thử', 'xemdot_co_dong');
select is((select count(*) from kk.nhat_ky where hanh_dong = 'XUAT_DOT'), (select n from xd0), 'xemdot_khong_ghi_nhat_ky');
create temp table xd1 as select pg_temp.api('xuatDot') j;
select is((select count(*) from kk.nhat_ky where hanh_dong = 'XUAT_DOT') - (select n from xd0), 1::bigint, 'xuatdot_van_ghi_nhat_ky');
select is(pg_temp.api('xemDot', '{"dot":"DOT02"}')->>'ok', 'true', 'xemdot_dot_dong_xem_duoc');

-- ---------------------------------------------------------------- nhatKy: actions of this đợt plus global ones, newest first
insert into kk.nhat_ky (dot_id, tk, ten, hanh_dong, chi_tiet) values
  ('DOT02', 'TK01', 'Quản trị IT', 'CHOT_KHO', 'LE'),
  (null, 'TK01', 'Quản trị IT', 'DS_TAI_KHOAN', ''),
  ('DOT01', 'TK01', 'Quản trị IT', 'CHOT_KHO', 'CHAN'),
  (null, 'TK01', 'Quản trị IT', 'LUU_THUOC', 'X-1');
create temp table nk as select pg_temp.api('nhatKy') j;
select is(pg_temp.api('nhatKy', '{}', '222222')->>'ok', 'false', 'nhatky_chi_it');
select is((select (j->'list'->0) - 'tg' from nk), '{"tk":"TK01","ten":"Quản trị IT","hanhDong":"LUU_THUOC","chiTiet":"X-1","dot":""}'::jsonb, 'nhatky_moi_nhat_truoc');
select ok((select bool_or(e->>'hanhDong' = 'CHOT_KHO' and e->>'chiTiet' = 'CHAN' and e->>'dot' = 'DOT01') from nk, jsonb_array_elements(j->'list') e), 'nhatky_co_dong_cua_dot');
select ok((select not bool_or(e->>'dot' = 'DOT02') from nk, jsonb_array_elements(j->'list') e), 'nhatky_khong_co_dot_khac');
select ok((select not bool_or(e->>'hanhDong' = 'DS_TAI_KHOAN') from nk, jsonb_array_elements(j->'list') e), 'nhatky_bo_xem_tai_khoan');

select * from finish();
rollback;
