# Payment incident runbook

## Цель

Ни один подтверждённый платёж не должен теряться или начисляться дважды. При инциденте сначала сохраняется платёжный order и доказательство провайдера, затем выполняется только идемпотентное зачисление через штатный payment flow.

## Немедленные действия

1. Не просить игрока платить повторно.
2. Проверить `GET /api/health`. Если Render возвращает `Service Suspended`, возобновить сервис до любых повторных тестов.
3. Проверить Telegram `getWebhookInfo`: URL обязан совпадать с `${APP_PUBLIC_URL}/api/telegram/webhook`; изучить `pending_update_count` и `last_error_message`.
4. Найти order по Telegram user/username и времени платежа.
5. Сверить order, wallet и ledger одной выборкой.

```sql
select
  po.id,
  po.provider_user_id,
  au.username,
  po.status,
  po.stars,
  po.cash_usdt_micros,
  po.telegram_payment_charge_id,
  po.created_at,
  po.paid_at,
  w.cash_usdt_micros as wallet_cash,
  le.id as ledger_id,
  le.amount as ledger_amount,
  le.balance_after
from payment_orders po
join app_users au on au.id = po.app_user_id
join wallets w on w.app_user_id = po.app_user_id
left join ledger_entries le on le.idempotency_key = 'payment:' || po.id
where po.method = 'stars'
  and (au.username = 'quinwize' or po.provider_user_id = '<telegram_user_id>')
order by po.created_at desc
limit 20;
```

## Решение по состоянию order

- `paid` + ledger + wallet: деньги зачислены; обновить клиент/сессию и проверить `/api/cashier`.
- `pending`, а Telegram retry ещё ожидается: поднять сервис и дождаться повторной доставки webhook.
- `pending`, Stars точно списаны, retry не приходит: finance-admin подтверждает существующий order через штатное действие `approve`. Это вызывает идемпотентный `completePaymentOrder`; не использовать прямой SQL update wallet.
- `paid` без ledger или wallet: критический drift. Не исправлять баланс вручную до фиксации snapshot и причины; штатная транзакция не должна допускать это состояние.
- order отсутствует: сохранить Telegram receipt, user id, время и сумму; не создавать фиктивный paid-order без отдельного audit record.

## Запрещено

- прямой `UPDATE wallets`;
- повторное начисление через `admin_grant`, если существует payment order;
- просить повторную оплату pending-order;
- считать клиентский callback доказательством серверного зачисления;
- закрывать инцидент без проверки `payment_orders + ledger_entries + wallets`.

## Проверка после восстановления

1. `GET /api/health` возвращает 200, PostgreSQL и Redis — `ok`.
2. Новый Stars-инвойс создаётся только при корректном webhook.
3. Тестовый платёж 100 Stars создаёт ровно один `deposit_stars` ledger credit на `1_000_000` micros.
4. Повторный webhook не меняет баланс.
5. `/api/cashier/payment-orders/:id` возвращает `paid`, а `/api/cashier` и Главная показывают `$1.00`.
6. Reconciliation: paid Stars total равен `deposit_stars` ledger total.
