# QWZ Poker database

The app uses PostgreSQL when `DATABASE_URL` is configured and Redis when `REDIS_URL` is configured.

There are two operating modes:

- `REAL_MONEY_ENABLED=false`: demo/play mode. PostgreSQL and Redis are optional.
- `REAL_MONEY_ENABLED=true`: real-money mode. PostgreSQL and Redis are required and the app exits if either is missing.

## Production storage

Persisted in PostgreSQL:

- `app_users` - internal project users.
- `user_identities` - provider identities, currently Telegram. This keeps the schema ready for another messenger later.
- `wallets` - current QWZ chips wallet balance.
- `ledger_entries` - immutable wallet movement history.
- `platform_ledger_entries` - immutable project-side ledger for rake, future tournament fees, withdrawals, bonuses, reversals, and manual review adjustments.
- `saved_stacks` - saved stack after leaving a table.
- `payment_orders` - Stars orders and payment statuses.
- `payment_orders` also stores prepared TON/USDT order metadata: method, asset, network, expected crypto amount, external provider id, expiration.
- `idempotency_keys` - dedupe cache for money endpoints, so retries and double taps return the same response instead of charging twice.
- `fund_movements` - movement of chips between wallet, table, saved stack, tournament escrow, and reserves.
- `tournament_registrations` - active and cancelled tournament registrations.
- `hand_histories` - completed hand summaries, board, pots, seats, rake, and fairness proof.
- `active_table_snapshots` - latest JSON snapshot of each open table for restart recovery.
- `admin_events` - admin and audit log events.

Persisted in Redis when `REDIS_URL` is configured:

- auth sessions and per-user session fan-out;
- active table snapshots for fast boot and live state hydration.

Still process-local in demo mode:

- active poker table runtime objects;
- timers and auto-actions;
- short-lived auth sessions when Redis is unavailable.

`active_table_snapshots` protects against a single process restart: the server reloads open tables, seats, current hand state, deck, pot, cards, and stacks from PostgreSQL. Redis mirrors the same snapshots for faster boot and short-lived runtime recovery. This is not a multi-server game-state engine. Before scaling to multiple Node processes, active table ownership should move to a dedicated authoritative game layer, usually one game process per table cluster with Redis/PostgreSQL coordination or a queue/lock layer.

## Environment

Required for real-money production persistence:

```text
DATABASE_URL=<postgres connection string>
REDIS_URL=<redis connection string>
```

Optional:

```text
DATABASE_SSL=false
```

By default, PostgreSQL SSL is enabled because hosted providers usually require it.

## Ledger rule

Wallet changes should go through `ledger_entries`. The app writes the balance update and ledger entry in one database transaction for:

- Stars deposits;
- demo/dev deposits;
- buy-ins;
- rebuys;
- manual admin grants and deducts.

This keeps balances auditable and prevents silent balance rewrites.

Payment completion has a stricter rule: `payment_orders.status = paid` and the wallet credit are written in one PostgreSQL transaction. A repeated Telegram Stars webhook is ignored after the first successful completion.

## Idempotency rule

All money-changing API calls accept `X-Idempotency-Key`:

- `/api/cashier/stars-invoice`
- `/api/cashier/demo-topup`
- `/api/tables`
- `/api/tables/:id/join`
- `/api/tables/:id/rebuy`
- `/api/tournaments/:id/register`
- `/api/tournaments/:id/cancel`

With PostgreSQL enabled, responses are stored in `idempotency_keys` for 24 hours. In local or demo mode the same behavior is preserved only until process restart.

## Reconciliation

The server periodically compares:

- `walletTotal` against `ledgerCreditTotal - ledgerDebitTotal`;
- paid Stars order chips against `deposit_stars` ledger credits.

If drift is detected, the app writes an admin event and sends a Telegram admin alert when `ADMIN_CHAT_ID` is configured. This is an alert-only control: it does not silently edit balances.

## Sessions

In demo mode, sessions can live in memory and reset on restart. In real-money mode, Redis stores the auth session token and user session fan-out so a single restart does not log everyone out or orphan table presence.

## Messenger portability

The database does not treat Telegram ID as the core user id. Instead:

```text
app_users.id -> internal user
user_identities(provider, provider_user_id) -> messenger account
wallets.app_user_id -> shared wallet
```

If another messenger is added later, its account can be linked as another identity for the same `app_user_id`.
