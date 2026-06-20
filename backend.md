# Backend

## Daily PLAY_CHIPS claim

`GET /api/profile` and `GET /api/progression` include:

```json
{
  "dailyPlayClaim": {
    "canClaim": true,
    "claimedAt": null,
    "availableAt": "2026-06-19T00:00:00.000Z",
    "cooldownSeconds": 0,
    "amount": 10000
  }
}
```

`POST /api/play/daily-claim` requires an authenticated user and supports `X-Idempotency-Key`. A successful response contains `dailyPlayClaim`, refreshed `profile`, and refreshed `progression`. A claim during cooldown returns HTTP `409` with the current `dailyPlayClaim` state.

PostgreSQL persists one row per internal `app_user_id` in `daily_play_claims`. The cooldown check, `wallets.balance` increment, `daily_play_claim` ledger credit (`PLAY_CHIPS`, bucket `play`), and claim timestamp update happen in one transaction. Cash and bonus wallet columns are never updated by this flow.

## Tournament runtime MVP

The monolith now owns the MTT/SNG runtime in `server/tournament-engine.js`. Tournament states are `created`, `registration_open`, `late_registration`, `running`, `final_table`, `finished`, and `cancelled`. The one-second server tick opens registration, starts scheduled MTTs, starts full SNGs, advances blind levels, removes busted players, balances tables, creates the final table, and settles the result.

Tournament API:

- `GET /api/tournaments` — lobby list and player state.
- `GET /api/tournaments/:id` — runtime, blind level, table ids, results.
- `GET /api/tournaments/history` — authenticated player's results.
- `POST /api/tournaments/:id/register` and `/cancel` — idempotent entry/refund.

Each tournament declares `balanceBucket`. Cash tournaments debit and pay `cash_usdt_micros`; play tournaments debit and pay PLAY_CHIPS. Buckets are never converted or mixed. Buy-in goes to tournament escrow, fee goes to the platform ledger, cancellation reverses both, and payout is a single PostgreSQL transaction with `tournament_results`, `tournament_payouts`, wallet updates, and `tournament_payout` ledger rows. Tournament chips at a live table are gameplay counters and are excluded from wallet/table-stack reconciliation. Re-entry, add-on, freeroll, satellites, and bounty formats remain outside this MVP.
