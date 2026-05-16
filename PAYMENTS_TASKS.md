# QWZ Poker Payment Tasks

## TON deposit

- Add a public `tonconnect-manifest.json` for QWZ Poker.
- Connect TON Connect UI in the Mini App deposit flow.
- Create a backend payment order with:
  - `orderId`
  - `userId`
  - `rubAmount`
  - `chips`
  - `expectedTonAmount`
  - `status`
- Save the transaction hash/reference after the user sends TON.
- Do not credit chips from client success alone.
- Add backend reconciliation before marking the order as `paid`.
- Sources:
  - https://docs.ton.org/v3/guidelines/ton-connect/overview
  - https://docs.ton.org/ecosystem/ton-pay/payment-integration/payments-tonconnect

## USDT TRC20 deposit

- Do not implement USDT TRC20 through TON Connect.
- Choose a provider or custodial wallet infrastructure first.
- Required payment flow:
  - create order
  - generate address or payment request
  - track webhook or polling confirmation
  - require network confirmations
  - expire unpaid orders
- Keep USDT TRC20 visible in the UI as `скоро` until a provider is selected.

## Common payment ledger

- Introduce one order model for Stars, TON, and USDT deposits.
- Required statuses:
  - `pending`
  - `paid`
  - `expired`
  - `failed`
  - `manual_review`
- Credit chips only after confirmed payment.
- Add admin logs for:
  - order created
  - payment paid
  - payment failed
  - payment expired
  - manual review needed
