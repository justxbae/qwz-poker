import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

let PORT = 3901;
let BASE_URL = `http://127.0.0.1:${PORT}`;

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

    const profile = (await request("/api/profile", { token: auth.token })).profile;
    assert.equal(profile.profile.handsPlayed, 1);
    assert.equal(profile.profile.ratingHandsPlayed, 0);
    assert.equal(profile.profile.ratingPoints, 1000);
    assert.equal(profile.profile.cashLevel, 1);

    const progression = (await request("/api/progression", { token: auth.token })).progression;
    assert.equal(progression.rating.startingRp, 1000);
    assert.equal(progression.rating.minActiveHandsForLeaderboard, 100);
    assert.equal(progression.cashClub.current.points, 0);
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

test("metrics endpoint exposes prometheus text", async () => {
  const server = await startServer();
  try {
    const metrics = await requestText("/api/metrics");
    assert.match(metrics, /# TYPE qwz_app_up gauge/);
    assert.match(metrics, /qwz_app_up 1/);
    assert.match(metrics, /qwz_uptime_seconds \d+/);
    assert.match(metrics, /qwz_process_resident_memory_bytes \d+/);
  } finally {
    server.kill();
  }
});

test("production real-money mode refuses to start without PostgreSQL and Redis", async () => {
  const result = await startServerAndWaitForExit({
    NODE_ENV: "production",
    BOT_TOKEN: "prod-token",
    REAL_MONEY_ENABLED: "true"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /DATABASE_URL is required in production/);
  assert.match(result.stderr, /REDIS_URL is required in production/);
});

test("player can set fairness seed before the hand starts", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 1);
    const table = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Fairness", maxPlayers: 2, smallBlind: 25, buyInAmount: 5000 }
    })).table;

    const seeded = await request(`/api/tables/${table.id}/fairness-seed`, {
      method: "POST",
      token: auth.token,
      body: { seed: "client generated fairness seed" }
    });

    assert.equal(seeded.fairnessSeed.source, "player");
    assert.equal(seeded.fairnessSeed.seedHash.length, 64);
    assert.equal(
      seeded.table.seats.find((seat) => seat.userId === auth.user.id).fairnessSeedSource,
      "player"
    );
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

test("leaving to lobby returns the table stack to the wallet", async () => {
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

    const left = await request(`/api/tables/${table.id}/leave`, {
      method: "POST",
      token: auth.token
    });

    assert.equal(left.balance, 9975);
    const profile = (await request("/api/profile", { token: auth.token })).profile;
    assert.equal(profile.balance, 9975);
    assert.equal(profile.savedStack, 0);
    assert.equal(profile.tableStack, 0);

    const nextTable = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Rejoin", maxPlayers: 2, smallBlind: 25, buyInAmount: 9975 }
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
    assert.equal(reseated.table.status, "showdown");
    assert.equal(reseated.table.seats.find((seat) => seat.userId === "dev-user").stack, 9975);
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

test("table entry rejects a buy-in below the displayed limit minimum", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 1);

    await assert.rejects(
      request("/api/tables", {
        method: "POST",
        token: auth.token,
        body: { name: "Too short", maxPlayers: 2, smallBlind: 25, buyInAmount: 1000 }
      }),
      /Минимальный бай-ин/
    );
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
    assert.equal(cashier.mode, "play");
    assert.equal(cashier.currency, "PLAY_CHIPS");
    assert.equal(cashier.packages, undefined);
    assert.equal(cashier.deposit.minRub, 100);
    assert.equal(cashier.deposit.chipsPerRub, 50);
    assert.equal(cashier.deposit.methods, undefined);
    assert.equal(cashier.transactions.length, 0);

    await assert.rejects(
      request("/api/cashier/crypto-order", {
        method: "POST",
        token: auth.token,
        body: { method: "ton", rubAmount: 100 }
      }),
      /Режим реальных средств пока отключен/
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

test("daily play claim credits 10000 play chips once per cooldown without touching cash", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    const initialProfile = (await request("/api/profile", { token: auth.token })).profile;
    assert.equal(initialProfile.dailyPlayClaim.canClaim, true);
    assert.equal(initialProfile.dailyPlayClaim.claimedAt, null);
    assert.equal(initialProfile.dailyPlayClaim.cooldownSeconds, 0);
    assert.equal(initialProfile.dailyPlayClaim.amount, 10_000);

    const claimed = await request("/api/play/daily-claim", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "daily-claim-first"
    });
    assert.equal(claimed.profile.balance, 10_000);
    assert.equal(claimed.profile.playBalance, 10_000);
    assert.equal(claimed.profile.cashBalanceMicros, 0);
    assert.equal(claimed.profile.bonusBalanceMicros, 0);
    assert.equal(claimed.dailyPlayClaim.canClaim, false);
    assert.ok(claimed.dailyPlayClaim.claimedAt);
    assert.ok(claimed.dailyPlayClaim.availableAt);
    assert.ok(claimed.dailyPlayClaim.cooldownSeconds > 86_300);
    assert.equal(claimed.dailyPlayClaim.amount, 10_000);
    assert.equal(claimed.progression.dailyPlayClaim.canClaim, false);

    const replay = await request("/api/play/daily-claim", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "daily-claim-first"
    });
    assert.equal(replay.profile.balance, 10_000);

    const cooldown = await requestResponse("/api/play/daily-claim", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "daily-claim-too-soon"
    });
    assert.equal(cooldown.status, 409);
    assert.match(cooldown.data.error, /уже получены/);
    assert.equal(cooldown.data.dailyPlayClaim.canClaim, false);

    const cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.playBalance, 10_000);
    assert.equal(cashier.cashBalanceMicros, 0);
    assert.equal(cashier.bonusBalanceMicros, 0);
    assert.equal(cashier.playTransactions[0].category, "daily_play_claim");
    assert.equal(cashier.playTransactions[0].amount, 10_000);

    const otherAuth = await request("/api/auth", {
      method: "POST",
      body: { initData: telegramInitData({ id: 444, first_name: "Daily", username: "daily" }) }
    });
    const otherClaim = await request("/api/play/daily-claim", {
      method: "POST",
      token: otherAuth.token,
      idempotencyKey: "daily-claim-other-user"
    });
    assert.equal(otherClaim.profile.balance, 10_000);
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

test("idempotency key rejects a different request body", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });

    const cashier = (await request("/api/cashier/demo-topup", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-key-different-body",
      body: { rubAmount: 100 }
    })).cashier;
    assert.equal(cashier.balance, 5000);

    await assert.rejects(
      request("/api/cashier/demo-topup", {
        method: "POST",
        token: auth.token,
        idempotencyKey: "same-key-different-body",
        body: { rubAmount: 200 }
      }),
      /Idempotency key already used with a different request body/
    );

    const replay = (await request("/api/cashier/demo-topup", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-key-different-body",
      body: { rubAmount: 100 }
    })).cashier;
    assert.equal(replay.balance, 5000);
  } finally {
    server.kill();
  }
});

test("crypto deposit order can be created but does not credit chips before confirmation", async () => {
  const server = await startServer({
    ADMIN_USER_IDS: "dev-user",
    REAL_MONEY_ENABLED: "true",
    TON_PAYMENTS_ENABLED: "true",
    TON_RECEIVER_ADDRESS: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
    TON_USDT_RATE: "250"
  });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    const cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.mode, "cash");
    assert.equal(cashier.currency, "USDT");
    assert.equal(cashier.deposit.methods.find((method) => method.id === "ton").enabled, true);
    assert.equal(cashier.deposit.methods.find((method) => method.id === "stars").enabled, true);
    assert.equal(cashier.deposit.methods.filter((method) => method.enabled).length, 2);

    const data = await request("/api/cashier/crypto-order", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "ton-order-once",
      body: { method: "ton", usdtAmount: 250 }
    });

    assert.equal(data.order.method, "ton");
    assert.equal(data.order.asset, "TON");
    assert.equal(data.order.cryptoAmount, 1);
    assert.equal(data.order.cashUsdtMicros, 250_000_000);
    assert.equal(data.order.usdtAmount, 250);
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
    assert.equal(paid.balance, 250_000_000);
    assert.equal(paid.transactions[0].category, "deposit_ton");
  } finally {
    server.kill();
  }
});

test("Stars, Crypto Bot, and xRocket deposit rails create invoices and credit cash on confirmation", async () => {
  const telegramApi = await startMockApiServer(async (req) => {
    if (req.method === "POST" && req.url.startsWith("/bottest-token/getWebhookInfo")) {
      return {
        status: 200,
        body: {
          ok: true,
          result: {
            url: "https://qwz.test/api/telegram/webhook",
            pending_update_count: 0
          }
        }
      };
    }
    if (req.method !== "POST" || !req.url.startsWith("/bottest-token/createInvoiceLink")) {
      return { status: 404, body: { ok: false, description: "not found" } };
    }
    return { status: 200, body: { ok: true, result: "https://t.me/$qwz_test_invoice" } };
  });

  const cryptoBotApi = await startMockApiServer(async (req, body) => {
    if (req.method !== "POST" || req.url !== "/createInvoice") {
      return { status: 404, body: { ok: false, error: "not found" } };
    }
    const payload = JSON.parse(body);
    assert.equal(req.headers["crypto-pay-api-token"], "crypto-test-key");
    assert.equal(payload.asset, "USDT");
    assert.equal(payload.amount, 25);
    return {
      status: 200,
      body: {
        ok: true,
        result: {
          invoice_id: "cb_invoice_1",
          mini_app_invoice_url: "https://pay.crypt.bot/invoice/cb_invoice_1"
        }
      }
    };
  });

  const xRocketApi = await startMockApiServer(async (req, body) => {
    if (req.method !== "POST" || req.url !== "/tg-invoices") {
      return { status: 404, body: { success: false, error: "not found" } };
    }
    const payload = JSON.parse(body);
    assert.equal(req.headers["rocket-pay-key"], "rocket-test-key");
    assert.equal(payload.currency, "USDT");
    assert.equal(payload.amount, 25);
    return {
      status: 200,
      body: {
        success: true,
        data: {
          id: "xr_invoice_1",
          link: "https://pay.xrocket.tg/invoice/xr_invoice_1"
        }
      }
    };
  });

  const server = await startServer({
    ADMIN_USER_IDS: "dev-user",
    REAL_MONEY_ENABLED: "true",
    APP_PUBLIC_URL: "https://qwz.test",
    TELEGRAM_API_BASE: telegramApi.url,
    CRYPTOBOT_API_KEY: "crypto-test-key",
    CRYPTOBOT_API_BASE: cryptoBotApi.url,
    XROCKET_PAY_API_KEY: "rocket-test-key",
    XROCKET_WEBHOOK_SECRET: "rocket-webhook-secret",
    XROCKET_PAY_API_BASE: xRocketApi.url
  });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    const cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.mode, "cash");
    assert.equal(cashier.currency, "USDT");
    assert.equal(cashier.deposit.methods.find((method) => method.id === "stars").enabled, true);
    assert.equal(cashier.deposit.methods.find((method) => method.id === "cryptobot").enabled, true);
    assert.equal(cashier.deposit.methods.find((method) => method.id === "xrocket").enabled, true);
    assert.equal(cashier.deposit.methods.find((method) => method.id === "ton").enabled, false);

    const starsInvoice = await request("/api/cashier/stars-invoice", {
      method: "POST",
      token: auth.token,
      body: { usdtAmount: 25 }
    });
    assert.equal(starsInvoice.order.method, "stars");
    assert.equal(starsInvoice.order.stars, 2500);
    assert.equal(starsInvoice.order.invoiceUrl, "https://t.me/$qwz_test_invoice");

    const pendingStars = await request(`/api/cashier/payment-orders/${starsInvoice.order.id}`, {
      token: auth.token
    });
    assert.equal(pendingStars.order.status, "pending");
    assert.equal(pendingStars.cashier.cashBalanceMicros, 0);

    const otherAuth = await request("/api/auth", {
      method: "POST",
      body: { initData: telegramInitData({ id: 333, first_name: "Other", username: "other" }) }
    });
    await assert.rejects(
      () => request(`/api/cashier/payment-orders/${starsInvoice.order.id}`, { token: otherAuth.token }),
      /Платёж не найден/
    );

    await request("/api/telegram/webhook", {
      method: "POST",
      body: {
        message: {
          successful_payment: {
            invoice_payload: starsInvoice.order.payload,
            currency: "XTR",
            total_amount: starsInvoice.order.stars,
            telegram_payment_charge_id: "stars-charge-1"
          }
        }
      }
    });

    let paidCashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(paidCashier.balance, 25_000_000);
    assert.equal(paidCashier.transactions[0].category, "deposit_stars");
    assert.equal(paidCashier.bonusBalanceMicros, 6_250_000);
    assert.equal(paidCashier.activeBonuses.length, 1);
    assert.equal(paidCashier.activeBonuses[0].type, "welcome");
    assert.equal(paidCashier.activeBonuses[0].wageringRequiredMicros, 37_500_000);

    const paidStars = await request(`/api/cashier/payment-orders/${starsInvoice.order.id}`, {
      token: auth.token
    });
    assert.equal(paidStars.order.status, "paid");
    assert.equal(paidStars.cashier.cashBalanceMicros, 25_000_000);

    await request("/api/telegram/webhook", {
      method: "POST",
      body: {
        message: {
          successful_payment: {
            invoice_payload: starsInvoice.order.payload,
            currency: "XTR",
            total_amount: starsInvoice.order.stars,
            telegram_payment_charge_id: "stars-charge-1"
          }
        }
      }
    });
    paidCashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(paidCashier.cashBalanceMicros, 25_000_000);

    const cryptoOrder = await request("/api/cashier/crypto-order", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "cryptobot-invoice",
      body: { method: "cryptobot", usdtAmount: 25 }
    });

    assert.equal(cryptoOrder.order.method, "cryptobot");
    assert.equal(cryptoOrder.order.invoiceUrl, "https://pay.crypt.bot/invoice/cb_invoice_1");

    const cryptoWebhookBody = JSON.stringify({
      update_type: "invoice_paid",
      payload: {
        payload: cryptoOrder.order.payload,
        invoice_id: "cb_invoice_1",
        status: "paid",
        paid_amount: 25
      }
    });
    const cryptoWebhookSignature = signCryptoBotWebhook(cryptoWebhookBody, "crypto-test-key");

    await requestText("/api/payments/crypto/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "crypto-pay-api-signature": cryptoWebhookSignature
      },
      body: JSON.parse(cryptoWebhookBody)
    });

    paidCashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(paidCashier.balance, 50_000_000);
    assert.equal(paidCashier.transactions[0].category, "deposit_cryptobot");
    assert.equal(paidCashier.bonusBalanceMicros, 6_250_000);
    assert.equal(paidCashier.activeBonuses.length, 1);

    const xRocketOrder = await request("/api/cashier/crypto-order", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "xrocket-invoice",
      body: { method: "xrocket", usdtAmount: 25 }
    });

    assert.equal(xRocketOrder.order.method, "xrocket");
    assert.equal(xRocketOrder.order.invoiceUrl, "https://pay.xrocket.tg/invoice/xr_invoice_1");

    const xRocketWebhookBody = JSON.stringify({
      type: "invoicePay",
      data: {
        id: "xr_invoice_1",
        payload: xRocketOrder.order.payload,
        status: "paid",
        amount: 25,
        payment: {
          paymentAmountReceived: 25,
          txHash: "xr-tx-1"
        }
      }
    });
    const xRocketWebhookSignature = signXRocketWebhook(xRocketWebhookBody, "rocket-webhook-secret");

    await requestText("/api/payments/crypto/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "rocket-pay-signature": xRocketWebhookSignature
      },
      body: JSON.parse(xRocketWebhookBody)
    });

    paidCashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(paidCashier.balance, 75_000_000);
    assert.equal(paidCashier.transactions[0].category, "deposit_xrocket");
    assert.equal(paidCashier.bonusBalanceMicros, 6_250_000);
    assert.equal(paidCashier.activeBonuses.length, 1);

    const profile = (await request("/api/profile", { token: auth.token })).profile;
    assert.equal(profile.cashBalanceMicros, 75_000_000);
    assert.equal(profile.bonusBalanceMicros, 6_250_000);
    assert.equal(profile.activeBonuses.length, 1);
    assert.equal(profile.balance, 0);

    const manualStarsInvoice = await request("/api/cashier/stars-invoice", {
      method: "POST",
      token: auth.token,
      body: { usdtAmount: 1 }
    });
    await assert.rejects(
      () => request(`/api/admin/payments/${manualStarsInvoice.order.id}/approve`, {
        method: "POST",
        token: auth.token,
        idempotencyKey: "manual-stars-without-receipt",
        body: { reason: "manual_test", confirmPaid: false }
      }),
      /требуется проверка Telegram receipt/
    );
    const manualStarsApproval = await request(`/api/admin/payments/${manualStarsInvoice.order.id}/approve`, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "manual-stars-with-receipt",
      body: { reason: "telegram_receipt_verified", confirmPaid: true }
    });
    assert.equal(manualStarsApproval.payment.status, "paid");
    paidCashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(paidCashier.cashBalanceMicros, 76_000_000);

    const opponentAuth = await request("/api/auth", {
      method: "POST",
      body: { initData: telegramInitData({ id: 222, first_name: "Opponent", username: "opponent" }) }
    });
    const opponentInvoice = await request("/api/cashier/stars-invoice", {
      method: "POST",
      token: opponentAuth.token,
      body: { usdtAmount: 10 }
    });
    await request("/api/telegram/webhook", {
      method: "POST",
      body: {
        message: {
          successful_payment: {
            invoice_payload: opponentInvoice.order.payload,
            currency: "XTR",
            total_amount: opponentInvoice.order.stars,
            telegram_payment_charge_id: "stars-charge-opponent"
          }
        }
      }
    });

    let cashTable = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: {
        name: "Bonus wagering",
        gameMode: "cash",
        maxPlayers: 2,
        smallBlind: 50_000,
        bigBlind: 100_000,
        minBuyIn: 2_500_000,
        maxBuyIn: 25_000_000,
        buyInAmount: 10_000_000
      }
    })).table;
    cashTable = (await request(`/api/tables/${cashTable.id}/join`, {
      method: "POST",
      token: opponentAuth.token,
      body: { buyInAmount: 10_000_000 }
    })).table;
    cashTable = (await request(`/api/tables/${cashTable.id}/start-hand`, {
      method: "POST",
      token: auth.token
    })).table;
    cashTable = (await request(`/api/tables/${cashTable.id}/act`, {
      method: "POST",
      token: auth.token,
      body: { action: "call" }
    })).table;
    cashTable = (await request(`/api/tables/${cashTable.id}/act`, {
      method: "POST",
      token: opponentAuth.token,
      body: { action: "check" }
    })).table;
    cashTable = (await request(`/api/tables/${cashTable.id}/act`, {
      method: "POST",
      token: opponentAuth.token,
      body: { action: "bet", amount: 1_000_000 }
    })).table;
    cashTable = (await request(`/api/tables/${cashTable.id}/act`, {
      method: "POST",
      token: auth.token,
      body: { action: "fold" }
    })).table;
    assert.equal(cashTable.status, "showdown");

    paidCashier = (await request("/api/cashier", { token: auth.token })).cashier;
    const opponentCashier = (await request("/api/cashier", { token: opponentAuth.token })).cashier;
    assert.equal(paidCashier.activeBonuses[0].wageringPaidMicros, 5_000);
    assert.equal(opponentCashier.activeBonuses[0].wageringPaidMicros, 5_000);
  } finally {
    server.kill();
    await Promise.all([
      telegramApi.close(),
      cryptoBotApi.close(),
      xRocketApi.close()
    ]);
  }
});

test("Stars invoice is blocked when Telegram webhook cannot return payment confirmation", async () => {
  let invoiceRequests = 0;
  const telegramApi = await startMockApiServer(async (req) => {
    if (req.method === "POST" && req.url.startsWith("/bottest-token/getWebhookInfo")) {
      return {
        status: 200,
        body: { ok: true, result: { url: "https://wrong.test/api/telegram/webhook" } }
      };
    }
    if (req.method === "POST" && req.url.startsWith("/bottest-token/createInvoiceLink")) {
      invoiceRequests += 1;
      return { status: 200, body: { ok: true, result: "https://t.me/$must_not_open" } };
    }
    return { status: 404, body: { ok: false, description: "not found" } };
  });

  const server = await startServer({
    REAL_MONEY_ENABLED: "true",
    APP_PUBLIC_URL: "https://qwz.test",
    TELEGRAM_API_BASE: telegramApi.url
  });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await assert.rejects(
      () => request("/api/cashier/stars-invoice", {
        method: "POST",
        token: auth.token,
        body: { usdtAmount: 1 }
      }),
      /сервер не готов принять подтверждение Telegram/
    );
    assert.equal(invoiceRequests, 0);
  } finally {
    server.kill();
    await telegramApi.close();
  }
});

test("admin can manually approve and reject crypto payment orders", async () => {
  const server = await startServer({
    ADMIN_USER_IDS: "dev-user",
    REAL_MONEY_ENABLED: "true",
    TON_PAYMENTS_ENABLED: "true",
    TON_RECEIVER_ADDRESS: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
    TON_USDT_RATE: "250"
  });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });

    const approveOrder = (await request("/api/cashier/crypto-order", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "admin-approve-ton-order",
      body: { method: "ton", usdtAmount: 250 }
    })).order;

    let data = await request(`/api/admin/payments/${approveOrder.id}/approve`, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "approve-once",
      body: { reason: "manual_test" }
    });

    assert.equal(data.payment.status, "paid");
    let cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 250_000_000);

    data = await request(`/api/admin/payments/${approveOrder.id}/approve`, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "approve-once",
      body: { reason: "manual_test" }
    });
    assert.equal(data.payment.status, "paid");
    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 250_000_000);

    const rejectOrder = (await request("/api/cashier/crypto-order", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "admin-reject-ton-order",
      body: { method: "ton", usdtAmount: 250 }
    })).order;

    data = await request(`/api/admin/payments/${rejectOrder.id}/reject`, {
      method: "POST",
      token: auth.token,
      body: { reason: "manual_reject_test" }
    });

    assert.equal(data.payment.status, "failed");
    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 250_000_000);
  } finally {
    server.kill();
  }
});

test("withdrawals stay disabled until the payout rail is connected", async () => {
  const server = await startServer({
    REAL_MONEY_ENABLED: "true"
  });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    const cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.mode, "cash");
    assert.equal(cashier.withdrawals.enabled, false);

    await assert.rejects(
      request("/api/cashier/withdraw", {
        method: "POST",
        token: auth.token,
        body: { method: "ton", chips: 50000, destination: "UQB-test-wallet" }
      }),
      /Вывод временно закрыт/
    );
  } finally {
    server.kill();
  }
});

test("cash withdrawal hold, reject refund, and approve fee accounting stay balanced", async () => {
  const server = await startServer({
    ADMIN_USER_IDS: "dev-user",
    REAL_MONEY_ENABLED: "true",
    WITHDRAWALS_ENABLED: "true",
    TON_PAYMENTS_ENABLED: "true",
    TON_RECEIVER_ADDRESS: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
    TON_USDT_RATE: "250",
    RISK_LARGE_WITHDRAWAL_USDT: "10"
  });
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    const depositOrder = (await request("/api/cashier/crypto-order", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "withdrawal-lifecycle-deposit",
      body: { method: "ton", usdtAmount: 50 }
    })).order;

    await request(`/api/admin/payments/${depositOrder.id}/approve`, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "withdrawal-lifecycle-deposit-approve",
      body: { reason: "test_deposit" }
    });

    let cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 50_000_000);
    assert.equal(cashier.withdrawals.enabled, true);

    const rejectedWithdrawal = (await request("/api/cashier/withdraw", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "withdrawal-lifecycle-reject",
      body: { currency: "USDT", method: "ton", usdtAmount: 20, destination: "UQB-test-wallet-1" }
    })).withdrawal;

    assert.equal(rejectedWithdrawal.status, "pending");
    assert.equal(rejectedWithdrawal.chips, 0);
    assert.equal(rejectedWithdrawal.grossUsdtMicros, 20_000_000);
    assert.equal(rejectedWithdrawal.feeUsdtMicros, 850_000);

    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 30_000_000);

    await request(`/api/admin/withdrawals/${rejectedWithdrawal.id}/reject`, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "withdrawal-lifecycle-reject-review",
      body: { reason: "test_reject" }
    });

    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 50_000_000);

    const approvedWithdrawal = (await request("/api/cashier/withdraw", {
      method: "POST",
      token: auth.token,
      idempotencyKey: "withdrawal-lifecycle-approve",
      body: { currency: "USDT", method: "ton", usdtAmount: 20, destination: "UQB-test-wallet-2" }
    })).withdrawal;

    await request(`/api/admin/withdrawals/${approvedWithdrawal.id}/approve`, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "withdrawal-lifecycle-approve-review",
      body: { reason: "test_approve" }
    });

    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 30_000_000);

    const dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.equal(dashboard.stats.pendingWithdrawals, 0);
    assert.equal(dashboard.stats.approvedWithdrawalFeeUsdtTotal, 850_000);
    assert.equal(dashboard.stats.platformLedgerNetTotal, 850_000);
    assert.equal(dashboard.audit.reconciliation.cashWalletLedgerDrift, 0);
    assert.ok(dashboard.recentRiskFlags.some((flag) => flag.type === "large_withdrawal"));
    assert.ok(dashboard.recentAdminAudit.some((entry) => entry.action === "withdrawal_approve"));
    assert.ok(dashboard.recentAdminAudit.some((entry) => entry.action === "withdrawal_reject"));

    await assert.rejects(
      request(`/api/admin/withdrawals/${approvedWithdrawal.id}/approve`, {
        method: "POST",
        token: auth.token,
        idempotencyKey: "withdrawal-lifecycle-double-approve",
        body: { reason: "double_approve" }
      }),
      /Заявка уже в статусе approved/
    );
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
    const tournament = data.tournaments.find((item) => item.canRegister && item.balanceBucket === "play");
    assert.ok(tournament);
    assert.equal(tournament.status, "registration_open");
    assert.equal(tournament.registered, false);

    const registerPath = `/api/tournaments/${tournament.id}/register`;
    data = await request(registerPath, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-tournament-register"
    });

    let registered = data.tournaments.find((item) => item.id === tournament.id);
    assert.equal(registered.registered, true);
    assert.equal(registered.participants, tournament.participants + 1);
    assert.equal(data.profile.balance, 10000 - tournament.totalCost);
    assert.equal(data.cashier.transactions[0].title, "Вход в турнир");
    assert.equal(data.cashier.transactions[0].category, "tournament_buyin");

    const replayedRegistration = await request(registerPath, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-tournament-register"
    });
    assert.equal(replayedRegistration.profile.balance, data.profile.balance);
    assert.equal(
      replayedRegistration.cashier.transactions.filter((entry) => entry.category === "tournament_buyin").length,
      1
    );

    const dashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.equal(dashboard.stats.walletTotal, 10000 - tournament.totalCost);
    assert.equal(dashboard.stats.tournamentEscrowTotal, tournament.buyIn);
    assert.equal(dashboard.stats.tournamentPrizePoolTotal, tournament.buyIn);
    assert.equal(dashboard.stats.tournamentFeeReserveTotal, tournament.fee);
    assert.equal(dashboard.stats.playerFundsTotal, 10000 - tournament.fee);
    assert.ok(dashboard.recentFundMovements.some((movement) => (
      movement.category === "wallet_to_tournament_escrow"
      && movement.from === "play_wallet"
      && movement.amount === tournament.buyIn
    )));
    assert.ok(dashboard.recentFundMovements.some((movement) => (
      movement.category === "wallet_to_tournament_fee"
      && movement.amount === tournament.fee
    )));

    const cancelPath = `/api/tournaments/${tournament.id}/cancel`;
    data = await request(cancelPath, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-tournament-cancel"
    });

    registered = data.tournaments.find((item) => item.id === tournament.id);
    assert.equal(registered.registered, false);
    assert.equal(registered.participants, tournament.participants);
    assert.equal(data.profile.balance, 10000);
    assert.equal(data.cashier.transactions[0].title, "Возврат турнирного бай-ина");
    assert.equal(data.cashier.transactions[0].category, "tournament_refund");
    const replayedCancellation = await request(cancelPath, {
      method: "POST",
      token: auth.token,
      idempotencyKey: "same-tournament-cancel"
    });
    assert.equal(replayedCancellation.profile.balance, data.profile.balance);
    assert.equal(
      replayedCancellation.cashier.transactions.filter((entry) => entry.category === "tournament_refund").length,
      1
    );
    const afterCancelDashboard = (await request("/api/admin", { token: auth.token })).admin;
    assert.ok(afterCancelDashboard.recentFundMovements.some((movement) => (
      movement.category === "tournament_escrow_to_wallet"
      && movement.to === "play_wallet"
      && movement.amount === tournament.buyIn
    )));
  } finally {
    server.kill();
  }
});

test("full SNG starts automatically, seats players, and protects tournament stacks", async () => {
  const server = await startServer({ TOURNAMENT_TEST_MODE: "true" });
  try {
    const first = await request("/api/auth", { method: "POST", body: { initData: "" } });
    const second = await request("/api/auth", {
      method: "POST",
      body: { initData: telegramInitData({ id: 991, first_name: "Second", username: "second" }) }
    });
    await topUp(first.token, 2);
    await topUp(second.token, 2);

    const lobby = await request("/api/tournaments", { token: first.token });
    const sng = lobby.tournaments.find((item) => item.type === "sng" && item.canRegister);
    assert.ok(sng);
    await request(`/api/tournaments/${sng.id}/register`, {
      method: "POST",
      token: first.token,
      idempotencyKey: "sng-first"
    });
    await request(`/api/tournaments/${sng.id}/register`, {
      method: "POST",
      token: second.token,
      idempotencyKey: "sng-second"
    });

    await new Promise((resolve) => setTimeout(resolve, 1300));
    const started = (await request(`/api/tournaments/${sng.id}`, { token: first.token })).tournament;
    assert.ok(["running", "final_table"].includes(started.status));
    assert.equal(started.tableIds.length, 1);
    assert.equal(started.playerState.status, "playing");

    const tableId = started.playerState.tableId;
    const table = (await request(`/api/tables/${tableId}`, { token: first.token })).table;
    assert.equal(table.tournamentId, sng.id);
    assert.equal(table.seats.length, 2);
    await assert.rejects(
      request(`/api/tables/${tableId}/leave`, { method: "POST", token: first.token }),
      /Покинуть турнирный стол/
    );
    await assert.rejects(
      request(`/api/tables/${tableId}/rebuy`, { method: "POST", token: first.token }),
      /не входят в MVP/
    );
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

async function requestResponse(path, options = {}) {
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
  return { status: response.status, data: await response.json() };
}

async function requestText(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.text();
  if (!response.ok) throw new Error(data);
  return data;
}

function signCryptoBotWebhook(body, apiKey) {
  const secret = createHash("sha256").update(apiKey).digest();
  return createHmac("sha256", secret).update(body).digest("hex");
}

function signXRocketWebhook(body, secretKey) {
  const secret = createHash("sha256").update(secretKey).digest();
  return createHmac("sha256", secret).update(body).digest("hex");
}

function telegramInitData(user, botToken = "test-token") {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `test-${user.id}`,
    user: JSON.stringify(user)
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return params.toString();
}

async function startMockApiServer(handler) {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        const result = await handler(req, body);
        res.statusCode = result?.status || 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(result?.body || {}));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer((req, res) => {
      res.statusCode = 404;
      res.end();
    });
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    probe.on("error", reject);
  });
}

async function startServerAndWaitForExit(extraEnv = {}) {
  const port = await reservePort();
  PORT = port;
  BASE_URL = `http://127.0.0.1:${PORT}`;
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

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
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

async function startServer(extraEnv = {}) {
  const port = await reservePort();
  PORT = port;
  BASE_URL = `http://127.0.0.1:${PORT}`;
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
    const kill = child.kill.bind(child);
    child.kill = (signal = "SIGKILL") => kill(signal);
    child.unref();
    child.stdout?.unref?.();
    child.stderr?.unref?.();
  });
}
