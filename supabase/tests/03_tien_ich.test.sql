begin;
select plan(34);

-- parse_hsd
select is(kk.parse_hsd('15/03/2027'), '2027-03-15'::date, 'hsd_d_m_yyyy');
select is(kk.parse_hsd('1-3-27'), '2027-03-01'::date, 'hsd_nam_2_so');
select is(kk.parse_hsd('5/2027'), '2027-05-31'::date, 'hsd_thang_nam');
select is(kk.parse_hsd('2/2028'), '2028-02-29'::date, 'hsd_thang_nam_nhuan');
select is(kk.parse_hsd('3.4.2027'), '2027-04-03'::date, 'hsd_dau_cham');
select is(kk.parse_hsd('31/02/2027'), null, 'hsd_ngay_khong_co');
select is(kk.parse_hsd('13/2027'), null, 'hsd_thang_13');
select is(kk.parse_hsd('1/1/2101'), null, 'hsd_nam_ngoai_khoang');
select is(kk.parse_hsd('1/1/1999'), null, 'hsd_nam_nho');
select is(kk.parse_hsd('abc'), null, 'hsd_chu');
select is(kk.parse_hsd(null), null, 'hsd_null');

-- keys
select is(kk.lo_key(' ab-12. '), 'AB-12', 'lo_key');
select is(kk.lo_key('a b  c'), 'ABC', 'lo_key_bo_khoang_trang');
select is(kk.lo_text('  ab   c '), 'AB C', 'lo_text');
select is(kk.hoc_key('  a 1   b '), 'A 1 B', 'hoc_key');
select is(kk.norm_ten('Paracetamol 500mg'), kk.norm_ten('PARACETAMOL 500 MG'), 'norm_ten');

-- dong_json / dong_cua / so_dong
insert into kk.dong (dot_id, so, tap, tg, kho, ma, ten, lo, hsd, hoc, hop, qc, le, sl, dvt, nguoi, tk, thao_tac, trang_thai, ghi, canh_bao, se_thay) values
  ('DOT01', 7, false, '2026-10-30 03:05:00+00', 'CHAN', 'ZZ-1', 'Thuốc Z', 'L9', '2027-03-15', 'A1', null, 50, 2, 12, 'Viên', 'x', 'TK04', 'LUU', 'HIEU_LUC', 'g', 'c', '{3,4}'),
  ('DOT01', 8, false, now(), 'CHAN', 'ZZ-1', 'Thuốc Z', 'L9', null, 'A1', 3, 50, 0, 150, 'Viên', 'x', 'TK04', 'LUU', 'CHO_DUYET', '', '', '{}'),
  ('DOT01', 9, false, now(), 'CHAN', 'ZZ-1', 'Thuốc Z', 'L9', null, 'A1', 3, 50, 0, 150, 'Viên', 'x', 'TK04', 'LUU', 'HUY', '', '', '{}'),
  ('DOT01', 10, true, now(), 'CHAN', 'ZZ-1', 'Thuốc Z', 'L9', null, 'A1', 3, 50, 0, 150, 'Viên', 'x', 'TK90', 'LUU', 'HIEU_LUC', '', '', '{}');
select is(kk.dong_json(d)->>'id', 'D00007', 'dong_id') from kk.dong d where dot_id = 'DOT01' and so = 7;
select is(kk.dong_json(d)->>'hsd', '15/03/2027', 'dong_hsd') from kk.dong d where dot_id = 'DOT01' and so = 7;
select is(kk.dong_json(d)->>'tg', '30/10 10:05', 'dong_tg_gio_vn') from kk.dong d where dot_id = 'DOT01' and so = 7;
select is(kk.dong_json(d)->'hop', '""'::jsonb, 'dong_hop_null_thanh_chuoi_rong') from kk.dong d where dot_id = 'DOT01' and so = 7;
select is(kk.dong_json(d)->'qc', '50'::jsonb, 'dong_qc_so') from kk.dong d where dot_id = 'DOT01' and so = 7;
select is(kk.dong_json(d)->>'seThay', 'D00003,D00004', 'dong_se_thay') from kk.dong d where dot_id = 'DOT01' and so = 7;
select is(kk.dong_json(d)->>'hsd', '', 'dong_hsd_null') from kk.dong d where dot_id = 'DOT01' and so = 8;
select is(jsonb_path_query_array(kk.dong_cua('DOT01', false, 'CHAN', 'ZZ-1'), '$[*].id'), '["D00007","D00008"]'::jsonb, 'dong_cua_hieu_luc_va_cho_duyet');
select is(kk.dong_cua('DOT01', false, 'CHAN', 'KHONG-CO'), '[]'::jsonb, 'dong_cua_rong');
select is(kk.so_dong('D00012'), 12, 'so_dong');
select throws_ok($$select kk.so_dong('X1')$$, 'Mã dòng không hợp lệ', 'so_dong_sai');

-- canh_bao
insert into kk.thuoc (ma, ten, dvt, quy_cach, kho_mac_dinh) values ('ZZ-1', 'Thuốc Z', 'Viên', 100, 'LE');
select ok('Số lô có chữ LOT' = any (kk.canh_bao(null, 'CHAN', 'LOT123', null, null, null)), 'cb_lo_chu_lot');
select ok('HSD đã quá hạn' = any (kk.canh_bao(null, 'CHAN', 'A', current_date - 1, null, null)), 'cb_qua_han');
select ok('HSD còn dưới 90 ngày' = any (kk.canh_bao(null, 'CHAN', 'A', current_date + 30, null, null)), 'cb_sap_het_han');
select ok('Quy cách 50 khác gợi ý 100' = any (kk.canh_bao((select t from kk.thuoc t where ma = 'ZZ-1'), 'CHAN', 'A', null, 2, 50)), 'cb_quy_cach');
select ok('Thuốc thuộc Kho lẻ' = any (kk.canh_bao((select t from kk.thuoc t where ma = 'ZZ-1'), 'CHAN', 'A', null, null, null)), 'cb_kho');
select ok('Số lô trông giống ngày tháng' = any (kk.canh_bao(null, 'CHAN', '1/5/27', null, null, null)), 'cb_lo_giong_ngay');
select is(kk.canh_bao(null, 'CHAN', 'A1', current_date + 400, null, null), '{}'::text[], 'cb_sach');

select * from finish();
rollback;
