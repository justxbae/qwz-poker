# QWZ Decisions

## 2026-06-20: Tournament runtime MVP и разделение cash/play

**Зона:** product / architecture / economy / development

**Решение:** Турнирный MVP реализуется в текущем Node.js монолите для MTT и базового SNG. Канонический state machine: `created`, `registration_open`, `late_registration`, `running`, `final_table`, `finished`, `cancelled`. Scheduler запускает MTT по времени, SNG по заполнению, управляет blind clock, посадкой, балансировкой и финальным столом. Каждый турнир имеет явный `balanceBucket`: cash-турнир списывает и выплачивает только `cash_usdt_micros`, play-турнир — только PLAY_CHIPS. Buy-in и fee разделены: buy-in является турнирным escrow, fee сразу отражается в platform ledger; отмена до старта реверсирует обе части. Payout выполняется одной PostgreSQL-транзакцией и идемпотентен.

**Почему:** Старый backend поддерживал только регистрацию и смешивал fee с escrow. Полноценный runtime требует персистентного состояния и строгого запрета создавать cash из play-баланса.

**Влияет на:** `server/tournament-engine.js`, tournament API, poker table runtime, `tournaments`, `tournament_tables`, `tournament_results`, `tournament_payouts`, ledger, profile stats и reconciliation.

**Что обновлено:** Добавлены MTT/SNG runtime, scheduler, secure seating, late registration, blind levels/ante, no-rake tournament hands, table balancing, final table, atomic payout, history API, bucket-specific fee/prize stats и тесты.

**Открытые вопросы:** Re-entry/add-on, freeroll, satellites, bounty, series и отдельный tournament time-bank отложены на следующую итерацию.

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
