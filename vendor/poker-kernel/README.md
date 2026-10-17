# Poker Kernel — pinned Weez integration

Upstream: https://github.com/pokerinfra/poker-kernel
Commit: `d61417489da92a9535cd84c3a23c69f975e7056f`, package version 1.0.0.
Retrieved 2026-10-16. The advertised npm package returned E404 on that date;
this directory contains source and compiled CommonJS, not a floating git dependency.
Original documentation: [UPSTREAM_README.md](UPSTREAM_README.md).
License: [AGPL-3.0-only](LICENSE), as specified by the source SPDX headers.

Weez currently uses only NLH betting via `server/holdem-kernel.js`. Upstream
deck generation, pot construction, payouts, rake, seating, variants and RIT
are not invoked by the application. No provider-hosted service is involved.

Local adaptations (2026-10-16):

- `package.json`: explicit CommonJS boundary; private vendored package.
- `src/kernel/PokerKernel.ts`: evaluator resolves the existing pinned
  `vendor/pokersolver/pokersolver.js`; four betting methods changed from private
  to protected so the host can intercept settlement and persist one table state.
- `src/types/round.ts`: optional nominal live bet `betTo`.
- `src/kernel/helpers/CurrentBet.ts`: live bet includes the nominal short blind
  and folded contributions. Used by action validation and no-limit sizing.
- `PKActionValidations.ts`, `NoLimitBetHandler.ts`: use that shared live bet.
- `dist/`: regenerated from the above source using TypeScript 5.8.3.
- 2026-10-17: `moveToNextPlayer` uses clockwise seat order on every street.
  The stock preflop branch stalled if the dealer had left the hand. Rebuilt `dist/`.

Rebuild only after editing vendor source:

```sh
npm ci --prefix vendor/poker-kernel --ignore-scripts
npm run build --prefix vendor/poker-kernel
npm run test:poker
npm run compare:poker
```

The app needs no TypeScript compiler or build step at runtime. Do not copy
`node_modules` from this directory into releases. Preserve this directory's
source, attribution and license. Before a public proprietary deployment,
resolve the upstream licensing choice; local integration is not a commercial license.

Known stock defects reproduced in Weez tests include repeated counting of a
folded contribution in `PotManager`. Stock payouts also use decimal rounding,
which does not preserve integer USDT micros on split pots. Do not bypass the
betting-only adapter or call the stock financial methods.
