import test from "node:test";
import assert from "node:assert/strict";
import { acceptsTableSnapshot, matchesActionContext, actionAmountBounds } from "../public/table-context.js";

test("raise control reserves the call and permits a short all-in", () => {
  assert.deepEqual(actionAmountBounds({ canBet: false, stack: 1000, toCall: 300, minRaise: 200 }), { min: 200, max: 700, allInOnly: false });
  assert.deepEqual(actionAmountBounds({ canBet: false, stack: 80, toCall: 50, minRaise: 50 }), { min: 30, max: 30, allInOnly: true });
  assert.deepEqual(actionAmountBounds({ canBet: true, stack: 20, toCall: 0, bigBlind: 50 }), { min: 20, max: 20, allInOnly: true });
});

test("delayed pre-action and bet confirmation belong to their original turn and table", () => {
  const old = { id: "a", turnToken: "old" };
  assert.equal(matchesActionContext(old, "a", { id: "a", turnToken: "new" }), false);
  assert.equal(matchesActionContext(old, "b", { id: "b", turnToken: "old" }), false);
  assert.equal(matchesActionContext({}, "a", old), false);
  assert.equal(matchesActionContext(old, "a", { ...old }), true);
});

test("older poll and idempotent replay cannot rewind the rendered table", () => {
  const current = { id: "a", stateRevision: 8, handNumber: 3, eventSequence: 40, now: 500 };
  assert.equal(acceptsTableSnapshot(current, { ...current, stateRevision: 7, now: 600 }, "a"), false);
  assert.equal(acceptsTableSnapshot(current, { ...current, eventSequence: 39 }, "a"), false);
  assert.equal(acceptsTableSnapshot(current, { ...current, now: 499 }, "a"), false);
  assert.equal(acceptsTableSnapshot(current, { ...current }, "a"), true);
  assert.equal(acceptsTableSnapshot(current, { ...current, stateRevision: 9, eventSequence: 0 }, "a"), true);
  assert.equal(acceptsTableSnapshot(current, { ...current, stateRevision: 9 }, "b"), false);
  assert.equal(acceptsTableSnapshot(null, current, ""), false, "late response must not reopen a table after leaving");
});
