-- Local/test seed. Fake PINs only; never real data.
insert into kk.tai_khoan (tk, ten, pin, vai_tro, hoat_dong) values
  ('TK01', 'Quản trị IT',    '111111', 'IT',        true),
  ('TK02', 'Tổ trưởng 1',    '222222', 'TO_TRUONG', true),
  ('TK04', 'Người đếm 4',    '444444', 'DEM',       true),
  ('TK05', 'Người đếm 5',    '555555', 'DEM',       true),
  ('TK90', 'Tập dượt',       '999999', 'TAP',       true),
  ('TK99', 'Người đếm 99',   '000000', 'DEM',       false);

insert into kk.thuoc (ma, ten, dvt_nhap, quy_cach, dvt, kho_mac_dinh) values
  ('TT-0001', 'Paracetamol 500mg', 'Hộp', 100, 'Viên', 'CHAN'),
  ('TT-0009', 'Vitamin C',         '',    null, 'Viên', 'LE');

insert into kk.dot (id, ten, trang_thai, kho) values
  ('DOT01', 'Đợt thử', 'MO',   '{CHAN,LE}'),
  ('DOT02', 'Đợt cũ',  'DONG', '{CHAN,LE}');

insert into kk.dot_kho (dot_id, kho) values ('DOT01', 'CHAN'), ('DOT01', 'LE');
