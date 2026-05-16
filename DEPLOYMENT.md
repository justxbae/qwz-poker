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
5. Deploy.

After deploy, copy the public Render URL, for example:

```text
https://qwz-poker.onrender.com
```

Set Telegram webhook:

```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=https://qwz-poker.onrender.com/api/telegram/webhook"
```

In `@BotFather`, set the Mini App / menu button URL to the same public URL.

### Koyeb

Koyeb is also suitable and has a free web service tier in some regions. Use the included `Dockerfile`.

Required environment variables:

```text
NODE_ENV=production
HOST=0.0.0.0
BOT_USERNAME=qwzpokerbot
BOT_TOKEN=<token from BotFather>
APP_NAME=QWZ Poker
```

After deploy, set webhook exactly like above, replacing the domain with the Koyeb app URL.

## Telegram Stars

Stars payments require:

- `BOT_TOKEN` configured on the server.
- Public HTTPS URL.
- Telegram webhook pointing to `/api/telegram/webhook`.
- Mini App opened inside Telegram.

The app creates invoices with `currency: XTR`. Successful payments are processed from Telegram `successful_payment` webhook updates.

## Important

The current MVP stores wallets, tables, and transactions in memory. A server restart will reset runtime state. Before a real launch, move this data to a database.
