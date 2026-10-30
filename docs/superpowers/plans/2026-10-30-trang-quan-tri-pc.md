# Trang quản trị cho máy tính — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm trang `quantri.html` cho IT dùng trên máy tính, có 5 mục xem, thêm, sửa và nhập xuất Excel. Đồng thời sửa lỗi nhập số liệu so sánh nhiều kho trên cả trang mới lẫn app điện thoại.

**Architecture:** Máy chủ có thêm 2 hàm chỉ đọc (`dsKho`, `dsSoSanh`) và hàm `nhapSoSanh` nhận cả file nhiều kho trong một lần gọi. Phía trình duyệt, các hàm dùng chung (`api`, đọc Excel) được tách khỏi `app.js` và `quantri.js` sang `chung.js`. Các hàm thuần dựng file mẫu, file xuất, kiểm tiêu đề và tách theo kho nằm trong `xuatexcel.js`. Trang mới là `quantri.html` cùng `quantri-pc.js`.

**Tech Stack:** Supabase (Postgres 17, pgTAP), JavaScript thuần không framework, Tailwind CSS 3.4.17 biên dịch ra `app.css`, SheetJS 0.18.5 (`vendor/sheetjs/`), Node `node:test`, Playwright 1.49.1 với Google Chrome (`channel: 'chrome'`), Python 3 và openpyxl để dựng file Excel thử.

**Spec:** `docs/superpowers/specs/2026-10-30-trang-quan-tri-pc-design.md`

## Global Constraints

- Trả lời máy chủ luôn có dạng `{"ok":true,...}` hoặc `{"ok":false,"error":"<câu lỗi>"}`. Trang hiện nguyên văn câu lỗi máy chủ trả về.
- Không sửa file migration cũ. Mọi thay đổi máy chủ nằm trong `supabase/migrations/20261030000009_quan_tri_pc.sql`.
- Hàm mới trong schema `kk` là `security definer` và đặt `set search_path = kk, extensions, pg_temp`, giống các hàm đang có.
- Mọi giá trị chèn vào HTML đi qua `esc()`.
- Mọi chữ tiếng Việt trên giao diện có đủ dấu. Màn không có câu hướng dẫn hay nhãn phụ, chỉ có nhãn cột, nhãn ô và nhãn nút.
- Không bao giờ hiện PIN trong bảng hoặc trong file xuất. PIN chỉ hiện một lần trong hộp thoại sau khi thêm tài khoản hoặc đặt lại PIN.
- PIN trên trang máy tính chỉ lưu trong `sessionStorage`, khoá `kkqt_pin`. Mọi lần đọc và ghi `sessionStorage` bọc `try/catch`.
- Dòng ví dụ của file mẫu có ô Mã là `VIDU`.
- Cả nhánh chỉ tăng số phiên bản một lần, ở Task 2: `?v=11` trong `index.html` và `SHELL`, `VER = 'kk-4.1.6'` trong `sw.js`. Các task sau có đổi file mà điện thoại nạp thì không tăng nữa, vì chưa đưa lên giữa các task.
- Repo công khai. Không commit PIN thật, dữ liệu thật hay file Excel thật.
- Chỉ đẩy lên `main` sau khi anh Sơn đồng ý.

## Review Focus

- File số liệu so sánh có kho Chẵn đúng và kho Lẻ có một dòng sai: không kho nào bị đổi, trên cả trang máy tính lẫn điện thoại. Test ở Task 1 (`nhieu_kho_loi_kho_sau_giu_kho_dau`), Task 4 (`nhap_so_sanh_kho_sau_loi_giu_kho_dau`) và Task 8 (`so_sanh_kho_sau_loi`).
- IT chọn nhầm file danh mục ở mục Số liệu so sánh, hoặc ngược lại: trang báo không đúng mẫu và không gửi gì lên máy chủ. Test ở Task 6 (`danh_muc_nham_file_so_sanh`) và Task 8 (`so_sanh_nham_file_danh_muc`).
- Ô có chữ số mở đầu bằng 0 (mã thuốc `00045`, GTIN `0893456789012`, số lô `00123`) và ô HSD đi qua một vòng xuất rồi nhập lại: giá trị giữ nguyên. Test ở Task 3 (`vong_danh_muc`, `vong_so_sanh`) và Task 6, Task 8 (e2e xuất rồi nhập lại).
- Mạng rớt khi đang chờ lần ghi thật của số liệu so sánh: trang báo "Không rõ đã nhập xong chưa" và tải lại bảng. Test ở Task 8 (`so_sanh_mang_rot_khi_ghi`).
- Tên thuốc, tên tài khoản hoặc ghi chú có thẻ HTML: bảng và khung sửa hiện nguyên chữ, không chạy mã. Test ở Task 5 (`xss_ten_tai_khoan`) và Task 6 (`xss_ten_thuoc_pc`).

---

### Task 1: Máy chủ: `dsKho`, `dsSoSanh`, `nhapSoSanh` nhiều kho

**Files:**
- Create: `supabase/migrations/20261030000009_quan_tri_pc.sql`
- Create: `supabase/tests/10_quan_tri_pc.test.sql`

**Interfaces:**
- Produces (gọi qua `public.api`):
  - `dsKho` (không cần đợt) trả `{ list: [{ ma, ten, tenNgan, thuTu, hoatDong }] }`, xếp theo `thu_tu` rồi `ma`, có cả kho đã ẩn.
  - `dsSoSanh` nhận `kho` (bỏ trống là mọi kho) và trả `{ list: [[kho, ma, ten, lo, hsd, sl, dvt, hoc, nguoi]] }`. Mỗi dòng giống hệt phần `soSanh` của `xuatDot`. Xem được cả đợt đã đóng. Không ghi nhật ký.
  - `nhapSoSanh` nhận `nhieuKho: [{ kho, list }]` và `chiKiem` (tùy chọn). Trả `{ theoKho: { <mã kho>: <số dòng> }, loi: [{ kho, dong, error }] }`. `dong` là số thứ tự (bắt đầu từ 1) trong `list` của kho đó.
  - Khi không có `nhieuKho`, `nhapSoSanh` nhận `kho`, `list` và trả `{ soDong, loi: [{ dong, error }] }` như hiện nay.

- [ ] **Step 1: Viết bài kiểm tra pgTAP `supabase/tests/10_quan_tri_pc.test.sql`**

Dùng lại cách viết của `09_cau_hinh.test.sql`: `begin; select plan(N);`, hàm `pg_temp.api(act, extra, pin)` mặc định PIN `111111`, đợt `DOT01`, kho `CHAN`. Kết thúc bằng `select * from finish(); rollback;`. Dữ liệu mẫu: `TK02` (`222222`) là tổ trưởng, `DOT01` mở có `CHAN` và `LE`, `DOT02` đã đóng.

```sql
-- dsKho
select is(pg_temp.api('dsKho', '{}', '222222')->>'ok', 'false', 'dskho_chi_it');
select is(public.api('{"action":"dsKho","pin":"111111"}')->>'ok', 'true', 'dskho_khong_can_dot');
select is(pg_temp.api('luuKho', '{"ma":"K9","ten":"Kho 9","tenNgan":"K9","thuTu":"5","hoatDong":false}')->>'ok', 'true', 'dskho_tao_kho_an');
select is((select e from jsonb_array_elements(pg_temp.api('dsKho')->'list') e where e->>'ma' = 'K9'),
  '{"ma":"K9","ten":"Kho 9","tenNgan":"K9","thuTu":5,"hoatDong":false}'::jsonb, 'dskho_co_kho_an');
select is((select array_agg(e->>'ma' order by o) from jsonb_array_elements(pg_temp.api('dsKho')->'list') with ordinality t(e, o)),
  (select array_agg(ma order by thu_tu, ma) from kk.kho), 'dskho_thu_tu');

-- nhapSoSanh nhieuKho
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":[]}', '222222')->>'ok', 'false', 'nhieu_kho_chi_it');
select is(pg_temp.api('nhapSoSanh', $j${"nhieuKho":[
    {"kho":"CHAN","list":[["TT-0001","Paracetamol","L1","15/03/2027","10,5","Viên","A1","Lan"],["TT-0002","B","L2","",3,"Viên","",""]]},
    {"kho":"LE","list":[["TT-0009","Vitamin C","V1","",7,"Viên","B1","Minh"]]}]}$j$) - 'ok',
  '{"theoKho":{"CHAN":2,"LE":1},"loi":[]}'::jsonb, 'nhieu_kho_dung_ca_hai');
select is((select count(*)::int from kk.so_sanh where dot_id = 'DOT01'), 3, 'nhieu_kho_ghi_du');
create temp table r_loi as select pg_temp.api('nhapSoSanh', $j${"nhieuKho":[
    {"kho":"CHAN","list":[["TT-0005","X","L9","",1,"Viên","",""]]},
    {"kho":"LE","list":[["TT-0009","Vitamin C","V1","31/02/2027",7,"Viên","",""]]}]}$j$) as j;
select is((select j->'loi' from r_loi), '[{"kho":"LE","dong":1,"error":"HSD không hợp lệ: 31/02/2027"}]'::jsonb, 'nhieu_kho_bao_loi_kho_sau');
select is((select string_agg(lo, ',' order by lo) from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN'), 'L1,L2', 'nhieu_kho_loi_kho_sau_giu_kho_dau');
-- chiKiem: counts valid rows, writes nothing, logs nothing
create temp table nk0 as select count(*) n from kk.nhat_ky where hanh_dong = 'NHAP_SO_SANH';
select is(pg_temp.api('nhapSoSanh', $j${"chiKiem":true,"nhieuKho":[{"kho":"CHAN","list":[["TT-0007","Y","L7","",1,"Viên","",""]]}]}$j$)->'theoKho',
  '{"CHAN":1}'::jsonb, 'nhieu_kho_chi_kiem_dem');
select is((select string_agg(lo, ',' order by lo) from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN'), 'L1,L2', 'nhieu_kho_chi_kiem_khong_ghi');
select is((select count(*) from kk.nhat_ky where hanh_dong = 'NHAP_SO_SANH'), (select n from nk0), 'nhieu_kho_chi_kiem_khong_nhat_ky');
select is(pg_temp.api('nhapSoSanh', $j${"chiKiem":true,"nhieuKho":[{"kho":"CHAN","list":[["","Y","L7","",1,"Viên","",""]]}]}$j$)->'loi',
  '[{"kho":"CHAN","dong":1,"error":"Thiếu mã thuốc"}]'::jsonb, 'nhieu_kho_chi_kiem_bao_loi');
select is(pg_temp.api('nhapSoSanh', '{"chiKiem":true,"list":[["TT-0007","Y","L7","",1,"Viên","",""]]}')->'soDong', '1', 'cach_goi_cu_chi_kiem_dem');
select is((select string_agg(lo, ',' order by lo) from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN'), 'L1,L2', 'cach_goi_cu_chi_kiem_khong_ghi');
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":[{"kho":"K9","list":[]}]}')->>'error', 'Đợt "Đợt thử" không kiểm Kho 9', 'nhieu_kho_kho_ngoai_dot');
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":[{"kho":"CHAN","list":[]},{"kho":"chan","list":[]}]}')->>'error', 'Kho CHAN bị lặp trong tệp', 'nhieu_kho_lap_kho');
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":"x"}')->>'error', 'Danh sách số liệu không hợp lệ', 'nhieu_kho_khong_phai_mang');
select is(pg_temp.api('nhapSoSanh', '{"nhieuKho":[],"dot":"DOT02"}')->>'ok', 'false', 'nhieu_kho_dot_dong_bi_chan');

-- dsSoSanh
select is(pg_temp.api('dsSoSanh', '{}', '222222')->>'ok', 'false', 'dssosanh_chi_it');
select is(pg_temp.api('dsSoSanh')->'list', pg_temp.api('xuatDot')->'soSanh', 'dssosanh_giong_xuat_dot');
select is(jsonb_array_length(pg_temp.api('dsSoSanh', '{"kho":"LE"}')->'list'), 1, 'dssosanh_loc_kho');
select is(pg_temp.api('dsSoSanh', '{"dot":"DOT02"}')->>'ok', 'true', 'dssosanh_dot_dong_xem_duoc');
```

- [ ] **Step 2: Chạy để thấy bài kiểm tra hỏng**

Run: `supabase db reset && supabase test db`
Expected: `10_quan_tri_pc.test.sql` FAIL, vì chưa có `dsKho`, `dsSoSanh` và `nhieuKho`. Các file `01` đến `09` vẫn PASS.

- [ ] **Step 3: Viết migration `20261030000009_quan_tri_pc.sql`**

- `kk.so_sanh_loi(list jsonb) returns jsonb`: trả mảng `{dong, error}` theo đúng 4 luật kiểm dòng đang có trong `kk.a_nhapsosanh` (chép nguyên câu lỗi).
- `kk.so_sanh_ghi(d kk.dot, kho text, list jsonb) returns int`: phần xoá, chèn và ghi nhật ký `NHAP_SO_SANH` đang có, trả số dòng đã ghi. Không tự lấy khoá.
- `create or replace function kk.a_nhapsosanh`:
  - Không có `nhieuKho`: giữ đúng hành vi cũ, viết lại bằng hai hàm trên. Thêm một điều: khi `chiKiem` là `true` thì trả `soDong` là số dòng hợp lệ và không ghi.
  - Có `nhieuKho`: không phải mảng thì báo `Danh sách số liệu không hợp lệ`. Mỗi phần tử qua `kk.kiem_kho(d, kho)`, và `list` phải là mảng. Mã kho trùng nhau (so sau khi viết hoa) thì báo `Kho <MÃ> bị lặp trong tệp`. Kiểm mọi dòng của mọi kho. Có lỗi, hoặc có `chiKiem`, thì trả `theoKho` là số dòng hợp lệ của từng kho cùng `loi`, rồi dừng. Không lỗi thì lấy `pg_advisory_xact_lock(hashtext('soSanh|' || d.id || '|' || kho))` cho mọi kho theo thứ tự mã kho, rồi gọi `kk.so_sanh_ghi` cho từng kho.
- `kk.a_dskho` và `kk.a_dssosanh`: đầu hàm `perform kk.can_vai(u, '{IT}')`. `a_dssosanh` dùng `kk.kiem_kho(d, kho)` khi có `kho`, và dùng cùng biểu thức dòng và thứ tự `order by s.kho, s.ctid` như `soSanh` trong `kk.a_xuatdot`.
- `create or replace function public.api`: chép nguyên thân hàm từ `20261030000001_nen.sql`, chỉ thêm `dskho` vào mảng `hub`.
- Cuối file: `revoke execute on all functions in schema kk from public, anon, authenticated;` như cuối file `000008`.

- [ ] **Step 4: Chạy lại toàn bộ bài pgTAP**

Run: `supabase db reset && supabase test db`
Expected: mọi file `01` đến `10` PASS. Riêng các ca `nhap_so_sanh_*` trong `09` phải PASS không sửa gì, vì đó là bằng chứng cách gọi cũ của điện thoại còn chạy.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261030000009_quan_tri_pc.sql supabase/tests/10_quan_tri_pc.test.sql
git commit -m "feat(db): dsKho, dsSoSanh và nhapSoSanh nhận cả file nhiều kho"
```

### Task 2: Tách phần dùng chung sang `chung.js`

**Files:**
- Create: `chung.js`
- Modify: `app.js` (bỏ `$`, `esc`, `norm`, `api`), `quantri.js` (bỏ khối Excel từ `qtTaiSheetJS` đến `qtDocExcel`), `xuatexcel.js` (sửa chú thích đầu file), `index.html`, `sw.js`, `tests/excel-ngay.test.mjs`, `tailwind.config.js`

**Interfaces:**
- Produces (`chung.js`, script thường, nạp trước `app.js`):
  - `$`, `esc`, `norm`: chuyển nguyên từ `app.js`.
  - `api(action, data, timeout)`: chuyển nguyên từ `app.js`. Hàm đọc biến toàn cục `S.pin` và `S.dot` lúc gọi. Trang nào nạp `chung.js` phải tự khai `S`.
  - `qtTaiSheetJS()`, `oExcelSangChu(c, i, cotNgay, date1904)`: chuyển nguyên từ `quantri.js`.
  - `oExcelDoc(buf, cotNgay)`: đổi để trả mọi dòng, **kể cả dòng tiêu đề**.
  - `docFileExcel(file, cotNgay)`: trả mọi dòng như `oExcelDoc`.
  - `qtDocExcel(file, cotNgay)` trả `{ tieuDe: string[], list: string[][], so: number[] }`. `tieuDe` là dòng 1 của file, hoặc `[]` khi file trống. `list` và `so` giữ nghĩa cũ.

- [ ] **Step 1: Sửa `tests/excel-ngay.test.mjs` cho cách nạp mới và thêm ca giữ tiêu đề**

Nạp `../chung.js` thay `../quantri.js`, bỏ dòng giả `globalThis.$`. Ba ca cũ đọc dữ liệu từ `rows.slice(1)`. Thêm ca:

```js
test('doc_giu_dong_tieu_de', () => {
  assert.deepEqual(oExcelDoc(book(['15/04/2027']), 1)[0], ['Mã', 'HSD']);
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

Run: `TZ=Asia/Ho_Chi_Minh node --test tests/excel-ngay.test.mjs`
Expected: FAIL vì chưa có `chung.js`.

- [ ] **Step 3: Tạo `chung.js` và bỏ các khối đã chuyển khỏi `app.js` và `quantri.js`**

Đầu file ghi chú như kiểu của `quantri.js`: file dùng chung cho `index.html` và `quantri.html`, và trang nạp phải khai `S`. Trong `index.html`, thêm `<script src="chung.js?v=11"></script>` ngay sau `config.js`. Đổi mọi `?v=10` thành `?v=11`. Trong `sw.js`, thêm `'chung.js?v=11'` vào `SHELL`, đổi các `?v=10` thành `?v=11` và đặt `VER = 'kk-4.1.6'`. Trong `tailwind.config.js`, thêm `'chung.js'`, `'quantri.html'` và `'quantri-pc.js'` vào `content`.

- [ ] **Step 4: Chạy mọi bài kiểm tra có sẵn**

Run:
```bash
TZ=Asia/Ho_Chi_Minh node --test tests/excel-ngay.test.mjs
node --test tests/canxem.test.mjs tests/xuatexcel.test.mjs
supabase db reset && node tests/e2e/smoke.mjs && supabase db reset && node tests/e2e/quantri.mjs
```
Expected: tất cả PASS. Hai bài e2e kết thúc bằng `Tất cả PASS`. Đây là bằng chứng app điện thoại chạy như cũ.

- [ ] **Step 5: Commit**

```bash
git add chung.js app.js quantri.js xuatexcel.js index.html sw.js tailwind.config.js tests/excel-ngay.test.mjs
git commit -m "refactor: tách api và hàm đọc Excel sang chung.js để hai trang cùng nạp"
```

### Task 3: Hàm thuần cho file mẫu, file xuất, kiểm tiêu đề và tách kho

**Files:**
- Modify: `xuatexcel.js`
- Create: `tests/mauexcel.test.mjs`

**Interfaces:**
- Consumes: `oExcelDoc` (Task 2), `xlSach`, `xlNgay`, `LAN1_HEADER`, `DANH_MUC_HEADER` (đang có).
- Produces (khai bằng `function` hoặc `globalThis.` để bài Node gọi được):
  - `DANH_MUC_MAU_HEADER = DANH_MUC_HEADER.slice(0, 7)`.
  - `VIDU_DANH_MUC = ['VIDU', 'VÍ DỤ Paracetamol 500mg', 'Hộp', 10, 'Viên', 'CHAN', '8934567890123']`.
  - `VIDU_SO_SANH = ['CHAN', 'VIDU', 'VÍ DỤ Paracetamol 500mg', 'L001', '15/03/2027', 120, 'Viên', 'A 1', 'Lan']`.
  - `soDanhMuc(list) -> { DANH_MUC: rows }`. `list` theo dạng `danhMuc` trả về. File mẫu là `soDanhMuc([VIDU_DANH_MUC])`.
  - `soSoSanh(list) -> { LAN1: rows }`. `list` theo dạng `dsSoSanh` trả về. File mẫu là `soSoSanh([VIDU_SO_SANH])`. Mỗi dòng qua `xlDongLan1`.
  - `xlDongLan1(r)`: đổi một dòng dạng máy chủ thành dòng Excel (ô Số lô thành chữ, ô HSD qua `xlNgay`). `taoSoExcel` dùng lại hàm này cho sheet `LAN1`.
  - `soTaiKhoan(list) -> { TAI_KHOAN: rows }`, tiêu đề `['Mã TK', 'Tên', 'Vai trò', 'Trạng thái', 'Ghi chú']`. Vai trò lấy `roleTen`. Trạng thái là `'Đang dùng'` hoặc `'Đã khoá'`. Không có PIN.
  - `dungTieuDe(tieuDe, mau) -> boolean`: cắt khoảng trắng từng ô, bỏ các ô trống ở cuối, rồi so bằng nhau từng ô.
  - `timDongViDu(list, so, cotMa) -> number`: số dòng trong file của dòng đầu tiên có ô `cotMa` là `VIDU` (không phân biệt hoa thường). Không có thì trả `0`.
  - `tachTheoKho(list, so, ks) -> { loi: [{ dong, error }], nhieuKho: [{ kho, list, so }] }`. `dong` là số dòng trong file. Mã kho cắt khoảng trắng và viết hoa. Câu lỗi giữ như `qtSoSanh`: `'Kho ' + (ô kho hoặc '(trống)') + ' không có trong đợt này'`. Thứ tự kho theo lần xuất hiện đầu tiên. `list` của mỗi kho bỏ ô Kho (8 ô).
  - `doiDongLoi(loi, nhieuKho) -> [{ dong, error }]`: đổi lỗi `{kho, dong, error}` của máy chủ sang số dòng trong file, xếp tăng theo `dong`.

- [ ] **Step 1: Viết `tests/mauexcel.test.mjs`**

Nạp SheetJS như `excel-ngay.test.mjs`, rồi nạp `chung.js` và `xuatexcel.js` bằng `vm.Script(...).runInThisContext()`. Hàm phụ `vong(sheets)`: ghi `xlSach(sheets)` ra bộ nhớ bằng `XLSX.write(wb, { type: 'array', bookType: 'xlsx' })`, rồi đọc lại bằng `oExcelDoc(buf, cotNgay)`.

```js
test('vong_danh_muc', () => {
  const list = [['00045', 'Thuốc A', 'Hộp', 10, 'Viên', 'CHAN', '0893456789012'], ['B-2', 'Thuốc B', 'Chai', '', 'Chai', '', '']];
  const rows = vong(soDanhMuc(list));
  assert.ok(dungTieuDe(rows[0], DANH_MUC_MAU_HEADER));
  assert.deepEqual(rows.slice(1), list.map(r => r.map(String)));
});
test('vong_so_sanh', () => {
  const list = [['CHAN', 'TT-0001', 'Para', '00123', '15/03/2027', 10.5, 'Viên', 'A 1', 'Lan'], ['LE', 'TT-0009', 'Vit C', 'V1', '', 7, 'Viên', '', '']];
  const rows = vong(soSoSanh(list), 4);
  assert.ok(dungTieuDe(rows[0], LAN1_HEADER));
  assert.deepEqual(rows.slice(1), list.map(r => r.map(String)));
});
test('mau_co_dong_vi_du', () => {
  assert.equal(timDongViDu(vong(soDanhMuc([VIDU_DANH_MUC])).slice(1), [2], 0), 2);
  assert.equal(timDongViDu(vong(soSoSanh([VIDU_SO_SANH]), 4).slice(1), [2], 1), 2);
  assert.equal(timDongViDu([['TT-1'], ['vidu']], [2, 5], 0), 5);
  assert.equal(timDongViDu([['TT-1']], [2], 0), 0);
});
test('tieu_de_lech', () => {
  assert.ok(dungTieuDe([' Mã ', 'Tên thuốc', 'ĐVT nhập', 'Quy cách', 'ĐVT nhỏ nhất', 'Kho mặc định (CHAN/LE)', 'Mã vạch GTIN (tự học khi quét)', '', ''], DANH_MUC_MAU_HEADER));
  assert.ok(!dungTieuDe(LAN1_HEADER, DANH_MUC_MAU_HEADER));
  assert.ok(!dungTieuDe(DANH_MUC_MAU_HEADER, LAN1_HEADER));
  assert.ok(!dungTieuDe([], LAN1_HEADER));
});
test('tach_theo_kho', () => {
  const r = tachTheoKho([[' chan', 'A'], ['LE', 'B'], ['CHAN', 'C']], [2, 3, 5], ['CHAN', 'LE']);
  assert.deepEqual(r, { loi: [], nhieuKho: [{ kho: 'CHAN', list: [['A'], ['C']], so: [2, 5] }, { kho: 'LE', list: [['B']], so: [3] }] });
  assert.deepEqual(tachTheoKho([['K9', 'A'], ['', 'B']], [2, 4], ['CHAN']).loi,
    [{ dong: 2, error: 'Kho K9 không có trong đợt này' }, { dong: 4, error: 'Kho (trống) không có trong đợt này' }]);
});
test('doi_dong_loi', () => {
  const nk = [{ kho: 'CHAN', list: [[], []], so: [2, 5] }, { kho: 'LE', list: [[]], so: [3] }];
  assert.deepEqual(doiDongLoi([{ kho: 'CHAN', dong: 2, error: 'x' }, { kho: 'LE', dong: 1, error: 'y' }], nk),
    [{ dong: 3, error: 'y' }, { dong: 5, error: 'x' }]);
});
test('tai_khoan_khong_co_pin', () => {
  const s = soTaiKhoan([{ tk: 'TK04', ten: 'Lan', pin: '444444', role: 'DEM', roleTen: 'Người đếm', active: false, ghiChu: 'ca tối' }]);
  assert.deepEqual(s.TAI_KHOAN, [['Mã TK', 'Tên', 'Vai trò', 'Trạng thái', 'Ghi chú'], ['TK04', 'Lan', 'Người đếm', 'Đã khoá', 'ca tối']]);
  assert.ok(!JSON.stringify(s).includes('444444'));
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

Run: `TZ=Asia/Ho_Chi_Minh node --test tests/mauexcel.test.mjs`
Expected: FAIL, báo `soDanhMuc is not defined`.

- [ ] **Step 3: Viết các hàm trong `xuatexcel.js` theo khối Interfaces**

- [ ] **Step 4: Chạy bài mới và bài cũ của `xuatexcel.js`**

Run: `TZ=Asia/Ho_Chi_Minh node --test tests/mauexcel.test.mjs tests/xuatexcel.test.mjs tests/excel-ngay.test.mjs`
Expected: PASS hết. Bài cũ `xuatexcel.test.mjs` PASS chứng tỏ sheet `LAN1` của file xuất đợt không đổi.

- [ ] **Step 5: Thêm dòng `TZ=Asia/Ho_Chi_Minh node --test tests/mauexcel.test.mjs` vào mục 8 của `README.md`, rồi commit**

```bash
git add xuatexcel.js tests/mauexcel.test.mjs README.md
git commit -m "feat: hàm dựng file mẫu, file xuất, kiểm tiêu đề và tách số liệu theo kho"
```

### Task 4: App điện thoại: nhập số liệu so sánh trong một lần gọi

**Files:**
- Modify: `quantri.js` (hàm `qtSoSanh`)
- Modify: `tests/e2e/quantri.mjs`

**Interfaces:**
- Consumes: `tachTheoKho`, `doiDongLoi` (Task 3). `nhapSoSanh` với `nhieuKho` (Task 1).

- [ ] **Step 1: Thêm ca e2e `nhap_so_sanh_kho_sau_loi_giu_kho_dau` vào `tests/e2e/quantri.mjs`, đặt sau ca `nhap_so_sanh_excel`**

Dựng thêm file `so-sanh-loi.xlsx` trong khối openpyxl đầu file. File có tiêu đề như `XLSX_SS`, dòng 2 là `['CHAN', 'TT-0002', 'Thuốc mới', 'N1', '15/03/2027', 5, 'Viên', '', '']`, dòng 3 là `['LE', 'TT-0009', 'Vitamin C', 'V1', '31/02/2027', 7, 'Viên', '', '']`. Ca chạy sau `nhap_so_sanh_excel`, nên kho Chẵn đang có 2 dòng (lô `L1`, `L2`).

```js
ok(/Chưa nhập gì/.test(body) && /Dòng 3: HSD không hợp lệ/.test(body), 'không báo lỗi dòng 3: ' + body);
ok(sql("select string_agg(lo, ',' order by lo) from kk.so_sanh where dot_id = 'DOT01' and kho = 'CHAN'") === 'L1,L2', 'kho Chẵn bị thay dù kho Lẻ lỗi');
```

- [ ] **Step 2: Chạy để thấy hỏng**

Run: `supabase db reset && node tests/e2e/quantri.mjs`
Expected: ca `nhap_so_sanh_kho_sau_loi_giu_kho_dau` FAIL với câu `kho Chẵn bị thay dù kho Lẻ lỗi`.

- [ ] **Step 3: Viết lại `qtSoSanh`**

Hàm dùng `tachTheoKho(list, so, khoOfDot())`. Có `loi` thì hiện như cũ. Không lỗi thì gọi `qtGoi('nhapSoSanh', { nhieuKho: nhieuKho.map(k => ({ kho: k.kho, list: k.list })) }, 180000)` đúng một lần. Máy chủ trả `loi` thì hiện `'<p>Chưa nhập gì</p>' + qtDongLoi(doiDongLoi(r.loi, nhieuKho))`. Không lỗi thì mỗi kho một dòng `${esc(KHO_TEN[k])}: ${r.theoKho[k]} dòng`, giữ đúng chữ ca `nhap_so_sanh_excel` đang dò. Không thêm bước chỉ kiểm hay bước xác nhận.

- [ ] **Step 4: Chạy lại cả bài e2e**

Run: `supabase db reset && node tests/e2e/quantri.mjs`
Expected: `Tất cả PASS`.

- [ ] **Step 5: Commit**

```bash
git add quantri.js tests/e2e/quantri.mjs
git commit -m "fix: app điện thoại nhập số liệu so sánh nhiều kho trong một lần gọi, không còn ghi dở"
```

### Task 5: Khung trang `quantri.html`, đăng nhập, chọn đợt và mục Tài khoản

**Files:**
- Create: `quantri.html`, `quantri-pc.js`, `tests/e2e/quantri-pc.mjs`
- Modify: `app.css` (biên dịch lại), `README.md` (mục 8 thêm lệnh chạy e2e mới)

**Interfaces:**
- Consumes: `chung.js` (Task 2), `soTaiKhoan` và `xlSach` (Task 3).
- Produces (trong `quantri-pc.js`, các task 6 đến 9 dùng):
  - `S = { pin, dot, user, dotInfo, dots }`: `user` là kết quả `login`, `dotInfo` là đợt đang chọn kèm `trangThai` của từng kho.
  - `chonDot(id)`: gọi `api('login', { dot: id })`, cập nhật `S`, đặt `document.body.dataset.dong = '1'` khi đợt đã đóng (không thì xoá), rồi vẽ lại mục đang mở.
  - `veBang(hop, cot, dong, loc, chon)`: vẽ bảng vào phần tử `hop`. `cot` là mảng nhãn cột. `dong` là mảng các mảng ô (chữ thô, hàm tự `esc`). `loc(i)` cho biết dòng `i` có hiện không. `chon(i)` chạy khi bấm dòng. Hàm ghi số đếm dạng `"120 / 1.038"` (`toLocaleString('vi-VN')`). Hàm vẽ tối đa 500 dòng khớp đầu tiên. Dòng đang chọn có lớp `chon`.
  - `moKhung(tieuDe, oHtml, luu)`: mở khung sửa bên phải. `luu()` trả Promise. Lỗi máy chủ (`Error.message`) hiện nguyên văn trong `#khungLoi`.
  - `hoi(tieuDe, noiDungHtml, nut)`: hộp thoại xác nhận dùng thẻ `<dialog>`, trả Promise giá trị của nút được bấm.
  - `taiFile(sheets, tenFile)`: `qtTaiSheetJS()` rồi `XLSX.writeFile(xlSach(sheets), tenFile)`.
  - Lớp `ghi-dot` trên mọi nút ghi vào đợt. CSS `body[data-dong="1"] .ghi-dot { display: none }` đặt trong `<style>` của `quantri.html`.

- [ ] **Step 1: Viết `tests/e2e/quantri-pc.mjs` với các ca của task này**

Chép khung từ `tests/e2e/quantri.mjs`: đọc `supabase status`, hàm `sql`, `run`, `ok`, máy chủ tĩnh ở cổng `8767`, `newPage()` có `viewport: { width: 1366, height: 800 }`, `goto(BASE + 'quantri.html')`. Hàm `vao(page, pin)` điền `#pin`, bấm `#btnLogin`, chờ `#menu`. Hàm `moMuc(page, ten)` bấm nút menu có chữ `ten`.

Các ca và điều kiện đạt:
- `dang_nhap_it`: `vao(p, '111111')` thấy menu đủ 5 mục `Tài khoản`, `Danh mục thuốc`, `Kho và hộc`, `Số liệu so sánh`, `Đợt kiểm`. Ô chọn đợt `#dot` có giá trị `DOT01`.
- `dang_nhap_khong_phai_it`: PIN `444444` thì `#loginMsg` là `Trang này chỉ dành cho IT`, `sessionStorage.getItem('kkqt_pin')` là `null` và không có `#menu`.
- `sai_pin`: PIN `999999` thì `#loginMsg` chứa `Sai mã PIN`. Ca chạy xong `sql('delete from kk.pin_sai')`.
- `pin_chi_trong_tab`: sau khi đăng nhập, `p.reload()` vẫn vào thẳng menu. Một context mới mở trang thì thấy `#pin`. `localStorage` không có giá trị `111111`.
- `tai_khoan_khong_lo_pin`: mở mục Tài khoản, số đếm là `<n> / <n>` với `n = sql('select count(*) from kk.tai_khoan')`. HTML trang không chứa PIN nào trong `select pin from kk.tai_khoan`.
- `tai_khoan_loc_vai`: chọn lọc vai `Người đếm`, mọi dòng đang hiện có cột Vai trò là `Người đếm`.
- `tai_khoan_them_hien_pin`: bấm `Thêm`, điền tên `Người đếm PC`, Lưu. Hộp thoại hiện 6 chữ số, khớp `sql("select pin from kk.tai_khoan where ten = 'Người đếm PC'")`. Đóng hộp thoại thì bảng không còn chuỗi đó.
- `tai_khoan_tu_khoa_bao_loi`: bấm dòng `TK01`, bỏ chọn `Đang hoạt động`, Lưu. `#khungLoi` là `Không tự khoá hoặc đổi vai của chính mình`.
- `tai_khoan_dat_lai_pin`: bấm dòng `TK05`, `Đặt lại PIN`, xác nhận. PIN hiện ra khớp `kk.tai_khoan` và khác `555555`.
- `tai_khoan_xuat_khong_pin`: bấm `Xuất danh sách`, lưu file tải về, đọc bằng openpyxl. Dòng 1 là `Mã TK|Tên|Vai trò|Trạng thái|Ghi chú`. Không ô nào chứa PIN trong bảng.
- `xss_ten_tai_khoan`: `sql("update kk.tai_khoan set ghi_chu = '<img src=x onerror=\"window.__x=1\">' where tk = 'TK05'")`. Mở mục Tài khoản: bảng chứa nguyên chữ đó, `#bang img` đếm được 0, `window.__x` là `undefined`.
- `dien_thoai_khong_vo`: viewport `390x800`, đăng nhập, mở Tài khoản. `document.documentElement.scrollWidth <= 390`.
- Mọi ca kiểm thêm `!p.errors.length`.

- [ ] **Step 2: Chạy để thấy hỏng**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: mọi ca FAIL vì chưa có `quantri.html`.

- [ ] **Step 3: Viết `quantri.html`**

Thẻ `<head>` giống `index.html` (charset, viewport, `app.css?v=11`, `icon.svg`) và có tiêu đề `Quản trị kiểm kho`. Không có `manifest`. Phần thân có màn `#login` (`#pin`, `#btnLogin`, `#loginMsg`) và màn chính. Màn chính gồm thanh trên (`#dot`, nút `Đăng xuất`), `#menu` bên trái, `#bang` ở giữa, `#khung` bên phải và một `<dialog id="hop">`. Thẻ `<style>` nhỏ gồm bố cục ba cột bằng CSS grid, gộp thành một cột khi màn hẹp hơn 900 px, `#bang` có `overflow-x: auto` và luật ẩn `.ghi-dot`. Script nạp theo thứ tự: `config.js?v=11`, `chung.js?v=11`, `xuatexcel.js?v=11`, `quantri-pc.js?v=1`.

- [ ] **Step 4: Viết `quantri-pc.js` phần khung và mục Tài khoản**

Đăng nhập:
- Đọc PIN từ `sessionStorage` khi nạp trang.
- Gọi `login`. Lỗi thì hiện câu lỗi máy chủ.
- `role` khác `IT` thì hiện `Trang này chỉ dành cho IT`, xoá `kkqt_pin` và `S.pin`.
- Đăng nhập được thì lưu PIN và gọi `chonDot`. Đợt mặc định là đợt cuối trong `dots` có `st === 'MO'`. Không có đợt mở thì lấy đợt cuối. Không có đợt nào thì `S.dot = ''`.
- `Đăng xuất`: xoá `kkqt_pin` rồi `location.reload()`.

Mục Tài khoản:
- Bảng 5 cột lấy từ `dsTaiKhoan`. Có ô tìm (dùng `norm`), lọc vai (`QT_VAI` chép 4 vai) và lọc trạng thái.
- Khung sửa có các ô `Tên hiển thị`, `Vai trò`, `Ghi chú`, `Đang hoạt động`. Lưu gọi `luuTaiKhoan`, xong thì tải lại bảng và giữ dòng đang chọn.
- Thêm mới thì hiện `r.taiKhoan.pin` trong `hoi`.
- Nút `Đặt lại PIN` hỏi xác nhận, gọi `datLaiPin`, rồi hiện PIN trong `hoi`.
- `Xuất danh sách` gọi `taiFile(soTaiKhoan(list), 'TAI-KHOAN.xlsx')`.

- [ ] **Step 5: Biên dịch lại `app.css`**

Run: `npx tailwindcss@3.4.17 -c tailwind.config.js -i src/input.css -o app.css --minify`
Expected: lệnh chạy xong không lỗi. `git diff --stat app.css` chỉ thêm lớp, không mất lớp nào mà `index.html` dùng. Chạy lại `node tests/e2e/smoke.mjs` để chắc màn điện thoại không đổi.

- [ ] **Step 6: Chạy e2e của trang mới**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: `Tất cả PASS`.

- [ ] **Step 7: Commit**

```bash
git add quantri.html quantri-pc.js app.css tests/e2e/quantri-pc.mjs README.md
git commit -m "feat: trang quản trị máy tính, đăng nhập, chọn đợt và mục Tài khoản"
```

### Task 6: Mục Danh mục thuốc

**Files:**
- Modify: `quantri-pc.js`, `tests/e2e/quantri-pc.mjs`

**Interfaces:**
- Consumes: `veBang`, `moKhung`, `hoi`, `taiFile` (Task 5). `soDanhMuc`, `dungTieuDe`, `timDongViDu`, `DANH_MUC_MAU_HEADER`, `VIDU_DANH_MUC` (Task 3). `qtDocExcel` (Task 2).

- [ ] **Step 1: Thêm các ca e2e**

- `danh_muc_dem_dong`: số đếm là `<n> / <n>` với `n` là số dòng `kk.thuoc`.
- `danh_muc_tim_khong_dau`: `sql` thêm thuốc `PC-1` tên `Thuốc Đau Đầu`. Gõ `dau dau` thì bảng có `PC-1`.
- `danh_muc_sua_thuoc`: bấm dòng `PC-1`. Ô `Mã` chỉ đọc. Đổi `Tên thuốc` rồi Lưu. `kk.thuoc` có tên mới, dòng `PC-1` vẫn được chọn.
- `danh_muc_xuat_nhap_lai`: `sql` thêm thuốc `00045` có GTIN `{0893456789012}`. Xuất danh sách, nhập lại đúng file đó. Kết quả báo `Thêm 0` và `Lỗi 0`. `kk.thuoc` của `00045` còn GTIN `0893456789012`.
- `danh_muc_con_dong_vi_du`: tải file mẫu rồi nhập ngay. Trang báo lỗi có `Dòng 2`. Không có yêu cầu `nhapThuoc` nào được gửi: đếm bằng `page.on('request')` lọc thân có `"action":"nhapThuoc"`.
- `danh_muc_nham_file_so_sanh`: nhập file `so-sanh.xlsx` (dựng như trong `quantri.mjs`). Trang báo `File không đúng mẫu danh mục` và không gửi `nhapThuoc`.
- `danh_muc_5000_dong`: `sql` thêm 5.000 thuốc bằng `generate_series`, tải lại mục. Đo trong trang: đặt giá trị ô tìm, phát sự kiện `input` và đo thời gian tới khi số đếm đổi. Thời gian phải dưới 150 ms.
- `xss_ten_thuoc_pc`: thuốc tên `<img src=x onerror="window.__x=1">` hiện nguyên chữ trong bảng và trong ô `Tên thuốc` của khung sửa. `#bang img` đếm được 0.

- [ ] **Step 2: Chạy để thấy các ca mới hỏng**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: các ca `danh_muc_*` và `xss_ten_thuoc_pc` FAIL, các ca của Task 5 vẫn PASS.

- [ ] **Step 3: Viết mục Danh mục thuốc**

- Bảng lấy từ `danhMuc` (gửi `v: ''` để luôn nhận cả danh sách), 7 cột theo đặc tả mục 5.2, lọc theo kho mặc định.
- Ô tìm khớp `norm` của mã, tên và GTIN. Tính sẵn chuỗi `norm` của từng dòng một lần lúc tải, không tính lại mỗi lần gõ.
- Khung sửa có cùng các ô như `qtSuaThuoc`. `ĐVT nhỏ nhất` chọn từ `S.user.dvt`. `Kho mặc định` chọn từ `dsKho`. Lưu gọi `luuThuoc`.
- `Tải file mẫu` gọi `taiFile(soDanhMuc([VIDU_DANH_MUC]), 'DANH-MUC-MAU.xlsx')`.
- `Xuất danh sách hiện có` gọi `taiFile(soDanhMuc(list), 'DANH-MUC.xlsx')`.
- `Nhập từ Excel` dùng `<input type="file" accept=".xlsx,.xls">`, rồi đọc bằng `qtDocExcel(f)`. Trang kiểm theo thứ tự: `dungTieuDe(tieuDe, DANH_MUC_MAU_HEADER)` sai thì báo `File không đúng mẫu danh mục`. `timDongViDu(list, so, 0)` khác 0 thì báo `Dòng <n> là dòng ví dụ của file mẫu`. Qua cả hai thì gọi `nhapThuoc` với `timeout` 180000. Trang hiện `Thêm <a> · Sửa <b> · Lỗi <c>` và từng dòng lỗi theo số dòng trong file, rồi tải lại bảng.

- [ ] **Step 4: Chạy e2e**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: `Tất cả PASS`.

- [ ] **Step 5: Commit**

```bash
git add quantri-pc.js tests/e2e/quantri-pc.mjs
git commit -m "feat(quản trị pc): mục Danh mục thuốc với file mẫu, xuất và nhập Excel"
```

### Task 7: Mục Kho và hộc

**Files:**
- Modify: `quantri-pc.js`, `tests/e2e/quantri-pc.mjs`

**Interfaces:**
- Consumes: `veBang`, `moKhung`, `hoi`, `S.dotInfo`, lớp `ghi-dot` (Task 5). `dsKho` (Task 1).

- [ ] **Step 1: Thêm các ca e2e**

- `kho_hien_kho_an`: `sql("insert into kk.kho (ma, ten, ten_ngan, thu_tu, hoat_dong) values ('K9', 'Kho 9', 'K9', 7, false)")`. Bảng Kho có dòng `K9`. Bấm dòng đó, ô `Thứ tự` là `7`. Chọn `Đang dùng` rồi Lưu. `kk.kho` của `K9` có `hoat_dong = t` và `thu_tu = 7`.
- `kho_an_kho_dang_dung_bao_loi`: bấm dòng `CHAN`, bỏ `Đang dùng`, Lưu. `#khungLoi` chứa `đang dùng trong đợt Đợt thử`.
- `hoc_dan_nhieu_dong`: chọn kho `CHAN`, dán `"P 1\nP 2\n\n P 3 "` vào ô thêm hộc, Lưu. `kk.hoc` có `P 1`, `P 2`, `P 3` cho `DOT01`/`CHAN`.
- `hoc_xoa_chi_chua_nhan`: `sql` đặt `P 2` là `DANG_DEM`. Dòng `P 2` không có nút `Xoá`. Xoá `P 1` (xác nhận) thì `kk.hoc` không còn `P 1`.
- `hoc_dot_dong_an_nut`: chọn `DOT02` ở `#dot`. Nút `Thêm hộc` và mọi nút `Xoá` không hiện, còn bảng hộc vẫn hiện.
- `hoc_chua_co_dot`: `sql('delete from kk.dot_kho; delete from kk.hoc; delete from kk.dot')` rồi tải lại trang. Phần hộc và mục Số liệu so sánh hiện `Chưa có đợt kiểm`. Bảng Kho vẫn hiện. Mục Đợt kiểm vẫn có nút `Tạo đợt`. Ca này chạy cuối file vì nó xoá đợt.

- [ ] **Step 2: Chạy để thấy các ca mới hỏng**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: các ca `kho_*` và `hoc_*` FAIL.

- [ ] **Step 3: Viết mục Kho và hộc theo đặc tả mục 5.3**

- Bảng Kho lấy từ `dsKho`. Khung sửa gửi `luuKho` với `thuTu` là chữ số đang có trong ô và `hoatDong` là giá trị thật của ô chọn. Lưu xong gọi lại `chonDot(S.dot)`, để danh sách kho trong `S.user` cập nhật.
- Bảng Hộc lấy từ `dsHoc` theo kho đang chọn. Ô chọn kho chỉ gồm `S.dotInfo.kho`. Nhãn trạng thái chép từ `HOC_ST_TEN` của `app.js`.
- Ô thêm hộc: tách theo dòng, cắt khoảng trắng, bỏ dòng trống, rồi gửi `luuHoc` với `them`.
- `Xoá` chỉ có ở hộc `CHUA_NHAN`. Trang hỏi xác nhận, rồi gửi `luuHoc` với `xoa: [hoc]`.
- Nút `Thêm hộc` và nút `Xoá` có lớp `ghi-dot`.

- [ ] **Step 4: Chạy e2e**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: `Tất cả PASS`.

- [ ] **Step 5: Commit**

```bash
git add quantri-pc.js tests/e2e/quantri-pc.mjs
git commit -m "feat(quản trị pc): mục Kho và hộc, có kho đã ẩn"
```

### Task 8: Mục Số liệu so sánh

**Files:**
- Modify: `quantri-pc.js`, `tests/e2e/quantri-pc.mjs`

**Interfaces:**
- Consumes: `veBang`, `hoi`, `taiFile`, lớp `ghi-dot` (Task 5). `soSoSanh`, `dungTieuDe`, `timDongViDu`, `tachTheoKho`, `doiDongLoi`, `LAN1_HEADER`, `VIDU_SO_SANH` (Task 3). `dsSoSanh` và `nhapSoSanh` với `nhieuKho`, `chiKiem` (Task 1).

- [ ] **Step 1: Thêm các ca e2e**

Dựng thêm bằng openpyxl: `ss-hai-kho.xlsx` (2 dòng `CHAN`, trong đó một dòng có Số lô là chữ `'00123'`, và 1 dòng `LE`) và `ss-kho-sau-loi.xlsx` (1 dòng `CHAN` đúng, 1 dòng `LE` có HSD `31/02/2027` ở dòng 3).

- `so_sanh_nhap_hai_kho`: nhập `ss-hai-kho.xlsx`. Hộp xác nhận chứa `Kho CHAN: thay 0 dòng đang có bằng 2 dòng trong file` và `Kho LE: thay 0 dòng đang có bằng 1 dòng trong file`. Bấm `Nhập` thì `kk.so_sanh` của `DOT01` có 3 dòng, và bảng đếm `3 / 3`.
- `so_sanh_kho_sau_loi`: nhập `ss-kho-sau-loi.xlsx`. Trang hiện `Dòng 3: HSD không hợp lệ: 31/02/2027` và không có hộp xác nhận. Kho Chẵn trong `kk.so_sanh` giữ nguyên 2 dòng của ca trước.
- `so_sanh_xuat_nhap_lai`: chọn kho `Tất cả`, xuất danh sách, nhập lại file đó. Hộp xác nhận ghi `thay 2 dòng đang có bằng 2 dòng`. Bấm `Nhập` thì `kk.so_sanh` vẫn có lô `00123`, cùng HSD và SL như trước.
- `so_sanh_nham_file_danh_muc`: nhập file danh mục mẫu. Trang báo `File không đúng mẫu số liệu so sánh`. Không có yêu cầu nào có `"action":"nhapSoSanh"`.
- `so_sanh_con_dong_vi_du`: tải file mẫu rồi nhập ngay. Trang báo lỗi có `Dòng 2` và không gửi `nhapSoSanh`.
- `so_sanh_huy_xac_nhan`: nhập `ss-hai-kho.xlsx`, bấm `Huỷ` ở hộp xác nhận. Chỉ có một yêu cầu `nhapSoSanh`, và yêu cầu đó có `"chiKiem":true`.
- `so_sanh_mang_rot_khi_ghi`: `page.route('**/rpc/api', ...)` cho lỗi mạng (`route.abort()`) đúng với yêu cầu `nhapSoSanh` không có `chiKiem`, các yêu cầu khác đi tiếp. Nhập `ss-hai-kho.xlsx` và bấm `Nhập`. Trang hiện `Không rõ đã nhập xong chưa`. Sau đó có một yêu cầu `dsSoSanh` mới.
- `so_sanh_dot_dong_an_nut`: chọn `DOT02`. Nút `Nhập từ Excel` không hiện. Nút `Xuất danh sách hiện có` và `Tải file mẫu` vẫn hiện.

- [ ] **Step 2: Chạy để thấy các ca mới hỏng**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: các ca `so_sanh_*` FAIL.

- [ ] **Step 3: Viết mục Số liệu so sánh theo đặc tả mục 5.4**

- Ô chọn kho gồm `Tất cả` và `S.dotInfo.kho`. Bảng 9 cột lấy từ `dsSoSanh` (gửi `kho` khi đã chọn một kho). Ô tìm khớp mã, tên và số lô.
- `Tải file mẫu` gọi `taiFile(soSoSanh([VIDU_SO_SANH]), 'SO-SANH-MAU.xlsx')`.
- `Xuất danh sách hiện có` gọi `taiFile(soSoSanh(list), tenFileExcel(S.dotInfo.ten).replace('KIEM-KHO-', 'SO-SANH-'))`.
- `Nhập từ Excel` (lớp `ghi-dot`) đọc bằng `qtDocExcel(f, 4)`, rồi kiểm theo thứ tự:
  1. Tiêu đề phải khớp `LAN1_HEADER`. Sai thì báo `File không đúng mẫu số liệu so sánh`.
  2. Không được còn dòng ví dụ: `timDongViDu(list, so, 1)` phải là 0.
  3. Tách kho bằng `tachTheoKho(list, so, S.dotInfo.kho)`. Có `loi` thì hiện lỗi và dừng.
- Sau đó trang làm đúng 4 bước của đặc tả:
  1. Gọi `nhapSoSanh` với `chiKiem: true`.
  2. Có lỗi thì hiện `doiDongLoi(r.loi, nhieuKho)` và dừng.
  3. Không lỗi thì gọi `dsSoSanh` không lọc kho để đếm số dòng đang có của từng kho. Hộp xác nhận có mỗi kho một dòng `Kho <MÃ>: thay <a> dòng đang có bằng <b> dòng trong file`, cùng nút `Nhập` và `Huỷ`.
  4. Bấm `Nhập` thì gọi `nhapSoSanh` không có `chiKiem`. Lỗi có `isNet` thì hiện `Không rõ đã nhập xong chưa` rồi tải lại bảng. Máy chủ trả `loi` thì hiện như bước 2. Xong thì hiện số dòng đã ghi của từng kho và tải lại bảng.

- [ ] **Step 4: Chạy e2e**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: `Tất cả PASS`.

- [ ] **Step 5: Commit**

```bash
git add quantri-pc.js tests/e2e/quantri-pc.mjs
git commit -m "feat(quản trị pc): mục Số liệu so sánh, nhập cả file hoặc không nhập gì"
```

### Task 9: Mục Đợt kiểm

**Files:**
- Modify: `quantri-pc.js`, `tests/e2e/quantri-pc.mjs`

**Interfaces:**
- Consumes: `veBang`, `moKhung`, `hoi`, `chonDot`, lớp `ghi-dot` (Task 5). `xuatExcel(dotId)` của `xuatexcel.js`.

- [ ] **Step 1: Thêm các ca e2e (đặt trước ca `hoc_chua_co_dot`)**

- `dot_bang`: bảng có `DOT01` và `DOT02`, đủ 8 cột theo đặc tả mục 5.5.
- `dot_tao`: bấm `Tạo đợt`, điền `Đợt PC thử`, chọn kho `CHAN`, `So với đợt` là `DOT01`, chọn `Chép danh sách hộc`. Lưu thì `kk.dot` có đợt mới với `kho = {CHAN}` và `so_voi = 'DOT01'`.
- `kho_chot_mo`: trong bảng kho của đợt đang chọn, bấm `Chốt kho` ở `CHAN` và xác nhận. `kk.dot_kho` của `CHAN` là `DA_CHOT`. Bấm `Mở lại kho` thì trở về `DANG_KIEM`.
- `dot_dong_mo`: `Đóng đợt` ở `DOT01` (xác nhận) thì `kk.dot` là `DONG`, và nút `Chốt kho` biến mất khi đang chọn `DOT01`. `Mở lại đợt` thì trở về `MO`.
- `dot_mac_dinh_khi_khong_co_dot_mo`: `sql("update kk.dot set trang_thai = 'DONG'")`, tải lại trang. `#dot` có giá trị là mã đợt lớn nhất trong `kk.dot`.
- `dot_xuat_excel`: bấm `Xuất Excel đợt` ở `DOT01`. Tên file tải về là `KIEM-KHO-Đợt thử.xlsx`.

- [ ] **Step 2: Chạy để thấy các ca mới hỏng**

Run: `supabase db reset && node tests/e2e/quantri-pc.mjs`
Expected: các ca `dot_*` và `kho_chot_mo` FAIL.

- [ ] **Step 3: Viết mục Đợt kiểm theo đặc tả mục 5.5**

- Bảng lấy từ `dsDot`. Trạng thái `MO` hiện `Đang mở`, `DONG` hiện `Đã đóng`. Cột Kho nối các mã kho bằng dấu phẩy.
- Khung tạo đợt gửi `taoDot` với `{ ten, kho, soVoi, copyHoc }` và `timeout` 180000, như `taoDotForm`. Danh sách kho lấy từ `dsKho` (chỉ kho đang dùng).
- `Đóng đợt` và `Mở lại đợt` gửi `datTrangThaiDot` với `{ id, st }`, rồi gọi lại `chonDot(S.dot)`.
- Bảng kho của đợt đang chọn lấy từ `S.dotInfo.trangThai`. Nút `Chốt kho` và `Mở lại kho` có lớp `ghi-dot` và gửi `datTrangThaiKho` với `{ kho, trangThai }`.
- `Xuất Excel đợt` gọi `xuatExcel(id)`.

- [ ] **Step 4: Chạy mọi bài kiểm tra của nhánh**

Run:
```bash
supabase db reset && supabase test db
TZ=Asia/Ho_Chi_Minh node --test tests/excel-ngay.test.mjs tests/mauexcel.test.mjs
node --test tests/canxem.test.mjs tests/xuatexcel.test.mjs
supabase db reset && node tests/e2e/smoke.mjs
supabase db reset && node tests/e2e/quantri.mjs
supabase db reset && node tests/e2e/quantri-pc.mjs
supabase db reset
```
Expected: tất cả PASS.

- [ ] **Step 5: Commit**

```bash
git add quantri-pc.js tests/e2e/quantri-pc.mjs
git commit -m "feat(quản trị pc): mục Đợt kiểm, chốt kho và xuất Excel"
```

### Task 10: Đưa lên dự án thật

**Files:**
- Modify: `README.md` (thêm một đoạn về trang `quantri.html` vào mục 4)

Task này đụng tới dữ liệu thật, nên người làm dừng ở từng chỗ ghi "hỏi anh Sơn".

- [ ] **Step 1: Thêm vào mục 4 của `README.md` đoạn ngắn về trang `quantri.html`: ai dùng, mở ở địa chỉ nào, PIN chỉ nhớ đến khi đóng tab. Commit.**

- [ ] **Step 2: Hỏi anh Sơn trước khi áp migration lên dự án `sxdmoqtcybizinboumkt`. Anh đồng ý thì chạy:**

Run: `supabase db push`
Expected: chỉ áp `20261030000009_quan_tri_pc.sql`.

- [ ] **Step 3: Thử trên dự án thật bằng `curl` tới `/rest/v1/rpc/api`, dùng khoá publishable trong `config.js`**

- Gửi một PIN chắc chắn sai: trả `Sai mã PIN`.
- PIN của một tài khoản không phải IT (anh Sơn cung cấp lúc chạy, không ghi vào file nào) gọi `dsKho`: trả `ok: false`.
- PIN IT gọi `dsKho`: có đủ kho. Gọi `dsSoSanh`: `ok: true`.
- Gọi `dsSoSanh` để đếm số dòng của một kho. Gọi `nhapSoSanh` với `chiKiem: true` và kho đó có 1 dòng: trả `theoKho`. Gọi lại `dsSoSanh`: số dòng của kho đó không đổi.

Thử xong, nhờ anh Sơn chạy `delete from kk.pin_sai;` trong SQL Editor của Supabase.

- [ ] **Step 4: Hỏi anh Sơn trước khi gộp vào `main` và đẩy lên. Anh đồng ý thì đẩy.**

Sau khoảng 1 phút, mở `quantri.html` trên GitHub Pages và đăng nhập bằng tài khoản IT thật. Đăng nhập thêm bằng một tài khoản người đếm để thấy trang báo `Trang này chỉ dành cho IT`. Mở `index.html` trên một điện thoại và kiểm tra app đã lên bản `kk-4.1.6`.
