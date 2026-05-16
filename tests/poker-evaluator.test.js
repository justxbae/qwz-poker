import test from "node:test";
import assert from "node:assert/strict";
import { resolveShowdown } from "../server/poker-evaluator.js";

test("resolves a full house winner using pokersolver", () => {
  const communityCards = ["2s", "Th", "Tc", "3d", "8s"];
  const contenders = [
    { name: "Pair", cards: ["As", "Ad"] },
    { name: "Full House", cards: ["2h", "2d"] }
  ];

  const result = resolveShowdown(contenders, communityCards);

  assert.equal(result.winners.length, 1);
  assert.equal(result.winners[0].seat.name, "Full House");
  assert.equal(result.handName, "Full House");
});

test("returns multiple winners when the board plays", () => {
  const communityCards = ["As", "Ks", "Qs", "Js", "Ts"];
  const contenders = [
    { name: "One", cards: ["2c", "3d"] },
    { name: "Two", cards: ["4c", "5d"] }
  ];

  const result = resolveShowdown(contenders, communityCards);

  assert.deepEqual(result.winners.map((winner) => winner.seat.name), ["One", "Two"]);
  assert.equal(result.handName, "Straight Flush");
});
