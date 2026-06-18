# QWZ Poker payments

## Current production rule

Cash balance is credited only after confirmed payment:

- Telegram Stars: `pre_checkout` validates order, `successful_payment` completes order and cash-wallet credit in one database transaction.
- Crypto Bot: invoice creation via `createInvoice`, webhook confirmation via `crypto-pay-api-signature`.
- xRocket: invoice creation via `POST /tg-invoices`, webhook confirmation via `rocket-pay-signature`.
- TON / USDT TRC20: order creation is prepared, but methods stay disabled until a real receiver wallet or provider is configured.
- Any repeated webhook or retry is deduped by `payment:{orderId}` and API idempotency keys.

## Telegram Stars

Active method now for cash deposits.

Flow:

1. Client sends `usdtAmount` to `/api/cashier/stars-invoice`.
2. Backend calculates Stars from `server/economy.js` using `STARS_USDT_RATE`.
3. Backend creates `payment_orders(status='pending', method='stars', credited_asset='USDT')`.
4. Telegram `pre_checkout_query` checks payload, currency `XTR`, and amount.
5. Telegram `successful_payment` calls `completePaymentOrder`.
6. `completePaymentOrder` sets order `paid` and credits cash wallet in the same PostgreSQL transaction.
7. Client polls the authenticated payment-status endpoint and reports success only after the server returns `status='paid'` with the refreshed PostgreSQL wallet balance.

Before creating an invoice, the backend calls Telegram `getWebhookInfo` and verifies that the configured webhook URL is exactly `${APP_PUBLIC_URL}/api/telegram/webhook`. If payment confirmation cannot return to the server, invoice creation fails closed before the user can spend Stars.

Configured conversion:

```text
100 Stars = 1.00 USDT
```

The rate remains configurable through `STARS_USDT_RATE`; production currently uses `0.01 USDT` per Star.

## Client confirmation rule

Telegram's `openInvoice(..., status='paid')` callback only confirms that Telegram accepted the payment. It is not proof that QWZ has committed wallet+ledger state.

- Never show “Баланс пополнен” from the client callback alone.
- Poll `GET /api/cashier/payment-orders/:orderId`.
- Show success only when that endpoint returns `order.status='paid'`.
- A pending confirmation must explicitly tell the player not to pay again.
- `/api/cashier` and `/api/profile` refresh both wallet buckets from the authoritative store before responding.
- The endpoint returns 404 for orders owned by another user.

Operational recovery is documented in `docs/PAYMENT_INCIDENT_RUNBOOK.md`.

Finance admins may manually approve a pending Stars order only after checking the Telegram receipt. The API requires `confirmPaid: true`, records `telegram_receipt_verified` in the audit trail, and still uses the same idempotent `completePaymentOrder` transaction.

## Crypto Bot

Supported as an invoice rail.

Flow:

1. Client sends `usdtAmount` to `/api/cashier/crypto-order` with `method=cryptobot`.
2. Backend creates an invoice through `POST https://pay.crypt.bot/api/createInvoice`.
3. Backend stores `payment_orders(status='pending', method='cryptobot', credited_asset='USDT')`.
4. User pays the invoice in the Crypto Bot mini app.
5. Crypto Bot sends a signed webhook to `/api/payments/crypto/webhook`.
6. Webhook signature is verified with `crypto-pay-api-signature`.
7. `completePaymentOrder` credits the cash wallet only after confirmed payment.

Required env:

```text
CRYPTOBOT_API_KEY=
CRYPTOBOT_API_BASE=https://pay.crypt.bot/api
```

## xRocket

Supported as an invoice rail.

Flow:

1. Client sends `usdtAmount` to `/api/cashier/crypto-order` with `method=xrocket`.
2. Backend creates an invoice through `POST https://pay.xrocket.tg/tg-invoices`.
3. Backend stores `payment_orders(status='pending', method='xrocket', credited_asset='USDT')`.
4. User pays the invoice in xRocket.
5. xRocket sends a signed webhook to `/api/payments/crypto/webhook`.
6. Webhook signature is verified with `rocket-pay-signature`.
7. `completePaymentOrder` credits the cash wallet only after confirmed payment.

Required env:

```text
XROCKET_PAY_API_KEY=
XROCKET_PAY_API_BASE=https://pay.xrocket.tg
XROCKET_WEBHOOK_SECRET=
APP_PUBLIC_URL=
```

## TON deposit

Prepared method for the project wallet:

```text
UQB5ZtlMthiWet8Cy0K8LFOJc-5aG55uQc7DCnHA18XiYn9T
```

Recommended production route:

1. Add `TON_PAYMENTS_ENABLED=true`.
2. Add/confirm `TON_RECEIVER_ADDRESS`.
3. Add `TON_POLLING_ENABLED=true`.
4. Add `TONCENTER_API_KEY` for stable polling limits.
5. Keep `/tonconnect-manifest.json` public and accurate.
6. Create order through `/api/cashier/crypto-order` with `method='ton'`.
7. Client sends TON transfer through TON Connect with:
   - receiver address;
   - amount in nanotons;
   - unique comment/reference `qwz:{orderId}`.
8. Backend polls TON Center v3 for incoming transactions to the receiver address.
9. Backend matches amount and comment/reference.
10. Only matched on-chain payment calls `completePaymentOrder`.

Do not enable TON payments in production without PostgreSQL. Pending orders must survive server restarts.

Official references:

- https://docs.ton.org/v3/guidelines/ton-connect/overview/
- https://docs.ton.org/ecosystem/ton-pay/payment-integration/payments-tonconnect/

## USDT TRC20 deposit

Prepared method.

Do not process TRC20 through TON Connect. It is a separate chain and needs one of:

- crypto payment provider with invoices, unique addresses, confirmations, webhook signatures;
- own custodial wallet infrastructure with TRON node/indexer, unique addresses, sweeping, and monitoring.

Minimum provider requirements:

- unique order/payment id;
- unique address or exact amount/comment matching;
- webhook signing with replay protection;
- confirmation count;
- order expiration;
- polling endpoint for missed webhooks;
- payout/mass payout API only after manual approval controls.

Environment placeholders:

```text
USDT_TRC20_PAYMENTS_ENABLED=false
USDT_TRC20_RECEIVER_ADDRESS=
USDT_RUB_RATE=
CRYPTO_PROVIDER_API_KEY=
CRYPTO_WEBHOOK_SECRET=
```

## Crypto webhook

Prepared endpoint:

```text
POST /api/payments/crypto/webhook
Header: X-QWZ-Crypto-Secret: <CRYPTO_WEBHOOK_SECRET>
```

Expected generic payload:

```json
{
  "orderId": "ton_xxx",
  "status": "confirmed",
  "paidAmount": 1.25,
  "txHash": "hash",
  "externalId": "provider_invoice_id"
}
```

The webhook:

- rejects without secret in production;
- moves underpaid orders to `manual_review`;
- updates failed/expired orders without crediting chips;
- credits chips only on confirmed/paid statuses.

## Withdrawals

Withdrawals should not be automated at launch.

Recommended first production version:

1. User creates withdrawal request.
2. Funds move from wallet to `withdrawal_hold`.
3. Admin reviews risk flags, deposit history, game volume, and wagering.
4. Admin approves payout manually.
5. System records provider tx/hash and final status.

Minimum withdrawal fees should cover:

- blockchain/provider fee;
- fraud/risk reserve;
- payment operations reserve;
- marketing and business margin from the economics model.

Until legal/compliance is settled, withdrawals should remain disabled in UI or marked as manual beta.
