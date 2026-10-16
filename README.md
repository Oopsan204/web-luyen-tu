# Luyện Từ — MVP

Ứng dụng luyện từ vựng offline-first chạy hoàn toàn trong trình duyệt, xây bằng HTML, CSS và JavaScript thuần.

## Tính năng

- Dashboard mục tiêu ngày, số từ đến hạn, streak, XP và coin.
- Quản lý bộ từ và từ vựng: thêm, sửa, xóa, tìm kiếm.
- Import/Export JSON hoặc CSV; hỗ trợ CSV có dấu phẩy, dấu nháy kép và xuống dòng.
- Study hub "Học từ vựng" gồm sidebar (Trang chủ, Bộ từ vựng, Từ vựng, Học từ vựng, Cửa hàng local) chuyển thành bottom navigation trên mobile.
- 4 bộ lọc dùng thật cho session: Bộ từ vựng, Trạng thái (tất cả, chưa học, đang học, chưa thuộc, đã thuộc, đến hạn ôn), Thứ tự (ngẫu nhiên, A→Z, Z→A, mới nhất, cũ nhất, ưu tiên từ khó, ưu tiên SRS), Số lượng (10/20/30/50/tất cả).
- 6 chế độ học dùng chung một session đã lọc: Flashcard, Trắc nghiệm, Nối từ với nghĩa, Gõ từ, Nghe viết, Luyện tổng hợp.
- Flashcard và banner ôn tập ngắt quãng dùng lịch SRS với 4 mức Quên, Khó, Tốt, Dễ; mỗi lần chấm được ghi ngay xuống IndexedDB.
- Lịch sử học ghi lại mode, deck, tổng số câu, đúng/sai, độ chính xác, XP/coin, thời lượng và thời điểm.
- Thống kê tiến độ, hoạt động gần đây và lộ trình theo cấp độ.
- XP, coin, streak, combo và mục tiêu ngày lưu local; cửa hàng chỉ tiêu coin local, không thanh toán thật.
- Dữ liệu lưu trong IndexedDB trên chính trình duyệt.

MVP không có backend, đăng nhập, đồng bộ đám mây, bảng xếp hạng nhiều người hay AI.

## Chạy ứng dụng

Yêu cầu Node.js 18 trở lên. Không cần cài dependency.

```bash
npm start
```

Mở `http://127.0.0.1:4173`. Nên chạy qua localhost thay vì mở trực tiếp `index.html` để ES modules và IndexedDB hoạt động ổn định.

## Điều hướng và Study Hub

- Sidebar desktop có nút thu gọn; mobile dùng bottom navigation với cùng các mục: Trang chủ, Bộ từ vựng, Từ vựng, Học từ vựng (active), Cửa hàng local.
- Màn Học từ vựng gồm 4 card lọc, 6 card chế độ học, banner ôn tập ngắt quãng và khối Lịch sử học (có empty state khi chưa có lượt học).
- Cả 6 chế độ chạy trên cùng một `studySession` tạo từ filter hiện tại, nên chọn "một bộ từ + chưa thuộc + ngẫu nhiên + 20 từ" thì mọi chế độ đều dùng đúng tập từ đó.
- Banner SRS chỉ lấy card đến hạn (`dueAt` trống hoặc `dueAt` <= hiện tại) và persist ngay sau mỗi lần chấm.

## Kiểm thử

```bash
npm test
```

Bộ test dùng `node:test`, kiểm tra thuật toán SRS, round-trip CSV, thống kê/streak và bộ lọc Study Hub `filterStudyCards`: lọc deck, 6 trạng thái, 7 kiểu thứ tự, giới hạn số lượng, random tất định và không sửa input.

## Import / Export

- **JSON:** chấp nhận object backup gồm `decks`, `cards`, `activities`, `profile`; hoặc mảng card. Export JSON tạo bản sao đầy đủ.
- **CSV:** các cột chuẩn là `term,meaning,example,pronunciation,deckId`. Cũng nhận header tiếng Việt `Từ vựng,Nghĩa,Ví dụ,Phiên âm`. Nếu `deckId` trống, card được đưa vào bộ đang mở hoặc một bộ import mới.
- Import JSON backup đầy đủ sẽ thay dữ liệu hiện tại sau bước xác nhận. Nên export backup trước.

## Cấu trúc

```text
index.html          Khung SPA và điều hướng
styles.css          Design system responsive
js/core.js          SRS, CSV và thống kê thuần
js/db.js            IndexedDB, seed và thao tác dữ liệu
js/app.js           Render UI, route và tương tác
server.mjs          Static server dùng Node built-in
tests/core.test.mjs Kiểm thử nghiệp vụ
```

## Dữ liệu và quyền riêng tư

Không có dữ liệu nào được gửi ra mạng. Xóa dữ liệu bằng nút **Khôi phục dữ liệu mẫu** ở cuối màn Thống kê, hoặc xóa site data trong DevTools → Application → Storage. IndexedDB gắn với origin, vì vậy đổi host/port có thể tạo vùng dữ liệu khác.

Ghi chú IndexedDB: tab đang mở tự đóng kết nối khi có tab khác nâng version (không còn cảnh báo blocked), reset nhiều tab chạy an toàn, và khi người dùng xóa hết deck/card thì ứng dụng không tự seed lại dữ liệu mẫu.

Khuyến nghị Chrome/Edge/Firefox/Safari bản mới. Chế độ Nghe viết cần Web Speech Synthesis; ứng dụng sẽ thông báo nếu trình duyệt không hỗ trợ.
# web-luyen-tu
