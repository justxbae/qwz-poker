import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../server/poker-engine.js";
import { setup, finishPassively } from "./fixtures/holdem-scenarios.js";

test("turn identity is required by the HTTP boundary and survives snapshot recovery", () => {
  const { table, users } = setup(engine);
  const token = engine.publicTable(table, users[0].id).turnToken;
  assert.ok(token);
  const restored = JSON.parse(JSON.stringify(table));
  assert.equal(engine.publicTable(restored, users[0].id).turnToken, token);
  const before = JSON.stringify(restored);
  assert.throws(() => engine.act(restored, users[0], { action: "call" }, { requireTurnToken: true }));
  assert.equal(JSON.stringify(restored), before);
  engine.act(restored, users[0], { action: "call", turnToken: token }, { requireTurnToken: true });
  assert.notEqual(engine.publicTable(restored, users[1].id).turnToken, token);
});

test("late show/muck cannot disclose a later hand", () => {
  const { table, users } = setup(engine);
  table.seats[0].cards = ["As", "Ah"];
  table.seats[1].cards = ["Ks", "Kh"];
  table.deck = ["2c", "7d", "9h", "Jc", "4s"];
  finishPassively(engine, table);
  const view = engine.publicTable(table, users[1].id);
  assert.ok(view.showMuck.canDecide);
  const before = JSON.stringify(table);
  assert.throws(() => engine.chooseShowMuck(table, users[1], "show", { windowToken: "previous-hand", requireWindowToken: true }));
  assert.throws(() => engine.chooseShowMuck(table, users[1], "show", { requireWindowToken: true }));
  assert.equal(JSON.stringify(table), before);
  engine.chooseShowMuck(table, users[1], "show", { windowToken: view.showMuck.windowToken, requireWindowToken: true });
  assert.equal(table.showMuckWindow.choices[users[1].id], "show");
});

test("blind orbit remains clockwise after JSON recovery", () => {
  const { table: original } = setup(engine, [10000, 10000, 10000, 10000]);
  let table = original;
  const posted = [];
  for (let hand = 0; hand < 12; hand += 1) {
    posted.push(table.seats[table.bigBlindIndex].userId);
    finishPassively(engine, table);
    if (table.showMuckWindow) table.showMuckWindow.deadline = Date.now() - 1;
    table = JSON.parse(JSON.stringify(table));
    engine.startHand(table);
  }
  assert.deepEqual(posted, ["p2", "p3", "p0", "p1", "p2", "p3", "p0", "p1", "p2", "p3", "p0", "p1"]);
});

test("second player arriving before initial timeout still starts the hand", () => {
  const user = { id: "waiting", name: "Игрок", stack: 1000 };
  const table = engine.createTable(user);
  table.waitingSince = Date.now() - engine.INITIAL_WAIT_TIMEOUT_MS - 1;
  engine.joinTable(table, { id: "arrived", name: "Соперник", stack: 1000 });
  engine.tickTables(new Map([[table.id, table]]));
  assert.equal(table.status, "starting");
  assert.ok(table.seats.every((seat) => !seat.sittingOut));
});

test("queued sit-out does not hide a completed all-in hand", () => {
  const { table, users } = setup(engine, [50, 1000]);
  table.seats[0].cards = ["As", "Ah"];
  table.seats[1].cards = ["Ks", "Kh"];
  table.deck = ["2c", "7d", "9h", "Jc", "4s"];
  engine.sitOut(table, users[0]);
  engine.act(table, users[0], { action: "call" });
  finishPassively(engine, table);
  assert.equal(table.seats[0].sittingOut, true);
  assert.equal(table.seats[0].folded, false);
  assert.deepEqual(engine.publicTable(table, "observer").seats[0].cards, ["As", "Ah"]);
});

test("5000 reproducible mixed-action hands preserve money, cards and valid turns", () => {
  for (let seed = 1; seed <= 5000; seed += 1) {
    let randomState = seed;
    const random = (max) => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState % max;
    };
    const count = 2 + random(8);
    const stacks = Array.from({ length: count }, () => 100 + random(5000));
    const { table } = setup(engine, stacks, { gameMode: "cash" });
    let supplied = stacks.reduce((sum, stack) => sum + stack, 0);
    let returned = 0;
    for (let step = 0; table.status !== "showdown" && step < 200; step += 1) {
      const total = () => table.seats.reduce((sum, seat) => sum + seat.stack, table.pot + table.rakeCollected + returned);
      assert.equal(total(), supplied, `money before action: seed=${seed}, step=${step}`);
      if (table.status === "runout") {
        table.runoutNextAt = Date.now() - 1;
        engine.tickTables(new Map([[table.id, table]]));
        continue;
      }
      if (random(17) === 0 && table.seats.length > 2) {
        const leaving = table.seats[random(table.seats.length)];
        if (leaving.stack > 0) {
          returned += engine.leaveTable(table, { id: leaving.userId }).stack;
          continue;
        }
      }
      if (random(19) === 0 && table.seats.length < table.maxPlayers) {
        engine.joinTable(table, { id: `late-${seed}-${step}`, name: "Late", stack: 1000 });
        supplied += 1000;
      }
      const seat = table.seats[table.activeSeatIndex];
      assert.ok(seat && seat.cards.length === 2 && !seat.folded && seat.stack > 0, `invalid turn: seed=${seed}, step=${step}`);
      const view = engine.publicTable(table, seat.userId);
      const legal = view.viewer.legalActions;
      assert.ok(legal.length > 0);
      const picked = legal[random(legal.length)];
      const body = { action: picked.type, turnToken: view.turnToken };
      if (picked.type === "bet" || picked.type === "raise") {
        const extra = picked.min + random(picked.max - picked.min + 1);
        body.amount = picked.type === "raise" ? extra - view.viewer.toCall : extra;
      }
      if (random(23) === 0) engine.sitOut(table, { id: seat.userId });
      engine.act(table, { id: seat.userId }, body, { requireTurnToken: true });
      assert.equal(total(), supplied, `money after action: seed=${seed}, step=${step}`);
      assert.ok(table.seats.every((player) => Number.isSafeInteger(player.stack) && player.stack >= 0));
    }
    assert.equal(table.status, "showdown", `hand failed to finish: seed=${seed}`);
    const cards = [...table.communityCards, ...table.seats.flatMap((seat) => seat.cards), ...(table.departedContributions || []).flatMap((seat) => seat.cards)];
    assert.equal(new Set(cards).size, cards.length, `duplicate card: seed=${seed}`);
    assert.equal(table.seats.reduce((sum, seat) => sum + seat.stack, returned + table.rakeCollected), supplied, `final money: seed=${seed}`);
  }
});
