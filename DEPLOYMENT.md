# Deploy QWZ Poker

## Recommended MVP hosting

### Render

Render is the simplest free option for this project. It provides HTTPS and can deploy a Node.js web service from GitHub using `render.yaml`.

Tradeoff: free web services can sleep after inactivity, so the first request after idle can be slow.

Steps:

1. Push this project to GitHub.
2. Open Render and create a new Blueprint from the repository.
3. Render will read `render.yaml` and start the app with `node server/index.js`.
4. Add the secret environment variable:
   - `BOT_TOKEN`
   - `REAL_MONEY_ENABLED=false` for demo/play mode, or `true` for live-money mode
   - `DATABASE_URL` and `REDIS_URL` when `REAL_MONEY_ENABLED=true`
   - `TELEGRAM_WEBHOOK_SECRET` (if setWebhook uses `secret_token`)
5. Deploy.

After deploy, copy the public Render URL, for example:

```text
https://qwz-poker.onrender.com
```

Set Telegram webhook (with a secret_token, see ниже):

```bash
SECRET=$(openssl rand -hex 32)
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=https://qwz-poker.onrender.com/api/telegram/webhook&secret_token=$SECRET"
# затем добавить $SECRET в TELEGRAM_WEBHOOK_SECRET на Render
```

В `@BotFather` поставь Mini App / menu button URL на тот же публичный URL.

### Koyeb

Koyeb is also suitable and has a free web service tier in some regions. Use the included `Dockerfile`.

Required environment variables:

```text
NODE_ENV=production
HOST=0.0.0.0
BOT_USERNAME=qwzpokerbot
BOT_TOKEN=<token from BotFather>
REAL_MONEY_ENABLED=false
TELEGRAM_WEBHOOK_SECRET=<random hex, см. setWebhook ниже>
ADMIN_CHAT_ID=<your Telegram numeric user id for private admin logs>
ADMIN_USER_IDS=<comma-separated Telegram user ids allowed to use admin commands>
ADMIN_GRANT_MAX_CHIPS=500000
APP_NAME=QWZ Poker
SENTRY_DSN=<optional, Sentry/GlitchTip DSN>
SENTRY_TRACES_SAMPLE_RATE=0.1
```

For real-money mode, add:

```text
REAL_MONEY_ENABLED=true
DATABASE_URL=<postgres connection string>
REDIS_URL=<redis connection string>
```

## PostgreSQL

Create a PostgreSQL database on Render and copy its internal connection string into `DATABASE_URL` for the web service. On startup, the app automatically creates the required tables.

If `REAL_MONEY_ENABLED=true`, both `DATABASE_URL` and `REDIS_URL` are mandatory. Without them the server exits on startup because money storage, sessions, and active table state cannot fall back to memory in real-money mode.

If `REAL_MONEY_ENABLED=false`, the app can run in demo/play mode without PostgreSQL or Redis. That is acceptable for local testing and temporary preview deployments only.

After deploy, set webhook exactly like above, replacing the domain with the Koyeb app URL.

## Telegram Stars

Stars payments require:

- `BOT_TOKEN` configured on the server.
- Public HTTPS URL.
- Telegram webhook pointing to `/api/telegram/webhook`.
- Mini App opened inside Telegram.

The app creates invoices with `currency: XTR`. Successful payments are processed from Telegram `successful_payment` webhook updates.

## Admin wallet commands

Add your Telegram numeric user id to `ADMIN_USER_IDS` on Render. Then you can send commands to the bot:

```text
/balance <telegram_id>
/grant <telegram_id> <chips> <reason>
/deduct <telegram_id> <chips> <reason>
```

Example:

```text
/grant 123456789 50000 welcome_bonus
```

Each operation is written to the player's cashier history and sent to the admin log.

You can also open the Mini App with `?admin=1` to show the hidden admin tab. The server still checks `ADMIN_USER_IDS`, so the tab is only usable by allowed Telegram accounts.

## Important

With `DATABASE_URL` and `REDIS_URL` in real-money mode, wallets, ledger, payments, saved stacks, tournaments, hand histories, sessions, and active table snapshots are persisted across restarts. Demo mode can still run without them, but balances and runtime state may reset after a restart and it must never be used for paid traffic.
