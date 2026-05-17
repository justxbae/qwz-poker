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
- `admin_events` - admin/audit log events.

Still in memory in this MVP:

- active poker tables;
- current hand state;
- timers;
- short-lived auth sessions.

Before scaling to multiple Node processes, active table state should be moved to a dedicated game-state layer, usually Redis or a single authoritative game server.

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
