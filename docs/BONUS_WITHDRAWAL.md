# QWZ Poker — Бонусы и Вывод средств

Последнее обновление: 2026-06-17

---

## 1. Модель балансов

Кошелёк игрока (`wallets`) содержит три независимых бакета:

| Поле | Описание | Выводимо |
|---|---|---|
| `cash_usdt_micros` | Реальный USDT баланс | ✅ Да |
| `bonus_usdt_micros` | Бонус на отыгрыш | ❌ Нет (до разблокировки) |
| `locked_usdt_micros` | Заблокировано на время вывода или ревью | ❌ Нет |

Правило: `cash + bonus + locked` никогда не превышает сумму всех внесённых депозитов за вычетом выводов и проигрышей. Каждое движение между бакетами — отдельная запись в `ledger_entries`.

---

## 2. Приветственный бонус (Welcome Bonus)

### 2.1 Условия начисления

- Триггер: **первый успешный депозит** (один раз на аккаунт навсегда)
- Размер: **25% от суммы первого депозита**
- Кап: **максимум $50 бонуса** (депозит $300 → бонус $50, не $75)
- Вагеринг: нужно заплатить **рейк в размере 6× суммы бонуса**
- Срок: **30 дней** с момента начисления, после — сгорает

### 2.2 Примеры

| Депозит | Бонус | Рейк для разблокировки | Доход клуба |
|---|---|---|---|
| $10 | $2.50 | $15.00 | $12.50 |
| $20 | $5.00 | $30.00 | $25.00 |
| $50 | $12.50 | $75.00 | $62.50 |
| $100 | $25.00 | $150.00 | $125.00 |
| $200+ | $50.00 (кап) | $300.00 | $250.00 |

### 2.3 Запись в базе (bonus_grants)

```sql
INSERT INTO bonus_grants (
  app_user_id,
  bonus_type,             -- 'welcome'
  bonus_amount_micros,    -- deposit × 0.25 × 1_000_000 (не более 50 × 1_000_000)
  wagering_required_micros, -- bonus_amount_micros × 6
  wagering_paid_micros,   -- 0 при создании, растёт по мере игры
  expires_at,             -- now() + 30 days
  status                  -- 'active'
)
```

### 2.4 Флоу начисления

```
1. Депозит успешно завершён (completePaymentOrder)
2. Проверка: payment_orders WHERE app_user_id = ? AND status = 'paid' COUNT = 0
   → если 0 (это первый) → начислить бонус
3. Вычислить bonus_amount = MIN(deposit × 0.25, 50)
4. INSERT bonus_grants (статус 'active')
5. UPDATE wallets SET bonus_usdt_micros += bonus_amount
6. INSERT ledger_entries (тип 'bonus_credit', источник bonus_grant_id)
7. Уведомление игроку: «Вам начислен бонус $X — сыграйте $Y рейка за 30 дней»
```

### 2.5 Прогресс вагеринга

При каждой выплате рейка (`rake_collected` событие):

```
UPDATE bonus_grants
SET wagering_paid_micros = wagering_paid_micros + rake_amount_micros
WHERE app_user_id = ?
  AND status = 'active'
  AND expires_at > now()

-- Проверка разблокировки:
IF wagering_paid_micros >= wagering_required_micros THEN
  → разблокировать бонус (см. 2.6)
```

### 2.6 Разблокировка бонуса

```
BEGIN TRANSACTION
  UPDATE bonus_grants SET status = 'completed'
  UPDATE wallets SET
    bonus_usdt_micros -= bonus_amount,
    cash_usdt_micros  += bonus_amount
  INSERT ledger_entries (тип 'bonus_unlock')
COMMIT

→ Уведомление: «Бонус разблокирован! $X добавлено на основной счёт»
```

### 2.7 Истечение бонуса (cron, раз в сутки)

```
SELECT * FROM bonus_grants
WHERE status = 'active' AND expires_at < now()

FOR EACH expired:
  BEGIN TRANSACTION
    UPDATE bonus_grants SET status = 'expired'
    UPDATE wallets SET bonus_usdt_micros -= bonus_amount
    INSERT platform_ledger_entries (тип 'bonus_expired', доход клуба)
    INSERT ledger_entries (тип 'bonus_expired', дебет игрока)
  COMMIT
  → Уведомление: «Ваш бонус $X истёк»
```

### 2.8 Ключевые правила

- Бонусный баланс **нельзя вывести** до разблокировки
- Запрос на вывод основного счёта **не отменяет** активный бонус
- Нельзя получить второй приветственный бонус при повторном депозите
- Рейк в рейтинговом режиме (play chips) **не считается** в вагеринг

---

## 3. Вывод средств

### 3.1 Условия для вывода

| Условие | Правило |
|---|---|
| Минимальная сумма | $10 |
| Rake threshold | `total_rake_paid ≥ total_deposited × 0.25` |
| Доступный баланс | `cash_usdt_micros ≥ requested_amount` |
| Риск-флаги | Нет активных флагов со статусом HIGH |
| Бонус | Выводится только `cash_usdt_micros`; бонус продолжает отыгрываться |

### 3.2 Rake threshold — расчёт

Защита от схемы «депозит → сразу вывод без игры»:

```
total_rake_paid    = SUM(rake) из hand_results WHERE app_user_id = ?
total_deposited    = SUM(amount) из payment_orders WHERE status = 'paid'
threshold_required = total_deposited × 0.25
threshold_remaining = MAX(0, threshold_required - total_rake_paid)
```

Примеры:

| Депозит | Нужно рейка | Сыграл рейка | Может выводить |
|---|---|---|---|
| $10 | $2.50 | $1.00 | ❌ нет (нужно ещё $1.50) |
| $10 | $2.50 | $3.00 | ✅ да |
| $100 | $25.00 | $10.00 | ❌ нет (нужно ещё $15.00) |
| $100 | $25.00 | $30.00 | ✅ да |

При повторном депозите порог пересчитывается по совокупности:

```
Депозит 1: $50 → порог $12.50
Сыграл: $15 → условие выполнено
Депозит 2: $30 → новый совокупный порог = ($50 + $30) × 0.25 = $20
Сыграно: $15 < $20 → нужно ещё $5 рейка
```

### 3.3 Комиссия клуба

**3.5% от суммы вывода**, вычитается из суммы запроса:

```
Запрос $50 → комиссия $1.75 → игрок получает $48.25
Запрос $100 → комиссия $3.50 → игрок получает $96.50
Запрос $200 → комиссия $7.00 → игрок получает $193.00
```

Комиссия записывается в `platform_ledger_entries` как доход клуба.

Дополнительно: блокчейн/провайдер комиссия (~$0.50–2.00) вычитается сверх — это сетевой сбор, не доход клуба.

### 3.4 Полный флоу вывода

```
ШАГИ ПОЛЬЗОВАТЕЛЯ:
1. Открывает кассу → вкладка «Вывод»
2. Видит: доступный баланс, прогресс rake threshold, мин. $10
3. Вводит сумму и адрес кошелька
4. Видит предварительный расчёт: «получите ~$X после комиссии»
5. Подтверждает

ШАГИ СИСТЕМЫ:
6. Валидация всех условий (3.1)
   → Не выполнено → ошибка с объяснением и прогрессом
7. BEGIN TRANSACTION
     UPDATE wallets SET
       cash_usdt_micros   -= requested_amount,
       locked_usdt_micros += requested_amount
     INSERT withdrawal_requests (status='pending_review')
     INSERT ledger_entries (тип 'withdrawal_hold')
   COMMIT
8. Уведомление администратору (Telegram alert)
9. Статус игроку: «Заявка на рассмотрении, обычно до 24 часов»

ШАГИ АДМИНИСТРАТОРА:
10. Видит в панели: сумма, игрок, депозит, рейк, device_sessions, risk_flags
11. Действия: ✅ одобрить / ❌ отклонить / 🔍 расширенная проверка
12a. ОДОБРЕНО:
     - Рассчитать net = requested_amount × 0.965 (3.5% комиссия)
     - Отправить через CryptoBot/xRocket/TON
     - По webhook:
         UPDATE wallets SET locked_usdt_micros -= requested_amount
         INSERT platform_ledger_entries (комиссия)
         withdrawal_requests.status = 'completed'
     - Уведомление игроку: «Выплата $X отправлена»

12b. ОТКЛОНЕНО:
     BEGIN TRANSACTION
       UPDATE wallets SET
         locked_usdt_micros -= requested_amount,
         cash_usdt_micros   += requested_amount
       withdrawal_requests.status = 'rejected'
       INSERT ledger_entries (тип 'withdrawal_return')
     COMMIT
     - Уведомление игроку с причиной
```

### 3.5 Обработка ошибок выплаты

| Ситуация | Действие |
|---|---|
| Провайдер не ответил | Статус `pending_send` → retry через 10 мин, max 3 попытки |
| Ошибка провайдера | Статус `send_failed` → уведомление админу, ручная обработка |
| Неверный адрес | Статус `send_failed` → возврат в `cash`, уведомление игроку |
| Webhook не пришёл | Polling каждые 30 мин для статусов `pending_send > 1h` |

### 3.6 Что видит игрок в UI

- Текущий доступный баланс
- Прогресс-бар rake threshold: «Сыграно $X из $Y рейка для разблокировки вывода»
- История заявок: сумма, статус, дата, хэш транзакции

---

## 4. Таблица состояний заявки на вывод

```
pending_review → approved → pending_send → completed
             ↓           ↓              ↓
          rejected    send_failed    completed
                          ↓
                     manual_review
```

---

## 5. Резервный фонд (Cash Gap Protection)

Клуб обязан держать на горячем кошельке USDT не меньше суммарного `cash_usdt_micros` всех игроков.

Формула проверки (выполняется при каждой выплате рейка/комиссии):

```
platform_liquid_balance ≥ SUM(wallets.cash_usdt_micros) + SUM(wallets.locked_usdt_micros)
```

Превышение = прибыль, которую можно выводить в операционный бюджет.
Дефицит = кассовый разрыв, автоматический алерт администратору.

---

## 6. Ограничения на старте

- Автоматические выплаты **отключены** — все заявки проходят ручной review
- Автоматизация включается после 30 дней работы без инцидентов и настройки whitelist-адресов
- USDT TRC20 вывод — после подключения провайдера с webhook и уникальными адресами
