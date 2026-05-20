# QWZ Poker — экономическая модель и риск-политика

Документ описывает, как клуб **зарабатывает**, **где теряет**, **как защищается** и **сколько резервирует**. Цифры — ориентиры (бенчмарки покер-индустрии и реальные ставки Telegram Stars / крипты), модель надо пересобирать при каждом смещении курсов и нагрузки.

---

## 0. TL;DR

| Поток | Норма | Комментарий |
|---|---|---|
| Чистый рейк (после VIP/promo/affiliate) | 100% | База бизнеса |
| Affiliate (реферальная программа) | 25–35% от рейка реферала | Главный канал привлечения |
| Бонусы (welcome, missions, freerolls) | 15–25% от net rake | Маркетинговый бюджет |
| Рейкбек VIP | 10–30% (на high-VIP) | Удержание китов |
| Платёжные комиссии gateway | 2–7% от объёма депозитов | Зависит от канала |
| Telegram Stars комиссия | ~30% от Star‑суммы | Telegram забирает |
| Операционные расходы (инфра, саппорт) | $300–3000 / мес | Зависит от стадии |

**Целевая операционная маржа клуба зрелого:** 35–50% от net rake.

---

## 1. Единицы измерения и курсовая политика

### 1.1. Внутренняя валюта

Всё внутри клуба — **chips**, никаких рублей/долларов на столе. Это позволяет:

- держать UX одинаковым во всех валютах ввода-вывода;
- менять курс **без миграции данных** (только админ-настройка);
- избежать привязки к одной фиатной валюте (важно для серых каналов).

### 1.2. Текущая привязка (из `server/economy.js`)

```text
1 ₽ = 50 chips
1 ⭐ Stars = 2 ₽ = 100 chips
Min депозит: 100 ₽ = 5 000 chips
Max депозит: 5 000 ₽ = 250 000 chips
```

### 1.3. Соответствие реальным стейкам

| Блайнды в chips | BB в ₽ | Эквивалент NL (USD приблизительно) |
|---|---|---|
| 25 / 50 | 1 ₽ | NL$0.01 / $0.02 — микро |
| 50 / 100 | 2 ₽ | NL$0.02 / $0.04 — микро |
| 100 / 200 | 4 ₽ | NL$0.05 / $0.10 — low |
| 500 / 1 000 | 20 ₽ | NL$0.25 / $0.50 — low |
| 1 000 / 2 000 | 40 ₽ | NL$0.50 / $1 — small mid |
| 5 000 / 10 000 | 200 ₽ | NL$2.50 / $5 — mid |
| 25 000 / 50 000 | 1 000 ₽ | NL$10 / $25 — high |

**Рекомендация:** в коде хранить **курс как настройку в БД**, а не константу. Это позволит:
- запускать события «двойные chips за рубль выходных»;
- безопасно дробить chips если экономика поплывёт (denomination split);
- иметь A/B тесты на курсе для разных регионов.

### 1.4. Курс ввода ≠ курс вывода (опционально)

Чтобы зашить house edge в депозит:
- покупка chips: 1 ₽ = 50 chips
- продажа chips (вывод): 50 chips = 0.92 ₽ (8% спред)

В коде сейчас этого нет — есть только `feePercent` при выводе. Это **математически эквивалентно**, но психологически разные модели. Рекомендую оставить «явная комиссия + фикс-курс» — игроки понимают честнее.

---

## 2. Источники дохода

### 2.1. Рейк в кэш-играх

**Текущая формула** (`calculateRake`):
```
rake = min(floor(pot × 0.05), bigBlind × 3)
if (cards_on_board < 3) → 0      // no-flop-no-drop
```

**Рекомендуемые улучшения:**

1. **Weighted Contributed Rake (WCR).** Сейчас рейк забирается из общего пота — игрок, который только заплатил блайнд и фолднул, рейк не платит (хорошо), но при шоудауне в side-pot’ах рейк распределяется неравномерно. WCR делит рейк пропорционально вкладу в пот:
   ```
   player_rake_share = (player_total_bet / pot) × total_rake
   ```
   Это **отраслевой стандарт** (PokerStars, GG, WPN). Влияет только на расчёт `playerRakePaid` для VPP/рейкбека — на саму сумму, идущую клубу, не влияет. Но даёт честный учёт для VIP.

2. **Разные кэпы по стейкам:**
   | Стейк | Rake % | Cap (BB) |
   |---|---|---|
   | Micro (25/50, 50/100) | 5% | 3 BB |
   | Low (100/200, 500/1000) | 5% | 2.5 BB |
   | Mid (1k/2k, 5k/10k) | 4% | 2 BB |
   | High (25k/50k+) | 2.5% | 1.5 BB |

   Логика: high-rollers платят меньше %, потому что они «возвращают» больше через рейкбек и им нужна конкурентоспособная экономика, иначе уйдут на PokerStars / GG.

3. **HU-tax.** Heads-up столы традиционно облагаются по тому же кэпу, что и full-ring, но **рекомендуется снизить до 2 BB cap** — HU генерит много мелких потов, иначе игроки не могут «выжить» против рейка.

4. **Ante-driven rake (опционально).** В турнирах ante накапливается в пот и рейкуется. В кэше можно ввести небольшой ante на flop/turn/river для увеличения action — но рейкуется только основная часть.

**Прогноз рейка** (бенчмарк микро NL2-NL10):

| Стейк | Среднее рейка на 100 рук на игрока | При 4 столах, 2 ч/день, 30 дн |
|---|---|---|
| 25 / 50 | ~3 BB = 150 chips | 18 000 рук × 1.5 chips/рука = ~27 000 chips/мес ≈ **540 ₽/игрок/мес** |
| 100 / 200 | ~2.5 BB = 500 chips | ~90 000 chips/мес ≈ **1 800 ₽/игрок/мес** |
| 1 000 / 2 000 | ~2 BB = 4 000 chips | ~720 000 chips/мес ≈ **14 400 ₽/игрок/мес** |

### 2.2. Турнирный fee (entry fee, juice)

**Структура buy-in : fee** — индустриальный стандарт:

| Сегмент | Buy-in | Fee | % |
|---|---|---|---|
| Micro freeroll | 0 | 0 | promo |
| Low MTT | 1 000 | 100 | 10% |
| Mid MTT | 10 000 | 700 | 7% |
| High MTT | 50 000 | 2 500 | 5% |
| High-roller | 250 000+ | 7 500 | 3% |
| Spin & Go | dynamic | 7% | лотерея prize pool |
| Сателлит на главное событие | 1 000 | 200 | 20% (потому что приз = ивент на 50k+) |

**Re-entry / rebuy / add-on** — fee на каждом действии. Это часто **главный источник турнирной прибыли**, потому что слабые игроки чаще re-entry.

**Bounty / Knockout** — половина buy-in идёт в bounty за головы, fee рассчитывается отдельно (5–10% от total cost).

### 2.3. Спред / комиссии на депозите

| Канал | Fee для игрока | Реальная себестоимость | Маржа клуба |
|---|---|---|---|
| Telegram Stars | 0% | ~30% (Telegram комиссия) | **отрицательная**, но «бесплатный» онбординг |
| TON через TON Connect | 0% | ~$0.05 сетевой fee | ~0%, можем взять 1–2% спред на курсе |
| USDT TRC20 (NowPayments / CryptoCloud) | 0–1% | 0.5–1% gateway + $1 сеть | ~0% |
| RUB через серые (Lava, AnyPay) | 0% | 2–4% gateway | ~0%, можно зашить 2% спред в курсе |

**Рекомендация:**
- Stars позиционировать как «удобный, моментальный», но **дороже** для серьёзных депозитов (мелкие пакеты).
- Крипту и серый RUB — как «выгодный для крупных депозитов» (бонус +5–10% chips при депозите от X ₽).
- Это направляет крупных игроков в каналы с лучшей юнит-экономикой.

### 2.4. Комиссии при выводе

**Текущие** (`economy.js`):
```text
Stars / Gifts: 8%
TON:           5% + сетевой fee
USDT:          5% + сетевой fee
RUB:           10%
Min withdrawal: 50 000 chips = 1 000 ₽
```

**Рекомендуемое:**

| Канал | Комиссия | Min | Скорость | Limit/сутки |
|---|---|---|---|---|
| TON | 3% + ~0.1 TON сеть | 25 000 chips (500 ₽) | до 1 ч (manual approval >5k ₽) | 500k chips |
| USDT TRC20 | 4% + 1 USDT сеть | 50 000 chips | до 24 ч | 1M chips |
| RUB (карта/СБП) | 7–10% | 100 000 chips | 1–48 ч | 250k chips |
| Stars Gifts | 12% | 25 000 chips | до 24 ч | 100k chips |

**Лимиты — критично.** Без них клуб ликвидится при первом крупном выводе.

### 2.5. Дополнительные доходы

- **Dormant account fee** — при неактивности >180 дней сжигать X% баланса в месяц. **Не рекомендуется**: репутационный риск, проще без него.
- **Sponsored tournaments** — партнёрские бренды платят за брендированный турнир. Доход появится после набора массы.
- **Tipping / голосовые** — donations авторам контента / стримерам внутри клуба. Микро-feature, но клей сообщества.

---

## 3. Структура расходов

### 3.1. Variable costs (P&L против выручки)

| Статья | % от выручки | Примечание |
|---|---|---|
| Telegram Stars комиссия | ~30% от Stars-депозитов | Платит Telegram-инфра |
| Платёжные gateway | 2–7% от объёма депозитов | По каналам |
| Сетевые fee крипты | $0.05–$1 за транзакцию | Микро для TON, средний для USDT |
| Affiliate / Referral | 25–35% от рейка реферала | Lifetime или 12 мес |
| Bonus / Promo | 15–25% от net rake | Маркетинговый бюджет |
| VIP / Rakeback | 10–30% от рейка top-сегмента | Удержание |
| Chargeback / возвраты | <1% (только для card) | Серые pas it on |

### 3.2. Fixed costs (инфра + ops)

| Стадия | Серверы | DB | Anti-fraud | Поддержка | Итого/мес |
|---|---|---|---|---|---|
| Старт (0–500 DAU) | $100 | $50 | $0 (manual) | self / 1 part-time | ~$200–500 |
| Рост (500–5 000 DAU) | $300 | $150 | $300 | 1 FTE | ~$1 500–3 000 |
| Зрелый (>5 000 DAU) | $1 000+ | $500+ | $1 000+ | 3–5 FTE + 24/7 | $8 000–20 000 |

### 3.3. Реинвестиции

| Категория | % net rake | Цель |
|---|---|---|
| Marketing reserve | 25% | Кампании, freerolls, leaderboards |
| Risk reserve | 10% | Chargebacks, форс-мажор, баг-баунти |
| R&D | 10% | Новые фичи, поддержка |
| Распределяемая прибыль | 55% | После всех вычетов |

---

## 4. Cash flow, ликвидность и резервы

### 4.1. Главная инварианта

```
ASSETS_LIQUID ≥ LIABILITIES_TO_PLAYERS + BUFFER

LIABILITIES = Σ wallets + Σ table_stacks + Σ saved_stacks
            + Σ tournament_escrow + Σ pending_bonus_grants
ASSETS_LIQUID = TON_hot + USDT_hot + RUB_bank + RUB_payable_receivable
BUFFER = 0.20 × LIABILITIES   (20% операционная подушка)
```

**Кассовый разрыв** возникает, когда `ASSETS_LIQUID < LIABILITIES`. Защита — ниже.

### 4.2. Hot / cold wallet split

Цель: **минимизировать «горячий» капитал** при сохранении SLA по выводам.

| Кошелёк | Назначение | Сумма |
|---|---|---|
| Hot TON | автовыводы до 5k ₽ | 7–14 дней среднего volume выводов |
| Hot USDT | автовыводы до 5k ₽ | 7–14 дней |
| Warm | manual-approval выводы | 30 дней volume |
| Cold (multisig / hardware) | долгосрочный резерв | остаток до 100% LIABILITIES |
| RUB bank account | RUB выводы / приёмка от gateway | покрытие 7 дней |

Восполнение cold→warm и warm→hot **по графику**, не по событиям (анти-фрод-сигнал для атакующих).

### 4.3. Daily reconciliation

Каждые 1 час и в конце дня:

```sql
-- псевдо-SQL
SELECT
  (SELECT sum(balance) FROM wallets) AS wallet_total,
  (SELECT sum(stack) FROM saved_stacks) AS saved_total,
  (SELECT sum(amount) FROM ledger_entries WHERE type='credit'
     AND category IN ('deposit_stars','deposit_ton','deposit_usdt','deposit_rub')) AS total_deposits,
  (SELECT sum(amount) FROM ledger_entries WHERE type='debit'
     AND category IN ('withdraw_ton','withdraw_usdt','withdraw_rub','withdraw_stars')) AS total_withdrawals,
  (SELECT sum(rake) FROM hand_histories) AS total_rake_collected,
  (SELECT sum(amount) FROM ledger_entries WHERE category LIKE 'bonus_%') AS total_bonus_paid;
```

Сверка:
```
total_deposits − total_withdrawals − total_rake_collected − total_bonus_paid + adjustments
  ≈ wallet_total + table_stack_total + saved_total + tournament_escrow_total
```

При drift > 0.5% → Telegram-alert в админ-чат. Сейчас в коде уже есть `playerFundsTotal` и `ledgerNetTotal` в `/api/admin` — нужно поверх запустить **periodic check + alert**.

### 4.4. Резервный фонд (Risk reserve)

10% от месячного net rake откладывается в отдельный кошелёк. Используется только при:
- chargeback-волне,
- баге, который привёл к выплате игрокам,
- регуляторных проблемах,
- bug bounty.

Если за квартал не использован — половина возвращается в распределяемую прибыль, половина остаётся.

---

## 5. P&L по сценариям

Все цифры — **месячные**, в ₽.

### 5.1. Сценарий A — старт (месяц 1–3)

**Допущения:**
- DAU = 100, MAU = 600, retention D30 = 15%.
- Стейки только 25/50, 50/100.
- Средний депозит = 500 ₽, частота = 2/мес = 1 000 ₽/MAU.
- Средняя игра: 1.5 часа/день, 3 стола.

**Доходы:**
| Статья | Сумма |
|---|---|
| Рейк кэш (100 DAU × 1.5 BB / 100 рук × 240 рук/час × 1.5 ч × 30 дн × 1 ₽) | ~16 200 ₽ |
| Турнирный fee (100 игр × 30 дн × 30% участвуют × 50 ₽ ср. fee) | ~4 500 ₽ |
| Спред курса (на крипте/RUB, 1% от 30% депозитов) | ~180 ₽ |
| **Итого выручка** | **~20 880 ₽** |

**Расходы:**
| Статья | Сумма |
|---|---|
| Affiliate (30% рейка с 20% игроков, пришедших по реферал.) | ~970 ₽ |
| Welcome bonus + freerolls (20% net rake) | ~4 100 ₽ |
| Telegram Stars комиссия (30% × 50% депозитов в Stars × 30 000 ₽) | ~4 500 ₽ |
| Платёжные gateway (5% от 30 000 ₽) | ~1 500 ₽ |
| Инфра + tooling | ~25 000 ₽ |
| **Итого расходы** | **~36 070 ₽** |

**Net: −15 190 ₽/мес.** Старт планово убыточный. Цель — выйти в 0 за 4–6 месяцев.

### 5.2. Сценарий B — рост (месяц 6–12)

**Допущения:**
- DAU = 1 000, MAU = 6 000.
- Добавлены стейки до 1 000/2 000.
- 70% DAU — micro, 25% — low, 5% — mid.
- Средний депозит = 800 ₽, частота = 2.5/мес.

**Доходы:**
| Статья | Сумма |
|---|---|
| Рейк micro (700 × 540 ₽) | 378 000 ₽ |
| Рейк low (250 × 1 800 ₽) | 450 000 ₽ |
| Рейк mid (50 × 14 400 ₽) | 720 000 ₽ |
| Турнирный fee (~12% от кэш-рейка) | ~180 000 ₽ |
| Спред на крипте/RUB (1.5% от 6 000 × 2 000 ₽) | ~180 000 ₽ |
| **Итого выручка** | **~1 908 000 ₽** |

**Расходы:**
| Статья | Сумма |
|---|---|
| Affiliate (30% × 40% игроков по рефералу × 1 728 000) | ~207 000 ₽ |
| VIP rakeback (20% × top-30% игроков, ~30% рейка) | ~155 000 ₽ |
| Bonus / Promo (20% net rake) | ~272 000 ₽ |
| BBJ pool (1% net rake) | ~17 000 ₽ |
| Telegram Stars комиссия | ~120 000 ₽ |
| Gateway fees | ~90 000 ₽ |
| Инфра + 1 FTE + tooling | ~250 000 ₽ |
| **Итого расходы** | **~1 111 000 ₽** |

**Net: +797 000 ₽/мес.** Маржа ~42%.

### 5.3. Сценарий C — зрелый клуб (год 2)

**Допущения:**
- DAU = 5 000, MAU = 30 000.
- Все стейки до high.
- Введён регулярный турнирный календарь, BBJ работает, VIP активен.

**Net ожидаемый:** 8–14 млн ₽/мес, маржа 35–45%.

При этом нужно **резервировать 100% liabilities** + buffer, то есть на счетах должно быть в среднем **3–5 месячных net** просто как float.

---

## 6. Реферальная программа

### 6.1. Базовая модель — Revenue Share

| Уровень партнёра | % net rake реферала | Срок | Sub-affiliate |
|---|---|---|---|
| Junior (0–10 active) | 25% | 12 мес | — |
| Senior (10–50 active) | 30% | 12 мес | 3% |
| Elite (50+ active) | 35% | lifetime | 5% |
| Stream / VIP partner | до 45% | individual | 5–7% |

**Net rake реферала** = его рейк – его рейкбек – промо, начисленные конкретно ему.

### 6.2. CPA (альтернатива RevShare)

Опция выбора при подключении партнёрки:
- $20 / 1 500 ₽ за валидного игрока (FTD ≥ 500 ₽ + ≥ 100 ₽ сыгранного рейка),
- $50 / 4 000 ₽ за VIP (FTD ≥ 5 000 ₽ + ≥ 500 ₽ сыгранного рейка).

CPA — для трафик-команд, RevShare — для стримеров и инфлюенсеров. Хайбрид (CPA + 10% RevShare) — для крупных партнёров.

### 6.3. Tracking / атрибуция

- Партнёрский код вшивается в start-параметр Telegram-бота: `t.me/qwzpokerbot?start=ref_abcd1234`.
- При первом auth → `referrals` table: `referrer_id, referred_app_user_id, code, created_at, source`.
- Дальше — все ledger-entry с categories `rake_paid`/`tournament_fee` помечаются `referred=true` и попадают в monthly settlement.
- Cookie / fingerprint backup на случай, если start-param потерян (для веб-входа в Mini App из browser).

### 6.4. Анти-абуз

| Атака | Защита |
|---|---|
| Self-referral (свой второй акк) | KYC на оба + device fingerprint + IP check + behavioral analysis |
| Bonus farming реферала (зашёл, забрал welcome, ушёл) | Партнёр получает % **только с реально сыгранного рейка**, не с депозита |
| Fake clicks без regs | RevShare — only on real rake, CPA — только после порога |
| Чёрный круг (A→B→C→A) | Граф взаимных рефералов сканируется ежедневно |
| Дамп фишек реферал → партнёр | Win/loss матрица: партнёр vs реферал, флаг при дисбалансе |

### 6.5. Дашборд партнёра (внутри Mini App)

- Live: кол-во рефералов, FTD, сегодняшний / месячный рейк.
- Воронка: clicks → reg → FTD → active → VIP.
- История выплат.
- Личный код + быстрая ссылка-инвайт.
- Маркетинговые материалы (баннеры, тексты для постов).

### 6.6. Выплаты

- Раз в месяц (1-е число).
- Минимум: 1 000 chips (~20 ₽).
- Прямо на wallet — игрок может играть с этих средств или вывести.
- При выводе через RUB/крипту — обычные комиссии.
- Партнёру виден pending balance в реальном времени.

---

## 7. Бонусная программа

Все бонусы — отдельная сущность `promo_grants` в БД. Никаких прямых credit в wallet без записи о промо-источнике. Цели:
1. **Удержание** (D7, D30 retention).
2. **Реактивация** (D45+).
3. **Маркетинг** (новые регистрации).

### 7.1. Welcome bonus

- **Что:** 100% match на первый депозит, до 5 000 chips bonus.
- **Срок:** 30 дней на отыгрыш.
- **Условие отыгрыша:** заплатить рейк = bonus_amount × 1.0 (т.е. отыграл 5 000 chips рейка = разблокировал 5 000 chips бонуса).
- **Списание:** каждый сыгранный chip рейка освобождает 1 chip bonus → перетекает в реальный wallet.
- **Бонус сначала «pending»**, в wallet не виден, но виден в профиле «Активный бонус».
- **Анти-абуз:** KYC обязателен перед выводом любой части бонуса; один welcome на устройство/IP/Telegram ID.

### 7.2. Reload bonus

- 50% на 2-й и 3-й депозит, до 2 500 chips каждый.
- Wagering такой же.
- Активирован промокодом из e-mail/Telegram бота, не автоматом (защита от абуза).

### 7.3. Daily / weekly missions

| Миссия | Награда | Цель |
|---|---|---|
| Сыграй 50 рук сегодня | 200 chips | Базовый daily engagement |
| Дойди до showdown 10 раз | 300 chips | Поощрение call/non-fold (анти-bumhunt) |
| Сыграй на 2+ столах одновременно | 500 chips | Multi-tabling |
| Зарегистрируйся в 3 турнирах за неделю | 1 000 chips | Tournament adoption |
| Заработай 100 chips VPP за неделю | 500 chips | Раскрутка VIP-системы |

Все награды — мгновенный credit в wallet без wagering. Бюджет — 5–10% net rake.

### 7.4. Freeroll-турниры

- Ежедневный микро-freeroll (prize pool 5 000 chips = 100 ₽) — engagement.
- Еженедельный (prize pool 50 000 chips = 1 000 ₽) — для активных D7+.
- Месячный «major» (prize pool 500 000 chips = 10 000 ₽) — для всех с депозитом ≥ 500 ₽.
- Стоимость = призовой фонд + турнирная нагрузка (минимальная).

### 7.5. Bad Beat Jackpot (BBJ)

**Прогрессивный пул**, который растёт с каждой раздачей.

- **Контрибуция:** 1% от рейка (только flop+ с шоудауном) идёт в `bbj_pool` вместо клуба.
- **Триггер:** проигравший имеет ≥ **AAAA или каре дам** и проигрывает стрит-флешу или старшему каре.
- **Условие:** обе руки должны использовать обе карманные карты.
- **Распределение:**
  - 50% — проигравший («bad beat hero»),
  - 30% — победитель руки,
  - 20% — остальные за столом, кто получил карты в этой раздаче.
- **Seed после выплаты:** базовый seed 1 000 chips, чтобы пул не падал в 0.
- **Маркетинг-эффект:** на главной можно показывать «BBJ сейчас: 250 000 chips» — это сильный engagement-крючок.

### 7.6. VIP / Loyalty (VPP — VIP Player Points)

**Начисление:**
```
1 VPP = за каждые 100 chips сыгранного рейка (WCR, не gross pot)
```

**Уровни и рейкбек:**

| Уровень | VPP за 30 дней | Месячный рейкбек | Прочие плюшки |
|---|---|---|---|
| Bronze | 0–1 000 | 5% | — |
| Silver | 1 000–5 000 | 10% | Доступ к VIP-фриролам |
| Gold | 5 000–20 000 | 15% | Раздача карт без задержки + ускоренные выводы |
| Platinum | 20 000–100 000 | 22% | Personal manager в Telegram |
| Diamond | 100 000+ | 30% | Спецтурниры, мерч, обмен VPP на гифты Telegram |

**Рейкбек кредитуется** еженедельно в воскресенье. **VPP** сгорают по правилу «use it or lose it» — уровень пересчитывается за rolling 30 days.

### 7.7. Bonus budget cap

Жёсткое правило: **сумма всех активных promo_grants ≤ 25% от LTM net rake.**

Если budget исчерпан в этом месяце:
- daily missions работают,
- welcome/reload bonus работает,
- но freerolls и leaderboard-призы автоматически приостанавливаются до следующего месяца.

Это **аппаратный предохранитель против банкрот-маркетинга**.

---

## 8. Анти-абуз / фрод-матрица

### 8.1. Векторы и митигации

| Вектор | Серьёзность | Митигация (технический + операционный слой) |
|---|---|---|
| **Multi-accounting** (один игрок, несколько аккаунтов) | Critical | Device fingerprint (canvas + WebGL + fonts + audio); IP + ASN; Telegram ID; behavioral entropy; KYC по достижении выводного порога |
| **Chip dumping** (намеренный слив другу) | Critical | Win/loss pair-matrix; daily flag job; если игрок A систематически теряет фишки игроку B → manual review |
| **Bot play** | High | Timing analysis (стандартное отклонение времени принятия решения), perfect-play index, CAPTCHA на подозрительных, поведенческие признаки (отсутствие human errors) |
| **Welcome bonus abuse** | Medium | KYC до клира; один welcome на устройство + IP + Telegram ID; wagering обязателен |
| **Self-referral** | Medium | KYC обоих; разные адреса/документы; разное устройство |
| **Deposit → instant withdrawal** (через нас отмывать) | Critical | Минимум рейк = X chips или X % депозита перед выводом; velocity check; flag depositor с быстрым withdrawal-request |
| **Chargeback fraud** | High | Card-каналы — только KYC-проверенные; крипта/Stars — non-chargeable; серые RUB pas-the-risk-on |
| **Collusion в турнирах** | High | Hand history-сканер: soft play (мало raise vs известного), chip dumping in tournament, late-stage scrutiny |
| **Bumhunting / seat selection** | Low | Random seat assignment, anti-HUD (не показываем статы оппонента) |
| **Geo-блок обход** | High | Cloudflare geofence + IP check + Telegram-аккаунт fingerprint; блок известных VPN-подсетей |
| **DDoS / spam-регистрация** | Medium | Rate limit по IP, тарификация Telegram-аккаунтов по дате создания |
| **Promo arbitrage** | Medium | Wagering обязателен; budget cap; whitelist игр для зачёта |

### 8.2. Risk score per user

Каждый игрок имеет **score 0–100**, рассчитанный из:
- KYC статус (0 KYC = +20)
- Возраст Telegram аккаунта (<30 дней = +15)
- Количество устройств за последний месяц (>3 = +10)
- IP shared с другим аккаунтом (= +25)
- Hand history аномалии (= variable)
- Manual flags от саппорта (= variable)

| Score | Действия |
|---|---|
| 0–29 | green — обычные лимиты |
| 30–59 | yellow — увеличенный delay на withdrawal, наблюдение |
| 60–84 | orange — manual review на каждом withdrawal, лимит выводов 1/неделя |
| 85–100 | red — заморозка до решения саппорта |

### 8.3. Hand history анализ

- **Раз в день**: cron-job сканирует hand_histories за 24 ч.
- **Метрики**:
  - VPIP / PFR / 3-Bet каждого игрока — для bot-detection
  - Pair-loss matrix (игрок A vs игрок B: сколько A слил B и наоборот)
  - Average decision time + std dev (бот = низкая std dev)
  - All-in pre-flop ratio (chip dumping = high)
- **Аномалии → flag → admin review queue.**

### 8.4. Manual review queue в админке

Сейчас админка показывает события, баланс, выплаты. Нужно добавить:
- **Flag queue**: список flagged users + причины + last action.
- **Decision**: confirm-fraud / clear / request KYC / freeze.
- **Audit trail**: каждое действие пишется в `admin_events` (уже частично есть).

---

## 9. Compliance, юрисдикции, KYC/AML

### 9.1. Юридическая обёртка (вне технического scope)

- Юрлицо: оффшор (Curaçao, Anjouan, Costa Rica, Comoros) с лицензией iGaming или без (зависит от риск-аппетита).
- Terms of Use на сайте — обязательны.
- Disclaimers «play money»: пока баланс — это **chips**, а курс — переменная админки, **можно** позиционировать как «развлечение», но **с реальным выводом — это уже азартная игра**, и нужна оформленная структура.

### 9.2. Геофенс

| Страна / регион | Статус |
|---|---|
| RU / BY / KZ / UA / AM / GE | разрешено (целевая аудитория) |
| US / UK / FR / DE / IT / ES / NL / TR | блок |
| CN / KP / SY / IR / CU | блок (санкции / законодательство) |
| Остальные | разрешено по умолчанию |

Реализация:
- Cloudflare worker — первичный geo-блок по IP.
- На бэке — IP check + Telegram-устройство check (язык, country code из устройства).
- При вызове API — header `cf-ipcountry` → 403 для блок-регионов.

### 9.3. KYC tiers

| Tier | Условие | Что собираем | Лимит вывода |
|---|---|---|---|
| 0 | стартовый | Telegram ID + email опционально | 5 000 chips lifetime (~100 ₽) |
| 1 | депозит ≥ 5 000 ₽ за всё время | Selfie + фото документа (паспорт/ID) | 250 000 chips / 30 дней (~5 000 ₽) |
| 2 | депозит ≥ 50 000 ₽ или вывод запрошен >50 000 chips | + Proof of address (счёт-выписка, не старше 3 мес) + source of funds (для криптонома — wallet history) | Без лимита, но manual approval на каждый > 100 000 chips |

KYC верификация — внешним сервисом (Sumsub / Veriff / Onfido). Webhook от провайдера → `kyc_status` обновляется.

### 9.4. AML

- **Sanctions screening** (OFAC, EU, UK) при KYC tier 1+. Один из провайдеров — ComplyAdvantage / Sumsub built-in.
- **Suspicious activity reports** (SAR) при:
  - депозит >X ₽ + быстрый withdrawal без значимого play,
  - множество мелких депозитов «structuring»,
  - депозит из санкционного wallet (TON / USDT addresses можно скриншотить через Chainalysis / Crystal).
- SAR в логе → manual review → решение о freeze / report.

### 9.5. Data retention

- **Hand histories**: 7 лет (отраслевая норма для dispute / regulator).
- **KYC documents**: encrypted at rest, retention 5 лет после последней транзакции (GDPR-стиль).
- **Ledger entries**: forever (immutable).
- **Sessions**: 30 дней inactive → удаление.
- **Логи**: 90 дней hot, 1 год cold.

---

## 10. KPI и метрики мониторинга

### 10.1. Бизнес-KPI (ежедневно / еженедельно)

| Метрика | Цель (зрелый клуб) | Расчёт |
|---|---|---|
| **DAU** | растёт | uniq logged-in users / day |
| **MAU / DAU** | >5 | engagement health |
| **D1 retention** | >40% | вернулся на следующий день |
| **D7 retention** | >25% | сильный сигнал product-market fit |
| **D30 retention** | >10% | LTV-предиктор |
| **ARPDAU (рейк)** | $0.30–$2 | net rake / DAU |
| **ARPPU** | $5–$30 | net rake / paying users |
| **Deposit / Withdrawal ratio** | 1.3–1.7 | здоровая экономика |
| **Bonus cost / Net rake** | <25% | budget control |
| **Affiliate cost / Net rake** | <35% | acquisition control |
| **Avg session length** | 30–90 мин | engagement |
| **Hands / player / day** | 200–1 000 | activity |

### 10.2. Технические метрики (real-time)

| Метрика | SLO |
|---|---|
| API p99 latency | <250 мс |
| WebSocket connect time | <500 мс |
| Hand state update push delay | <100 мс |
| DB query p95 | <50 мс |
| Active hands (concurrent) | metric |
| Active tables | metric |
| Memory / Heap | <80% |
| Uptime / mes | 99.9%+ |

### 10.3. Финансовые мониторинговые алерты

- **Drift > 0.5%** между ledger и wallet+stacks → Telegram alert.
- **Withdrawal queue > 24 ч** → alert.
- **Hot wallet < 3-дневной нормы** → ops alert.
- **Daily net rake −20% к WoW среднему** → product alert.
- **DAU −15% к WoW среднему** → marketing alert.

---

## 11. Roadmap внедрения экономических механик

### Phase 1 — пред-запуск (1–2 месяца)

- [ ] Weighted Contributed Rake (учёт `playerRakePaid` в hand_histories.seats)
- [ ] Welcome bonus + wagering tracker (новая таблица `promo_grants` + cron-сверка)
- [ ] Referral модуль (1 уровень) — `referral_codes`, `referrals`, start-param атрибуция
- [ ] Daily reconciliation cron + Telegram alert при drift
- [ ] Курс chips↔fiat вынести в БД (admin-настройка)

### Phase 2 — первые 3 месяца после запуска

- [ ] VIP / VPP / Rakeback (4 уровня, недельный credit)
- [ ] Daily missions (5 базовых)
- [ ] Freerolls — расписание турниров с prize pool из marketing бюджета
- [ ] Bonus budget cap (admin-управление + cron-stop при превышении)
- [ ] Risk score per user — поля + базовые сигналы (KYC, IP shared, device count)

### Phase 3 — 3–6 месяцев после запуска

- [ ] Bad Beat Jackpot pool + триггер + распределение
- [ ] Sub-affiliate (2-tier реферальная)
- [ ] Hand history fraud cron (pair-loss matrix, timing, VPIP/PFR)
- [ ] Sponsored tournaments — структура для брендов
- [ ] CPA-партнёрская опция (альтернатива RevShare)

### Phase 4 — 6–12 месяцев

- [ ] Leaderboard-системы (weekly, monthly)
- [ ] Loyalty store (обмен VPP на гифты / мерч)
- [ ] Heads-up / Spin&Go форматы
- [ ] Personal manager для Diamond VIP
- [ ] Multi-currency wallets (раздельно TON/USDT/RUB для отчётности)

---

## 12. Принципы (не нарушать)

1. **Никакого прямого `setWallet()` в обход ledger.** Всё через `addWalletEntry` с категорией. Сейчас это уже соблюдается — нужно сохранить.
2. **Идемпотентность на всех денежных операциях**, не только на admin-adjust. `requestId` для buy-in, rebuy, tournament-register, bonus-grant, withdrawal-request, deposit-credit.
3. **Hot wallet = время отклика, cold wallet = ликвидность.** Никогда не держать >14 дней volume в hot.
4. **Reconciliation первого ранга** — `wallets_sum + stacks_sum + escrow_sum` сверяется с леджером **каждый час**. При drift >0.5% — алёрт, не silent fix.
5. **Резерв 100% обязательств** в ликвидной форме — закон. Если float падает ниже — paused withdrawals, fundraise или конец игры.
6. **Wagering — единственная защита от bonus arbitrage.** Без него welcome bonus = прямой убыток.
7. **Bonus budget cap** — month-to-month, hard stop. Никогда не превышать запланированный % net rake.
8. **KYC обязателен до значимых выводов.** До 5 000 chips — без KYC, чтобы не отпугнуть. После — обязательно.
9. **Геофенс — на двух уровнях** (CDN + сервер). CDN-only недостаточно (можно обойти прямым домен-IP).
10. **Hand histories — священны.** 7 лет хранения, без удалений, immutable, для disputes и регулятора.

---

## 13. Открытые вопросы (требуют решения собственника)

1. **Юрлицо и лицензия.** Curaçao с лицензией — даёт payment provider open access, но дорого ($30k+ запуск). Без лицензии — серая зона, payment-проблемы.
2. **Налоговая модель для игроков.** В РФ выигрыши формально облагаются НДФЛ. Клуб **не выдаёт** справки по умолчанию — это on the player. Прописать в TOS.
3. **Чарджбэк-страхование** для card-каналов — нужен ли (3–5% от volume)? Решает по доступным RUB-gateway.
4. **Резерв 100% или 80%.** 80% = больше прибыли крутится, но кассовый разрыв при пике выводов. Рекомендую 100% старт, потом аккуратно понизить.
5. **Welcome bonus агрессивность.** 100% match — стандарт. 200% даёт WoM, но повышает abuse. 50% — безопасно, но менее конкурентно.
6. **Min withdrawal** 1 000 ₽ vs 500 ₽. 1 000 — меньше нагрузка на ops, но отпугивает small fish. 500 — больше операций.
7. **TON или USDT — приоритет для крупных депозитов.** TON дешевле в сети, but USDT привычнее криптонам.

Каждый из этих вопросов — отдельное обсуждение с цифрами после первых 30 дней реальной операции.
