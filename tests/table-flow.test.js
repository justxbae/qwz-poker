import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 3901;
const BASE_URL = `http://127.0.0.1:${PORT}`;

test("table auto-starts, accepts custom raise, and pays the pot at showdown", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token);
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
  } finally {
    server.kill();
  }
});

test("public lobby tables are seeded and stay available when empty", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token);
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

test("seated player can control test bots at public system tables", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token);
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
    await topUp(auth.token);
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
    await topUp(auth.token);
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
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 2);
    const table = (await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "BuyIn", maxPlayers: 2, smallBlind: 25, buyInAmount: 20000 }
    })).table;

    assert.equal(table.viewer.balance, 0);
    assert.equal(table.seats.find((seat) => seat.userId === "dev-user").stack, 20000);
  } finally {
    server.kill();
  }
});

test("cashier returns demo packages and records wallet operations", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    let cashier = (await request("/api/cashier", { token: auth.token })).cashier;

    assert.equal(cashier.balance, 0);
    assert.equal(cashier.packages.length, 4);
    assert.equal(cashier.transactions.length, 0);

    cashier = (await request("/api/cashier/demo-topup", {
      method: "POST",
      token: auth.token,
      body: { packageId: "starter" }
    })).cashier;

    assert.equal(cashier.balance, 10000);
    assert.equal(cashier.transactions[0].title, "Пополнение баланса");
    assert.equal(cashier.transactions[0].amount, 10000);

    cashier = (await request("/api/cashier/demo-topup", {
      method: "POST",
      token: auth.token,
      body: { packageId: "starter" }
    })).cashier;

    await request("/api/tables", {
      method: "POST",
      token: auth.token,
      body: { name: "Cashier", maxPlayers: 2, smallBlind: 25, buyInAmount: 20000 }
    });

    cashier = (await request("/api/cashier", { token: auth.token })).cashier;
    assert.equal(cashier.balance, 0);
    assert.equal(cashier.transactions[0].title, "Бай-ин за стол");
    assert.equal(cashier.transactions[0].amount, 20000);
  } finally {
    server.kill();
  }
});

test("rebuy adds chips only between hands and spends wallet balance", async () => {
  const server = await startServer();
  try {
    const auth = await request("/api/auth", { method: "POST", body: { initData: "" } });
    await topUp(auth.token, 2);
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
  } finally {
    server.kill();
  }
});

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
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
      body: { packageId: "starter" }
    })).cashier;
  }
  return cashier;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        BOT_TOKEN: "test-token",
        NODE_ENV: "test"
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
