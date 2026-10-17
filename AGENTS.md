# Weez Poker — instructions for contributors

## Start with a fresh context

Read `README.md` for setup and the repository map. `docs/README.md` indexes the
current documents; `docs/LAUNCH_REVIEW.md` records the current launch audit and work queue. Read only the domain documents needed for the current task.
`archive/` contains historical material, not an implementation checklist.

Current scope: finish and validate the product before integrating the owner’s chosen
payment system. Do not activate or replace payment providers during cleanup.

## Product contracts

- `MASTER_SPEC.md` is authoritative on product and economy conflicts.
- `DATABASE.md` defines persistence, transactions and ledger contracts.
- `PAYMENTS.md` and `docs/BONUS_WITHDRAWAL.md` define payment/bonus lifecycles.
- `docs/13-decisions.md` records dated decisions; check relevant entries, but do
  not silently resolve contradictions by changing financial behavior.
- `docs/DESIGN_SYSTEM.md` is the current UI contract; `archive/design/figma/` contains references.
- `docs/LAUNCH_REVIEW.md` is the current launch work queue. Archived plans
  describe historical intended work, not proof of an implementation or deployment.

## Stack and commands

Node.js >= 20, ESM, raw `node:http`, PostgreSQL, Redis, vanilla JS/CSS. No framework,
ORM or frontend build step. Cloudflare deployment bundles server code with Wrangler; tooling lives in `infra/cloudflare/`. Keep application dependencies minimal.

```bash
npm ci
npm run dev
npm test
node --test tests/economy.test.js
npm run release:clean
```

`npm start` uses production mode. CI runs `npm test` on Node 20. There is no lint or
build command. HTTP test servers default to memory storage and override inherited
`DATABASE_URL`/`REDIS_URL`; `.env` never overwrites explicitly set values, even empty
strings. Infrastructure tests are opt-in; use disposable test services only.

## Runtime map

- `server/index.js`: Node.js entry point. `server/application.js` is the application factory: routing, Telegram auth, admin, SSE, schedulers and runtime Maps. Each instance owns its state.
- `infra/cloudflare/worker.js`: Workers entry point and singleton SQLite Durable Object; `room-store.js` persists room state and the next alarm atomically. PLAY only; money endpoints cannot be enabled in this deployment.
- `server/db.js`: PostgreSQL persistence and memory fallbacks. Exported user APIs
  take provider user ID + provider, not internal `app_user_id`.
- `server/poker-engine.js`: Hold'em host lifecycle, fairness, integer pots/rake and table serialization.
  `publicTable(table, viewerId)` hides private cards.
- `server/holdem-kernel.js`: NLH betting adapter to pinned `vendor/poker-kernel/`.
  Read `docs/POKER_KERNEL.md` before editing. Omaha is explicitly out of scope.
  Do not call upstream pot/payout/rake/deck methods from the app; known defects and
  incompatible rounding are documented. Preserve source, compiled code and AGPL license.
- `server/poker-evaluator.js`: showdown adapter to `vendor/pokersolver/`. This vendor
  is a runtime dependency; preserve its CommonJS package boundary and MIT license.
- `server/tournament-engine.js`: tournament state, seating, clock and payout math.
- `server/economy.js`: money math, stakes, rake, rating and quotes.
- `server/payments.js`: provider adapters; `server/state-store.js`: Redis state/locks.
- `server/env.js`: shared local environment loader for server and launch preflight.
- `public/index.html`, `app.js`, four stylesheets: entire client. CSS load order is
  intentional; `weez-design-system-v2.css` is last. Existing budget tests prevent
  growth of the three legacy stylesheets. Migrate one component at a time and
  verify its appearance before removing old rules.

## Modes and deployment

`REAL_MONEY_ENABLED=false` defaults to demo; PostgreSQL/Redis are optional and
memory data resets on restart. `true` requires both services and production secrets.
Implement both PostgreSQL and memory paths for operations that support both modes.

`render.yaml` currently enables real-money mode. Pushes to `main` auto-deploy to
production. `render.staging.yaml` is a separate staging blueprint; its existence
is not evidence of a deployed staging service. Follow `docs/STAGING.md`.
Never push or deploy as part of routine cleanup without user authorization.

The game server has one process owning active tables and timers. Persisted snapshots,
Redis locks and revision CAS do not make multiple game writers safe. See `DATABASE.md`.

## Financial invariants

Read `MASTER_SPEC.md` §1 before touching money.

- Cash is USDT, stored as integer micros: `1 USDT = 1_000_000`. Use `toUsdtMicros`,
  `fromUsdtMicros`, `formatUsdtMicros` at edges; never float accounting or a cash
  USDT-to-chips conversion. Historical `chips` variable names are naming debt.
- PLAY_CHIPS is a separate bucket. Never convert or mix it with cash; tournament
  stacks are separate too.
- Stars is a deposit rate, not a wallet unit. Current default and Render contract
  are `STARS_USDT_RATE=0.01` (100 Stars = $1 USDT).
- Every wallet mutation and ledger row commit in one transaction. Money endpoints
  honor `X-Idempotency-Key`; retries must not charge or credit twice.
- Bonuses are separate grants, cannot fund withdrawals, and convert only through
  the wagering state machine. Read `docs/BONUS_WITHDRAWAL.md` before changing it.

## Poker verification

Run `npm run test:poker` and `npm run compare:poker` when changing rules. The latter
compares identical scenarios to the pinned pre-migration engine and writes a local
report under `output/kernel/`. Run `npm test` for HTTP/wallet compatibility.
The core supports 2–9 players; HTTP remains capped at 6 until the client layout
is updated. Per-seat `lastActionBet` is persisted JSON state for re-opening rights;
reset it at hand/street boundaries and retain it during snapshot recovery.
HTTP `act` requires the current `turnToken`; `show-muck` requires `windowToken`.
Internal engine callers may omit tokens, so enforce the strict options at HTTP.
Preserve durable `seatNumber`, `seatSequence`, `lastBigBlindSeatNumber` and turn
identity in snapshots. `public/table-context.js` rejects stale responses/actions.
Initial-opponent expiry uses the existing atomic seat-to-wallet settlement path.

## Conventions

ESM imports use explicit `.js`; Node built-ins use `node:`. User-facing copy is
Russian. Keep `.env` and credentials private. Never print secret values or commit
local files; `.env.example` and Render blueprints are the configuration contracts.
Any token exposed in Git history must be rotated separately.
