# QWZ Poker payments

## Current production rule

Chips are credited only after confirmed payment:

- Telegram Stars: `pre_checkout` validates order, `successful_payment` completes order and wallet credit in one database transaction.
- TON / USDT TRC20: order creation is prepared, but methods stay disabled until a real receiver wallet or provider is configured.
- Any repeated webhook or retry is deduped by `payment:{orderId}` and API idempotency keys.

## Telegram Stars

Active method now.

Flow:

1. Client sends `rubAmount` to `/api/cashier/stars-invoice`.
2. Backend calculates chips/stars from `server/economy.js`.
3. Backend creates `payment_orders(status='pending', method='stars')`.
4. Telegram `pre_checkout_query` checks payload, currency `XTR`, and amount.
5. Telegram `successful_payment` calls `completePaymentOrder`.
6. `completePaymentOrder` sets order `paid` and credits wallet in the same PostgreSQL transaction.

## TON deposit

Prepared method.

Recommended production route:

1. Add `TON_PAYMENTS_ENABLED=true`.
2. Add `TON_RECEIVER_ADDRESS`.
3. Keep `/tonconnect-manifest.json` public and accurate.
4. Create order through `/api/cashier/crypto-order` with `method='ton'`.
5. Client sends TON transfer through TON Connect with:
   - receiver address;
   - amount in nanotons;
   - unique comment/reference `qwz:{orderId}`.
6. Backend confirms transaction through provider/indexer reconciliation, not through client success alone.
7. Only confirmed order calls `completePaymentOrder`.

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
