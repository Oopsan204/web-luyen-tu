# Asset + Animation Integration

## Asset packs da co tren may
- assets/games/rescue-monkey/ (55 files)
- assets/games/rice-shop/ (68 files)
- assets/games/diligent-bird/ (20 files)
- assets/games/learning-games/ (18 files)
- assets/games/special-hub/ (15 files)

Tat ca la asset tu tao cho du an. Khong lay asset remote cua trang tham chieu.

## Uu tien 1 - Rescue Monkey
Dung PNG tach rieng trong:
- rescue-monkey/sprites/milo/
- rescue-monkey/sprites/yeti/
- rescue-monkey/fx/
- rescue-monkey/ui/

State -> sprite Milo:
- idle -> milo/idle.png
- ready -> milo/ready.png
- run -> milo/run.png
- monkeyWindup -> milo/bomb_windup.png
- bombFlying -> milo/throw.png + milo/bomb_flying.png
- monkeyHit -> milo/hit.png
- win -> milo/victory.png

State -> sprite Yeti:
- idle/question -> yeti/idle.png
- walking -> alternate walk_1.png / walk_2.png
- yetiWindup -> attack_windup.png
- rockFlying -> throw_rock.png + fx/rock_1.png or rock_2.png
- hit -> hit.png
- yetiKnockback -> knockback.png
- lose/defeated -> defeated.png

Correct animation:
question -> monkeyWindup -> bomb projectile left-to-right -> explosion_fire_1/2 -> yeti hit -> knockback -> distance increases -> next question.
Wrong animation:
question -> yetiWindup -> rock projectile right-to-left -> Milo hit -> distance decreases -> next question.

Use transform/opacity. Pause timer/input during attack sequence. Cleanup timers on exit. Honor prefers-reduced-motion.
The folder rescue-monkey/demo contains demo.css/demo.js only as reference; integrate cleanly into current game engine rather than iframe/copying demo wholesale.

## Uu tien 2 - Diligent Bird
Use bird/flap_1, flap_2, flap_3 for looping flight; glide for no-input, hit for wrong answer, victory for finish.
Use obstacles/gate_a..gate_d as answer gates and pipe assets as decoration/obstacle.
Animate primarily with transform translateY/translateX, not layout properties.

## Uu tien 3 - Rice Shop
Use characters, station, food, ui directories directly.
Customer patience bar should animate continuously.
Correct vocabulary answer: customer positive reaction + slight patience/tip bonus.
Wrong: neutral/sad reaction + patience penalty.
Food assembly items should visually enter plate/tray via small translate/scale animation.
Revenue coin reward should animate toward HUD.
Do not make images clickable without semantic buttons.

## Uu tien 4 - Translate / Sentence
Use learning-games/robot poses for idle, explain, success.
Use stationery/ui assets for panels and sentence tiles.
Success/wrong badges are feedback animations only; actual scoring remains in JS state.

## Uu tien 5 - Special Hub
Use special-hub/thumbnails/* for six special cards and special-hub/ui badges.
Do not use full sprite sheet as one screenshot; use the separated assets.

## Verification
After integration:
1. npm test must remain 100% pass.
2. npm start and HTTP 200.
3. Browser smoke Rescue quiz + typing.
4. Correct Rescue path visibly shows bomb flight, explosion, Yeti knockback.
5. Wrong Rescue path visibly shows rock flight, Milo hit.
6. Bird flap/hit states visible.
7. Rice Shop customer/reward/assembly animations visible.
8. No broken image URLs or console errors.
9. Mobile must not overflow.
10. Report exact verified PASS/FAIL; do not claim untested animation as pass.
