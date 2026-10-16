# Yêu cầu triển khai màn Học từ vựng

## Mục tiêu
Nâng cấp dự án HTML/CSS/JavaScript thuần hiện tại để có màn trung tâm "Học từ vựng" bám sát bố cục của ảnh tham chiếu Luyentu.com, nhưng toàn bộ mã nguồn, icon, màu, tài sản và dữ liệu phải tự xây dựng. Không sao chép source/tài sản độc quyền.

## Phạm vi đã chốt
- Chỉ frontend HTML + CSS + JavaScript thuần.
- Không framework, không backend.
- Không đăng nhập/đăng ký/đồng bộ nhiều thiết bị.
- Không bảng xếp hạng nhiều người.
- Không AI tạo từ.
- Không tính năng Pro/paywall thật.
- Dữ liệu lưu local bằng IndexedDB.
- Giữ XP, coin, streak, mục tiêu ngày, lịch sử học và cửa hàng local nếu phù hợp.

## Bố cục tổng thể
Màn Học từ vựng là study hub, không phải một game riêng.
Desktop:
- Sidebar trái nền trắng, rộng khoảng 200-215px.
- Vùng nội dung nền xám/xanh rất nhạt.
- Thanh trên gọn, phía phải hiển thị streak và coin/profile local.
- Nội dung chính căn giữa, max-width khoảng 1050-1150px.
- Responsive mobile: sidebar chuyển thành bottom navigation hoặc menu thu gọn.

## Sidebar
Các mục:
1. Trang chủ
2. Bộ từ vựng
3. Từ vựng
4. Học từ vựng (active)
5. Cửa hàng local
Bỏ mục Xếp hạng online.
Phần tài khoản online ở cuối sidebar thay bằng profile local tối giản hoặc bỏ.
Có nút thu gọn sidebar trên desktop.

## Khối bộ lọc phía trên
Bốn card/select cùng hàng trên desktop, bo góc lớn:
1. Bộ từ vựng
   - Tất cả bộ từ
   - từng deck local hiện có
2. Bộ lọc trạng thái
   - Tất cả
   - Chưa học
   - Đang học
   - Chưa thuộc
   - Đã thuộc
   - Đến hạn ôn
3. Thứ tự
   - Ngẫu nhiên
   - A -> Z
   - Z -> A
   - Mới nhất
   - Cũ nhất
   - Ưu tiên từ khó
   - Ưu tiên SRS
4. Số lượng
   - 10, 20, 30, 50, Tất cả
Mọi filter phải tác động thật lên tập card dùng cho session.
Hiển thị số từ sẵn sàng sau lọc và cập nhật tức thời.

## Sáu chế độ học
Hiển thị một hàng card màu nổi bật, cùng kích thước, giống tinh thần ảnh tham chiếu. Tất cả dùng chung studySession được tạo từ filter hiện tại.

### 1. Flashcard
- Card tím.
- Hiện term, pronunciation, ví dụ; lật để xem meaning.
- Có phát âm bằng SpeechSynthesis khi hỗ trợ.
- Sau khi lật: Again / Hard / Good / Easy.
- Rating cập nhật SRS thật.
- Thưởng mặc định nhỏ hơn game, ví dụ +5 XP/coin theo logic hiện tại.

### 2. Trắc nghiệm
- Card cam.
- Một từ + 4 đáp án nghĩa.
- Chọn xong phải có feedback đúng/sai.
- Đáp án sai được ghi nhận để ưu tiên ôn.
- Có XP/coin/combo.

### 3. Nối từ với nghĩa
- Card xanh dương.
- Hai cột term và meaning xáo trộn.
- Click hoặc thao tác tương đương để ghép.
- Cặp đúng được khóa/disabled, không thể cộng điểm lặp.
- Cặp sai feedback nhẹ, không phá session.
- Kết thúc khi ghép hết.

### 4. Gõ từ vựng
- Card xanh lá.
- Hiện meaning, người dùng gõ term.
- Chuẩn hóa khoảng trắng/case hợp lý.
- Có gợi ý chữ cái đầu, số ký tự, bỏ qua.
- Chấm đúng/sai và cập nhật activity.

### 5. Nghe viết
- Card cyan.
- Dùng browser SpeechSynthesis, không gọi API ngoài.
- Nút Nghe / Nghe lại.
- Có tốc độ 0.7x và 1x nếu triển khai gọn được.
- Người dùng gõ lại term.
- Nếu SpeechSynthesis không hỗ trợ phải có fallback rõ ràng, không crash.

### 6. Đặc biệt / Luyện tổng hợp
- Card hồng.
- Trộn ngẫu nhiên các dạng: trắc nghiệm, gõ từ, nghe viết, nối từ, flashcard.
- Không viết engine trùng lặp nếu có thể; tái sử dụng logic game hiện có.
- Hiển thị badge "Đề xuất" hoặc tương tự, không cần HOT/Pro thật.

## Study session dùng chung
Tạo một nguồn sự thật duy nhất cho phiên học, ví dụ:
- mode
- selectedDeckId
- filters
- cards
- currentIndex
- total
- correct
- wrong
- combo
- xp
- coins
- startedAt
Khi người dùng chọn "TOEIC + Chưa thuộc + Ngẫu nhiên + 20 từ", mọi chế độ game phải dùng đúng tập từ đã lọc đó.

## Banner ôn tập ngắt quãng SRS
Giữ banner lớn gradient hồng/tím giống bố cục ảnh:
- Tiêu đề: Ôn tập ngắt quãng (SRS)
- Mô tả ngắn: hệ thống tự nhắc lại các từ sắp quên.
- Hiển thị số từ đến hạn.
- Nút "Bắt đầu ôn tập".
- Khi bấm, chỉ lấy card có dueAt <= thời điểm hiện tại.
- Dùng rating Again / Hard / Good / Easy và hàm calculateSrs hiện có.
- Sau mỗi rating phải persist ngay IndexedDB.

## Lịch sử học
Khối lớn phía dưới, thay "Lịch sử đấu" thành "Lịch sử học" nếu hợp UX.
Mỗi record lưu tối thiểu:
- mode
- deck/deckId
- total
- correct
- wrong
- accuracy
- xp
- coins
- duration
- timestamp
Khi chưa có dữ liệu: empty state rõ ràng.
Khi có dữ liệu: render các lượt gần nhất, có tên chế độ, deck, tỉ lệ đúng, XP/coin, thời gian tương đối.

## Gamification local
- XP cá nhân.
- Coin cá nhân.
- Streak.
- Combo trong game.
- Daily goal / mục tiêu lượt ôn.
- Không có leaderboard online.
- Không cần Pro.
- Nếu giữ cửa hàng thì chỉ là cửa hàng local bằng coin, không thanh toán thật.

## IndexedDB
Tận dụng schema hiện tại, không phá dữ liệu đã có.
Các domain cần có tương đương:
- decks
- cards
- activities
- gameHistory hoặc activity đủ thông tin để dựng history
- profile
- settings
Profile local có thể chứa:
- name local
- xp
- coins
- streak
- dailyGoal
Giữ các fix IndexedDB hiện tại: onversionchange, reset đa tab an toàn, không tự reseed sau khi người dùng cố ý xóa sạch deck/card.

## Giao diện và màu sắc
Bám sát tinh thần ảnh:
- nền nội dung rất sáng
- card filter viền đậm, bo khoảng 16px
- 6 game card màu tím / cam / xanh dương / xanh lá / cyan / hồng
- card có icon tự dựng bằng text/SVG/CSS, không dùng asset remote
- bóng nhẹ và hover rõ
- banner SRS gradient hồng -> tím
- history panel nền trắng/hồng rất nhạt với viền tím nhạt
- spacing thoáng, desktop ưu tiên 1440px+ nhưng co tốt ở laptop
- không dùng CDN, font/icon remote hoặc API ngoài

## Responsive
Desktop: 6 game card có thể nằm cùng hàng nếu đủ rộng.
Tablet: tự wrap 3x2.
Mobile: 1-2 cột, filter stack hoặc 2 cột, bottom nav.
Không được tràn ngang.

## An toàn và accessibility
- Escape dữ liệu người dùng khi render HTML.
- Không eval / new Function.
- Label đầy đủ cho select/input.
- Button dùng đúng semantic.
- Có focus-visible rõ.
- Hỗ trợ prefers-reduced-motion.
- Keyboard usable cho các thao tác chính.

## Tổ chức code
Ưu tiên tái sử dụng code hiện có.
Có thể giữ core.js/db.js/app.js và chỉ tách thêm module khi thực sự giúp rõ ràng.
Nếu tách, có thể dùng:
- study.js
- flashcard.js
- quiz.js
- matching.js
- typing.js
- listening.js
- mixed.js
- srs.js
Nhưng không refactor lớn chỉ để đẹp nếu làm tăng rủi ro.

## Trình tự triển khai
1. Đọc toàn bộ repo hiện tại trước khi sửa.
2. Giữ các chức năng đã pass và không regression.
3. Dựng study hub theo bố cục ảnh.
4. Nối 4 filter vào dữ liệu IndexedDB thật.
5. Nối 6 mode vào cùng filtered studySession.
6. Nối SRS banner.
7. Nối XP/coin/combo/streak và history.
8. Responsive + accessibility.
9. Test logic.
10. Chạy server và browser smoke test.

## Acceptance criteria bắt buộc
- npm test pass 100%.
- npm start chạy được.
- GET / trả HTTP 200.
- Study hub hiển thị đủ 4 filter.
- Study hub hiển thị đủ 6 mode: Flashcard, Trắc nghiệm, Nối từ với nghĩa, Gõ từ, Nghe viết, Luyện tổng hợp.
- Filter deck/status/order/limit làm thay đổi tập session thật.
- Flashcard rating cập nhật/persist SRS.
- Quiz hoạt động.
- Matching không cộng điểm lặp cho cặp đã đúng.
- Typing hoạt động.
- Listening không crash khi SpeechSynthesis thiếu.
- Mixed mode chạy ít nhất nhiều hơn một dạng bài.
- SRS chỉ lấy card đến hạn.
- Kết thúc game tạo history record và cập nhật XP/coin.
- Reload vẫn giữ dữ liệu IndexedDB.
- Reset IndexedDB đa tab và xóa sạch deck/card không reseed ngoài ý muốn vẫn phải giữ trạng thái pass.
- Desktop không tràn ngang; mobile usable.
- Không backend/API/CDN/AI/auth/leaderboard online.

## Cách làm việc
Không chỉ báo "đã code". Sau khi triển khai phải:
- chạy test
- chạy server
- mở bằng browser Orca
- kiểm tra Dashboard -> Học từ vựng -> từng mode chính
- kiểm tra console/runtime nếu có
- sửa lỗi phát hiện được
- báo rõ phần nào pass, phần nào chưa kiểm chứng
Không được gọi phần chưa chạy là pass.
