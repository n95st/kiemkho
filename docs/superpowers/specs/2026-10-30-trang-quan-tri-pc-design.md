# Trang quản trị cho máy tính — thiết kế

Ngày 30/10/2026. Anh Sơn duyệt hướng làm trong chat cùng ngày: một trang riêng cho máy tính, có 5 mục, mỗi mục có bảng để xem, thêm và sửa. Mục nào có nhập Excel thì có thêm 3 nút: tải file mẫu, xuất danh sách hiện có, nhập từ Excel. Các chi tiết anh chưa nói tới là lựa chọn của AI. Mục 9 liệt kê những lựa chọn đó để anh bác được từng điểm.

## 1. Vì sao làm

IT đang cấu hình bằng các hộp thoại nhỏ trong tab Quản lý trên điện thoại (`quantri.js`). Anh Sơn quản lý chủ yếu trên máy tính và gặp ba chỗ vướng:

- Không xem được toàn bộ danh sách đang có. Ví dụ: danh mục 1.038 thuốc chỉ hiện qua ô tìm trong hộp thoại; số liệu so sánh thì không xem được, chỉ nhập được.
- Các ô nhập Excel không có file mẫu, nên người nhập phải đoán thứ tự cột.
- Hộp thoại dạng điện thoại khó dùng trên màn rộng.

## 2. Mục tiêu, ngoài phạm vi, điều không được xảy ra

Mục tiêu:

- IT đăng nhập trang `quantri.html` trên máy tính bằng PIN và xem đầy đủ 5 mục: Tài khoản, Danh mục thuốc, Kho và hộc, Số liệu so sánh, Đợt kiểm.
- Mỗi mục có bảng đầy đủ, ô tìm, bộ lọc và tổng số dòng. IT thêm và sửa ngay trên trang.
- Mục Danh mục thuốc và Số liệu so sánh có đủ 3 nút Excel. File xuất ra nhập lại được ngay, không phải sửa cột.

Ngoài phạm vi:

- Không đổi app đếm trên điện thoại. Các màn Cấu hình trong tab Quản lý giữ nguyên, trừ một chỗ: nút nhập số liệu so sánh (`qtSoSanh`) được sửa lỗi nhập nhiều kho (mục 5.4 và mục 6). Anh Sơn duyệt sửa chỗ này trong chat ngày 30/10/2026.
- Cấu hình chung (HSD cảnh báo, lô mặc định, chữ nghi là số lô, đơn vị tính) vẫn sửa trên điện thoại, không đưa vào trang này.
- Không nhập tài khoản hàng loạt bằng Excel, vì máy chủ chưa có hàm nhập và hiện chỉ có 18 tài khoản.
- Không sửa hoặc xoá từng dòng số liệu so sánh trên web. Máy chủ chỉ thay cả bộ số liệu của một kho, nên muốn sửa thì sửa trong Excel rồi nhập lại.
- Không xoá thuốc khỏi danh mục, vì cả máy chủ lẫn điện thoại đều chưa có thao tác này.
- Không cần dùng tốt trên điện thoại. Trang chỉ cần không vỡ khi mở bằng điện thoại.

Điều không được xảy ra, dù trang vẫn chạy:

- App đếm trên điện thoại chạy khác đi, hoặc bị chậm hơn.
- Người không phải IT xem hoặc sửa được dữ liệu. Máy chủ đã chặn ở mọi hàm, trang chỉ cần không làm hở chỗ chặn đó.
- Lộ PIN của người khác trên màn hoặc trong file xuất.
- Nhập nhầm file làm hỏng dữ liệu. Ví dụ minh họa: IT chọn nhầm file danh mục ở mục Số liệu so sánh, làm mất toàn bộ số so sánh của kho.

## 3. Đăng nhập và chọn đợt

- Màn đầu là ô nhập PIN. Trang gọi `login` như app điện thoại.
- Nếu tài khoản không phải vai `IT`, trang báo "Trang này chỉ dành cho IT", xoá PIN khỏi bộ nhớ và quay về ô nhập PIN.
- PIN chỉ lưu trong `sessionStorage`, nên đóng tab là phải nhập lại. Máy tính văn phòng có thể dùng chung, nên không lưu lâu như điện thoại.
- Có nút Đăng xuất ở góc trên.
- Thanh trên cùng có ô chọn đợt, lấy từ danh sách `dots` mà `login` trả về. Mặc định chọn đợt đang mở có mã lớn nhất. Nếu không có đợt nào đang mở thì chọn đợt có mã lớn nhất. Mục Kho và hộc (phần hộc), Số liệu so sánh và Đợt kiểm (phần chốt kho) dùng đợt đang chọn.
- Khi đợt đang chọn đã đóng, máy chủ từ chối mọi thao tác ghi vào đợt đó. Vì vậy trang ẩn các nút Thêm hộc, Xoá hộc, Nhập từ Excel của số liệu so sánh, Chốt kho và Mở lại kho. IT vẫn xem và xuất được. Muốn sửa thì mở lại đợt ở mục Đợt kiểm.
- Khi chưa có đợt nào, phần hộc và mục Số liệu so sánh hiện "Chưa có đợt kiểm". Mục Đợt kiểm vẫn có nút Tạo đợt.
- Sai PIN được tính vào cơ chế khoá giống app điện thoại (bảng `kk.pin_sai`), không có cơ chế riêng.

## 4. Bố cục chung

- Màn rộng: menu 5 mục ở bên trái, bảng ở giữa.
- Bấm một dòng thì khung sửa mở bên phải và không che bảng. Khung có nút Lưu và Huỷ. Lưu xong, bảng tải lại và dòng vừa sửa vẫn được chọn.
- Nút "Thêm" nằm trên bảng và mở cùng khung đó, các ô để trống.
- Lỗi máy chủ hiện ngay trong khung sửa, giữ nguyên chữ máy chủ trả về.
- Bảng có ô tìm (lọc ngay khi gõ) và tổng số dòng đang hiện trên tổng số dòng có, ví dụ "120 / 1.038".
- Giao diện theo màu, chữ và nút của app hiện có (`app.css`, Tailwind). Màn không có câu hướng dẫn hay nhãn phụ, chỉ có nhãn cột, nhãn ô và nhãn nút.

## 5. Năm mục

### 5.1 Tài khoản

- Bảng gồm các cột Mã TK, Tên, Vai trò, Trạng thái (Đang dùng hoặc Đã khoá), Ghi chú. Có lọc theo vai trò và trạng thái. Nguồn dữ liệu là `dsTaiKhoan`.
- Bảng không có cột PIN. Hàm `dsTaiKhoan` có trả PIN nhưng trang không hiện ra.
- Khung sửa có các ô Tên hiển thị, Vai trò (4 vai như `QT_VAI`), Ghi chú, Đang hoạt động. Lưu gọi `luuTaiKhoan`.
- Nút Đặt lại PIN hỏi xác nhận, sau đó gọi `datLaiPin` và hiện PIN mới một lần trong hộp thoại.
- Khi thêm tài khoản mới, máy chủ tự cấp PIN và trang hiện PIN đó một lần.
- Không tự khoá hoặc đổi vai của chính mình: máy chủ đã chặn, trang chỉ hiện lỗi máy chủ trả về.
- Nút "Xuất danh sách" cho file Excel có các cột của bảng, không có PIN. Mục này không có file mẫu và không có nhập Excel.

### 5.2 Danh mục thuốc

- Bảng gồm 7 cột theo đúng thứ tự `danhMuc` trả về: Mã, Tên thuốc, ĐVT nhập, Quy cách, ĐVT nhỏ nhất, Kho mặc định, Mã vạch GTIN.
- Ô tìm khớp mã, tên hoặc GTIN, không phân biệt hoa thường và có dấu hay không dấu. Có lọc theo kho mặc định.
- Trong mọi file xuất và file mẫu, ô Mã và ô GTIN ghi kiểu chữ, để Excel không bỏ số 0 ở đầu.
- Bảng phải mượt với 1.038 dòng hiện có và vẫn dùng được khi danh mục lên khoảng 5.000 dòng.
- Khung sửa có cùng các ô như `qtSuaThuoc`. Ô Mã chỉ sửa được khi thêm mới. Lưu gọi `luuThuoc`.
- Ô ĐVT nhỏ nhất chọn từ danh sách đơn vị tính trong cấu hình chung (`dvt` của `login`). Ô Kho mặc định chọn từ danh sách kho.
- Ba nút Excel:
  - **Tải file mẫu:** dòng tiêu đề 7 cột và 1 dòng ví dụ minh họa. Dòng ví dụ có ô Mã là `VIDU` và chữ "VÍ DỤ" trong ô Tên thuốc. Khi nhập, trang báo lỗi nếu còn dòng có ô Mã là `VIDU`, để không lỡ thêm một thuốc giả vào danh mục. Trang nhận dòng ví dụ theo ô Mã, không theo ô Tên, vì tên thuốc thật có thể chứa chữ bất kỳ.
  - **Xuất danh sách hiện có:** toàn bộ danh mục, cùng 7 cột và cùng dòng tiêu đề với file mẫu.
  - **Nhập từ Excel:** trang so dòng tiêu đề của file với file mẫu trước. Lệch thì báo "File không đúng mẫu danh mục" và không gửi gì. Khớp thì gọi `nhapThuoc`. Máy chủ thêm mã chưa có và sửa mã đã có. Thuốc không có trong file thì giữ nguyên, không bị xoá. Ô GTIN để trống thì máy chủ giữ mã vạch cũ. Muốn xoá hết mã vạch của một thuốc thì sửa trong khung sửa, không làm qua Excel.
- Sau khi nhập, trang báo số dòng thêm, số dòng sửa và từng dòng lỗi theo đúng số dòng trong file Excel (cách làm của `qtDongLoi`).
- Nhập danh mục không theo luật "tất cả hoặc không gì cả". Máy chủ bỏ qua dòng sai và vẫn ghi các dòng đúng. Luật này giữ nguyên như hiện nay, vì nhập danh mục không xoá thuốc nào.
- Ngoài ô GTIN, ô trống trong file ghi đè giá trị đang có. Ví dụ minh họa: một thuốc đang có Kho mặc định là `CHAN`; nếu ô Kho mặc định của thuốc đó trong file để trống, nhập xong thuốc sẽ không còn kho mặc định. Luật này hợp với cách xuất file, sửa rồi nhập lại, vì file xuất đã có đủ giá trị đang có.

### 5.3 Kho và hộc

Mục này có hai phần trên cùng một màn: bảng Kho ở trên, bảng Hộc ở dưới.

**Kho:**

- Bảng gồm các cột Mã kho, Tên kho, Tên ngắn, Thứ tự, Đang dùng. Bảng có cả kho đã ẩn, để IT bật lại được.
- Hiện chưa có hàm đọc đủ danh sách kho. Hàm `login` chỉ trả kho đang dùng và không trả Thứ tự. Cần thêm hàm `dsKho` (mục 6).
- Khung sửa có các ô Mã (chỉ sửa khi thêm mới), Tên, Tên ngắn, Thứ tự, Đang dùng. Lưu gọi `luuKho` với giá trị thật của Thứ tự và Đang dùng.
- Máy chủ không cho ẩn kho đang nằm trong một đợt đang mở, nên trang chỉ hiện lỗi máy chủ trả về.

**Hộc** (theo đợt đang chọn):

- Có ô chọn kho, chỉ gồm các kho của đợt.
- Bảng gồm các cột Hộc, Trạng thái, Người đếm, Bắt đầu, Xong lúc, lấy từ `dsHoc`.
- Thêm hộc: ô nhập nhiều dòng, mỗi dòng một hộc. IT dán được nguyên một cột từ Excel. Lưu gọi `luuHoc` với `them`.
- Xoá hộc: chỉ hiện ở hộc có trạng thái Chưa ai nhận. Trang hỏi xác nhận rồi gọi `luuHoc` với `xoa`.
- Mục này không có Excel.

### 5.4 Số liệu so sánh (theo đợt đang chọn)

- Có ô chọn kho, gồm "Tất cả" và các kho của đợt.
- Bảng gồm 9 cột: Kho, Mã, Tên, Số lô, HSD, SL, ĐVT, Hộc, Người đếm. Ô tìm khớp mã, tên hoặc số lô.
- Cột Kho ở bảng, file mẫu và file xuất đều ghi mã kho, ví dụ `CHAN`, vì lúc nhập máy chủ so theo mã kho. Ô Số lô ghi kiểu chữ, ô HSD ghi kiểu ngày.
- Hiện chưa có hàm chỉ để xem số liệu so sánh. Cần thêm hàm `dsSoSanh` (mục 6).
- Ba nút Excel:
  - **Tải file mẫu:** 9 cột (`LAN1_HEADER` trong `xuatexcel.js`) và 1 dòng ví dụ minh họa. Dòng ví dụ có ô Mã là `VIDU` và chữ "VÍ DỤ" trong ô Tên. Khi nhập, trang báo lỗi nếu còn dòng có ô Mã là `VIDU`.
  - **Xuất danh sách hiện có:** số liệu của đợt theo kho đang chọn, cùng 9 cột.
  - **Nhập từ Excel:** trang so dòng tiêu đề với file mẫu trước, lệch thì báo "File không đúng mẫu số liệu so sánh" và không gửi gì. Trang tách dòng theo cột Kho như `qtSoSanh` hiện nay. Kho nào không thuộc đợt thì dừng và không nhập gì.
- Nhập là tất cả hoặc không gì cả, tính trên cả file. Hiện nay `nhapSoSanh` chỉ làm vậy trong từng kho, và `qtSoSanh` gọi riêng từng kho. Ví dụ minh họa: file có kho Chẵn đúng và kho Lẻ có một dòng sai HSD; cách làm hiện nay đã thay xong kho Chẵn rồi mới báo lỗi kho Lẻ.
- Để chặn hẳn lỗi trên, trang gửi cả file trong một lần gọi `nhapSoSanh` với `nhieuKho` (mục 6). Máy chủ chạy mỗi lần gọi trong một giao dịch, nên một dòng sai ở bất kỳ kho nào là không kho nào bị đổi. Nếu gọi riêng từng kho thì không chặn được, vì mạng có thể rớt hoặc người khác có thể đóng đợt giữa hai lần gọi. Trang làm theo 4 bước:
  1. Gọi `nhapSoSanh` với `nhieuKho` và `chiKiem: true`. Máy chủ kiểm mọi dòng của mọi kho và không ghi gì.
  2. Nếu có lỗi thì hiện mọi lỗi theo số dòng trong file và dừng.
  3. Nếu không có lỗi thì hỏi xác nhận và nói rõ hậu quả cho từng kho, ví dụ minh họa "Kho CHAN: thay 326 dòng đang có bằng 340 dòng trong file". Số dòng đang có lấy bằng `dsSoSanh` không lọc kho.
  4. IT đồng ý thì trang gọi `nhapSoSanh` với `nhieuKho` một lần nữa, lần này không có `chiKiem`. Nếu máy chủ vẫn trả lỗi thì không kho nào bị đổi, và trang hiện lỗi như bước 2.
- Máy chủ xoá toàn bộ số liệu cũ của kho rồi mới ghi số liệu mới, nên bước xác nhận là bắt buộc.
- Nếu mạng rớt khi đang chờ bước 4, trang không biết máy chủ đã ghi hay chưa. Khi đó trang báo "Không rõ đã nhập xong chưa" và tải lại bảng, để IT nhìn số dòng thật của từng kho. Do giao dịch, mỗi kho chỉ có thể còn toàn bộ số liệu cũ hoặc đã có toàn bộ số liệu mới, không có trường hợp ghi dở.

### 5.5 Đợt kiểm

- Bảng gồm các cột Mã đợt, Tên, Kho, Ngày tạo, So với đợt, Người tạo, Trạng thái, Ghi chú, lấy từ `dsDot`.
- Nút "Tạo đợt" mở khung có các ô Tên, Kho (chọn nhiều), So với đợt và Chép danh sách hộc. Khung tạo đợt gọi `taoDot` với cùng tham số như `taoDotForm` trong `app.js`.
- Mỗi đợt có nút Đóng đợt hoặc Mở lại đợt. Trang hỏi xác nhận rồi gọi `datTrangThaiDot`.
- Đợt đang chọn có thêm bảng nhỏ gồm từng kho của đợt và trạng thái Đang kiểm hoặc Đã chốt, kèm nút Chốt kho hoặc Mở lại kho. Nút này gọi `datTrangThaiKho` sau khi IT xác nhận.
- Nút "Xuất Excel đợt" dùng lại `xuatexcel.js`, nên ra cùng file như trên điện thoại.

## 6. Phía máy chủ

Các hàm thêm, sửa và nhập đều đã có và đã chặn người không phải IT, nên dùng lại nguyên. Cần thêm 2 hàm chỉ đọc, đặt trong một migration mới:

- `kk.a_dskho`: chỉ IT gọi được. Trả mọi kho, kể cả kho đã ẩn, gồm `ma`, `ten`, `tenNgan`, `thuTu`, `hoatDong`, xếp theo `thu_tu` rồi `ma`. Hàm này không cần đợt, nên thêm `dskho` vào danh sách `hub` trong `public.api`.
- `kk.a_dssosanh`: chỉ IT gọi được. Nhận `kho` (bỏ trống thì lấy mọi kho). Trả các dòng của đợt đang chọn theo đúng thứ tự 9 cột của `LAN1_HEADER`, giống phần `soSanh` trong `a_xuatdot`. Hàm chỉ đọc, nên xem được cả đợt đã đóng.

Sửa thêm 1 hàm có sẵn:

- `kk.a_nhapsosanh` nhận thêm `nhieuKho` và `chiKiem`.
  - `nhieuKho` là danh sách các kho, mỗi phần tử gồm `kho` và `list` (các dòng 8 cột như `list` hiện nay). Hàm kiểm từng kho bằng `kiem_kho` và kiểm từng dòng theo đúng luật hiện nay. Mỗi lỗi trả về có `kho` và `dong`, trong đó `dong` là số thứ tự của dòng trong `list` của kho đó, để trang đổi lại thành số dòng trong file.
  - Có một lỗi bất kỳ thì hàm trả `loi` và không xoá, không ghi gì ở mọi kho.
  - Không có lỗi thì hàm thay số liệu của từng kho trong cùng một lần gọi, và trả số dòng đã ghi của từng kho. Hàm khoá các kho theo thứ tự mã kho, để hai lần nhập cùng lúc không chờ nhau mãi.
  - Khi `chiKiem` là `true`, hàm chỉ kiểm, trả `loi` và số dòng hợp lệ của từng kho, không xoá và không ghi gì.
  - Khi không có `nhieuKho`, hàm nhận `kho` và `list` và chạy y như hiện nay. Cách gọi cũ được giữ, để điện thoại còn chạy bản cũ trong bộ nhớ đệm vẫn nhập được.

Sửa thêm phía app điện thoại:

- `qtSoSanh` trong `quantri.js` gửi cả file trong một lần gọi `nhapSoSanh` với `nhieuKho`, thay vì gọi riêng từng kho. Có một dòng sai thì không kho nào bị đổi, và màn kết quả hiện "Chưa nhập gì" kèm mọi dòng lỗi theo số dòng trong file.
- Trên điện thoại không thêm bước chỉ kiểm và không thêm bước xác nhận. Màn nhập chạy như hiện nay, chỉ khác là không còn ghi dở.
- Vì `quantri.js` đổi, phải tăng số phiên bản theo mục 7.

Không dùng `xuatDot` để xem số liệu so sánh. Hàm `xuatDot` ghi nhật ký "XUAT_DOT" mỗi lần gọi, nên mỗi lần mở bảng sẽ để lại một dòng "đã xuất đợt" sai sự thật.

## 7. Tổ chức code

- Thêm trang `quantri.html` và một file script riêng cho trang. Hai file này nằm cạnh `index.html`, dùng chung `config.js`, `app.css` và SheetJS (`vendor/sheetjs/`).
- Trang mới cần ba phần đang có: hàm gọi máy chủ (`api` trong `app.js`), các hàm đọc file Excel (trong `quantri.js`) và `xuatexcel.js`. Hai file `app.js` và `quantri.js` chạy lệnh gắn vào màn điện thoại ngay khi nạp, nên trang mới không nạp thẳng được.
- Không chép nguyên các khối code đó sang file mới. Tách phần dùng chung ra một file chung để cả hai trang cùng nạp. Sau khi tách, app điện thoại phải chạy như cũ và các bài kiểm tra hiện có phải đạt.
- Khi đổi file mà app điện thoại nạp, phải tăng số phiên bản trong `sw.js` (`VER`, danh sách `SHELL`) và tham số `?v=` trong `index.html`. Nếu không, điện thoại vẫn chạy bản cũ trong bộ nhớ đệm.

## 8. Kiểm thử và đưa lên

- Các hàm thuần (dựng file mẫu, dựng dòng xuất, kiểm dòng tiêu đề, tìm dòng ví dụ, tách dòng theo kho) có bài kiểm tra Node như `tests/xuatexcel.test.mjs`.
- Mỗi file mẫu và mỗi file xuất đều có bài kiểm tra "xuất xong đọc lại bằng đúng hàm đọc lúc nhập thì ra cùng dữ liệu". Riêng ô HSD và ô Số lô dạng chữ số phải giữ nguyên.
- Hai hàm mới, chế độ `nhieuKho` và chế độ `chiKiem` có bài kiểm tra pgTAP trong `supabase/tests/`. Phải có bài cho trường hợp kho đầu đúng, kho sau có một dòng sai: số liệu cũ của kho đầu phải còn nguyên. Các bài kiểm tra viết như các file `01` đến `09` đang có và chạy bằng `supabase db reset && supabase test db` trên máy (Docker đã có).
- Sau khi áp migration, các hàm còn được thử thêm trên dự án thật: tài khoản không phải IT bị từ chối, IT nhận đủ dữ liệu. Thử xong phải xoá các dòng sai PIN trong `kk.pin_sai`.
- Thử cả trang bằng trình duyệt với tài khoản IT thật, gồm cả đăng nhập bằng tài khoản người đếm để thấy trang từ chối.
- Áp migration lên dự án Supabase `sxdmoqtcybizinboumkt` trước khi đẩy trang. Đẩy lên `main` là cập nhật app thật, nên phải hỏi anh Sơn trước.
- Repo để công khai, nên không commit PIN, dữ liệu thật hay file Excel thật.

## 9. Lựa chọn của AI, anh soát khi đọc

1. PIN trên máy tính chỉ nhớ đến khi đóng tab. App điện thoại thì nhớ lâu.
2. Không hiện cột PIN trong bảng Tài khoản và không có PIN trong file xuất. IT vẫn xem PIN qua "In phiếu PIN" trên điện thoại hoặc đặt lại PIN.
3. Cấu hình chung để lại trên điện thoại, không đưa vào trang máy tính.
4. Số liệu so sánh chỉ xem, xuất và nhập lại cả kho, không sửa từng dòng trên web.
5. Thêm 2 hàm đọc ở máy chủ (`dsKho`, `dsSoSanh`) thay vì dùng lại `xuatDot`.
6. File mẫu có 1 dòng ví dụ, ô Mã là `VIDU`. Trang chặn nhập khi còn dòng có mã này.
7. Nhập số liệu so sánh là tất cả hoặc không gì cả trên cả file. Để làm được, hàm `nhapSoSanh` nhận cả file nhiều kho trong một lần gọi, và có thêm chế độ chỉ kiểm để báo lỗi trước khi hỏi xác nhận.
8. Đợt đã đóng thì ẩn các nút ghi. Không có đợt đang mở thì chọn đợt mới nhất.
9. Cột Kho trong số liệu so sánh ghi mã kho (`CHAN`), không ghi tên ngắn.
10. Không xoá được hết mã vạch của một thuốc qua Excel, giữ đúng luật máy chủ hiện nay. Muốn xoá thì sửa trong khung sửa.
11. Trên app điện thoại, bản sửa lỗi nhập nhiều kho chỉ đổi cách gửi, không thêm bước chỉ kiểm và bước xác nhận như trang máy tính.

## 10. Để người làm tự quyết

- Tên file script của trang, tên file chung và cách tách hàm `api` sao cho cả hai trang dùng được.
- Cách hiện bảng lớn: vẽ hết hay chia trang, miễn là gõ tìm vẫn mượt ở 5.000 dòng.
- Chi tiết bố cục và màu, miễn là bám kiểu của app hiện có.
- Cách áp migration lên dự án thật, ghi lại trong kế hoạch.
