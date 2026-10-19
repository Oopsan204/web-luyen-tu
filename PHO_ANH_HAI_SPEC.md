# Đặc tả game Phở Anh Hai

Ngày chốt: 2026-10-19. Tài liệu đặc tả dùng khi triển khai.

> **Bản sửa đổi kiến trúc (2026-10-19, theo yêu cầu "giữ nguyên bản gốc standalone"):**
> Module viết lại (4 pha chợ/ninh/phục vụ/tất toán) được THAY bằng **wrapper iframe**:
> `js/games/pho-anh-hai.js` nhúng nguyên vẹn `standalone/pho-anh-hai/index.html` qua iframe
> (file gốc không sửa). Wrapper lồng tối đa 3 câu hỏi từ vựng/ngày dạng overlay, dùng API
> công khai của game (`PAH.on`, `PAH.UI.state()`, `PAH.UI.render()`) để đặt câu hỏi đúng lúc
> và áp hiệu ứng THẬT vào game:
> - Q1 (pha morning): đúng → giảm 20% giá chợ (`s.market.p`)
> - Q2 (pha prep): đúng → tăng chất lượng mẻ nấu (`pot.ql`, áp khi sự kiện `cookStart`)
> - Q3 (khách đầu tiên, sự kiện `custIn`): đúng → kiên nhẫn +40% (`customer.max`), uy tín +2
> Các quy tắc UX (tối đa 3 câu/ngày, không chồng modal, khách 2+ không hỏi, bỏ qua khi
> không có dữ liệu từ vựng) giữ nguyên. Chi tiết triển khai trong code wrapper.

---

## 1. Cơ chế câu hỏi ôn tập — chốt tối đa 3 câu hỏi/ngày

┌───────────────────────────┬────────────────────────────────┬────────────────────────────────────────────────────┐
│ Vị trí                    │ Tần suất                       │ Cách hoạt động                                     │
├───────────────────────────┼────────────────────────────────┼────────────────────────────────────────────────────┤
│ Đi chợ                    │ 1 câu/ngày                     │ Đúng → giảm 20% giá nguyên liệu                    │
├───────────────────────────┼────────────────────────────────┼────────────────────────────────────────────────────┤
│ Ninh nước lèo             │ 1 câu/ngày                     │ Đúng → nước dùng 100%; sai → 55%                   │
├───────────────────────────┼────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phục vụ khách             │ Chỉ khách đầu tiên             │ Đúng → tăng kiên nhẫn, uy tín, tip                 │
├───────────────────────────┼────────────────────────────────┼────────────────────────────────────────────────────┤
│ Khách thứ 2–4             │ 0 câu                          │ Phục vụ trực tiếp, không bị phạt vì bỏ qua câu hỏi │
├───────────────────────────┼────────────────────────────────┼────────────────────────────────────────────────────┤
│ Bắt khách quỵt / manh mối │ Chỉ khi sự kiện thực sự xảy ra │ Không tự động bật thêm câu hỏi                     │
└───────────────────────────┴────────────────────────────────┴────────────────────────────────────────────────────┘

### Quy tắc UX

- Không bật câu hỏi cho cả 4 khách.
- Không chồng nhiều modal/câu hỏi cùng lúc.
- Khách không có câu hỏi vẫn có thanh kiên nhẫn và quy trình phục vụ bình thường.
- Khách không có câu hỏi không cộng đúng/sai vào thống kê từ vựng.
- Nếu bộ từ không có dữ liệu, bỏ qua toàn bộ câu hỏi và không làm gián đoạn gameplay.
- Tỷ trọng 70/20/10 được hiểu là tỷ trọng thiết kế trải nghiệm, không phải số lượng câu hỏi bắt buộc.

Như vậy một ngày chỉ có 3 lần ôn tập tối đa, đủ để củng cố từ nhưng không làm game biến thành chuỗi popup câu hỏi.

---

## 2. Kiến trúc tổng thể & ranh giới module

```
web-luyen-tu/
├── standalone/pho-anh-hai/index.html      # Bản gốc độc lập (chạy offline, tham chiếu gốc)
├── assets/games/special-hub/thumbnails/
│   └── pho_anh_hai.png                    # Thumbnail chuẩn tỉ lệ trong Special Hub
├── js/games/
│   ├── pho-anh-hai.js                     # Module mini-game tự chứa (Game loop + Vocab)
│   ├── special-hub.js                     # Danh mục đăng ký game trong Hub
│   └── index.js                           # Barrel export API thống nhất
├── styles/games/
│   ├── pho-anh-hai.css                    # Toàn bộ CSS giao diện pixel/retro
│   └── all.css                            # CSS bundle chính
└── tests/
    ├── pho-anh-hai.test.mjs               # 13 Unit tests độc lập (Node test runner)
    └── special-games-audit.test.mjs       # Kiểm tra hợp đồng API & Cleanup
```

### Hợp đồng API bắt buộc (Cleanup Contract)

Mỗi game đặc biệt trong repo phải tuân thủ chuẩn:

```js
export function mountPhoAnhHai(container, options = { cards: [], onFinish: () => {} }): void;
export function startPhoAnhHai(): void;
export function unmountPhoAnhHai(): boolean;
```

- Ràng buộc unmount: Phải hủy toàn bộ requestAnimationFrame, setInterval, setTimeout, đóng hoặc suspend AudioContext, kích hoạt AbortController.abort()
  cho toàn bộ DOM event listeners, và dọn sạch phần tử DOM trong container.

---

## 3. Thiết kế gameplay lồng ghép học từ vựng (Vocab-Driven Core Loop)

Game chia làm 4 pha lặp lại mỗi ngày (1 ngày = phục vụ 4 khách):

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│                     Pha 1: Đi Chợ                     │
│                                                       │
└───────────────────────────┬───────────────────────────┘
                            │
         Quiz từ vựng: giảm 20% giá nguyên liệu
                            │
                            ▼
┌───────────────────────────────────────────────────────┐
│                                                       │
│                 Pha 2: Ninh Nước Dùng                 │
│                                                       │
└───────────────────────────┬───────────────────────────┘
                            │
   Quiz nêm gia vị: quyết định chất lượng 100% hay 55%
                            │
                            ▼
┌───────────────────────────────────────────────────────┐
│                                                       │
│                 Pha 3: Phục Vụ 4 Khách                │
│                                                       │
└───────────────────────────┬───────────────────────────┘
                            │
  Order Anh ↔ Việt: Đúng +kiên nhẫn/tip, Sai -kiên nhẫn
                            │
                            ▼
┌───────────────────────────────────────────────────────┐
│                                                       │
│                  Pha 4: Tất Toán Ngày                 │
│                                                       │
└───────────────────────────┬───────────────────────────┘
                            │
       Quy đổi Lợi nhuận & Sao -> Coin + XP hồ sơ
                            │
                            ▼
 ◇───────────────────────────────────────────────────────◇
 │                                                       │
 │                   Tiếp tục ngày mới?                  │
 │                                                       │
 ◇───────────────────────────┬───────────────────────────◇
                             │
                           Thoát
                             │
                             ▼
 ┌───────────────────────────────────────────────────────┐
 │                                                       │
 │                   Trở về Special Hub                  │
 │                                                       │
 └───────────────────────────────────────────────────────┘
```

| Pha | Hành động của người chơi | Cơ chế tích hợp từ vựng | Tác động game |
|---|---|---|---|
| 1. Đi Chợ | Mua nguyên liệu: bánh phở, bò, gà, rau thơm, xương hầm, gia vị. Vốn đầu ngày: 160đ. | Voucher giảm giá: Trả lời đúng câu hỏi trắc nghiệm Anh ↔ Việt. | Giảm 20% toàn bộ giá chợ ngày đó; mua được nhiều hàng hơn với chi phí thấp hơn. |
| 2. Ninh Nước Lèo | Nấu nồi nước dùng (tiêu hao 1 xương + 1 gia vị). | Bí quyết gia truyền: Thử thách chọn nghĩa chuẩn của từ vựng ẩm thực/bộ thẻ. | - Đúng: Chất lượng nước dùng đạt 100% (bán tô giá cao + tip). - Sai: Đạt 55% (khách trả ít tiền hơn). |
| 3. Bán Phở (4 khách) | Khách vào ngồi bàn, thanh kiên nhẫn (patience = 1.0) tụt dần theo thời gian (0.028/s). | Nhận diện Order: Khách gọi món bằng câu đố từ vựng (thuật ngữ/nghĩa/ví dụ). | - Đúng: Trụng & chan phở tức thì, hồi +14% kiên nhẫn, thưởng tip, tăng điểm uy tín. - Sai: Mất -28% kiên nhẫn, mất tip. |
| 4. Tất Toán | Xem báo cáo tài chính: Doanh thu, Tiền tip, Chi phí chợ, Lợi nhuận ròng, Sao đánh giá (1–5 sao). | Thống kê số câu đúng/sai trong ngày. | Quy đổi trực tiếp sang XP và Coins cộng vào data.profile của người dùng. |

---

## 4. Giải pháp đồ họa & âm thanh tối ưu dung lượng

1. Pixel Art Canvas thuần (Procedural Rendering):
   - Vấn đề: Nếu cắt ảnh sprite sheet PNG cho tất cả nhân vật, xe phở, khói, tô phở sẽ làm repo phình to thêm 5–10MB.
   - Giải pháp: Sử dụng Canvas 2D render theo grid pixel (PAH.Spr tương tự bản gốc). Độ phân giải nội tại cố định 16:9, tự scale theo CSS aspect-ratio và
     image-rendering: pixelated, sắc nét trên cả màn hình Retina/4K.
2. WebAudio Procedural Synthesizer:
   - Không nạp bất kỳ file audio external nào (.mp3/.ogg).
   - Tự tạo BGM và sound effects (tiếng sôi sục lowpass filter, tiếng chan nước, tiếng keng tiền sine oscillator) bằng WebAudio API.
   - Chặn lỗi autoplay chính sách trình duyệt: Chỉ khởi tạo / resume AudioContext khi có thao tác click đầu tiên từ người dùng.

---

## 5. Ma trận kiểm thử & nghiệm thu (QA Acceptance Matrix)

| Hạng mục kiểm thử | Tiêu chí đạt chuẩn (Pass Criteria) | File phụ trách |
|---|---|---|
| Kinh tế & Kho | - Không cho phép mua âm tiền. - Trừ đúng nguyên liệu khi nấu. - Thuật toán giá chợ tiêm seed test được (75%–125%). | tests/pho-anh-hai.test.mjs |
| Kiên nhẫn & Phục vụ | - applyPatienceEvent clamp chuẩn trong [0, 1]. - Đúng trạng thái: happy (≥0.6), waiting (0.3–0.6), angry (<0.3). | tests/pho-anh-hai.test.mjs |
| Bộ thẻ từ vựng | - Sinh ngẫu nhiên câu hỏi 2 chiều (Thuật ngữ → Nghĩa hoặc Nghĩa → Thuật ngữ). - Luôn đủ 4 lựa chọn không trùng lặp. | tests/pho-anh-hai.test.mjs |
| Cleanup Contract | - Sau khi gọi unmountPhoAnhHai(), bộ nhớ timer = 0, rAF = 0, listeners = 0, AudioContext dừng, DOM container rỗng. | tests/pho-anh-hai.test.mjs |
| Toàn vẹn hệ thống | - Chạy npm test đạt 100% PASS cho toàn bộ 76 test của ứng dụng, không có xung đột giữa các game. | tests/*.test.mjs |

---

## 6. Phân công công việc giữa các subagent (Workstream Split)

Khi bắt đầu triển khai các tính năng nâng cao hoặc điều chỉnh:
- Subagent good (Kiến trúc & Thuật toán):
  - Xử lý logic máy trạng thái (State machine) của các pha chơi trong js/games/pho-anh-hai.js.
  - Thiết kế cầu nối quy đổi điểm từ vựng sang tài sản người dùng (profile.coins, profile.xp).
  - Viết các ca kiểm thử biên (edge cases) trong tests/pho-anh-hai.test.mjs.
- Subagent fast (Thao tác cơ học & Tài liệu/Build):
  - Tối ưu CSS, căn chỉnh media query cho mobile 390×844 và prefers-reduced-motion.
  - Cập nhật checklist trong SPECIAL_GAMES_QA.md và README.md.
  - Chạy npm test và kiểm tra tĩnh mã nguồn.

Kế hoạch này đảm bảo việc tích hợp giữ trọn vẹn nét độc đáo của game gốc Phở Anh Hai, đồng thời phục vụ 100% mục tiêu cốt lõi của ứng dụng là luyện tập từ vựng.
