begin;
select plan(139);

-- helper: IT (TK01) by default, on DOT01 / CHAN
create function pg_temp.api(act text, extra jsonb default '{}', pin text default '111111') returns jsonb language sql as $$
  select public.api(jsonb_build_object('action', act, 'pin', pin, 'dot', 'DOT01', 'kho', 'CHAN') || extra);
$$;

-- ---------------------------------------------------------------- permissions
select is(pg_temp.api('luuKho', '{"ma":"K9","ten":"Kho 9","tenNgan":"K9"}', '222222')->>'error', 'Tài khoản Tổ trưởng 1 không có quyền này', 'cau_hinh_chi_it');
select is(pg_temp.api('dsTaiKhoan', '{}', '444444')->>'ok', 'false', 'cau_hinh_chi_it_ds_tai_khoan');
select is(pg_temp.api('luuTaiKhoan', '{"ten":"x","role":"DEM"}', '222222')->>'ok', 'false', 'cau_hinh_chi_it_luu_tai_khoan');
select is(pg_temp.api('datLaiPin', '{"tk":"TK04"}', '222222')->>'ok', 'false', 'cau_hinh_chi_it_dat_lai_pin');
select is(pg_temp.api('luuThuoc', '{"ma":"X","ten":"x","dvt":"Viên"}', '222222')->>'ok', 'false', 'cau_hinh_chi_it_luu_thuoc');
select is(pg_temp.api('nhapThuoc', '{"list":[]}', '222222')->>'ok', 'false', 'cau_hinh_chi_it_nhap_thuoc');
select is(pg_temp.api('luuHoc', '{"them":["A1"]}', '222222')->>'ok', 'false', 'cau_hinh_chi_it_luu_hoc');
select is(pg_temp.api('luuCauHinh', '{"khoa":"LO_MAC_DINH","giaTri":"X"}', '222222')->>'ok', 'false', 'cau_hinh_chi_it_luu_cau_hinh');
select is(pg_temp.api('nhapSoSanh', '{"list":[]}', '222222')->>'ok', 'false', 'cau_hinh_chi_it_nhap_so_sanh');
select is(pg_temp.api('xuatDot', '{}', '444444')->>'ok', 'false', 'cau_hinh_xuat_dot_dem_bi_chan');

-- ---------------------------------------------------------------- dsTaiKhoan
create temp table r_ds as select pg_temp.api('dsTaiKhoan') as j;
select is((select jsonb_array_length(j->'list') from r_ds), 6, 'ds_tai_khoan_sau_dong');
select is((select array_agg(k order by k) from r_ds, jsonb_array_elements(j->'list') e, jsonb_object_keys(e) k where e->>'tk' = 'TK04'),
  array['active','ghiChu','pin','role','roleTen','ten','tk'], 'ds_tai_khoan_khoa_json');
select is((select e from r_ds, jsonb_array_elements(j->'list') e where e->>'tk' = 'TK99'),
  '{"tk":"TK99","ten":"Người đếm 99","pin":"000000","role":"DEM","roleTen":"Người đếm","active":false,"ghiChu":""}'::jsonb, 'ds_tai_khoan_gia_tri');
select is((select e->>'roleTen' from r_ds, jsonb_array_elements(j->'list') e where e->>'tk' = 'TK90'), 'Tập (không tính)', 'ds_tai_khoan_role_ten_tap');

-- ---------------------------------------------------------------- luuTaiKhoan
create temp table r_tk as select pg_temp.api('luuTaiKhoan', '{"ten":"  Người đếm mới ","role":"DEM","active":true,"ghiChu":"ca tối"}') as j;
select is((select j->>'ok' from r_tk), 'true', 'tao_tai_khoan_ok');
select is((select j->'taiKhoan'->>'tk' from r_tk), 'TK100', 'tao_tai_khoan_ma_ke_tiep');
select matches((select j->'taiKhoan'->>'pin' from r_tk), '^[1-9]\d{5}$', 'tao_tai_khoan_pin_6_so');
select is((select (j->'taiKhoan') - 'pin'::text from r_tk),
  '{"tk":"TK100","ten":"Người đếm mới","role":"DEM","roleTen":"Người đếm","active":true,"ghiChu":"ca tối"}'::jsonb, 'tao_tai_khoan_dang_ds');
select is((select count(*)::int from kk.tai_khoan where pin = (select j->'taiKhoan'->>'pin' from r_tk)), 1, 'tao_tai_khoan_pin_khong_trung');
select is(public.api(jsonb_build_object('action', 'login', 'pin', (select j->'taiKhoan'->>'pin' from r_tk)))->>'tk', 'TK100', 'tao_tai_khoan_dang_nhap_duoc');
select is(pg_temp.api('luuTaiKhoan', '{"ten":"Tập 2","role":"TAP"}')->'taiKhoan'->>'tk', 'TK101', 'tao_tai_khoan_ma_tiep_theo');
select is((select hoat_dong from kk.tai_khoan where tk = 'TK101'), true, 'tao_tai_khoan_mac_dinh_hoat_dong');
select is(pg_temp.api('luuTaiKhoan', '{"ten":"  ","role":"DEM"}')->>'error', 'Nhập tên hiển thị', 'tao_tai_khoan_thieu_ten');
select is(pg_temp.api('luuTaiKhoan', '{"ten":"x","role":"ADMIN"}')->>'error', 'Vai trò không hợp lệ', 'tao_tai_khoan_vai_tro_la');
select is(pg_temp.api('luuTaiKhoan', '{"tk":"TK77","ten":"x","role":"DEM"}')->>'error', 'Không thấy tài khoản TK77', 'sua_tai_khoan_khong_co');

-- edit: pin stays, omitted active/ghiChu stay
create temp table pin_truoc as select pin from kk.tai_khoan where tk = 'TK05';
select is(pg_temp.api('luuTaiKhoan', '{"tk":"TK05","ten":"Người đếm 5b","role":"TO_TRUONG"}')->'taiKhoan'->>'roleTen', 'Tổ trưởng', 'sua_tai_khoan_ok');
select is((select pin from kk.tai_khoan where tk = 'TK05'), (select pin from pin_truoc), 'sua_tai_khoan_giu_pin');
select results_eq($$select ten, vai_tro, hoat_dong from kk.tai_khoan where tk = 'TK05'$$, $$values ('Người đếm 5b'::text, 'TO_TRUONG'::text, true)$$, 'sua_tai_khoan_luu_dung');
select is(pg_temp.api('luuTaiKhoan', '{"tk":"TK05","ten":"Người đếm 5b","role":"DEM","active":false,"ghiChu":"nghỉ"}')->'taiKhoan'->>'active', 'false', 'sua_tai_khoan_khoa');
select is((select ghi_chu from kk.tai_khoan where tk = 'TK05'), 'nghỉ', 'sua_tai_khoan_ghi_chu');

-- ---------------------------------------------------------------- self protection
select is(pg_temp.api('luuTaiKhoan', '{"tk":"TK01","ten":"Quản trị IT","role":"IT","active":false}')->>'error', 'Không tự khoá hoặc đổi vai của chính mình', 'khong_tu_khoa_minh');
select is(pg_temp.api('luuTaiKhoan', '{"tk":"TK01","ten":"Quản trị IT","role":"DEM","active":true}')->>'error', 'Không tự khoá hoặc đổi vai của chính mình', 'khong_tu_ha_vai_minh');
select is(pg_temp.api('luuTaiKhoan', '{"tk":"TK01","ten":"Quản trị IT 2","role":"IT","active":true,"ghiChu":"ok"}')->>'ok', 'true', 'tu_sua_ten_van_duoc');

-- ---------------------------------------------------------------- datLaiPin
create temp table pin_cu as select pin from kk.tai_khoan where tk = 'TK04';
create temp table r_pin as select pg_temp.api('datLaiPin', '{"tk":"TK04"}') as j;
select matches((select j->>'pin' from r_pin), '^[1-9]\d{5}$', 'dat_lai_pin_6_so');
select isnt((select j->>'pin' from r_pin), (select pin from pin_cu), 'dat_lai_pin_khac_cu');
select is((select pin from kk.tai_khoan where tk = 'TK04'), (select j->>'pin' from r_pin), 'dat_lai_pin_da_luu');
select is(public.api('{"action":"login","pin":"444444"}')->>'ok', 'false', 'dat_lai_pin_pin_cu_het_hieu_luc');
select is(pg_temp.api('datLaiPin', '{"tk":"TK77"}')->>'error', 'Không thấy tài khoản TK77', 'dat_lai_pin_tk_la');
select is((select count(*)::int from kk.nhat_ky where hanh_dong in ('LUU_TAI_KHOAN', 'DAT_LAI_PIN')), 6, 'tai_khoan_ghi_nhat_ky');
select is((select count(*)::int from kk.nhat_ky where chi_tiet like '%' || (select j->>'pin' from r_pin) || '%' or chi_tiet like '%' || (select j->'taiKhoan'->>'pin' from r_tk) || '%'), 0, 'tai_khoan_nhat_ky_khong_co_pin');

-- ---------------------------------------------------------------- luuThuoc
select is(pg_temp.api('luuThuoc', '{"ma":" TT-5000 ","ten":" Aspirin ","dvtn":"Hộp","qc":"10,5","dvt":"Viên","kho":"CHAN","gtin":"8934567890123, 12345678  "}'), '{"ok":true}'::jsonb, 'luu_thuoc_them');
select results_eq($$select ten, dvt_nhap, quy_cach, dvt, kho_mac_dinh, gtin from kk.thuoc where ma = 'TT-5000'$$,
  $$values ('Aspirin'::text, 'Hộp'::text, 10.5::numeric, 'Viên'::text, 'CHAN'::text, array['8934567890123','12345678'])$$, 'luu_thuoc_gia_tri');
select is(pg_temp.api('luuThuoc', '{"ma":"TT-5000","ten":"Aspirin 81","dvt":"Viên","kho":"","qc":"","gtin":""}')->>'ok', 'true', 'luu_thuoc_sua');
select results_eq($$select ten, quy_cach, kho_mac_dinh, gtin from kk.thuoc where ma = 'TT-5000'$$,
  $$values ('Aspirin 81'::text, null::numeric, null::text, '{}'::text[])$$, 'luu_thuoc_sua_dat_rong');
select is((select count(*)::int from kk.thuoc where ma = 'TT-5000'), 1, 'luu_thuoc_khong_trung_ma');
select is(pg_temp.api('luuThuoc', '{"ma":"","ten":"x","dvt":"Viên"}')->>'error', 'Nhập mã thuốc', 'luu_thuoc_thieu_ma');
select is(pg_temp.api('luuThuoc', '{"ma":"A","ten":"","dvt":"Viên"}')->>'error', 'Nhập tên thuốc', 'luu_thuoc_thieu_ten');
select is(pg_temp.api('luuThuoc', '{"ma":"A","ten":"x","dvt":""}')->>'error', 'Nhập đơn vị tính nhỏ nhất', 'luu_thuoc_thieu_dvt');
select is(pg_temp.api('luuThuoc', '{"ma":"A","ten":"x","dvt":"Viên","kho":"ZZ"}')->>'error', 'Kho mặc định ZZ không tồn tại', 'luu_thuoc_kho_la');
select is(pg_temp.api('luuThuoc', '{"ma":"A","ten":"x","dvt":"Viên","qc":"abc"}')->>'error', 'Quy cách phải là số', 'luu_thuoc_qc_chu');
select is(pg_temp.api('luuThuoc', '{"ma":"A","ten":"x","dvt":"Viên","gtin":"12ab"}')->>'error', 'Mã vạch phải gồm 8–14 chữ số: 12ab', 'luu_thuoc_gtin_sai');

-- ---------------------------------------------------------------- nhapThuoc
create temp table r_nt as select pg_temp.api('nhapThuoc', $j${"list":[
  ["TT-6001","Thuốc mới","Hộp",20,"Viên","LE","8931111111111"],
  ["TT-0001","Paracetamol 500 sửa","Hộp","100","Viên","CHAN",""],
  ["TT-6003","Thiếu đơn vị","Hộp",20,"","LE",""],
  ["TT-6004","Kho lạ","Hộp",20,"Viên","ZZ",""]]}$j$) as j;
select is((select j->>'ok' from r_nt), 'true', 'nhap_thuoc_ok');
select is((select (j->>'them')::int from r_nt), 1, 'nhap_thuoc_them');
select is((select (j->>'sua')::int from r_nt), 1, 'nhap_thuoc_sua');
select is((select jsonb_array_length(j->'loi') from r_nt), 2, 'nhap_thuoc_so_dong_loi');
select is((select j->'loi'->0 from r_nt), '{"dong":3,"error":"Nhập đơn vị tính nhỏ nhất"}'::jsonb, 'nhap_thuoc_dong_loi_thieu_dvt');
select is((select ten from kk.thuoc where ma = 'TT-0001'), 'Paracetamol 500 sửa', 'nhap_thuoc_dong_sua_da_luu');
select is((select count(*)::int from kk.thuoc where ma in ('TT-6003', 'TT-6004')), 0, 'nhap_thuoc_dong_loi_khong_luu');
select is((select count(*)::int from kk.thuoc), 4, 'nhap_thuoc_khong_xoa_ma_nao');
select is(pg_temp.api('luuThuoc', '{"ma":"TT-5000","ten":"Aspirin 81","dvt":"Viên","gtin":["12345678"]}')->>'ok', 'true', 'luu_thuoc_gtin_dang_mang');
select results_eq($$select (pg_temp.api('nhapThuoc', '{"list":[["TT-5000","Aspirin 82","","","Viên","",""]]}')->>'sua')::int, gtin from kk.thuoc where ma = 'TT-5000'$$,
  $$values (1, array['12345678'])$$, 'nhap_thuoc_gtin_rong_giu_ma_vach_cu');
select is(pg_temp.api('nhapThuoc', '{"list":"x"}')->>'error', 'Danh sách thuốc không hợp lệ', 'nhap_thuoc_list_khong_phai_mang');

-- ---------------------------------------------------------------- luuKho
select is(pg_temp.api('luuKho', '{"ma":"k3","ten":"Kho ba","tenNgan":"BA","thuTu":3,"hoatDong":true}'), '{"ok":true}'::jsonb, 'luu_kho_them');
select results_eq($$select ten, ten_ngan, thu_tu, hoat_dong from kk.kho where ma = 'K3'$$, $$values ('Kho ba'::text, 'BA'::text, 3, true)$$, 'luu_kho_them_gia_tri');
select is(pg_temp.api('luuKho', '{"ma":"K3","ten":"Kho ba b","tenNgan":"BA","thuTu":4,"hoatDong":false}')->>'ok', 'true', 'luu_kho_an_kho_chua_dung');
select is((select hoat_dong from kk.kho where ma = 'K3'), false, 'luu_kho_da_an');
select is(pg_temp.api('luuKho', '{"ma":"K 3!","ten":"x","tenNgan":"x"}')->>'error', 'Mã kho chỉ gồm chữ, số, gạch dưới (tối đa 10 ký tự)', 'luu_kho_ma_sai');
select is(pg_temp.api('luuKho', '{"ma":"K4","ten":"x","tenNgan":" "}')->>'error', 'Nhập tên ngắn của kho', 'luu_kho_thieu_ten_ngan');
select is(pg_temp.api('luuKho', '{"ma":"K4","ten":"","tenNgan":"x"}')->>'error', 'Nhập tên kho', 'luu_kho_thieu_ten');
select is(pg_temp.api('luuKho', '{"ma":"K4","ten":"x","tenNgan":"x","thuTu":"a"}')->>'error', 'Thứ tự phải là số nguyên', 'luu_kho_thu_tu_chu');
select is(pg_temp.api('luuKho', '{"ma":"CHAN","ten":"Kho chẵn","tenNgan":"CHẴN","thuTu":1,"hoatDong":false}')->>'error', 'Kho Kho chẵn đang dùng trong đợt Đợt thử', 'an_kho_dang_dung');
select is((select hoat_dong from kk.kho where ma = 'CHAN'), true, 'an_kho_dang_dung_khong_doi');
select is(pg_temp.api('luuKho', '{"ma":"CHAN","ten":"Kho chẵn","tenNgan":"CHẴN","thuTu":1,"hoatDong":true}')->>'ok', 'true', 'luu_kho_giu_hoat_dong');

-- ---------------------------------------------------------------- luuHoc
insert into kk.hoc (dot_id, tap, kho, hoc, trang_thai) values
  ('DOT01', false, 'CHAN', 'B1', 'CHUA_NHAN'), ('DOT01', false, 'CHAN', 'B2', 'DANG_DEM'),
  ('DOT01', false, 'CHAN', 'B3', 'CHUA_NHAN'), ('DOT01', false, 'CHAN', 'B4', 'CHUA_NHAN');
insert into kk.dong (dot_id, so, tap, tg, kho, ma, ten, lo, hoc, sl, dvt, nguoi, tk, thao_tac, trang_thai) values
  ('DOT01', 1, false, now(), 'CHAN', 'TT-0001', 'Paracetamol', 'L1', 'B3', 5, 'Viên', 'x', 'TK04', 'LUU', 'HUY'),
  ('DOT01', 2, true,  now(), 'CHAN', 'TT-0001', 'Paracetamol', 'L1', 'B4', 5, 'Viên', 'x', 'TK90', 'LUU', 'HIEU_LUC');
create temp table r_h as select pg_temp.api('luuHoc', '{"them":["a 10","A  10"," ","a 11","B1"],"xoa":[]}') as j;
select is((select j - 'ok'::text from r_h), '{"them":2,"xoa":0}'::jsonb, 'luu_hoc_them_chuan_hoa_bo_trung');
select is((select array_agg(hoc order by hoc) from kk.hoc where dot_id = 'DOT01' and kho = 'CHAN' and hoc like 'A %'), array['A 10','A 11'], 'luu_hoc_ten_chuan_hoa');
select is((select tap from kk.hoc where hoc = 'A 10'), false, 'luu_hoc_khong_tap');
select is(pg_temp.api('luuHoc', '{"them":[],"xoa":["a 11"," b1 "]}')->'xoa', '2', 'luu_hoc_xoa_chua_nhan');
select is((select count(*)::int from kk.hoc where hoc in ('A 11', 'B1')), 0, 'luu_hoc_xoa_da_xoa');
select is(pg_temp.api('luuHoc', '{"xoa":["B2"]}')->>'error', 'Hộc B2 đã có người đếm – không xoá được', 'xoa_hoc_dang_dem');
select is(pg_temp.api('luuHoc', '{"xoa":["A 10","B3"]}')->>'error', 'Hộc B3 đã có người đếm – không xoá được', 'xoa_hoc_da_dem');
select is((select count(*)::int from kk.hoc where hoc = 'A 10'), 1, 'xoa_hoc_loi_thi_khong_xoa_gi');
select is(pg_temp.api('luuHoc', '{"xoa":["B4"]}')->'xoa', '1', 'xoa_hoc_dong_tap_khong_chan');
select is(pg_temp.api('luuHoc', '{"them":["Z1"],"dot":"DOT02"}')->>'ok', 'false', 'luu_hoc_dot_dong_bi_chan');
select is(pg_temp.api('luuHoc', '{"them":["Z1"],"kho":"XX"}')->>'error', 'Chưa chọn kho', 'luu_hoc_kho_la');

-- ---------------------------------------------------------------- luuCauHinh
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_CANH_BAO_NGAY","giaTri":60}'), '{"ok":true}'::jsonb, 'cau_hinh_so_ngay_ok');
select is((select gia_tri from kk.cau_hinh where khoa = 'HSD_CANH_BAO_NGAY'), '60'::jsonb, 'cau_hinh_so_ngay_la_so');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_CANH_BAO_NGAY","giaTri":"45"}')->>'ok', 'true', 'cau_hinh_so_ngay_chuoi_so_nguyen');
select is((select gia_tri from kk.cau_hinh where khoa = 'HSD_CANH_BAO_NGAY'), '45'::jsonb, 'cau_hinh_so_ngay_chuoi_luu_thanh_so');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_CANH_BAO_NGAY","giaTri":"abc"}')->>'error', 'Số ngày cảnh báo HSD phải là số nguyên từ 0 đến 3650', 'cau_hinh_sai_kieu');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_CANH_BAO_NGAY","giaTri":"30.0"}')->>'ok', 'false', 'cau_hinh_so_ngay_30_cham_0_chuoi');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_CANH_BAO_NGAY","giaTri":3651}')->>'ok', 'false', 'cau_hinh_so_ngay_qua_lon');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_CANH_BAO_NGAY","giaTri":-1}')->>'ok', 'false', 'cau_hinh_so_ngay_am');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_CANH_BAO_NGAY","giaTri":1.5}')->>'ok', 'false', 'cau_hinh_so_ngay_le');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_CANH_BAO_NGAY","giaTri":null}')->>'ok', 'false', 'cau_hinh_so_ngay_null');
select is((select gia_tri from kk.cau_hinh where khoa = 'HSD_CANH_BAO_NGAY'), '45'::jsonb, 'cau_hinh_loi_khong_doi_gia_tri');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_MAC_DINH","giaTri":"1/2/2100"}')->>'ok', 'true', 'cau_hinh_hsd_mac_dinh_ok');
select is((select gia_tri from kk.cau_hinh where khoa = 'HSD_MAC_DINH'), '"01/02/2100"'::jsonb, 'cau_hinh_hsd_mac_dinh_dd_mm_yyyy');
select is(pg_temp.api('luuCauHinh', '{"khoa":"HSD_MAC_DINH","giaTri":"31/02/2100"}')->>'ok', 'false', 'cau_hinh_hsd_mac_dinh_sai');
select is(pg_temp.api('luuCauHinh', '{"khoa":"LO_MAC_DINH","giaTri":"  "}')->>'ok', 'false', 'cau_hinh_lo_mac_dinh_rong');
select is(pg_temp.api('luuCauHinh', '{"khoa":"LO_MAC_DINH","giaTri":" NOLOT "}')->>'ok', 'true', 'cau_hinh_lo_mac_dinh_ok');
select is((select gia_tri from kk.cau_hinh where khoa = 'LO_MAC_DINH'), '"NOLOT"'::jsonb, 'cau_hinh_lo_mac_dinh_cat_khoang_trang');
select is(pg_temp.api('luuCauHinh', '{"khoa":"LO_NGHI","giaTri":[]}')->>'ok', 'false', 'cau_hinh_lo_nghi_mang_rong');
select is(pg_temp.api('luuCauHinh', '{"khoa":"LO_NGHI","giaTri":["MFG"," "]}')->>'ok', 'false', 'cau_hinh_lo_nghi_chu_rong');
select is(pg_temp.api('luuCauHinh', '{"khoa":"LO_NGHI","giaTri":"MFG"}')->>'ok', 'false', 'cau_hinh_lo_nghi_khong_phai_mang');
select is(pg_temp.api('luuCauHinh', '{"khoa":"LO_NGHI","giaTri":["MFG",5]}')->>'ok', 'false', 'cau_hinh_lo_nghi_phan_tu_khong_phai_chu');
select is(pg_temp.api('luuCauHinh', '{"khoa":"DVT_LIST","giaTri":["Viên"," Hộp ","Gói"]}')->>'ok', 'true', 'cau_hinh_dvt_ok');
select is((select gia_tri from kk.cau_hinh where khoa = 'DVT_LIST'), '["Viên","Hộp","Gói"]'::jsonb, 'cau_hinh_dvt_cat_khoang_trang');
select is(pg_temp.api('luuCauHinh', '{"khoa":"DVT_LIST","giaTri":[]}')->>'ok', 'false', 'cau_hinh_dvt_rong');
select is(pg_temp.api('luuCauHinh', '{"khoa":"GHI_CHU","giaTri":"x"}')->>'error', 'Không có mục cấu hình GHI_CHU', 'cau_hinh_khoa_la');
select is((select array_agg(khoa order by khoa) from kk.cau_hinh), array['DVT_LIST','HSD_CANH_BAO_NGAY','HSD_MAC_DINH','LO_MAC_DINH','LO_NGHI'], 'cau_hinh_khong_them_khoa');
select is(pg_temp.api('login', '{}', '222222')->'dvt', '["Viên","Hộp","Gói"]'::jsonb, 'login_doc_cau_hinh_moi');
select is(public.api('{"action":"login","pin":"222222"}')->>'hsdMacDinh', '01/02/2100', 'login_doc_hsd_mac_dinh_moi');

-- ---------------------------------------------------------------- nhapSoSanh
select is(pg_temp.api('nhapSoSanh', $j${"list":[["TT-0001","Paracetamol","L1","1/2027","10,5","Viên","A1","Lan"],["TT-0009","Vitamin C","","","3","Viên","",""]]}$j$)->'soDong', '2', 'nhap_so_sanh_dem_dong');
select is(pg_temp.api('nhapSoSanh', $j${"kho":"LE","list":[["TT-0009","Vitamin C","L9","31/12/2027",7,"Viên","B1","Lan"]]}$j$)->'soDong', '1', 'nhap_so_sanh_kho_le');
select results_eq($$select ma, lo, hsd, sl, hoc from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN' order by ma$$,
  $$values ('TT-0001'::text, 'L1'::text, date '2027-01-31', 10.5::numeric, 'A1'::text), ('TT-0009'::text, ''::text, null::date, 3::numeric, ''::text)$$, 'nhap_so_sanh_gia_tri');
select is(pg_temp.api('nhapSoSanh', $j${"list":[["TT-0001","Paracetamol","L7","",99,"Viên","",""]]}$j$)->'soDong', '1', 'nhap_so_sanh_thay_toan_bo');
select is((select count(*)::int from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN'), 1, 'nhap_so_sanh_thay_toan_bo_chi_con_1');
select is((select count(*)::int from kk.so_sanh where dot_id = 'DOT01' and kho = 'LE'), 1, 'nhap_so_sanh_giu_kho_khac');
create temp table r_ss2 as select pg_temp.api('nhapSoSanh', $j${"list":[["TT-0001","P","L1","31/02/2027",1,"Viên","",""],["","P","L1","",1,"Viên","",""],["TT-0001","P","L1","","abc","Viên","",""]]}$j$) as j;
select is((select jsonb_array_length(j->'loi') from r_ss2), 3, 'nhap_so_sanh_loi_tung_dong');
select is((select j->'loi'->0 from r_ss2), '{"dong":1,"error":"HSD không hợp lệ: 31/02/2027"}'::jsonb, 'nhap_so_sanh_hsd_sai');
select is((select j->>'soDong' from r_ss2), '0', 'nhap_so_sanh_loi_khong_thay_gi_so_dong');
select is((select count(*)::int from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN' and lo = 'L7'), 1, 'nhap_so_sanh_loi_giu_du_lieu_cu');
select is(pg_temp.api('nhapSoSanh', '{"list":[],"dot":"DOT02"}')->>'ok', 'false', 'nhap_so_sanh_dot_dong_bi_chan');
select is(pg_temp.api('nhapSoSanh', '{"list":[]}')->'soDong', '0', 'nhap_so_sanh_rong_la_xoa_het');

-- ---------------------------------------------------------------- xuatDot
insert into kk.dong (dot_id, so, tap, tg, kho, ma, ten, lo, hsd, hoc, sl, dvt, nguoi, tk, thao_tac, trang_thai, thay_boi, req_id, cap_nhat) values
  ('DOT01', 11, false, now(), 'CHAN', 'TT-0001', 'Paracetamol', 'L1', '2027-03-15', 'A1', 5, 'Viên', 'x', 'TK04', 'LUU', 'THAY_THE', 12, 'rq1', 'cu'),
  ('DOT01', 12, false, now(), 'CHAN', 'TT-0001', 'Paracetamol', 'L1', '2027-03-15', 'A1', 6, 'Viên', 'x', 'TK04', 'LUU', 'HIEU_LUC', null, null, '');
create temp table r_xd as select pg_temp.api('xuatDot', '{}', '222222') as j;
select is((select j->>'ok' from r_xd), 'true', 'xuat_dot_to_truong_duoc');
select is((select array_agg(k order by k) from r_xd, jsonb_object_keys(j) k), array['danhMuc','dong','dot','hoc','khos','ok','soSanh','thuocMoi'], 'xuat_dot_khoa_json');
select is((select jsonb_path_query_array(j->'dong', '$[*].id') from r_xd), '["D00001","D00011","D00012"]'::jsonb, 'xuat_dot_khong_co_tap');
select is((select (j->'dong'->1) - 'tg'::text from r_xd), (select kk.dong_json(x) - 'tg'::text || '{"thayBoi":"D00012","req":"rq1","capNhat":"cu"}'::jsonb
  from kk.dong x where x.dot_id = 'DOT01' and x.so = 11), 'xuat_dot_dong_them_thay_boi_req_cap_nhat');
select is((select j->'dong'->2->>'thayBoi' || '|' || (j->'dong'->2->>'req') || '|' || (j->'dong'->2->>'capNhat') from r_xd), '||', 'xuat_dot_dong_rong_la_chuoi_rong');
select is((select j->'khos' from r_xd), '[{"ma":"CHAN","ten":"Kho chẵn","tenNgan":"CHẴN"},{"ma":"LE","ten":"Kho lẻ","tenNgan":"LẺ"}]'::jsonb, 'xuat_dot_khos');
select is((select j->'dot'->>'id' from r_xd), 'DOT01', 'xuat_dot_dot');
select is((select jsonb_array_length(j->'danhMuc') from r_xd), 4, 'xuat_dot_danh_muc_du_dong');
select is((select j->'danhMuc'->0 from r_xd), '["TT-0001","Paracetamol 500 sửa","Hộp",100,"Viên","CHAN","",""]'::jsonb, 'xuat_dot_danh_muc_dong_dau');
select is((select jsonb_path_query_array(j->'hoc', '$[*].hoc') from r_xd), '["A 10","B2","B3"]'::jsonb, 'xuat_dot_hoc_khong_tap');
select is((select j->'soSanh'->0 from r_xd), '["LE","TT-0009","Vitamin C","L9","31/12/2027",7,"Viên","B1","Lan"]'::jsonb, 'xuat_dot_so_sanh');
select is((select j->'thuocMoi' from r_xd), '[]'::jsonb, 'xuat_dot_thuoc_moi_rong');
select is(pg_temp.api('xuatDot', '{"dot":"DOT02"}')->>'ok', 'true', 'xuat_dot_doc_duoc_dot_dong');

-- ---------------------------------------------------------------- anon lockdown (deferred from Task 1)
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'kk' and has_function_privilege('anon', p.oid, 'execute')), 0, 'anon_khong_chay_duoc_ham_kk_nao');
select ok(not has_schema_privilege('anon', 'kk', 'usage'), 'anon_khong_co_usage_schema_kk');

select * from finish();
rollback;
