# QWZ Poker — технический roadmap (до запуска и далее)

Документ описывает, **что добавить и переделать**, чтобы из текущего MVP получить production-grade покерный клуб с реальными деньгами. Упорядочено по приоритету и фазам. Каждый пункт привязан к конкретному файлу/функции в текущем коде.

---

## 0. Текущее состояние (что уже есть и работает)

✅ Telegram Mini App + HMAC initData аутентификация (`server/index.js::authenticateTelegram`)
✅ Игровой движок NL Hold'em 6-max (`server/poker-engine.js`) — блайнды, сайд-поты, all-in run-out, авто-таймауты
✅ PostgreSQL персистентность с миграциями (`server/db.js`) — wallets, ledger, payments, hand_histories, admin_events, tournament_registrations, fund_movements, saved_stacks
✅ Транзакционные wallet+ledger операции с `FOR UPDATE`
✅ Telegram Stars инвойсы (createInvoiceLink + pre_checkout + successful_payment)
✅ Турниры — регистрация / отмена с эскроу через advisory_xact_lock
✅ Admin commands в боте (`/balance`, `/grant`, `/deduct`) с идемпотентностью
✅ Admin API + панель в Mini App с диагностикой
✅ Health endpoint + audit metrics
✅ 36 unit + integration тестов, все проходят

---

## 1. Критическое — **до публичного запуска с реальными деньгами**

### 1.1. Перенос активного состояния столов из памяти в Redis

**Проблема:** `tables = new Map()` живёт только в одном Node-процессе. Рестарт → потеря всех живых раздач (фишки не теряются, в БД остаётся `saved_stack`, но игрок видит «стол исчез» в середине руки). Горизонтально не масштабируется.

**Решение:**
- Redis cluster или standalone (Upstash / Redis Cloud / self-host).
- Каждый `table_id` — отдельный hash-key + JSON value.
- Атомарные апдейты через Lua-скрипты или `WATCH/MULTI/EXEC`.
- Pub/sub канал per table для рассылки обновлений (см. 1.2).
- Sticky routing per `table_id` через consistent hashing — если запустим >1 instance, каждый стол обслуживается одной нодой.

**Файлы:** `server/poker-engine.js` (нужен слой персистентности рядом с in-memory), новый `server/state-store.js`.

**Альтернатива:** dedicated game-server (Erlang/Elixir / Go / Rust с in-memory state + WAL в Redis). Overkill для MVP, но правильно для долгосрока.

---

### 1.2. Realtime push вместо polling

**Проблема:** фронт каждые 1 000 мс делает GET `/api/tables/:id`. При 1 000 одновременных игроков = 1 000 RPS только на read-стол. Дорого, медленно (delay в среднем 500 мс на UI), масштабируется плохо.

**Решение:** **Server-Sent Events** (SSE) — самый простой апгрейд:
- одна постоянная HTTP-сессия `GET /api/tables/:id/events`,
- сервер пушит JSON-диффы при каждом изменении стола (вместо целого snapshot’а),
- встроенный reconnect-resume у браузера (через `Last-Event-ID`).

Если нужен bi-directional (например, для chat / spectator interactions) — WebSocket. Telegram Mini App поддерживает оба нативно.

**Бонус:** сэкономит ~95% трафика. На 1 000 DAU — это $0 vs $50+/мес в инфра-стоимости.

**Файлы:** `server/index.js` (новый route), `public/app.js::loadCurrentTable`.

---

### 1.3. Provably-fair shuffle (commit-reveal) — базово сделано

**Статус:** `Math.random()` убран из раздачи. Сейчас используется SHA-256 + Fisher-Yates, `serverSeedHash` публикуется в начале руки, `serverSeed` раскрывается после завершения, proof пишется в `hand_histories.fairness_proof`.

**Текущая схема:**

1. В начале каждой руки сервер генерирует `serverSeed` (32 байта csprng) и публикует `commit = sha256(serverSeed)`.
2. Игрок может задать player seed через backend endpoint, иначе используется `server-fallback`.
3. `clientSeed` собирается из player seeds активных игроков.
4. Реальная колода тасуется детерминированно из `serverSeed`, `clientSeed`, `handNumber`, `tableId`.
5. По окончании руки сервер раскрывает `serverSeed` → игрок может локально воспроизвести тасовку и проверить.
6. Всё это пишется в `hand_histories.fairness_proof` и `hand_histories.raw`.

**Осталось до real-money уровня:** полноценный двухфазный player commit/reveal, где игрок сначала отправляет только `seedHash`, а seed раскрывается после фиксации server commit.

**Файлы:** `server/poker-engine.js::createProvablyFairDeck`, `docs/FAIRNESS.md`, колонка `hand_histories.fairness_proof`.

**Внешний эффект:** маркетинг — «provably fair», страница «проверь свою руку».

---

### 1.4. Idempotency на всех денежных эндпойнтах

**Проблема:** сейчас `requestId` есть только в `/api/admin/wallet-adjust`. На `/api/cashier/stars-invoice`, `/api/tables/:id/join` (с buy-in), `/api/tables/:id/rebuy`, `/api/tournaments/:id/register` — двойной клик с сети с лагом может списать chips дважды.

**Решение:**
- Заголовок `X-Idempotency-Key` (UUID, генерируется клиентом).
- Таблица `idempotency_keys (key text primary key, response jsonb, created_at, expires_at)` с TTL ~24 ч.
- Middleware: при повторе с тем же key → возвращаем сохранённый response, не выполняем операцию.

**Файлы:** `server/index.js` (новый middleware + хранилище), `public/app.js::api`.

---

### 1.5. Session TTL + Redis-based sessions

**Проблема:** `sessions = new Map()` без TTL → утечка памяти, восстановление при рестарте невозможно, не делится между процессами.

**Решение:** Redis с TTL 24 ч (повторный `/api/auth` обновляет TTL).

**Файлы:** `server/index.js::sessions, requireSession, /api/auth`.

---

### 1.6. Rate limiting

**Проблема:** ноль защиты от спама `/api/auth`, `/api/tables`, `/api/cashier/stars-invoice`. Один скрипт = заспамил Stars-инвойсы и Telegram забанит наш бот за злоупотребление API.

**Решение:** простой token bucket per IP + per user в Redis. Лимиты:
- `/api/auth` — 5/мин per IP
- `/api/cashier/stars-invoice` — 3/мин per user
- `/api/tables` (write actions) — 30/мин per user
- общий API — 120/мин per user

**Файлы:** `server/rate-limit.js` (новый), wired в `handleApi`.

---

### 1.7. Webhook replay protection

**Проблема:** `/api/telegram/webhook` принимает любой POST без проверки источника. Если URL утёк — атакующий может слать fake `successful_payment` и кредитовать chips.

**Решение:** Telegram поддерживает **secret_token** через `setWebhook?secret_token=…`. Сервер проверяет заголовок `X-Telegram-Bot-Api-Secret-Token`.

**Файлы:** `server/index.js::/api/telegram/webhook`.

---

### 1.8. Geofence (двухуровневый)

**Проблема:** клуб открыт всему миру. Регуляторные риски + операционные (валюты, KYC).

**Решение:**
- CDN-layer (Cloudflare): `cf-ipcountry` → 403 для US/UK/FR/DE/IT/ES/NL/TR/CN/KP/SY/IR/CU и т.д.
- Server-layer: тот же check на API (Cloudflare можно обойти прямым DNS, если домен утёк).
- Telegram country code из `initDataUnsafe.user.language_code` как мягкий сигнал (не блокирующий, но flag).

**Файлы:** Cloudflare worker конфиг + `server/index.js::geofence middleware`.

---

### 1.9. Daily reconciliation + alert

**Проблема:** уже есть `/api/admin` с цифрами `walletTotal`, `playerFundsTotal`, `ledgerNetTotal`, но никто не сверяет регулярно. Drift накопится тихо.

**Решение:**
- Cron каждый час: запрос к существующим методам + сверка по формуле `wallets + stacks + escrow ≈ deposits − withdrawals − rake − bonus_paid`.
- При drift > 0.5% (или > 1 000 chips абсолют) → POST в админский Telegram чат через `notifyAdmin`.
- Записывать снапшоты в новую таблицу `reconciliation_snapshots`.

**Файлы:** `server/reconciliation.js` (новый), wired в существующий `setInterval` или отдельный cron.

---

### 1.10. Wallet operations: уже хорошо, но добавить

- `category` поле уже есть ✓
- **Добавить:** `idempotency_key` колонку в `ledger_entries` с unique index, для дедупликации при retry payment webhook’а.
- **Добавить:** `reversal_of` (FK на ledger_entries.id) — для возвратов / chargebacks.
- **Добавить:** `effective_at` (для backdated entries в крайних случаях, по умолчанию = created_at).

---

## 2. Высокий приоритет — первые **30–60 дней** после запуска

### 2.1. Полноценная платёжная инфраструктура

#### 2.1.1. TON Connect для депозитов

- `tonconnect-manifest.json` на публичном HTTPS
- Frontend: TON Connect UI SDK
- Backend:
  - `POST /api/cashier/ton-order` → создаёт `payment_orders` с method=`ton`, `expectedTonAmount`, `expectedComment` (orderId), статус `pending`
  - User подписывает транзакцию на ту наш кошелёк
  - Cron каждые 30 сек: poll TON Center API → если транзакция с правильным comment’ом и amount’ом найдена → `markPaymentOrderPaid`
  - Idempotency по orderId
- Курс TON → chips зафиксирован в момент создания ордера, действует 15 мин (потом expired)

#### 2.1.2. USDT TRC20

Через провайдера (без своих private keys):
- **NowPayments** (custodial, простой webhook)
- **CryptoCloud** (RU friendly)
- **Plisio** (с лучшим API)

Поток:
- `POST /api/cashier/usdt-order` → провайдер выдаёт payment address + amount → `payment_orders` со статусом pending
- Webhook от провайдера (с подписью) → `markPaymentOrderPaid`
- Manual review для сумм >X $

#### 2.1.3. RUB через серые gateway

- **Lava.ru** (RU), **AnyPay**, **Paykassa**, **FreeKassa**
- Те же модели: invoice URL → webhook → пометка paid
- Подпись webhook’а по shared secret обязательна

#### 2.1.4. Унифицированный payment_orders state machine

```
pending → paid             (успех)
pending → expired          (TTL прошёл, не получили транзу)
pending → manual_review    (странности)
pending → failed           (провайдер вернул ошибку)
paid    → reversed         (chargeback / возврат)
```

Уже есть основа (схема в migrate() с этими статусами). Доделать API для всех каналов.

---

### 2.2. Withdrawal flow

**Статус:** базовый backend и admin queue сделаны. Public UI пока оставлен закрытым, а создание заявок защищено `WITHDRAWALS_ENABLED=true`.

**Сейчас работает:**

1. **`POST /api/cashier/withdraw`** создает `withdrawal_orders` со статусом `pending`.
2. Chips сразу уходят в hold: wallet debit `withdrawal_hold`.
3. Admin queue показывает заявки в `/admin`.
4. **Approve** переводит заявку в `approved` без повторного списания.
5. **Reject** переводит заявку в `rejected` и возвращает chips через ledger credit `withdrawal_refund`.
6. Операции идемпотентны через `x-idempotency-key`.

**Осталось до полноценного вывода:**

1. **Worker process** забирает approved/queued ордера, шлёт транзакции:
   - TON: подпись из hot wallet, broadcast в TON network
   - USDT: API провайдера (NowPayments тоже умеет выплачивать)
   - RUB: через тот же gateway, что и приём (часто двусторонне)
2. **Risk/KYC статусы**:
   - status: `pending_kyc` если игрок не верифицирован
   - status: `pending_review` если сумма > авто-лимит
   - status: `queued` для авто-выводов
3. **Manual approval rules**:
   - сумма > X chips → ручное одобрение
   - игрок с risk score > 60 → manual
   - первый вывод > 5 000 chips → KYC + manual

**Файлы:** `server/db.js`, `server/index.js`, `public/app.js`, `public/index.html`, таблица `withdrawal_orders`.

---

### 2.3. Турнирный движок (доделать)

**Сейчас:** только регистрация/отмена. **Нет** запуска матча, посадки, blind structure, выплат.

**Что нужно:**

1. **Расписание blind levels**:
   ```json
   {"level": 1, "sb": 25, "bb": 50, "ante": 0, "duration_min": 5}
   ```
   Хранится в `tournaments` (новая колонка `structure jsonb`).
2. **Старт турнира**: cron сравнивает `tournaments.startsAt` с `now()` → если registrations >= min_players → запускает.
3. **Посадка**: создаёт `tournament_tables` (виртуальные столы, аналогичные кэш), распределяет участников рандомно.
4. **Балансировка**: если стол освободился (вылеты) → перемещение игрока со «здорового» стола.
5. **Final table**: при достижении 10 (или другого числа) → консолидация на 1 стол.
6. **Payout structure**:
   ```json
   [{"place": 1, "percent": 35}, {"place": 2, "percent": 22}, ...]
   ```
   Обычно top 10–15% получают что-то.
7. **Late registration window** (первые 30 мин после старта — можно подключаться).
8. **Re-entry / Rebuy / Add-on** — продление участия за дополнительный fee.
9. **Cancel-with-refund** если < min_players к старту.
10. **Time-bank** — у каждого игрока 60 сек банка на сложные решения.

**Дополнительные форматы:**
- **Spin & Go** (3-max, лотерейный prize pool — 5x/10x/100x/1000x от buy-in)
- **Heads-up Sit & Go** (1v1, быстрый)
- **Knockout / Bounty** (часть buy-in за головы)

**Файлы:** `server/tournament-engine.js` (новый), миграции для `tournament_levels`, `tournament_tables`, `tournament_payouts`.

---

### 2.4. Bonus / Promo подсистема

**Таблицы:**

```sql
create table promos (
  id text primary key,
  type text,                       -- 'welcome' | 'reload' | 'mission' | 'freeroll_ticket' | 'rakeback' | 'leaderboard'
  config jsonb,                    -- условия выдачи и отыгрыша
  active boolean default true,
  starts_at timestamptz, expires_at timestamptz
);

create table promo_grants (
  id text primary key,
  app_user_id text references app_users,
  promo_id text references promos,
  status text,                     -- 'pending' | 'active' | 'cleared' | 'forfeited' | 'expired'
  bonus_chips bigint,
  wager_required bigint,           -- сколько rake надо сгенерить
  wager_progress bigint default 0,
  expires_at timestamptz,
  granted_at timestamptz default now(),
  cleared_at timestamptz
);

create table mission_progress (
  id text primary key,
  app_user_id text,
  mission_id text,                 -- 'daily_50_hands' | 'showdown_10' | ...
  date_key text,                   -- '2026-05-20' для daily, '2026-W21' для weekly
  progress int default 0,
  required int,
  status text,                     -- 'in_progress' | 'completed' | 'claimed'
  reward_chips bigint
);
```

**Хуки в poker-engine:**
- После каждой завершённой руки — `updateWagerProgress(seat.userId, rakePaid)`.
- После hand showdown — `updateMissionProgress(seat.userId, 'showdown_seen')`.
- При buy-in/rebuy — `applyWelcomeBonusIfEligible(user)`.

**Файлы:** `server/promo.js`, миграции выше, хуки в `poker-engine.js`.

---

### 2.5. Реферальная программа

**Таблицы:**

```sql
create table referral_codes (
  code text primary key,
  app_user_id text references app_users,
  created_at timestamptz default now(),
  is_active boolean default true,
  custom_terms jsonb               -- для VIP-партнёров (повышенный %)
);

create table referrals (
  referred_app_user_id text references app_users primary key,
  referrer_app_user_id text references app_users,
  code text references referral_codes,
  attributed_at timestamptz default now(),
  source text,                     -- 'telegram_start_param' | 'cookie' | 'manual'
  status text default 'active'     -- 'active' | 'fraud' | 'churned'
);

create table referral_earnings (
  id text primary key,
  referrer_app_user_id text references app_users,
  referred_app_user_id text references app_users,
  period_key text,                 -- '2026-05' для месячного расчёта
  source_category text,            -- 'rake' | 'tournament_fee'
  source_amount bigint,            -- сколько игрок заработал нам
  earning_amount bigint,           -- наша доля партнёру
  rate_percent int,                -- 25 | 30 | 35
  status text default 'pending',   -- 'pending' | 'paid' | 'reversed'
  paid_at timestamptz
);
```

**Логика:**
- `/api/auth`: проверяем `tg.initDataUnsafe.start_param` → если `ref_XXXX` и игрок новый → запись в `referrals`.
- Месячный cron 1-го числа: агрегация рейка по `referrals` → запись в `referral_earnings` → начисление в wallet партнёра одной транзакцией.
- Анти-фрод чек перед выплатой:
  - партнёр и реферал — разные KYC?
  - разные устройства?
  - реферал сыграл достаточно (порог) рейка?
  - между ними нет подозрительной win/loss матрицы?

**Файлы:** `server/referral.js`, миграции выше, UI в Mini App (`Профиль → Партнёрская программа`).

---

### 2.6. Анти-фрод engine

**Таблицы:**

```sql
create table user_devices (
  id text primary key,
  app_user_id text references app_users,
  fingerprint_hash text,           -- canvas+WebGL+fonts+screen
  user_agent text,
  ip_address inet,
  asn int,
  country text,
  first_seen timestamptz default now(),
  last_seen timestamptz default now()
);

create index idx_user_devices_fingerprint on user_devices(fingerprint_hash);
create index idx_user_devices_ip on user_devices(ip_address);

create table fraud_flags (
  id text primary key,
  app_user_id text,
  flag_type text,                  -- 'shared_device' | 'shared_ip' | 'pair_loss' | 'bot_timing' | 'chargeback' | ...
  severity int,                    -- 1..10
  details jsonb,
  status text default 'open',      -- 'open' | 'reviewed' | 'confirmed' | 'cleared'
  created_at timestamptz default now()
);

create table user_risk_scores (
  app_user_id text primary key,
  score int default 0,
  updated_at timestamptz default now()
);
```

**Сигналы:**
- При auth — fingerprint (через client-side library) + IP/ASN.
- Cron pair-loss matrix: ежедневный SQL по hand_histories, выявляющий «X систематически передаёт Y».
- Cron VPIP/PFR / decision-timing анализ для bot detection.
- Webhook fraud-провайдера (Sift / Maxmind minFraud, опционально).

**Risk score** обновляется по сигналам и влияет на:
- лимит выводов,
- доступ к промо,
- очередь manual review.

**Файлы:** `server/fraud.js`, `public/app.js` (fingerprint sender), миграции выше.

---

## 3. Средний приоритет — **2–4 месяца после запуска**

### 3.1. VIP / Loyalty (VPP)

- `vpp_balance (app_user_id, vpp int, tier text, last_recalc timestamptz)`
- Хук в poker-engine: после рейка → `vpp += rake_paid_by_player / 100`
- Cron еженедельно: пересчёт tier (rolling 30 дней)
- Cron еженедельно (вс): rakeback credit в wallet по tier %

### 3.2. Bad Beat Jackpot

- Таблица `bbj_pool (id, current_amount, last_payout_at)`
- При showdown с рейком → 1% от рейка → `bbj_pool.current_amount += contribution`
- Trigger чек: показ обеих карманных карт обоих финалистов, оценка hand strength, выплата по формуле (50/30/20).

### 3.3. Multi-tabling в UI

- Сейчас один стол на экран.
- Добавить: миниатюры открытых столов в нижней части (когда «свернул»).
- Уведомление «ваш ход» переключает фокус.
- Чек-бокс «Auto-fold to action» для свёрнутых столов (даёт играть много столов сразу).

### 3.4. Push-уведомления через бот

- За 5 мин до старта турнира.
- При выдаче рейкбека.
- При получении приза в leaderboard.
- При завершении withdrawal.
- При срабатывании promo.

### 3.5. Hand history replay tool

- В админке: открыть hand_id → визуализация по улицам с картами / ставками / действиями.
- Для саппорта и disputes.
- Игроку — экспорт его собственной истории в стандартный PokerStars-формат (для импорта в HM3 / PT4 — если он сам захочет анализировать).

### 3.6. Observability stack

- Структурированные логи (pino → stdout → Loki / Datadog / OpenObserve).
- Prometheus метрики на `/metrics`:
  - http_request_duration_seconds histogram
  - poker_active_tables gauge
  - poker_active_hands gauge
  - poker_hands_completed_total counter
  - poker_rake_collected_total counter
  - poker_active_sessions gauge
  - db_query_duration_seconds histogram
- Grafana дашборд + Telegram алёрты.

---

## 4. Низкий приоритет — **месяц 4+**

- **Sponsored tournaments** — структура для брендов / стримеров.
- **Leaderboards** — недельные/месячные топы по рейку, по выигранным турнирам, призы.
- **Loyalty store** — обмен VPP на гифты Telegram / мерч / билеты на live-events.
- **Chat at table** — с модерацией и ban-list.
- **Personal stats для игрока** — VPIP / PFR / BB/100, только для себя.
- **Replay / spectator** — наблюдать живой стол (карты скрыты).
- **Sound effects** — переключатель в настройках, дефолт off.
- **Reconnect-resume на разрывах сети** — клиент сохраняет state, переподключается без переавтика.
- **KYC автоматизация** через Sumsub / Veriff / Onfido webhook.

---

## 5. Архитектурные изменения (когда есть >5 000 DAU)

### 5.1. Разделение монолита

```
┌─────────────────┐    ┌──────────────────┐
│   API gateway   │←──→│ Auth + Session   │
│   (REST + SSE)  │    │ (Redis)          │
└────────┬────────┘    └──────────────────┘
         │
         ↓
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Game server    │←──→│ State store      │    │ Postgres         │
│  (table state)  │    │ (Redis cluster)  │    │ (hand histories, │
└─────────────────┘    └──────────────────┘    │  ledger, etc.)   │
         │                                      └──────────────────┘
         ↓
┌─────────────────┐    ┌──────────────────┐
│  Payment svc    │←──→│  Crypto wallets  │
│  (deposits +    │    │  (TON / USDT)    │
│   withdrawals)  │    └──────────────────┘
└─────────────────┘
         │
         ↓
┌─────────────────┐
│  Worker (cron)  │
│  - reconcile    │
│  - promo grant  │
│  - BBJ trigger  │
│  - rakeback     │
│  - fraud scan   │
└─────────────────┘
```

### 5.2. Очереди (NATS / Redis Streams / RabbitMQ)

- `withdrawals.queue` — c manual approval gate
- `payment_callbacks.queue` — retry + dedupe
- `promo_grants.queue` — anti-abuse review
- `fraud_review.queue` — manual review
- `notifications.queue` — Telegram push

### 5.3. Шифрование at rest

- KYC documents: AES-GCM с ключом в KMS / HashiCorp Vault.
- Postgres column-level encryption для PII (если регулятор требует).

### 5.4. Backup + DR

- Daily Postgres snapshot → S3 / Wasabi (encrypted).
- Point-in-time recovery 7 дней (WAL archive).
- Quarterly DR drill — поднять реплику из backup’а в изолированной среде.
- RPO 1 час, RTO 4 часа — реалистичный SLA для покер-клуба.

---

## 6. Тестирование и QA

**Текущее покрытие** (тесты `tests/*`):
- ✅ poker-engine unit (раздачи, all-in, side-pots, sit-out, рейк, history)
- ✅ poker-evaluator unit (full house, board plays)
- ✅ table-flow integration (создание стола, регистрация, турниры, админ-команды)

**Чего не хватает:**

1. **Property-based testing** для poker-engine — генерировать рандомные сценарии раздач и проверять инварианты (сумма стеков + банк = const, side-pots распределяются корректно при любой комбинации all-in’ов).
2. **Load testing**: artillery / k6 скрипт, эмулирующий 100/500/1000 одновременных игроков с реалистичной траекторией (auth → join → play → leave).
3. **Chaos testing**: random kill сервера во время раздачи → проверка восстановления (после внедрения Redis state).
4. **Payment testing**: mock-провайдеры для TON / USDT / RUB / Stars — flow с задержками, ошибками, ретраями, чарджбэками.
5. **Fraud testing**: симуляция multi-account, chip dump, bot timing — проверка, что fraud engine ловит.
6. **Visual regression** (после дизайна): Percy / Chromatic для Mini App layout.

---

## 7. CI/CD pipeline

**Сейчас:** Render auto-deploy от push в `main`.

**Нужно:**

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    - npm install
    - npm test                    # уже работает
    - npm run lint                # eslint (пока нет, добавить)
    - npm run typecheck           # JSDoc + tsc --noEmit (опционально)
    - npm audit                   # security check на deps
  build:
    - docker build
    - docker push (ghcr / dockerhub)
  deploy-staging:
    needs: [test, build]
    if: github.ref == 'refs/heads/develop'
    - deploy to staging Render
    - run smoke tests
  deploy-prod:
    needs: [test, build]
    if: github.ref == 'refs/heads/main'
    - manual approval gate
    - blue-green deploy
    - smoke tests
    - auto-rollback on fail
```

**Plus:** PR review от Capy + автоматический PR review check.

---

## 8. Документация для разработчиков и саппорта

- **`docs/ARCHITECTURE.md`** — диаграмма сервисов, поток данных.
- **`docs/RUNBOOK.md`** — что делать при инцидентах (DB down, payment provider down, hot wallet drained, suspicious chargeback wave).
- **`docs/SUPPORT_PLAYBOOK.md`** — как саппорт работает с disputes, freeze, refund.
- **`docs/API.md`** — OpenAPI / Swagger описание всех эндпойнтов.
- **`docs/FAIRNESS.md`** — как работает commit-reveal shuffle, для публикации игрокам.

---

## 9. Чек-лист до Production Launch

### Технический
- [ ] Redis для state + sessions
- [ ] SSE/WebSocket вместо polling
- [ ] Provably-fair shuffle
- [ ] Idempotency на всех денежных эндпойнтах
- [ ] Rate limiting + replay protection
- [ ] Geofence (CDN + сервер)
- [ ] Daily reconciliation cron + alert
- [ ] Hot/cold wallet split (TON + USDT)
- [ ] Withdrawal queue + manual approval
- [ ] Backup + tested restore

### Платежный
- [ ] Stars (есть ✓, добавить replay protection)
- [ ] TON Connect deposit + withdrawal
- [ ] USDT TRC20 (custodial provider)
- [ ] RUB через 1–2 серых gateway
- [ ] Унифицированный `payment_orders` state machine + reconcile cron

### Игровой
- [ ] Турнирный движок (старт, балансировка, payout)
- [ ] Sit & Go варианты (3-max, HU)
- [ ] BBJ pool + trigger
- [ ] Multi-tabling UI

### Экономика и удержание
- [ ] Welcome bonus + wagering tracker
- [ ] Daily missions
- [ ] Freeroll расписание
- [ ] VIP / VPP / Rakeback
- [ ] Referral модуль (1-tier)
- [ ] Bonus budget cap

### Безопасность и compliance
- [ ] Device fingerprint + IP tracking
- [ ] Fraud cron (pair-loss, timing, multi-acc)
- [ ] Risk score per user
- [ ] KYC integration (Sumsub / Veriff)
- [ ] Sanctions screening
- [ ] Data retention policy applied
- [ ] Privacy policy + TOS на сайте

### Ops
- [ ] Structured logging
- [ ] Metrics (Prometheus)
- [ ] Grafana дашборд + Telegram alerts
- [ ] Hand history replay tool в админке
- [ ] Support inbox / ticketing
- [ ] Incident runbook

---

## 10. Метрики готовности (можно ставить milestones)

| Milestone | Условие |
|---|---|
| **MVP с реальными деньгами** | пункты §1.1–1.10 закрыты + платежи Stars (есть) + TON deposit |
| **Soft launch** | MVP + §2.1 (платежи полные) + §2.2 (withdrawals) + §2.4 (welcome bonus + missions) |
| **Public launch** | Soft launch + §2.3 (турниры реальные) + §2.5 (referral) + §2.6 (анти-фрод) |
| **Scale-ready** | Public + §3 (VIP, BBJ, multi-tabling) + §5 (Redis cluster, разделение сервисов) |

---

## 11. Что точно НЕ нужно делать сейчас

- **Свой блокчейн / NFT-карты / собственный токен** — отвлечение, кому надо — пусть выпускают gifts через Stars.
- **Native iOS/Android app** — Mini App покрывает 95% use cases, разработка native приложений съест бюджет.
- **Live dealer / Casino games** — заявлено «исключительно покер», не разбавлять.
- **Свой PokerSolver / поверх ML** — `vendor/pokersolver` уже работает корректно (тесты подтверждают), переписывать незачем.
- **Microservices с самого начала** — монолит держится до ~5 000 DAU; разделение делать тогда, когда станет реальной болью.

---

## 12. Открытые архитектурные решения

1. **Redis vs PostgreSQL для state?** Redis быстрее, но PostgreSQL даёт persistence без отдельного слоя. Для MVP можно даже PostgreSQL + advisory locks — это в коде уже частично используется. Решение по нагрузке.
2. **SSE vs WebSocket?** SSE проще, через любой HTTP proxy, без отдельного auth flow. WebSocket даёт bi-directional, но overkill для покера, где клиент шлёт мало команд. **Рекомендация: SSE.**
3. **Один процесс или несколько Node?** До 1 000 DAU — один (Node умеет ~10k req/s на простых эндпойнтах). После — pm2 cluster или Kubernetes.
4. **Хранить хеши карт или открытый текст?** Сейчас открытый текст в hand_histories.raw. Для аудита и регулятора это правильно. Для приватности — можно зашифровать поля `cards` с ключом, который раскрывается только при dispute.
5. **Custodial wallets vs non-custodial?** Custodial проще (NowPayments) — но они держат ключи. Non-custodial (свой TON wallet) — мы держим ключи и риски. Hybrid: USDT custodial, TON self-hosted (TON прост).
