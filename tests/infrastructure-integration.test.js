import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTableWalletMutation,
  closeDatabase,
  getCashWallet,
  initDatabase,
  listActiveTableSnapshots,
  registerTournament,
  setCashWallet,
  settleTournament,
  upsertTournamentDefinitions
} from "../server/db.js";
import {
  closeStateStore,
  getTableSnapshot,
  initStateStore,
  setTableSnapshot,
  withTableLock
} from "../server/state-store.js";
import { calculateTournamentPayouts, createTournamentRuntime } from "../server/tournament-engine.js";

const enabled = process.env.RUN_INFRA_INTEGRATION_TESTS === "true"
  && Boolean(process.env.DATABASE_URL)
  && Boolean(process.env.REDIS_URL);

test("PostgreSQL/Redis atomicity, restart recovery and commit-timeout retries", { skip: !enabled }, async () => {
  const suffix = `${Date.now()}-${process.pid}`;
  const userId = `infra-wallet-${suffix}`;
  const table = {
    id: `infra-table-${suffix}`,
    name: "Infra atomic table",
    gameMode: "cash",
    isPrivate: true,
    isSystem: false,
    smallBlind: 10_000,
    bigBlind: 20_000,
    status: "waiting",
    handNumber: 0,
    stateRevision: 1,
    seats: [{ userId, stack: 1_000_000 }],
    events: []
  };
  await initDatabase();
  await initStateStore();
  try {
    await setCashWallet(userId, 2_000_000);
    const entry = {
      type: "debit",
      category: "table_buyin",
      title: "Integration buy-in",
      amount: 1_000_000,
      idempotencyKey: `infra-buyin-${suffix}`
    };
    const first = await applyTableWalletMutation(userId, { table, entry });
    assert.equal(first.balance, 1_000_000);
    const retryAfterUnknownCommit = await applyTableWalletMutation(userId, {
      table: { ...table, stateRevision: 0, seats: [] },
      entry
    });
    assert.equal(retryAfterUnknownCommit.idempotentReplay, true);
    assert.equal(await getCashWallet(userId), 1_000_000);
    assert.ok((await listActiveTableSnapshots()).some((snapshot) => snapshot.id === table.id && snapshot.raw.seats.length === 1));

    await setTableSnapshot(table);
    await closeStateStore();
    await initStateStore();
    assert.equal((await getTableSnapshot(table.id)).seats[0].stack, 1_000_000);

    let concurrent = 0;
    await Promise.all([
      withTableLock(table.id, async () => { const value = concurrent; await new Promise((resolve) => setTimeout(resolve, 30)); concurrent = value + 1; }),
      withTableLock(table.id, async () => { const value = concurrent; await new Promise((resolve) => setTimeout(resolve, 30)); concurrent = value + 1; })
    ]);
    assert.equal(concurrent, 2);
  } finally {
    await closeStateStore();
    await closeDatabase();
  }
});

test("PostgreSQL tournament guarantee payout is atomic and idempotent", { skip: !enabled }, async () => {
  const suffix = `${Date.now()}-${process.pid}`;
  const tournament = createTournamentRuntime({
    id: `infra-freeroll-${suffix}`,
    title: "Infra freeroll",
    status: "registration_open",
    buyIn: 0,
    fee: 0,
    guaranteedPrizePool: 1_000_000,
    minPlayers: 2,
    maxPlayers: 2,
    registrationOpensAt: new Date(Date.now() - 1_000),
    startsAt: new Date(Date.now() + 60_000)
  });
  const players = [`infra-p1-${suffix}`, `infra-p2-${suffix}`];
  await initDatabase();
  try {
    await upsertTournamentDefinitions([tournament]);
    for (const userId of players) {
      await registerTournament(userId, tournament, "telegram", `infra-register-${userId}`);
      tournament.registrations.set(userId, { userId, name: userId });
    }
    const ranked = players.map((userId, index) => ({ userId, place: index + 1 }));
    const { payouts } = calculateTournamentPayouts(tournament, ranked);
    const first = await settleTournament(tournament, ranked, payouts, `infra-payout-${suffix}`);
    assert.equal(first.idempotentReplay, false);
    const balances = await Promise.all(players.map((userId) => getCashWallet(userId)));
    assert.equal(balances.reduce((sum, value) => sum + value, 0), 1_000_000);
    const retry = await settleTournament(tournament, ranked, payouts, `infra-payout-${suffix}`);
    assert.equal(retry.idempotentReplay, true);
    const balancesAfterRetry = await Promise.all(players.map((userId) => getCashWallet(userId)));
    assert.deepEqual(balancesAfterRetry, balances);
  } finally {
    await closeDatabase();
  }
});
