begin;
select plan(35);

-- taoDot validation
select is((public.api('{"action":"taoDot","pin":"444444","ten":"Kiểm kho thử","kho":["CHAN"]}')->>'error'),
  'Tài khoản ' || (select ten from kk.tai_khoan where tk = 'TK04') || ' không có quyền này', 'tao_dot_chi_it');
select is((public.api('{"action":"taoDot","pin":"111111","ten":"ab","kho":["CHAN"]}')->>'error'),
  'Nhập tên đợt (VD: Kiểm kho cuối năm 2026)', 'tao_dot_ten_ngan');
select is((public.api('{"action":"taoDot","pin":"111111","ten":"Đợt mới","kho":["XX"]}')->>'error'),
  'Chọn ít nhất 1 kho', 'tao_dot_chon_kho');
select is((public.api('{"action":"taoDot","pin":"111111","ten":"dot  THU!","kho":["CHAN"]}')->>'error'),
  'Đã có đợt tên "dot  THU!"', 'tao_dot_trung_ten');
select is((public.api('{"action":"taoDot","pin":"111111","ten":"Đợt mới","kho":["CHAN"],"soVoi":"DOT99"}')->>'error'),
  'Không thấy đợt so sánh DOT99', 'tao_dot_so_voi_la');
select is((public.api('{"action":"taoDot","pin":"111111","ten":"Đợt A","kho":["CHAN"]}')->>'ok'), 'true', 'tao_dot_a');
select is((public.api('{"action":"taoDot","pin":"111111","ten":"dot-a","kho":["CHAN"]}')->>'error'),
  'Đã có đợt tên "dot-a"', 'tao_dot_trung_ten_chuan_hoa');
delete from kk.nhat_ky where dot_id = 'DOT03'; delete from kk.dot_kho where dot_id = 'DOT03'; delete from kk.dot where id = 'DOT03';
select is((select count(*)::int from kk.dot), 2, 'tao_dot_loi_khong_them_dot');

-- source data in DOT01
insert into kk.dong (dot_id, so, tap, kho, ma, ten, lo, hsd, hoc, sl, dvt, nguoi, tk, thao_tac, trang_thai) values
  ('DOT01', 1, false, 'CHAN', 'TT-0001', 'Paracetamol 500mg', 'L1', '2027-05-01', 'A1', 10, 'Viên', 'x', 'TK04', 'LUU', 'HIEU_LUC'),
  ('DOT01', 2, false, 'CHAN', 'TT-0001', 'Paracetamol 500mg', 'L2', '2027-06-01', 'A1', 5, 'Viên', 'x', 'TK04', 'LUU', 'HIEU_LUC'),
  ('DOT01', 3, false, 'CHAN', 'TT-0001', 'Paracetamol 500mg', 'L3', null, 'A1', 7, 'Viên', 'x', 'TK04', 'LUU', 'HUY'),
  ('DOT01', 4, false, 'LE', 'TT-0009', 'Vitamin C', 'L1', null, 'B1', 3, 'Viên', 'x', 'TK04', 'LUU', 'HIEU_LUC'),
  ('DOT01', 5, true, 'CHAN', 'TT-0001', 'Paracetamol 500mg', 'L1', null, 'A1', 3, 'Viên', 'x', 'TK90', 'LUU', 'HIEU_LUC');
insert into kk.hoc (dot_id, tap, kho, hoc, trang_thai, nguoi) values
  ('DOT01', false, 'CHAN', 'A1', 'XONG', 'x'),
  ('DOT01', true,  'CHAN', 'A2', 'XONG', 'x'),
  ('DOT01', false, 'LE',   'B1', 'XONG', 'x');

select is((public.api('{"action":"taoDot","pin":"111111","ten":"Kiểm kho thử 1","kho":["chan","CHAN"],"soVoi":"DOT01"}')->'dot'->>'id'),
  'DOT03', 'tao_dot_ma_tiep_theo');
select is((select count(*)::int from kk.so_sanh where dot_id = 'DOT03'), 2, 'tao_dot_chep_so_sanh');
select is((select so_voi from kk.dot where id = 'DOT03'), 'Đợt thử', 'tao_dot_so_voi_ten');
select is((select to_json(array_agg(h order by h.hoc))::text from (select tap, kho, hoc, trang_thai from kk.hoc where dot_id = 'DOT03') h),
  '[{"tap":false,"kho":"CHAN","hoc":"A1","trang_thai":"CHUA_NHAN"}]', 'tao_dot_chep_hoc');
select is((select count(*)::int from kk.dot_kho where dot_id = 'DOT03'), 1, 'tao_dot_dot_kho');
select is((select nguoi_tao from kk.dot where id = 'DOT03'), 'Quản trị IT', 'tao_dot_nguoi_tao');
select is((select count(*)::int from kk.nhat_ky where hanh_dong = 'TAO_DOT' and dot_id = 'DOT03'), 1, 'tao_dot_nhat_ky');

select is((public.api('{"action":"taoDot","pin":"111111","ten":"Kiểm kho thử 2","kho":["CHAN","LE"],"soVoi":"DOT01","copyHoc":false}')->'dot'->>'id'),
  'DOT04', 'tao_dot_ma_tiep_theo_2');
select is((select count(*)::int from kk.hoc where dot_id = 'DOT04'), 0, 'tao_dot_khong_chep_hoc');
select is((select count(*)::int from kk.so_sanh where dot_id = 'DOT04'), 3, 'tao_dot_chep_so_sanh_hai_kho');

-- dsDot
select is(jsonb_array_length(public.api('{"action":"dsDot","pin":"111111"}')->'list'), 4, 'ds_dot_it');
select is(jsonb_array_length(public.api('{"action":"dsDot","pin":"444444"}')->'list'), 3, 'ds_dot_dem_chi_thay_mo');

-- datTrangThaiDot
select is((public.api('{"action":"datTrangThaiDot","pin":"111111","id":"DOT99","st":"DONG"}')->>'error'), 'Không thấy đợt DOT99', 'dong_dot_la');
select is((public.api('{"action":"datTrangThaiDot","pin":"111111","id":"DOT01","st":"X"}')->>'error'), 'Trạng thái đợt không hợp lệ', 'dong_dot_st_sai');
select is((public.api('{"action":"datTrangThaiDot","pin":"111111","id":"DOT01","st":"DONG"}')->'dot'->>'st'), 'DONG', 'dong_dot');
select matches((select ghi_chu from kk.dot where id = 'DOT01'), '^Đóng \d\d/\d\d \d\d:\d\d bởi Quản trị IT$', 'dong_dot_ghi_chu');
select throws_like($$select kk.dung_dot('DOT01', (select t from kk.tai_khoan t where tk = 'TK01'), true)$$,
  '%đã đóng%', 'dong_dot_chan_ghi');
select is((public.api('{"action":"datTrangThaiDot","pin":"111111","id":"DOT01","st":"MO"}')->>'ok'), 'true', 'mo_lai_dot');

-- kho outside the đợt
select throws_ok($$select kk.kiem_kho((select d from kk.dot d where id = 'DOT03'), 'LE')$$,
  'Đợt "Kiểm kho thử 1" không kiểm Kho lẻ', 'kho_ngoai_dot');

-- datTrangThaiKho
select is((public.api('{"action":"datTrangThaiKho","pin":"111111","dot":"DOT03","kho":"CHAN","trangThai":"X"}')->>'error'), 'Trạng thái không hợp lệ', 'chot_kho_sai');
select is((public.api('{"action":"datTrangThaiKho","pin":"111111","dot":"DOT03","kho":"CHAN","trangThai":"DA_CHOT"}')->>'trangThai'), 'DA_CHOT', 'chot_kho_ok');
select is((public.api('{"action":"login","pin":"444444","dot":"DOT03"}')->'dotInfo'->'trangThai'->>'CHAN'), 'DA_CHOT', 'chot_kho');

-- danhMuc
select is((public.api('{"action":"danhMuc","pin":"444444"}')->'list'),
  '[["TT-0001","Paracetamol 500mg","Hộp",100,"Viên","CHAN",""],["TT-0009","Vitamin C","","","Viên","LE",""]]'::jsonb, 'danh_muc_list');
select is((public.api('{"action":"danhMuc","pin":"444444"}')->>'v'), (public.api('{"action":"danhMuc","pin":"555555"}')->>'v'), 'danh_muc_v_on_dinh');
select is(length(public.api('{"action":"danhMuc","pin":"444444"}')->>'v'), 12, 'danh_muc_v_12_ky_tu');
select is((public.api(jsonb_build_object('action', 'danhMuc', 'pin', '444444', 'v', public.api('{"action":"danhMuc","pin":"444444"}')->>'v'))->>'same')
  || (public.api(jsonb_build_object('action', 'danhMuc', 'pin', '444444', 'v', public.api('{"action":"danhMuc","pin":"444444"}')->>'v')) ? 'list')::text,
  'truefalse', 'danh_muc_same');
create temp table v0 as select public.api('{"action":"danhMuc","pin":"444444"}')->>'v' as v;
update kk.thuoc set gtin = '{893001}' where ma = 'TT-0009';
select isnt((public.api('{"action":"danhMuc","pin":"444444"}')->>'v'), (select v from v0), 'danh_muc_v_doi_khi_sua');

select * from finish();
rollback;
