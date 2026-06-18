# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

QWZ Poker is a Telegram Mini App poker room: a Node.js (ESM, Node >= 20) backend that
serves both the JSON API and a static vanilla-JS frontend, backed by PostgreSQL and Redis.
The Texas Hold'em engine is already working. There is no build step and no framework —
the server is raw `node:http`, the client is hand-written JS/CSS in `public/`.

The authoritative product/economy spec is `MASTER_SPEC.md` (it wins over other docs on
conflict). Database contract is `DATABASE.md`. Other deep docs: `docs/ECONOMICS.md`,
`docs/BONUS_WITHDRAWAL.md`, `docs/FAIRNESS.md`, `PAYMENTS.md`.

## Commands

```bash
npm run dev      # node server/index.js (dev; PORT/HOST from .env)
npm start        # NODE_ENV=production node server/index.js
npm test         # node --test tests/*.test.js
node --test tests/economy.test.js   # run a single test file
```

There is no lint/build/typecheck step. CI (`.github/workflows/ci.yml`) only runs `npm test`
on Node 20. Tests use the built-in `node:test` runner.

**Known local-test gotcha:** `tests/table-flow.test.js` spawns child server processes and
inherits the developer's full `process.env`. If your `.env` has `DATABASE_URL` /
`REDIS_URL`, the "production refuses to start without PG/Redis" test does not get the
servers to exit, hangs, and **cancels every subsequent test in the file** (typical
symptom: `33 pass / 20 cancelled`). CI is clean because its env is bare. To run table-flow
tests locally without false cancellations, unset those vars first:
`unset DATABASE_URL REDIS_URL && npm test`.

## Deploy

Pushes to `main` auto-deploy to Render via `render.yaml`. There is no staging environment;
`main` is prod. The Render free tier sleeps after ~15 min idle — first request takes
10-30s to wake the dyno.

## Run modes (this gates almost everything)

`REAL_MONEY_ENABLED` switches two fundamentally different worlds:

- `false` (default, incl. on Render): **demo mode**. PostgreSQL and Redis are *optional*.
  Without `DATABASE_URL` the whole data layer falls back to in-process memory and resets on
  restart. Without `REDIS_URL` sessions and table snapshots live in process memory too.
- `true`: **real-money mode**. PostgreSQL and Redis are *required*; the app exits on boot if
  either is missing.

Because of the memory fallback, most logic in `server/db.js` and `server/index.js` is written
twice: a Postgres path and a `memory*`/local path. When you add a money or table operation,
implement **both** paths or it will silently no-op in demo mode.

This is a single-process game server. Active tables, timers, and auto-actions are process-local
runtime objects; `active_table_snapshots` (PG + Redis mirror) only protects against a *single*
restart. Do not assume multi-process safety — see the scaling note at the end of `DATABASE.md`.

## Architecture

- `server/index.js` (~4.6k lines) — the whole HTTP server. `createServer` → `handleApi` is a
  hand-rolled router (no Express). Also serves `public/` statics, the Telegram bot webhook,
  payment webhooks, the admin dashboard (`handleAdminApi` / `adminDashboardView`), analytics
  (`trackAnalytics`), reconciliation (`runReconciliationCheck`), and table hydration. Auth is
  `authenticateTelegram` (HMAC over Telegram `initData`); web-admin auth is separate.
- `server/db.js` (~2.7k lines) — all persistence. Every exported fn takes a `providerUserId`
  (Telegram id) + `provider`, *not* the internal `app_user_id`; the messenger-portability
  mapping lives behind these. Holds the Postgres pool and the schema bootstrap (`initDatabase`).
- `server/poker-engine.js` — pure-ish Hold'em state machine: `createTable`, `joinTable`,
  `startHand`, `act`, `tickTables`, side-pot/showdown logic, and provably-fair deck
  (`createProvablyFairDeck` / `verifyProvablyFairDeck`). `publicTable(table, viewerId)` is the
  serializer sent to clients (hides other players' hole cards).
- `server/economy.js` — single source of truth for money math, stakes ladders, rake, rating,
  cash-club, deposit/withdrawal quotes. Stateless config + helpers.
- `server/payments.js` — Telegram Stars + crypto (CryptoBot / xRocket / TON) invoice plumbing.
- `server/state-store.js` — Redis: auth sessions and active-table snapshots.
- `public/app.js` (~4.7k lines), `index.html`, `styles.css` (~12k lines, five overlaid
  `:root` token layers — the last one wins on cascade) — the entire client, vanilla JS with
  `addEventListener` wiring and `fetch` to the API. No bundler; edit and reload.

## Money model — critical invariants

Read `MASTER_SPEC.md` §1 before touching anything money-related.

- **The player balance IS USDT.** There is no chips abstraction for cash play. UI shows USDT
  directly: stacks as `$14.50`, blinds as `$0.05 / $0.10`, pot as `$1.25`. The project removed an
  older "chips" model (`1 USDT = 5000 chips`) — do not reintroduce any USDT↔chips conversion in
  cash mode. (Note: `wallets` / variable names still say "chips" in places for historical reasons;
  that's naming debt, not a conversion — the stored unit is USDT micros.)
- **Storage unit is USDT micros**, `1 USDT = 1_000_000 micros` (`USDT_SCALE`). All cash
  accounting is integer micros — never float. Convert at the edges with `toUsdtMicros` /
  `fromUsdtMicros` / `formatUsdtMicros` from `economy.js`.
- **Play chips are a fully separate unit** (`BALANCE_BUCKETS.PLAY`), used only in rating/play mode.
  Never mix play and cash in UI, logic, or DB.
- **Stars is only a deposit rate**, not a balance unit. Spec target is `100 Stars = $1.00 USDT`,
  i.e. `STARS_USDT_RATE = 0.01`. ⚠️ The code default and `render.yaml` currently ship
  `STARS_USDT_RATE = 0.0125` (80 Stars/USDT) — if a task is to align with spec, change the default
  in `economy.js` (`depositSettings`, `cashSettings`, `quoteCashDeposit`) and `render.yaml`.
- **Ledger rule:** every wallet change is written in one DB transaction with a `ledger_entries`
  row. No direct `wallets` updates. **Idempotency:** every money endpoint honors
  `X-Idempotency-Key`. Both rules are enforced patterns, not suggestions — see `DATABASE.md`.
- **Bonuses are a separate balance bucket** (`bonus_grants` table). Bonus → cash conversion
  only after the wagering requirement is paid via rake. Bonus money is **not withdrawable**
  and cannot fund withdrawals. See `docs/BONUS_WITHDRAWAL.md` §2 before changing anything
  here — the bonus state machine, wagering tracking, and expiry job all live in that doc.

## Conventions

- ESM only (`"type": "module"`), explicit `.js` import extensions, Node built-ins via `node:` prefix.
- No HTTP framework, ORM, or frontend framework — match the existing hand-rolled style rather than
  introducing dependencies (deps are intentionally minimal: `pg`, `ioredis`, `@sentry/node`).
- User-facing strings are Russian; keep that for new UI/error copy.
- Secrets live in `.env` (gitignored). `.env.example` lists the keys; `render.yaml` is the prod
  env contract. The committed bot token in git history is considered compromised — see `README.md`.
