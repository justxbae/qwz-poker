# Weez Poker staging

Staging is a separate production-like environment for checking releases before `main` reaches
the real-money service. Its Render blueprint is `render.staging.yaml`.

## Isolation rules

- Use a separate Telegram bot, PostgreSQL database and Redis instance.
- Never copy production `DATABASE_URL`, `REDIS_URL`, bot token, webhook secret or admin token.
- Withdrawals and external TON/TRC20 payment polling stay disabled.
- Test balances have no monetary value and must not be copied into production.
- Only the `staging` branch auto-deploys this service. `main` remains the production branch.

## Release flow

1. Merge or cherry-pick the candidate changes into `staging`.
2. Wait for `/api/health` to report a healthy PostgreSQL and Redis connection.
3. Run the Telegram-device smoke checklist: authentication, lobby, rating claim, cash buy-in,
   one complete hand, reconnect, leave/refund, cashier validation, admin live view.
4. Check Sentry and reconciliation for new errors or non-zero drift.
5. Only then move the exact tested commits to `main`.

Staging must fail closed when PostgreSQL or Redis is unavailable. Do not enable the in-memory
fallback here: it would hide the failures this environment exists to catch.
