# QWZ Decisions

## 2026-06-21: Real-money table hardening и realtime contract

**Зона:** architecture / frontend / development

**Решение:** Active table mutation сериализуется Redis lock-ом и revision refresh; wallet ledger, fund movement и durable PostgreSQL table snapshot для buy-in/rebuy/return фиксируются одной транзакцией. Redis является realtime cache после commit. Table events доставляются через authenticated SSE с `Last-Event-ID`; presence heartbeat даёт 30-second reconnect window. Fairness переведён на player commit → server commit → reveal. Tournament lifecycle отправляет пользовательские Telegram notifications.
**Почему:** Process-local mutation, polling и раздельный commit wallet/snapshot недопустимы для публичного real-money режима.
**Влияет на:** `server/state-store.js`, `server/db.js`, `server/index.js`, `server/poker-engine.js`, `public/app.js`, integration tests.
**Что обновлено:** Добавлены distributed locks, atomic table wallet mutation, SSE replay, presence/reconnect, two-phase fairness, tournament notifications и frontend handoff.
**Открытые вопросы:** Визуальный animation queue по server events остаётся frontend quality pass; live infrastructure suite требует отдельные test PostgreSQL/Redis URLs.

## 2026-06-21: Approved gameplay ruleset for cash, rating, tournaments and animation model

**Зона:** product / architecture / frontend / development

**Решение:** Базовая игровая механика QWZ утверждена как единый NL Hold'em core с режимными надстройками. `cash` и `rating` используют одну логику улиц, all-in, side pots, showdown, sit-out и reconnect, но разные buckets и разные продуктовые ограничения. Во всех режимах действует strict table-stakes rule: mid-hand нельзя докладывать деньги/фишки из wallet, top-up и rebuy выполняются только между руками. `cash` остаётся основным “полным” режимом: USDT-only, normal table buy-in flow, table selection/listing как сейчас, top-up между руками, optional auto top-up до целевого стека, строгий rake/no-flop-no-drop, hand history и provably-fair audit. `rating` остаётся облегчённым competitive mode: только PLAY_CHIPS, никакой конвертации в cash, никакого обычного tournament buy-in, без insurance/cash-out и без отдельных спонтанных play tournaments; сезон и leaderboard живут поверх cash-like table flow.

По темпу игры: базовый action clock для cash/rating сохраняется быстрым, а quality-pass должен довести его до server-configurable model с optional time bank, auto-check если check legal и auto-fold иначе. Tournament mode получает отдельную disconnected/tournament timing policy и blind-clock events. Для showdown/muck остаётся действующая логика: обычный проигравший hand может быть скрыт, но all-in runout раскрывает карты всем участникам. Rabbit hunt, Run It Twice и All-in Cash Out не входят в default gameplay: Rabbit Hunt запрещён в cash и турнирах; Run It Twice и All-in Cash Out рассматриваются только как optional cash-only features после отдельного решения и только без дополнительного rake distortion.

Турниры утверждены так: обычные MTT/SNG и freerolls работают как cash-event flow, создаются админкой, используют wall-clock late registration, blind structure, table balancing, final table и atomic payout в `cash_usdt_micros`. Re-entry/add-on/time-bank допустимы как per-event настройки, но default-off до отдельной валидации. Post-season reward tournaments для топов leaderboard живут отдельно через tickets и не смешиваются с обычными buy-in турнирами. Фронтовые анимации считаются частью механики, поэтому backend обязан отдавать стабильную server-driven event timeline для всех ключевых стадий руки и турнира; фронт не должен угадывать анимации по diff snapshot’ов.

**Почему:** В проекте уже есть рабочий покерный core, но не было утверждённого target ruleset, что именно считается “идеальным” для QWZ, а что остаётся optional. Без этого backend дорабатывает механику фрагментами и легко уходит либо в лишние фичи, либо в конфликт между cash/rating/tournament мирами.

**Влияет на:** `server/poker-engine.js`, `server/index.js`, `server/tournament-engine.js`, config/env, hand history, fairness proof, admin tournament tooling, SSE/event protocol и frontend animation layer.

**Что обновлено:** Зафиксирован утверждённый gameplay ruleset для quality pass и границы optional market-facing features.

**Открытые вопросы:** Анти hit-and-run penalty, seat-me / active waiting list, paid time-bank cards, public rabbit-hunt on play/private tables и table chat/emoji остаются отдельными продуктами и не входят в базовый rollout.

## 2026-06-21: Gameplay quality bar for cash, rating, tournaments and animation hooks

**Зона:** product / architecture / frontend / development

**Решение:** Следующая итерация table gameplay в QWZ считается не feature-spike, а quality pass по трём режимам: `cash` на USDT, `rating` на PLAY_CHIPS и `cash tournaments / freerolls`. Backend делает не только проверку корректности математики, но и проверку полноты игровой механики: table stakes, blind/ante flow, reconnection, sit-out, auto-actions, showdown, payout, audit trail, ticket-based reward tournaments, anti-abuse ограничения и server-driven event model для анимаций. Обычные cash-столы и турниры должны оставаться максимально близкими к зрелым онлайн-румам по базовым правилам и UX, без смешивания buckets. Анимации считаются частью механики: сервер должен отдавать стабильные события и тайминги для `hand_start`, `blind_posted`, `hole_cards_dealt`, `action_prompt`, `check/call/bet/raise/fold`, `street_reveal`, `all_in_runout`, `showdown_reveal`, `pot_push`, `odd_chip`, `seat_busted`, `tournament_level_up`, `tournament_table_move`, `final_table`, `payout_complete`.

**Почему:** В коде уже много работающей логики, но до целевого уровня покерного рума не хватает качества по краевым сценариям, настройкам и presentation hooks. Без явного quality bar backend будет закрывать отдельные баги, но не доведёт систему до предсказуемого продуктового стандарта.

**Влияет на:** `server/poker-engine.js`, `server/index.js`, `server/tournament-engine.js`, snapshots/SSE, hand history, fairness proof, admin tournament tools, frontend in-game renderer и tournament lobby.

**Что обновлено:** Зафиксирован единый gameplay check-up для cash, rating, tournaments, freerolls и анимационных event hooks.

**Открытые вопросы:** Rabbit hunt, Run It Twice, All-in Cash Out, anti-hit-and-run penalties, chat/emoji и bounty mechanics оцениваются отдельно как optional/market-facing features и не должны silently появляться без продуктового решения.

## 2026-06-20: Tournament lobby cards follow cash-event pattern with separate details sheet

**Зона:** frontend

**Решение:** В публичном tournament lobby карточка турнира теперь работает как компактный cash-event row: слева короткий time/status блок, справа — название, buy-in, fee, prize pool и participants без перегруза вторичным текстом. Нажатие на саму карточку открывает отдельный details sheet, а CTA-кнопка внутри карточки используется только для `register/cancel/open-table`. `Sit&Go` убран из home format pills до реальной реализации, карусель баннеров расширена до full-width без peek соседнего баннера. Cash progression больше не брендируется как `Cash Club / Starter`, а показывается нейтрально как `Уровень N`.

**Почему:** Старый tournament list выглядел как техническая таблица, а не как игровой lobby feed. Отдельный click-target для деталей и для регистрации повторяет понятный мобильный паттерн конкурентов, но остаётся в визуальном стиле QWZ.

**Влияет на:** `public/index.html`, `public/app.js`, `public/lobby-qa.css`, home lobby geometry, tournament UX.

**Что обновлено:** Турнирные карточки и details sheet, home promo carousel, format pills, copy для cash progression.

**Открытые вопросы:** Если позже появятся ticket-based reward tournaments в публичном UI, для них нужен отдельный card pattern, чтобы не смешивать ticket entry с cash buy-in.

## 2026-06-20: Tournament policy correction — no spontaneous play-chip tournaments

**Зона:** product

**Решение:** Обычная турнирная система в QWZ работает только как cash-турниры и cash SNG. Play chips не используются как вход в спонтанные турниры и не получают отдельную турнирную сетку. Использование play-мира для турниров допускается только в виде отдельного сезонного reward-формата: после завершения рейтингового сезона топы лидерборда получают билеты, и по этим билетам запускаются специальные приглашённые турниры/фрироллы. Билеты выдаются по местам в лидерборде, а не через свободный buy-in.

**Почему:** Play chips — отдельная free-to-play валюта для рейтинга и удержания, а не турнирная валюта. Смешивание её с обычными турнирами ломает продуктовую логику и создаёт нежелательный UX.

**Влияет на:** tournament product scope, `MASTER_SPEC.md`, `docs/TECH_ROADMAP.md`, tournament admin flow, reward tournaments, leaderboard rewards.

**Что обновлено:** Зафиксирован запрет на spontaneous play-chip tournaments и введён отдельный сезонный ticket-based reward tournament flow.

**Открытые вопросы:** Формат reward-турниров после сезона: cash freeroll, ticketed entry в cash MTT или отдельная серия; это решается отдельно.

## 2026-06-20: Tournament runtime MVP и разделение cash/play

**Зона:** product / architecture / economy / development

**Решение:** Турнирный MVP реализуется в текущем Node.js монолите для MTT и базового SNG. Канонический state machine: `created`, `registration_open`, `late_registration`, `running`, `final_table`, `finished`, `cancelled`. Scheduler запускает MTT по времени, SNG по заполнению, управляет blind clock, посадкой, балансировкой и финальным столом. Обычные турниры работают только в cash-логике: списание и выплата идут через `cash_usdt_micros`, а play chips в обычный tournament buy-in не участвуют. Сезонные reward-турниры по билетам считаются отдельным продуктовым потоком и не смешиваются с базовым tournament runtime. Buy-in и fee разделены: buy-in является турнирным escrow, fee сразу отражается в platform ledger; отмена до старта реверсирует обе части. Payout выполняется одной PostgreSQL-транзакцией и идемпотентен.

**Почему:** Старый backend поддерживал только регистрацию и смешивал fee с escrow. Полноценный runtime требует персистентного состояния и строгого запрета создавать cash из play-баланса.

**Влияет на:** `server/tournament-engine.js`, tournament API, poker table runtime, `tournaments`, `tournament_tables`, `tournament_results`, `tournament_payouts`, ledger, profile stats и reconciliation.

**Что обновлено:** Добавлены MTT/SNG runtime, scheduler, secure seating, late registration, blind levels/ante, no-rake tournament hands, table balancing, final table, atomic payout, history API, bucket-specific fee/prize stats и тесты.

**Открытые вопросы:** Re-entry/add-on, freeroll, satellites, bounty, series, отдельный tournament time-bank и post-season ticket reward tournaments отложены на следующую итерацию.

## 2026-06-19: Daily play-chip claim в рейтинговом режиме

**Зона:** product / architecture / development

**Решение:** В рейтинговом режиме правая верхняя карточка лобби работает как daily claim для `10 000` `PLAY_CHIPS` раз в `24` часа. Это отдельная play-only механика: она не трогает `cash_usdt_micros`, не конвертируется в USDT и не показывается в cash-режиме. Backend должен отдавать состояние клейма вместе с профилем: `canClaim`, `claimedAt`, `availableAt`, `cooldownSeconds`, `amount`. При успешном claim сервер делает атомарную проверку cooldown, увеличивает play-баланс, пишет `ledger_entries` с `balance_bucket='play'` и возвращает обновлённый профиль. Frontend в `play` показывает активную кнопку только когда `canClaim=true`, иначе отображает таймер до следующей выдачи.

**Почему:** UI уже содержит этот слот как часть дизайна, но без серверной логики карточка остаётся декоративной. Для MVP нужна простая и проверяемая механика удержания игроков в play-цикле без смешивания с cash-экономикой.

**Влияет на:** `/api/profile`, `/api/progression` или отдельный claim endpoint, play wallet, ledger entries, lobby right-side card, rating lobby UX.

**Что обновлено:** Реализованы `daily_play_claims`, `POST /api/play/daily-claim`, блок `dailyPlayClaim` в profile/progression, play-ledger credit, memory fallback и regression-тесты. Frontend wiring остаётся отдельной задачей.

**Открытые вопросы:** Нужен ли отдельный streak/bonus escalation, или остаёмся на фиксированных `10 000` каждые `24` часа.

## 2026-06-19: Lobby wallet hero and simplified bottom nav

**Зона:** frontend

**Решение:** В лобби cash-баланс в hero-карте отображается как крупная сумма с tether-иконкой вместо символа `$`. Справа добавлен компактный стат-блок `За столами`, который показывает текущий стек в столах и количество активных столов. Нижняя навигация упрощена до `Главная / Профиль / Меню`, без дублирования разделов `Столы` и `Турниры`.
**Почему:** Это делает денежный блок более читаемым и визуально плотным, а также убирает дублирование навигации, которое уже есть внутри самого лобби.
**Влияет на:** lobby hero, mode-aware wallet rendering, bottom navigation, active-table summary.
**Что обновлено:** `public/index.html`, `public/app.js`, `public/styles.css`.
**Открытые вопросы:** Нужен ли в правом стате отдельный вариант для `Cash Club`/прогресса вместо `За столами`, если продукт захочет сделать этот блок более статусным.

## 2026-06-19: Mode-specific side panel and card-based menu

**Зона:** frontend

**Решение:** Правая панель в лобби стала режимной: в `play` она показывает внешний вид ежедневного бонуса на `10 000` фишек каждые `24` часа, а в `cash` показывает `Cash Club` с прогрессом по статусу. Меню лобби переведено на карточный вид, без кнопки `Профиль`. Форматные плитки получили иконки рядом с текстом и растянулись на всю ширину сетки. Нижняя навигация стала короче, круглее и визуально отделена от контента.
**Почему:** Старый правый слот выглядел как случайная статистика, а меню и нижняя панель были слишком плоскими и дублировали уже доступную навигацию. Новый вид делает лобби более цельным и заметным, не выходя за стиль QWZ.
**Влияет на:** lobby menu, lobby hero side panel, play format cards, bottom navigation.
**Что обновлено:** `public/index.html`, `public/app.js`, `public/styles.css`.
**Открытые вопросы:** Нужна ли в будущем отдельная функциональная кнопка для daily bonus в `play`, когда backend/API её поддержит.

## 2026-06-19: Visual tightening after lobby QA

**Зона:** frontend

**Решение:** После визуальной проверки лобби правый side-panel был упрощён до коротких строк без лишних слов и без видимого currency-слота, форматные кнопки были возвращены к компактной ширине, меню лобби вернулось к обычному списку без карточной перестройки, а нижняя навигация получила компактный pill-вид без активного кружка на иконке. Профильный экран был ужат по вертикали за счёт меньших карточек и меньших отступов.
**Почему:** Скриншоты показали перегруз текста, слишком крупные вторичные кнопки и несогласованную геометрию навигации. Корректировка делает экран плотнее и ближе к исходному стилю QWZ.
**Влияет на:** lobby hero, bottom navigation, lobby menu, profile view, game-mode format buttons.
**Что обновлено:** `public/app.js`, `public/styles.css`.
**Открытые вопросы:** Если нужен ещё более плотный профиль, следующий шаг лучше делать уже как отдельную итерацию с переразметкой карточек, а не только CSS.

## 2026-06-19: Final lobby geometry and compact profile

**Зона:** frontend

**Решение:** Cash-панель в hero показывает только Cash Club, текущий статус, points и прогресс без отдельной кнопки. В rating-панели остаются только `Бонус дня`, `10 000` и кнопка `Получить`. Форматные кнопки компактнее основного переключателя Cash/Rating. Меню сохраняет исходный одноколоночный вид и не содержит профиль. Нижняя панель находится на исходной высоте, имеет уменьшенные боковые поля, одинаковую геометрию внешнего контейнера и активной кнопки и не рисует фон вокруг SVG. Профиль собран в компактный dashboard с балансом и двумя режимными карточками.
**Почему:** Предыдущий каскад перегружал hero текстом, увеличивал вторичные кнопки, превращал меню в сетку и растягивал профиль на несколько экранов. Отдельный финальный stylesheet исключает переопределение исправлений историческими CSS-слоями.
**Влияет на:** lobby hero, daily bonus preview, format buttons, bottom navigation, lobby menu, profile view.
**Что обновлено:** `public/index.html`, `public/app.js`, `public/lobby-qa.css`, `docs/13-decisions.md`.
**Открытые вопросы:** Функциональная выдача ежедневного бонуса остаётся отдельной backend/API задачей; текущая кнопка неактивна.

## 2026-06-19: Daily play claim frontend wiring

**Зона:** frontend

**Решение:** Кнопка `Получить` в rating hero-card отправляет `POST /api/play/daily-claim` с `X-Idempotency-Key`, а UI берёт состояние только из `dailyPlayClaim`, которое приходит в `/api/profile`, `/api/progression` и в ответе claim endpoint. Если `canClaim=false`, фронтенд не придумывает своё состояние, а показывает countdown до `availableAt`; при `409 cooldown` таймер просто пересинхронизируется из ответа сервера. После успешного claim фронтенд сразу обновляет play-баланс, progression и CTA без полной перезагрузки приложения.
**Почему:** Механика daily claim уже стала частью лобби, но до wiring оставалась декоративной. Такой контракт сохраняет server-driven модель и не переносит бонусную логику на клиент.
**Влияет на:** `public/app.js`, `/api/play/daily-claim`, lobby rating hero-card, play-mode empty-balance CTA.
**Что обновлено:** `public/app.js`, `tests/frontend-mode.test.js`, `docs/13-decisions.md`.
**Открытые вопросы:** Отдельный streak/multiday bonus по-прежнему не нужен; если появится, backend должен расширить `dailyPlayClaim`, а не перекладывать расчёт на frontend.

## 2026-06-20: Tournament frontend split between cash lobby and reward tickets

**Зона:** frontend

**Решение:** Обычный пользовательский `tournaments` lobby feed трактуется как cash-only витрина: фронтенд показывает только турниры с `currency=USDT`, рендерит `buyIn/fee/prizePool/participants/status/canRegister/canCancel/playerState` только из API и не смешивает их с play chips, rating chips или ticket-входами. Reward tournaments и tickets выводятся отдельно от обычного lobby feed и не маскируются под денежные buy-in турниры. В admin UI действия по турниру строятся из `tournament.actions` backend endpoint, а create/edit форма отправляет серверу полный набор полей турнира.
**Почему:** Backend зафиксировал публичные турниры как cash-only продуктовую механику. Если оставить mixed-mode рендер, UI будет вводить игрока в заблуждение насчёт валюты входа и доступности регистрации.
**Влияет на:** `public/app.js`, `public/index.html`, `public/lobby-qa.css`, admin tournament controls, reward event presentation.
**Что обновлено:** Публичные cash tournament cards, мягкая обработка `409`, disable во время request, admin tournament management tab, reward tournament list, регрессионные фронтенд-тесты.
**Открытые вопросы:** Для пользовательского reward flow нужен отдельный публичный endpoint; текущий фронт готов держать reward events отдельно, но публично их не показывает, пока backend не выдаёт `rewardTournaments` вне admin API.
