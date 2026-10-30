begin;
select plan(14);

-- fixtures: 2 live lines (one with a pending sibling), TAP line, closed-out line, comparison rows
insert into kk.thuoc (ma, ten, dvt, quy_cach, kho_mac_dinh) values ('CX-1', 'Thuốc CX1', 'Viên', 100, 'LE'), ('CX-2', 'Thuốc CX2', 'Hộp', null, null);
insert into kk.dong (dot_id, so, tap, tg, kho, ma, ten, lo, hsd, hoc, hop, qc, le, sl, dvt, nguoi, tk, thao_tac, trang_thai) values
  ('DOT01', 1, false, now(), 'CHAN', 'CX-1', 'Thuốc CX1', 'L2', '2027-03-15', 'A1', null, null, null, 20, 'Viên', 'Người đếm 4', 'TK04', 'LUU', 'HIEU_LUC'),
  ('DOT01', 2, false, now(), 'CHAN', 'CX-1', 'Thuốc CX1', 'L1', '2027-03-15', 'A1', null, null, null, 10, 'Viên', 'Người đếm 4', 'TK04', 'LUU', 'HIEU_LUC'),
  ('DOT01', 3, false, now(), 'CHAN', 'CX-1', 'Thuốc CX1', 'L3', null, 'A1', null, null, null, 5, 'Viên', 'Người đếm 4', 'TK04', 'LUU', 'THAY_THE'),
  ('DOT01', 4, false, now(), 'CHAN', 'CX-1', 'Thuốc CX1', 'L4', null, 'A1', null, null, null, 5, 'Viên', 'Người đếm 4', 'TK04', 'LUU', 'CHO_DUYET'),
  ('DOT01', 5, false, now(), 'LE',   'CX-2', 'Thuốc CX2', 'L1', null, 'B1', null, null, null, 9, 'Hộp', 'Người đếm 4', 'TK04', 'LUU', 'HIEU_LUC'),
  ('DOT01', 6, true,  now(), 'CHAN', 'CX-1', 'Thuốc CX1', 'LT', null, 'A1', null, null, null, 7, 'Viên', 'Tập dượt', 'TK90', 'LUU', 'HIEU_LUC'),
  ('DOT01', 7, true,  now(), 'CHAN', 'CX-1', 'Thuốc CX1', 'LT', null, 'A1', null, null, null, 8, 'Viên', 'Tập dượt', 'TK90', 'LUU', 'CHO_DUYET');
insert into kk.so_sanh (dot_id, kho, ma, ten, lo, hsd, sl, dvt, hoc, nguoi) values
  ('DOT01', 'CHAN', 'CX-1', 'Thuốc CX1', 'L1', null, 60, 'Viên', 'A1', 'x'),
  ('DOT01', 'CHAN', 'CX-1', 'Thuốc CX1', 'L2', null, 40, 'Viên', 'A1', 'x'),
  ('DOT01', 'CHAN', 'ZZ-0', 'Thuốc ZZ', 'L1', null, 3, 'Chai', 'A1', 'x'),
  ('DOT01', 'LE',   'CX-2', 'Thuốc CX2', 'L1', null, 99, 'Hộp', 'A1', 'x');

create function pg_temp.api(extra jsonb default '{}', pin text default '222222') returns jsonb language sql as $$
  select public.api(jsonb_build_object('action', 'canXemDuLieu', 'pin', pin, 'dot', 'DOT01', 'kho', 'CHAN') || extra);
$$;

select is(pg_temp.api('{}', '444444')->>'error', 'Tài khoản ' || (select ten from kk.tai_khoan where tk = 'TK04') || ' không có quyền này', 'can_xem_quyen');
select is(pg_temp.api('{}', '999999')->>'ok', 'false', 'can_xem_quyen_tap');
select is(pg_temp.api()->>'ok', 'true', 'can_xem_to_truong_ok');
select is(pg_temp.api('{}', '111111')->>'ok', 'true', 'can_xem_it_ok');

create temp table r as select pg_temp.api() as j;
select is((select array_agg(k order by k) from r, jsonb_object_keys(j) k where k <> 'ok'), array['choDuyet','dm','live','soSanh','soVoi'], 'can_xem_khoa_json');
select is((select jsonb_array_length(j->'live') from r), 2, 'can_xem_du_lieu_live_hai_dong');
select is((select jsonb_path_query_array(j->'live', '$[*].id') from r), '["D00001","D00002"]'::jsonb, 'can_xem_live_theo_so_dong');
select is((select j->'soSanh'->'CX-1' from r), '{"sl":100,"dvt":"Viên"}'::jsonb, 'can_xem_so_sanh_cong_tong');
select ok((select j->'soSanh' ? 'ZZ-0' and not j->'soSanh' ? 'CX-2' from r), 'can_xem_so_sanh_dung_kho');
select is((select j->'dm'->'CX-1' from r), '{"ten":"Thuốc CX1","qc":100,"kho":"LE"}'::jsonb, 'can_xem_dm_co_qc_kho');
select is((select j->'dm' ? 'ZZ-0' from r), false, 'can_xem_dm_chi_ma_co_trong_danh_muc');
select is((select j->>'choDuyet' from r), '1', 'can_xem_cho_duyet_khong_tinh_tap');

-- TAP rows stay out of the real data; the TAP account itself is refused, so check dm for qc/kho null handling on LE
select is(pg_temp.api('{"kho":"LE"}')->'dm'->'CX-2', '{"ten":"Thuốc CX2","qc":"","kho":""}'::jsonb, 'can_xem_dm_rong_la_chuoi_rong');
select is(pg_temp.api('{"kho":"XX"}')->>'error', 'Chưa chọn kho', 'can_xem_kho_la');

select * from finish();
rollback;
