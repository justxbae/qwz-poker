import kernel from "../vendor/poker-kernel/dist/kernel/PokerKernel.js";
import noLimit from "../vendor/poker-kernel/dist/kernel/helpers/NoLimitBetHandler.js";
const { PokerKernel } = kernel;
const { NoLimitBetHandler } = noLimit;
const sizing = new NoLimitBetHandler();
const STREETS = new Set(["preflop", "flop", "turn", "river"]);

// Betting-only integration. Never call upstream beginHand/advanceStage: Weez owns
// the committed deck, animated runout, integer side pots, rake and ledger boundary.
// The JSON table remains the only persisted state; no second engine Map is needed.
class WeezHoldemKernel extends PokerKernel {
  constructor(state) {
    super(state);
    this.roundComplete = false;
  }

  processPlayerAction(player, action) {
    const previousBet = this.state.round.betTo;
    const previousMinRaise = this.state.round.lastRaiseAmount;
    super.processPlayerAction(player, action);
    const raiseBy = player.currentRoundContribution - previousBet;
    this.state.round.betTo = Math.max(previousBet, player.currentRoundContribution);
    // Upstream's all-in handler doesn't update the raise size; short raises must
    // retain the previous minimum, whereas full all-ins establish a new one.
    this.state.round.lastRaiseAmount = raiseBy >= previousMinRaise ? raiseBy : previousMinRaise;
    player.lastActionBet = this.state.round.betTo;
    if (raiseBy >= previousMinRaise) {
      for (const other of this.state.players) {
        if (other.id !== player.id) other.hasActed = false;
      }
    }
  }

  updateLastAction(player, action) {
    this.state.round.lastAction = { playerId: player.id, action };
    // Do not let upstream's call/round transitions deal cards or pay pots.
    // Settlement is deliberately left to Weez after the round-complete signal.
    this.roundComplete = this.isBettingRoundComplete();
    if (this.roundComplete) this.state.round.currentPlayer = "";
    else this.moveToNextPlayer();
  }

  isBettingRoundComplete() {
    const active = this.state.players.filter((player) => player.isActive);
    const actionable = active.filter((player) => player.chips > 0);
    if (active.length <= 1) return true;
    // A sole remaining stack only answers an outstanding wager; no empty checks.
    if (actionable.length < 2) {
      return actionable.every((player) => player.currentRoundContribution >= this.state.round.betTo);
    }
    return active.every((player) => player.chips === 0 || (
      player.hasActed && player.currentRoundContribution === this.state.round.betTo
    ));
  }

  getLegalActions(playerId) {
    return legalActions(this.state, playerId);
  }
}

export function holdemLegalActions(table, userId) {
  if (!STREETS.has(table.status) || table.seats[table.activeSeatIndex]?.userId !== userId) return [];
  return legalActions(toKernelState(table), userId);
}

export function holdemRoundComplete(table) {
  return new WeezHoldemKernel(toKernelState(table)).isBettingRoundComplete();
}

export function processHoldemAction(table, seatIndex, body = {}) {
  const state = toKernelState(table);
  const player = state.players[seatIndex];
  if (!STREETS.has(table.status)) fail("Раздача не активна");
  if (!player || state.round.currentPlayer !== player.id || !player.isActive || player.chips <= 0) {
    fail("Сейчас ход другого игрока");
  }
  const action = normalizeAction(state, player, body);
  const available = legalActions(state, player.id);
  const allowed = available.find((candidate) => candidate.type === action.type);
  if (!allowed || (action.amount !== undefined && (
    action.amount < (allowed.min ?? allowed.amount ?? 0)
    || action.amount > (allowed.max ?? allowed.amount ?? player.chips)
  ))) fail("Это действие сейчас недоступно");

  const before = player.chips;
  const previousBet = table.currentBet;
  const previousMinRaise = table.minRaise;
  const kernel = new WeezHoldemKernel(state);
  // applyAction performs upstream validation and dispatches its action handlers.
  // It only mutates the detached state. Invalid actions never touch the table.
  kernel.applyAction(player.id, action);
  const next = kernel.getState();
  const updated = next.players[seatIndex];
  const paid = before - updated.chips;
  assertMoney(paid);
  const beforeTotal = stateTotal(table.seats.map((seat) => seat.stack), table.pot);
  const afterTotal = stateTotal(next.players.map((seat) => seat.chips), table.pot + paid);
  if (beforeTotal !== afterTotal) throw new Error("Hold'em conservation invariant failed");
  for (const seat of next.players) {
    assertMoney(seat.chips);
    assertMoney(seat.currentRoundContribution);
  }
  assertMoney(table.pot + paid);
  assertMoney(table.seats[seatIndex].totalBet + paid);

  for (let index = 0; index < table.seats.length; index += 1) {
    const seat = table.seats[index];
    const result = next.players[index];
    seat.stack = result.chips;
    seat.bet = result.currentRoundContribution;
    seat.folded = !result.isActive;
    seat.acted = result.hasActed;
    seat.lastActionBet = result.lastActionBet;
  }
  table.seats[seatIndex].totalBet += paid;
  table.pot += paid;
  table.currentBet = next.round.betTo;
  table.minRaise = next.round.lastRaiseAmount;
  const fullRaise = updated.currentRoundContribution - previousBet >= previousMinRaise;
  if (fullRaise) table.lastAggressorIndex = seatIndex;

  return {
    action: action.type === "all-in" ? (previousBet > 0 ? "raise" : "bet") : action.type,
    paid,
    fullRaise,
    roundComplete: kernel.roundComplete,
    nextSeatIndex: next.players.findIndex((candidate) => candidate.id === next.round.currentPlayer)
  };
}

function normalizeAction(state, player, body) {
  let type = String(body.action || "");
  const toCall = Math.max(0, state.round.betTo - player.currentRoundContribution);
  if (!["fold", "check", "call", "bet", "raise", "all-in"].includes(type)) fail("Неизвестное действие", 400);
  if (type === "all-in") type = player.chips <= toCall ? "call" : state.round.betTo > 0 ? "raise" : "bet";
  if (type === "fold" || type === "check") return { type };
  if (type === "call") return { type, amount: Math.min(toCall, player.chips) };
  if (type === "bet" && state.round.betTo > 0) fail("Сейчас доступен рейз или колл, не ставка");
  if (type === "raise" && state.round.betTo === 0) fail("Сейчас нужно сделать ставку, а не рейз");
  const minimum = type === "raise" ? state.round.lastRaiseAmount : state.config.blinds.big;
  const requested = body.action === "all-in" ? player.chips : body.amount ?? minimum;
  if (!Number.isSafeInteger(requested) || requested <= 0) fail("Сумма должна быть положительным целым числом", 400);
  // Existing HTTP contract: raise amount is the increment above the live bet;
  // Kernel's amount is the additional payment from the acting player's stack.
  const amount = Math.min(player.chips, type === "raise" ? toCall + requested : requested);
  if (amount < (type === "raise" ? toCall + minimum : minimum)) {
    if (amount !== player.chips) fail("Ставка меньше минимальной и не является all-in");
    return { type: "all-in", amount };
  }
  return { type, amount };
}

function legalActions(state, userId) {
  const player = state.players.find((seat) => seat.id === userId);
  if (!player || !player.isActive || player.chips <= 0 || state.round.currentPlayer !== userId) return [];
  const toCall = Math.max(0, state.round.betTo - player.currentRoundContribution);
  const actions = [{ type: "fold" }];
  if (toCall === 0) actions.push({ type: "check" });
  else actions.push({ type: "call", amount: Math.min(toCall, player.chips) });
  const opponentsCanBet = state.players.some((seat) => seat.id !== userId && seat.isActive && seat.chips > 0);
  const reopened = player.lastActionBet === null || state.round.betTo - player.lastActionBet >= state.round.lastRaiseAmount;
  if (!opponentsCanBet || !reopened || player.chips <= toCall) return actions;
  const type = state.round.betTo > 0 ? "raise" : "bet";
  const min = type === "raise" ? sizing.getMinRaise(state, player) : sizing.getMinBet(state, player);
  const max = type === "raise" ? sizing.getMaxRaise(state, player) : sizing.getMaxBet(state, player);
  if (player.chips < min) actions.push({ type: "all-in", amount: player.chips });
  else actions.push({ type, min, max });
  return actions;
}

function toKernelState(table) {
  for (const value of [table.pot, table.currentBet, table.minRaise, table.bigBlind]) assertMoney(value);
  const players = table.seats.map((seat, index) => {
    for (const value of [seat.stack, seat.bet, seat.totalBet]) assertMoney(value);
    const lastActionBet = Object.hasOwn(seat, "lastActionBet") ? seat.lastActionBet : seat.acted ? seat.bet : null;
    if (lastActionBet !== null) assertMoney(lastActionBet);
    return {
      id: seat.userId, seat: index, chips: seat.stack, hand: [],
      isActive: !seat.folded && seat.cards.length > 0,
      contributedToPot: seat.totalBet - seat.bet,
      currentRoundContribution: seat.bet, hasActed: seat.acted,
      lastActionBet, isAutoPostBB: true, leaveNextHand: false, preChecks: [],
      straddle: false, sitOut: false, handStrength: null, timeBank: 0,
      position: "N/A", leaveBB: false, openingBalance: seat.handStartStack,
      autoTopUp: false, rit: false, leaveHand: false
    };
  });
  // Only fields used by the betting adapter; upstream seating, deck, rake and RIT
  // APIs are intentionally outside this boundary (see docs/POKER_KERNEL.md).
  return {
    gameType: table.tournamentId ? "tour" : "cash", gameVariant: "NLH", bettingStructure: "No Limit",
    config: { minPlayers: 2, maxPlayers: table.maxPlayers, blinds: { small: table.smallBlind, big: table.bigBlind }, runItTwice: false },
    players, round: {
      stage: table.status, communityCards: [], currentPlayer: table.seats[table.activeSeatIndex]?.userId || "",
      deck: [], hasRaised: false, lastRaiseAmount: table.minRaise, betTo: table.currentBet
    },
    pots: [], dealerPosition: table.dealerIndex,
    waitingPlayers: [], sitOutPlayers: [], outOfChipsPlayers: [], version: 1
  };
}

function assertMoney(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("Некорректная сумма за столом", 400);
}

function stateTotal(stacks, pot) {
  const total = stacks.reduce((sum, stack) => sum + BigInt(stack), BigInt(pot));
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) fail("Превышен допустимый размер банка", 400);
  return total;
}

function fail(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
