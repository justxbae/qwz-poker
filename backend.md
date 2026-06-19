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
