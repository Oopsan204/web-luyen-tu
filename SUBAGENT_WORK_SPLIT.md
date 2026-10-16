# SUBAGENT WORK SPLIT

Mục tiêu: dùng các subagent đang idle để triển khai song song, nhưng KHÔNG cho nhiều agent sửa cùng file shared.

## Quy tắc merge
- Subagent KHÔNG sửa `js/app.js`, `index.html`, `styles.css` trừ `study-hub-core` nếu parent đã giao trực tiếp.
- Mỗi subagent tạo module/CSS riêng trong phạm vi của mình.
- Parent OMP là người duy nhất nối import, route/event vào `js/app.js` và load CSS vào `index.html`.
- Không xóa code/asset hiện có.
- Mỗi subagent phải chạy syntax check/test phần mình có thể kiểm tra trước khi báo done.
- Nếu provider/subagent quota lỗi: dừng retry, báo parent ngay.

## 1. study-hub-core — Rescue Monkey
Owner:
- js/games/rescue-monkey.js
- styles/games/rescue-monkey.css
- tests/rescue-monkey.test.mjs (nếu tách pure logic)

Yêu cầu:
- state machine quiz + typing
- đúng: Milo windup -> bomb fly -> explosion -> Yeti hit/knockback -> distance tăng
- sai: Yeti windup -> rock fly -> Milo hit -> distance giảm
- dùng asset trong assets/games/rescue-monkey
- export API rõ để parent mount/unmount, cleanup timers/listeners
- reduced-motion
- không iframe demo

## 2. bird-prep — Chim Chăm Chỉ
Owner:
- js/games/diligent-bird.js
- styles/games/diligent-bird.css
- tests/diligent-bird.test.mjs

Yêu cầu:
- flap_1/2/3 loop, glide, hit, victory
- gates A/B/C/D từ card thật
- input 1-4/click
- 3 hearts, combo, progress
- cleanup loop
- export mount/unmount/start interface

## 3. rice-shop-prep — Quán cơm tấm
Owner:
- js/games/rice-shop.js
- styles/games/rice-shop.css
- tests/rice-shop.test.mjs

Yêu cầu:
- tutorial
- prep/inventory/budget
- open day
- customer/order/patience
- vocab quiz/typing challenge
- plate assembly
- revenue/tip/rating
- dùng assets/games/rice-shop
- pure functions cho recipe accuracy, inventory, revenue

## 4. learning-games-prep — Dịch câu + Đặt câu
Owner:
- js/games/learning-games.js
- styles/games/learning-games.css
- tests/learning-games.test.mjs

Yêu cầu:
- Dịch câu Anh<->Việt chỉ khi có dữ liệu local
- normalized matching + acceptedTranslations
- progressive hint
- Đặt câu: sentence reorder ưu tiên; free text chỉ nếu có acceptedSentences/example
- dùng robot/stationery/UI assets
- export render/start/cleanup API

## 5. special-hub-prep — Special Game Hub
Owner:
- js/games/special-hub.js
- styles/games/special-hub.css

Yêu cầu:
- modal Đặc Biệt
- 6 cards: Mixed, Dịch câu, Đặt câu, Quán cơm tấm, Chim Chăm Chỉ, Giải cứu khỉ
- dùng assets/games/special-hub/thumbnails + badges
- keyboard Escape/focus/accessibility
- event callback `onSelect(gameId)` để parent route
- không chứa game logic

## 6. study-hub-audit — QA + tests
Owner:
- tests/special-games-audit.test.mjs
- SPECIAL_GAMES_QA.md

Yêu cầu:
- không sửa implementation trừ khi parent yêu cầu
- kiểm tra API contracts của các module
- test pure logic có thể test bằng Node
- lập browser smoke checklist cho từng game
- kiểm tra broken asset paths, duplicate listeners, cleanup contract

## Parent OMP
Parent chịu trách nhiệm:
1. merge/integrate modules vào app.js/index.html
2. giữ study hub hiện tại
3. chạy npm test full
4. npm start + HTTP 200
5. browser smoke từng game
6. sửa conflict/integration lỗi
