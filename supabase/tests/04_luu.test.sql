begin;
select plan(30);

-- helper: base request for TK04 on DOT01 / CHAN / TT-0001, with overrides merged on top
create function pg_temp.luu(extra jsonb, pin text default '444444') returns jsonb language sql as $$
  select public.api(jsonb_build_object('action', 'luu', 'pin', pin, 'dot', 'DOT01', 'kho', 'CHAN', 'ma', 'TT-0001') || extra);
$$;

-- validation, in the legacy order
select is(pg_temp.luu('{"le":5,"lo":"a1","hsd":"15/03/2027"}')->>'error', 'Chưa nhập hộc / vị trí', 'luu_thieu_hoc');
select is(pg_temp.luu('{"hoc":"a 1"}')->>'error', 'Chưa nhập số lượng', 'luu_thieu_so_luong');
select is(pg_temp.luu('{"hoc":"a 1","le":-1}')->>'error', 'Số lượng không được âm', 'luu_so_am');
select is(pg_temp.luu('{"hoc":"a 1","hop":2}')->>'error', 'Có số hộp thì phải có "1 hộp có mấy"', 'luu_hop_khong_quy_cach');
select is(pg_temp.luu('{"hoc":"a 1","le":5}')->>'error', 'Có số lượng thì phải có Số lô và HSD', 'luu_thieu_lo');
select is(pg_temp.luu('{"hoc":"a 1","le":5,"lo":"a1","hsd":"31/02/2027"}')->>'error', 'HSD không đúng dạng dd/mm/yyyy', 'luu_hsd_sai');
select is(pg_temp.luu('{"hoc":"a 1","le":5,"lo":"a1","hsd":"15/03/2027","ma":"XX"}')->>'error', 'Mã XX không có trong danh mục', 'luu_ma_la');
select is(pg_temp.luu('{"hoc":"a 1","le":"abc","lo":"a1","hsd":"15/03/2027"}')->>'error', 'Số không hợp lệ: abc', 'luu_so_khong_hop_le');
select is(pg_temp.luu('{"hoc":"a 1","le":5,"lo":"a1","hsd":"15/03/2027","kho":"XX"}')->>'error', 'Chưa chọn kho', 'luu_kho_la');
select is(pg_temp.luu('{"hoc":"a 1","le":5,"lo":"a1","hsd":"15/03/2027","thaoTac":"XOA"}')->>'error', 'Thao tác không hợp lệ', 'luu_thao_tac_la');
select is(pg_temp.luu('{"hoc":"a 1","le":5,"lo":"a1","hsd":"15/03/2027","thaoTac":"DON_LO"}')->>'error',
  'Tài khoản Người đếm 4 không có quyền này', 'luu_don_lo_can_quyen');
select is(pg_temp.luu('{"hoc":"a 1","le":5,"lo":"a1","hsd":"15/03/2027","dot":"DOT02"}')->>'error',
  'Đợt "Đợt cũ" đã đóng – chỉ xem được. Cần nhập thêm thì báo IT mở lại đợt', 'luu_dot_dong');
select is((select count(*)::int from kk.dong), 0, 'luu_loi_khong_ghi_dong');

-- success
create temp table r1 as select pg_temp.luu('{"hop":2,"qc":100,"le":5,"lo":"a1","hsd":"15/03/2027","hoc":"a 1"}') as j;
select is((select j->>'st' from r1), 'HIEU_LUC', 'luu_thanh_cong_st');
select is((select j->>'id' from r1), 'D00001', 'luu_thanh_cong_id');
select is((select j->'canhBao' from r1), '[]'::jsonb, 'luu_thanh_cong_canh_bao');
select is((select j->'lines'->0->>'id' from r1), 'D00001', 'luu_thanh_cong_lines');
select results_eq($$select sl, lo, hoc, hsd, tap, nguoi, tk, thao_tac, dvt, ten from kk.dong where dot_id = 'DOT01' and so = 1$$,
  $$values (205::numeric, 'A1', 'A 1', '2027-03-15'::date, false, 'Người đếm 4', 'TK04', 'CONG_THEM', 'Viên', 'Paracetamol 500mg')$$, 'luu_thanh_cong_dong');
select is((select so_dong from kk.dot where id = 'DOT01'), 1, 'luu_cap_so_dong');

-- warnings are stored joined and returned as an array
create temp table r2 as select pg_temp.luu('{"hop":1,"qc":50,"hoc":"a 2","lo":"lot9","hsd":"01/01/2020"}') as j;
select is((select j->'canhBao' from r2), '["Quy cách 50 khác gợi ý 100","Số lô có chữ LOT","HSD đã quá hạn"]'::jsonb, 'luu_canh_bao_mang');
select is((select canh_bao from kk.dong where dot_id = 'DOT01' and so = 2), 'Quy cách 50 khác gợi ý 100; Số lô có chữ LOT; HSD đã quá hạn', 'luu_canh_bao_cot');

-- no lot
select pg_temp.luu('{"hoc":"b 1","le":3,"khongLo":true,"lyDo":" hộp hỏng "}');
select results_eq($$select lo, hsd, ghi from kk.dong where dot_id = 'DOT01' and hoc = 'B 1'$$,
  $$values ('KHONGLO', '2099-12-31'::date, 'Hàng không có lô/HSD · hộp hỏng')$$, 'luu_khong_lo');

-- offline resend with the same reqId must not add a row
select pg_temp.luu('{"hoc":"c 1","le":4,"lo":"z1","hsd":"5/2027","reqId":"r1"}');
create temp table r3 as select pg_temp.luu('{"hoc":"c 1","le":4,"lo":"z1","hsd":"5/2027","reqId":"r1"}') as j;
select is((select (j->>'trungLap')::bool from r3), true, 'luu_gui_lai_trung_lap');
select is((select count(*)::int from kk.dong where dot_id = 'DOT01' and req_id = 'r1'), 1, 'luu_gui_lai_mot_dong');
select is((select j->>'id' from r3), (select 'D' || lpad(so::text, 5, '0') from kk.dong where req_id = 'r1'), 'luu_gui_lai_tra_id_cu');
select is((select jsonb_array_length(j->'lines') from r3), 4, 'luu_gui_lai_co_lines');

-- gtin learning
select pg_temp.luu('{"hoc":"d 1","le":1,"lo":"g1","hsd":"15/03/2027","gtin":"893-5001234567"}');
select pg_temp.luu('{"hoc":"d 2","le":1,"lo":"g1","hsd":"15/03/2027","gtin":"8935001234567"}');
select is((select gtin from kk.thuoc where ma = 'TT-0001'), '{8935001234567}'::text[], 'luu_hoc_gtin_khong_nhan_doi');

-- practice account: own rows, no gtin learning
select pg_temp.luu('{"hoc":"t 1","le":2,"lo":"t1","hsd":"15/03/2027","gtin":"8935009999999"}', '999999');
select is((select count(*)::int from kk.dong where hoc = 'T 1' and tap), 1, 'luu_tap_ghi_rieng');
select is(kk.dong_cua('DOT01', false, 'CHAN', 'TT-0001')::text like '%"A 1"%' and kk.dong_cua('DOT01', false, 'CHAN', 'TT-0001')::text not like '%"T 1"%', true, 'luu_tap_khong_lan_vao_that');
select is((select gtin from kk.thuoc where ma = 'TT-0001'), '{8935001234567}'::text[], 'luu_tap_khong_hoc_gtin');

select * from finish();
rollback;
