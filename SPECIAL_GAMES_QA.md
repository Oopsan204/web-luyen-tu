# QA Special Games — Audit, Smoke Checklist, Asset Matrix

Phạm vi: Rescue Monkey, Chim Chăm Chỉ, Quán Cơm Tấm, Phở Anh Hai, Dịch Câu, Đặt Câu, Special Hub.
Trạng thái tại thời điểm audit: `js/games/*.js` chưa tồn tại (sibling đang làm). Asset PNG đủ trên đĩa.
Audit source: `tests/special-games-audit.test.mjs`.

## 1. Cleanup Contract (bắt buộc cho cả 5 game)

Mỗi module export mount + unmount + start:

| Module | mount | unmount | start |
|---|---|---|---|
| rescue-monkey | mountRescueMonkey | unmountRescueMonkey | startRescueMonkey |
| diligent-bird | mountDiligentBird | unmountDiligentBird | startDiligentBird |
| rice-shop | mountRiceShop | unmountRiceShop | startRiceShop |
| pho-anh-hai | mountPhoAnhHai | unmountPhoAnhHai | startPhoAnhHai |
| learning-games | mountLearningGames | unmountLearningGames | startLearningGames |
| special-hub | mountSpecialHub | unmountSpecialHub | openSpecialHub |

`unmount` phải: `clearTimeout/clearInterval`, `cancelAnimationFrame`, `removeEventListener` (hoặc `AbortController.abort()`), dừng `speechSynthesis`, gỡ DOM do module tạo. Test phát hiện: pass nếu thấy một trong các dấu hiệu cleanup, warning nếu không.

## 2. Performance Acceptance

- 60fps khi animation chạy (flap loop, bomb fly, grill smoke): đo bằng DevTools FPS meter.
- Tổng PNG mỗi game dưới 5MB khi load lazy theo màn (không preload toàn bộ rice-shop khi chỉ mở bird).
- Thumbnails hub lớn (~240–340KB mỗi cái): dùng đúng kích thước hiển thị, thêm `loading="lazy"`, `width/height` cố định chống layout shift.
- Không leak: mở/đóng mỗi game 10 lần, heap không tăng liên tục, không còn `setInterval` chạy nền (kiểm tra qua Performance monitor).

## 3. Reduced Motion

- Mỗi CSS game có `@media (prefers-reduced-motion: reduce)` tắt animation loop (flap, bob, shake, translateX).
- Logic JS: nếu `matchMedia("(prefers-reduced-motion: reduce)").matches`, bỏ tween/projectile, chuyển cảnh tức thì nhưng vẫn giữ feedback đúng/sai bằng text.
- Test chỉ warning nếu thiếu; QA thủ công phải bật reduced motion trong OS/browser và chạy lại từng checklist.

## 4. Smoke Checklist

### 4.0 Special Hub

1. Mở modal Đặc Biệt, thấy đúng 6 card theo thứ tự: Mixed, Dịch câu, Đặt câu, Quán cơm tấm, Chim Chăm Chỉ, Giải cứu khỉ.
2. Mỗi card hiện thumbnail + badge đúng (`thumbnails/*.png`, `ui/badge_*.png`).
3. Click từng card gọi `onSelect(gameId)` đúng id.
4. Nhấn Escape đóng modal, focus trả về nút đã mở.
5. Tab/Shift+Tab đi hết 6 card, focus-visible rõ.

### 4.1 Rescue Monkey

1. Mở game: Milo idle (`sprites/milo/idle.png`) bên trái, Yeti idle (`sprites/yeti/idle.png`) bên phải, `ui/hud.png` + `ui/distance_bar.png` đầy đủ.
2. Trả lời đúng: Milo windup → bomb fly (`bomb_flying.png` + `fx/bomb_trail.png`) → explosion (`explosion_fire_1/2.png`) → Yeti hit/knockback → distance tăng.
3. Trả lời sai: Yeti windup → rock fly (`fx/rock_1/2.png`) → Milo hit → distance giảm.
4. Typing mode: panel `typing_panel.png`, gõ đúng/sai theo `answer_states.png`.
5. Kết thúc: victory/defeated (`milo/victory.png`, `yeti/defeated.png`), `warning_badge.png` hiện khi sắp thua.
6. Đóng game giữa animation: không còn timer/projectile chạy, không lỗi console.

### 4.2 Chim Chăm Chỉ

1. Bird flap loop `flap_1 → flap_2 → flap_3` mượt, glide khi chờ, hit khi va chạm, victory khi qua màn.
2. Gates A/B/C/D (`obstacles/gate_a..d.png`) sinh từ card thật, đáp án đúng mở gate.
3. Nhấn 1–4 và click chuột đều chọn được đáp án.
4. 3 hearts (`ui/heart.png`) mất dần khi sai, combo tăng XP, `score_badge.png` cập nhật điểm.
5. `coin.png`, `star.png`, pipes/clouds nền cuộn liên tục không giật.
6. Thoát giữa loop: rAF/interval dừng, không duplicate listener khi mở lại.

### 4.3 Quán Cơm Tấm

1. Tutorial modal (`ui/tutorial_modal.png`) hiện lần đầu, bấm qua được từng bước.
2. Prep: chọn nguyên liệu (`station/*`, `food/*`), budget (`budget_panel.png`) trừ đúng, inventory (`inventory_card.png`) cập nhật.
3. Open day (`open_day_button.png` → `start_selling_button.png`): khách xuất hiện (`characters/customer_*`), order bubble (`order_bubble*.png`), patience bar (`patience_bar.png`) giảm dần.
4. Vocab quiz (`quiz_modal.png`) đúng cho tip, sai khách buồn (`customer_sad_boy.png`, `reaction_sad.png`).
5. Plate assembly: ráp đúng công thức → `completed_plate.png`, revenue (`revenue_panel.png`) + rating (`rating_panel.png`) tăng.
6. Hết ngày: tổng doanh thu/coin khớp công thức `calculateRevenue`, không âm inventory.

### 4.4 Dịch Câu

1. Chỉ ra câu khi dữ liệu local có `acceptedTranslations`/`example`; thiếu dữ liệu thì empty state, không gọi API ngoài.
2. Normalized matching: viết hoa/thường, thừa khoảng trắng, dấu câu không tính sai.
3. Gợi ý tiến bộ: từng nấc mở thêm từ, không lộ đáp án ngay.
4. Robot (`robot_reading/pointing/happy/tablet.png`) đổi trạng thái đúng/sai, badge (`success_badge/wrong_badge.png`) hiện.
5. Panel/nền (`translation_panel.png`, `notebook_open.png`, `word_tiles.png`) load đủ, không ảnh vỡ.

### 4.5 Đặt Câu

1. Ưu tiên sentence reorder (kéo/thả hoặc click tile `word_tiles.png`) khi có dữ liệu.
2. Free text chỉ bật khi card có `acceptedSentences`/`example`; chấm normalized như Dịch câu.
3. Thứ tự từ đúng → `success_badge.png` + sparkles; sai → `wrong_badge.png` + eraser gợi ý sửa.
4. Stationery (`pencil/notebook_closed/speech_hello_vi.png`) hiển thị đúng vai trò.
5. Thoát giữa chừng không mất tiến độ đã lưu của session.

### 4.6 Phở Anh Hai (wrapper bản gốc, từ 2026-10-19)

1. Module là wrapper iframe nhúng nguyên vẹn `standalone/pho-anh-hai/index.html` (không sửa file gốc); `mountPhoAnhHai`/`startPhoAnhHai`/`unmountPhoAnhHai` giữ nguyên hợp đồng API. Gỡ iframe là dọn sạch timer/rAF/listener/audio.
2. Tối đa 3 câu hỏi từ vựng/ngày dạng overlay: Q1 khi vào pha morning (đúng → giảm 20% giá chợ `s.market.p`), Q2 khi vào pha prep (đúng → buff `pot.ql` khi `cookStart`), Q3 khi khách đầu tiên vào (sự kiện `custIn`; đúng → `customer.max` +40%, uy tín +2).
3. Khách 2+ không có câu hỏi, không cộng đúng/sai vào thống kê. Không chồng câu hỏi lên modal của game (hoãn khi `#modal` đang mở). Không có dữ liệu từ vựng → bỏ qua hết.
4. Thoát game: `onFinish` báo `{correct, wrong, xp, coins}` để cộng XP/coin hồ sơ học tập.


## 5. Asset Matrix (đã kiểm trên đĩa)

### Special Hub — `assets/games/special-hub/`

| File | Kích thước | Vai trò |
|---|---|---|
| thumbnails/bird.png | 683x310, 263.6KB | Card Chim Chăm Chỉ |
| thumbnails/mixed.png | 685x330, 261.7KB | Card Mixed |
| thumbnails/rescue_monkey.png | 673x301, 337.4KB | Card Giải cứu khỉ |
| thumbnails/rice_shop.png | 680x310, 330.6KB | Card Quán cơm tấm |
| thumbnails/pho_anh_hai.png | 680x310, 67.6KB | Card Phở Anh Hai |
| thumbnails/sentence.png | 685x310, 260.6KB | Card Đặt câu |
| thumbnails/translate.png | 667x300, 239.9KB | Card Dịch câu |
| ui/badge_arcade.png | 265x120, 29.4KB | Badge arcade |
| ui/badge_default.png | 288x120, 27.6KB | Badge mặc định |
| ui/badge_new.png | 292x120, 22.5KB | Badge game mới |
| ui/badge_prototype.png | 273x130, 34.3KB | Badge prototype |
| ui/chevron.png | 220x210, 33.4KB | Chevron điều hướng |
| ui/gamepad_icon.png | 254x210, 37.6KB | Icon modal Đặc Biệt |

### Rescue Monkey — `assets/games/rescue-monkey/`

Milo: idle 395x411, run 510x370, throw 152.3KB, bomb_windup 346x438, bomb_flying 470x241, bomb_lit/unlit, hit 450x340, victory, ready, flag, scarf, banana_pouch. Yeti: idle 390x377, walk_1/2, attack_windup 360x397, throw_rock 540x340, hit, knockback 440x370, roar 420x398, defeated 492x346. FX: bomb_trail/rock_trail, explosion_fire_1/2, explosion_ice, ice_burst/cluster, snow_puff/smoke, pine_cluster, platform_short/long, stone_arch, torch, flags, rock_1/2. UI: quiz_panel 660x310, typing_panel 640x310, hud 1251x128, distance_bar 820x95, answer_states, warning_badge.

### Chim Chăm Chỉ — `assets/games/diligent-bird/`

| Nhóm | File |
|---|---|
| bird | flap_1 295x299, flap_2 300x300, flap_3 290x308, glide 310x270, hit 320x307, victory 282x320 |
| obstacles | gate_a 321x240, gate_b 330x250, gate_c 330x237, gate_d 336x249, pipe_short, pipe_tall, clouds 502x300 |
| ui | heart 223x237, coin 193x223, star 209x240, score_badge 289x210 |

### Quán Cơm Tấm — `assets/games/rice-shop/`

Characters (17): 4 khách + bac_tu + chef_thumbsup + server_plate + 3 order bubble + 3 reaction + patience_bar + rating_4star + coins. Station (14): grill 706x310, rice_pot, sauce_bottle, plates_m/l/single, drink_card, pork/chicken/pork_belly/fish/shrimp, serving_tray, completed_plate. Food (15): fried_egg, bi_heo, cha_trung, do_chua, cucumber, tomato, mo_hanh, nuoc_mam, peanuts, shredded_garnish, plate_pork/chicken, coin, sparkle, stars_5. UI (13): hud 1232x120, order_bubble, quiz_modal 630x360, budget/inventory/revenue/rating panels, categories, tabs, open_day/start_selling buttons, tutorial_modal, patience_bar.

### Learning Games — `assets/games/learning-games/`

Robot: reading 307x325, pointing 354x361, happy 420x385, tablet 396x380. Stationery: notebook_closed/open, pencil 230x270, eraser, sparkles_leaves. UI: translation_panel 862x180, sentence_panel 730x200, word_tiles 1077x157, success/wrong badges, speech_hello_vi 330x240.

## 6. Kết quả audit hiện tại

- `node --test tests/special-games-audit.test.mjs`: 13/13 pass, cả 5 module đã merge.
- Contract thật: rescue-monkey dùng arena API (`rmPlay/rmArenaHTML/rmClearTimers/calculateDistance`), mount/unmount/start vẫn chờ owner hoàn thiện; special-hub dùng modal API `openSpecialHub/closeSpecialHub/isSpecialHubOpen` + `onSelect(gameId)`; bird/rice-shop/learning-games đủ mount/unmount/start.
- Asset tham chiếu trong code khớp 100% file trên đĩa (rescue 17, bird 14, rice-shop 47, learning 15, hub 12 PNG).
- `prefers-reduced-motion` có trong cả 5 CSS game; rescue-monkey rút gọn animation trong `rmPlay`.
- Listener audit: bird 2 add/2 remove, rice-shop 2/2, learning 4/3, hub gỡ keydown khi close và trả focus (open 2 lần không close đăng ký trùng keydown — `handleKeyDown` idempotent nên không lỗi, parent chỉ gọi open một lần).
- Asset trên đĩa: đủ, không thiếu file manifest.
- Không sửa `js/` hay `styles/` — đúng owner (chỉ tạo 2 file sở hữu).
