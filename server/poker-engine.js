import { createHash, randomBytes } from "node:crypto";
import { calculateRake } from "./economy.js";
import { resolveShowdown } from "./poker-evaluator.js";

export const ACTION_TIMEOUT_MS = 20000;
export const NEXT_HAND_DELAY_MS = 5000;
export const START_INTRO_MS = 3500;
export const RUNOUT_CARD_DELAY_MS = 900;
export const REBUY_TIMEOUT_MS = 3 * 60 * 1000;
export const SIT_OUT_TIMEOUT_MS = 5 * 60 * 1000;

export function createTable(owner, body = {}) {
  const maxPlayers = clamp(Number(body.maxPlayers || 6), 2, 6);
  const smallBlind = clamp(Number(body.smallBlind || 25), 1, 100000);
  const bigBlind = smallBlind * 2;
  const isPrivate = body.visibility === "private" || body.isPrivate === true;
  const isSystem = body.isSystem === true;

  const table = {
    id: randomId("tbl"),
    name: String(body.name || `${owner?.name || "QWZ"}'s table`).slice(0, 40),
    ownerId: owner?.id || "system",
    isPrivate,
    isSystem,
    maxPlayers,
    smallBlind,
    bigBlind,
    status: "waiting",
    handNumber: 0,
    startIntroUntil: 0,
    communityCards: [],
    pot: 0,
    dealerIndex: -1,
    smallBlindIndex: -1,
    bigBlindIndex: -1,
    activeSeatIndex: -1,
    currentBet: 0,
    minRaise: bigBlind,
    lastAggressorIndex: -1,
    actionDeadline: 0,
    handFinishedAt: 0,
    runoutQueue: [],
    runoutNextAt: 0,
    message: "Ожидание игроков",
    actionLog: [],
    handHistory: [],
    fairnessProof: null,
    rakeCollected: 0,
    seats: [],
    deck: []
  };

  if (owner) joinTable(table, owner);
  return table;
}

export function joinTable(table, user) {
  if (table.seats.some((seat) => seat.userId === user.id)) return;
  if (table.seats.length >= table.maxPlayers) throwHttp(409, "Table is full");

  table.seats.push({
    userId: user.id,
    name: user.name,
    username: user.username,
    photoUrl: user.photoUrl || "",
    stack: user.stack || 10000,
    bet: 0,
    totalBet: 0,
    handStartStack: user.stack || 10000,
    folded: false,
    acted: false,
    sittingOut: false,
    sitOutNextHand: false,
    sittingOutUntil: 0,
    sittingOutReason: "",
    fairnessSeed: createPlayerFairnessSeed("server-fallback"),
    cards: []
  });
}

export function setPlayerFairnessSeed(table, user, seed) {
  const seat = table.seats.find((candidate) => candidate.userId === user.id);
  if (!seat) throwHttp(404, "Вы не сидите за этим столом");
  if (!canBuyIn(table)) throwHttp(409, "Seed можно менять только между раздачами");

  const normalizedSeed = String(seed || "").trim();
  if (normalizedSeed.length < 16) throwHttp(400, "Seed должен быть не короче 16 символов");
  if (normalizedSeed.length > 256) throwHttp(400, "Seed должен быть не длиннее 256 символов");

  seat.fairnessSeed = createPlayerFairnessSeed("player", normalizedSeed);
  table.message = `${seat.name} обновил fairness seed`;
  addLog(table, table.message);
  return publicPlayerFairnessSeed(seat);
}

export function leaveTable(table, user) {
  const seatIndex = table.seats.findIndex((seat) => seat.userId === user.id);
  if (seatIndex === -1) throwHttp(404, "Вы не сидите за этим столом");

  const [seat] = table.seats.splice(seatIndex, 1);
  normalizeIndexesAfterSeatRemoval(table, seatIndex);

  if (table.seats.length < 2) {
    table.status = "waiting";
    table.communityCards = [];
    table.pot = 0;
    table.currentBet = 0;
    table.activeSeatIndex = -1;
    table.smallBlindIndex = -1;
    table.bigBlindIndex = -1;
    table.startIntroUntil = 0;
    table.actionDeadline = 0;
    table.runoutQueue = [];
    table.runoutNextAt = 0;
    table.message = "Ожидание игроков";
    for (const remainingSeat of table.seats) {
      remainingSeat.bet = 0;
      remainingSeat.totalBet = 0;
      remainingSeat.handStartStack = remainingSeat.stack;
      remainingSeat.folded = false;
      remainingSeat.acted = false;
      remainingSeat.sitOutNextHand = false;
      remainingSeat.cards = [];
    }
  } else if (table.status !== "waiting" && table.status !== "showdown") {
    if (!seat.folded && activeSeats(table).length === 1) {
      finishByFold(table);
    } else if (table.activeSeatIndex === -1) {
      setActiveTurn(table, nextActiveIndex(table, seatIndex - 1));
    }
  }

  return {
    stack: seat.stack,
    tableEmpty: table.seats.length === 0
  };
}

export function addBuyIn(table, user, amount) {
  const seat = table.seats.find((candidate) => candidate.userId === user.id);
  if (!seat) throwHttp(404, "Вы не сидите за этим столом");
  if (!canBuyIn(table) && seat.sittingOutReason !== "rebuy") {
    throwHttp(409, "Докупить фишки можно только между раздачами");
  }

  const chips = clamp(Number(amount || 0), 1, 100000);
  seat.stack += chips;
  seat.sittingOut = false;
  seat.sittingOutUntil = 0;
  seat.sittingOutReason = "";
  table.message = `${seat.name} добавил ${chips} на стол`;
  addLog(table, table.message);
  return seat.stack;
}

export function sitOut(table, user, timeoutMs = SIT_OUT_TIMEOUT_MS) {
  const seatIndex = table.seats.findIndex((seat) => seat.userId === user.id);
  if (seatIndex === -1) throwHttp(404, "Вы не сидите за этим столом");
  const seat = table.seats[seatIndex];
  const handIsActive = ["preflop", "flop", "turn", "river", "runout"].includes(table.status) && seat.cards.length > 0;
  if (handIsActive && !seat.folded) {
    seat.sitOutNextHand = true;
    table.message = `${seat.name} отойдёт после раздачи`;
    addLog(table, table.message);
    return;
  }

  seat.sittingOut = true;
  seat.sittingOutUntil = Date.now() + timeoutMs;
  seat.sittingOutReason = "away";
  seat.sitOutNextHand = false;
  seat.cards = [];
  seat.bet = 0;
  seat.acted = true;
  seat.folded = true;
  table.message = `${seat.name} отошёл от стола`;
  addLog(table, table.message);

  if (table.activeSeatIndex === seatIndex) {
    if (activeSeats(table).length === 1) {
      finishByFold(table);
    } else {
      advanceAfterAction(table);
    }
  }
}

export function sitIn(table, user) {
  const seat = table.seats.find((candidate) => candidate.userId === user.id);
  if (!seat) throwHttp(404, "Вы не сидите за этим столом");
  if (seat.stack <= 0) throwHttp(409, "Сначала докупите фишки");
  seat.sittingOut = false;
  seat.sitOutNextHand = false;
  seat.sittingOutUntil = 0;
  seat.sittingOutReason = "";
  table.message = `${seat.name} вернулся за стол`;
  addLog(table, table.message);
  maybeStartHand(table);
}

export function maybeStartHand(table) {
  if (table.status !== "waiting" || playableSeats(table).length < 2) return;
  if (table.handNumber === 0) {
    prepareStartIntro(table);
    return;
  }
  startHand(table);
}

export function prepareStartIntro(table) {
  if (playableSeats(table).length < 2) return;
  table.status = "starting";
  table.communityCards = [];
  table.pot = 0;
  table.currentBet = 0;
  table.activeSeatIndex = -1;
  table.actionDeadline = 0;
  table.startIntroUntil = Date.now() + START_INTRO_MS;
  table.dealerIndex = nextSeatedIndex(table, table.dealerIndex);
  table.smallBlindIndex = playableSeats(table).length === 2 ? table.dealerIndex : nextSeatedIndex(table, table.dealerIndex);
  table.bigBlindIndex = nextSeatedIndex(table, table.smallBlindIndex);
  table.message = `Игра ${table.smallBlind}/${table.bigBlind}. ${table.seats[table.smallBlindIndex].name} SB, ${table.seats[table.bigBlindIndex].name} BB`;
  addLog(table, table.message);
}

export function startHand(table, user) {
  if (user && !canControlTestPlayers(table, user)) throwHttp(403, "Only table owner can start the hand");
  if (playableSeats(table).length < 2) {
    table.status = "waiting";
    table.message = "Ожидание игроков";
    table.activeSeatIndex = -1;
    table.actionDeadline = 0;
    table.communityCards = [];
    table.pot = 0;
    table.currentBet = 0;
    for (const seat of table.seats) {
      seat.cards = [];
      seat.bet = 0;
      seat.totalBet = 0;
      seat.folded = !canReceiveHand(seat);
      seat.acted = false;
      seat.sitOutNextHand = false;
    }
    return;
  }

  if (table.status !== "starting") {
    table.dealerIndex = nextSeatedIndex(table, table.dealerIndex);
    table.smallBlindIndex = playableSeats(table).length === 2 ? table.dealerIndex : nextSeatedIndex(table, table.dealerIndex);
    table.bigBlindIndex = nextSeatedIndex(table, table.smallBlindIndex);
  }

  table.handNumber += 1;
  table.actionLog = [];
  for (const seat of playableSeats(table)) {
    if (!seat.fairnessSeed) {
      seat.fairnessSeed = createPlayerFairnessSeed("server-fallback");
    }
  }
  const fairness = createProvablyFairDeck({
    tableId: table.id,
    handNumber: table.handNumber,
    playerIds: playableSeats(table).map((seat) => seat.userId),
    playerSeeds: buildCurrentHandPlayerSeeds(table)
  });
  table.deck = fairness.deck;
  table.fairnessProof = fairness.proof;
  table.communityCards = [];
  table.pot = 0;
  table.currentBet = 0;
  table.minRaise = table.bigBlind;
  table.lastAggressorIndex = -1;
  table.actionDeadline = 0;
  table.handFinishedAt = 0;
  table.runoutQueue = [];
  table.runoutNextAt = 0;
  table.startIntroUntil = 0;
  table.status = "preflop";

  for (const seat of table.seats) {
    seat.cards = canReceiveHand(seat) ? [table.deck.pop(), table.deck.pop()] : [];
    seat.bet = 0;
    seat.totalBet = 0;
    seat.handStartStack = seat.stack;
    seat.folded = !canReceiveHand(seat);
    seat.acted = false;
    seat.sitOutNextHand = false;
  }

  postBlind(table, table.smallBlindIndex, table.smallBlind);
  postBlind(table, table.bigBlindIndex, table.bigBlind);
  addLog(table, `Раздача #${table.handNumber}`);
  addLog(table, `Fair hash ${table.fairnessProof.serverSeedHash}`);
  addLog(table, `${table.seats[table.smallBlindIndex].name} SB ${table.smallBlind}`);
  addLog(table, `${table.seats[table.bigBlindIndex].name} BB ${table.bigBlind}`);

  table.currentBet = table.bigBlind;
  table.lastAggressorIndex = table.bigBlindIndex;
  setActiveTurn(table, playableSeats(table).length === 2 ? table.smallBlindIndex : nextSeatedIndex(table, table.bigBlindIndex));
}

export function act(table, user, body = {}) {
  if (table.status === "waiting" || table.status === "showdown" || table.status === "runout") {
    throwHttp(409, "Раздача не активна");
  }

  const seatIndex = table.seats.findIndex((seat) => seat.userId === user.id);
  if (seatIndex === -1) throwHttp(403, "Вы не сидите за этим столом");
  if (seatIndex !== table.activeSeatIndex) throwHttp(409, "Сейчас ход другого игрока");

  applyAction(table, seatIndex, body);
}

export function autoAct(table, user) {
  if (!canControlTestPlayers(table, user)) throwHttp(403, "Only table owner can run auto action");
  if (table.activeSeatIndex < 0) throwHttp(409, "Сейчас нет активного игрока");

  const seat = table.seats[table.activeSeatIndex];
  if (!seat.userId.startsWith("test_")) throwHttp(409, "Автоход доступен только для тестового игрока");

  applyAutoCheckOrCall(table, table.activeSeatIndex, "авто");
}

export function testBotAct(table, user, body = {}) {
  if (!canControlTestPlayers(table, user)) throwHttp(403, "Only table owner can control test players");
  if (table.activeSeatIndex < 0) throwHttp(409, "Сейчас нет активного игрока");

  const seat = table.seats[table.activeSeatIndex];
  if (!seat.userId.startsWith("test_")) throwHttp(409, "Сейчас ход не тестового игрока");

  const requestedAction = String(body.action || "");
  const toCall = Math.max(0, table.currentBet - seat.bet);
  const action = requestedAction === "call" && toCall === 0 ? "check" : requestedAction;
  if (action !== "fold" && action !== "call" && action !== "check") {
    throwHttp(400, "Для тестового бота доступны fold и call");
  }

  applyAction(table, table.activeSeatIndex, { action });
}

export function tickTables(tables) {
  for (const table of tables.values()) {
    if (table.status === "waiting") {
      maybeStartHand(table);
      continue;
    }

    if (table.status === "starting" && table.startIntroUntil && Date.now() >= table.startIntroUntil) {
      startHand(table);
      continue;
    }

    if (table.status === "showdown" && table.handFinishedAt && Date.now() - table.handFinishedAt >= NEXT_HAND_DELAY_MS) {
      startHand(table);
      continue;
    }

    if (table.status === "runout" && table.runoutNextAt && Date.now() >= table.runoutNextAt) {
      revealRunoutCard(table);
      continue;
    }

    if (table.activeSeatIndex < 0 || !table.actionDeadline || Date.now() < table.actionDeadline) continue;
    autoTimeoutAction(table);
  }
}

export function publicTable(table, viewerId = "") {
  const viewerSeat = table.seats.find((seat) => seat.userId === viewerId);
  const activeSeat = table.activeSeatIndex >= 0 ? table.seats[table.activeSeatIndex] : null;
  const toCall = viewerSeat ? Math.max(0, table.currentBet - viewerSeat.bet) : 0;
  const canAct = table.activeSeatIndex >= 0 && table.seats[table.activeSeatIndex]?.userId === viewerId;

  return {
    id: table.id,
    name: table.name,
    ownerId: table.ownerId,
    isPrivate: table.isPrivate,
    isSystem: table.isSystem,
    maxPlayers: table.maxPlayers,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    status: table.status,
    handNumber: table.handNumber,
    startIntroUntil: table.startIntroUntil,
    runoutCardsLeft: table.runoutQueue.length,
    communityCards: table.communityCards,
    pot: table.pot,
    dealerIndex: table.dealerIndex,
    smallBlindIndex: table.smallBlindIndex,
    bigBlindIndex: table.bigBlindIndex,
    activeSeatIndex: table.activeSeatIndex,
    currentBet: table.currentBet,
    minRaise: table.minRaise,
    actionDeadline: table.actionDeadline,
    now: Date.now(),
    message: table.message,
    actionLog: table.actionLog,
    handHistory: publicHandHistory(table.handHistory),
    fairness: publicCurrentFairness(table),
    viewer: {
      isSeated: Boolean(viewerSeat),
      canAct,
      toCall,
      minRaise: table.minRaise,
      bigBlind: table.bigBlind,
      stack: viewerSeat?.stack || 0,
      sittingOut: Boolean(viewerSeat?.sittingOut),
      sittingOutReason: viewerSeat?.sittingOutReason || "",
      needsRebuy: Boolean(viewerSeat?.sittingOut && viewerSeat?.sittingOutReason === "rebuy" && viewerSeat?.stack <= 0),
      canBuyIn: Boolean(viewerSeat) && (canBuyIn(table) || viewerSeat.sittingOutReason === "rebuy"),
      canControlTestBot: canControlTestPlayers(table, { id: viewerId }) && Boolean(activeSeat?.userId.startsWith("test_")),
      testBotName: activeSeat?.userId.startsWith("test_") ? activeSeat.name : "",
      testBotToCall: activeSeat ? Math.max(0, table.currentBet - activeSeat.bet) : 0,
      canCheck: canAct && toCall === 0,
      canCall: canAct && toCall > 0,
      canBet: canAct && toCall === 0 && table.currentBet === 0 && Boolean(viewerSeat?.stack),
      canRaise: canAct && Boolean(viewerSeat?.stack) && viewerSeat.stack > toCall
    },
    seats: table.seats.map((seat) => ({
      userId: seat.userId,
      name: seat.name,
      username: seat.username,
      photoUrl: seat.photoUrl || "",
      stack: seat.stack,
      bet: seat.bet,
      totalBet: seat.totalBet,
      folded: seat.folded,
      acted: seat.acted,
      sittingOut: seat.sittingOut,
      sitOutNextHand: seat.sitOutNextHand,
      sittingOutUntil: seat.sittingOutUntil,
      sittingOutReason: seat.sittingOutReason,
      fairnessSeedHash: seat.fairnessSeed?.seedHash || "",
      fairnessSeedSource: seat.fairnessSeed?.source || "server-fallback",
      sittingOutSecondsLeft: seat.sittingOutUntil ? Math.max(0, Math.ceil((seat.sittingOutUntil - Date.now()) / 1000)) : 0,
      isAllIn: isAllInSeat(table, seat),
      cards: seat.userId === viewerId || (!seat.folded && (table.status === "showdown" || table.status === "runout"))
        ? seat.cards
        : seat.cards.map(() => "hidden")
    }))
  };
}

function publicHandHistory(history) {
  return history.map((hand) => ({
    id: hand.id,
    handNumber: hand.handNumber,
    at: hand.at,
    board: hand.board,
    fairnessProof: hand.fairnessProof ? publicFairnessProof(hand.fairnessProof) : null,
    pots: hand.pots.map((pot) => ({
      label: pot.label,
      amount: pot.amount,
      winners: pot.winners,
      handDescription: pot.handDescription
    })),
    seats: hand.seats
  }));
}

function canControlTestPlayers(table, user) {
  if (!user?.id) return false;
  if (table.ownerId === user.id) return true;
  return table.isSystem && table.seats.some((seat) => seat.userId === user.id && !seat.userId.startsWith("test_"));
}

function canBuyIn(table) {
  return table.status === "waiting" || table.status === "showdown" || table.status === "starting";
}

export function createTestUser(index) {
  return {
    id: randomId("test"),
    name: `Player ${index}`,
    username: "",
    photoUrl: "",
    balance: 10000
  };
}

function applyAction(table, seatIndex, body = {}) {
  const seat = table.seats[seatIndex];
  const action = String(body.action || "");
  const toCall = Math.max(0, table.currentBet - seat.bet);

  if (action === "fold") {
    seat.folded = true;
    seat.acted = true;
    table.message = `${seat.name} сбросил карты`;
    addLog(table, `${seat.name}: fold`);
    if (activeSeats(table).length === 1) {
      applyPendingSitOut(table, seat);
      finishByFold(table);
      return;
    }
    applyPendingSitOut(table, seat);
    advanceAfterAction(table);
    return;
  }

  if (action === "check") {
    if (toCall > 0) throwHttp(409, "Нельзя чекнуть, нужно коллировать или сбросить");
    seat.acted = true;
    table.message = `${seat.name} чек`;
    addLog(table, `${seat.name}: check`);
    advanceAfterAction(table);
    return;
  }

  if (action === "call") {
    if (toCall <= 0) throwHttp(409, "Сейчас нечего коллировать");
    moveChipsToPot(table, seat, toCall);
    seat.acted = true;
    table.message = `${seat.name} колл ${toCall}`;
    addLog(table, `${seat.name}: call ${toCall}`);
    advanceAfterAction(table);
    return;
  }

  if (action === "raise") {
    if (table.currentBet === 0) throwHttp(409, "Сейчас нужно сделать ставку, а не рейз");
    const requestedRaiseBy = Math.max(Number(body.amount || table.minRaise), table.minRaise);
    const fullTargetBet = table.currentBet + requestedRaiseBy;
    const allInTargetBet = seat.bet + seat.stack;
    const targetBet = Math.min(fullTargetBet, allInTargetBet);
    const needed = targetBet - seat.bet;
    const raiseBy = targetBet - table.currentBet;
    if (needed <= 0 || raiseBy <= 0) throwHttp(409, "Недостаточно фишек для рейза");

    moveChipsToPot(table, seat, needed);
    const isFullRaise = raiseBy >= table.minRaise;
    if (isFullRaise) table.minRaise = raiseBy;
    table.currentBet = seat.bet;
    if (isFullRaise) {
      table.lastAggressorIndex = seatIndex;
      for (const otherSeat of activeSeats(table)) {
        otherSeat.acted = otherSeat.userId === seat.userId;
      }
    } else {
      seat.acted = true;
    }
    table.message = seat.stack === 0 ? `${seat.name} all-in ${seat.bet}` : `${seat.name} рейз до ${seat.bet}`;
    addLog(table, seat.stack === 0 ? `${seat.name}: all-in ${seat.bet}` : `${seat.name}: raise до ${seat.bet}`);
    advanceAfterAction(table);
    return;
  }

  if (action === "bet") {
    if (table.currentBet > 0 || toCall > 0) throwHttp(409, "Сейчас доступен рейз или колл, не ставка");
    const requestedAmount = Math.max(Number(body.amount || table.bigBlind), Math.min(table.bigBlind, seat.stack));
    const amount = Math.min(requestedAmount, seat.stack);
    moveChipsToPot(table, seat, amount);
    if (amount >= table.bigBlind) table.minRaise = amount;
    table.currentBet = seat.bet;
    if (amount >= table.bigBlind) {
      table.lastAggressorIndex = seatIndex;
      for (const otherSeat of activeSeats(table)) {
        otherSeat.acted = otherSeat.userId === seat.userId;
      }
    } else {
      seat.acted = true;
    }
    table.message = seat.stack === 0 ? `${seat.name} all-in ${seat.bet}` : `${seat.name} ставка ${seat.bet}`;
    addLog(table, seat.stack === 0 ? `${seat.name}: all-in ${seat.bet}` : `${seat.name}: bet ${seat.bet}`);
    advanceAfterAction(table);
    return;
  }

  throwHttp(400, "Неизвестное действие");
}

function applyAutoCheckOrCall(table, seatIndex, prefix) {
  const seat = table.seats[seatIndex];
  const toCall = Math.max(0, table.currentBet - seat.bet);
  if (toCall > 0) {
    moveChipsToPot(table, seat, toCall);
    seat.acted = true;
    table.message = `${seat.name} ${prefix}-колл ${toCall}`;
    addLog(table, `${seat.name}: ${prefix}-call ${toCall}`);
  } else {
    seat.acted = true;
    table.message = `${seat.name} ${prefix}-чек`;
    addLog(table, `${seat.name}: ${prefix}-check`);
  }

  advanceAfterAction(table);
}

function advanceAfterAction(table) {
  if (isBettingRoundComplete(table)) {
    advanceStreet(table);
    return;
  }

  setActiveTurn(table, nextActiveIndex(table, table.activeSeatIndex));
}

function advanceStreet(table) {
  for (const seat of table.seats) {
    seat.bet = 0;
    seat.acted = false;
  }
  table.currentBet = 0;
  table.minRaise = table.bigBlind;
  table.lastAggressorIndex = -1;

  if (table.status === "preflop") {
    table.communityCards.push(table.deck.pop(), table.deck.pop(), table.deck.pop());
    table.status = "flop";
    addLog(table, `Флоп: ${table.communityCards.join(" ")}`);
  } else if (table.status === "flop") {
    table.communityCards.push(table.deck.pop());
    table.status = "turn";
    addLog(table, `Терн: ${table.communityCards.at(-1)}`);
  } else if (table.status === "turn") {
    table.communityCards.push(table.deck.pop());
    table.status = "river";
    addLog(table, `Ривер: ${table.communityCards.at(-1)}`);
  } else if (table.status === "river") {
    finishShowdown(table);
    return;
  }

  if (actionableSeats(table).length < 2) {
    runOutToShowdown(table);
    return;
  }

  setActiveTurn(table, nextActiveIndex(table, table.dealerIndex), `${streetLabel(table.status)}. `);
}

function finishByFold(table) {
  const winner = activeSeats(table)[0];
  const totalPot = table.pot;
  winner.stack += table.pot;
  table.message = `${winner.name} забирает банк ${table.pot}`;
  addLog(table, table.message);
  recordHandHistory(table, {
    pots: [{ label: "банк", amount: totalPot, grossAmount: totalPot, rake: 0, winners: [winner.name], handDescription: "fold" }],
    rake: 0
  });
  table.pot = 0;
  table.status = "showdown";
  table.activeSeatIndex = -1;
  table.actionDeadline = 0;
  table.runoutQueue = [];
  table.runoutNextAt = 0;
  applyPendingSitOuts(table);
  table.handFinishedAt = Date.now();
}

function finishShowdown(table) {
  const totalPot = table.pot;
  const pots = buildPots(table);
  let rakeLeft = calculateRake({
    pot: totalPot,
    bigBlind: table.bigBlind,
    boardCards: table.communityCards.length
  });
  const totalRake = rakeLeft;
  const summaries = [];
  const historyPots = [];

  for (const pot of pots) {
    const potRake = Math.min(pot.amount, rakeLeft);
    const payoutAmount = pot.amount - potRake;
    rakeLeft -= potRake;
    if (payoutAmount <= 0) continue;

    const { winners, handDescription } = resolveShowdown(pot.eligible, table.communityCards);
    const orderedWinners = orderWinnersForOddChips(table, winners);
    const share = Math.floor(payoutAmount / orderedWinners.length);
    let remainder = payoutAmount - share * orderedWinners.length;

    for (const winner of orderedWinners) {
      winner.seat.stack += share + (remainder > 0 ? 1 : 0);
      remainder -= 1;
    }

    const winnerNames = orderedWinners.map((winner) => winner.seat.name).join(", ");
    summaries.push(`${winnerNames} забирает ${pot.label} ${payoutAmount} (${handDescription})`);
    historyPots.push({
      label: pot.label,
      amount: payoutAmount,
      grossAmount: pot.amount,
      rake: potRake,
      winners: orderedWinners.map((winner) => winner.seat.name),
      handDescription
    });
  }
  table.rakeCollected += totalRake;
  markBustedSeats(table);

  table.message = summaries.length
    ? summaries.join("; ")
    : `Банк ${totalPot} не разыгран`;
  addLog(table, table.message);
  recordHandHistory(table, { pots: historyPots, rake: totalRake });
  table.pot = 0;
  table.status = "showdown";
  table.activeSeatIndex = -1;
  table.actionDeadline = 0;
  table.runoutQueue = [];
  table.runoutNextAt = 0;
  applyPendingSitOuts(table);
  table.handFinishedAt = Date.now();
}

function recordHandHistory(table, { pots, rake = 0 }) {
  const record = {
    id: randomId("hand"),
    handNumber: table.handNumber,
    at: Date.now(),
    board: [...table.communityCards],
    rake,
    fairnessProof: revealFairnessProof(table.fairnessProof),
    pots,
    seats: table.seats
      .filter((seat) => seat.cards.length > 0)
      .map((seat) => ({
        name: seat.name,
        cards: seat.folded ? ["hidden", "hidden"] : [...seat.cards],
        folded: seat.folded,
        totalBet: seat.totalBet,
        profit: seat.stack - seat.handStartStack
      }))
  };
  table.handHistory.unshift(record);
  table.handHistory = table.handHistory.slice(0, 20);
}

export function createProvablyFairDeck({
  tableId = "table",
  handNumber = 0,
  playerIds = [],
  playerSeeds = [],
  serverSeed = randomBytes(32).toString("hex")
} = {}) {
  const normalizedPlayerIds = [...playerIds].map(String).sort();
  const normalizedPlayerSeeds = normalizePlayerSeeds(playerSeeds, normalizedPlayerIds);
  const clientSeed = buildClientSeed(tableId, normalizedPlayerIds, normalizedPlayerSeeds);
  const proofBase = {
    algorithm: "qwz-sha256-fisher-yates-v1",
    tableId: String(tableId),
    handNumber: Number(handNumber || 0),
    nonce: Number(handNumber || 0),
    playerIds: normalizedPlayerIds,
    playerSeeds: normalizedPlayerSeeds,
    clientSeed,
    serverSeed,
    serverSeedHash: sha256Hex(serverSeed)
  };
  const deck = shuffleWithProof(createDeck(), proofBase);
  const proof = {
    ...proofBase,
    deckHash: sha256Hex(deck.join(","))
  };
  return { deck, proof };
}

export function verifyProvablyFairDeck(deck, proof) {
  if (!Array.isArray(deck) || !proof?.serverSeed || !proof?.serverSeedHash) return false;
  if (sha256Hex(proof.serverSeed) !== proof.serverSeedHash) return false;
  for (const playerSeed of proof.playerSeeds || []) {
    if (sha256Hex(playerSeed.seed || "") !== playerSeed.seedHash) return false;
  }
  const rebuiltClientSeed = buildClientSeed(proof.tableId, proof.playerIds || [], proof.playerSeeds || []);
  if (rebuiltClientSeed !== proof.clientSeed) return false;
  const rebuilt = shuffleWithProof(createDeck(), proof);
  return rebuilt.join(",") === deck.join(",") && sha256Hex(deck.join(",")) === proof.deckHash;
}

function applyPendingSitOuts(table) {
  for (const seat of table.seats) {
    applyPendingSitOut(table, seat);
  }
}

function applyPendingSitOut(table, seat) {
  if (!seat.sitOutNextHand) return;
  seat.sitOutNextHand = false;
  seat.sittingOut = true;
  seat.sittingOutUntil = Date.now() + SIT_OUT_TIMEOUT_MS;
  seat.sittingOutReason = "away";
  seat.folded = true;
  table.message = `${seat.name} отошёл от стола на 5 минут`;
  addLog(table, table.message);
}

function buildPots(table) {
  const levels = [...new Set(table.seats
    .map((seat) => seat.totalBet)
    .filter((amount) => amount > 0))]
    .sort((a, b) => a - b);
  const pots = [];
  let previousLevel = 0;

  for (const level of levels) {
    const contributors = table.seats.filter((seat) => seat.totalBet >= level);
    const amount = (level - previousLevel) * contributors.length;
    const eligible = contributors.filter((seat) => !seat.folded && seat.cards.length > 0);
    if (amount > 0 && eligible.length > 0) {
      pots.push({
        amount,
        eligible,
        label: pots.length === 0 ? "банк" : `сайд-пот ${pots.length}`
      });
    }
    previousLevel = level;
  }

  return pots;
}

function orderWinnersForOddChips(table, winners) {
  return [...winners].sort((left, right) => {
    const leftIndex = table.seats.indexOf(left.seat);
    const rightIndex = table.seats.indexOf(right.seat);
    return oddChipDistance(table, leftIndex) - oddChipDistance(table, rightIndex);
  });
}

function oddChipDistance(table, seatIndex) {
  if (seatIndex < 0) return Number.MAX_SAFE_INTEGER;
  if (table.dealerIndex < 0 || table.seats.length === 0) return seatIndex;
  return (seatIndex - table.dealerIndex + table.seats.length) % table.seats.length;
}

function isBettingRoundComplete(table) {
  const players = activeSeats(table);
  const actionable = actionableSeats(table);
  if (players.length > 1 && actionable.length < 2) {
    return actionable.every((seat) => seat.bet === table.currentBet);
  }
  return players.length > 1 && players.every((seat) => {
    if (seat.stack === 0) return true;
    return seat.acted && seat.bet === table.currentBet;
  });
}

function postBlind(table, seatIndex, amount) {
  moveChipsToPot(table, table.seats[seatIndex], amount);
  table.seats[seatIndex].acted = false;
}

function moveChipsToPot(table, seat, amount) {
  const chips = Math.min(amount, seat.stack);
  seat.stack -= chips;
  seat.bet += chips;
  seat.totalBet += chips;
  table.pot += chips;
}

function autoTimeoutAction(table) {
  const seat = table.seats[table.activeSeatIndex];
  const toCall = Math.max(0, table.currentBet - seat.bet);

  if (toCall > 0) {
    seat.folded = true;
    seat.acted = true;
    table.message = `${seat.name} авто-fold по таймеру`;
    addLog(table, `${seat.name}: авто-fold`);
    if (activeSeats(table).length === 1) {
      finishByFold(table);
      return;
    }
  } else {
    seat.acted = true;
    table.message = `${seat.name} авто-check по таймеру`;
    addLog(table, `${seat.name}: авто-check`);
  }

  advanceAfterAction(table);
}

function activeSeats(table) {
  return table.seats.filter((seat) => !seat.folded && seat.cards.length > 0);
}

function actionableSeats(table) {
  return table.seats.filter((seat) => !seat.folded && seat.cards.length > 0 && seat.stack > 0);
}

function normalizeIndexesAfterSeatRemoval(table, removedIndex) {
  const normalize = (index) => {
    if (index === removedIndex) return -1;
    if (index > removedIndex) return index - 1;
    return index;
  };

  table.dealerIndex = normalize(table.dealerIndex);
  table.smallBlindIndex = normalize(table.smallBlindIndex);
  table.bigBlindIndex = normalize(table.bigBlindIndex);
  table.activeSeatIndex = normalize(table.activeSeatIndex);

  if (table.dealerIndex >= table.seats.length) table.dealerIndex = table.seats.length - 1;
}

function nextSeatedIndex(table, fromIndex) {
  if (playableSeats(table).length === 0) return -1;
  for (let offset = 1; offset <= table.seats.length; offset += 1) {
    const index = (fromIndex + offset + table.seats.length) % table.seats.length;
    if (canReceiveHand(table.seats[index])) return index;
  }
  return -1;
}

function nextActiveIndex(table, fromIndex) {
  if (actionableSeats(table).length === 0) return -1;
  for (let offset = 1; offset <= table.seats.length; offset += 1) {
    const index = (fromIndex + offset + table.seats.length) % table.seats.length;
    if (!table.seats[index].folded && table.seats[index].stack > 0) return index;
  }
  return -1;
}

function setActiveTurn(table, seatIndex, prefix = "") {
  if (seatIndex < 0) {
    runOutToShowdown(table);
    return;
  }
  table.activeSeatIndex = seatIndex;
  table.actionDeadline = Date.now() + ACTION_TIMEOUT_MS;
  table.message = `${prefix}${table.seats[seatIndex].name} ходит`;
}

function runOutToShowdown(table) {
  if (table.status === "runout") return;
  table.status = "runout";
  table.activeSeatIndex = -1;
  table.actionDeadline = 0;
  table.currentBet = 0;
  table.runoutQueue = [];
  while (table.communityCards.length + table.runoutQueue.length < 5) {
    table.runoutQueue.push(table.deck.pop());
  }
  table.runoutNextAt = Date.now() + RUNOUT_CARD_DELAY_MS;
  table.message = "All-in. Карты открываются по одной";
  addLog(table, table.message);
}

function revealRunoutCard(table) {
  const card = table.runoutQueue.shift();
  if (card) {
    table.communityCards.push(card);
    table.message = `Открыта карта ${card}`;
    addLog(table, table.message);
  }

  if (table.runoutQueue.length === 0) {
    finishShowdown(table);
    return;
  }

  table.runoutNextAt = Date.now() + RUNOUT_CARD_DELAY_MS;
}

function streetLabel(status) {
  return {
    preflop: "Префлоп",
    flop: "Флоп",
    turn: "Терн",
    river: "Ривер"
  }[status] || status;
}

function addLog(table, text) {
  table.actionLog.push({
    id: randomId("log"),
    handNumber: table.handNumber,
    text,
    at: Date.now()
  });
  table.actionLog = table.actionLog.slice(-30);
}

function isAllInSeat(table, seat) {
  return !seat.folded && seat.stack === 0 && ["preflop", "flop", "turn", "river", "runout"].includes(table.status);
}

function markBustedSeats(table) {
  for (const seat of table.seats) {
    if (seat.stack > 0) continue;
    seat.sittingOut = true;
    seat.sittingOutUntil = Date.now() + REBUY_TIMEOUT_MS;
    seat.sittingOutReason = "rebuy";
  }
}

function playableSeats(table) {
  return table.seats.filter(canReceiveHand);
}

function canReceiveHand(seat) {
  return !seat.sittingOut && seat.stack > 0;
}

function createDeck() {
  const suits = ["s", "h", "d", "c"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  return suits.flatMap((suit) => ranks.map((rank) => `${rank}${suit}`));
}

function createPlayerFairnessSeed(source, seed = randomBytes(32).toString("hex")) {
  return {
    source,
    seed,
    seedHash: sha256Hex(seed),
    updatedAt: Date.now()
  };
}

function buildCurrentHandPlayerSeeds(table) {
  return playableSeats(table).map((seat) => ({
    userId: seat.userId,
    seed: seat.fairnessSeed?.seed || "",
    seedHash: seat.fairnessSeed?.seedHash || "",
    source: seat.fairnessSeed?.source || "server-fallback"
  }));
}

function normalizePlayerSeeds(playerSeeds, playerIds) {
  const byUserId = new Map((playerSeeds || []).map((item) => [String(item.userId || ""), item]));
  return playerIds.map((userId) => {
    const seedRecord = byUserId.get(userId);
    const seed = String(seedRecord?.seed || "");
    return {
      userId,
      seed,
      seedHash: seedRecord?.seedHash || sha256Hex(seed),
      source: seedRecord?.source || "server-fallback"
    };
  });
}

function buildClientSeed(tableId, playerIds, playerSeeds) {
  if (!playerSeeds.length) {
    return sha256Hex(playerIds.length ? playerIds.join("|") : String(tableId));
  }
  return sha256Hex(playerSeeds
    .map((item) => `${item.userId}:${item.seed}`)
    .join("|"));
}

function shuffleWithProof(cards, proof) {
  const result = [...cards];
  let cursor = 0;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const { value, nextCursor } = unbiasedRandomInt(i + 1, proof, cursor);
    cursor = nextCursor;
    const j = value;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function unbiasedRandomInt(range, proof, cursor) {
  if (range <= 0 || range > 0x100000000) throw new Error("Invalid shuffle range");
  const limit = Math.floor(0x100000000 / range) * range;
  let localCursor = cursor;

  while (true) {
    const digest = createHash("sha256")
      .update([
        proof.algorithm,
        proof.serverSeed,
        proof.clientSeed,
        proof.nonce,
        proof.tableId,
        localCursor
      ].join(":"))
      .digest();

    for (let offset = 0; offset <= digest.length - 4; offset += 4) {
      const value = digest.readUInt32BE(offset);
      if (value < limit) {
        return {
          value: value % range,
          nextCursor: localCursor + 1
        };
      }
    }

    localCursor += 1;
  }
}

function revealFairnessProof(proof) {
  if (!proof) return null;
  return {
    algorithm: proof.algorithm,
    tableId: proof.tableId,
    handNumber: proof.handNumber,
    nonce: proof.nonce,
    playerIds: proof.playerIds,
    playerSeeds: proof.playerSeeds,
    clientSeed: proof.clientSeed,
    serverSeedHash: proof.serverSeedHash,
    serverSeed: proof.serverSeed,
    deckHash: proof.deckHash,
    revealedAt: Date.now()
  };
}

function publicCurrentFairness(table) {
  if (!table.fairnessProof) return null;
  return {
    algorithm: table.fairnessProof.algorithm,
    handNumber: table.fairnessProof.handNumber,
    serverSeedHash: table.fairnessProof.serverSeedHash,
    playerSeedHashes: (table.fairnessProof.playerSeeds || []).map((item) => ({
      userId: item.userId,
      seedHash: item.seedHash,
      source: item.source
    }))
  };
}

function publicFairnessProof(proof) {
  return {
    algorithm: proof.algorithm,
    tableId: proof.tableId,
    handNumber: proof.handNumber,
    nonce: proof.nonce,
    playerIds: proof.playerIds,
    playerSeeds: (proof.playerSeeds || []).map((item) => ({
      userId: item.userId,
      seed: item.seed,
      seedHash: item.seedHash,
      source: item.source
    })),
    clientSeed: proof.clientSeed,
    serverSeedHash: proof.serverSeedHash,
    serverSeed: proof.serverSeed,
    deckHash: proof.deckHash,
    revealedAt: proof.revealedAt
  };
}

function publicPlayerFairnessSeed(seat) {
  return {
    userId: seat.userId,
    seedHash: seat.fairnessSeed?.seedHash || "",
    source: seat.fairnessSeed?.source || "server-fallback",
    updatedAt: seat.fairnessSeed?.updatedAt || 0
  };
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function randomId(prefix) {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}
