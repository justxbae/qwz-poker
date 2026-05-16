import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { depositSettings, quoteDeposit } from "./economy.js";
import {
  act,
  addBuyIn,
  autoAct,
  createTable,
  createTestUser,
  joinTable,
  leaveTable,
  maybeStartHand,
  publicTable,
  sitIn,
  sitOut,
  startHand,
  testBotAct,
  tickTables
} from "./poker-engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

loadEnv(path.join(rootDir, ".env"));

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const BOT_USERNAME = normalizeBotUsername(process.env.BOT_USERNAME || "qwzpokerbot");
const APP_NAME = process.env.APP_NAME || "QWZ Poker";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
const isProduction = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");

const tables = new Map();
const sessions = new Map();
const savedStacks = new Map();
const wallets = new Map();
const transactions = new Map();
const starOrders = new Map();
const loggedAppOpens = new Set();
const DEFAULT_STACK = 0;
const DEFAULT_WALLET = 0;

seedPublicTables();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, error.status || 500, { error: error.status ? error.message : "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`${APP_NAME} running at http://${displayHost}:${PORT}`);
  notifyAdmin("server_start", "Admin logs online", {
    lines: [
      `Сервер: ${isProduction ? "production" : "development"}`,
      `Bot: @${BOT_USERNAME}`
    ]
  });
});

setInterval(() => tickTables(tables), 1000);

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/telegram/webhook") {
    const update = await readJson(req);
    await handleTelegramWebhook(update);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, {
      appName: APP_NAME,
      botUsername: BOT_USERNAME,
      realMoneyEnabled: false
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth") {
    const body = await readJson(req);
    const auth = authenticateTelegram(body.initData || "");
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }

    const token = randomId("session");
    const user = normalizeUser(auth.user);
    sessions.set(token, user);
    if (!loggedAppOpens.has(user.id)) {
      loggedAppOpens.add(user.id);
      notifyAdmin("open", "Игрок открыл Mini App", {
        user,
        lines: [
          `Баланс: ${formatNumber(user.balance)} chips`
        ]
      });
    }
    sendJson(res, 200, { token, user });
    return;
  }

  const user = requireSession(req);
  if (!user) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tables") {
    sendJson(res, 200, { tables: [...tables.values()].map(publicTable) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/profile") {
    sendJson(res, 200, { profile: profileView(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/cashier") {
    sendJson(res, 200, { cashier: cashierView(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cashier/demo-topup") {
    const body = await readJson(req);
    const quote = quoteDeposit(body);

    user.balance += quote.chips;
    wallets.set(user.id, user.balance);
    recordTransaction(user, {
      type: "credit",
      title: "Пополнение баланса",
      amount: quote.chips,
      meta: `${quote.rubAmount} ₽ · ${quote.stars} Stars`
    });
    notifyAdmin("demo_topup", "Demo-пополнение", {
      user,
      lines: [
        `Сумма: ${formatNumber(quote.rubAmount)} ₽`,
        `Пакет: ${formatNumber(quote.chips)} chips`,
        `Баланс: ${formatNumber(user.balance)} chips`
      ]
    });
    sendJson(res, 200, { cashier: cashierView(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cashier/stars-invoice") {
    const body = await readJson(req);
    const quote = quoteDeposit(body);
    if (!BOT_TOKEN || BOT_TOKEN.includes("replace_with") || BOT_TOKEN === "test-token") {
      sendJson(res, 409, { error: "BOT_TOKEN не настроен для Telegram Stars" });
      return;
    }

    const orderId = randomId("stars");
    const payload = `qwz:${orderId}`;
    const order = {
      id: orderId,
      userId: user.id,
      userName: user.name,
      username: user.username,
      rubAmount: quote.rubAmount,
      chips: quote.chips,
      stars: quote.stars,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    starOrders.set(orderId, order);

    const invoiceLink = await createStarsInvoiceLink({
      title: `${formatNumber(quote.chips)} QWZ chips`,
      description: `Пополнение игрового баланса QWZ Poker на ${formatNumber(quote.chips)} chips`,
      payload,
      stars: quote.stars
    });
    notifyAdmin("stars_invoice", "Создан счет Stars", {
      user,
      lines: [
        `Сумма: ${formatNumber(quote.rubAmount)} ₽`,
        `Пакет: ${formatNumber(quote.chips)} chips`,
        `Стоимость: ${formatNumber(quote.stars)} Stars`,
        `Order: ${order.id}`
      ]
    });

    sendJson(res, 200, { invoiceLink, orderId, cashier: cashierView(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tables") {
    const body = await readJson(req);
    body.visibility = "private";
    prepareInitialStack(user, body);
    const table = createTable(user, body);
    tables.set(table.id, table);
    notifyAdmin("table_create", "Создан приватный стол", {
      user,
      lines: [
        `Стол: ${table.name}`,
        `Блайнды: ${table.smallBlind}/${table.bigBlind}`,
        `Бай-ин: ${formatNumber(table.seats[0]?.stack || 0)} chips`
      ]
    });
    sendJson(res, 201, { table: tableView(table, user) });
    return;
  }

  const tableMatch = url.pathname.match(/^\/api\/tables\/([^/]+)(?:\/([^/]+))?$/);
  if (tableMatch) {
    const [, tableId, action] = tableMatch;
    const table = tables.get(tableId);
    if (!table) {
      sendJson(res, 404, { error: "Table not found" });
      return;
    }

    if (req.method === "GET" && !action) {
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "join") {
      const body = await readJson(req);
      const wasSeated = table.seats.some((seat) => seat.userId === user.id);
      if (!wasSeated) {
        prepareInitialStack(user, body);
      }
      joinTable(table, user);
      maybeStartHand(table);
      if (!wasSeated) {
        notifyAdmin("table_join", "Игрок сел за стол", {
          user,
          lines: [
            `Стол: ${table.name}`,
            `Блайнды: ${table.smallBlind}/${table.bigBlind}`,
            `Стек: ${formatNumber(table.seats.find((seat) => seat.userId === user.id)?.stack || 0)} chips`,
            `Игроков: ${table.seats.length}/${table.maxPlayers}`
          ]
        });
      }
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "leave") {
      const result = leaveTable(table, user);
      saveStack(user, result.stack);
      if (result.tableEmpty && table.isPrivate) tables.delete(table.id);
      notifyAdmin("table_leave", "Игрок вышел из стола", {
        user,
        lines: [
          `Стол: ${table.name}`,
          `Сохраненный стек: ${formatNumber(result.stack)} chips`,
          `Баланс: ${formatNumber(user.balance)} chips`
        ]
      });
      sendJson(res, 200, { ok: true, balance: user.balance });
      return;
    }

    if (req.method === "POST" && action === "stand") {
      const result = leaveTable(table, user);
      saveStack(user, result.stack);
      if (result.tableEmpty && table.isPrivate) tables.delete(table.id);
      notifyAdmin("table_stand", "Игрок встал из-за стола", {
        user,
        lines: [
          `Стол: ${table.name}`,
          `Сохраненный стек: ${formatNumber(result.stack)} chips`,
          `Баланс: ${formatNumber(user.balance)} chips`
        ]
      });
      sendJson(res, 200, { table: result.tableEmpty && table.isPrivate ? null : tableView(table, user), balance: user.balance });
      return;
    }

    if (req.method === "POST" && action === "sit-out") {
      sitOut(table, user);
      sendJson(res, 200, { table: tableView(table, user), balance: user.balance });
      return;
    }

    if (req.method === "POST" && action === "sit-in") {
      sitIn(table, user);
      sendJson(res, 200, { table: tableView(table, user), balance: user.balance });
      return;
    }

    if (req.method === "POST" && action === "rebuy") {
      const body = await readJson(req);
      if (user.balance <= 0) {
        sendJson(res, 409, { error: "На общем балансе нет средств для докупки" });
        return;
      }

      const amount = clamp(Number(body.amount || DEFAULT_STACK), 1, user.balance);
      const beforeStack = table.seats.find((seat) => seat.userId === user.id)?.stack || 0;
      const afterStack = addBuyIn(table, user, amount);
      const actualAmount = afterStack - beforeStack;
      user.balance -= actualAmount;
      wallets.set(user.id, user.balance);
      if (actualAmount > 0) {
        recordTransaction(user, {
          type: "debit",
          title: "Докупка за столом",
          amount: actualAmount,
          meta: `${table.smallBlind}/${table.bigBlind} · ${table.name}`
        });
        notifyAdmin("rebuy", "Докупка за столом", {
          user,
          lines: [
            `Стол: ${table.name}`,
            `Сумма: ${formatNumber(actualAmount)} chips`,
            `Стек: ${formatNumber(afterStack)} chips`,
            `Баланс: ${formatNumber(user.balance)} chips`
          ]
        });
      }
      maybeStartHand(table);
      sendJson(res, 200, { table: tableView(table, user), balance: user.balance });
      return;
    }

    if (req.method === "POST" && action === "start-hand") {
      startHand(table, user);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "act") {
      const body = await readJson(req);
      act(table, user, body);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "add-test-player") {
      const testUser = createTestUser(table.seats.length + 1);
      joinTable(table, testUser);
      maybeStartHand(table);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "auto-act") {
      autoAct(table, user);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "test-bot-act") {
      const body = await readJson(req);
      testBotAct(table, user, body);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }
  }

  sendJson(res, 404, { error: "Not found" });
}

function authenticateTelegram(initData) {
  if (!initData) {
    if (isProduction) return { ok: false, error: "Telegram initData is required" };
    return {
      ok: true,
      user: {
        id: "dev-user",
        first_name: "Игрок",
        username: "qwz_player"
      }
    };
  }

  if (!BOT_TOKEN || BOT_TOKEN.includes("replace_with")) {
    return { ok: false, error: "BOT_TOKEN is not configured" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (calculatedHash !== hash) {
    return { ok: false, error: "Invalid Telegram signature" };
  }

  const authDate = Number(params.get("auth_date") || 0);
  const maxAgeSeconds = 60 * 60 * 24;
  if (Date.now() / 1000 - authDate > maxAgeSeconds) {
    return { ok: false, error: "Telegram auth expired" };
  }

  const user = JSON.parse(params.get("user") || "{}");
  return { ok: true, user };
}

function normalizeUser(user) {
  const id = String(user.id);
  return {
    id,
    name: user.first_name || user.username || "Player",
    username: user.username || "",
    photoUrl: user.photo_url || "",
    balance: getWallet(id)
  };
}

function profileView(user) {
  const activeTables = [...tables.values()]
    .map((table) => {
      const seat = table.seats.find((candidate) => candidate.userId === user.id);
      if (!seat) return null;
      return {
        id: table.id,
        name: table.name,
        smallBlind: table.smallBlind,
        bigBlind: table.bigBlind,
        handNumber: table.handNumber,
        status: table.status,
        stack: seat.stack,
        sittingOut: seat.sittingOut,
        sitOutNextHand: seat.sitOutNextHand
      };
    })
    .filter(Boolean);
  const tableStack = activeTables.reduce((sum, table) => sum + table.stack, 0);
  const handsPlayed = activeTables.reduce((sum, table) => sum + table.handNumber, 0);

  return {
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      photoUrl: user.photoUrl || ""
    },
    balance: user.balance,
    savedStack: getSavedStack(user),
    tableStack,
    activeTables,
    activeTableCount: activeTables.length,
    handsPlayed
  };
}

function cashierView(user) {
  const activeTables = userActiveTables(user);
  const tableStack = activeTables.reduce((sum, table) => sum + table.stack, 0);
  return {
    balance: user.balance,
    tableStack,
    totalBankroll: user.balance + tableStack,
    activeTableCount: activeTables.length,
    currency: "chips",
    mode: "chips",
    deposit: depositSettings(),
    transactions: getTransactions(user)
  };
}

function userActiveTables(user) {
  return [...tables.values()]
    .map((table) => {
      const seat = table.seats.find((candidate) => candidate.userId === user.id);
      if (!seat) return null;
      return {
        id: table.id,
        name: table.name,
        stack: seat.stack
      };
    })
    .filter(Boolean);
}

function seedPublicTables() {
  const limits = [
    { smallBlind: 25, count: 4 },
    { smallBlind: 50, count: 4 },
    { smallBlind: 100, count: 3 }
  ];

  for (const limit of limits) {
    for (let index = 1; index <= limit.count; index += 1) {
      const table = createTable(null, {
        name: `QWZ NL ${limit.smallBlind}/${limit.smallBlind * 2} #${index}`,
        maxPlayers: 6,
        smallBlind: limit.smallBlind,
        isSystem: true,
        isPrivate: false
      });
      tables.set(table.id, table);
    }
  }
}

function getSavedStack(user) {
  return savedStacks.get(user.id) || DEFAULT_STACK;
}

function prepareInitialStack(user, body = {}) {
  const requested = Number(body.buyInAmount || 0);
  if (!requested) {
    user.stack = getSavedStack(user);
    if (user.stack <= 0) {
      const error = new Error("Сначала пополните баланс и выберите бай-ин");
      error.status = 409;
      throw error;
    }
    return;
  }

  if (user.balance <= 0) {
    const error = new Error("На общем балансе нет средств для бай-ина");
    error.status = 409;
    throw error;
  }
  const amount = clamp(requested, 1, user.balance);
  user.stack = amount;
  user.balance -= amount;
  wallets.set(user.id, user.balance);
  recordTransaction(user, {
    type: "debit",
    title: "Бай-ин за стол",
    amount,
    meta: "Texas NL"
  });
}

function saveStack(user, stack) {
  savedStacks.set(user.id, stack);
}

function getWallet(userId) {
  if (!wallets.has(userId)) wallets.set(userId, DEFAULT_WALLET);
  return wallets.get(userId);
}

function getTransactions(user) {
  if (!transactions.has(user.id)) {
    transactions.set(user.id, DEFAULT_WALLET > 0 ? [
      {
        id: randomId("tx"),
        type: "credit",
        title: "Стартовый баланс",
        amount: DEFAULT_WALLET,
        meta: "QWZ chips",
        createdAt: new Date().toISOString()
      }
    ] : []);
  }
  return transactions.get(user.id);
}

function recordTransaction(user, transaction) {
  const history = getTransactions(user);
  history.unshift({
    id: randomId("tx"),
    type: transaction.type,
    title: transaction.title,
    amount: transaction.amount,
    meta: transaction.meta || "",
    createdAt: new Date().toISOString()
  });
  transactions.set(user.id, history.slice(0, 30));
}

async function createStarsInvoiceLink({ title, description, payload, stars }) {
  const data = await callTelegram("createInvoiceLink", {
    title,
    description,
    payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: title, amount: stars }]
  });
  return data.result;
}

async function handleTelegramWebhook(update) {
  if (update.pre_checkout_query) {
    await answerPreCheckout(update.pre_checkout_query);
    return;
  }

  const payment = update.message?.successful_payment;
  if (!payment) return;
  processSuccessfulStarPayment(payment);
}

async function answerPreCheckout(query) {
  const payload = query.invoice_payload || "";
  const order = orderFromPayload(payload);
  const ok = Boolean(
    order
      && order.status === "pending"
      && query.currency === "XTR"
      && Number(query.total_amount) === Number(order.stars)
  );

  await callTelegram("answerPreCheckoutQuery", {
    pre_checkout_query_id: query.id,
    ok,
    ...(ok ? {} : { error_message: "Заказ пополнения не найден или уже обработан" })
  });
}

function processSuccessfulStarPayment(payment) {
  const order = orderFromPayload(payment.invoice_payload || "");
  if (!order || order.status === "paid") return;
  if (payment.currency !== "XTR" || Number(payment.total_amount) !== Number(order.stars)) return;

  const balance = getWallet(order.userId) + order.chips;
  wallets.set(order.userId, balance);
  order.status = "paid";
  order.paidAt = new Date().toISOString();
  order.telegramPaymentChargeId = payment.telegram_payment_charge_id || "";
  starOrders.set(order.id, order);

  recordTransaction({ id: order.userId }, {
    type: "credit",
    title: "Пополнение Stars",
    amount: order.chips,
    meta: `${order.stars} Stars · QWZ chips`
  });
  notifyAdmin("stars_paid", "Оплачено Stars-пополнение", {
    user: { id: order.userId, name: order.userName, username: order.username },
    lines: [
      `Сумма: ${formatNumber(order.rubAmount || 0)} ₽`,
      `Пакет: ${formatNumber(order.chips)} chips`,
      `Оплата: ${formatNumber(order.stars)} Stars`,
      `Order: ${order.id}`,
      `Telegram charge: ${order.telegramPaymentChargeId || "n/a"}`,
      `Баланс: ${formatNumber(balance)} chips`
    ]
  });
}

function orderFromPayload(payload) {
  const orderId = String(payload).startsWith("qwz:") ? payload.slice(4) : "";
  return orderId ? starOrders.get(orderId) : null;
}

async function callTelegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) {
    const error = new Error(data.description || `Telegram ${method} failed`);
    error.status = 502;
    throw error;
  }
  return data;
}

function notifyAdmin(type, title, { user, lines = [] } = {}) {
  if (!ADMIN_CHAT_ID || !BOT_TOKEN || BOT_TOKEN.includes("replace_with") || BOT_TOKEN === "test-token") return;

  const text = [
    `QWZ Poker · ${title}`,
    `Событие: ${type}`,
    user ? `Игрок: ${formatUser(user)}` : "",
    ...lines,
    `Время: ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" })}`
  ].filter(Boolean).join("\n");

  callTelegram("sendMessage", {
    chat_id: ADMIN_CHAT_ID,
    text,
    disable_web_page_preview: true
  }).catch((error) => {
    console.error("Admin log failed:", error.message);
  });
}

function formatUser(user) {
  const username = user.username ? `@${user.username}` : "без username";
  const name = user.name || "unknown";
  return `${name} · ${username} · ID ${user.id}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function tableView(table, user) {
  const view = publicTable(table, user.id);
  view.viewer.balance = user.balance;
  view.viewer.canBuyIn = view.viewer.canBuyIn && user.balance > 0;
  return view;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function requireSession(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return sessions.get(token) || null;
}

async function serveStatic(req, res, url) {
  let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  if (!existsSync(filePath)) filePath = path.join(publicDir, "index.html");
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg"
  };

  res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  res.end(await readFile(filePath));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function randomId(prefix) {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

function normalizeBotUsername(username) {
  return username.replace(/^@/, "");
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  const envText = readFileSync(filePath, "utf8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
