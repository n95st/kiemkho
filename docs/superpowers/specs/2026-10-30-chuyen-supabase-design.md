# Chuyển Kiểm kho iSOFH sang Supabase — thiết kế

Ngày 30/10/2026. Anh Sơn bỏ phần hỏi đáp, nên mọi lựa chọn dưới đây là đề xuất của AI, chưa được anh duyệt. Mỗi lựa chọn ghi rõ lý do để anh bác được từng điểm.

## 1. Vì sao làm

App kiểm kho hiện gọi Google Apps Script. Mỗi lần gọi mất khoảng 2,2 đến 2,5 giây, kể cả lần gọi không đọc dữ liệu gì (đo ngày 29/10/2026 bằng `curl` tới link `/exec`). Các thao tác phải chờ máy chủ gồm đăng nhập, chọn đợt, chọn hộc, chọn một thuốc để xem số đã đếm, màn Quản lý. Thao tác lưu số đếm không bắt người dùng chờ, vì app đã có hàng đợi gửi ngầm (`qRun` trong `app.js`).

Mục tiêu thứ hai: IT làm được các việc cấu hình ngay trên app, thay vì mở Google Sheet sửa tay hoặc chạy hàm trong trình soạn Apps Script.

## 2. Mục tiêu, ngoài phạm vi, điều không được xảy ra

Mục tiêu:

- Mỗi thao tác phải chờ máy chủ xong trong dưới 0,5 giây khi dùng 4G ở Việt Nam. Con số này là mục tiêu AI đặt, đo lại sau khi chuyển.
- Giữ nguyên mọi tính năng và luật đếm đang có: Cộng thêm, Đếm lại hộc, Dồn cả lô, Hoàn tác, Thuốc mới, Duyệt, Gộp lô, Chốt kho, Nhận hộc, Xong hộc, Cần xem, chế độ Tập.
- IT cấu hình trên app: tài khoản và PIN, danh mục thuốc (kể cả nhập từ file Excel), danh sách kho, danh sách hộc của đợt, cấu hình chung, số liệu so sánh, xuất file Excel của đợt.

Ngoài phạm vi đợt này:

- Không đổi bốn vai trò `DEM`, `TO_TRUONG`, `IT`, `TAP` và quyền của từng vai. Không làm màn phân quyền tùy chỉnh.
- Không đổi cách người đếm thao tác, để không phải hướng dẫn lại.
- Không thêm báo cáo mới, không đẩy thông báo tức thời giữa các máy.

Điều không được xảy ra, dù app vẫn chạy:

- Mất hoặc nhân đôi dòng đếm, kể cả khi mạng chập chờn và hàng đợi gửi lại.
- Lộ khóa có quyền ghi thẳng vào cơ sở dữ liệu. Khóa `service_role` và mật khẩu cơ sở dữ liệu không bao giờ nằm trong repo hay trình duyệt.
- File Excel xuất ra không chạy được với `gop_kiem_kho.py` (bước đổ số vào iSOFH).

## 3. Ràng buộc

- Supabase gói miễn phí: 500 MB mỗi dự án; dự án tự tạm dừng nếu 7 ngày không có hoạt động. Dữ liệu vẫn giữ, IT bấm khôi phục trong trang quản trị Supabase.
- Repo `n95st/kiemkho` để Public và GitHub Pages phát mọi file trong repo. Không đưa link hay mã file Google, khóa bí mật hay dữ liệu thật vào repo.
- App phải chạy trên điện thoại, mạng yếu, có hàng đợi ngoại tuyến như hiện nay.
- Giao diện tiếng Việt. Câu báo lỗi giữ nguyên chữ như `Code.gs`, vì `app.js` dò chữ trong câu lỗi (ví dụ dò `Sai mã PIN|đang bị khoá` để đăng xuất, dò `đã đóng|chọn đợt|Không thấy đợt` để tải lại đợt).

## 4. Cách làm (AI quyết)

**Máy chủ: hàm SQL trong Supabase Postgres.** Toàn bộ logic của `Code.gs` viết lại thành hàm PL/pgSQL (ngôn ngữ viết hàm chạy ngay trong cơ sở dữ liệu Postgres). App gọi một cổng duy nhất `public.api(req jsonb)`, giống `doPost` hiện nay. Cổng này kiểm PIN, chọn đợt rồi chuyển tới hàm của từng thao tác. Bảng dữ liệu nằm trong schema riêng `kk`, không mở ra ngoài, nên trình duyệt chỉ chạm được vào cổng `api`.

Lý do chọn cách này:

- Nhanh nhất: mỗi thao tác là một lượt gọi tới máy chủ Supabase ở Singapore, hàm chạy ngay cạnh dữ liệu.
- An toàn dữ liệu: mỗi thao tác chạy trong một giao dịch. Lỗi giữa chừng thì mọi thay đổi của thao tác đó bị hủy, không để lại dòng ghi dở như Apps Script.
- Nhẹ: không có máy chủ riêng để thuê, cập nhật hay theo dõi.

Phương án đã cân nhắc và bỏ:

- Edge Function viết TypeScript: chép lại logic JS dễ hơn, nhưng mỗi lần gọi có thêm một chặng mạng và đôi khi phải khởi động, chậm hơn hàm SQL.
- Máy chủ Node riêng: phải thuê và trông máy chủ, không đáng với 10 đến 15 người dùng.

**Giao diện: giữ app hiện có.** App JavaScript thuần trên GitHub Pages đang chạy được, có quét mã vạch, đọc chữ trên ảnh và hàng đợi ngoại tuyến. Viết lại bằng React hay framework khác không làm app nhanh hơn, chỉ tốn công. Chỉ đổi hàm `api()` để gọi Supabase, đọc danh sách kho và đơn vị tính từ máy chủ thay vì viết cứng, và thêm file `quantri.js` chứa các màn cấu hình cho IT.

**Đăng nhập: giữ PIN như hiện nay.** App gửi PIN kèm mọi yêu cầu. PIN lưu dạng chữ thường trong bảng để IT xem và báo lại cho nhân viên.

- Lợi ích: không đổi thói quen, IT xem lại được PIN.
- Hạn chế: ai đọc được cơ sở dữ liệu sẽ thấy PIN. Chỉ IT có tài khoản Supabase mới đọc được.
- Rủi ro: dò PIN. Cổng `api` khóa một địa chỉ IP 10 phút sau 20 lần nhập sai PIN. Ngoài ra có một giới hạn chung: khi tổng số lần nhập sai trong 10 phút của mọi địa chỉ đạt 60, cổng khóa tất cả mọi người 10 phút. Giới hạn chung này chặn kẻ đổi liên tục địa chỉ IP để dò PIN. Cái giá là một người cố tình nhập sai nhiều lần từ nhiều địa chỉ vẫn có thể làm cả đội bị khóa 10 phút. Cái giá này đã được chấp nhận, vì khóa tự hết sau 10 phút và dữ liệu không bị mất.

**Dữ liệu: một cơ sở dữ liệu chung.** Mỗi đợt kiểm là một dòng trong bảng `dot`, không còn là một file Google Sheet riêng. Dữ liệu tập (vai `TAP`) nằm chung bảng, đánh dấu bằng cột `tap`. Mã dòng vẫn đánh số riêng trong từng đợt (`D00001`, `M001`), nên app không phải đổi gì.

**Phần Cần xem chuyển sang trình duyệt.** Phần dò lô gần giống nhau, HSD khác nhau và lệch số so sánh là logic JavaScript dài trong `Code.gs`. Máy chủ chỉ trả dữ liệu thô, trình duyệt chạy lại đúng đoạn JS đó. Màn này chỉ IT và tổ trưởng dùng.

**Xuất Excel trên trình duyệt.** App tạo file `.xlsx` bằng thư viện SheetJS, giữ đúng tên sheet và tên cột như file đợt hiện nay (`DONG`, `TONG_HOP`, `TONG_HOP_LO`, `HOC`, `THUOC_MOI`, `LAN1`, `DANH_MUC`), để `gop_kiem_kho.py` chạy được mà không phải sửa.

**Chuyển dữ liệu một lần.** IT tải file Trung tâm và từng file đợt về dạng `.xlsx`. Một script Python đọc các file đó và nạp vào Supabase: tài khoản, danh mục, đợt, số liệu so sánh, dòng đếm, hộc, thuốc mới.

**Chuyển đổi an toàn.** Làm trên nhánh `supabase`, thử ở máy local rồi thử trên Supabase thật bằng tài khoản Tập. Khi gộp vào `main`, GitHub Pages tự cập nhật. Bản Apps Script vẫn chạy song song 2 tuần. Có sự cố thì hoàn lại commit gộp là app quay về Apps Script.

## 5. Màn cấu hình cho IT (AI đề xuất danh sách)

| Việc hiện phải làm tay | Từ nay làm trên app |
|---|---|
| Sửa tab `NGUOI_DEM` để thêm người, đổi vai, khóa tài khoản | Màn Tài khoản: thêm, sửa tên và vai, khóa hoặc mở, tạo PIN mới ngẫu nhiên 6 số |
| Sửa tab `DANH_MUC`, rồi chạy hàm `dongBoDanhMuc` | Màn Danh mục: tìm, thêm, sửa thuốc; nhập cả danh mục từ file Excel. Không cần đồng bộ nữa vì chỉ còn một bảng |
| Kho chẵn, kho lẻ viết cứng trong code | Màn Kho: thêm kho, đổi tên, ẩn kho |
| Gõ danh sách hộc vào tab `HOC` của file đợt | Màn Hộc: dán nhiều hộc một lần, xóa hộc chưa ai nhận |
| Sửa tab `CAU_HINH` | Màn Cấu hình chung: lô và HSD mặc định cho hàng không có lô, số ngày cảnh báo HSD (đang là 90), danh sách đơn vị tính, các chữ làm số lô bị nghi (đang là `MFG MFD NSX EXP HSD LOT BATCH`) |
| Mã file kiểm kho cũ viết cứng trong `Code.gs` | Màn Số liệu so sánh: nhập từ file Excel, hoặc lấy từ một đợt trước như hiện nay |
| Tải file Google Sheet về dạng Excel | Nút Xuất Excel của đợt |

Khi cần sửa dữ liệu khẩn mà app chưa có màn, IT dùng Table Editor của Supabase. Màn này trông giống bảng tính.

## 6. Cách sửa và thêm tính năng về sau

- Sửa logic máy chủ: tạo một file migration mới trong `supabase/migrations/`, viết lại hàm bằng `create or replace function`, viết test, chạy thử ở máy local, rồi đẩy lên Supabase thật bằng `supabase db push`.
- Thêm một thao tác mới: thêm hàm `kk.a_<tên>`, thêm một dòng vào phần chuyển tiếp của `public.api`, rồi gọi `api('<tên>')` ở app.
- Sửa giao diện: sửa `app.js` hoặc `quantri.js`, tăng số phiên bản để điện thoại tải bản mới, rồi đẩy lên `main`. GitHub Pages cập nhật sau khoảng 1 phút.
- Hướng dẫn chi tiết nằm trong `README.md` sau khi làm xong.

## 7. Việc anh cần chuẩn bị

- Tạo tài khoản Supabase và một dự án tên `kiemkho`, vùng Singapore. Gửi AI địa chỉ dự án và khóa publishable (hoặc anon). AI sẽ hướng dẫn lấy mã truy cập để đẩy cấu trúc bảng lên.
- Gửi file `gop_kiem_kho.py`, để AI kiểm file Excel xuất ra đúng định dạng script này đọc.
- Cho biết ngày kiểm kho gần nhất, để chốt thời điểm chuyển. Không chuyển trong vòng 3 ngày trước ngày kiểm.
- Khi tới bước chuyển dữ liệu: tải file Trung tâm và các file đợt về dạng `.xlsx`.

## 8. Phần để người làm tự quyết

Cách đặt tên biến trong SQL và JS, bố cục chi tiết của từng màn cấu hình (dùng lại hộp thoại `ask()` và các class giao diện đang có), cách tổ chức file test.
