import test from "node:test";
import assert from "node:assert/strict";
import {
  TOURNAMENT_STATUSES,
  applyTournamentTransition,
  calculateTournamentPayouts,
  createTournamentRuntime,
  currentBlindLevel,
  payoutPercentages,
  schedulerDecision,
  seatTournamentPlayers
} from "../server/tournament-engine.js";

test("scheduled MTT opens registration and starts only with enough players", () => {
  const now = Date.parse("2026-06-20T12:00:00.000Z");
  const tournament = createTournamentRuntime({
    id: "mtt-1",
    type: "mtt",
    status: "created",
    registrationOpensAt: new Date(now - 1000),
    startsAt: new Date(now + 1000),
    minPlayers: 2,
    maxPlayers: 12
  }, now);

  assert.equal(schedulerDecision(tournament, now), "open_registration");
  applyTournamentTransition(tournament, "open_registration", now);
  assert.equal(schedulerDecision(tournament, now), null);
  assert.equal(schedulerDecision(tournament, now + 2000), "cancel");

  tournament.registrations.set("u1", { userId: "u1" });
  tournament.registrations.set("u2", { userId: "u2" });
  assert.equal(schedulerDecision(tournament, now + 2000), "start");
});

test("SNG starts immediately when full", () => {
  const now = Date.now();
  const tournament = createTournamentRuntime({
    id: "sng-1",
    type: "sng",
    status: "registration_open",
    startsAt: new Date(now + 60_000),
    minPlayers: 2,
    maxPlayers: 3
  }, now);
  tournament.registrations.set("u1", { userId: "u1" });
  tournament.registrations.set("u2", { userId: "u2" });
  assert.equal(schedulerDecision(tournament, now), null);
  tournament.registrations.set("u3", { userId: "u3" });
  assert.equal(schedulerDecision(tournament, now), "start");
});

test("seating is balanced and never exceeds table capacity", () => {
  const players = Array.from({ length: 17 }, (_, index) => ({ userId: `u${index + 1}` }));
  const tables = seatTournamentPlayers(players, 6, (values) => values);
  assert.deepEqual(tables.map((table) => table.players.length), [6, 6, 5]);
  assert.equal(new Set(tables.flatMap((table) => table.players.map((player) => player.userId))).size, 17);
});

test("blind clock advances through configured levels", () => {
  const startedAt = Date.parse("2026-06-20T12:00:00.000Z");
  const tournament = createTournamentRuntime({
    id: "mtt-levels",
    startedAt: new Date(startedAt),
    structure: [
      { level: 1, durationSeconds: 60, sb: 10, bb: 20, ante: 0 },
      { level: 2, durationSeconds: 60, sb: 20, bb: 40, ante: 5 }
    ]
  }, startedAt);

  assert.equal(currentBlindLevel(tournament, startedAt + 59_000).level, 1);
  assert.deepEqual(currentBlindLevel(tournament, startedAt + 60_000), {
    level: 2,
    durationSeconds: 60,
    smallBlind: 20,
    bigBlind: 40,
    ante: 5
  });
  assert.equal(currentBlindLevel(tournament, startedAt + 120_000).level, 3);
});

test("payout preserves every integer unit and follows MVP places", () => {
  const tournament = createTournamentRuntime({ id: "mtt-pay", buyIn: 101, maxPlayers: 9 });
  for (let index = 1; index <= 9; index += 1) {
    tournament.registrations.set(`u${index}`, { userId: `u${index}` });
  }
  const ranked = Array.from({ length: 9 }, (_, index) => ({ userId: `u${index + 1}` }));
  const result = calculateTournamentPayouts(tournament, ranked);

  assert.deepEqual(payoutPercentages(9), [65, 35]);
  assert.equal(result.prizePool, 909);
  assert.equal(result.payouts.length, 2);
  assert.equal(result.payouts.reduce((sum, payout) => sum + payout.amount, 0), 909);
  assert.equal(result.payouts[0].place, 1);
  assert.equal(result.payouts[1].place, 2);
});

test("state machine records terminal timestamps", () => {
  const now = Date.now();
  const tournament = createTournamentRuntime({ id: "mtt-finish" }, now);
  applyTournamentTransition(tournament, "start", now);
  assert.ok([TOURNAMENT_STATUSES.RUNNING, TOURNAMENT_STATUSES.LATE_REGISTRATION].includes(tournament.status));
  applyTournamentTransition(tournament, "final_table", now + 1000);
  assert.equal(tournament.status, TOURNAMENT_STATUSES.FINAL_TABLE);
  applyTournamentTransition(tournament, "finish", now + 2000);
  assert.equal(tournament.status, TOURNAMENT_STATUSES.FINISHED);
  assert.equal(tournament.finishedAt, new Date(now + 2000).toISOString());
});
