import test from "node:test";
import assert from "node:assert/strict";
import {
  RATING,
  advanceWelcomeBonusWagering,
  cashClubPointsFromRake,
  cashClubStatus,
  formatUsdtMicros,
  nextRatingPoints,
  quoteCashDeposit,
  quoteWithdrawal,
  quoteWelcomeBonus,
  ratingDeltaForHand,
  ratingLeague,
  toUsdtMicros
} from "../server/economy.js";

test("cash uses USDT micros directly and Stars quote 100 per USDT", () => {
  assert.equal(toUsdtMicros(14.5), 14_500_000);
  assert.equal(formatUsdtMicros(14_500_000), "14.50");
  assert.equal(quoteCashDeposit({ usdtAmount: 25, method: "stars" }).stars, 2500);
});

test("cash withdrawal quote validates method, amount and destination in USDT micros", () => {
  const validTonAddress = `UQ${"A".repeat(46)}`;
  const quote = quoteWithdrawal({
    usdtAmount: 25,
    method: "ton",
    destination: validTonAddress
  });
  assert.equal(quote.method, "ton");
  assert.equal(quote.grossUsdtMicros, toUsdtMicros(25));
  assert.equal(quote.balanceBucket, "cash_usdt");
  assert.equal(quote.asset, "USDT");
  assert.equal(quote.destination, validTonAddress);
  assert.ok(quote.payoutUsdtMicros > 0);
  assert.ok(quote.payoutUsdtMicros <= quote.grossUsdtMicros);

  assert.throws(
    () => quoteWithdrawal({ usdtAmount: 1, method: "ton", destination: validTonAddress }),
    /Минимальный вывод/
  );
  assert.throws(
    () => quoteWithdrawal({ usdtAmount: 25, method: "bad", destination: validTonAddress }),
    /Метод вывода/
  );
  assert.throws(
    () => quoteWithdrawal({ usdtAmount: 25, method: "ton", destination: "" }),
    /адрес/
  );
  assert.throws(
    () => quoteWithdrawal({ usdtAmount: 25, method: "ton", destination: "Usjdbbdick" }),
    /адрес/
  );
});

test("withdrawal fee is a flat visible 2% + network fee with no hidden spread", () => {
  const validTonAddress = `UQ${"A".repeat(46)}`;
  const quote = quoteWithdrawal({ usdtAmount: 100, method: "ton", destination: validTonAddress });
  // 2% of $100 = $2.00 service fee, + $0.15 TON network fee.
  assert.equal(quote.feePercent, 0.02);
  assert.equal(quote.percentFeeUsdtMicros, toUsdtMicros(2));
  assert.equal(quote.networkFeeUsdtMicros, toUsdtMicros(0.15));
  assert.equal(quote.feeUsdtMicros, toUsdtMicros(2.15));
  assert.equal(quote.payoutUsdtMicros, toUsdtMicros(97.85));
  assert.equal(typeof quote.feeLabel, "string");
  assert.ok(quote.feeLabel.length > 0);
  assert.equal(quote.hiddenSpreadUsdtMicros, undefined);
  assert.equal(quote.hiddenSpreadPercent, undefined);
});

test("welcome bonus is 25% capped at $50 with 6x rake wagering", () => {
  assert.deepEqual(quoteWelcomeBonus(toUsdtMicros(20)), {
    bonusAmountMicros: toUsdtMicros(5),
    wageringRequiredMicros: toUsdtMicros(30),
    expiresInDays: 30
  });
  assert.equal(quoteWelcomeBonus(toUsdtMicros(300)).bonusAmountMicros, toUsdtMicros(50));
  assert.deepEqual(advanceWelcomeBonusWagering({
    paidMicros: toUsdtMicros(29),
    requiredMicros: toUsdtMicros(30),
    rakeMicros: toUsdtMicros(1)
  }), {
    wageringPaidMicros: toUsdtMicros(30),
    completed: true
  });
});

test("rating uses BB result caps and ignores private or inactive hands", () => {
  // Heads-up runs at 0.5 weight (anti chip-passing), 3-way+ at full weight.
  assert.equal(ratingDeltaForHand({ profit: 500, bigBlind: 50, activePlayers: 2 }), 5);
  assert.equal(ratingDeltaForHand({ profit: 500, bigBlind: 50, activePlayers: 3 }), 10);
  assert.equal(ratingDeltaForHand({ profit: 10000, bigBlind: 50, activePlayers: 2 }), RATING.maxHandDelta);
  assert.equal(ratingDeltaForHand({ profit: -10000, bigBlind: 50, activePlayers: 2 }), -RATING.maxHandDelta);
  assert.equal(ratingDeltaForHand({ profit: 500, bigBlind: 50, activePlayers: 1 }), 0);
  assert.equal(ratingDeltaForHand({ profit: 500, bigBlind: 50, activePlayers: 2, isPrivate: true }), 0);
  // Micro-pot gate: pot below 2 BB never rates (fold-farm cycles).
  assert.equal(ratingDeltaForHand({ profit: 25, bigBlind: 50, activePlayers: 3, potSize: 75 }), 0);
  assert.equal(ratingDeltaForHand({ profit: 500, bigBlind: 50, activePlayers: 3, potSize: 100 }), 10);
  assert.equal(nextRatingPoints(1000, -25), 975);
  assert.equal(nextRatingPoints(10, -25), 0);
  assert.equal(ratingLeague(1600).title, "Gold");
});

test("cash club points come from rake, not from hand count or deposits", () => {
  assert.equal(cashClubPointsFromRake(0), 0);
  assert.equal(cashClubPointsFromRake(toUsdtMicros(0.01)), 1);
  assert.equal(cashClubPointsFromRake(toUsdtMicros(1)), 100);
  assert.equal(cashClubStatus(0).title, "Starter Club");
  assert.equal(cashClubStatus(100).title, "Bronze Club");
});
