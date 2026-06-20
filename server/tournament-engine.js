import { randomInt } from "node:crypto";

export const TOURNAMENT_STATUSES = Object.freeze({
  CREATED: "created",
  REGISTRATION_OPEN: "registration_open",
  LATE_REGISTRATION: "late_registration",
  RUNNING: "running",
  FINAL_TABLE: "final_table",
  FINISHED: "finished",
  CANCELLED: "cancelled"
});

export const DEFAULT_TOURNAMENT_STRUCTURE = Object.freeze([
  { level: 1, durationSeconds: 600, smallBlind: 25, bigBlind: 50, ante: 0 },
  { level: 2, durationSeconds: 600, smallBlind: 50, bigBlind: 100, ante: 0 },
  { level: 3, durationSeconds: 600, smallBlind: 75, bigBlind: 150, ante: 0 },
  { level: 4, durationSeconds: 600, smallBlind: 100, bigBlind: 200, ante: 25 },
  { level: 5, durationSeconds: 720, smallBlind: 150, bigBlind: 300, ante: 25 },
  { level: 6, durationSeconds: 720, smallBlind: 200, bigBlind: 400, ante: 50 },
  { level: 7, durationSeconds: 720, smallBlind: 300, bigBlind: 600, ante: 75 },
  { level: 8, durationSeconds: 900, smallBlind: 400, bigBlind: 800, ante: 100 }
]);

export function createTournamentRuntime(config, now = Date.now()) {
  const startsAt = timestamp(config.startsAt, now);
  const registrationOpensAt = timestamp(config.registrationOpensAt, now);
  const status = normalizeStatus(config.status || (
    registrationOpensAt <= now ? TOURNAMENT_STATUSES.REGISTRATION_OPEN : TOURNAMENT_STATUSES.CREATED
  ));
  const structure = normalizeStructure(config.structure);
  return {
    ...config,
    id: String(config.id),
    type: normalizeType(config.type),
    status,
    buyIn: nonNegativeInteger(config.buyIn),
    fee: nonNegativeInteger(config.fee),
    guaranteedPrizePool: nonNegativeInteger(config.guaranteedPrizePool),
    maxPlayers: positiveInteger(config.maxPlayers, 6),
    minPlayers: Math.min(positiveInteger(config.minPlayers, 2), positiveInteger(config.maxPlayers, 6)),
    maxPlayersPerTable: Math.min(6, Math.max(2, positiveInteger(config.maxPlayersPerTable, 6))),
    startingStack: positiveInteger(config.startingStack, 10_000),
    structure,
    payoutStructure: Array.isArray(config.payoutStructure) ? config.payoutStructure : null,
    balanceBucket: config.balanceBucket === "cash" ? "cash" : "play",
    startsAt: new Date(startsAt).toISOString(),
    registrationOpensAt: new Date(registrationOpensAt).toISOString(),
    lateRegEndsAt: config.lateRegEndsAt ? new Date(timestamp(config.lateRegEndsAt, startsAt)).toISOString() : null,
    reEntryLimit: nonNegativeInteger(config.reEntryLimit),
    addOnAllowed: config.addOnAllowed === true,
    registrations: config.registrations instanceof Map ? config.registrations : new Map(),
    tables: config.tables instanceof Map ? config.tables : new Map(),
    eliminations: Array.isArray(config.eliminations) ? config.eliminations : [],
    results: Array.isArray(config.results) ? config.results : [],
    startedAt: config.startedAt || null,
    finishedAt: config.finishedAt || null,
    cancelledAt: config.cancelledAt || null,
    currentLevel: positiveInteger(config.currentLevel, 1)
  };
}

export function registrationAllowed(tournament, userId) {
  const statusAllowed = tournament.status === TOURNAMENT_STATUSES.REGISTRATION_OPEN
    || tournament.status === TOURNAMENT_STATUSES.LATE_REGISTRATION;
  return statusAllowed
    && tournament.registrations.size < tournament.maxPlayers
    && !tournament.registrations.has(String(userId));
}

export function cancellationAllowed(tournament, userId) {
  return tournament.status === TOURNAMENT_STATUSES.REGISTRATION_OPEN
    && tournament.registrations.has(String(userId));
}

export function schedulerDecision(tournament, now = Date.now()) {
  const participants = tournament.registrations.size;
  if (tournament.status === TOURNAMENT_STATUSES.CREATED
    && timestamp(tournament.registrationOpensAt, now) <= now) return "open_registration";

  if (tournament.status !== TOURNAMENT_STATUSES.REGISTRATION_OPEN) return null;
  const fullSng = tournament.type === "sng" && participants >= tournament.maxPlayers;
  if (!fullSng && timestamp(tournament.startsAt, now) > now) return null;
  if (participants < tournament.minPlayers) return "cancel";
  return "start";
}

export function applyTournamentTransition(tournament, transition, now = Date.now()) {
  const allowedFrom = {
    open_registration: [TOURNAMENT_STATUSES.CREATED],
    start: [TOURNAMENT_STATUSES.REGISTRATION_OPEN],
    close_late_registration: [TOURNAMENT_STATUSES.LATE_REGISTRATION],
    final_table: [TOURNAMENT_STATUSES.LATE_REGISTRATION, TOURNAMENT_STATUSES.RUNNING],
    finish: [TOURNAMENT_STATUSES.LATE_REGISTRATION, TOURNAMENT_STATUSES.RUNNING, TOURNAMENT_STATUSES.FINAL_TABLE],
    cancel: [TOURNAMENT_STATUSES.CREATED, TOURNAMENT_STATUSES.REGISTRATION_OPEN]
  }[transition];
  if (!allowedFrom?.includes(tournament.status)) {
    throw new Error(`Invalid tournament transition: ${tournament.status} -> ${transition}`);
  }
  if (transition === "open_registration") tournament.status = TOURNAMENT_STATUSES.REGISTRATION_OPEN;
  if (transition === "start") {
    tournament.startedAt = new Date(now).toISOString();
    tournament.status = tournament.lateRegEndsAt && timestamp(tournament.lateRegEndsAt, now) > now
      ? TOURNAMENT_STATUSES.LATE_REGISTRATION
      : TOURNAMENT_STATUSES.RUNNING;
    tournament.currentLevel = 1;
  }
  if (transition === "close_late_registration" && tournament.status === TOURNAMENT_STATUSES.LATE_REGISTRATION) {
    tournament.status = TOURNAMENT_STATUSES.RUNNING;
  }
  if (transition === "final_table") tournament.status = TOURNAMENT_STATUSES.FINAL_TABLE;
  if (transition === "finish") {
    tournament.status = TOURNAMENT_STATUSES.FINISHED;
    tournament.finishedAt = new Date(now).toISOString();
  }
  if (transition === "cancel") {
    tournament.status = TOURNAMENT_STATUSES.CANCELLED;
    tournament.cancelledAt = new Date(now).toISOString();
  }
  return tournament;
}

export function seatTournamentPlayers(registrations, maxPlayersPerTable = 6, shuffle = secureShuffle) {
  const players = shuffle([...registrations].map((entry) => ({ ...entry })));
  if (!players.length) return [];
  const tableCount = Math.ceil(players.length / maxPlayersPerTable);
  const tables = Array.from({ length: tableCount }, (_, index) => ({ index, players: [] }));
  players.forEach((player, index) => tables[index % tableCount].players.push(player));
  return tables;
}

export function balancedSeating(players, maxPlayersPerTable = 6, shuffle = secureShuffle) {
  return seatTournamentPlayers(players, maxPlayersPerTable, shuffle);
}

export function currentBlindLevel(tournament, now = Date.now()) {
  const startedAt = timestamp(tournament.startedAt, now);
  let elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  for (const level of tournament.structure) {
    if (elapsed < level.durationSeconds) return level;
    elapsed -= level.durationSeconds;
  }
  const last = tournament.structure.at(-1);
  const extra = Math.floor(elapsed / last.durationSeconds) + 1;
  const multiplier = 1.5 ** extra;
  return {
    level: last.level + extra,
    durationSeconds: last.durationSeconds,
    smallBlind: Math.max(last.smallBlind, Math.round(last.smallBlind * multiplier)),
    bigBlind: Math.max(last.bigBlind, Math.round(last.bigBlind * multiplier)),
    ante: Math.round(last.ante * multiplier)
  };
}

export function payoutPercentages(playerCount) {
  if (playerCount <= 8) return [100];
  if (playerCount <= 27) return [65, 35];
  if (playerCount <= 54) return [50, 30, 20];
  const paidPlaces = Math.max(1, Math.ceil(playerCount * (playerCount >= 163 ? 0.15 : 0.10)));
  const weights = Array.from({ length: paidPlaces }, (_, index) => 1 / ((index + 1) ** 0.72));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((weight) => weight * 100 / total);
}

export function calculateTournamentPayouts(tournament, rankedPlayers) {
  const prizePool = nonNegativeInteger(tournament.buyIn) * tournament.registrations.size;
  const configured = normalizePayoutStructure(tournament.payoutStructure);
  const rawPercentages = configured.length ? configured : payoutPercentages(rankedPlayers.length);
  const percentageTotal = rawPercentages.reduce((sum, percent) => sum + percent, 0);
  const percentages = rawPercentages.map((percent) => percent * 100 / percentageTotal);
  const paid = rankedPlayers.slice(0, percentages.length);
  let allocated = 0;
  const payouts = paid.map((player, index) => {
    const amount = index === paid.length - 1
      ? prizePool - allocated
      : Math.floor(prizePool * percentages[index] / 100);
    allocated += amount;
    return { ...player, place: index + 1, amount, percent: percentages[index] };
  });
  return { prizePool, payouts };
}

function normalizeStructure(structure) {
  const source = Array.isArray(structure) && structure.length ? structure : DEFAULT_TOURNAMENT_STRUCTURE;
  return source.map((level, index) => ({
    level: positiveInteger(level.level, index + 1),
    durationSeconds: positiveInteger(level.durationSeconds || Number(level.durationMin) * 60, 600),
    smallBlind: positiveInteger(level.smallBlind ?? level.sb, 25),
    bigBlind: positiveInteger(level.bigBlind ?? level.bb, 50),
    ante: nonNegativeInteger(level.ante)
  }));
}

function normalizePayoutStructure(structure) {
  if (!Array.isArray(structure)) return [];
  return structure
    .map((entry) => Number(entry.percent ?? entry))
    .filter((percent) => Number.isFinite(percent) && percent > 0);
}

function normalizeStatus(status) {
  if (status === "registering") return TOURNAMENT_STATUSES.REGISTRATION_OPEN;
  if (status === "planned") return TOURNAMENT_STATUSES.CREATED;
  return Object.values(TOURNAMENT_STATUSES).includes(status) ? status : TOURNAMENT_STATUSES.CREATED;
}

function normalizeType(type) {
  const value = String(type || "mtt").toLowerCase().replaceAll("&", "_and_").replaceAll(/[^a-z0-9]+/g, "_");
  return value === "sng" || value === "sit_and_go" || value === "sit_go" || value === "sitandgo" ? "sng" : "mtt";
}

function secureShuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

function timestamp(value, fallback) {
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function positiveInteger(value, fallback) {
  const normalized = Math.round(Number(value) || 0);
  return normalized > 0 ? normalized : fallback;
}
