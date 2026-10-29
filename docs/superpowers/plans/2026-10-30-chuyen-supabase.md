# Chuyển Kiểm kho iSOFH sang Supabase — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay Google Apps Script bằng hàm SQL trong Supabase để mọi thao tác chờ máy chủ xong dưới 0,5 giây, giữ nguyên tính năng, và cho IT cấu hình trên app.

**Architecture:** Bảng dữ liệu nằm trong schema `kk` (không mở qua API). Trình duyệt chỉ gọi một hàm `public.api(req jsonb) returns jsonb` (SECURITY DEFINER) qua `POST /rest/v1/rpc/api`. Hàm này kiểm PIN, chọn đợt rồi gọi `kk.a_<action>(u, d, req)`. App JS hiện có giữ nguyên, chỉ đổi hàm `api()` và thêm màn cấu hình.

**Tech Stack:** Supabase (Postgres 17, PostgREST, pgTAP, extension `unaccent`), Supabase CLI + Docker cho môi trường local, JavaScript thuần (không framework), Tailwind CSS 3.4.17 (đã có), SheetJS 0.18.5, Python 3 + openpyxl 3.1.5 (script chuyển dữ liệu), Playwright 1.49.1 với Google Chrome (`channel: 'chrome'`) cho test giao diện.

**Spec:** `docs/superpowers/specs/2026-10-30-chuyen-supabase-design.md`

**Hợp đồng gốc:** `legacy/Code.gs` (Task 0 tạo). Mọi thao tác cũ phải trả đúng tên khóa, kiểu giá trị và câu báo lỗi như hàm cùng tên trong file này.

## Global Constraints

- Mọi phản hồi của `public.api` có dạng `{"ok":true,...}` hoặc `{"ok":false,"error":"<câu lỗi>",...}`; không bao giờ để PostgREST trả lỗi HTTP vì lỗi nghiệp vụ.
- Câu báo lỗi chép nguyên văn từ `legacy/Code.gs`. Bắt buộc giữ các chữ `PIN`, `khoá`, `đã đóng`, `chọn đợt`, `Không thấy đợt` vì `app.js` dò chúng.
- Định dạng: thời điểm `to_char(tg at time zone 'Asia/Ho_Chi_Minh','DD/MM HH24:MI')`; HSD và ngày `DD/MM/YYYY`; mã dòng `'D' || lpad(so::text,5,'0')`; mã thuốc mới `'M' || lpad(so::text,3,'0')`; mã đợt `'DOT' || lpad(n::text,2,'0')`.
- Số rỗng trả `""` (chuỗi rỗng), không trả `null`, vì app in thẳng giá trị.
- Schema `kk`: `revoke all on schema kk from public, anon, authenticated`; `alter default privileges in schema kk revoke execute on functions from public`. Chỉ `public.api` được `grant execute ... to anon`.
- Hàm SECURITY DEFINER đặt `set search_path = kk, extensions, pg_temp`.
- Không đưa vào repo: khóa `service_role`, mật khẩu cơ sở dữ liệu, mã file Google, dữ liệu thật. File `.env` nằm trong `.gitignore`.
- Mọi chữ tiếng Việt trên giao diện có đủ dấu. Mọi giá trị chèn vào HTML đi qua `esc()`; link đi qua `safeUrl()`.
- Mỗi lần đổi file giao diện: tăng `?v=` trong `index.html` và `VER` trong `sw.js`.

## Review Focus

- Hàng đợi ngoại tuyến gửi lại cùng `reqId` sau khi máy chủ đã lưu: phải trả `trungLap:true`, không thêm dòng. Test ở Task 4 (`luu_gui_lai_cung_reqid`).
- Hai người cùng bấm Đếm lại hộc trên cùng lô cùng lúc: chỉ một dòng `HIEU_LUC` còn lại cho hộc đó. Test ở Task 5 (`tests/dong-thoi.sh`).
- Người đếm gõ HSD kiểu `5/2027`, `1-3-27`, `31/02/2027`: hai dạng đầu được nhận, dạng cuối báo lỗi. Test ở Task 3 (`parse_hsd`) và Task 4 (`luu_hsd_sai`).
- IT gõ tên thuốc hoặc tên kho có thẻ HTML: màn nào cũng hiện nguyên chữ, không chạy mã. Test ở Task 11 (e2e `xss_ten_thuoc`).
- Điện thoại còn dòng chờ gửi từ bản Apps Script khi app chuyển sang Supabase: dòng đó gửi được lên Supabase. Test ở Task 9 (e2e `hang_doi_cu`).

---

### Task 0: Dựng khung dự án và môi trường local

**Files:**
- Create: `legacy/Code.gs` (nội dung `Code.gs` anh gửi ngày 30/10/2026; thay giá trị `FILE_CHAN_LAN1`, `FILE_LE_LAN1` bằng `'<đã che>'`)
- Create: `supabase/config.toml` (do `supabase init` tạo)
- Create: `.gitignore` với `.env`, `supabase/.temp/`, `supabase/.branches/`, `node_modules/`, `__pycache__/`
- Create: `package.json` chỉ có `devDependencies: { "playwright": "1.49.1" }`

- [ ] **Step 1:** `brew install supabase/tap/supabase`, rồi `git checkout -b supabase` và `supabase init`.
- [ ] **Step 2:** Đặt `[api] schemas = ["public"]`, `extra_search_path = ["public", "extensions"]` trong `supabase/config.toml` (mặc định đã đúng; chỉ kiểm, không thêm `kk`).
- [ ] **Step 3:** `supabase start`. Expected: in ra `API URL: http://127.0.0.1:54321` và `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- [ ] **Step 4:** `npm install`. Expected: có `node_modules/playwright`.
- [ ] **Step 5:** Commit `legacy/Code.gs supabase/config.toml .gitignore package.json package-lock.json`: "chore: khung Supabase local và hợp đồng gốc Code.gs".

---

### Task 1: Bảng dữ liệu, cổng `api`, đăng nhập PIN

**Files:**
- Create: `supabase/migrations/20261030000001_nen.sql`
- Create: `supabase/seed.sql`
- Test: `supabase/tests/01_dang_nhap.test.sql`

**Interfaces:**
- Produces bảng trong `kk`:
  - `kho(ma text pk check (ma ~ '^[A-Z0-9_]{1,10}$'), ten text not null, ten_ngan text not null, thu_tu int not null default 0, hoat_dong bool not null default true)`; migration nạp sẵn `('CHAN','Kho chẵn','CHẴN',1)`, `('LE','Kho lẻ','LẺ',2)`.
  - `tai_khoan(tk text pk, ten text not null, pin text not null unique check (pin ~ '^\d{4,8}$'), vai_tro text not null check (vai_tro in ('DEM','TO_TRUONG','IT','TAP')), hoat_dong bool not null default true, ghi_chu text not null default '')`
  - `thuoc(ma text pk, ten text not null, dvt_nhap text not null default '', quy_cach numeric, dvt text not null, kho_mac_dinh text references kho, gtin text[] not null default '{}', nguon text not null default '', cap_nhat timestamptz not null default now())`
  - `cau_hinh(khoa text pk, gia_tri jsonb not null)`; nạp sẵn `LO_MAC_DINH "KHONGLO"`, `HSD_MAC_DINH "31/12/2099"`, `HSD_CANH_BAO_NGAY 90`, `DVT_LIST` (mảng 22 đơn vị đúng thứ tự `DVT_LIST` ở `app.js:10`), `LO_NGHI ["MFG","MFD","NSX","EXP","HSD","LOT","BATCH"]`.
  - `dot(id text pk, ten text unique not null, trang_thai text not null default 'MO' check (trang_thai in ('MO','DONG')), kho text[] not null, ngay_tao timestamptz not null default now(), nguoi_tao text not null default '', so_voi text not null default '', ghi_chu text not null default '', so_dong int not null default 0, so_thuoc_moi int not null default 0)`
  - `dot_kho(dot_id text references dot, kho text references kho, trang_thai text not null default 'DANG_KIEM' check (trang_thai in ('DANG_KIEM','DA_CHOT')), cap_nhat text not null default '', primary key (dot_id, kho))`
  - `dong(dot_id text references dot, so int, tap bool not null, tg timestamptz not null default now(), kho text not null, ma text not null, ten text not null, lo text not null default '', hsd date, hoc text not null, hop numeric, qc numeric, le numeric, sl numeric not null, dvt text not null, nguoi text not null, tk text not null, thao_tac text not null, trang_thai text not null check (trang_thai in ('HIEU_LUC','THAY_THE','HUY','CHO_DUYET','TU_CHOI')), thay_boi int, ghi text not null default '', canh_bao text not null default '', req_id text, cap_nhat text not null default '', se_thay int[] not null default '{}', primary key (dot_id, so))`; `unique (dot_id, req_id)`; index `(dot_id, tap, kho, ma)` và `(dot_id, tap, tk, so desc)`.
  - `hoc(dot_id text references dot, tap bool, kho text, hoc text, trang_thai text not null default 'CHUA_NHAN' check (trang_thai in ('CHUA_NHAN','DANG_DEM','XONG')), nguoi text not null default '', bat_dau timestamptz, xong_luc timestamptz, nguoi_xong text not null default '', ghi text not null default '', primary key (dot_id, tap, kho, hoc))`
  - `thuoc_moi(dot_id text references dot, so int, tg timestamptz not null default now(), ma_de_xuat text not null default '', ten text not null, dvt_nhap text not null default '', qc_goc numeric, dvt text not null, kho text not null, nguoi text not null, trang_thai text not null default 'CHO_DUYET', ma_chinh_thuc text not null default '', ghi_chu text not null default '', primary key (dot_id, so))`
  - `so_sanh(dot_id text references dot, kho text, ma text, ten text, lo text, hsd date, sl numeric, dvt text, hoc text, nguoi text)` — thay sheet `LAN1`.
  - `nhat_ky(id bigint generated always as identity primary key, tg timestamptz not null default now(), dot_id text, tk text, ten text, hanh_dong text, chi_tiet text)`
  - `pin_sai(khoa text pk, so_lan int not null, het_han timestamptz not null)`
- Produces hàm:
  - `public.api(req jsonb) returns jsonb` — SECURITY DEFINER, `grant execute to anon`.
  - `kk.xac_thuc(pin text, ip text) returns kk.tai_khoan` — trả `null` khi sai PIN (không raise, để bộ đếm sai không bị hủy theo giao dịch).
  - `kk.dung_dot(id text, u kk.tai_khoan, ghi bool) returns kk.dot` — như `useDot_`.
  - `kk.ghi_nhat_ky(u kk.tai_khoan, dot_id text, hanh_dong text, chi_tiet text)`.
  - `kk.dot_json(d kk.dot, u kk.tai_khoan) returns jsonb` — như `dotPublic_`; IT có thêm `url:""`, `nguoi`, `ghi`.
  - `kk.dot_info(d kk.dot, u kk.tai_khoan) returns jsonb` — `dot_json` cộng `trangThai` gồm mọi kho của đợt.
  - `kk.a_login(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb`.
- Thứ tự trong `public.api`: lấy IP từ `split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1)` (rỗng thì `'unknown'`); nếu `pin_sai` của IP có `so_lan >= 20` và chưa hết hạn thì trả `Tạm khoá đăng nhập 10 phút vì nhập sai PIN quá nhiều lần`; gọi `xac_thuc`; sai thì tăng `so_lan` (hết hạn sau 10 phút) và trả `Sai mã PIN`; tài khoản khóa thì trả `Tài khoản <ten> đang bị khoá – báo IT`; action không khớp `^[A-Za-z]+$` hoặc `to_regprocedure('kk.a_' || action || '(kk.tai_khoan,kk.dot,jsonb)')` là null thì trả `Không có chức năng: <action>` (nhờ vậy task sau chỉ cần tạo hàm `kk.a_<action>`, không sửa phần chuyển tiếp; gọi bằng `execute format('select kk.%I($1,$2,$3)', 'a_' || lower(action))`); action không thuộc nhóm chỉ dùng chung (`login, danhMuc, dsTaiKhoan, dsDot, taoDot, datTrangThaiDot` cùng các action cấu hình của Task 10) thì gọi `dung_dot` với `ghi` = action thuộc nhóm ghi (`luu, hoanTac, thuocMoi, nhanHoc, xongHoc, duyetDong, duyetThuocMoi, gopLo, datTrangThaiKho, luuHoc, nhapSoSanh`); gọi `kk.a_<action>`; khối `exception when others` trả `{"ok":false,"error":SQLERRM}`.
- `login` trả đúng khóa của `API.login` trong `legacy/Code.gs` (`hubUrl` luôn `""`), cộng thêm `khos` (`[{ma,ten,tenNgan}]` các kho `hoat_dong`, theo `thu_tu`), `dvt` (mảng `DVT_LIST`), `hsdCanhBao`, `loNghi`.

- [ ] **Step 1: Viết `seed.sql`** gồm: `TK01` IT PIN `111111`; `TK02` TO_TRUONG `222222`; `TK04` DEM `444444`; `TK05` DEM `555555`; `TK90` TAP `999999`; `TK99` DEM `000000` bị khóa; thuốc `TT-0001` "Paracetamol 500mg" `dvt_nhap 'Hộp'`, `quy_cach 100`, `dvt 'Viên'`, kho `CHAN`; `TT-0009` "Vitamin C" `dvt 'Viên'`, kho `LE`; đợt `DOT01` "Đợt thử" `MO` kho `{CHAN,LE}` có hai dòng `dot_kho`; đợt `DOT02` "Đợt cũ" `DONG`.

- [ ] **Step 2: Viết test `01_dang_nhap.test.sql` (pgTAP)** với các khẳng định:

```sql
select is((public.api('{"action":"login","pin":"123"}')->>'error'), 'Sai mã PIN', 'pin_sai');
select is((public.api('{"action":"login","pin":"000000"}')->>'error'), 'Tài khoản ' || (select ten from kk.tai_khoan where tk='TK99') || ' đang bị khoá – báo IT', 'tai_khoan_khoa');
select is((public.api('{"action":"xyz","pin":"444444"}')->>'error'), 'Không có chức năng: xyz', 'action_la');
select is((public.api('{"action":"login","pin":"444444"}')->>'role'), 'DEM', 'login_dem');
select is(jsonb_array_length(public.api('{"action":"login","pin":"444444"}')->'dots'), 1, 'dem_chi_thay_dot_mo');
select is(jsonb_array_length(public.api('{"action":"login","pin":"111111"}')->'dots'), 2, 'it_thay_ca_dot_dong');
select is((public.api('{"action":"login","pin":"444444","dot":"DOT01"}')->'dotInfo'->'trangThai'->>'CHAN'), 'DANG_KIEM', 'login_kem_dot');
select is((public.api('{"action":"login","pin":"444444"}')->'khos'->0->>'tenNgan'), 'CHẴN', 'login_tra_kho');
-- khóa IP: set request.headers x-forwarded-for = 9.9.9.9, gọi 20 lần PIN sai, lần 21 với PIN đúng vẫn bị chặn
select is((public.api('{"action":"login","pin":"444444"}')->>'error'), 'Tạm khoá đăng nhập 10 phút vì nhập sai PIN quá nhiều lần', 'khoa_ip');
-- IP khác vẫn đăng nhập được
select ok(not has_table_privilege('anon', 'kk.dong', 'select'), 'anon_khong_doc_bang');
select ok(not has_function_privilege('anon', 'kk.a_login(kk.tai_khoan, kk.dot, jsonb)', 'execute'), 'anon_khong_goi_ham_kk');
select ok(has_function_privilege('anon', 'public.api(jsonb)', 'execute'), 'anon_goi_duoc_api');
```

- [ ] **Step 3:** `supabase db reset && supabase test db`. Expected: FAIL (`function public.api(jsonb) does not exist`).
- [ ] **Step 4:** Viết migration `20261030000001_nen.sql` theo khối Interfaces.
- [ ] **Step 5:** `supabase db reset && supabase test db`. Expected: `01_dang_nhap.test.sql .. ok`.
- [ ] **Step 6:** Kiểm qua HTTP: `curl -s -X POST http://127.0.0.1:54321/rest/v1/rpc/api -H "apikey: <anon key local>" -H 'Content-Type: application/json' -d '{"req":{"action":"login","pin":"444444"}}'`. Expected: JSON có `"ok": true`. Gọi `curl .../rest/v1/dong` hoặc `/rpc/a_login`. Expected: lỗi 404 hoặc 401.
- [ ] **Step 7:** Commit: "feat(db): bảng, cổng api và đăng nhập PIN".

---

### Task 2: Đợt kiểm, trạng thái kho, danh mục

**Files:**
- Create: `supabase/migrations/20261030000002_dot_danh_muc.sql`
- Test: `supabase/tests/02_dot_danh_muc.test.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces: `kk.a_dsDot`, `kk.a_taoDot`, `kk.a_datTrangThaiDot`, `kk.a_datTrangThaiKho`, `kk.a_danhMuc`; `kk.kiem_kho(d kk.dot, kho text) returns text` (như `checkKho_`, kiểm thêm kho có trong bảng `kho`); `kk.trang_thai_kho(d kk.dot, kho text) returns text`.
- `taoDot`: `req.soVoi` là `""` hoặc mã một đợt có sẵn; giá trị khác báo `Không thấy đợt so sánh <soVoi>`. Có `soVoi` thì chép các dòng `HIEU_LUC`, `tap=false` của đợt đó (chỉ kho của đợt mới) vào `so_sanh`; `copyHoc` khác `false` thì chép danh sách hộc với trạng thái `CHUA_NHAN`. Tạo dòng `dot_kho` cho từng kho. `so_voi` lưu tên đợt so sánh.
- `danhMuc`: `list` là mảng `[ma, ten, dvt_nhap, quy_cach hoặc "", dvt, kho_mac_dinh hoặc "", gtin nối bằng dấu cách]` sắp theo `ma`; `v` là 12 ký tự đầu của `md5` chuỗi JSON của `list`.

- [ ] **Step 1: Viết test** với các khẳng định: `tao_dot_chi_it` (PIN `444444` nhận `Tài khoản ... không có quyền này`); `tao_dot_ten_ngan` (`ten:"ab"` nhận `Nhập tên đợt (VD: Kiểm kho cuối năm 2026)`); `tao_dot_trung_ten`; `tao_dot_ma_tiep_theo` (`dot.id = 'DOT03'`); `tao_dot_chep_so_sanh` (đợt nguồn có 2 dòng `HIEU_LUC` kho `CHAN`, 1 dòng `HUY`; đợt mới có 2 dòng `so_sanh`); `tao_dot_chep_hoc`; `dong_dot_chan_ghi` (sau `datTrangThaiDot` `DONG`, gọi `nhanHoc` nhận lỗi chứa `đã đóng`); `kho_ngoai_dot` (đợt chỉ `{CHAN}`, gọi `xemThuoc` kho `LE` nhận `Đợt "<ten>" không kiểm Kho lẻ`); `chot_kho` (`datTrangThaiKho` `DA_CHOT` rồi `login` kèm đợt thấy `trangThai.CHAN = 'DA_CHOT'`); `danh_muc_same` (gọi lần 2 với `v` của lần 1 nhận `same:true` và không có `list`).
- [ ] **Step 2:** Chạy `supabase test db`. Expected: FAIL ở `02_dot_danh_muc`.
- [ ] **Step 3:** Viết migration theo Interfaces và các hàm cùng tên trong `legacy/Code.gs`.
- [ ] **Step 4:** Chạy `supabase test db`. Expected: tất cả `ok`.
- [ ] **Step 5:** Commit: "feat(db): đợt kiểm, chốt kho, danh mục".

---

### Task 3: Hàm tiện ích và dữ liệu dòng đếm

**Files:**
- Create: `supabase/migrations/20261030000003_tien_ich.sql`
- Test: `supabase/tests/03_tien_ich.test.sql`

**Interfaces:**
- Produces:
  - `kk.parse_hsd(s text) returns date` — như `parseHsd_`: nhận `d/m/yyyy`, `d-m-yy`, `d.m.yyyy` (năm 2 số cộng 2000, năm ngoài 2000–2100 trả null, ngày không có thật trả null) và `m/yyyy` (trả ngày cuối tháng); dạng khác trả null.
  - `kk.lo_key(s text) returns text` — như `loKey_`. `kk.lo_text(s text) returns text` — như `loText_`. `kk.hoc_key(s text) returns text` — như `hocKey_`. `kk.norm_ten(s text) returns text` — như `normTen_`, dùng `unaccent`.
  - `kk.dong_json(r kk.dong) returns jsonb` — đúng khóa của `lineObj_`: `id, tg, kho, ma, ten, lo, hsd, hoc, hop, qc, le, sl, dvt, nguoi, tk, tt, st, ghi, cb, seThay` (`seThay` là chuỗi mã dòng nối bằng dấu phẩy).
  - `kk.dong_cua(dot_id text, tap bool, kho text, ma text) returns jsonb` — như `linesOf_`: mảng `dong_json` các dòng `HIEU_LUC` hoặc `CHO_DUYET`, theo `so`.
  - `kk.so_dong(id text) returns int` — `'D00012'` trả `12`; sai dạng báo `Mã dòng không hợp lệ`.
  - `kk.canh_bao(t kk.thuoc, kho text, lo text, hsd date, hop numeric, qc numeric) returns text[]` — như `canhBao_`, ngưỡng ngày đọc `HSD_CANH_BAO_NGAY`, từ nghi đọc `LO_NGHI`. Câu `HSD còn dưới 3 tháng` đổi thành `HSD còn dưới <N> ngày` vì ngưỡng giờ chỉnh được.

- [ ] **Step 1: Viết test** `parse_hsd`: `'15/03/2027'` ra `2027-03-15`; `'1-3-27'` ra `2027-03-01`; `'5/2027'` ra `2027-05-31`; `'2/2028'` ra `2028-02-29`; `'31/02/2027'` ra null; `'13/2027'` ra null; `'abc'` ra null. `lo_key`: `' ab-12. '` ra `'AB-12'`. `norm_ten`: `'Paracetamol 500mg'` bằng `norm_ten('PARACETAMOL 500 MG')`. `dong_json`: dòng có `hop` null trả `"hop": ""`, `hsd` ra `'15/03/2027'`, `id` ra `'D00007'`. `canh_bao`: lô `'LOT123'` có câu `Số lô có chữ LOT`; HSD hôm qua có `HSD đã quá hạn`; HSD sau 30 ngày có `HSD còn dưới 90 ngày`; quy cách 50 với danh mục 100 có `Quy cách 50 khác gợi ý 100`.
- [ ] **Step 2:** Chạy test. Expected: FAIL.
- [ ] **Step 3:** Viết migration.
- [ ] **Step 4:** Chạy test. Expected: PASS.
- [ ] **Step 5:** Commit: "feat(db): hàm tiện ích lô, hộc, HSD, dòng đếm".

---

### Task 4: Lưu số đếm — phần kiểm dữ liệu và thêm dòng

**Files:**
- Create: `supabase/migrations/20261030000004_luu.sql`
- Test: `supabase/tests/04_luu.test.sql`

**Interfaces:**
- Consumes: Task 3.
- Produces: `kk.a_luu(u, d, req) returns jsonb` cho thao tác `CONG_THEM`; `kk.them_dong(...)` nội bộ cấp `so` bằng `update kk.dot set so_dong = so_dong + 1 ... returning so_dong`; `kk.hoc_gtin(t kk.thuoc, gtin text)` như `learnGtin_` (tài khoản `TAP` không học).
- Khóa: đầu `a_luu` gọi `pg_advisory_xact_lock(hashtext(d.id || '|' || kho || '|' || ma))`.
- Thứ tự kiểm và câu lỗi đúng như `API.luu` trong `legacy/Code.gs` từ đầu hàm đến trước nhánh `DEM_LAI_HOC`/`DON_LO`. `khongLo` lấy `LO_MAC_DINH`, `HSD_MAC_DINH` từ `cau_hinh`.
- Kết quả: `{id, st, canhBao, lines}`; trùng `reqId` trong cùng đợt trả `{id, st, trungLap:true, lines}`.

- [ ] **Step 1: Viết test** (mỗi dòng một khẳng định, PIN `444444`, đợt `DOT01`, kho `CHAN`, mã `TT-0001`):
  - `luu_thieu_hoc` → `Chưa nhập hộc / vị trí`
  - `luu_thieu_so_luong` → `Chưa nhập số lượng`
  - `luu_so_am` → `Số lượng không được âm`
  - `luu_hop_khong_quy_cach` (`hop:2`) → `Có số hộp thì phải có "1 hộp có mấy"`
  - `luu_thieu_lo` (`le:5`, không lô) → `Có số lượng thì phải có Số lô và HSD`
  - `luu_hsd_sai` (`hsd:'31/02/2027'`) → `HSD không đúng dạng dd/mm/yyyy`
  - `luu_ma_la` (`ma:'XX'`) → `Mã XX không có trong danh mục`
  - `luu_thanh_cong` (`hop:2, qc:100, le:5, lo:'a1', hsd:'15/03/2027', hoc:'a 1'`) → `st = 'HIEU_LUC'`, dòng có `sl = 205`, `lo = 'A1'`, `hoc = 'A 1'`, `id = 'D00001'`
  - `luu_khong_lo` (`khongLo:true`) → dòng có `lo = 'KHONGLO'`, `hsd = '2099-12-31'`, `ghi` bắt đầu bằng `Hàng không có lô/HSD`
  - `luu_gui_lai_cung_reqid` (gửi 2 lần `reqId:'r1'`) → lần 2 có `trungLap = true`, bảng chỉ có 1 dòng `req_id = 'r1'`
  - `luu_hoc_gtin` (`gtin:'8935001234567'`) → `thuoc.gtin` chứa giá trị đó; gửi lại không nhân đôi
  - `luu_tap_ghi_rieng` (PIN `999999`) → dòng có `tap = true`; `cuaToi` của `TK04` không thấy dòng này
- [ ] **Step 2:** Chạy test. Expected: FAIL.
- [ ] **Step 3:** Viết migration.
- [ ] **Step 4:** Chạy test. Expected: PASS.
- [ ] **Step 5:** Commit: "feat(db): lưu số đếm, chống gửi trùng".

---

### Task 5: Lưu số đếm — thay thế dòng, chốt kho, xung đột

**Files:**
- Modify: `supabase/migrations/20261030000004_luu.sql` (thêm vào `kk.a_luu`; migration chưa đẩy lên Supabase thật nên sửa tại chỗ)
- Test: `supabase/tests/05_luu_thay_the.test.sql`
- Test: `tests/dong-thoi.sh`

**Interfaces:**
- Produces: phần còn lại của `API.luu` (nhánh `HSD_KHAC`, `CUNG_HOC`, `seen`, `DEM_LAI_HOC`, `DON_LO`, kho đã chốt, thuốc mới `MOI-Mnnn`), `kk.danh_dau_thay(dot_id text, so int, boi int, u kk.tai_khoan)` như `markReplaced_`.
- Kết quả có điều kiện trả `{"ok":false, "need":"HSD_KHAC", "hsdCu":[...], "error":...}`, `{"ok":false, "need":"CUNG_HOC", "lines":[...], "error":...}`, `{"ok":false, "conflict":true, "lines":[...], "error":...}` đúng như `legacy/Code.gs`.

- [ ] **Step 1: Viết test pgTAP:** `hsd_khac` (lô A1 đã có HSD 15/03/2027, lưu HSD 16/03/2027 nhận `need = 'HSD_KHAC'`; thêm `okHsd:true` thì lưu được); `cung_hoc_nguoi_khac` (TK05 lưu cùng lô cùng hộc với TK04 nhận `need = 'CUNG_HOC'`; thêm `okCungHoc:true` thì lưu được); `dem_lai_hoc` (TK04 đếm lại hộc của chính mình: dòng cũ thành `THAY_THE`, `thay_boi` trỏ dòng mới); `dem_lai_hoc_nguoi_khac` (TK05 đếm lại hộc của TK04 nhận `Hộc này do ... – chỉ người đó hoặc tổ trưởng được đếm lại`; TK02 thì được); `dem_lai_hoc_chua_co` nhận `Hộc A 2 chưa có dòng nào của lô này – dùng "Cộng thêm"`; `don_lo_can_quyen` (TK04 nhận lỗi quyền); `don_lo_can_ly_do`; `don_lo` (TK02 dồn: mọi dòng cũ của lô thành `THAY_THE`); `seen_xung_dot` (gửi `seen` khác danh sách hiện tại nhận `conflict = true`); `kho_chot_can_ly_do`; `kho_chot_cho_duyet` (có `lyDo`: `st = 'CHO_DUYET'`, `tt = 'BO_SUNG_DEM_LAI_HOC'`, `se_thay` có mã dòng cũ, dòng cũ vẫn `HIEU_LUC`).
- [ ] **Step 2: Viết `tests/dong-thoi.sh`:** `supabase db reset`; tạo một dòng `HIEU_LUC` hộc `A 1` lô `A1` cho TK04 bằng `psql`; chạy song song hai lệnh `psql` gọi `public.api` `DEM_LAI_HOC` cùng lô cùng hộc (TK04 và TK02, mỗi lệnh `seen` là danh sách cũ); đợi cả hai; khẳng định `select count(*) from kk.dong where dot_id='DOT01' and hoc='A 1' and trang_thai='HIEU_LUC'` bằng `1` và đúng một lệnh nhận `conflict`.
- [ ] **Step 3:** Chạy `supabase test db` và `bash tests/dong-thoi.sh`. Expected: FAIL.
- [ ] **Step 4:** Viết phần còn lại của `kk.a_luu`.
- [ ] **Step 5:** Chạy lại cả hai. Expected: PASS và script in `OK`.
- [ ] **Step 6:** Commit: "feat(db): đếm lại hộc, dồn lô, chốt kho, khóa theo lô".

---

### Task 6: Hoàn tác, xem thuốc, của tôi, thuốc mới, duyệt, gộp lô

**Files:**
- Create: `supabase/migrations/20261030000005_duyet.sql`
- Test: `supabase/tests/06_duyet.test.sql`

**Interfaces:**
- Produces: `kk.a_hoanTac`, `kk.a_xemThuoc`, `kk.a_cuaToi`, `kk.a_thuocMoi`, `kk.a_choDuyet`, `kk.a_duyetDong`, `kk.a_duyetThuocMoi`, `kk.a_gopLo`, đúng khóa và câu lỗi như hàm cùng tên trong `legacy/Code.gs`.
- `hoanTac`, `gopLo` lấy cùng khóa `pg_advisory_xact_lock` như Task 4. `duyetDong` khóa dòng bằng `select ... for update`.
- `thuocMoi`: trùng đề xuất khi cùng `ma_de_xuat` hoặc cùng `norm_ten`; cấp `so` từ `dot.so_thuoc_moi`; tài khoản `TAP` trả `{maTam:'MOI-TAP', st:'CHO_DUYET', tap:true}` và không ghi.
- `duyetThuocMoi` chấp nhận: thêm vào `kk.thuoc` nếu mã chưa có (`nguon = 'MOI ' || id`), đổi `ma`, `ten` của các dòng `MOI-<id>` đang chờ và chuyển `HIEU_LUC`.

- [ ] **Step 1: Viết test:** `hoan_tac_khoi_phuc` (hoàn tác dòng đếm lại hộc: dòng mới `HUY`, dòng cũ về `HIEU_LUC`, `restored = 1`); `hoan_tac_dong_nguoi_khac` nhận `Chỉ hoàn tác được dòng của mình`; `hoan_tac_kho_chot` (TK02 nhận `Kho đã chốt – báo IT`); `xem_thuoc_kho_khac` (`khac.LE` bằng tổng `sl` kho LE); `cua_toi_gioi_han` (`n:500` trả tối đa 100 dòng, mới nhất trước); `thuoc_moi_trung_ten` (đề xuất "paracetamol  500 MG" lần 2 dùng lại `MOI-M001`); `thuoc_moi_tap`; `duyet_dong_tu_choi`; `duyet_dong_dong_cu_doi` (dòng `se_thay` đã đổi trạng thái thì báo `Các dòng ... đã thay đổi sau khi gửi phiếu – từ chối phiếu này và nhập lại`); `duyet_thuoc_moi` (mã mới có trong `kk.thuoc`, dòng `MOI-M001` thành `HIEU_LUC` với mã chính thức); `gop_lo` (lô bỏ thành `THAY_THE`, sinh dòng mới mang lô giữ với `tt = 'GOP_LO'`).
- [ ] **Step 2:** Chạy test. Expected: FAIL.
- [ ] **Step 3:** Viết migration.
- [ ] **Step 4:** Chạy test. Expected: PASS.
- [ ] **Step 5:** Commit: "feat(db): hoàn tác, thuốc mới, duyệt, gộp lô".

---

### Task 7: Hộc và tiến độ

**Files:**
- Create: `supabase/migrations/20261030000006_hoc.sql`
- Test: `supabase/tests/07_hoc.test.sql`

**Interfaces:**
- Produces: `kk.a_nhanHoc`, `kk.a_xongHoc`, `kk.a_dsHoc`, `kk.a_tienDo` như `legacy/Code.gs`; ghi bảng `hoc` theo `tap` của tài khoản; dùng `insert ... on conflict` thay cho khóa chung. `tienDo.lan1` và `lan1DaDemLai` đọc bảng `so_sanh`; `tongDanhMuc` đếm `kk.thuoc`.

- [ ] **Step 1: Viết test:** `nhan_hoc_moi` (tạo hộc `DANG_DEM`, `nguoi` có tên TK04); `nhan_hoc_hai_nguoi` (TK05 nhận cùng hộc thì `nguoi` là hai tên nối dấu phẩy); `nhan_hoc_da_xong` (trả `daXong = true`; thêm `moLai:true` thì hộc về `DANG_DEM` và `ghi` bắt đầu bằng `Mở lại bởi`); `xong_hoc_so_dong`; `ds_hoc_thu_tu` (`CHUA_NHAN` trước `DANG_DEM` trước `XONG`, cùng nhóm thì `A 2` trước `A 10`); `ds_hoc_tu_dong_dem` (hộc chỉ có dòng đếm, chưa ai nhận, hiện `DANG_DEM`); `tien_do` (đủ 11 khóa, số khớp dữ liệu dựng trong test).
- [ ] **Step 2:** Chạy test. Expected: FAIL.
- [ ] **Step 3:** Viết migration.
- [ ] **Step 4:** Chạy test. Expected: PASS.
- [ ] **Step 5:** Commit: "feat(db): hộc và tiến độ".

---

### Task 8: Cần xem — dữ liệu ở máy chủ, phân tích ở trình duyệt

**Files:**
- Create: `supabase/migrations/20261030000007_can_xem.sql`
- Test: `supabase/tests/08_can_xem.test.sql`
- Create: `canxem.js`
- Test: `tests/canxem.test.mjs`

**Interfaces:**
- Produces `kk.a_canXemDuLieu(u, d, req) returns jsonb` (chỉ `TO_TRUONG`, `IT`): `{live: [dong_json các dòng HIEU_LUC của kho], soSanh: {ma: {sl, dvt}}, dm: {ma: {ten, qc, kho}}, soVoi: d.so_voi, choDuyet: số dòng CHO_DUYET của kho}`.
- Produces `globalThis.tinhCanXem(data, cfg) -> {items, lech, chuaDem, choDuyet}` trong `canxem.js`; `cfg = {khoTen: {CHAN:'Kho chẵn',...}, loNghi: [...]}`. Chép phần thân `API.canXem` và `gan_` từ `legacy/Code.gs`, thay đọc sheet bằng `data`, thay `fmtDate_` bằng chuỗi `hsd` đã định dạng. `canxem.js` là script thường (không `export`), để trình duyệt nạp bằng `<script>` và Node nạp bằng `import`.

- [ ] **Step 1: Viết `tests/canxem.test.mjs`** (`node:test` + `node:assert`), dữ liệu dựng tay:
  - `hai_hsd_cung_lo` → có mục `loai:'HSD_KHAC'`, `muc:3`
  - `lo_gan_giong` (lô `ABC123` và `ABC124`) → có `LO_GAN_GIONG`; lô `AB1` và `AB2` (dưới 4 ký tự) → không có
  - `lo_nghi` (lô `EXP2027`) → có `LO_NGHI`
  - `lech_so_sanh` (so sánh 100, đếm 90) → `lech[0].loai === 'LECH_LAN1'`
  - `chua_dem` (mã có trong so sánh, không có dòng) → `chuaDem.length === 1`
  - `sap_xep` → mục `muc` cao đứng trước
- [ ] **Step 2: Viết test pgTAP** `can_xem_quyen` (TK04 nhận lỗi quyền) và `can_xem_du_lieu` (`live` có 2 phần tử, `soSanh` có mã đã nạp).
- [ ] **Step 3:** `node --test tests/` và `supabase test db`. Expected: FAIL.
- [ ] **Step 4:** Viết `canxem.js` và migration.
- [ ] **Step 5:** Chạy lại. Expected: PASS.
- [ ] **Step 6:** Commit: "feat: Cần xem tính ở trình duyệt".

---

### Task 9: Nối app vào Supabase

**Files:**
- Modify: `config.js` (thay `API_URL` bằng `SUPABASE_URL`, `SUPABASE_KEY`)
- Modify: `app.js:10-11` (`DVT_LIST`, `KHO_TEN` thành `let`, gán lại từ `S.user.dvt` và `S.user.khos` trong `applyLogin`; `KHO_TEN[ma]` lấy `tenNgan`)
- Modify: `app.js:86` (chữ nghi ở số lô đọc `S.user.loNghi`), `app.js:509` (ngưỡng đọc `S.user.hsdCanhBao`, câu thành `HSD còn dưới <N> ngày`), `app.js:1215` (dựng lại ô chọn `#nDvt` trong `applyLogin`, vì lúc mở app chưa có danh sách từ máy chủ; trước khi đăng nhập dùng bản lưu ở `S.user` nếu có)
- Modify: `app.js:114-128` (`apiUrl`, `api`)
- Modify: `app.js:166-168`, `app.js:1223` (bỏ ô dán link API)
- Modify: `app.js:194` (`khoOfDot` mặc định lấy mọi mã trong `S.user.khos`)
- Modify: `app.js:272-279` (`chooseKho` dựng nút từ `khoOfDot()`)
- Modify: `app.js:896-912` (`taoDotForm`: ô chọn kho dựng từ `S.user.khos`; bỏ lựa chọn `LAN1_CU`; bỏ câu "Máy tạo 1 file Google Sheets…"; bỏ lời nhắc chờ 20–40 giây)
- Modify: `app.js:838` (gọi `api('canXemDuLieu')` rồi `tinhCanXem(r, cfg)`)
- Modify: `index.html:22-24` (bỏ `#apiBox`), `index.html:186-188` (thêm `canxem.js?v=5`, tăng `?v=5` cho mọi file)
- Modify: `sw.js:2-4` (`VER = 'kk-4.0.0'`, `SHELL` thêm `canxem.js?v=5`, đổi `?v=4` thành `?v=5`)
- Test: `tests/e2e/smoke.mjs`

**Interfaces:**
- `api(action, data, timeout)` giữ chữ ký. Gửi `POST ${SUPABASE_URL}/rest/v1/rpc/api`, body `{"req": {action, pin, dot, ...data}}`, header `apikey: SUPABASE_KEY`; chỉ thêm `Authorization: Bearer <key>` khi khóa bắt đầu bằng `eyJ` (khóa anon kiểu cũ). Phản hồi HTTP từ 500 trở lên (kể cả dự án đang tạm dừng) ném lỗi có `isNet: true` để hàng đợi thử lại; phản hồi 4xx ném lỗi thường với `message` của PostgREST.

- [ ] **Step 1: Viết `tests/e2e/smoke.mjs`** (Playwright, `chromium.launch({ channel: 'chrome' })`): chạy `python3 -m http.server 8765` ở gốc repo; chặn `config.js` bằng `page.route` để trỏ `http://127.0.0.1:54321` với khóa anon local (đọc từ `supabase status -o env`); `supabase db reset` trước khi chạy. Các ca:
  - `dang_nhap_dem`: nhập PIN `444444`, chọn `Đợt thử`, chọn kho CHẴN, nhập hộc `A 1`; màn chính hiện, không có lỗi `pageerror`.
  - `luu_va_xem`: tìm `para`, chọn `TT-0001`, nhập 2 hộp × 100 + 5 lẻ, lô `A1`, HSD `15/03/2027`, lưu; tab Của tôi hiện `205` và trạng thái `Đã lưu`.
  - `hang_doi_cu`: trước khi tải trang, đặt `localStorage.kk_queue` chứa một mục `state:'pending'` với `payload` đúng dạng bản cũ (`dot:'DOT01'`, `kho:'CHAN'`, `ma:'TT-0001'`, `reqId:'old-1'`...) cùng `kk_pin`, `kk_user`; tải trang; trong 10 giây mục đó thành `done` và bảng `kk.dong` có `req_id = 'old-1'`.
  - `can_xem`: đăng nhập `111111`, mở tab Quản lý; phần Cần xem hiện không lỗi.
  - `tao_dot`: IT tạo đợt "Kiểm kho thử 11/2026" so sánh với `Đợt thử`; đợt mới xuất hiện trong danh sách.
  - `do_toc_do`: in thời gian trung bình của 10 lần `api('login')` (chỉ in, không khẳng định).
- [ ] **Step 2:** `supabase db reset && node tests/e2e/smoke.mjs`. Expected: FAIL ở `dang_nhap_dem` (app vẫn gọi Apps Script).
- [ ] **Step 3:** Sửa các file trong khối Files.
- [ ] **Step 4:** Chạy lại smoke. Expected: mọi ca `PASS`.
- [ ] **Step 5:** `grep -n "script.google.com\|Apps Script\|LAN1_CU" app.js index.html`. Expected: không còn kết quả.
- [ ] **Step 6:** Commit: "feat(web): gọi Supabase thay Apps Script, kho và đơn vị tính lấy từ máy chủ".

---

### Task 10: Thao tác cấu hình ở máy chủ

**Files:**
- Create: `supabase/migrations/20261030000008_cau_hinh.sql`
- Test: `supabase/tests/09_cau_hinh.test.sql`

**Interfaces:**
- Produces, tất cả chỉ `IT` (trừ `xuatDot` cho cả `TO_TRUONG`), mỗi hàm ghi `nhat_ky`:
  - `a_dsTaiKhoan` → `{list:[{tk,ten,pin,role,roleTen,active,ghiChu}]}`.
  - `a_luuTaiKhoan({tk?, ten, role, active, ghiChu})` → `{taiKhoan}`. Thiếu `tk` thì tạo mã `TK` + số kế tiếp 2 chữ số và PIN ngẫu nhiên 6 số không trùng. Không cho IT tự khóa hoặc tự hạ vai của chính mình (`Không tự khoá hoặc đổi vai của chính mình`).
  - `a_datLaiPin({tk})` → `{pin}` (6 số ngẫu nhiên, không trùng).
  - `a_luuThuoc({ma, ten, dvtn, qc, dvt, kho, gtin})` → `{}`; thêm hoặc sửa theo `ma`.
  - `a_nhapThuoc({list:[[ma,ten,dvtn,qc,dvt,kho,gtin]]})` → `{them, sua, loi:[{dong, error}]}`; không xóa mã nào; dòng lỗi không chặn dòng khác.
  - `a_luuKho({ma, ten, tenNgan, thuTu, hoatDong})` → `{}`. Ẩn kho đang có trong đợt mở thì báo `Kho <ten> đang dùng trong đợt <ten đợt>`.
  - `a_luuHoc({kho, them:[...], xoa:[...]})` → `{them, xoa}`; chỉ xóa hộc `CHUA_NHAN` chưa có dòng đếm, còn lại báo `Hộc <hoc> đã có người đếm – không xoá được`.
  - `a_luuCauHinh({khoa, giaTri})` → `{}`; chỉ nhận 5 khóa ở Task 1; kiểm kiểu (`HSD_CANH_BAO_NGAY` là số nguyên 0–3650, `HSD_MAC_DINH` qua `parse_hsd`, hai mảng chữ không rỗng).
  - `a_nhapSoSanh({kho, list:[[ma,ten,lo,hsd,sl,dvt,hoc,nguoi]]})` → `{soDong}`; thay toàn bộ `so_sanh` của đợt và kho đó.
  - `a_xuatDot()` → `{dot, khos, danhMuc, dong, hoc, thuocMoi, soSanh}`; `dong` gồm mọi dòng `tap=false` theo `so`, dạng `dong_json` cộng `thayBoi`, `req`, `capNhat`.

- [ ] **Step 1: Viết test:** `cau_hinh_chi_it` (TK02 gọi `luuKho` nhận lỗi quyền); `tao_tai_khoan_pin_6_so`; `dat_lai_pin_khac_cu`; `khong_tu_khoa_minh`; `nhap_thuoc_them_sua_loi` (3 dòng: 1 mới, 1 sửa, 1 thiếu `dvt` → `them=1, sua=1`, `loi` có 1 phần tử); `an_kho_dang_dung`; `xoa_hoc_da_dem`; `cau_hinh_sai_kieu` (`HSD_CANH_BAO_NGAY: "abc"` bị từ chối); `nhap_so_sanh_thay_toan_bo`; `xuat_dot_khong_co_tap`; `login_doc_cau_hinh_moi` (sửa `DVT_LIST` rồi `login` trả danh sách mới).
- [ ] **Step 2:** Chạy test. Expected: FAIL.
- [ ] **Step 3:** Viết migration; thêm `dsTaiKhoan, luuTaiKhoan, datLaiPin, luuThuoc, nhapThuoc, luuKho, luuCauHinh` vào nhóm chỉ dùng chung của `public.api` (không cần đợt); `luuHoc, nhapSoSanh, xuatDot` cần đợt.
- [ ] **Step 4:** Chạy test. Expected: PASS.
- [ ] **Step 5:** Commit: "feat(db): thao tác cấu hình cho IT".

---

### Task 11: Màn cấu hình cho IT

**Files:**
- Create: `quantri.js`
- Create: `vendor/sheetjs/xlsx.full.min.js` (tải từ `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`)
- Modify: `app.js` (vùng `loadQl`: thêm mục "Cấu hình" chỉ hiện với `isIT()`, mỗi nút gọi một hàm trong `quantri.js`)
- Modify: `index.html` (thêm `quantri.js?v=5` sau `app.js`), `sw.js` (`SHELL` thêm `quantri.js?v=5`; `vendor/sheetjs/` theo luật bộ nhớ trước đã có)
- Modify: `tailwind.config.js` (`content` thêm `quantri.js`), rồi build lại `app.css` bằng `npx tailwindcss@3.4.17 -c tailwind.config.js -i src/input.css -o app.css --minify`
- Test: `tests/e2e/quantri.mjs`

**Interfaces:**
- Consumes: Task 10; `ask(title, bodyHtml, buttons)`, `esc`, `toast`, `api` có sẵn trong `app.js`.
- Produces trong `quantri.js`: `qtTaiKhoan()`, `qtDanhMuc()`, `qtKho()`, `qtHoc()`, `qtCauHinh()`, `qtSoSanh()`, `docFileExcel(file) -> Promise<Array<Array<string>>>` (đọc sheet đầu, bỏ dòng tiêu đề).
- Giao diện: dùng lại hộp thoại `ask()` và các class đang có (`btn`, `field`, `item`, `qitem`, `muted`, `small`). Không thêm câu hướng dẫn hay nhãn phụ ngoài nhãn ô nhập.
- Nhập Excel danh mục: cột theo thứ tự `Mã, Tên thuốc, ĐVT nhập, Quy cách, ĐVT nhỏ nhất, Kho mặc định, Mã vạch GTIN` (giống sheet `DANH_MUC` cũ). Nhập Excel so sánh: `Kho, Mã, Tên, Số lô, HSD, SL, ĐVT, Hộc, Người đếm` (giống sheet `LAN1` cũ).

- [ ] **Step 1: Viết `tests/e2e/quantri.mjs`** (cùng cách dựng như smoke):
  - `them_tai_khoan`: IT thêm "Người đếm 13" vai DEM; màn hiện PIN 6 số; đăng xuất rồi đăng nhập bằng PIN đó được.
  - `nhap_danh_muc_excel`: tạo file `.xlsx` 2 dòng bằng `openpyxl` trong bước chuẩn bị test; nhập; tìm được thuốc mới ở màn đếm sau khi tải lại danh mục.
  - `them_kho`: thêm kho `KHO3` "Kho 3"; màn tạo đợt có ô chọn "Kho 3".
  - `dan_hoc`: dán "A 1\nA 2\nB 1" vào màn Hộc; màn chọn hộc hiện 3 hộc `Chưa ai nhận`.
  - `doi_canh_bao_hsd`: đặt 30 ngày; lưu dòng HSD còn 60 ngày thì không có cảnh báo `HSD còn dưới`.
  - `xss_ten_thuoc`: thêm thuốc tên `<img src=x onerror="window.__x=1">`; mở màn Danh mục và màn đếm; `window.__x` vẫn `undefined`; chữ hiện nguyên văn.
  - `dem_khong_thay_cau_hinh`: đăng nhập `444444`; không có mục "Cấu hình".
- [ ] **Step 2:** Chạy `node tests/e2e/quantri.mjs`. Expected: FAIL.
- [ ] **Step 3:** Viết `quantri.js` và sửa các file trong khối Files.
- [ ] **Step 4:** Chạy `node tests/e2e/quantri.mjs` và `node tests/e2e/smoke.mjs`. Expected: tất cả PASS.
- [ ] **Step 5:** Commit: "feat(web): màn cấu hình cho IT".

---

### Task 12: Xuất Excel của đợt

**Files:**
- Create: `xuatexcel.js`
- Test: `tests/xuatexcel.test.mjs`
- Modify: `app.js` (danh sách đợt trong tab Quản lý: thay nút "Mở file" bằng nút "Xuất Excel" cho `TO_TRUONG` và `IT`)
- Modify: `index.html`, `sw.js` (thêm `xuatexcel.js?v=5`)

**Interfaces:**
- Produces `globalThis.taoSoExcel(data) -> {[tenSheet]: Array<Array<any>>}` (hàm thuần, Node test được) và `xuatExcel(dotId)` (gọi `api('xuatDot')`, đưa kết quả qua `taoSoExcel`, ghi file `KIEM-KHO-<ten đợt>.xlsx` bằng SheetJS).
- Sheet và cột giữ đúng `legacy/Code.gs`: `DONG` theo `DONG_HEADER`; `HOC` theo `HOC_HEADER`; `THUOC_MOI`, `LAN1`, `DANH_MUC` theo tiêu đề trong `setupDot_`; `TONG_HOP` tính sẵn giá trị (không công thức) theo tiêu đề ở `setupDot_`, với cặp cột "đợt này / so sánh / Lệch" cho từng kho của đợt, tên kho lấy `tenNgan`; `TONG_HOP_LO` theo câu `QUERY` ở `setupDot_`. Cột HSD là ô ngày, cột Số lô là chữ.
- Điều kiện trước: có file `gop_kiem_kho.py`. Nếu script đọc sheet hoặc cột khác danh sách trên, sửa danh sách theo script và ghi lại trong commit.

- [ ] **Step 1: Viết `tests/xuatexcel.test.mjs`:** `ten_sheet` (đủ 7 sheet trên); `tieu_de_dong` (dòng đầu của `DONG` bằng đúng mảng `DONG_HEADER`); `tong_hop_lech` (mã có đợt này 90, so sánh 100 ở kho CHAN: cột `Lệch CHẴN` là `-10`, `Trạng thái` là `Đã đếm`); `tong_hop_chua_dem` (`CHƯA ĐẾM (đợt so sánh có)`); `tong_hop_lo_gop` (2 dòng cùng lô cộng thành 1 dòng, `Số dòng` là 2).
- [ ] **Step 2:** `node --test tests/`. Expected: FAIL.
- [ ] **Step 3:** Viết `xuatexcel.js` và nút.
- [ ] **Step 4:** `node --test tests/`. Expected: PASS.
- [ ] **Step 5:** Xuất file từ dữ liệu local có vài dòng, chạy `python3 gop_kiem_kho.py <file>`. Expected: script chạy hết, không lỗi.
- [ ] **Step 6:** Commit: "feat(web): xuất Excel của đợt".

---

### Task 13: Script chuyển dữ liệu từ Google Sheet

**Files:**
- Create: `tools/nhap_tu_google_sheet.py`
- Test: `tools/test_nhap_tu_google_sheet.py`

**Interfaces:**
- Dòng lệnh: `python3 tools/nhap_tu_google_sheet.py --trung-tam <file.xlsx> --dot DOT01=<file.xlsx> [--dot DOT02=<file.xlsx> ...] > nhap.sql`.
- Đọc từ file Trung tâm các sheet `NGUOI_DEM`, `DANH_MUC`, `DOT`, `CAU_HINH`; từ file đợt các sheet `DONG`, `HOC`, `THUOC_MOI`, `LAN1`, `CAU_HINH` (các khóa `TRANG_THAI_<kho>`). Bỏ qua sheet `TAP`, `TAP_HOC`, `NHAT_KY`.
- Ghi ra một giao dịch `begin; ... commit;` gồm `insert` vào bảng `kk`: `D00012` thành `so = 12`; `Bị thay bởi` và `Sẽ thay` đổi sang số; đặt `dot.so_dong` bằng số lớn nhất; vai không hợp lệ thành `DEM` như `users_()`; mọi chuỗi đi qua hàm thoát dấu nháy đơn.

- [ ] **Step 1: Viết test** (`unittest`): dựng file Trung tâm và một file đợt nhỏ bằng `openpyxl` trong thư mục tạm; chạy script; khẳng định câu SQL chứa `insert into kk.tai_khoan`, tên có dấu nháy `O'Brien` thoát thành `O''Brien`; rồi chạy `psql "$DB_URL" -f` vào cơ sở dữ liệu local đã `supabase db reset` (xóa dữ liệu seed trước), khẳng định `select count(*) from kk.dong` bằng số dòng trong file, `thay_boi` của dòng `THAY_THE` trỏ đúng dòng, `public.api` `login` bằng PIN trong file trả `ok:true`.
- [ ] **Step 2:** `python3 -m unittest tools/test_nhap_tu_google_sheet.py`. Expected: FAIL.
- [ ] **Step 3:** Viết script.
- [ ] **Step 4:** Chạy lại. Expected: PASS.
- [ ] **Step 5:** Commit: "feat(tools): script chuyển dữ liệu từ Google Sheet".

---

### Task 14: Tài liệu, chuyển sang Supabase thật, đo tốc độ

**Files:**
- Modify: `README.md` (thay toàn bộ phần Apps Script bằng: tạo dự án Supabase vùng Singapore, `supabase link`, `supabase db push`, điền `config.js`, chuyển dữ liệu, cách sửa và thêm tính năng theo mục 6 của spec, việc cần làm trước ngày kiểm: khôi phục dự án nếu đang tạm dừng, xuất Excel cuối mỗi ngày kiểm để có bản lưu)
- Modify: `huong-dan.html` (chỉ những câu nhắc Google Sheets hay Apps Script; luật đếm giữ nguyên)

- [ ] **Step 1:** Anh Sơn tạo dự án và gửi địa chỉ, khóa publishable. Chạy `supabase link --project-ref <ref>` rồi `supabase db push`. Expected: in danh sách 8 migration đã áp.
- [ ] **Step 2:** Mở Advisors trong trang quản trị Supabase (Security). Expected: không có cảnh báo bảng hay hàm mở cho `anon` ngoài `public.api`.
- [ ] **Step 3:** IT tải file Trung tâm và các file đợt dạng `.xlsx`; chạy Task 13 vào cơ sở dữ liệu thật. Expected: số tài khoản, số mã danh mục, số dòng `HIEU_LUC` từng đợt khớp với Google Sheet (in bảng so sánh).
- [ ] **Step 4:** Điền `config.js` bằng địa chỉ và khóa thật; chạy `python3 -m http.server 8765`, mở `http://localhost:8765` bằng Google Chrome; đăng nhập tài khoản Tập, đếm 3 dòng, hoàn tác 1 dòng. Expected: đúng như bản cũ.
- [ ] **Step 5:** Chạy ca `do_toc_do` của smoke với Supabase thật. Expected: trung bình dưới 500 ms (ghi số đo vào commit).
- [ ] **Step 6:** Commit README và hướng dẫn. Hỏi anh Sơn trước khi gộp nhánh `supabase` vào `main` và đẩy lên GitHub.
- [ ] **Step 7:** Sau khi anh đồng ý: gộp, đẩy, chờ GitHub Pages cập nhật; mở `https://n95st.github.io/kiemkho/` trên điện thoại thật, đăng nhập tài khoản Tập. Expected: thao tác chọn đợt, chọn hộc, chọn thuốc không còn chờ 2 giây.
- [ ] **Step 8:** Giữ bản Apps Script 2 tuần. Có sự cố thì `git revert` commit gộp và đẩy lại.
