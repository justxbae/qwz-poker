import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 3901;
const BASE_URL = `http://127.0.0.1:${PORT}`;

test("table auto-starts, accepts custom raise, and pays the pot at showdown", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "dev-user" });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 2);
    let table = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Flow", maxPlayers: 2, smallBlind: 25, buyInAmount: 10000 }
    })).table;

    table = (await request(`/api/tables/${table.id}/add-test-player`, {
      method: "POST",
      token: auth.token
    })).table;

    assert.equal(table.status, "starting");

    table = (await request(`/api/tables/${table.id}/start-hand`, {
      method: "POST",
      token: auth.token
    })).table;

    assert.equal(table.status, "preflop");
    assert.equal(table.pot, 75);
    assert.equal(table.viewer.canAct, true);

    table = (await request(`/api/tables/${table.id}/act`, {
      method: "POST",
      token: auth.token,
      body: { action: "raise", amount: 200 }
    })).table;

    assert.equal(table.currentBet, 250);
    assert.equal(table.pot, 300);

    let steps = 0;
    while (table.status !== "showdown" && steps < 20) {
      if (table.viewer.canAct) {
        table = (await request(`/api/tables/${table.id}/act`, {
          method: "POST",
          token: auth.token,
          body: { action: table.viewer.canCall ? "call" : "check" }
        })).table;
      } else {
        table = (await request(`/api/tables/${table.id}/auto-act`, {
          method: "POST",
          token: auth.token
        })).table;
      }
      steps += 1;
    }

    assert.equal(table.status, "showdown");
    assert.equal(table.pot, 0);
    assert.equal(table.seats.reduce((sum, seat) => sum + seat.stack, 0), 19975);
    assert.match(table.message, /забирает банк/);

    const dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.equal(dashboard.stats.handHistoryCount, 1);
    assert.ok(dashboard.recentHands.some((hand) => hand.handNumber === table.handNumber));
  } finally {
    server.kill();
  }
});

test("public lobby tables are seeded and stay available when empty", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 2);
    const lobby = await request("/api/tables", { token: auth.token });
    const publicTable = lobby.tables.find((table) => !table.isPrivate && table.smallBlind === 25);

    assert.ok(publicTable);
    assert.equal(publicTable.seats.length, 0);

    const joined = await request(`/api/tables/${publicTable.id}/join`, {
      method: "POST",
      token: auth.token,
      body: { buyInAmount: 10000 }
    });
    assert.equal(joined.table.viewer.isSeated, true);

    await request(`/api/tables/${publicTable.id}/stand`, {
      method: "POST",
      token: auth.token
    });

    const afterStand = await request("/api/tables", { token: auth.token });
    const sameTable = afterStand.tables.find((table) => table.id === publicTable.id);
    assert.ok(sameTable);
    assert.equal(sameTable.seats.length, 0);
    assert.equal(sameTable.isPrivate, false);
  } finally {
    server.kill();
  }
});

test("health endpoint is public and admin dashboard exposes diagnostics", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "dev-user" });
  try {
    const health = (await request("/api/health")).health;
    assert.equal(health.ok, true);
    assert.equal(health.database.mode, "memory");
    assert.equal(typeof health.uptimeSeconds, "number");
    assert.equal(health.sessions, undefined);
    assert.equal(health.memory, undefined);

    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    const dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.equal(dashboard.diagnostics.ok, true);
    assert.equal(dashboard.diagnostics.database.mode, "memory");
    assert.equal(typeof dashboard.diagnostics.sessions, "number");
    assert.equal(typeof dashboard.diagnostics.memory.heapUsedMb, "number");
  } finally {
    server.kill();
  }
});

test("seated player can control test bots at public system tables", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 2);
    const lobby = await request("/api/tables", { token: auth.token });
    const publicTable = lobby.tables.find((table) => !table.isPrivate && table.smallBlind === 25);

    let table = (await request(`/api/tables/${publicTable.id}/join`, {
      method: "POST",
      token: auth.token,
      body: { buyInAmount: 10000 }
    })).table;

    for (let index = 0; index < 5; index += 1) {
      table = (await request(`/api/tables/${table.id}/add-test-player`, {
        method: "POST",
        token: auth.token
      })).table;
    }

    table = (await request(`/api/tables/${table.id}/start-hand`, {
      method: "POST",
      token: auth.token
    })).table;

    assert.equal(table.viewer.canControlTestBot, true);

    table = (await request(`/api/tables/${table.id}/test-bot-act`, {
      method: "POST",
      token: auth.token,
      body: { action: "fold" }
    })).table;

    assert.equal(table.seats.some((seat) => seat.folded), true);
  } finally {
    server.kill();
  }
});

test("leaving a table persists the player stack in the session", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 2);
    let table = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Leave", maxPlayers: 2, smallBlind: 25, buyInAmount: 10000 }
    })).table;

    table = (await request(`/api/tables/${table.id}/add-test-player`, {
      method: "POST",
      token: auth.token
    })).table;

    table = (await request(`/api/tables/${table.id}/start-hand`, {
      method: "POST",
      token: auth.token
    })).table;

    assert.equal(table.seats[0].stack, 9975);

    await request(`/api/tables/${table.id}/leave`, {
      method: "POST",
      token: auth.token
    });

    const nextTable = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Rejoin", maxPlayers: 2, smallBlind: 25 }
    })).table;

    assert.equal(nextTable.seats[0].stack, 9975);
  } finally {
    server.kill();
  }
});

test("standing keeps the table open as observer and allows sitting again", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 2);
    let table = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Stand", maxPlayers: 2, smallBlind: 25, buyInAmount: 10000 }
    })).table;

    table = (await request(`/api/tables/${table.id}/add-test-player`, {
      method: "POST",
      token: auth.token
    })).table;
    table = (await request(`/api/tables/${table.id}/start-hand`, {
      method: "POST",
      token: auth.token
    })).table;

    const stood = await request(`/api/tables/${table.id}/stand`, {
      method: "POST",
      token: auth.token
    });

    assert.equal(stood.table.viewer.isSeated, false);
    assert.equal(stood.table.seats.length, 1);

    const reseated = await request(`/api/tables/${table.id}/join`, {
      method: "POST",
      token: auth.token
    });

    assert.equal(reseated.table.viewer.isSeated, true);
    assert.equal(reseated.table.seats.length, 2);
    assert.equal(reseated.table.seats.find((seat) => seat.userId === "dev-user").stack, 9925);
  } finally {
    server.kill();
  }
});

test("initial buy-in chooses table stack and spends wallet balance", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "dev-user" });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 4);
    const table = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "BuyIn", maxPlayers: 2, smallBlind: 25, buyInAmount: 20000 }
    })).table;

    assert.equal(table.viewer.balance, 0);
    assert.equal(table.seats.find((seat) => seat.userId === "dev-user").stack, 20000);

    const dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.ok(dashboard.recentFundMovements.some((movement) => (
      movement.category === "wallet_to_table"
      && movement.from === "wallet"
      && movement.to === "table"
      && movement.amount === 20000
    )));
  } finally {
    server.kill();
  }
});

test("cashier returns deposit settings and records wallet operations", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    let cashier = (await request("/api/cashier", { token: auth.token })).cashier;

    assert.equal(cashier.balance, 0);
    assert.equal(cashier.packages, undefined);
    assert.equal(cashier.deposit.minRub, 100);
    assert.equal(cashier.deposit.chipsPerRub, 50);
    assert.equal(cashier.deposit.methods.find((method) => method.id === "stars").enabled, true);
    assert.equal(cashier.deposit.methods.find((method) => method.id === "ton").enabled, false);
    assert.equal(cashier.deposit.methods.find((method) => method.id === "usdt_trc20").enabled, false);
    assert.equal(cashier.transactions.length, 0);

    await assert.rejects(
      request("/api/cashier/crypto-order", {
        method: "POST",
        token: auth.token,
        body: { method: "ton", rubAmount: 100 }
      }),
      /crypto-метод еще не подключен/
    );

    cashier = (await request("/api/cashier/demo-topup", {
      method: "POST",
      token: auth.token,
      body: { rubAmount: 100 }
    })).cashier;

    assert.equal(cashier.balance, 5000);
    assert.equal(cashier.transactions[0].title, "Пополнение баланса");
    assert.equal(cashier.transactions[0].amount, 5000);
    assert.equal(cashier.transactions[0].category, "deposit_demo");

    cashier = await topUp(auth.token, 3);

    await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Cashier", maxPlayers: 2, smallBlind: 25, buyInAmount: 20000 }
    });

    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 0);
    assert.equal(cashier.transactions[0].title, "Бай-ин за стол");
    assert.equal(cashier.transactions[0].amount, 20000);
    assert.equal(cashier.transactions[0].category, "table_buyin");
  } finally {
    server.kill();
  }
});

test("idempotency key prevents duplicated wallet money operations", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "dev-user" });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });

    let cashier = (await request("/api/cashier/demo-topup", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-demo-topup",
      body: { rubAmount: 100 }
    })).cashier;
    assert.equal(cashier.balance, 5000);

    cashier = (await request("/api/cashier/demo-topup", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-demo-topup",
      body: { rubAmount: 100 }
    })).cashier;
    assert.equal(cashier.balance, 5000);
    assert.equal(cashier.transactions.filter((entry) => entry.category === "deposit_demo").length, 1);

    const firstTable = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-table-create",
      body: { name: "Idem", maxPlayers: 2, smallBlind: 25, buyInAmount: 2500 }
    })).table;

    const replayTable = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-table-create",
      body: { name: "Idem", maxPlayers: 2, smallBlind: 25, buyInAmount: 2500 }
    })).table;

    assert.equal(replayTable.id, firstTable.id);
    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 2500);
    assert.equal(cashier.transactions.filter((entry) => entry.category === "table_buyin").length, 1);

    const dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.equal(dashboard.audit.reconciliation.walletLedgerDrift, 0);
    assert.equal(dashboard.audit.reconciliation.starsDepositDrift, 0);
  } finally {
    server.kill();
  }
});

test("crypto deposit order can be created but does not credit chips before confirmation", async () => {
  const server = await startServer({
    TON_PAYMENTS_ENABLED: "true",
    TON_RECEIVER_ADDRESS: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
    TON_RUB_RATE: "250"
  });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    const cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.deposit.methods.find((method) => method.id === "ton").enabled, true);

    const data = await request("/api/cashier/crypto-order", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "ton-order-once",
      body: { method: "ton", rubAmount: 250 }
    });

    assert.equal(data.order.method, "ton");
    assert.equal(data.order.asset, "TON");
    assert.equal(data.order.cryptoAmount, 1);
    assert.equal(data.order.chips, 12500);
    assert.equal(data.order.tonConnect.comment, data.order.payload);

    const after = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(after.balance, 0);

    await request("/api/payments/crypto/webhook", {
      method: "POST",
      body: {
        orderId: data.order.id,
        status: "confirmed",
        paidAmount: 1,
        txHash: "ton-test-hash"
      }
    });

    const paid = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(paid.balance, 12500);
    assert.equal(paid.transactions[0].category, "deposit_ton");
  } finally {
    server.kill();
  }
});

test("admin telegram commands grant and deduct wallet chips", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "777" });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });

    await request("/api/telegram/webhook", {
      method: "POST",
      body: {
        message: {
          chat: { id: 777 },
          from: { id: 123, first_name: "Nope" },
          text: "/grant dev-user 15000 blocked"
        }
      }
    });

    let cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 0);

    await request("/api/telegram/webhook", {
      method: "POST",
      body: {
        message: {
          chat: { id: 777 },
          from: { id: 777, first_name: "Admin", username: "admin" },
          text: "/grant dev-user 15000 test_bonus"
        }
      }
    });

    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 15000);
    assert.equal(cashier.transactions[0].title, "Ручное начисление");
    assert.equal(cashier.transactions[0].amount, 15000);
    assert.equal(cashier.transactions[0].category, "admin_grant");

    await request("/api/telegram/webhook", {
      method: "POST",
      body: {
        message: {
          chat: { id: 777 },
          from: { id: 777, first_name: "Admin", username: "admin" },
          text: "/deduct dev-user 5000 correction"
        }
      }
    });

    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 10000);
    assert.equal(cashier.transactions[0].title, "Ручное списание");
    assert.equal(cashier.transactions[0].amount, 5000);
    assert.equal(cashier.transactions[0].category, "admin_deduct");
  } finally {
    server.kill();
  }
});

test("admin api exposes dashboard and manual wallet adjustments", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "dev-user" });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    let dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.equal(dashboard.stats.players, 1);
    assert.equal(dashboard.stats.walletTotal, 0);

    let data = await request("/api/admin/wallet-adjust", {
      method: "POST",
      token: auth.token,
      body: {
        telegramId: "dev-user",
        type: "grant",
        amount: 25000,
        reason: "admin_panel_test",
        requestId: "adjust-once"
      }
    });

    assert.equal(data.player.balance, 25000);
    assert.equal(data.player.transactions[0].title, "Ручное начисление");
    assert.equal(data.player.transactions[0].category, "admin_grant");

    data = await request("/api/admin/wallet-adjust", {
      method: "POST",
      token: auth.token,
      body: {
        telegramId: "dev-user",
        type: "grant",
        amount: 25000,
        reason: "admin_panel_test",
        requestId: "adjust-once"
      }
    });

    assert.equal(data.player.balance, 25000);
    assert.equal(data.adjustment.idempotentReplay, true);

    data = await request("/api/admin/users/dev-user", { token: auth.token });
    assert.equal(data.player.totalBankroll, 25000);

    dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.equal(dashboard.stats.walletTotal, 25000);
    assert.equal(dashboard.stats.playerFundsTotal, 25000);
    assert.equal(dashboard.audit.walletTotal, 25000);
    assert.equal(dashboard.audit.playerFundsTotal, 25000);
    assert.equal(dashboard.audit.ledgerCreditTotal, 25000);
    assert.ok(dashboard.recentEvents.some((event) => event.type === "grant"));
  } finally {
    server.kill();
  }
});

test("admin api rejects non-admin sessions", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "777" });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await assert.rejects(
      request("/api/admin", { token: auth.token }),
      /Admin access denied/
    );
  } finally {
    server.kill();
  }
});

test("tournament registration spends chips and cancellation refunds them", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "dev-user" });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 2);

    let data = await request("/api/tournaments", { token: auth.token });
    const tournament = data.tournaments.find((item) => item.status === "registering");
    assert.ok(tournament);
    assert.equal(tournament.registered, false);

    data = await request(`/api/tournaments/${tournament.id}/register`, {
      method: "POST",
      token: auth.token
    });

    let registered = data.tournaments.find((item) => item.id === tournament.id);
    assert.equal(registered.registered, true);
    assert.equal(registered.participants, tournament.participants + 1);
    assert.equal(data.profile.balance, 10000 - tournament.totalCost);
    assert.equal(data.cashier.transactions[0].title, "Вход в турнир");
    assert.equal(data.cashier.transactions[0].category, "tournament_buyin");

    const dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.equal(dashboard.stats.walletTotal, 10000 - tournament.totalCost);
    assert.equal(dashboard.stats.tournamentEscrowTotal, tournament.totalCost);
    assert.equal(dashboard.stats.tournamentPrizePoolTotal, tournament.buyIn);
    assert.equal(dashboard.stats.tournamentFeeReserveTotal, tournament.fee);
    assert.equal(dashboard.stats.playerFundsTotal, 10000);
    assert.ok(dashboard.recentFundMovements.some((movement) => (
      movement.category === "wallet_to_tournament_escrow"
      && movement.amount === tournament.totalCost
    )));

    data = await request(`/api/tournaments/${tournament.id}/cancel`, {
      method: "POST",
      token: auth.token
    });

    registered = data.tournaments.find((item) => item.id === tournament.id);
    assert.equal(registered.registered, false);
    assert.equal(registered.participants, tournament.participants);
    assert.equal(data.profile.balance, 10000);
    assert.equal(data.cashier.transactions[0].title, "Возврат турнирного бай-ина");
    assert.equal(data.cashier.transactions[0].category, "tournament_refund");
    const afterCancelDashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.ok(afterCancelDashboard.recentFundMovements.some((movement) => (
      movement.category === "tournament_escrow_to_wallet"
      && movement.amount === tournament.totalCost
    )));
  } finally {
    server.kill();
  }
});

test("rebuy adds chips only between hands and spends wallet balance", async () => {
  const server = await startServer({ ADMIN_USER_IDS: "dev-user" });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 4);
    let table = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Rebuy", maxPlayers: 2, smallBlind: 25, buyInAmount: 10000 }
    })).table;

    const rebuy = await request(`/api/tables/${table.id}/rebuy`, {
      method: "POST",
      token: auth.token,
      body: { amount: 5000 }
    });

    table = rebuy.table;
    assert.equal(table.viewer.balance, 5000);
    assert.equal(table.seats.find((seat) => seat.userId === "dev-user").stack, 15000);
    const cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.transactions[0].category, "table_rebuy");
    let dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.ok(dashboard.recentFundMovements.some((movement) => (
      movement.category === "wallet_to_table_rebuy"
      && movement.amount === 5000
    )));

    table = (await request(`/api/tables/${table.id}/add-test-player`, {
      method: "POST",
      token: auth.token
    })).table;
    table = (await request(`/api/tables/${table.id}/start-hand`, {
      method: "POST",
      token: auth.token
    })).table;

    await assert.rejects(
      request(`/api/tables/${table.id}/rebuy`, {
        method: "POST",
        token: auth.token,
        body: { amount: 5000 }
      }),
      /Докупить фишки можно только между раздачами/
    );

    await request(`/api/tables/${table.id}/stand`, {
      method: "POST",
      token: auth.token
    });
    dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.ok(dashboard.recentFundMovements.some((movement) => (
      movement.category === "table_to_saved_stack"
      && movement.from === "table"
      && movement.to === "saved_stack"
      && movement.amount > 0
    )));
  } finally {
    server.kill();
  }
});

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

async function topUp(token, count = 1) {
  let cashier = null;
  for (let index = 0; index < count; index += 1) {
    cashier = (await request("/api/cashier/demo-topup", {
      method: "POST",
      token,
      body: { rubAmount: 100 }
    })).cashier;
  }
  return cashier;
}

function startServer(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        BOT_TOKEN: "test-token",
        NODE_ENV: "test",
        ...extraEnv
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Server did not start in time"));
    }, 5000);

    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes(`http://127.0.0.1:${PORT}`)) {
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on("data", (chunk) => {
      const message = String(chunk);
      if (message.includes("EADDRINUSE") || message.includes("SyntaxError")) {
        clearTimeout(timeout);
        child.kill();
        reject(new Error(message));
      }
    });
    child.on("error", reject);
  });
}
