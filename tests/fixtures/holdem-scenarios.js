import assert from "node:assert/strict";

export function setup(engine, stacks = [1000, 1000], options = {}) {
  const users = stacks.map((stack, index) => ({ id: `p${index}`, name: `Игрок ${index}`, stack }));
  const table = engine.createTable(users[0], { maxPlayers: stacks.length, smallBlind: 25, bigBlind: 50, ...options });
  table.id = "kernel-comparison-table";
  for (const user of users.slice(1)) engine.joinTable(table, user);
  for (const user of users) engine.setPlayerFairnessSeed(table, user, `fixed-player-seed-${user.id}`);
  table.pendingServerSeed = "a".repeat(64);
  engine.startHand(table);
  return { table, users };
}

export function finishPassively(engine, table, onTurn = () => {}) {
  for (let steps = 0; table.status !== "showdown" && steps < 150; steps += 1) {
    if (table.status === "runout") {
      table.runoutNextAt = Date.now() - 1;
      engine.tickTables(new Map([[table.id, table]]));
      continue;
    }
    const seat = table.seats[table.activeSeatIndex];
    assert.ok(seat && seat.cards.length === 2 && !seat.folded && seat.stack > 0, "turn must belong to a dealt-in stack");
    onTurn(seat);
    engine.act(table, { id: seat.userId }, { action: table.currentBet > seat.bet ? "call" : "check" });
  }
  assert.equal(table.status, "showdown", "hand must terminate without waiting for a nonexistent action");
}

export const scenarios = [
  {
    id: "under-minimum-no-promotion", name: "Слишком маленький рейз не увеличивается за игрока", category: "money",
    run(engine) {
      const { table, users } = setup(engine, [1000, 1000, 1000]);
      engine.act(table, users[0], { action: "raise", amount: 250 });
      const before = JSON.stringify(table);
      assert.throws(() => engine.act(table, users[1], { action: "raise", amount: 50 }));
      assert.equal(JSON.stringify(table), before);
      engine.act(table, users[1], { action: "raise", amount: 250 });
      assert.equal(table.currentBet, 550);
    }
  },
  {
    id: "exact-short-all-in", name: "Неполный рейз допустим, если это весь оставшийся стек", category: "rules",
    run(engine) {
      const { table, users } = setup(engine, [80, 1000, 1000]);
      engine.act(table, users[0], { action: "raise", amount: 30 });
      assert.equal(table.seats[0].bet, 80);
      assert.equal(table.seats[0].stack, 0);
      assert.equal(table.minRaise, 50);
      finishPassively(engine, table);
    }
  },
  {
    id: "dealer-leave-preflop", name: "Выход дилера на префлопе не останавливает очередь", category: "tables",
    run(engine) {
      const { table, users } = setup(engine, [1000, 1000, 1000]);
      const returned = engine.leaveTable(table, users[0]).stack;
      finishPassively(engine, table);
      assert.equal(table.seats.reduce((sum, seat) => sum + seat.stack, returned + table.rakeCollected), 3000);
    }
  },
  {
    id: "three-to-two-bb", name: "Переход 3→2 не заставляет прежнего BB платить повторно", category: "tables",
    run(engine) {
      const { table, users } = setup(engine, [1000, 1000, 1000]);
      engine.leaveTable(table, users[0]);
      finishPassively(engine, table);
      if (table.showMuckWindow) table.showMuckWindow.deadline = Date.now() - 1;
      engine.startHand(table);
      assert.equal(table.seats[table.bigBlindIndex].userId, users[1].id);
      assert.equal(table.seats[table.dealerIndex].userId, users[2].id);
    }
  },
  {
    id: "bb-leaves-orbit", name: "Выход BB сохраняет очередь оплаты большого блайнда", category: "tables",
    run(engine) {
      const { table, users } = setup(engine, [1000, 1000, 1000, 1000]);
      engine.leaveTable(table, users[2]);
      finishPassively(engine, table);
      if (table.showMuckWindow) table.showMuckWindow.deadline = Date.now() - 1;
      engine.startHand(table);
      assert.equal(table.seats[table.bigBlindIndex].userId, users[3].id);
    }
  },
  {
    id: "intro-seat-removal", name: "Выход SB во время интро не ломает старт раздачи", category: "tables",
    run(engine) {
      const users = [0, 1, 2].map((index) => ({ id: `intro${index}`, name: "Игрок", stack: 1000 }));
      const table = engine.createTable(users[0], { maxPlayers: 3 });
      engine.joinTable(table, users[1]); engine.joinTable(table, users[2]);
      engine.maybeStartHand(table);
      engine.leaveTable(table, users[1]);
      engine.startHand(table);
      assert.equal(table.status, "preflop");
      assert.notEqual(table.smallBlindIndex, table.bigBlindIndex);
      finishPassively(engine, table);
    }
  },
  {
    id: "folded-overbet-conservation", name: "Выход рейзера против коротких стеков не теряет часть банка", category: "money",
    run(engine) {
      const { table, users } = setup(engine, [1000, 50, 50]);
      engine.act(table, users[0], { action: "raise", amount: 150 });
      const returned = engine.leaveTable(table, users[0]).stack;
      finishPassively(engine, table);
      assert.equal(table.seats.reduce((sum, seat) => sum + seat.stack, returned + table.rakeCollected), 1100);
      assert.equal(table.pot, 0);
    }
  },
  {
    id: "stale-turn-token", name: "Запрос прежнего хода нельзя применить на новой улице", category: "timers",
    run(engine) {
      const { table, users } = setup(engine);
      const token = engine.publicTable(table, users[0].id).turnToken || "old-turn";
      engine.act(table, users[0], { action: "call" });
      engine.act(table, users[1], { action: "check" });
      engine.act(table, users[1], { action: "check" });
      const before = JSON.stringify(table);
      assert.throws(() => engine.act(table, users[0], { action: "check", turnToken: token }));
      assert.equal(JSON.stringify(table), before);
      engine.act(table, users[0], { action: "check", turnToken: engine.publicTable(table, users[0].id).turnToken });
      assert.equal(table.status, "turn");
    }
  },
  {
    id: "zero-stack", name: "Нулевой стек не превращается в бесплатные 10000 фишек", category: "money",
    run(engine) {
      const user = { id: "empty", name: "Пустой", stack: 0 };
      const table = engine.createTable(user);
      assert.equal(table.seats[0].stack, 0);
      engine.joinTable(table, { id: "funded", name: "Игрок", stack: 1000 });
      engine.maybeStartHand(table);
      assert.equal(table.status, "waiting");
    }
  },
  {
    id: "fractional-rebuy", name: "Дробная докупка отклоняется без изменения стека", category: "money",
    run(engine) {
      const { table, users } = setup(engine);
      engine.act(table, users[0], { action: "fold" });
      const before = JSON.stringify(table);
      assert.throws(() => engine.addBuyIn(table, users[0], 1.5));
      assert.equal(JSON.stringify(table), before);
    }
  },
  {
    id: "fractional-blind", name: "Дробный блайнд отклоняется до создания стола", category: "money",
    run(engine) {
      assert.throws(() => engine.createTable({ id: "owner", name: "Игрок" }, { smallBlind: 1.5 }));
    }
  },
  {
    id: "heads-up-order", name: "Heads-up: блайнды и порядок до/после флопа", category: "rules",
    run(engine) {
      const { table, users } = setup(engine);
      assert.equal(table.dealerIndex, table.smallBlindIndex);
      assert.equal(table.activeSeatIndex, table.dealerIndex);
      engine.act(table, users[0], { action: "call" });
      engine.act(table, users[1], { action: "check" });
      assert.equal(table.status, "flop");
      assert.equal(table.activeSeatIndex, table.bigBlindIndex);
    }
  },
  {
    id: "three-handed-order", name: "Три игрока: первым действует BTN", category: "rules",
    run(engine) {
      const { table } = setup(engine, [1000, 1000, 1000]);
      assert.equal(table.activeSeatIndex, table.dealerIndex);
      assert.equal(new Set([table.dealerIndex, table.smallBlindIndex, table.bigBlindIndex]).size, 3);
    }
  },
  {
    id: "short-all-in-closed", name: "Короткий all-in не открывает повторный рейз", category: "rules",
    run(engine) {
      const { table, users } = setup(engine, [1000, 130, 1000, 1000]);
      engine.act(table, users[3], { action: "raise", amount: 50 });
      engine.act(table, users[0], { action: "call" });
      engine.act(table, users[1], { action: "raise", amount: 50 });
      engine.act(table, users[2], { action: "call" });
      assert.equal(table.activeSeatIndex, 3);
      assert.equal(table.currentBet, 130);
      const before = JSON.stringify(table);
      assert.throws(() => engine.act(table, users[3], { action: "raise", amount: 50 }));
      assert.equal(JSON.stringify(table), before, "rejected raise must not mutate money or timers");
      assert.equal(engine.publicTable(table, users[3].id).viewer.canRaise, false);
      finishPassively(engine, table);
    }
  },
  {
    id: "cumulative-short-reopens", name: "Сумма коротких all-in вновь открывает полный рейз", category: "rules",
    run(engine) {
      const { table, users } = setup(engine, [130, 160, 1000, 1000, 1000]);
      engine.act(table, users[3], { action: "raise", amount: 50 });
      engine.act(table, users[4], { action: "call" });
      engine.act(table, users[0], { action: "raise", amount: 50 });
      engine.act(table, users[1], { action: "raise", amount: 50 });
      engine.act(table, users[2], { action: "call" });
      assert.equal(table.minRaise, 50);
      assert.equal(engine.publicTable(table, users[3].id).viewer.canRaise, true);
      engine.act(table, users[3], { action: "raise", amount: 50 });
      assert.equal(table.currentBet, 210);
      finishPassively(engine, table);
    }
  },
  {
    id: "checked-short-opening", name: "Check перед неполной all-in ставкой не даёт повторный рейз", category: "rules",
    run(engine) {
      const { table, users } = setup(engine, [1000, 1000, 70]);
      engine.act(table, users[0], { action: "call" });
      engine.act(table, users[1], { action: "call" });
      engine.act(table, users[2], { action: "check" });
      engine.act(table, users[1], { action: "check" });
      engine.act(table, users[2], { action: "bet", amount: 50 });
      assert.equal(table.currentBet, 20);
      engine.act(table, users[0], { action: "call" });
      assert.equal(table.activeSeatIndex, 1);
      assert.throws(() => engine.act(table, users[1], { action: "raise", amount: 50 }));
      finishPassively(engine, table);
    }
  },
  {
    id: "full-all-in-minimum", name: "Полный all-in задаёт новый минимальный рейз", category: "rules",
    run(engine) {
      const { table, users } = setup(engine, [300, 1000, 1000]);
      engine.act(table, users[0], { action: "raise", amount: 250 });
      assert.equal(table.currentBet, 300);
      assert.equal(table.minRaise, 250);
    }
  },
  {
    id: "short-blind", name: "Короткий BB: колл номинального блайнда", category: "rules",
    run(engine) {
      const { table, users } = setup(engine, [1000, 1000, 10]);
      engine.act(table, users[0], { action: "call" });
      assert.equal(table.seats[0].bet, 50);
      assert.equal(table.minRaise, 50);
      finishPassively(engine, table);
      assert.equal(table.seats.reduce((sum, seat) => sum + seat.stack, table.rakeCollected), 2010);
    }
  },
  {
    id: "folded-highest", name: "Выход рейзера не уменьшает ставку для остальных", category: "rules",
    run(engine) {
      const { table, users } = setup(engine, [1000, 1000, 1000, 1000]);
      engine.act(table, users[3], { action: "raise", amount: 150 });
      engine.leaveTable(table, users[3]);
      engine.act(table, users[0], { action: "call" });
      assert.equal(table.seats[0].bet, 200);
      finishPassively(engine, table);
    }
  },
  {
    id: "late-join", name: "Севший во время раздачи ждёт следующую руку", category: "tables",
    run(engine) {
      const { table } = setup(engine, [1000, 1000], { maxPlayers: 3 });
      engine.joinTable(table, { id: "late", name: "Поздний игрок", stack: 1000 });
      assert.equal(table.seats[2].cards.length, 0);
      finishPassively(engine, table, (seat) => assert.notEqual(seat.userId, "late"));
      assert.equal(table.seats[2].stack, 1000);
    }
  },
  {
    id: "mid-hand-restart", name: "Повторный старт не стирает разыгрываемый банк", category: "tables",
    run(engine) {
      const { table, users } = setup(engine);
      const before = JSON.stringify(table);
      assert.throws(() => engine.startHand(table, users[0]));
      assert.equal(JSON.stringify(table), before);
    }
  },
  {
    id: "waiting-intro", name: "Ожидание второго игрока, интро и автостарт", category: "tables",
    run(engine) {
      const owner = { id: "owner", name: "Владелец", stack: 1000 };
      const table = engine.createTable(owner);
      engine.maybeStartHand(table);
      assert.equal(table.status, "waiting");
      engine.joinTable(table, { id: "other", name: "Игрок", stack: 1000 });
      engine.maybeStartHand(table);
      assert.equal(table.status, "starting");
      table.startIntroUntil = Date.now() - 1;
      engine.tickTables(new Map([[table.id, table]]));
      assert.equal(table.status, "preflop");
    }
  },
  {
    id: "wrong-turn", name: "Чужой ход отклоняется без изменения стола", category: "tables",
    run(engine) {
      const { table, users } = setup(engine);
      const before = JSON.stringify(table);
      assert.throws(() => engine.act(table, users[1], { action: "fold" }));
      assert.equal(JSON.stringify(table), before);
    }
  },
  {
    id: "timeout-fold", name: "Таймер: fold при необходимости колла", category: "timers",
    run(engine) {
      const { table } = setup(engine);
      table.actionDeadline = Date.now() - 1;
      engine.tickTables(new Map([[table.id, table]]));
      assert.equal(table.status, "showdown");
      assert.ok(table.seats[0].folded);
    }
  },
  {
    id: "late-action", name: "Ход после дедлайна отклоняется до очередного тика", category: "timers",
    run(engine) {
      const { table, users } = setup(engine);
      table.actionDeadline = Date.now() - 1;
      const before = JSON.stringify(table);
      assert.throws(() => engine.act(table, users[0], { action: "call" }));
      assert.equal(JSON.stringify(table), before);
      engine.tickTables(new Map([[table.id, table]]));
      assert.equal(table.status, "showdown");
    }
  },
  {
    id: "blind-only-all-in", name: "All-in блайндом запускает runout без хода пустого стека", category: "rules",
    run(engine) {
      const { table } = setup(engine, [10, 1000]);
      assert.equal(table.status, "runout");
      assert.equal(table.activeSeatIndex, -1);
      finishPassively(engine, table);
      assert.equal(table.seats.reduce((sum, seat) => sum + seat.stack, table.rakeCollected), 1010);
    }
  },
  {
    id: "timeout-check", name: "Таймер: check при отсутствии долга", category: "timers",
    run(engine) {
      const { table, users } = setup(engine);
      engine.act(table, users[0], { action: "call" });
      table.actionDeadline = Date.now() - 1;
      engine.tickTables(new Map([[table.id, table]]));
      assert.equal(table.status, "flop");
      assert.equal(table.seats[1].folded, false);
    }
  },
  {
    id: "sitout-fold", name: "Sit out в раздаче применяется после fold", category: "tables",
    run(engine) {
      const { table, users } = setup(engine);
      engine.sitOut(table, users[0]);
      assert.equal(table.seats[0].sittingOut, false);
      engine.act(table, users[0], { action: "fold" });
      assert.equal(table.seats[0].sittingOut, true);
      engine.sitIn(table, users[0]);
      assert.equal(table.seats[0].sittingOut, false);
    }
  },
  {
    id: "rebuy-boundary", name: "Докупка разрешена между раздачами", category: "tables",
    run(engine) {
      const { table, users } = setup(engine);
      assert.throws(() => engine.addBuyIn(table, users[0], 100));
      engine.act(table, users[0], { action: "fold" });
      const before = table.seats[0].stack;
      engine.addBuyIn(table, users[0], 100);
      assert.equal(table.seats[0].stack, before + 100);
    }
  },
  {
    id: "private-cards", name: "Зритель не получает карманные карты и серверный seed", category: "privacy",
    run(engine) {
      const { table } = setup(engine);
      const view = engine.publicTable(table, "observer");
      for (const seat of view.seats) assert.deepEqual(seat.cards, ["hidden", "hidden"]);
      assert.ok(!JSON.stringify(view).includes('"serverSeed":'));
      assert.ok(!view.events.some((event) => event.type === "HoleCardsDealt"));
    }
  },
  {
    id: "snapshot-reopen-rights", name: "Снимок сохраняет запрет рейза после короткого all-in", category: "recovery",
    run(engine) {
      const { table, users } = setup(engine, [1000, 130, 1000, 1000]);
      engine.act(table, users[3], { action: "raise", amount: 50 });
      engine.act(table, users[0], { action: "call" });
      engine.act(table, users[1], { action: "raise", amount: 50 });
      engine.act(table, users[2], { action: "call" });
      const restored = JSON.parse(JSON.stringify(table));
      assert.throws(() => engine.act(restored, users[3], { action: "raise", amount: 50 }));
      finishPassively(engine, restored);
    }
  },
  ...[0.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((amount) => ({
    id: `invalid-amount-${String(amount)}`, name: `Некорректная сумма ${String(amount)} отклоняется`, category: "money",
    run(engine) {
      const { table, users } = setup(engine);
      const before = JSON.stringify(table);
      assert.throws(() => engine.act(table, users[0], { action: "raise", amount }));
      assert.equal(JSON.stringify(table), before);
    }
  })),
  ...Array.from({ length: 8 }, (_, index) => index + 2).map((count) => ({
    id: `players-${count}`, name: `Hold’em ${count}-max: уникальные карты, завершение и сохранение денег`, category: "capacity",
    run(engine) {
      const { table } = setup(engine, Array(count).fill(1000));
      assert.equal(new Set(table.seats.flatMap((seat) => seat.cards)).size, count * 2);
      finishPassively(engine, table);
      assert.equal(table.communityCards.length, 5);
      assert.equal(table.seats.reduce((sum, seat) => sum + seat.stack, table.rakeCollected), count * 1000);
      assert.ok(table.seats.every((seat) => Number.isSafeInteger(seat.stack)));
    }
  }))
];
