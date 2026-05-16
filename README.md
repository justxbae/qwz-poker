# QWZ Poker

Telegram Mini App MVP for a free-play poker room.

## Important

The bot token that was pasted into chat should be revoked in `@BotFather`.

Open `@BotFather`:

1. `/mybots`
2. Choose `@poker74bot`
3. `API Token`
4. `Revoke current token`
5. Put the new token into local `.env`

## Run locally

Create `.env` from the example:

```bash
cp .env.example .env
```

Then start:

```bash
node server/index.js
```

Open:

```text
http://localhost:3000
```

## Telegram setup

Telegram Mini Apps require a public HTTPS URL.

For testing use Cloudflare Tunnel or ngrok, then in `@BotFather` configure:

- Bot: `@poker74bot`
- Mini App URL: `https://your-public-url`
- Menu button URL: `https://your-public-url`

The same app works in a normal browser in development mode.
