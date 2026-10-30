# Kiểm kho iSOFH – web app (nhiều đợt kiểm)

Trang web chạy trên điện thoại cho người đếm kho. Giao diện viết bằng JavaScript thuần, đặt trên GitHub Pages. Dữ liệu lưu trong cơ sở dữ liệu Postgres của Supabase.

Cách các phần nối với nhau:

- Trình duyệt gọi đúng một hàm máy chủ là `public.api`, qua địa chỉ `/rest/v1/rpc/api` của Supabase. Hàm này kiểm tra mã PIN, chọn đợt kiểm, rồi chuyển việc cho hàm `kk.a_<tên thao tác>`.
- Mọi bảng nằm trong schema `kk`. Schema này không mở ra ngoài, nên người ngoài không đọc được bảng trực tiếp.
- Một file Trung tâm (tài khoản, danh mục thuốc, danh sách đợt) và mỗi đợt kiểm có dữ liệu riêng, tất cả nằm trong cùng một cơ sở dữ liệu.
- Chỉ có một địa chỉ web cho mọi đợt: `https://<tên>.github.io/kiemkho/`.

Bản cũ dùng Google Sheets và Apps Script. Mã cũ còn lưu ở `legacy/Code.gs` để đối chiếu.

Repo này công khai. Không bao giờ đưa vào repo: link hoặc mã file Google, khóa `service_role`, mật khẩu cơ sở dữ liệu, dữ liệu thật.

## 1. Cài đặt một lần

Cần cài sẵn: [Supabase CLI](https://supabase.com/docs/guides/cli) và Docker (Docker chỉ cần để chạy thử ở máy local).

1. Vào https://supabase.com tạo dự án mới. Chọn vùng **Singapore**, gói **Free**. Ghi lại mã dự án (project ref), Project URL và mật khẩu cơ sở dữ liệu.
2. Ở thư mục gốc của repo, chạy `supabase link --project-ref <mã dự án>`. Lệnh sẽ hỏi mật khẩu cơ sở dữ liệu.
3. Chạy `supabase db push`. Lệnh áp 8 file trong `supabase/migrations/` lên dự án thật.
4. Mở trang quản trị Supabase, mục Advisors, tab Security. Kết quả đúng là không có cảnh báo về bảng hoặc hàm mở cho vai `anon`, ngoại trừ `public.api`.
5. Điền file `config.js`: `SUPABASE_URL` là Project URL, `SUPABASE_KEY` là khóa **publishable** (hoặc khóa `anon`). Khóa này công khai theo thiết kế, ai mở trang web cũng thấy. Tuyệt đối không dán khóa `service_role`.
6. Trên GitHub, vào Settings, Pages, chọn Branch `main` và thư mục `/ (root)`, bấm Save. Sau khoảng 1 phút web chạy ở `https://<tên>.github.io/kiemkho/`.

## 2. Chuyển dữ liệu từ Google Sheets (làm một lần)

Dùng script `tools/nhap_tu_google_sheet.py` (Python 3). Script chỉ đọc file đã tải về, không kết nối Google.

1. Mở file Google Sheet Trung tâm, chọn Tệp, Tải xuống, `.xlsx`. Làm tương tự với từng file đợt kiểm.
2. Chạy, mỗi đợt thêm một cặp `--dot MÃ=FILE`:

   ```bash
   python3 tools/nhap_tu_google_sheet.py --trung-tam trungtam.xlsx \
     --dot DOT01=dot1.xlsx --dot DOT02=dot2.xlsx > nhap.sql
   ```

3. Đọc các dòng cảnh báo script in ra màn hình (stderr). Cảnh báo cho biết dòng nào bị bỏ qua hoặc đổi dạng.
4. Áp vào cơ sở dữ liệu thật bằng chuỗi kết nối lấy ở trang quản trị Supabase (Connect, mục Session pooler hoặc Direct):

   ```bash
   psql "$DB_URL" -v ON_ERROR_STOP=1 -f nhap.sql
   ```

5. So sánh số liệu với Google Sheet: số tài khoản, số mã danh mục, số dòng `HIEU_LUC` của từng đợt.

Script từ chối chạy nếu bảng `kk.dong` hoặc `kk.tai_khoan` đã có dữ liệu, để không nhập chồng lên dữ liệu thật. Tùy chọn `--xoa-du-lieu-thu` chỉ dùng cho cơ sở dữ liệu local và phải đặt `KK_LOCAL=1`. Script vẫn từ chối nếu `kk.dong` có dòng.

Xóa file `nhap.sql` và các file `.xlsx` sau khi xong (chúng chứa PIN và dữ liệu thật; không commit).

## 3. Danh sách việc trước khi dùng thật (go-live)

Danh sách này gom các điều còn phải kiểm trên dự án Supabase thật. Bản local không kiểm được những điều này.

1. **Nguồn địa chỉ IP của người dùng.** Hàm `public.api` đọc IP từ header `cf-connecting-ip`; nếu không có thì lấy phần tử **ngoài cùng bên phải** của `x-forwarded-for` (các phần tử bên trái do máy khách tự điền nên không tin được). IP này dùng để chặn đoán PIN. Trên dự án thật, cần ghi một lần nội dung `request.headers` (ví dụ tạm thêm một dòng `raise notice` hoặc ghi vào bảng nhật ký, rồi gỡ) để xem header nào do biên Supabase đặt. Nếu khác, sửa `public.api` bằng migration mới.
2. **Collation `kk.tu_nhien`.** Sau `supabase db push`, kiểm tra collation ICU này đã được tạo (`select collname from pg_collation where collname = 'tu_nhien';`). Collation dùng để xếp hộc theo thứ tự tự nhiên (A2 trước A10).
3. **Chạy thử nhập dữ liệu với file tải thật.** Sau khi nhập, soát các cột HSD và cột thời gian, và đối chiếu số lượng (xem mục 2). Script chưa từng chạy trên file Google Sheet tải thật.
4. **Thử bằng tài khoản Tập.** Đăng nhập, đếm 3 dòng, hoàn tác 1 dòng. Kết quả phải giống bản cũ.
5. **Đo tốc độ.** Chạy ca `do_toc_do` của `tests/e2e/smoke.mjs` với Supabase thật. Mục tiêu: trung bình dưới 500 ms mỗi thao tác.
6. **Giữ bản Apps Script cũ 2 tuần** làm đường lui.
7. **Cách lui.** Nếu có sự cố, chạy `git revert` commit gộp nhánh vào `main`, rồi đẩy lại. GitHub Pages quay về bản cũ sau khoảng 1 phút.
8. **Mở thử trên điện thoại thật** (tài khoản Tập): chọn đợt, chọn hộc, chọn thuốc không còn chờ lâu.

Việc gộp nhánh vào `main` và đẩy lên GitHub chỉ làm khi người phụ trách đã đồng ý.

## 4. Trước mỗi ngày kiểm (IT)

- **Kiểm tra dự án còn chạy.** Gói miễn phí tự tạm dừng sau 7 ngày không có hoạt động. Dữ liệu vẫn giữ. Mở trang quản trị Supabase, nếu thấy dự án đang tạm dừng thì bấm Restore rồi chờ vài phút.
- **Khai danh sách hộc** (khuyên làm): app, tab Quản lý, Cấu hình, nút Hộc. Người đếm sẽ thấy mục “Chưa ai nhận” để không sót kệ. Không khai cũng được, hộc tự thêm khi có người chọn.
- **In hướng dẫn và phiếu PIN**: mở app bằng tài khoản IT, bấm ☰, chọn *In hướng dẫn + mã QR* hoặc *In phiếu PIN*.
- **Cho nhân viên tập**: dùng tài khoản vai trò `TAP` (Tập 1–3). Số liệu tập không được tính.
- **Hàng không có lô/HSD**: mặc định ghi `KHONGLO` và `31/12/2099`. Đổi ở Quản lý, Cấu hình, Cấu hình chung (`LO_MAC_DINH`, `HSD_MAC_DINH`) cho đúng giá trị iSOFH chấp nhận.
- **Cuối mỗi ngày kiểm**: bấm **Xuất Excel** (tab Quản lý) để có một bản lưu ngoài hệ thống. Chưa kiểm chứng gói miễn phí của Supabase có bản sao lưu tự động tải về được hay không, nên không dựa vào đó.

## 5. Nhiều đợt kiểm (IT)

- **Tạo đợt mới**: app, tab Quản lý, mục Đợt kiểm, *Tạo đợt mới*. Đặt tên, chọn kho, chọn đợt để so sánh (đợt trước, Lần 1 file cũ, hoặc không so sánh), tick *dùng lại danh sách hộc* nếu muốn.
- **Người đếm chọn đợt**: chỉ có 1 đợt đang mở thì tự vào. Nhiều đợt đang mở thì app hỏi chọn.
- **Đóng đợt** khi xong: không ai nhập thêm được, vẫn xem được. Cần thì *Mở lại*.
- **Danh mục dùng chung**: mã vạch học ở đợt này dùng được ở đợt sau. Thuốc mới do IT duyệt được thêm vào danh mục chung.
- Kho **đã chốt**: mỗi lần lưu là phiếu bổ sung, chờ IT duyệt.

## 6. Chốt và đổ iSOFH

1. Ở tab Quản lý bấm **Xuất Excel** của đợt, được file `.xlsx`.
2. Chạy `python3 gop_kiem_kho.py chot --kho CHAN --db file.xlsx --ra CHOT_CHAN.xlsx` (tương tự kho LE), sau đó `nhap` như cũ.

Chưa kiểm: bước này chưa chạy thử với file xuất từ bản Supabase. File xuất giữ cách đặt tên sheet và cột như bản cũ, nhưng số cột của sheet `TONG_HOP` phụ thuộc kho của đợt. Cần thử `gop_kiem_kho.py` với một file xuất thật trước ngày chốt đầu tiên.

## 7. Sửa và thêm tính năng

- **Sửa logic máy chủ**: tạo một file mới trong `supabase/migrations/` (tên dạng `YYYYMMDDHHMMSS_mo_ta.sql`), viết lại hàm bằng `create or replace function`, viết test trong `supabase/tests/`, chạy thử ở máy local, rồi `supabase db push`. Không sửa file migration cũ đã đẩy.
- **Thêm một thao tác mới**: thêm hàm `kk.a_<tên viết thường>(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb`. Cổng `public.api` tự đổi tên thao tác sang chữ thường rồi gọi hàm này, nên không cần sửa cổng. Chỉ sửa cổng nếu thao tác phải thuộc nhóm không cần chọn đợt (hub) hoặc nhóm ghi dữ liệu. Ở app gọi `api('<tên>')`.
- **Sửa giao diện**: sửa `app.js` hoặc `quantri.js`. Tăng số `?v=` trong `index.html` và trong danh sách `SHELL` của `sw.js`, tăng `VER` trong `sw.js` để điện thoại tải bản mới. Đẩy lên `main`, GitHub Pages cập nhật sau khoảng 1 phút.
- **Giao diện Tailwind CSS v3** đã biên dịch sẵn ra `app.css`. Muốn sửa màu hoặc kích thước:

  ```bash
  npm i -D tailwindcss@3.4.17
  npx tailwindcss -c tailwind.config.js -i src/input.css -o app.css --minify
  ```

Câu báo lỗi tiếng Việt do máy chủ trả về được `app.js` dò chữ (ví dụ `PIN|khoá` để đăng xuất, `đã đóng|chọn đợt|Không thấy đợt` để tải lại đợt). Sửa chữ trong câu lỗi phải kiểm lại các chỗ dò này.

## 8. Chạy kiểm thử

Chạy từ thư mục gốc của repo. Cần Docker, Supabase CLI, Node (đã cài `npm i`), Python 3.

```bash
supabase start
supabase db reset && supabase test db            # kiểm thử pgTAP trong supabase/tests/
bash tests/dong-thoi.sh                          # nhiều người ghi cùng lúc
node --test tests/canxem.test.mjs tests/xuatexcel.test.mjs
TZ=Asia/Ho_Chi_Minh node --test tests/excel-ngay.test.mjs
python3 tools/test_nhap_tu_google_sheet.py
node tests/e2e/smoke.mjs                         # cần Google Chrome
node tests/e2e/quantri.mjs                       # cần Google Chrome
```

Ghi chú:

- Với `node --test`, phải liệt kê tên file như trên. Dạng chỉ thư mục (`node --test tests/`) báo lỗi trên Node 26.
- Hai bài `tests/e2e/*.mjs` ghi vào cơ sở dữ liệu local. Chạy xong hãy chạy `supabase db reset` để trả về trạng thái sạch.
