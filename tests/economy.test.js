import test from "node:test";
import assert from "node:assert/strict";
import {
  RATING,
  cashClubPointsFromRake,
  cashClubStatus,
  nextRatingPoints,
  ratingDeltaForHand,
  ratingLeague,
  toUsdtMicros
} from "../server/economy.js";

test("rating uses BB result caps and ignores private or inactive hands", () => {
  assert.equal(ratingDeltaForHand({ profit: 500, bigBlind: 50, activePlayers: 2 }), 10);
  assert.equal(ratingDeltaForHand({ profit: 10000, bigBlind: 50, activePlayers: 2 }), RATING.maxHandDelta);
  assert.equal(ratingDeltaForHand({ profit: -10000, bigBlind: 50, activePlayers: 2 }), -RATING.maxHandDelta);
  assert.equal(ratingDeltaForHand({ profit: 500, bigBlind: 50, activePlayers: 1 }), 0);
  assert.equal(ratingDeltaForHand({ profit: 500, bigBlind: 50, activePlayers: 2, isPrivate: true }), 0);
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
