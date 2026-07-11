# Weez Poker — ТЗ для Claude: следующий product-grade pass

Дата: 2026-07-08  
Статус: рабочее ТЗ для разработки, аудита и точечных доработок.  
Главная цель: довести Weez Poker до состояния, в котором механика, деньги, UI, админка, аналитика и операционные процессы не выглядят как MVP-заглушки и не создают риск потери денег/стеков/доверия.

---

## 0. Входные источники, которые Claude обязан прочитать перед кодом

### Локальные источники истины

1. `MASTER_SPEC.md` — главный продуктовый контракт.
2. `DATABASE.md` — текущая модель PostgreSQL/Redis, ledger, snapshots, analytics.
3. `PAYMENTS.md` — депозиты, Stars, crypto rails, withdrawal policy.
4. `docs/ECONOMICS.md` — стейки, рейк, WCR, комиссии, турниры.
5. `docs/BONUS_WITHDRAWAL.md` — бонусные деньги и выводимость.
6. `docs/FAIRNESS.md` — provably fair / commit-reveal.
7. `docs/13-decisions.md` — утверждённые решения, особенно cash/play/tournament separation.
8. `docs/TECH_ROADMAP.md` — что уже считалось критичным.
9. `docs/BACKEND_GAMEPLAY_CHECKUP.md` — что уже реализовано и не надо переписывать без доказанной регрессии.
10. `docs/DESIGN_SYSTEM.md` — дизайн-регламент Telegram-native UI.
11. `public/telegram-ui-kit-overrides.css` — фактический актуальный UI override layer.
12. `public/index.html`, `public/app.js`, `public/styles.css` — текущая vanilla frontend-реализация.

### Внешние источники правил покера

Использовать как ориентиры, а не как повод переписать всё:

1. Poker TDA 2024 Rules — базовый стандарт турнирных процедур и recommended procedures:  
   https://www.pokertda.com/poker-tda-rules/
2. PokerStars poker rules — table stakes / all-in rule / common онлайн-рум baseline:  
   https://www.pokerstars.com/poker/games/rules/
3. Robert’s Rules of Poker — side pots, odd chips, showdown/common cardroom conventions:  
   https://www.pagat.com/docs/RobsPkrRulesHome.pdf
4. CardPlayer general poker rules — showdown / pot-winning baseline:  
   https://www.cardplayer.com/rules-of-poker

Если правила конфликтуют с уже утверждённым `MASTER_SPEC.md`, сначала фиксировать конфликт в отчёте и не менять код молча.

---

## 1. Что НЕ надо делать заново

Не тратить время на переписывание уже закрытого, если тесты проходят и код соответствует спецификации:

1. Daily claim 35 000 play chips / 24h.
2. Базовый NL Hold’em core: blinds, HU button/SB, side pots, all-in runout, showdown, uncalled bet return, no flop no drop.
3. Redis single-writer locks / state revision / SSE replay, если текущие тесты зелёные.
4. Atomic wallet + ledger + table snapshot, если текущий путь реально транзакционный.
5. MTT/SNG MVP: registration/cancel, scheduler, seating, blind clock, payout.
6. Cash/play bucket separation.
7. Basic admin dashboard/API.
8. Backend event contract, если событие уже есть и проходит тесты.

Работать не “переписать проект”, а “проверить расхождения → исправить конкретные gaps → добавить тест”.

---

## 2. Блок A — Gameplay standards audit и фиксы механики

### Цель

Проверить и довести cash/rating/tournament механику до стандартов онлайн-покера. Не добавлять optional features без решения.

### A1. Cash / Rating session lifecycle

Утверждённая политика:

1. Если игрок закрыл Telegram/бота, но ещё не его ход — визуально ничего не происходит.
2. Когда ход доходит до отсутствующего игрока:
   - action timer = 20 секунд;
   - если check legal → auto-check;
   - иначе → auto-fold.
3. После auto-action игрок уходит в sit-out на 300 секунд.
4. Sit-out cash/rating игрок:
   - не получает новые hole cards;
   - не постит SB/BB/ante;
   - не участвует в новых руках;
   - может вернуться через sit-in до истечения 300 секунд.
5. Если за 300 секунд не вернулся:
   - место освобождается;
   - стек возвращается в wallet через ledger/table mutation;
   - если private table стал пустым — стол закрывается;
   - если public table стал пустым — стол остаётся в lobby как пустой системный стол.
6. Если за столом 0 активных игроков — сессия считается законченной.

Что проверить:

- `server/poker-engine.js`
- `server/index.js::tickActiveTables`
- `settleExpiredTableSessions`
- `publicTable`
- `active_table_snapshots`
- Redis snapshot recovery
- profile active sessions

Acceptance criteria:

- Игрок не остаётся “активной сессией” через сутки после закрытия приложения.
- Cash/rating stack не зависает в table stack после auto-release.
- Sit-out игрок не ставит blinds.
- Public table после auto-release остаётся доступным.
- Private empty table удаляется.
- Тесты покрывают:
  - manual sit-out → 300 sec → auto-release;
  - disconnect on action → auto-fold/check → sit-out → auto-release;
  - tournament disconnect не освобождает место.

### A2. Tournament disconnect policy

Турнирная политика отличается:

1. Турнирное место не освобождается при disconnect.
2. Игрок продолжает blind/ante out.
3. При bust — получает стандартный result.
4. Reconnect возвращает игрока на его текущий tournament table или показывает busted/result screen.

Acceptance criteria:

- Турнирный игрок после disconnect не получает auto-release.
- Blinds/ante продолжают списываться из tournament stack.
- Если стек дошёл до 0 — seat_busted + tournament result.
- UI не предлагает cash rebuy/top-up в турнире.

### A3. Table stakes и buy-in/top-up

Стандарт: PokerStars table stakes означает, что во время руки можно использовать только фишки/деньги, которые были на столе в начале руки.

Требования:

1. Mid-hand top-up/rebuy запрещены.
2. Top-up доступен только между руками.
3. Stack after top-up <= maxBuyIn.
4. Cash stack отображается в `$`, без chips/micros.
5. Rating stack отображается в play chips.
6. Tournament stack отображается в tournament chips, не cash/play wallet.

Acceptance criteria:

- Нет endpoint/UI пути, который докидывает стек во время активной руки.
- Top-up не превышает maxBuyIn.
- Cash stack не конвертируется через старую модель `1 USDT = 5000 chips`.

### A4. Side pots / odd chips / uncalled bet

Проверить по Robert’s Rules:

1. Main pot и side pots считаются отдельно.
2. Uncalled excess возвращается игроку и не рейкуется.
3. Odd chip отдаётся первому eligible winner слева от button по часовой.
4. Каждый side pot имеет свой eligible players set.
5. All-in short call не ломает min-raise logic.

Acceptance criteria:

- Тесты:
  - 3-way all-in with side pot;
  - uncalled all-in excess returned;
  - split pot odd chip left of button;
  - side pot winner differs from main pot winner.

### A5. Showdown / muck / all-in reveal

Правила:

1. Обычный проигравший showdown может быть hidden/mucked для других игроков.
2. All-in runout раскрывает участвующие руки.
3. Winner hand должен быть определён по лучшим 5 картам.
4. UI должен показывать не гигантский log-block, а компактное win-result событие.

Acceptance criteria:

- У победителя видно winning combination.
- У проигравшего обычного showdown карты не раскрываются всем без необходимости.
- All-in showdown раскрывает руки.
- После выигрыша нет огромного чёрного поля/технического текста.
- Hand history хранит полные данные для audit, но публичный UI показывает компактную версию.

### A6. Action timing и time bank

Базовая модель:

| Контекст | Значение |
|---|---:|
| Cash/rating action timer | 20 sec |
| Tournament action timer | 20 sec default, configurable per event |
| Time bank reserve | 15 sec optional/configurable |
| Sit-out release cash/rating | 300 sec |
| Tournament reconnect | no seat release |

Задачи:

1. Сделать server-configurable значения через economy/config/env/admin, но default оставить как выше.
2. Не хардкодить разные значения во frontend.
3. Frontend получает timer deadline от сервера.

Acceptance criteria:

- UI countdown не расходится с серверным auto-action.
- При reload таймер восстанавливается из server deadline.
- В тестах можно переопределить timer env без ожидания реального времени.

---

## 3. Блок B — In-game UI/UX polish

### Цель

Игровой стол и все меню должны выглядеть как единая Telegram-native система, а не набор наложенных слоёв.

### B1. Общий визуальный аудит стола

Проверить:

1. Нет ли лишних overlay/layer, которые остаются видимыми при входе за стол.
2. Left menu и right info panel изначально hidden.
3. Панели открываются только по нажатию.
4. Крестик закрывает панель и возвращает её в hidden state.
5. Переключение tab внутри right panel не сдвигает панель в центр экрана.
6. Table layout адаптивен под Telegram viewport, не desktop.

Acceptance criteria:

- При входе за стол виден только стол, верхние кнопки и игровые controls.
- Left menu hidden.
- Right panel hidden.
- Нет полупрозрачных старых панелей под новыми.
- Нет случайных “лист ожидания”, “комбинации”, “логгирование”, если они не утверждены в ТЗ.

### B2. Left table menu

Функции:

1. Покинуть стол.
2. Отойти / Вернуться.
3. Добавить средства на стол.
4. Пригласить.
5. Назад в лобби.

Запрещено добавлять без отдельного решения:

- waiting list;
- replay hand;
- cashier inside menu, если не утверждено;
- table settings;
- random debug actions.

UI:

- кнопка меню использует `figma/icons/ic_list.svg`;
- close использует `figma/icons/cancel.svg`;
- меню компактное;
- строки как grouped list по `figma/footer_lobby.svg`;
- press state отменяется при drag/scroll;
- меню открывается сверху от кнопки, не по центру экрана.

Acceptance criteria:

- menu button и close button занимают одну координату/размер, меняется только icon/state.
- Иконка не криво отцентрирована.
- Текст по центру строки по baseline.
- Все row heights одинаковые.
- Separators начинаются по утверждённой сетке.

### B3. Right info panel

Требуемая структура:

1. В панели сверху единый tab-row:
   - История;
   - Информация;
   - Статистика.
2. Текст tab появляется только у активной кнопки.
3. При смене tab текст у старой кнопки исчезает, у новой появляется.
4. Close button входит в общий верхний блок, не отдельным кривым квадратом.

#### Tab “История”

Показывает hand history только текущей table session.

Session definition:

- session starts when at least 2 players start the first hand;
- session ends when table has 0 seated players or private table closes;
- old historical hands from previous days не подтягивать в текущую session UI.

Карточка руки:

- дата/время;
- номер руки;
- победитель;
- результат `+$X.XX` или `+3500` для play;
- winning hand name;
- board cards;
- player winning cards highlighted if needed;
- компактно, без технического action log.

#### Tab “Информация”

Только компактные поля:

- Название стола;
- Тип игры;
- Стек / max buy-in;
- Buy-in;
- Turn time;
- Time bank.

Не добавлять длинные тексты, приглашения, рекламные блоки.

#### Tab “Статистика”

Таблица:

| Ник | Buy-in | Result |
|---|---:|---:|

Считать за текущую table session, не за всё время.

Acceptance criteria:

- Right panel hidden by default.
- Tab-row symmetric with left toolbar.
- No text overflow.
- No center-floating panel.
- No old month-old hands.
- History cards show poker result, not raw logs.

### B4. Win/result UX after hand

Проблема: после победы не должно быть много лишнего текста и гигантского чёрного поля.

Нужно:

1. Compact pot push animation/event.
2. Small pill над/около pot: `Победа +$0.32` или `Банк: $0.32`.
3. Winning combination badge рядом с картами/над action bar.
4. Не перекрывать action controls.
5. Log/debug text держать только в drawer/history.

Acceptance criteria:

- После hand_complete основной стол остаётся читаемым.
- Player sees who won, amount, combination.
- Technical log не появляется в центре стола.

### B5. Table proportions

Ориентир: TON Poker по плотности, но не копировать бренд.

Требования:

1. Стол не должен быть чрезмерно вытянутым.
2. Avatar/seat blocks располагаются по краю стола, но не выходят за экран.
3. Board cards получают достаточно места и не выглядят узкими.
4. Pot/blinds labels менее контрастные, не перетягивают внимание.
5. Верхние кнопки menu/info выровнены по X/Y и одинакового размера.

Acceptance criteria:

- В Telegram viewport 390x844 и 430x932 layout не ломается.
- 2-max и 6-max seats не пересекаются с board/actions.
- Board cards визуально главнее labels.

---

## 4. Блок C — Lobby / profile / cashier / menus full UI audit

### Цель

Прошерстить все пользовательские кнопки, sheet, menus, rows и привести к одному дизайн-коду.

### C1. Global UI rules

Использовать `docs/DESIGN_SYSTEM.md`.

Обязательные правила:

1. SF Pro / system font.
2. Telegram theme params, не чистый `#000`.
3. Grouped list style по `figma/footer_lobby.svg`.
4. Chevron только `figma/icons/chevronright.svg`.
5. Press state отменяется при drag.
6. Sheet background и card colors едины.
7. No random outlines, glow, gradients, если их нет в регламенте.

Acceptance criteria:

- На всех экранах одинаковые radii/spacing/colors.
- Нет блоков с разными оттенками без причины.
- Нет перекрытия bottom nav/sheets.
- Вводы поднимают CTA над клавиатурой.
- Tap outside input closes keyboard.

### C2. Cashier deposit

Текущее направление:

1. Заголовок: `Выберите сумму пополнения`.
2. Amount block:
   - outer background `#2C3844` or token equivalent;
   - input/preset background `#3F4857` or token equivalent;
   - spacing between input and presets = 10px.
3. Presets: `$5`, `$10`, `$50`, `$100`.
4. Payment methods grouped list:
   - Stars;
   - Crypto Bot;
   - xRocket;
   - Gram.
5. Icons:
   - Stars: `premiumbadge.svg` as white inside icon box;
   - Crypto Bot: `Cryptobot.png`;
   - xRocket: `xrocket.png`;
   - Gram: circular badge from provided zip / final asset.
6. Selected method row color: `#256CA9`.
7. On selected row, secondary method text becomes white except chevron stays muted.

Acceptance criteria:

- Amount default is not silently reset to `$100`; default should be product-approved (`$1.00` or last chosen).
- Dollar sign in input centered.
- Blocks have correct spacing.
- CTA not hidden by keyboard.
- Deposit method row selected state obvious.

### C3. Withdrawal

Must be fixed before public real-money launch.

Required validation:

1. User cannot create withdrawal without destination address.
2. Random letters must not pass TON/USDT validation.
3. Amount must be:
   - numeric;
   - >= minWithdrawal;
   - <= withdrawable balance;
   - after fees valid.
4. Funds are held only after validation passes.
5. User can cancel pending withdrawal before admin processing.
6. Cancel returns held funds through ledger.
7. Admin approve/reject is idempotent and audited.

Method-specific validation:

| Method | Required validation |
|---|---|
| TON / Gram | valid TON address format, no memo if unsupported |
| Crypto Bot | provider-supported destination, or manual recipient handle if product-approved |
| xRocket | provider-supported destination, or manual recipient handle if product-approved |
| USDT | network-specific address validation; do not mix TRC20/TON |

UX:

1. Remove unnecessary text blocks.
2. Use same color system as deposit.
3. Show manual-processing notice only after valid amount + address + method selected.
4. Error/notice must be above keyboard.
5. CTA fixed above keyboard when input focused.
6. Details screen: amount, time, status, method, address short, tx/hash if paid. No walls of text.

Acceptance criteria:

- Invalid address cannot create order.
- Pending order can be cancelled.
- Ledger balances reconcile after request/cancel/reject/approve.
- UI shows only useful statuses.

### C4. Profile

Required structure:

1. Top profile block:
   - avatar;
   - display name;
   - username;
   - no duplicated giant finance block if removed by current design.
2. Finance mini-cards:
   - Доступно;
   - За столами;
   - Рейтинг.
3. Adaptive font for large balances.
4. `$` display:
   - cash values use `$` before number in current product decision unless user changes spec again;
   - no spacing glitches;
   - decimals smaller where specified.
5. Session block:
   - if no active tables: compact “Активных столов нет”;
   - if active: table name, stack, button “Вернуться”.
6. Statistics:
   - split Cash games and Tournament stats;
   - do not mix cash hands with tournament entries.

Acceptance criteria:

- `$5,205.00` does not overlap username/avatar.
- Profile cards do not overflow at 5–6 digit balances.
- Rating value uses SF Pro Rounded where specified.
- No stale “нет” label in block header if redundant.

### C5. User agreements / FAQ / support

Add actual content screens/routes, not dummy rows:

1. Пользовательское соглашение.
2. Responsible gaming / 18+ warning.
3. Rules of play:
   - cash;
   - rating;
   - tournaments.
4. Payments FAQ:
   - deposit;
   - withdrawal;
   - pending states;
   - manual review.
5. Support:
   - how to report payment issue;
   - hand dispute format;
   - table/session issue format.

Acceptance criteria:

- Menu rows open real screens/sheets.
- Text is concise and Russian.
- No legal promises beyond approved policy.
- Support issue includes user id/order id/table id/hand id where relevant.

---

## 5. Блок D — Economy cleanup

### D1. Display and storage invariant

Cash storage:

```text
1 USDT = 1_000_000 micros
```

Cash display:

```text
$14.50
$0.02 / $0.05
```

Play display:

```text
35 000
```

Never:

- show cash micros to user;
- convert cash through old chips rate;
- allow play → cash conversion;
- use play chips as normal tournament buy-in.

Acceptance criteria:

- Search code for `5000`, `chips`, `USDT` in user-facing cash paths.
- Keep historical variable names only if they do not affect UI/math.

### D2. Rake model

Current target from `docs/ECONOMICS.md`:

```text
rake = min(pot * rake_percent, cap_for_stake)
NFND: if board_cards < 3 => rake = 0
WCR: player_rake_share = player_contribution / total_contribution * total_rake
```

Check exact product value:

- `docs/ECONOMICS.md` mentions 5.0–5.5% in different spots.
- `MASTER_SPEC.md` and code must have one source of truth.

Task:

1. Audit current code rake percent/caps.
2. Pick source-of-truth config.
3. Update docs/code/tests if mismatch.
4. Ensure affiliate/rakeback uses WCR, not equal split.

Acceptance criteria:

- `calculateRake` is tested per stake cap.
- Preflop fold has zero rake.
- Uncalled excess excluded.
- WCR sums exactly to total rake.

### D3. Stars rate

Approved product target:

```text
100 Stars = $1.00 USDT
STARS_USDT_RATE = 0.01
```

Task:

- Audit `server/economy.js`, `render.yaml`, admin config.
- Ensure all UI quotes and backend credits match.
- Do not show “balance updated” before server order is paid.

Acceptance criteria:

- Stars paid webhook credits exactly quoted USDT micros.
- Duplicate webhook cannot double credit.
- Manual approve writes audit.

### D4. Withdrawal fees and limits

Proposed launch config:

| Parameter | Default |
|---|---:|
| Min withdrawal | $10 |
| Manual review | all withdrawals at launch |
| Withdrawal fee | product decision needed: 0–3.5% |
| First withdrawal rake threshold | optional, default off until clearly shown to user |

Important: if fee/rake-threshold is enabled, it must be visible before user creates order.

Acceptance criteria:

- No hidden fees.
- No hidden rake threshold.
- User sees expected receive amount.

---

## 6. Блок E — Admin panel: live operations, logs, sessions

### Цель

Админка должна быть рабочим пультом, а не просто списком таблиц.

### E1. Live table/session view

Add admin page:

`/admin/tables/:tableId/session`

Read-only live view:

1. Current table status.
2. Seats:
   - user id;
   - username;
   - stack;
   - sittingOut;
   - connected;
   - last presence.
3. Current hand:
   - hand number;
   - button/SB/BB;
   - board;
   - pot/side pots;
   - current action;
   - deadlines.
4. Server events timeline.
5. Hand history for current session.
6. Fund movements for this table.
7. Ledger links for buy-in/rebuy/return.

Realtime:

- Use existing SSE/replay if available.
- Admin should be able to follow game in near real time.
- Admin must not see hidden hole cards during active hand unless in explicit audit mode after hand completion.

Acceptance criteria:

- Admin can click active table and see live state.
- No manual mutation buttons in read-only view except approved operational actions.
- Audit mode access is logged.

### E2. Session log model

Add/verify canonical session id:

```text
table_session_id
started_at
ended_at
table_id
game_mode
stake
players_count
hands_count
rake_total
status: active|ended|abandoned
```

Session starts:

- first hand starts with >=2 players.

Session ends:

- 0 seated players;
- private table closed;
- tournament table closed;
- admin forced close.

Acceptance criteria:

- Hand history can be filtered by `table_session_id`.
- Admin can inspect one session without old hands.
- Profile active sessions uses current session only.

### E3. Admin audit logs

Every admin action writes:

```text
admin_user_id
action
target_type
target_id
before
after
reason
idempotency_key
ip_hash
created_at
```

Actions requiring audit:

- wallet adjustment;
- payment manual approve/reject;
- withdrawal approve/reject/cancel;
- tournament create/edit/cancel/force-start/force-finish;
- user ban/risk flag;
- table force close;
- viewing sensitive audit data.

Acceptance criteria:

- No admin money action without audit row.
- Admin UI shows reason required.

### E4. Operational alerts

Telegram admin bot notifications should be limited to:

1. App opened / high-level important entry event if required.
2. Deposit order created/paid/manual review.
3. Withdrawal requested/cancelled/approved/rejected.
4. Reconciliation drift.
5. Server/payment incident.

Disable noisy notifications:

- entered table;
- normal hand actions;
- every sit-out/return;
- normal tournament table movements unless payout/bust/admin-relevant.

Acceptance criteria:

- Admin Telegram is not spammed during active play.
- Payment/risk alerts are visible.

---

## 7. Блок F — Product analytics and metrics

### F1. Core funnel

Track:

```text
app_open
first_lobby_loaded
daily_claim_clicked
daily_claim_success
rating_quick_play_clicked
rating_table_joined
first_hand_started
first_hand_completed
cashier_open
deposit_order_created
deposit_paid
cash_table_joined
withdrawal_requested
withdrawal_cancelled
withdrawal_paid
```

Primary KPIs:

| KPI | Formula |
|---|---|
| Trial conversion | first_hand_started / app_open |
| Rating activation | rating_table_joined / app_open |
| D1 retention | users active next day / activated users |
| Deposit conversion | deposit_paid / app_open |
| Cash activation | cash_table_joined / deposit_paid |
| Rake per active cash user | rake_total / cash_active_users |
| Withdrawal incident rate | failed_or_rejected_withdrawals / requested_withdrawals |

Acceptance criteria:

- Admin dashboard shows 1d/7d/30d funnel.
- Source/campaign/startapp is preserved.

### F2. Traffic source attribution

For QR/offline/ads:

```text
source
campaign
creative
location
created_at
first_open
first_claim
first_hand
first_deposit
first_rake
```

Examples:

```text
startapp=offline_chlb_kirovka_a
startapp=tiktok_poker_meme_01
startapp=yt_shorts_holdem_01
```

Acceptance criteria:

- A user keeps first-touch attribution.
- Repeat opens can update last-touch separately.

### F3. Table liquidity metrics

Track per hour:

- active tables;
- seated players;
- hands/hour;
- average wait time to second player;
- empty lobby opens;
- users leaving without first hand.

Acceptance criteria:

- Admin can see when tables are dead.
- Product can schedule rating nights based on actual time windows.

---

## 8. Блок G — Referral / affiliate / tester part

### Цель

Привести в порядок referral/affiliate/tester без смешивания с игровой экономикой.

### G1. Models and statuses

Entities:

1. Referral user attribution.
2. Affiliate partner.
3. Tester/ambassador.
4. Payout request.
5. Abuse/risk flags.

Statuses:

Referral:

```text
created
registered
qualified
active
rejected
fraud_suspected
```

Affiliate:

```text
draft
active
paused
under_review
banned
closed
```

Payout:

```text
accrued
hold
approved
paid
rejected
reversed
```

### G2. Qualification rules

Do not count as qualified by registration only.

Suggested baseline:

```text
qualified_cash_referral =
  deposit_total >= $5
  AND real_hands_played >= 20
  AND contributed_rake >= $0.25
  AND no risk flags
```

Rating-only:

```text
qualified_rating_referral =
  rating_hands >= 50
  AND active_days >= 2
  AND no risk flags
```

These values are starting config, not hardcoded constants.

### G3. Commission calculations

Use Weighted Contributed Rake only:

```text
affiliate_commission = referred_user_contributed_rake * commission_rate
```

Example:

```text
User A generated $10.00 WCR rake.
Partner rate = 30%.
Partner accrual = $3.00.
Hold = 7 days.
If no fraud flags => payable.
```

Never:

- pay from deposits directly without wagering;
- pay for self-referrals;
- pay before fraud hold clears;
- issue real-money playable balance as tester funding.

### G4. Tester program

Tester does not receive playable cash balance.

Tester can receive:

- fixed off-platform/manual reward;
- bug bounty reward after verification;
- referral/revshare only for real qualified users.

Tester obligations:

- rating activity;
- bug reports with reproduction steps;
- optional referrals;
- no chip dumping;
- no multi-accounting.

Bug report reward needs severity:

| Severity | Example | Reward |
|---|---|---:|
| S1 critical | money loss, duplicated payment, stack corruption | manual high |
| S2 major | game flow breaks, cannot leave table, invalid payout | medium |
| S3 minor | UI broken, copy/layout issue | low |
| duplicate | already known | $0 |

### G5. Anti-abuse checks

Flags:

- same device/IP between referrer and referral;
- deposit → lose to referrer/friend → withdrawal within 24h;
- repeated heads-up only between same accounts;
- abnormal fold/call/all-in patterns;
- referred users only play each other;
- no organic play outside partner cluster;
- high withdrawal after low real play;
- many accounts using same payment destination.

Acceptance criteria:

- Admin sees partner risk score.
- Payouts can be held/rejected with reason.
- User/referral status is auditable.

---

## 9. Блок H — Statuses, achievements, retention

### Цель

Добавить активности и статусы без ломания экономики.

### H1. Achievements

Initial achievement set:

1. First Hand — сыграл первую руку.
2. First Win — выиграл первый банк.
3. Rating Starter — сыграл 10 rating hands.
4. Daily Claim — получил daily bonus.
5. 3-Day Streak — 3 дня активности.
6. Cash First Seat — сел за cash-стол.
7. Tournament Debut — сыграл первый турнир.
8. Private Host — создал приватный стол.

Rules:

- No direct cash rewards for simple achievements.
- Rewards can be:
  - badge;
  - status;
  - play chips;
  - ticket/freeroll access.

### H2. Statuses

Examples:

- New Player
- Rating Player
- Cash Player
- Founder
- Early Tester
- Tournament Player

Acceptance criteria:

- Status does not imply guaranteed money/rewards.
- Profile shows status cleanly without clutter.

### H3. Rating retention loop

Approved loop:

```text
Daily Bonus 35 000
→ Quick Play rating
→ Weekly leaderboard
→ Freeroll/ticket access for active users
```

No play chips → cash conversion.

---

## 10. Блок I — Legal/product safety content

### Required user-facing documents

1. Terms of Use.
2. Privacy Policy / data processing.
3. Responsible Gaming / 18+.
4. Poker Rules.
5. Payment Rules.
6. Withdrawal Rules.
7. Bonus Rules.
8. Affiliate/Referral Terms.
9. Support/Dispute Rules.

Minimum content:

- project is 18+;
- play chips are not money;
- cash and play are separate;
- withdrawals can be manual review;
- suspicious activity can delay payouts;
- admin decisions are logged;
- bug/exploit abuse can lead to account restriction;
- no guaranteed earnings.

Acceptance criteria:

- Menu has accessible rows for these documents.
- No empty placeholder pages.
- Copy is concise.

---

## 11. Блок J — Testing requirements

Every block must add tests or documented manual QA.

### Backend tests

Run:

```bash
unset DATABASE_URL REDIS_URL
npm test
```

Add tests for:

1. Withdrawal invalid address.
2. Withdrawal cancel returns funds.
3. Withdrawal reject returns funds.
4. Auto-release cash/rating seat.
5. Tournament disconnect blind-out.
6. Session-scoped hand history.
7. Affiliate WCR accrual.
8. Referral qualification.
9. Admin audit logging.
10. Rake cap/NFND.

### Integration tests

When test PG/Redis available:

```bash
RUN_INFRA_INTEGRATION_TESTS=true DATABASE_URL=... REDIS_URL=... npm test
```

Cover:

- restart during active hand;
- Redis lock contention;
- commit-timeout retry;
- payout idempotency;
- withdrawal hold/cancel/reject.

### Frontend/manual QA

Check on Telegram-like viewport:

- 390x844;
- 430x932.

Mandatory manual flows:

1. First open → daily bonus → rating table.
2. Cash deposit → balance update.
3. Invalid withdrawal address.
4. Valid withdrawal pending.
5. Cancel withdrawal.
6. Enter table.
7. Close Telegram/reopen.
8. Sit-out/auto-release.
9. Left menu open/close.
10. Right panel tabs.
11. Win result after hand.
12. Profile large balance.

---

## 12. Priority order

### P0 — до публичного real-money запуска

1. Withdrawal validation/cancel/admin audit.
2. Session lifecycle and auto-release proven by tests.
3. Admin live table/session view read-only.
4. Payment/admin Telegram notification cleanup.
5. User agreements/FAQ/payment rules.
6. UI audit of cashier/profile/table menus.
7. Reconciliation and ledger drift alerts verified.

### P1 — beta public test

1. Rating quick play / first free trial flow.
2. Session-scoped hand history UI.
3. Achievements/statuses MVP.
4. Referral qualification model.
5. Traffic attribution analytics.
6. Table liquidity dashboard.

### P2 — after stable traffic

1. Affiliate dashboard/payout automation.
2. Freeroll/ticket reward tournaments public flow.
3. Advanced anti-fraud scoring.
4. Auto top-up / waiting list / seat-me only after separate decision.
5. More tournament formats.

---

## 13. Explicit non-goals

Do not add without separate product decision:

1. Rabbit Hunt.
2. Run It Twice.
3. All-in Cash Out.
4. Casino games / slots.
5. Play chips → cash conversion.
6. Spontaneous play-chip tournaments.
7. Table chat/emoji.
8. Auto-paid affiliate payouts.
9. Automated withdrawals before risk/ops is stable.
10. New UI style outside `docs/DESIGN_SYSTEM.md`.

---

## 14. Required deliverable format from Claude

For every completed block Claude must report:

1. Files changed.
2. What was already correct and untouched.
3. What was broken and fixed.
4. Tests added/updated.
5. Test command and result.
6. Remaining gaps.
7. Whether env/Render changes are required.

No vague “improved UI”. Every change must map to a specific acceptance criterion above.

