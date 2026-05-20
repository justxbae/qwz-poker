# QWZ Poker database

The app uses PostgreSQL when `DATABASE_URL` is configured. Without `DATABASE_URL`, it falls back to in-memory storage for local development and tests.

## Production storage

Persisted in PostgreSQL:

- `app_users` - internal project users.
- `user_identities` - provider identities, currently Telegram. This keeps the schema ready for another messenger later.
- `wallets` - current QWZ chips wallet balance.
- `ledger_entries` - immutable wallet movement history.
- `saved_stacks` - saved stack after leaving a table.
- `payment_orders` - Stars orders and payment statuses.
- `fund_movements` - movement of chips between wallet, table, saved stack, tournament escrow, and reserves.
- `tournament_registrations` - active/cancelled tournament registrations.
- `hand_histories` - completed hand summaries, board, pots, seats, and rake.
- `active_table_snapshots` - latest JSON snapshot of each open table for restart recovery.
- `admin_events` - admin/audit log events.

Still process-local in this MVP:

- active poker table runtime objects;
- timers and auto-actions;
- short-lived auth sessions.

`active_table_snapshots` protects against a single process restart: the server reloads open tables, seats, current hand state, deck, pot, cards, and stacks from PostgreSQL. It is not a multi-server game-state engine. Before scaling to multiple Node processes, active table ownership should move to a dedicated authoritative game layer, usually one game process per table cluster with Redis/PostgreSQL coordination or a queue/lock layer.

## Environment

Required for production persistence:

```text
DATABASE_URL=<postgres connection string>
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
- manual admin grants/deducts.

This keeps balances auditable and prevents silent balance rewrites.

## Messenger portability

The database does not treat Telegram ID as the core user id. Instead:

```text
app_users.id -> internal user
user_identities(provider, provider_user_id) -> messenger account
wallets.app_user_id -> shared wallet
```

If another messenger is added later, its account can be linked as another identity for the same `app_user_id`.
