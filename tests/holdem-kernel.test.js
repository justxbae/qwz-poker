import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as engine from "../server/poker-engine.js";
import { scenarios, setup, finishPassively } from "./fixtures/holdem-scenarios.js";

for (const scenario of scenarios) test(scenario.name, () => scenario.run(engine));

test("Omaha is rejected instead of silently playing Hold'em", () => {
  assert.throws(() => engine.createTable({ id: "owner", name: "Owner" }, { variant: "PLO" }), /Hold’em/);
});

test("unequal multi-way all-ins conserve integer micros through side pots and rake", () => {
  for (let count = 2; count <= 9; count += 1) {
    for (let seed = 0; seed < 12; seed += 1) {
      const stacks = Array.from({ length: count }, (_, index) => 100 + ((seed + 3) * (index + 7) * 37) % 1500);
      const { table, users } = setup(engine, stacks, { gameMode: "cash" });
      const first = table.activeSeatIndex;
      engine.act(table, users[first], { action: "raise", amount: stacks[first] });
      finishPassively(engine, table);
      assert.equal(table.seats.reduce((sum, seat) => sum + seat.stack, table.rakeCollected), stacks.reduce((sum, stack) => sum + stack, 0));
      assert.ok(table.seats.every((seat) => Number.isSafeInteger(seat.stack) && seat.stack >= 0));
    }
  }
});

test("stock Kernel pot builder duplicates folded contributions: keep it outside the money boundary", () => {
  const require = createRequire(import.meta.url);
  const { PotManager } = require("../vendor/poker-kernel/dist/kernel/helpers/PotManager.js");
  const state = {
    pots: [], players: [
      { id: "folded", currentRoundContribution: 20, isActive: false, chips: 100 },
      { id: "a", currentRoundContribution: 50, isActive: true, chips: 100 },
      { id: "b", currentRoundContribution: 100, isActive: true, chips: 100 }
    ]
  };
  const stockTotal = PotManager.createPots(state).reduce((sum, pot) => sum + pot.amount, 0);
  assert.equal(stockTotal, 190, "pinned upstream defect reproduction; contributions actually total 170");
  // These diagnostics document why the host still owns pots. If upstream changes,
  // reassess the boundary rather than treating the bug as desired game behavior.
});
