# Kiểm kho iSOFH – web app (nhiều đợt kiểm)

Trang web chạy trên điện thoại cho người đếm kho. Dữ liệu lưu trong Google Sheets qua Apps Script:

- **File TRUNG TÂM** (1 file, dùng mãi): tài khoản + PIN (`NGUOI_DEM`), danh mục gốc + mã vạch đã học (`DANH_MUC`), danh sách đợt (`DOT`).
- **Mỗi đợt kiểm = 1 file riêng** (`DONG`, `HOC`, `TONG_HOP`, `LAN1`…), tạo bằng nút **Tạo đợt mới** trong app.
- Chỉ có **1 link API** và **1 link web** cho mọi đợt.

## Link nhanh

- Script của tôi: https://script.google.com/home/my · Quyền đã cấp: https://myaccount.google.com/connections
- Bật Pages: `https://github.com/<tên>/kiemkho/settings/pages` → web: `https://<tên>.github.io/kiemkho/`
- Link file Trung tâm / file từng đợt: **không ghi ở đây** (repo công khai). IT mở trong app → *Quản lý → Đợt kiểm* (nút *Mở file*, *Mở file Trung tâm*) hoặc tab `DOT`.

## 1. Cài phần lưu dữ liệu (Google Sheets + Apps Script) – 1 lần

1. Mở file Google Sheets **KIỂM KHO LẦN 2 – iSOFH (web app)** (file này sẽ thành file Trung tâm) → **Tiện ích mở rộng → Apps Script**.
2. Xoá nội dung có sẵn, dán toàn bộ file `Code.gs` → bấm 💾 Lưu.
3. Chọn hàm **caiDat** ở thanh trên → **Chạy** → cấp quyền (Nâng cao → Đi tới… → Cho phép; có thêm quyền Google Drive để tạo file đợt).
   Xong: file được đổi tên **KIỂM KHO – TRUNG TÂM (iSOFH)**, có các tab DOT, NGUOI_DEM (có PIN), DANH_MUC…
   và **tự tạo đợt đầu "Kiểm kho lần 2"** (file riêng cùng thư mục, đã nạp số liệu lần 1 để so sánh). Link file đợt nằm ở tab `DOT`.
4. **Triển khai → Tuỳ chọn triển khai mới → Ứng dụng web**
   - Thực thi dưới dạng: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
   → Triển khai → copy **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).
   Nhật ký thực thi của `caiDat` in sẵn link file Trung tâm và file đợt đầu.

> Sửa `Code.gs` sau này: **Triển khai → Quản lý triển khai → ✏️ → Phiên bản: Phiên bản mới → Triển khai** (giữ nguyên link).

## 2. Đưa trang web lên GitHub Pages – 1 lần

1. https://github.com/new → tên `kiemkho` → Public → Create.
2. **Add file → Upload files** → kéo **toàn bộ nội dung thư mục này** (cả thư mục `vendor`) → Commit.
3. Mở file `config.js` trên GitHub → ✏️ → dán link Apps Script vào `API_URL: '…'` → Commit.
4. **Settings → Pages → Branch: main / (root) → Save**. Sau ~1 phút có link `https://<tên>.github.io/kiemkho/`.

## Nhiều đợt kiểm (IT)

- **Tạo đợt mới**: app → tab **Quản lý** → mục **Đợt kiểm** → *Tạo đợt mới*: đặt tên, chọn kho, chọn **so sánh với** đợt nào
  (đợt trước / Lần 1 file cũ / không so sánh), tick *dùng lại danh sách hộc*. Máy tạo file mới cùng thư mục với file Trung tâm (~20–40 giây).
- **Người đếm chọn đợt**: chỉ 1 đợt đang mở → tự vào. Nhiều đợt đang mở → app hỏi chọn. Tên đợt hiện ở dòng nhỏ dưới nút Kho (bấm vào để đổi).
- **Đóng đợt** khi xong: không ai nhập thêm được, vẫn xem được; file giữ nguyên. Cần thì *Mở lại*.
- **Danh mục dùng chung**: mã vạch học ở đợt này dùng được ở đợt sau; thuốc mới IT duyệt được thêm vào DANH_MUC Trung tâm và chép sang các đợt đang mở.
  Nếu tự sửa tay DANH_MUC ở file Trung tâm → chạy hàm `dongBoDanhMuc` để chép sang các đợt đang mở.
- **Chốt + đổ iSOFH**: tải **file của đợt** (không phải file Trung tâm) về .xlsx rồi chạy `gop_kiem_kho.py` như cũ.

## 3. Dùng

- Gửi link (hoặc mã QR) cho người đếm → mở bằng Chrome/Safari → *Thêm vào màn hình chính*.
- Đăng nhập bằng **PIN** trong tab `NGUOI_DEM` của file Trung tâm (sửa tên, vai trò DEM / TO_TRUONG / IT, bỏ tick Hoạt động để khoá).
- Chọn **Kho** và **Hộc** → tìm thuốc hoặc 📷 quét → chọn lô → nhập số → Lưu.

## Trước ngày kiểm (IT)

- **Khai danh sách hộc** (khuyên làm): tab `HOC` của **file đợt** → mỗi dòng `Kho` (CHAN/LE) · `Hộc` · `CHUA_NHAN`. Người đếm sẽ thấy mục *“Chưa ai nhận”* để không sót kệ. Không khai cũng được – hộc tự thêm khi có người chọn.
- **In hướng dẫn + phiếu PIN**: mở app bằng tài khoản IT → ☰ → *In hướng dẫn + mã QR* / *In phiếu PIN* (trang `huong-dan.html`, 1 tờ A4).
- **Cho nhân viên tập**: dùng tài khoản vai trò `TAP` (Tập 1–3). Dữ liệu tập ghi vào sheet `TAP` của file đợt, không tính. Xoá dữ liệu tập (mọi đợt): chạy hàm `xoaDuLieuTap` trong Apps Script.
- **Hàng không có lô/HSD**: mặc định ghi `KHONGLO` · `31/12/2099` – đổi ở tab `CAU_HINH` của file Trung tâm (`LO_MAC_DINH`, `HSD_MAC_DINH`) cho đúng giá trị iSOFH chấp nhận.

## Nguyên tắc dữ liệu

- Không xoá dữ liệu: mỗi lần lưu là 1 dòng trong tab `DONG`. Tổng = các dòng **HIEU_LUC**.
- ➕ Cộng thêm · 🔁 Đếm lại hộc (thay đúng hộc đó) · 📦 Dồn cả lô (tổ trưởng/IT) · ↩ Hoàn tác (khôi phục số cũ).
- Kho **đã chốt** → mỗi lần lưu là phiếu bổ sung **chờ IT duyệt**.
- Chốt + đổ iSOFH: tải **file của đợt** (.xlsx) → `python3 gop_kiem_kho.py chot --kho CHAN --db file.xlsx --ra CHOT_CHAN.xlsx` (tương tự LE) → `nhap` như cũ.

## Sửa giao diện (Tailwind CSS)

Giao diện dùng **Tailwind CSS v3** (phong cách shadcn/ui), đã biên dịch sẵn ra `app.css`. Muốn sửa màu/kích thước:

```bash
npm i -D tailwindcss@3.4.17
npx tailwindcss -c tailwind.config.js -i src/input.css -o app.css --minify
```
(`src/input.css` và `tailwind.config.js` nằm trong thư mục này; đường dẫn `content` trong config trỏ tới `index.html`, `app.js`.)
