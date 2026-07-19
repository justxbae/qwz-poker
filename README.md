# Weez Poker

Telegram Mini App poker room: Node.js backend, PostgreSQL, Redis and a static
vanilla-JS client. The repository is a modular monolith with no build step.

## Start locally

```bash
npm ci
npm run dev
```

Without `DATABASE_URL` and `REDIS_URL`, development uses in-process memory.
Real-money mode requires both services and refuses to start without them.

## Tests

```bash
env -u DATABASE_URL -u REDIS_URL npm test
```

The environment reset avoids inheriting local production URLs in child-process
tests. Infrastructure/provider suites are separately gated until a disposable
PostgreSQL/Redis environment is available.

## Product and engineering canon

- `MASTER_SPEC.md` — product and economy source of truth.
- `docs/13-decisions.md` — newer approved decisions.
- `docs/WEEZ_ENTERPRISE_MASTER_TZ.md` — complete development and operations plan.
- `DATABASE.md` — persistence and ledger contract.
- `PAYMENTS.md` — payment lifecycle.
- `docs/DESIGN_SYSTEM.md` — UI/UX contract.

## Security

Never commit `.env`, bot tokens, provider keys or production database URLs.
Rotate any token that has appeared in chat, logs or Git history.
