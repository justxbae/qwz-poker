# Weez Poker — бонусные средства и вывод

Последнее обновление: 2026-07-19.

Этот документ описывает действующий контракт кода. При конфликте более новое
датированное решение из `docs/13-decisions.md` имеет приоритет.

## 1. Балансовые бакеты

| Поле | Назначение | Можно вывести |
|---|---|---|
| `cash_usdt_micros` | собственные денежные средства игрока | да |
| `bonus_usdt_micros` | активный бонус до выполнения wagering | нет |
| `locked_usdt_micros` | cash, удержанный под заявку на вывод | нет |
| `wallets.balance` | отдельные `PLAY_CHIPS` режима Rating | никогда |

Cash хранится целыми micro-USDT: `1 USDT = 1_000_000 micros`. Любое изменение
cash/bonus/locked выполняется в одной PostgreSQL-транзакции с записью в
`ledger_entries` и уникальным idempotency key. `PLAY_CHIPS` не участвуют в
cash, bonus или withdrawal flow.

## 2. Welcome Bonus

Действующие параметры из `server/economy.js`:

- один раз на `app_user_id`, после первого подтверждённого cash-депозита;
- `25%` первого депозита;
- максимум `$50`;
- wagering: уплаченный contributed cash rake в размере `6×` бонуса;
- срок: `30` дней;
- play/rating rake и турнирные play-механики не учитываются.

Начисление создаёт `bonus_grants`, кредитует только `bonus_usdt_micros` и пишет
`bonus_credit`. Каждый cash-hand может создать не более одного
`bonus_wagering_events` на grant/hand. После полного wagering транзакция:

1. помечает grant `completed`;
2. дебетует `bonus_usdt_micros`;
3. кредитует ту же сумму в `cash_usdt_micros`;
4. пишет парные ledger entries `bonus_unlock`.

При истечении срока grant получает `expired`, остаток списывается из bonus bucket
с ledger/audit записью. Вывод cash не отменяет активный бонус, но bonus bucket не
входит в доступную сумму вывода.

## 3. Действующая beta-политика вывода

| Параметр | Значение |
|---|---|
| Режим | ручная проверка и ручная внешняя выплата |
| Минимум | `$5` |
| Максимум одной заявки | `$5,000` |
| Service fee | `2%` от gross |
| TON network fee | `$0.15` |
| USDT TRC20 network fee | `$1.00` |
| Общий playthrough/rake gate | выключен (`0%`) |

Игрок до подтверждения видит gross, service fee, network fee и net payout.
Скрытого спреда нет. Аварийный `WITHDRAWAL_RAKE_THRESHOLD_PERCENT` допускается
только как явно включённый оператором anti-abuse override; production default —
`0`, поэтому добросовестный пользователь не блокируется глобальным требованием
отыграть 25% депозитов.

Deposit → immediate withdrawal, связанные аккаунты, аномальные устройства,
chip dumping и иные признаки риска переводят заявку в ручную проверку/risk flow,
но не меняют арифметику уже показанной комиссии.

## 4. Атомарный lifecycle

### Создание

1. Сервер повторно валидирует method, amount, доступный cash и адрес назначения.
2. В одной транзакции переносит gross из `cash_usdt_micros` в
   `locked_usdt_micros`.
3. Создаёт order со статусом `pending`/`manual_review`.
4. Пишет `withdrawal_hold` с idempotency key.

Повтор запроса с тем же ключом возвращает исходный order и не создаёт второй
hold.

### Отмена или отклонение

До terminal payout pending-order можно отменить/отклонить. В одной транзакции
locked уменьшается, cash восстанавливается и пишется `withdrawal_refund`.
Повтор не создаёт второй возврат.

### Выплата

Администратор сначала реально отправляет net payout внешним способом, затем
подтверждает его в Weez. Подтверждение без `externalTxId`/tx hash запрещено.
Финальная транзакция:

1. блокирует order и wallet;
2. убеждается, что order ещё pending/manual review;
3. уменьшает `locked_usdt_micros` на gross;
4. записывает service/network fee в project ledger;
5. переводит order сразу в terminal status `paid`;
6. фиксирует `external_tx_id`, `paid_at`, actor, reason и audit trail.

Внешний transaction id уникален среди withdrawal orders. Legacy status
`approved` читается только для совместимости старых данных; новые выплаты не
должны останавливаться в промежуточном `approved` без доказательства отправки.

## 5. Состояния

```text
pending/manual_review ── cancel/reject ──> cancelled/rejected
pending/manual_review ── confirmed external payout ──> paid
pending/manual_review ── operational error ──> failed/manual_review
```

Terminal order нельзя повторно выплатить, отменить или вернуть. Race между
cancel/reject/pay разрешает только одна транзакция под `FOR UPDATE`.

## 6. Reconciliation и операционные правила

- `cash wallet = cash ledger credits - cash ledger debits`;
- pending locked funds учитываются как обязательство перед игроком;
- player liabilities включают cash wallets, locked cash, table stacks и
  tournament escrow;
- paid order обязан иметь `external_tx_id` и `paid_at`;
- fee и payout totals сверяются с terminal orders;
- любое расхождение создаёт `reconciliation_alert` и требует разбора инцидента,
  а не автоматической правки баланса.

До публичного real-money запуска обязательны отдельные PostgreSQL/Redis
integration и failure-injection тесты: retry после commit timeout, race
cancel/pay, повторный tx hash, потеря Redis и рестарт во время pending payout.

## 7. Что пока не обещается пользователю

- автоматическая выплата;
- гарантированный публичный SLA;
- автоматический KYC/provider screening;
- включённые TON/TRC20 rails без реального provider E2E;
- вывод `PLAY_CHIPS` или активного bonus bucket.

Эти пункты нельзя включать только фронтендом или env-флагом: сначала требуются
провайдер, runbook, мониторинг, reconciliation и отдельная приёмка.
