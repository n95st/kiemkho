"""Tests for tools/nhap_tu_google_sheet.py. Run from the repo root:
   python3 tools/test_nhap_tu_google_sheet.py
The DB part needs the local stack (`supabase start`) and psql; it runs `supabase db reset` before and after."""
import datetime as dt
import os
import subprocess
import sys
import tempfile
import unittest

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nhap_tu_google_sheet as nhap  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "tools", "nhap_tu_google_sheet.py")
DB_URL = os.environ.get("DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
DONG_HEADER = ["ID", "Thời điểm", "Kho", "Mã", "Tên thuốc", "Số lô", "HSD", "Hộc", "Số hộp", "1 hộp có mấy", "Số lẻ",
               "SL (ĐVT nhỏ nhất)", "ĐVT", "Người đếm", "Tài khoản", "Thao tác", "Trạng thái", "Bị thay bởi",
               "Lý do / Ghi chú", "Cảnh báo", "Mã yêu cầu", "Cập nhật", "Sẽ thay (chờ duyệt)"]


def book(path, sheets):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for r in rows:
            ws.append(r)
    wb.save(path)


def make_fixtures(d):
    hub, dot1 = os.path.join(d, "hub.xlsx"), os.path.join(d, "dot1.xlsx")
    book(hub, {
        "NGUOI_DEM": [["Tài khoản", "Tên", "PIN", "Vai trò", "Hoạt động", "Ghi chú"],
                      ["TK01", "Quản trị IT", "123456", "IT", True, ""],
                      ["TK02", "Pat O'Brien", "654321", "DEM", "TRUE", "ghi 'chú'"],
                      ["TK03", "Vai lạ", "010203", "ABC", True, ""],
                      ["", "Bỏ qua", "999999", "DEM", True, ""]],
        "DANH_MUC": [["Mã", "Tên", "ĐVT nhập", "Quy cách", "ĐVT nhỏ nhất", "Kho", "GTIN", "Nguồn"],
                     ["TT-1", "Paracetamol", "Hộp", 100, "Viên", "CHAN", "893001 893002", ""],
                     ["TT-2", "Vitamin C", "", "", "Viên", "", "", "MOI M001"]],
        "DOT": [["Mã đợt", "Tên đợt", "TT", "Kho", "Ngày tạo", "Người tạo", "So sánh", "File", "Link", "Ghi chú"],
                ["DOT01", "Đợt 1", "DONG", "CHAN,LE", dt.datetime(2026, 10, 1, 8, 30), "TK01", "", "x", "", "gc"]],
        "CAU_HINH": [["LO_MAC_DINH", "KHONGLO"], ["HSD_MAC_DINH", "31/12/2099"]],
        "TAP": [["bỏ qua"]],
    })
    dong = [DONG_HEADER,
            ["D00001", dt.datetime(2026, 10, 2, 9, 0, 5), "CHAN", "TT-1", "Paracetamol", " lo1 ", dt.datetime(2027, 5, 31), "a 1",
             2, 100, 5, 205, "Viên", "Pat O'Brien", "TK02", "DEM", "THAY_THE", "D00003", "", "", "r1", "", ""],
            ["D00002", dt.datetime(2026, 10, 2, 9, 5), "CHAN", "TT-2", "Vitamin C", "L2", "5/2027", "A1",
             "", "", "", 10, "Viên", "Pat O'Brien", "TK02", "DEM", "HIEU_LUC", "", "", "", "", "", ""],
            ["D00003", dt.datetime(2026, 10, 2, 9, 9), "CHAN", "TT-1", "Paracetamol", "LO1", "31/05/2027", "A  1",
             2, 100, 6, 206, "Viên", "Pat O'Brien", "TK02", "SUA", "HIEU_LUC", "", "", "", "r3", "", "D00001"],
            ["D00004", dt.datetime(2026, 10, 2, 9, 10), "LE", "TT-2", "Vitamin C", "L9", 46461, "B2",
             "", "", "", 3, "Viên", "Pat O'Brien", "TK02", "DEM", "HIEU_LUC", "", "", "", "", "", "D00099"],
            ["", None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None]]
    book(dot1, {
        "DONG": dong,
        "HOC": [["Kho", "Hộc", "TT", "Người", "Bắt đầu", "Xong", "Người xong", "Ghi chú"],
                ["CHAN", "a 1", "XONG", "Pat O'Brien", dt.datetime(2026, 10, 2, 8, 0), dt.datetime(2026, 10, 2, 10, 0), "Pat", ""],
                ["CHAN", "A  1", "DANG_DEM", "", None, None, "", ""],
                ["LE", "B2", "CHUA_NHAN", "", None, None, "", ""]],
        "THUOC_MOI": [["ID", "TG", "Mã đề xuất", "Tên", "ĐVT nhập", "QC", "ĐVT", "Kho", "Người", "TT", "Mã chính thức", "Ghi chú"],
                      ["M005", dt.datetime(2026, 10, 2, 9, 30), "", "Thuốc mới", "Hộp", 10, "Viên", "CHAN", "Pat", "DA_DUYET", "TT-2", ""],
                      ["M006", 46461.5, "", "Thuốc hai", "Hộp", float("nan"), "Viên", "LE", "Pat", "CHO_DUYET", "", ""]],
        "LAN1": [["Kho", "Mã", "Tên", "Lô", "HSD", "SL", "ĐVT", "Hộc", "Người"],
                 ["CHAN", "TT-1", "Paracetamol", "lo1", dt.datetime(2027, 5, 31), 200, "Viên", "A1", "Pat"]],
        "CAU_HINH": [["TRANG_THAI_CHAN", "DA_CHOT"], ["TRANG_THAI_CHAN_LUC", "02/10 10:00 TK01"]],
        "NHAT_KY": [["bỏ qua"]],
    })
    return hub, dot1


def run_script(*args, local=True):
    env = dict(os.environ, KK_LOCAL="1") if local else {k: v for k, v in os.environ.items() if k != "KK_LOCAL"}
    return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, encoding="utf-8", env=env)


def psql(sql=None, f=None):
    cmd = ["psql", DB_URL, "-v", "ON_ERROR_STOP=1", "-At"] + (["-f", f] if f else ["-c", sql])
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


def db_reset():
    r = subprocess.run(["supabase", "db", "reset"], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


class NhapTuGoogleSheet(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.hub, cls.dot1 = make_fixtures(cls.tmp.name)
        cls.args = ["--trung-tam", cls.hub, "--dot", "DOT01=" + cls.dot1]

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_sql_noi_dung(self):
        r = run_script(*self.args)
        self.assertEqual(r.returncode, 0, r.stderr)
        sql = r.stdout
        self.assertTrue(sql.lstrip().startswith("begin;") and sql.rstrip().endswith("commit;"))
        self.assertIn("insert into kk.tai_khoan", sql)
        self.assertIn("O''Brien", sql)
        self.assertNotIn("O'Brien", sql)
        self.assertIn("Cơ sở dữ liệu đã có dữ liệu – dừng nhập", sql)
        self.assertNotIn("delete from", sql)
        self.assertIn("'2027-03-15'", sql)  # Excel serial 46461 as HSD
        self.assertIn("'2027-03-15 12:00:00+07'", sql)  # serial with day fraction as a time
        self.assertIn("'2026-10-02 09:00:05+07'", sql)
        self.assertIn("'DOT01'", sql)

    def test_co_xoa_du_lieu_thu(self):
        r = run_script(*self.args, "--xoa-du-lieu-thu")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("delete from kk.tai_khoan", r.stdout)
        self.assertNotIn("delete from kk.nhat_ky", r.stdout)
        self.assertIn("Có dòng đếm thật – không xoá", r.stdout)
        self.assertNotIn("dừng nhập", r.stdout)

    def test_co_xoa_can_kk_local(self):
        r = run_script(*self.args, "--xoa-du-lieu-thu", local=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("KK_LOCAL=1", r.stderr)
        self.assertEqual(r.stdout, "")

    def test_canh_bao(self):
        err = run_script(*self.args).stderr
        self.assertIn("hộc CHAN A 1 trùng", err)
        self.assertIn("trỏ tới dòng 99", err)
        self.assertNotIn("mã yêu cầu", err)  # empty req ids are not duplicates

    def test_serial_ngoai_khoang(self):
        self.assertIsNone(nhap.serial(100))
        self.assertEqual(nhap.serial(46461).date(), dt.date(2027, 3, 15))
        self.assertEqual(nhap.num(float("inf"), "S", 1, "x"), "null")

    def test_thieu_file_dot(self):
        r = run_script("--trung-tam", self.hub, "--dot", "DOT09=" + self.dot1)
        self.assertNotEqual(r.returncode, 0)

    def test_nhap_vao_csdl(self):
        db_reset()
        self.addCleanup(db_reset)
        sql_path = os.path.join(self.tmp.name, "nhap.sql")
        with open(sql_path, "w", encoding="utf-8") as f:
            f.write(run_script(*self.args, "--xoa-du-lieu-thu").stdout)
        psql(f=sql_path)
        self.assertEqual(psql("select count(*) from kk.dong"), "4")
        self.assertEqual(psql("select count(*) from kk.tai_khoan"), "3")
        self.assertEqual(psql("select vai_tro from kk.tai_khoan where tk = 'TK03'"), "DEM")
        self.assertEqual(psql("select ten from kk.tai_khoan where tk = 'TK02'"), "Pat O'Brien")
        self.assertEqual(psql("select thay_boi from kk.dong where so = 1"), "3")
        self.assertEqual(psql("select se_thay from kk.dong where so = 3"), "{1}")
        self.assertEqual(psql("select tg::text from kk.dong where so = 1"), "2026-10-02 02:00:05+00")
        self.assertEqual(psql("select lo || '|' || hoc || '|' || hsd from kk.dong where so = 1"), "LO1|A 1|2027-05-31")
        self.assertEqual(psql("select hsd from kk.dong where so = 2"), "2027-05-31")
        self.assertEqual(psql("select so_dong || ',' || so_thuoc_moi || ',' || trang_thai from kk.dot where id = 'DOT01'"), "4,6,DONG")
        self.assertEqual(psql("select trang_thai || '|' || cap_nhat from kk.dot_kho where dot_id = 'DOT01' and kho = 'CHAN'"),
                         "DA_CHOT|02/10 10:00 TK01")
        self.assertEqual(psql("select trang_thai from kk.dot_kho where dot_id = 'DOT01' and kho = 'LE'"), "DANG_KIEM")
        self.assertEqual(psql("select count(*) from kk.hoc"), "2")  # 'a 1' and 'A  1' collapse to one hộc
        self.assertEqual(psql("select count(*) from kk.thuoc_moi"), "2")
        self.assertEqual(psql("select hsd from kk.dong where so = 4"), "2027-03-15")
        self.assertEqual(psql("select tg::text from kk.thuoc_moi where so = 6"), "2027-03-15 05:00:00+00")
        self.assertEqual(psql("select qc_goc is null from kk.thuoc_moi where so = 6"), "t")
        self.assertEqual(psql("select count(*) from kk.so_sanh"), "1")
        self.assertEqual(psql("select gtin from kk.thuoc where ma = 'TT-1'"), "{893001,893002}")
        # same normalisation as the app writes
        self.assertEqual(psql("select count(*) from kk.dong where lo <> kk.lo_text(lo) or hoc <> kk.hoc_key(hoc)"), "0")
        # login through the public gateway with a PIN from the fixture
        self.assertEqual(psql("""select public.api('{"action":"login","pin":"654321"}'::jsonb)->>'ok'"""), "true")
        self.assertEqual(psql("""select public.api('{"action":"login","pin":"010203"}'::jsonb)->>'role'"""), "DEM")
        # the wipe flag refuses when real count rows exist, and deletes nothing
        r = subprocess.run(["psql", DB_URL, "-v", "ON_ERROR_STOP=1", "-f", sql_path], capture_output=True, text=True, encoding="utf-8")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Có dòng đếm thật", r.stderr)
        self.assertEqual(psql("select count(*) from kk.dong"), "4")
        self.assertEqual(psql("select count(*) from kk.tai_khoan"), "3")
        # refuses to run twice
        with open(os.path.join(self.tmp.name, "lan2.sql"), "w", encoding="utf-8") as f:
            f.write(run_script(*self.args).stdout)
        r = subprocess.run(["psql", DB_URL, "-v", "ON_ERROR_STOP=1", "-f", os.path.join(self.tmp.name, "lan2.sql")],
                           capture_output=True, text=True, encoding="utf-8")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("dừng nhập", r.stderr)


if __name__ == "__main__":
    unittest.main()
