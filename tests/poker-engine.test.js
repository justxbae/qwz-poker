import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  addBuyIn,
  createTable,
  createProvablyFairDeck,
  joinTable,
  leaveTable,
  maybeStartHand,
  publicTable,
  sitIn,
  sitOut,
  startHand,
  testBotAct,
  tickTables,
  verifyProvablyFairDeck
} from "../server/poker-engine.js";

const owner = { id: "owner", name: "Owner", username: "" };
const player2 = { id: "p2", name: "Player 2", username: "" };
const player3 = { id: "p3", name: "Player 3", username: "" };

test("table seats expose Telegram profile photos", () => {
  const table = createTable({ ...owner, photoUrl: "https://example.com/owner.jpg" }, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, { ...player2, photoUrl: "https://example.com/player-2.jpg" });

  const view = publicTable(table, owner.id);

  assert.equal(view.seats[0].photoUrl, "https://example.com/owner.jpg");
  assert.equal(view.seats[1].photoUrl, "https://example.com/player-2.jpg");
});

test("provably fair deck is deterministic and verifiable", () => {
  const seed = "a".repeat(64);
  const first = createProvablyFairDeck({
    tableId: "table_1",
    handNumber: 7,
    playerIds: ["p2", "owner"],
    serverSeed: seed
  });
  const second = createProvablyFairDeck({
    tableId: "table_1",
    handNumber: 7,
    playerIds: ["owner", "p2"],
    serverSeed: seed
  });

  assert.deepEqual(first.deck, second.deck);
  assert.equal(first.deck.length, 52);
  assert.equal(new Set(first.deck).size, 52);
  assert.equal(first.proof.serverSeed, seed);
  assert.equal(first.proof.serverSeedHash.length, 64);
  assert.equal(first.proof.deckHash.length, 64);
  assert.equal(verifyProvablyFairDeck(first.deck, first.proof), true);
  assert.equal(verifyProvablyFairDeck([...first.deck].reverse(), first.proof), false);
});

test("first hand shows a starting intro before cards are dealt", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);

  assert.equal(table.status, "starting");
  assert.equal(table.pot, 0);
  assert.equal(table.smallBlindIndex, 0);
  assert.equal(table.bigBlindIndex, 1);
  assert.match(table.message, /25\/50/);
  assert.match(table.actionLog.at(-1).text, /25\/50/);
});

test("heads-up auto-start posts dealer small blind and gives dealer first preflop action", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  assert.equal(table.status, "preflop");
  assert.match(table.actionLog.map((item) => item.text).join(" | "), /Раздача #1/);
  assert.equal(table.dealerIndex, 0);
  assert.equal(table.activeSeatIndex, 0);
  assert.equal(table.pot, 75);
  assert.equal(table.seats[0].bet, 25);
  assert.equal(table.seats[1].bet, 50);

  const view = publicTable(table, owner.id);
  assert.equal(view.smallBlindIndex, 0);
  assert.equal(view.bigBlindIndex, 1);
  assert.equal(view.viewer.canCall, true);
  assert.equal(view.viewer.toCall, 25);
});

test("three-handed preflop starts left of big blind", () => {
  const table = createTable(owner, { maxPlayers: 3, smallBlind: 25 });
  joinTable(table, player2);
  joinTable(table, player3);
  maybeStartHand(table);
  startHand(table);

  assert.equal(table.status, "preflop");
  assert.equal(table.dealerIndex, 0);
  assert.equal(table.seats[1].bet, 25);
  assert.equal(table.seats[2].bet, 50);
  assert.equal(table.activeSeatIndex, 0);
});

test("folding to a raise awards the pot immediately", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  act(table, owner, { action: "raise", amount: 100 });
  act(table, player2, { action: "fold" });

  assert.equal(table.status, "showdown");
  assert.match(table.actionLog.map((item) => item.text).join(" | "), /raise до 150/);
  assert.match(table.actionLog.map((item) => item.text).join(" | "), /fold/);
  assert.equal(table.pot, 0);
  assert.equal(table.seats[0].stack + table.seats[1].stack, 20000);
  assert.match(table.message, /Owner забирает банк/);
  assert.equal(table.handHistory[0].fairnessProof.serverSeedHash.length, 64);
  assert.equal(table.handHistory[0].fairnessProof.deckHash.length, 64);
  assert.equal(table.handHistory[0].fairnessProof.algorithm, "qwz-sha256-fisher-yates-v1");
});

test("first voluntary chip action on a checked street is bet, not raise", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  act(table, owner, { action: "call" });
  act(table, player2, { action: "check" });

  const view = publicTable(table, player2.id);
  assert.equal(view.status, "flop");
  assert.equal(view.viewer.canBet, true);
  assert.equal(view.viewer.canRaise, true);

  act(table, player2, { action: "bet", amount: 100 });

  assert.equal(table.currentBet, 100);
  assert.equal(table.pot, 200);
  assert.equal(table.activeSeatIndex, 0);
});

test("leaving the table returns the current stack for persistence", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  const result = leaveTable(table, owner);

  assert.equal(result.stack, 9975);
  assert.equal(table.status, "waiting");
  assert.equal(table.seats.length, 1);
});

test("expired turn auto-checks when possible", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  act(table, owner, { action: "call" });
  table.actionDeadline = Date.now() - 1;
  tickTables(new Map([[table.id, table]]));

  assert.equal(table.status, "flop");
  assert.equal(table.activeSeatIndex, 1);

  table.actionDeadline = Date.now() - 1;
  tickTables(new Map([[table.id, table]]));

  assert.equal(table.activeSeatIndex, 0);
  assert.match(table.message, /Owner ходит|Player 2 авто-check/);
});

test("expired turn auto-folds when facing a bet", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  table.actionDeadline = Date.now() - 1;
  tickTables(new Map([[table.id, table]]));

  assert.equal(table.status, "showdown");
  assert.equal(table.pot, 0);
  assert.equal(table.seats[0].folded, true);
  assert.match(table.message, /Player 2 забирает банк/);
});

test("new hand assigns separate blinds even if a player folded last hand", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  table.actionDeadline = Date.now() - 1;
  tickTables(new Map([[table.id, table]]));
  assert.equal(table.status, "showdown");

  startHand(table);

  assert.notEqual(table.smallBlindIndex, table.bigBlindIndex);
  assert.equal(table.seats[table.smallBlindIndex].bet, 25);
  assert.equal(table.seats[table.bigBlindIndex].bet, 50);
});

test("all-in player is skipped for later betting decisions", () => {
  const table = createTable({ ...owner, stack: 100 }, { maxPlayers: 3, smallBlind: 25 });
  joinTable(table, player2);
  joinTable(table, player3);
  maybeStartHand(table);
  startHand(table);

  act(table, owner, { action: "raise", amount: 50 });
  assert.equal(table.seats[0].stack, 0);
  assert.equal(table.activeSeatIndex, 1);

  act(table, player2, { action: "call" });
  assert.equal(table.activeSeatIndex, 2);

  act(table, player3, { action: "call" });
  assert.equal(table.status, "flop");
  assert.notEqual(table.activeSeatIndex, 0);

  act(table, player2, { action: "check" });
  act(table, player3, { action: "check" });

  assert.equal(table.status, "turn");
  assert.notEqual(table.activeSeatIndex, 0);
});

test("short all-in raise below minimum is allowed", () => {
  const table = createTable({ ...owner, stack: 80 }, { maxPlayers: 3, smallBlind: 25 });
  joinTable(table, player2);
  joinTable(table, player3);
  maybeStartHand(table);
  startHand(table);

  act(table, owner, { action: "raise", amount: 50 });
  assert.equal(table.seats[0].stack, 0);
  assert.equal(table.seats[0].bet, 80);
  assert.match(table.actionLog.map((item) => item.text).join(" | "), /all-in 80/);

  act(table, player2, { action: "call" });
  act(table, player3, { action: "call" });

  assert.equal(table.status, "flop");
  assert.equal(table.pot, 240);
  assert.notEqual(table.activeSeatIndex, 0);
});

test("remaining player must answer an all-in after another player folds", () => {
  const table = createTable({ ...owner, stack: 100 }, { maxPlayers: 3, smallBlind: 25 });
  joinTable(table, player2);
  joinTable(table, player3);
  maybeStartHand(table);
  startHand(table);

  act(table, owner, { action: "raise", amount: 50 });
  assert.equal(table.seats[0].stack, 0);
  assert.equal(table.seats[0].bet, 100);
  assert.equal(table.activeSeatIndex, 1);

  act(table, player2, { action: "fold" });

  assert.equal(table.status, "preflop");
  assert.equal(table.activeSeatIndex, 2);
  assert.equal(table.seats[2].bet, 50);
  assert.equal(table.pot, 175);

  act(table, player3, { action: "call" });

  assert.equal(table.seats[2].totalBet, 100);
  assert.equal(table.pot, 225);
  assert.equal(table.status, "runout");
});

test("heads-up all-in runs the board without asking for meaningless checks", () => {
  const table = createTable({ ...owner, stack: 50 }, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  act(table, owner, { action: "call" });

  assert.equal(table.status, "runout");
  assert.equal(table.activeSeatIndex, -1);
  assert.equal(table.communityCards.length, 3);
  assert.equal(table.runoutQueue.length, 2);

  while (table.status === "runout") {
    table.runoutNextAt = Date.now() - 1;
    tickTables(new Map([[table.id, table]]));
  }

  assert.equal(table.status, "showdown");
  assert.equal(table.communityCards.length, 5);
});

test("showdown distributes main pot and side pot by contribution eligibility", () => {
  const table = createTable({ ...owner, stack: 100 }, { maxPlayers: 3, smallBlind: 25 });
  joinTable(table, { ...player2, stack: 300 });
  joinTable(table, { ...player3, stack: 300 });
  maybeStartHand(table);
  startHand(table);

  table.seats[0].cards = ["As", "Ah"];
  table.seats[1].cards = ["Ks", "Kh"];
  table.seats[2].cards = ["Qs", "Qh"];
  table.deck = ["4s", "Jc", "9h", "7d", "2c"];

  act(table, owner, { action: "raise", amount: 50 });
  assert.equal(table.seats[0].stack, 0);
  act(table, player2, { action: "call" });
  act(table, player3, { action: "call" });

  act(table, player2, { action: "check" });
  act(table, player3, { action: "bet", amount: 100 });
  act(table, player2, { action: "call" });
  act(table, player2, { action: "check" });
  act(table, player3, { action: "check" });
  act(table, player2, { action: "check" });
  act(table, player3, { action: "check" });

  assert.equal(table.status, "showdown");
  assert.equal(table.pot, 0);
  assert.equal(table.rakeCollected, 25);
  assert.equal(table.seats[0].stack, 275);
  assert.equal(table.seats[1].stack, 300);
  assert.equal(table.seats[2].stack, 100);
  assert.match(table.message, /Owner забирает банк 275/);
  assert.doesNotMatch(table.message, /rake/i);
  assert.match(table.message, /Player 2 забирает сайд-пот 1 200/);
});

test("showdown records hand history with board, pots, and player results", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);
  table.seats[0].cards = ["As", "Ah"];
  table.seats[1].cards = ["Ks", "Kh"];
  table.deck = ["2c", "7d", "9h", "Jc", "4s"];

  act(table, owner, { action: "call" });
  act(table, player2, { action: "check" });
  act(table, player2, { action: "check" });
  act(table, owner, { action: "check" });
  act(table, player2, { action: "check" });
  act(table, owner, { action: "check" });
  act(table, player2, { action: "check" });
  act(table, owner, { action: "check" });

  assert.equal(table.status, "showdown");
  assert.equal(table.handHistory.length, 1);
  assert.deepEqual(table.handHistory[0].board, ["4s", "Jc", "9h", "7d", "2c"]);
  assert.equal(table.handHistory[0].rake, 5);
  assert.equal(table.handHistory[0].pots[0].amount, 95);
  assert.equal(table.handHistory[0].pots[0].grossAmount, 100);
  assert.equal(table.handHistory[0].pots[0].rake, 5);
  assert.deepEqual(table.handHistory[0].pots[0].winners, ["Owner"]);
  assert.equal(table.handHistory[0].seats.find((seat) => seat.name === "Owner").profit, 45);

  const view = publicTable(table, owner.id);
  assert.equal(view.handHistory.length, 1);
});

test("owner can manually choose fold or call for active test players", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  const bot = { id: "test_manual", name: "Bot", username: "" };
  joinTable(table, bot);
  maybeStartHand(table);
  startHand(table);

  assert.equal(table.activeSeatIndex, 0);
  act(table, owner, { action: "raise", amount: 100 });

  assert.equal(table.seats[table.activeSeatIndex].userId, bot.id);
  let view = publicTable(table, owner.id);
  assert.equal(view.viewer.canControlTestBot, true);
  assert.equal(view.viewer.testBotToCall, 100);

  testBotAct(table, owner, { action: "call" });
  assert.equal(table.status, "flop");

  view = publicTable(table, owner.id);
  assert.equal(view.viewer.canControlTestBot, true);
  testBotAct(table, owner, { action: "fold" });

  assert.equal(table.status, "showdown");
  assert.equal(table.seats.find((seat) => seat.userId === bot.id).folded, true);
});

test("folded cards stay hidden from other players at showdown", () => {
  const table = createTable(owner, { maxPlayers: 3, smallBlind: 25 });
  joinTable(table, player2);
  joinTable(table, player3);
  maybeStartHand(table);
  startHand(table);

  act(table, owner, { action: "fold" });
  act(table, player2, { action: "call" });
  act(table, player3, { action: "check" });
  act(table, player2, { action: "check" });
  act(table, player3, { action: "check" });
  act(table, player2, { action: "check" });
  act(table, player3, { action: "check" });
  act(table, player2, { action: "check" });
  act(table, player3, { action: "check" });

  assert.equal(table.status, "showdown");
  const view = publicTable(table, player2.id);
  const foldedOwner = view.seats.find((seat) => seat.userId === owner.id);
  assert.deepEqual(foldedOwner.cards, ["hidden", "hidden"]);
});

test("sit out during active hand is applied after fold", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);

  sitOut(table, owner);
  assert.equal(table.seats[0].sittingOut, false);
  assert.equal(table.seats[0].sitOutNextHand, true);

  act(table, owner, { action: "fold" });

  assert.equal(table.status, "showdown");
  assert.equal(table.seats[0].sittingOut, true);
  assert.equal(table.seats[0].sittingOutReason, "away");
});

test("busted all-in loser sits out and does not receive next hand cards", () => {
  const table = createTable({ ...owner, stack: 50 }, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);
  maybeStartHand(table);
  startHand(table);
  table.seats[0].cards = ["2c", "3d"];
  table.seats[1].cards = ["As", "Ah"];
  table.deck = ["4c", "5d", "9h", "Ts", "Jc"];

  act(table, owner, { action: "call" });
  while (table.status === "runout") {
    table.runoutNextAt = Date.now() - 1;
    tickTables(new Map([[table.id, table]]));
  }

  const busted = table.seats.find((seat) => seat.stack === 0);
  assert.equal(busted.sittingOut, true);
  assert.equal(busted.sittingOutReason, "rebuy");

  startHand(table);
  assert.equal(busted.cards.length, 0);
  assert.equal(busted.folded, true);

  addBuyIn(table, { id: busted.userId }, 1000);
  assert.equal(busted.sittingOut, false);
  assert.equal(busted.stack, 1000);
});

test("sit out keeps the seat but skips future hands until sit in", () => {
  const table = createTable(owner, { maxPlayers: 2, smallBlind: 25 });
  joinTable(table, player2);

  sitOut(table, player2);
  assert.equal(table.seats[1].sittingOut, true);
  maybeStartHand(table);
  assert.equal(table.status, "waiting");

  sitIn(table, player2);
  assert.equal(table.seats[1].sittingOut, false);
  maybeStartHand(table);
  assert.equal(table.status, "starting");
});
