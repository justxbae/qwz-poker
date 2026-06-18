# QWZ Poker Telegram UI Kit Direction

## Source

Reference: Telegram IOS UI Kit Community.

The product UI should feel like a native Telegram Mini App, not a standalone casino skin. Poker-specific visuals stay mostly inside the table screen; lobby, cashier, profile, and buy-in use Telegram-style surfaces, rows, sheets, and navigation.

## Rules

- Use Telegram `themeParams` for app background, header color, text, hints, links, and button colors.
- Keep lobby/cashier/profile backgrounds flat and single-color.
- Avoid decorative gradients, patterns, blurred blobs, and heavy shadows outside the poker table.
- Prefer Telegram list groups: rounded section container, separated rows, compact colored icons, right-side values, chevron.
- Bottom navigation is a single rounded Telegram pill. Profile avatar is a separate circular control on the right.
- Active tab uses one visual layer only: one filled pill, no double outlines.
- Primary actions use Telegram blue. Poker green/gold/red are secondary semantic accents, not the main theme.
- Buy-in and cashier should behave like Telegram sheets: full-height or bottom sheet, clear title, grouped fields, one primary submit.

## QWZ Screen Mapping

- Home: profile header, balance/action hero, grouped action rows, compact session metrics.
- Tables: sticky limit selector, table rows as Telegram list items.
- Cashier: amount input, quote, payment method rows, transaction history list.
- Profile: account card, level/status, session rows, admin/dev hidden where needed.
- Game: keep poker atmosphere, but use Telegram controls around the table.

## Next UI Tasks

- Rebuild cashier as Telegram grouped settings screen.
- Rebuild buy-in sheet using Telegram row groups and a cleaner slider section.
- Replace emoji row icons with local CSS/SF-style symbols.
- Add newcomer bonus card as a compact Telegram list row, without changing the economy yet.
