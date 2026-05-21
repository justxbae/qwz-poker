import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import { depositSettings, quoteCryptoDeposit, quoteDeposit } from "./economy.js";
import {
  addWalletEntry as dbAddWalletEntry,
  completePaymentOrder as dbCompletePaymentOrder,
  createPaymentOrder as dbCreatePaymentOrder,
  dashboardStats as dbDashboardStats,
  databaseHealth as dbDatabaseHealth,
  databaseEnabled,
  deleteActiveTableSnapshot as dbDeleteActiveTableSnapshot,
  getPaymentOrder as dbGetPaymentOrder,
  getIdempotencyResult as dbGetIdempotencyResult,
  getSavedStack as dbGetSavedStack,
  getWallet as dbGetWallet,
  initDatabase,
  listActiveTableSnapshots as dbListActiveTableSnapshots,
  listAdminEvents as dbListAdminEvents,
  listLedger as dbListLedger,
  listTournamentRegistrations as dbListTournamentRegistrations,
  listHandHistories as dbListHandHistories,
  listPaymentOrders as dbListPaymentOrders,
  listPendingCryptoPaymentOrders as dbListPendingCryptoPaymentOrders,
  markPaymentOrderPaid as dbMarkPaymentOrderPaid,
  recordAdminEvent as dbRecordAdminEvent,
  recordFundMovement as dbRecordFundMovement,
  recordHandHistory as dbRecordHandHistory,
  recordPlatformLedgerEntry as dbRecordPlatformLedgerEntry,
  registerTournament as dbRegisterTournament,
  saveIdempotencyResult as dbSaveIdempotencyResult,
  cancelTournamentRegistration as dbCancelTournamentRegistration,
  setSavedStack as dbSetSavedStack,
  setWallet as dbSetWallet,
  updatePaymentOrderStatus as dbUpdatePaymentOrderStatus,
  upsertActiveTableSnapshot as dbUpsertActiveTableSnapshot,
  upsertTelegramUser
} from "./db.js";
import {
  ACTION_TIMEOUT_MS,
  NEXT_HAND_DELAY_MS,
  RUNOUT_CARD_DELAY_MS,
  START_INTRO_MS,
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
const ADMIN_USER_IDS = parseIdList(process.env.ADMIN_USER_IDS || ADMIN_CHAT_ID);
const ADMIN_GRANT_MAX_CHIPS = Number(process.env.ADMIN_GRANT_MAX_CHIPS || 500000);
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const CRYPTO_WEBHOOK_SECRET = process.env.CRYPTO_WEBHOOK_SECRET || "";
const TON_RECEIVER_ADDRESS = process.env.TON_RECEIVER_ADDRESS || "";
const TON_POLLING_ENABLED = process.env.TON_POLLING_ENABLED === "true";
const TONCENTER_API_BASE = (process.env.TONCENTER_API_BASE || "https://toncenter.com/api/v3").replace(/\/$/, "");
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || "";
const TON_POLLING_INTERVAL_MS = Number(process.env.TON_POLLING_INTERVAL_MS || 60 * 1000);
const isProduction = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
const startedAt = Date.now();

validateEnvironment();
initSentry();
registerProcessHandlers();

const tables = new Map();
const sessions = new Map();
const userProfiles = new Map();
const savedStacks = new Map();
const wallets = new Map();
const transactions = new Map();
const fundMovements = new Map();
const starOrders = new Map();
const cryptoOrders = new Map();
const adminEvents = [];
const loggedAppOpens = new Set();
const persistedHandIds = new Set();
const recentHandHistories = [];
const idempotencyResults = new Map();
const apiIdempotencyResults = new Map();
const pendingIdempotencyResults = new Map();
const DEFAULT_STACK = 0;
const DEFAULT_WALLET = 0;
const RECONCILIATION_INTERVAL_MS = Number(process.env.RECONCILIATION_INTERVAL_MS || 15 * 60 * 1000);
const RECONCILIATION_DRIFT_ALERT_CHIPS = Number(process.env.RECONCILIATION_DRIFT_ALERT_CHIPS || 1);
let lastReconciliationAlertKey = "";

seedPublicTables();
const tournaments = seedTournaments();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    reportError(error, { url: req.url, method: req.method });
    sendJson(res, error.status || 500, { error: error.status ? error.message : "Internal server error" });
  }
});

await initDatabase();
await hydrateActiveTables();
await hydrateTournamentRegistrations();

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`${APP_NAME} running at http://${displayHost}:${PORT}`);
  notifyAdmin("server_start", "Admin logs online", {
    lines: [
      `Сервер: ${isProduction ? "production" : "development"}`,
      `Bot: @${BOT_USERNAME}`,
      `Database: ${databaseEnabled() ? "PostgreSQL" : "memory"}`
    ]
  });
});

setInterval(async () => {
  try {
    tickTables(tables);
    await persistAllCompletedHands();
  } catch (error) {
    console.error("Table tick failed:", error);
  }
}, 1000);

setInterval(async () => {
  try {
    await persistActiveTableSnapshots();
  } catch (error) {
    console.error("Active table snapshot flush failed:", error);
  }
}, 5000);

setInterval(async () => {
  try {
    await runReconciliationCheck("interval");
  } catch (error) {
    console.error("Reconciliation check failed:", error.message);
  }
}, RECONCILIATION_INTERVAL_MS);

setInterval(async () => {
  try {
    await pollTonDeposits();
  } catch (error) {
    console.error("TON polling failed:", error.message);
  }
}, TON_POLLING_INTERVAL_MS);

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    const health = await healthSnapshot({ publicView: true });
    sendJson(res, health.ok ? 200 : 503, { health });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/telegram/webhook") {
    if (!verifyTelegramWebhook(req)) {
      sendJson(res, 403, { error: "Invalid webhook secret" });
      return;
    }
    const update = await readJson(req);
    await handleTelegramWebhook(update);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/payments/crypto/webhook") {
    if (!verifyCryptoWebhook(req)) {
      sendJson(res, 403, { error: "Invalid crypto webhook secret" });
      return;
    }
    const event = await readJson(req);
    await handleCryptoWebhook(event);
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
    const user = await normalizeUser(auth.user);
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
    sendJson(res, 200, { profile: await profileView(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/cashier") {
    sendJson(res, 200, { cashier: await cashierView(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tournaments") {
    sendJson(res, 200, { tournaments: tournamentListView(user) });
    return;
  }

  const tournamentMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/(register|cancel)$/);
  if (req.method === "POST" && tournamentMatch) {
    const [, tournamentId, action] = tournamentMatch;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) {
      sendJson(res, 404, { error: "Tournament not found" });
      return;
    }

    await sendIdempotentJson(req, res, user, `tournament_${action}:${tournamentId}`, async () => {
      if (action === "register") {
        await registerTournament(tournament, user);
      } else {
        await cancelTournamentRegistration(tournament, user);
      }

      return {
        tournaments: tournamentListView(user),
        profile: await profileView(user),
        cashier: await cashierView(user)
      };
    });
    return;
  }

  if (url.pathname.startsWith("/api/admin")) {
    if (!isAdminUser(user.id)) {
      sendJson(res, 403, { error: "Admin access denied" });
      return;
    }
    await handleAdminApi(req, res, url, user);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cashier/demo-topup") {
    await sendIdempotentJson(req, res, user, "cashier_demo_topup", async (idempotencyKey) => {
      const body = await readJson(req);
      const quote = quoteDeposit(body);

      user.balance = await recordTransaction(user, {
        type: "credit",
        category: "deposit_demo",
        title: "Пополнение баланса",
        amount: quote.chips,
        meta: `${quote.rubAmount} ₽ · ${quote.stars} Stars`,
        idempotencyKey
      });
      notifyAdmin("demo_topup", "Demo-пополнение", {
        user,
        lines: [
          `Сумма: ${formatNumber(quote.rubAmount)} ₽`,
          `Пакет: ${formatNumber(quote.chips)} chips`,
          `Баланс: ${formatNumber(user.balance)} chips`
        ]
      });
      return { cashier: await cashierView(user) };
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cashier/stars-invoice") {
    await sendIdempotentJson(req, res, user, "cashier_stars_invoice", async () => {
      const body = await readJson(req);
      const quote = quoteDeposit(body);
      if (!BOT_TOKEN || BOT_TOKEN.includes("replace_with") || BOT_TOKEN === "test-token") {
        const error = new Error("BOT_TOKEN не настроен для Telegram Stars");
        error.status = 409;
        throw error;
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
      await dbCreatePaymentOrder(order);

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

      return { invoiceLink, orderId, cashier: await cashierView(user) };
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cashier/crypto-order") {
    await sendIdempotentJson(req, res, user, "cashier_crypto_order", async () => {
      const body = await readJson(req);
      const quote = quoteCryptoDeposit(body);
      ensureCryptoPaymentMethodEnabled(quote.method);

      const orderId = randomId(quote.method === "ton" ? "ton" : "usdt");
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const payload = `qwz:${orderId}`;
      const order = {
        id: orderId,
        userId: user.id,
        userName: user.name,
        username: user.username,
        method: quote.method,
        asset: quote.asset,
        network: quote.network,
        rubAmount: quote.rubAmount,
        chips: quote.chips,
        cryptoAmount: quote.cryptoAmount,
        receiverAddress: quote.receiverAddress,
        confirmationsRequired: quote.confirmationsRequired,
        payload,
        status: "pending",
        expiresAt,
        createdAt: new Date().toISOString()
      };
      cryptoOrders.set(orderId, order);
      await dbCreatePaymentOrder(order);
      notifyAdmin("crypto_order", "Создан crypto-счет", {
        user,
        lines: [
          `Метод: ${quote.asset} ${quote.network}`,
          `Сумма: ${formatNumber(quote.rubAmount)} ₽`,
          `К оплате: ${quote.cryptoAmount} ${quote.asset}`,
          `Chips: ${formatNumber(quote.chips)}`,
          `Order: ${order.id}`
        ]
      });
      return { order: cryptoOrderView(order), cashier: await cashierView(user) };
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tables") {
    await sendIdempotentJson(req, res, user, "table_create", async (idempotencyKey) => {
      const body = await readJson(req);
      body.visibility = "private";
      await prepareInitialStack(user, body, idempotencyKey);
      const table = createTable(user, body);
      tables.set(table.id, table);
      await persistActiveTableSnapshot(table);
      notifyAdmin("table_create", "Создан приватный стол", {
        user,
        lines: [
          `Стол: ${table.name}`,
          `Блайнды: ${table.smallBlind}/${table.bigBlind}`,
          `Бай-ин: ${formatNumber(table.seats[0]?.stack || 0)} chips`
        ]
      });
      return { status: 201, body: { table: tableView(table, user) } };
    });
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
      await sendIdempotentJson(req, res, user, `table_join:${table.id}`, async (idempotencyKey) => {
        const body = await readJson(req);
        const wasSeated = table.seats.some((seat) => seat.userId === user.id);
        if (!wasSeated) {
          await prepareInitialStack(user, body, idempotencyKey);
        }
        joinTable(table, user);
        maybeStartHand(table);
        await persistActiveTableSnapshot(table);
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
        return { table: tableView(table, user) };
      });
      return;
    }

    if (req.method === "POST" && action === "leave") {
      const result = leaveTable(table, user);
      await persistCompletedHands(table);
      await saveStack(user, result.stack);
      if (result.tableEmpty && table.isPrivate) {
        tables.delete(table.id);
        await deleteActiveTableSnapshot(table.id);
      } else {
        await persistActiveTableSnapshot(table);
      }
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
      await persistCompletedHands(table);
      await saveStack(user, result.stack);
      if (result.tableEmpty && table.isPrivate) {
        tables.delete(table.id);
        await deleteActiveTableSnapshot(table.id);
      } else {
        await persistActiveTableSnapshot(table);
      }
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
      await persistActiveTableSnapshot(table);
      sendJson(res, 200, { table: tableView(table, user), balance: user.balance });
      return;
    }

    if (req.method === "POST" && action === "sit-in") {
      sitIn(table, user);
      await persistActiveTableSnapshot(table);
      sendJson(res, 200, { table: tableView(table, user), balance: user.balance });
      return;
    }

    if (req.method === "POST" && action === "rebuy") {
      await sendIdempotentJson(req, res, user, `table_rebuy:${table.id}`, async (idempotencyKey) => {
        const body = await readJson(req);
        if (user.balance <= 0) {
          const error = new Error("На общем балансе нет средств для докупки");
          error.status = 409;
          throw error;
        }

        const amount = clamp(Number(body.amount || DEFAULT_STACK), 1, user.balance);
        const beforeStack = table.seats.find((seat) => seat.userId === user.id)?.stack || 0;
        const afterStack = addBuyIn(table, user, amount);
        const actualAmount = afterStack - beforeStack;
        if (actualAmount > 0) {
          user.balance = await recordTransaction(user, {
            type: "debit",
            category: "table_rebuy",
            title: "Докупка за столом",
            amount: actualAmount,
            meta: `${table.smallBlind}/${table.bigBlind} · ${table.name}`,
            idempotencyKey
          });
          await recordFundMovement(user, {
            category: "wallet_to_table_rebuy",
            from: "wallet",
            to: "table",
            amount: actualAmount,
            contextId: table.id,
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
        await persistActiveTableSnapshot(table);
        return { table: tableView(table, user), balance: user.balance };
      });
      return;
    }

    if (req.method === "POST" && action === "start-hand") {
      startHand(table, user);
      await persistActiveTableSnapshot(table);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "act") {
      const body = await readJson(req);
      act(table, user, body);
      await persistCompletedHands(table);
      await persistActiveTableSnapshot(table);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "add-test-player") {
      const testUser = createTestUser(table.seats.length + 1);
      joinTable(table, testUser);
      maybeStartHand(table);
      await persistActiveTableSnapshot(table);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "auto-act") {
      autoAct(table, user);
      await persistCompletedHands(table);
      await persistActiveTableSnapshot(table);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "test-bot-act") {
      const body = await readJson(req);
      testBotAct(table, user, body);
      await persistCompletedHands(table);
      await persistActiveTableSnapshot(table);
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }
  }

  sendJson(res, 404, { error: "Not found" });
}

async function handleAdminApi(req, res, url, adminUser) {
  const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  const paymentActionMatch = url.pathname.match(/^\/api\/admin\/payments\/([^/]+)\/(approve|reject)$/);

  if (req.method === "GET" && url.pathname === "/api/admin") {
    sendJson(res, 200, { admin: await adminDashboardView() });
    return;
  }

  if (req.method === "GET" && userMatch) {
    sendJson(res, 200, { player: await adminPlayerView(userMatch[1]) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/wallet-adjust") {
    const body = await readJson(req);
    const result = await adjustWalletManually({
      admin: adminUser,
      targetId: body.telegramId,
      type: body.type,
      amount: body.amount,
      reason: body.reason,
      requestId: body.requestId || req.headers["x-idempotency-key"] || ""
    });
    sendJson(res, 200, { player: await adminPlayerView(result.targetId), adjustment: result });
    return;
  }

  if (req.method === "POST" && paymentActionMatch) {
    const [, paymentId, action] = paymentActionMatch;
    await sendIdempotentJson(req, res, adminUser, `admin_payment_${action}:${paymentId}`, async () => {
      const body = await readJson(req);
      const result = await handleAdminPaymentAction({
        admin: adminUser,
        paymentId,
        action,
        reason: body.reason || ""
      });
      return { payment: result, admin: await adminDashboardView() };
    });
    return;
  }

  sendJson(res, 404, { error: "Admin endpoint not found" });
}

async function adminDashboardView() {
  const diagnostics = await healthSnapshot();
  const players = [...new Set([...wallets.keys(), ...userProfiles.keys(), ...transactions.keys()])];
  const dbStats = await dbDashboardStats();
  const walletTotal = dbStats ? dbStats.walletTotal : [...wallets.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  const tableStackTotal = [...tables.values()].reduce((sum, table) => (
    sum + table.seats.reduce((seatSum, seat) => seatSum + Number(seat.stack || 0), 0)
  ), 0);
  const savedStackTotal = dbStats ? dbStats.savedStackTotal : [...savedStacks.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  const tournamentEscrowTotal = tournamentEscrow();
  const tournamentPrizePoolTotal = tournamentPrizePool();
  const tournamentFeeReserveTotal = tournamentFeeReserve();
  const rakeCollectedTotal = [...tables.values()].reduce((sum, table) => sum + Number(table.rakeCollected || 0), 0);
  const ledgerCreditTotal = dbStats ? dbStats.ledgerCreditTotal : memoryLedgerTotal("credit");
  const ledgerDebitTotal = dbStats ? dbStats.ledgerDebitTotal : memoryLedgerTotal("debit");
  const paidStarsChipsTotal = dbStats ? dbStats.paidStarsChipsTotal : [...starOrders.values()]
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + Number(order.chips || 0), 0);
  const depositStarsLedgerTotal = dbStats ? dbStats.depositStarsLedgerTotal : memoryLedgerCategoryTotal("credit", "deposit_stars");
  const playerFundsTotal = walletTotal + tableStackTotal + savedStackTotal + tournamentEscrowTotal;
  const reconciliation = buildReconciliationAudit({
    walletTotal,
    ledgerCreditTotal,
    ledgerDebitTotal,
    paidStarsChipsTotal,
    depositStarsLedgerTotal
  });
  const paidStars = [...starOrders.values()].filter((order) => order.status === "paid");
  const pendingStars = [...starOrders.values()].filter((order) => order.status === "pending");
  const recentPayments = await dbListPaymentOrders(30);
  const recentEvents = await dbListAdminEvents(20);
  const recentHands = await dbListHandHistories(20);
  const memoryHandHistoryCount = recentHandHistories.length;
  const memoryHandHistoryRakeTotal = recentHandHistories.reduce((sum, hand) => sum + Number(hand.rake || 0), 0);

  return {
    stats: {
      players: dbStats ? dbStats.players : players.length,
      activeTables: [...tables.values()].filter((table) => table.seats.length > 0).length,
      openTables: tables.size,
      walletTotal,
      tableStackTotal,
      savedStackTotal,
      tournamentEscrowTotal,
      tournamentPrizePoolTotal,
      tournamentFeeReserveTotal,
      rakeCollectedTotal,
      playerFundsTotal,
      ledgerCreditTotal,
      ledgerDebitTotal,
      ledgerNetTotal: ledgerCreditTotal - ledgerDebitTotal,
      platformLedgerCreditTotal: dbStats ? dbStats.platformLedgerCreditTotal : 0,
      platformLedgerDebitTotal: dbStats ? dbStats.platformLedgerDebitTotal : 0,
      platformLedgerNetTotal: dbStats ? dbStats.platformLedgerCreditTotal - dbStats.platformLedgerDebitTotal : 0,
      paidStarsChipsTotal,
      depositStarsLedgerTotal,
      idempotencyKeyCount: dbStats ? dbStats.idempotencyKeyCount : apiIdempotencyResults.size,
      handHistoryCount: dbStats ? dbStats.handHistoryCount : memoryHandHistoryCount,
      handHistoryRakeTotal: dbStats ? dbStats.handHistoryRakeTotal : memoryHandHistoryRakeTotal,
      activeTableSnapshotCount: dbStats ? dbStats.activeTableSnapshotCount : 0,
      bankrollTotal: playerFundsTotal,
      paidStars: dbStats ? dbStats.paidStars : paidStars.length,
      pendingStars: dbStats ? dbStats.pendingStars : pendingStars.length
    },
    diagnostics,
    audit: {
      playerFundsTotal,
      walletTotal,
      tableStackTotal,
      savedStackTotal,
      tournamentEscrowTotal,
      tournamentPrizePoolTotal,
      tournamentFeeReserveTotal,
      rakeCollectedTotal,
      ledgerCreditTotal,
      ledgerDebitTotal,
      ledgerNetTotal: ledgerCreditTotal - ledgerDebitTotal,
      reconciliation,
      notes: [
        "playerFundsTotal = wallets + active table stacks + saved stacks + tournament escrow",
        "walletLedgerDrift must stay at 0: walletTotal should match ledger credits minus debits",
        "starsDepositDrift must stay at 0: paid Stars orders should match deposit_stars ledger credits"
      ]
    },
    recentFundMovements: recentFundMovements(20),
    recentHands: recentHands || recentHandHistories.slice(0, 20),
    recentPayments: recentPayments || [...starOrders.values(), ...cryptoOrders.values()]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 30),
    recentEvents: recentEvents || adminEvents.slice(0, 20)
  };
}

function tournamentEscrow() {
  return [...tournaments.values()].reduce((sum, tournament) => (
    sum + tournament.registrations.size * (Number(tournament.buyIn || 0) + Number(tournament.fee || 0))
  ), 0);
}

function tournamentPrizePool() {
  return [...tournaments.values()].reduce((sum, tournament) => (
    sum + tournament.registrations.size * Number(tournament.buyIn || 0)
  ), 0);
}

function tournamentFeeReserve() {
  return [...tournaments.values()].reduce((sum, tournament) => (
    sum + tournament.registrations.size * Number(tournament.fee || 0)
  ), 0);
}

function memoryLedgerTotal(type) {
  return [...transactions.values()].reduce((sum, history) => (
    sum + history
      .filter((entry) => entry.type === type)
      .reduce((entrySum, entry) => entrySum + Number(entry.amount || 0), 0)
  ), 0);
}

function memoryLedgerCategoryTotal(type, category) {
  return [...transactions.values()].reduce((sum, history) => (
    sum + history
      .filter((entry) => entry.type === type && entry.category === category)
      .reduce((entrySum, entry) => entrySum + Number(entry.amount || 0), 0)
  ), 0);
}

function buildReconciliationAudit({
  walletTotal,
  ledgerCreditTotal,
  ledgerDebitTotal,
  paidStarsChipsTotal,
  depositStarsLedgerTotal
}) {
  const ledgerNetTotal = Number(ledgerCreditTotal || 0) - Number(ledgerDebitTotal || 0);
  const walletLedgerDrift = Number(walletTotal || 0) - ledgerNetTotal;
  const starsDepositDrift = Number(paidStarsChipsTotal || 0) - Number(depositStarsLedgerTotal || 0);
  const maxDrift = Math.max(Math.abs(walletLedgerDrift), Math.abs(starsDepositDrift));
  return {
    ok: maxDrift < RECONCILIATION_DRIFT_ALERT_CHIPS,
    walletLedgerDrift,
    starsDepositDrift,
    maxDrift,
    checkedAt: new Date().toISOString()
  };
}

async function runReconciliationCheck(reason = "manual") {
  const dashboard = await adminDashboardView();
  const reconciliation = dashboard.audit.reconciliation;
  if (!reconciliation || reconciliation.ok) {
    if (lastReconciliationAlertKey && reconciliation?.ok) lastReconciliationAlertKey = "";
    return reconciliation;
  }

  const alertKey = [
    reconciliation.walletLedgerDrift,
    reconciliation.starsDepositDrift
  ].join(":");
  if (alertKey === lastReconciliationAlertKey) return reconciliation;
  lastReconciliationAlertKey = alertKey;

  notifyAdmin("reconciliation_alert", "Ошибка сверки балансов", {
    lines: [
      `Причина проверки: ${reason}`,
      `Wallet/Ledger drift: ${formatNumber(reconciliation.walletLedgerDrift)} chips`,
      `Stars paid/Ledger drift: ${formatNumber(reconciliation.starsDepositDrift)} chips`,
      `Wallet total: ${formatNumber(dashboard.stats.walletTotal)} chips`,
      `Ledger net: ${formatNumber(dashboard.stats.ledgerNetTotal)} chips`,
      `Paid Stars chips: ${formatNumber(dashboard.stats.paidStarsChipsTotal)} chips`,
      `Ledger deposit_stars: ${formatNumber(dashboard.stats.depositStarsLedgerTotal)} chips`
    ]
  });
  return reconciliation;
}

function recentFundMovements(limit = 20) {
  return [...fundMovements.entries()]
    .flatMap(([userId, movements]) => movements.map((movement) => ({
      ...movement,
      userId,
      user: userProfiles.get(userId) || { id: userId }
    })))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit);
}

async function healthSnapshot({ publicView = false } = {}) {
  const database = await dbDatabaseHealth();
  const tableStatuses = [...tables.values()].reduce((result, table) => {
    result[table.status] = (result[table.status] || 0) + 1;
    return result;
  }, {});
  const activeTables = [...tables.values()].filter((table) => table.seats.length > 0).length;
  const tournamentRegistrations = [...tournaments.values()].reduce((sum, tournament) => sum + tournament.registrations.size, 0);
  const memory = process.memoryUsage();
  const uptimeSeconds = Math.round((Date.now() - startedAt) / 1000);

  const health = {
    ok: Boolean(database.ok),
    appName: APP_NAME,
    environment: isProduction ? "production" : "development",
    uptimeSeconds,
    startedAt: new Date(startedAt).toISOString(),
    now: new Date().toISOString(),
    database,
    tables: {
      open: tables.size,
      active: activeTables,
      statuses: tableStatuses
    },
    tournaments: {
      count: tournaments.size,
      registrations: tournamentRegistrations
    }
  };

  if (!publicView) {
    health.sessions = sessions.size;
    health.payments = {
      pendingStars: [...starOrders.values()].filter((order) => order.status === "pending").length,
      paidStars: [...starOrders.values()].filter((order) => order.status === "paid").length
    };
    health.memory = {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024)
    };
    health.audit = {
      cachedHandHistories: recentHandHistories.length,
      persistedHandKeys: persistedHandIds.size,
      fundMovementUsers: fundMovements.size
    };
  }

  return health;
}

async function persistAllCompletedHands() {
  for (const table of tables.values()) {
    await persistCompletedHands(table);
  }
}

async function persistCompletedHands(table) {
  for (const hand of table.handHistory || []) {
    const key = `${table.id}:${hand.id}`;
    if (persistedHandIds.has(key)) continue;
    persistedHandIds.add(key);

    const record = {
      id: hand.id,
      tableId: table.id,
      tableName: table.name,
      handNumber: hand.handNumber,
      smallBlind: table.smallBlind,
      bigBlind: table.bigBlind,
      board: hand.board || [],
      pots: hand.pots || [],
      seats: hand.seats || [],
      rake: hand.rake || 0,
      at: hand.at || Date.now(),
      finishedAt: new Date(hand.at || Date.now()).toISOString()
    };
    recentHandHistories.unshift(record);
    recentHandHistories.splice(50);

    try {
      await dbRecordHandHistory(table, hand);
      if (Number(hand.rake || 0) > 0) {
        await dbRecordPlatformLedgerEntry({
          type: "credit",
          category: "rake_cash",
          title: "Cash game rake",
          amount: hand.rake,
          contextId: hand.id,
          meta: `${table.name} · ${table.smallBlind}/${table.bigBlind} · hand #${hand.handNumber}`,
          idempotencyKey: `rake:${hand.id}`
        });
      }
    } catch (error) {
      console.error("Hand history persist failed:", error.message);
    }
  }
}

async function hydrateActiveTables() {
  const snapshots = await dbListActiveTableSnapshots();
  if (!snapshots || snapshots.length === 0) return;

  tables.clear();
  const now = Date.now();
  for (const snapshot of snapshots) {
    const table = normalizeHydratedTable(snapshot.raw, now);
    if (!table?.id || !Array.isArray(table.seats)) continue;
    tables.set(table.id, table);
  }

  if (tables.size === 0) {
    seedPublicTables();
    return;
  }

  console.log(`Restored ${tables.size} table snapshot${tables.size === 1 ? "" : "s"} from database`);
}

function normalizeHydratedTable(table, now = Date.now()) {
  if (!table || typeof table !== "object") return null;

  table.seats = Array.isArray(table.seats) ? table.seats : [];
  table.communityCards = Array.isArray(table.communityCards) ? table.communityCards : [];
  table.actionLog = Array.isArray(table.actionLog) ? table.actionLog : [];
  table.handHistory = Array.isArray(table.handHistory) ? table.handHistory : [];
  table.runoutQueue = Array.isArray(table.runoutQueue) ? table.runoutQueue : [];
  table.deck = Array.isArray(table.deck) ? table.deck : [];
  table.status = table.status || "waiting";
  table.startIntroUntil = 0;
  table.runoutNextAt = 0;
  table.actionDeadline = 0;

  if (table.status === "starting") {
    table.startIntroUntil = now + START_INTRO_MS;
  } else if (table.status === "showdown") {
    table.handFinishedAt = now - NEXT_HAND_DELAY_MS;
  } else if (table.status === "runout") {
    table.runoutNextAt = now + RUNOUT_CARD_DELAY_MS;
  } else if (table.activeSeatIndex >= 0) {
    table.actionDeadline = now + ACTION_TIMEOUT_MS;
  }

  for (const seat of table.seats) {
    seat.cards = Array.isArray(seat.cards) ? seat.cards : [];
    seat.stack = Math.max(0, Math.round(Number(seat.stack) || 0));
    seat.bet = Math.max(0, Math.round(Number(seat.bet) || 0));
    seat.totalBet = Math.max(0, Math.round(Number(seat.totalBet) || 0));
    seat.handStartStack = Math.max(0, Math.round(Number(seat.handStartStack) || seat.stack || 0));
    seat.sittingOutUntil = Number(seat.sittingOutUntil || 0);
  }

  return table;
}

async function persistActiveTableSnapshots() {
  if (!databaseEnabled()) return;

  for (const table of tables.values()) {
    await persistActiveTableSnapshot(table);
  }
}

async function persistActiveTableSnapshot(table) {
  if (!databaseEnabled()) return;
  try {
    await dbUpsertActiveTableSnapshot(table);
  } catch (error) {
    console.error("Active table snapshot persist failed:", error.message);
  }
}

async function deleteActiveTableSnapshot(tableId) {
  try {
    await dbDeleteActiveTableSnapshot(tableId);
  } catch (error) {
    console.error("Active table snapshot delete failed:", error.message);
  }
}

async function adminPlayerView(userId) {
  const id = normalizeTargetUserId(userId);
  const profile = userProfiles.get(id) || { id, name: "unknown", username: "" };
  const balance = await getWallet(id);
  const activeTables = userActiveTables({ id });
  const tableStack = activeTables.reduce((sum, table) => sum + table.stack, 0);

  return {
    user: {
      id,
      name: profile.name || "unknown",
      username: profile.username || "",
      photoUrl: profile.photoUrl || ""
    },
    balance,
    tableStack,
    totalBankroll: balance + tableStack,
    activeTables,
    transactions: (await getTransactions({ id })).slice(0, 20)
  };
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

async function normalizeUser(user) {
  const id = String(user.id);
  const normalized = {
    id,
    name: user.first_name || user.username || "Player",
    username: user.username || "",
    photoUrl: user.photo_url || "",
    balance: 0
  };
  await upsertTelegramUser(normalized);
  normalized.balance = await getWallet(id);
  userProfiles.set(id, normalized);
  return normalized;
}

async function profileView(user) {
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
    savedStack: await getSavedStack(user),
    tableStack,
    activeTables,
    activeTableCount: activeTables.length,
    handsPlayed
  };
}

async function cashierView(user) {
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
    transactions: await getTransactions(user)
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

function seedTournaments() {
  const now = Date.now();
  const entries = [
    {
      id: "sng-25-evening",
      title: "QWZ Sit&Go 25/50",
      type: "Sit&Go",
      status: "registering",
      buyIn: 5000,
      fee: 250,
      maxPlayers: 6,
      startsAt: new Date(now + 30 * 60 * 1000).toISOString(),
      prizePoolMode: "buyins"
    },
    {
      id: "freezeout-daily",
      title: "Daily Freezeout",
      type: "Freezeout",
      status: "registering",
      buyIn: 10000,
      fee: 500,
      maxPlayers: 36,
      startsAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
      prizePoolMode: "buyins"
    },
    {
      id: "rebuy-weekly",
      title: "Weekly Rebuy",
      type: "Rebuy",
      status: "planned",
      buyIn: 25000,
      fee: 1250,
      maxPlayers: 72,
      startsAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      prizePoolMode: "buyins"
    }
  ];

  return new Map(entries.map((tournament) => [
    tournament.id,
    {
      ...tournament,
      registrations: new Map()
    }
  ]));
}

function tournamentListView(user) {
  return [...tournaments.values()].map((tournament) => tournamentView(tournament, user));
}

async function hydrateTournamentRegistrations() {
  const rows = await dbListTournamentRegistrations([...tournaments.keys()]);
  if (!rows) return;

  for (const tournament of tournaments.values()) {
    tournament.registrations.clear();
  }
  for (const row of rows) {
    const tournament = tournaments.get(row.tournamentId);
    if (!tournament) continue;
    tournament.registrations.set(row.userId, {
      userId: row.userId,
      name: row.name || "Player",
      username: row.username || "",
      registeredAt: row.registeredAt
    });
  }
}

function tournamentView(tournament, user) {
  const participants = tournament.registrations.size;
  const totalCost = tournament.buyIn + tournament.fee;
  const prizePool = tournament.buyIn * participants;
  return {
    id: tournament.id,
    title: tournament.title,
    type: tournament.type,
    status: tournament.status,
    buyIn: tournament.buyIn,
    fee: tournament.fee,
    totalCost,
    maxPlayers: tournament.maxPlayers,
    participants,
    prizePool,
    startsAt: tournament.startsAt,
    registered: tournament.registrations.has(user.id),
    canRegister: tournament.status === "registering" && participants < tournament.maxPlayers && !tournament.registrations.has(user.id),
    canCancel: tournament.status === "registering" && tournament.registrations.has(user.id)
  };
}

async function registerTournament(tournament, user) {
  if (tournament.status !== "registering") {
    const error = new Error("Регистрация на турнир пока закрыта");
    error.status = 409;
    throw error;
  }
  if (tournament.registrations.has(user.id)) return;
  if (tournament.registrations.size >= tournament.maxPlayers) {
    const error = new Error("Турнир уже заполнен");
    error.status = 409;
    throw error;
  }

  const totalCost = tournament.buyIn + tournament.fee;
  if (user.balance < totalCost) {
    const error = new Error(`Недостаточно chips для регистрации. Нужно ${formatNumber(totalCost)} chips`);
    error.status = 409;
    throw error;
  }

  const registeredAt = new Date().toISOString();
  const dbResult = await dbRegisterTournament(user.id, tournament);
  if (dbResult) {
    user.balance = setWalletBalanceLocal(user.id, dbResult.balance);
  } else {
    user.balance = await recordTransaction(user, {
      type: "debit",
      category: "tournament_buyin",
      title: "Вход в турнир",
      amount: totalCost,
      meta: `${tournament.title} · бай-ин ${formatNumber(tournament.buyIn)} + fee ${formatNumber(tournament.fee)}`
    });
  }

  tournament.registrations.set(user.id, {
    userId: user.id,
    name: user.name,
    username: user.username,
    registeredAt
  });
  await recordFundMovement(user, {
    category: "wallet_to_tournament_escrow",
    from: "wallet",
    to: "tournament_escrow",
    amount: totalCost,
    contextId: tournament.id,
    meta: tournament.title
  });
  notifyAdmin("tournament_register", "Регистрация в турнир", {
    user,
    lines: [
      `Турнир: ${tournament.title}`,
      `Стоимость: ${formatNumber(totalCost)} chips`,
      `Участников: ${tournament.registrations.size}/${tournament.maxPlayers}`,
      `Баланс: ${formatNumber(user.balance)} chips`
    ]
  });
}

async function cancelTournamentRegistration(tournament, user) {
  if (!tournament.registrations.has(user.id)) return;
  if (tournament.status !== "registering") {
    const error = new Error("Отменить регистрацию уже нельзя");
    error.status = 409;
    throw error;
  }

  const totalCost = tournament.buyIn + tournament.fee;
  const dbResult = await dbCancelTournamentRegistration(user.id, tournament);
  if (dbResult) {
    user.balance = setWalletBalanceLocal(user.id, dbResult.balance);
  } else {
    user.balance = await recordTransaction(user, {
      type: "credit",
      category: "tournament_refund",
      title: "Возврат турнирного бай-ина",
      amount: totalCost,
      meta: tournament.title
    });
  }
  tournament.registrations.delete(user.id);
  await recordFundMovement(user, {
    category: "tournament_escrow_to_wallet",
    from: "tournament_escrow",
    to: "wallet",
    amount: totalCost,
    contextId: tournament.id,
    meta: tournament.title
  });
  notifyAdmin("tournament_cancel", "Отмена регистрации в турнир", {
    user,
    lines: [
      `Турнир: ${tournament.title}`,
      `Возврат: ${formatNumber(totalCost)} chips`,
      `Баланс: ${formatNumber(user.balance)} chips`
    ]
  });
}

async function getSavedStack(user) {
  const dbStack = await dbGetSavedStack(user.id);
  if (dbStack !== null) {
    savedStacks.set(user.id, dbStack);
    return dbStack;
  }
  return savedStacks.get(user.id) || DEFAULT_STACK;
}

async function prepareInitialStack(user, body = {}, idempotencyKey = "") {
  const requested = Number(body.buyInAmount || 0);
  if (!requested) {
    user.stack = await getSavedStack(user);
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
  user.balance = await recordTransaction(user, {
    type: "debit",
    category: "table_buyin",
    title: "Бай-ин за стол",
    amount,
    meta: "Texas NL",
    idempotencyKey
  });
  await recordFundMovement(user, {
    category: "wallet_to_table",
    from: "wallet",
    to: "table",
    amount,
    meta: "Texas NL buy-in"
  });
}

async function saveStack(user, stack) {
  const previous = await getSavedStack(user);
  const normalized = Math.max(0, Math.round(Number(stack) || 0));
  savedStacks.set(user.id, normalized);
  await dbSetSavedStack(user.id, normalized);
  const delta = normalized - previous;
  if (delta !== 0) {
    await recordFundMovement(user, {
      category: delta > 0 ? "table_to_saved_stack" : "saved_stack_decrease",
      from: delta > 0 ? "table" : "saved_stack",
      to: delta > 0 ? "saved_stack" : "table_or_adjustment",
      amount: Math.abs(delta),
      meta: `saved stack ${formatNumber(previous)} -> ${formatNumber(normalized)}`
    });
  }
}

async function getWallet(userId) {
  const dbBalance = await dbGetWallet(userId);
  if (dbBalance !== null) return setWalletBalanceLocal(userId, dbBalance);
  if (!wallets.has(userId)) wallets.set(userId, DEFAULT_WALLET);
  return wallets.get(userId);
}

async function setWalletBalance(userId, balance) {
  const dbBalance = await dbSetWallet(userId, balance);
  return setWalletBalanceLocal(userId, dbBalance ?? balance);
}

function setWalletBalanceLocal(userId, balance) {
  const id = String(userId);
  const normalized = Math.max(0, Math.round(Number(balance) || 0));
  wallets.set(id, normalized);

  for (const sessionUser of sessions.values()) {
    if (sessionUser.id === id) sessionUser.balance = normalized;
  }

  const profile = userProfiles.get(id);
  if (profile) profile.balance = normalized;
  return normalized;
}

async function getTransactions(user) {
  const dbLedger = await dbListLedger(user.id, 30);
  if (dbLedger) {
    transactions.set(user.id, dbLedger);
    return dbLedger;
  }
  if (!transactions.has(user.id)) {
    transactions.set(user.id, DEFAULT_WALLET > 0 ? [
      {
        id: randomId("tx"),
        type: "credit",
        category: "starting_balance",
        title: "Стартовый баланс",
        amount: DEFAULT_WALLET,
        meta: "QWZ chips",
        createdAt: new Date().toISOString()
      }
    ] : []);
  }
  return transactions.get(user.id);
}

async function recordTransaction(user, transaction) {
  const dbEntry = await dbAddWalletEntry(user.id, transaction);
  if (dbEntry) {
    setWalletBalanceLocal(user.id, dbEntry.balance);
    await getTransactions(user);
    return dbEntry.balance;
  }

  const nextBalance = setWalletBalanceLocal(
    user.id,
    getWalletLocal(user.id) + (transaction.type === "debit" ? -transaction.amount : transaction.amount)
  );
  const history = await getTransactions(user);
  history.unshift({
    id: randomId("tx"),
    type: transaction.type,
    category: normalizeLedgerCategory(transaction.category),
    title: transaction.title,
    amount: transaction.amount,
    meta: transaction.meta || "",
    createdAt: new Date().toISOString()
  });
  transactions.set(user.id, history.slice(0, 30));
  return nextBalance;
}

async function recordFundMovement(user, movement) {
  const normalized = {
    id: randomId("move"),
    category: normalizeLedgerCategory(movement.category),
    from: normalizeLedgerCategory(movement.from || movement.fromBucket),
    to: normalizeLedgerCategory(movement.to || movement.toBucket),
    amount: Math.max(0, Math.round(Number(movement.amount) || 0)),
    contextId: movement.contextId || "",
    meta: movement.meta || "",
    createdAt: new Date().toISOString()
  };
  if (normalized.amount <= 0) return null;

  const dbMovement = await dbRecordFundMovement(user.id, normalized);
  const history = fundMovements.get(user.id) || [];
  history.unshift(normalized);
  fundMovements.set(user.id, history.slice(0, 100));
  return dbMovement || normalized;
}

function getWalletLocal(userId) {
  if (!wallets.has(userId)) wallets.set(userId, DEFAULT_WALLET);
  return wallets.get(userId);
}

function isAdminUser(userId) {
  return ADMIN_USER_IDS.has(String(userId));
}

function normalizeTargetUserId(value) {
  const targetId = String(value || "").trim();
  if (!targetId) throw new Error("Укажите Telegram ID игрока");
  return targetId;
}

function normalizeLedgerCategory(category) {
  return String(category || "other").trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 64) || "other";
}

function normalizeIdempotencyKey({ scope, actorId, targetId, requestId }) {
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedRequestId) return "";
  return [scope, actorId || "system", targetId || "", normalizedRequestId]
    .map((part) => String(part).trim().replace(/\s+/g, "_").slice(0, 120))
    .join(":");
}

function parseChipAmount(value) {
  const amount = Number(String(value || "").replace(/\s+/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Укажите положительную сумму chips");
  if (amount > ADMIN_GRANT_MAX_CHIPS) {
    throw new Error(`Лимит одной операции: ${formatNumber(ADMIN_GRANT_MAX_CHIPS)} chips`);
  }
  return Math.round(amount);
}

function telegramMessageUser(user = {}) {
  return {
    id: String(user.id || ""),
    name: user.first_name || user.username || "Admin",
    username: user.username || ""
  };
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
  if (update.message?.text) {
    await handleAdminCommand(update.message);
    return;
  }

  if (update.pre_checkout_query) {
    await answerPreCheckout(update.pre_checkout_query);
    return;
  }

  const payment = update.message?.successful_payment;
  if (!payment) return;
  await processSuccessfulStarPayment(payment);
}

async function handleAdminCommand(message) {
  const text = String(message.text || "").trim();
  if (!text.startsWith("/")) return;

  const fromId = String(message.from?.id || "");
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.toLowerCase().replace(`@${BOT_USERNAME.toLowerCase()}`, "");

  if (!["/balance", "/grant", "/deduct"].includes(command)) return;

  if (!isAdminUser(fromId)) {
    await sendBotMessage(message.chat.id, "Недостаточно прав для админ-команд.");
    notifyAdmin("admin_denied", "Отклонена админ-команда", {
      user: telegramMessageUser(message.from),
      lines: [`Команда: ${text}`]
    });
    return;
  }

  try {
    if (command === "/balance") {
      await handleAdminBalanceCommand(message, args);
      return;
    }

    await handleAdminWalletCommand(message, command, args);
  } catch (error) {
    await sendBotMessage(message.chat.id, `Ошибка: ${error.message}`);
  }
}

async function handleAdminBalanceCommand(message, args) {
  const targetId = normalizeTargetUserId(args[0]);
  const profile = userProfiles.get(targetId);
  const balance = await getWallet(targetId);
  const tableStack = userActiveTables({ id: targetId }).reduce((sum, table) => sum + table.stack, 0);

  await sendBotMessage(message.chat.id, [
    "Баланс игрока",
    `Игрок: ${formatUser(profile || { id: targetId })}`,
    `Кошелек: ${formatNumber(balance)} chips`,
    `За столами: ${formatNumber(tableStack)} chips`,
    `Всего: ${formatNumber(balance + tableStack)} chips`
  ].join("\n"));
}

async function handleAdminWalletCommand(message, command, args) {
  const admin = telegramMessageUser(message.from);
  const result = await adjustWalletManually({
    admin,
    targetId: args[0],
    type: command === "/grant" ? "grant" : "deduct",
    amount: args[1],
    reason: args.slice(2).join(" ").trim() || "manual_adjustment",
    requestId: message.message_id ? `telegram:${message.chat?.id || ""}:${message.message_id}` : ""
  });

  await sendBotMessage(message.chat.id, [
    command === "/grant" ? "Начислено chips" : "Списано chips",
    `Игрок: ${formatUser(result.targetProfile)}`,
    `Сумма: ${formatNumber(result.amount)} chips`,
    `Баланс: ${formatNumber(result.balance)} chips`,
    `Причина: ${result.reason}`
  ].join("\n"));
}

async function adjustWalletManually({ admin, targetId, type, amount, reason, requestId = "" }) {
  const normalizedType = type === "deduct" ? "deduct" : "grant";
  const normalizedTargetId = normalizeTargetUserId(targetId);
  const normalizedAmount = parseChipAmount(amount);
  const normalizedReason = String(reason || "").trim() || "manual_adjustment";
  const adminProfile = admin || { id: "system", name: "Admin", username: "" };
  const idempotencyKey = normalizeIdempotencyKey({
    scope: "admin_wallet_adjust",
    actorId: adminProfile.id,
    targetId: normalizedTargetId,
    requestId
  });
  if (idempotencyKey && idempotencyResults.has(idempotencyKey)) {
    return {
      ...idempotencyResults.get(idempotencyKey),
      idempotentReplay: true
    };
  }

  const sign = normalizedType === "grant" ? 1 : -1;
  const before = await getWallet(normalizedTargetId);
  const after = before + sign * normalizedAmount;

  if (after < 0) {
    throw new Error(`Недостаточно chips. Баланс игрока: ${formatNumber(before)}`);
  }

  const targetProfile = userProfiles.get(normalizedTargetId) || { id: normalizedTargetId };
  const title = normalizedType === "grant" ? "Ручное начисление" : "Ручное списание";

  const balance = await recordTransaction(targetProfile, {
    type: normalizedType === "grant" ? "credit" : "debit",
    category: normalizedType === "grant" ? "admin_grant" : "admin_deduct",
    title,
    amount: normalizedAmount,
    meta: `${normalizedReason} · admin ${adminProfile.id}`
  });

  notifyAdmin(normalizedType, title, {
    user: targetProfile,
    lines: [
      `Админ: ${formatUser(adminProfile)}`,
      `Сумма: ${formatNumber(normalizedAmount)} chips`,
      `До: ${formatNumber(before)} chips`,
      `После: ${formatNumber(balance)} chips`,
      `Причина: ${normalizedReason}`
    ]
  });

  const result = {
    targetId: normalizedTargetId,
    targetProfile,
    amount: normalizedAmount,
    before,
    balance,
    reason: normalizedReason,
    type: normalizedType,
    requestId: requestId || ""
  };
  if (idempotencyKey) idempotencyResults.set(idempotencyKey, result);
  return result;
}

async function handleAdminPaymentAction({ admin, paymentId, action, reason = "" }) {
  const order = await paymentOrderFromId(paymentId);
  if (!order) {
    const error = new Error("Платеж не найден");
    error.status = 404;
    throw error;
  }
  if (order.method === "stars") {
    const error = new Error("Stars платежи нельзя подтверждать вручную");
    error.status = 409;
    throw error;
  }
  if (!["pending", "manual_review"].includes(order.status)) {
    const error = new Error(`Платеж уже в статусе ${order.status}`);
    error.status = 409;
    throw error;
  }

  const adminProfile = admin || { id: "system", name: "Admin", username: "" };
  const normalizedReason = String(reason || "").trim() || `manual_${action}`;

  if (action === "reject") {
    await dbUpdatePaymentOrderStatus(order.id, {
      status: "failed",
      externalId: order.externalId || `admin:${adminProfile.id}`,
      raw: { adminAction: "reject", reason: normalizedReason, adminId: adminProfile.id }
    });
    order.status = "failed";
    cryptoOrders.set(order.id, order);
    notifyAdmin("payment_rejected", "Админ отклонил платеж", {
      user: { id: order.userId, name: order.userName, username: order.username },
      lines: [
        `Админ: ${formatUser(adminProfile)}`,
        `Order: ${order.id}`,
        `Метод: ${order.method}`,
        `Сумма: ${formatNumber(order.chips)} chips`,
        `Причина: ${normalizedReason}`
      ]
    });
    return order;
  }

  const completed = await dbCompletePaymentOrder(order.id, {
    crypto_payment: true,
    telegram_payment_charge_id: `manual:${adminProfile.id}:${Date.now()}`,
    provider_event: { adminAction: "approve", reason: normalizedReason, adminId: adminProfile.id }
  });
  let balance = completed?.balance;
  if (completed?.alreadyPaid || completed?.ignored) {
    return { ...order, status: completed.order?.status || order.status };
  }
  if (!completed) {
    const paymentKey = `payment:${order.id}`;
    if (idempotencyResults.has(paymentKey)) {
      return { ...order, status: "paid" };
    }
    balance = await recordTransaction({ id: order.userId }, {
      type: "credit",
      category: `deposit_${normalizeLedgerCategory(order.method)}`,
      title: "Пополнение баланса",
      amount: order.chips,
      meta: `manual approval · ${order.cryptoAmount || 0} ${order.asset || order.method} · admin ${adminProfile.id}`,
      idempotencyKey: paymentKey
    });
    idempotencyResults.set(paymentKey, { balance });
  }

  const paidOrder = {
    ...order,
    status: "paid",
    externalId: order.externalId || `manual:${adminProfile.id}`,
    paidAt: new Date().toISOString()
  };
  cryptoOrders.set(order.id, paidOrder);
  setWalletBalanceLocal(order.userId, balance);
  notifyAdmin("payment_approved", "Админ подтвердил платеж", {
    user: { id: order.userId, name: order.userName, username: order.username },
    lines: [
      `Админ: ${formatUser(adminProfile)}`,
      `Order: ${order.id}`,
      `Метод: ${order.method}`,
      `Сумма: ${formatNumber(order.chips)} chips`,
      `Баланс: ${formatNumber(balance)} chips`,
      `Причина: ${normalizedReason}`
    ]
  });
  return paidOrder;
}

async function answerPreCheckout(query) {
  const payload = query.invoice_payload || "";
  const order = await orderFromPayload(payload);
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

async function processSuccessfulStarPayment(payment) {
  const order = await orderFromPayload(payment.invoice_payload || "");
  if (!order || order.status === "paid") return;
  if (payment.currency !== "XTR" || Number(payment.total_amount) !== Number(order.stars)) return;

  const completed = await dbCompletePaymentOrder(order.id, payment);
  let balance = completed?.balance;
  if (completed) {
    if (completed.alreadyPaid || completed.ignored) return;
  } else {
    const paymentKey = `payment:${order.id}`;
    if (idempotencyResults.has(paymentKey)) return;
    balance = await recordTransaction({ id: order.userId }, {
      type: "credit",
      category: "deposit_stars",
      title: "Пополнение Stars",
      amount: order.chips,
      meta: `${order.stars} Stars · QWZ chips`,
      idempotencyKey: paymentKey
    });
    idempotencyResults.set(paymentKey, { balance });
    await dbMarkPaymentOrderPaid(order.id, payment);
  }

  order.status = "paid";
  order.paidAt = new Date().toISOString();
  order.telegramPaymentChargeId = payment.telegram_payment_charge_id || "";
  starOrders.set(order.id, order);
  setWalletBalanceLocal(order.userId, balance);
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

async function handleCryptoWebhook(event) {
  const orderId = String(event.orderId || event.order_id || event.merchantOrderId || "").trim();
  if (!orderId) {
    notifyAdmin("crypto_webhook_error", "Crypto webhook без orderId", {
      lines: [`Payload: ${JSON.stringify(event).slice(0, 500)}`]
    });
    return;
  }

  const order = await cryptoOrderFromId(orderId);
  if (!order) {
    notifyAdmin("crypto_webhook_error", "Crypto webhook для неизвестного order", {
      lines: [`Order: ${orderId}`, `Payload: ${JSON.stringify(event).slice(0, 500)}`]
    });
    return;
  }

  const status = normalizeCryptoPaymentStatus(event.status || event.paymentStatus || event.state);
  const paidAmount = Number(event.paidAmount ?? event.amount ?? event.cryptoAmount ?? 0);
  const txHash = String(event.txHash || event.tx_hash || event.transactionHash || "");
  const externalId = String(event.externalId || event.paymentId || event.invoiceId || "");
  const expectedAmount = Number(order.cryptoAmount || 0);
  const underpaid = paidAmount > 0 && expectedAmount > 0 && paidAmount + 0.00000001 < expectedAmount;

  if (underpaid) {
    await dbUpdatePaymentOrderStatus(order.id, {
      status: "manual_review",
      externalId,
      raw: { cryptoWebhook: event, reason: "underpaid" }
    });
    notifyAdmin("crypto_manual_review", "Crypto-платеж требует проверки", {
      user: { id: order.userId, name: order.userName, username: order.username },
      lines: [
        `Order: ${order.id}`,
        `Метод: ${order.asset} ${order.network}`,
        `Ожидали: ${order.cryptoAmount} ${order.asset}`,
        `Пришло: ${paidAmount} ${order.asset}`,
        `TX: ${txHash || "n/a"}`
      ]
    });
    return;
  }

  if (status !== "paid") {
    const mappedStatus = status === "expired" ? "expired" : status === "failed" ? "failed" : "pending";
    await dbUpdatePaymentOrderStatus(order.id, {
      status: mappedStatus,
      externalId,
      raw: { cryptoWebhook: event }
    });
    return;
  }

  const completed = await dbCompletePaymentOrder(order.id, {
    crypto_payment: true,
    telegram_payment_charge_id: txHash || externalId,
    provider_event: event
  });
  if (completed?.alreadyPaid || completed?.ignored) return;
  let balance = completed?.balance;
  if (!completed) {
    const paymentKey = `payment:${order.id}`;
    if (idempotencyResults.has(paymentKey)) return;
    balance = await recordTransaction({ id: order.userId }, {
      type: "credit",
      category: `deposit_${normalizeLedgerCategory(order.method)}`,
      title: "Пополнение баланса",
      amount: order.chips,
      meta: `${paidAmount || order.cryptoAmount} ${order.asset} ${order.network} · ${txHash || externalId || order.id}`,
      idempotencyKey: paymentKey
    });
    idempotencyResults.set(paymentKey, { balance });
    order.status = "paid";
    order.paidAt = new Date().toISOString();
  }

  const paidOrder = { ...order, status: "paid", externalId, txHash, paidAt: new Date().toISOString() };
  cryptoOrders.set(order.id, paidOrder);
  setWalletBalanceLocal(order.userId, balance);
  notifyAdmin("crypto_paid", "Оплачено crypto-пополнение", {
    user: { id: order.userId, name: order.userName, username: order.username },
    lines: [
      `Метод: ${order.asset} ${order.network}`,
      `Сумма: ${formatNumber(order.rubAmount)} ₽`,
      `Оплата: ${paidAmount || order.cryptoAmount} ${order.asset}`,
      `Chips: ${formatNumber(order.chips)}`,
      `Order: ${order.id}`,
      `TX: ${txHash || externalId || "n/a"}`,
      `Баланс: ${formatNumber(balance)} chips`
    ]
  });
}

async function pollTonDeposits() {
  if (!TON_POLLING_ENABLED || process.env.TON_PAYMENTS_ENABLED !== "true" || !TON_RECEIVER_ADDRESS) return;
  const pendingOrders = await pendingTonPaymentOrders();
  if (!pendingOrders.length) return;

  const transactions = await fetchTonTransactions(TON_RECEIVER_ADDRESS);
  for (const order of pendingOrders) {
    if (order.status !== "pending") continue;
    const match = findTonPaymentForOrder(order, transactions);
    if (!match) continue;
    await handleCryptoWebhook({
      orderId: order.id,
      status: "confirmed",
      paidAmount: match.tonAmount,
      txHash: match.hash,
      externalId: match.lt || match.hash,
      source: match.source,
      detectedBy: "toncenter_polling"
    });
  }
}

async function pendingTonPaymentOrders() {
  const dbOrders = await dbListPendingCryptoPaymentOrders(50);
  const orders = dbOrders || [...cryptoOrders.values()]
    .filter((order) => order.status === "pending" && order.method === "ton");
  const now = Date.now();
  return orders.filter((order) => (
    order.method === "ton"
      && (!order.expiresAt || new Date(order.expiresAt).getTime() > now)
  ));
}

async function fetchTonTransactions(address) {
  const url = new URL(`${TONCENTER_API_BASE}/transactions`);
  url.searchParams.set("account", address);
  url.searchParams.set("limit", "50");
  url.searchParams.set("sort", "desc");
  const headers = {};
  if (TONCENTER_API_KEY) headers["X-API-Key"] = TONCENTER_API_KEY;
  const response = await fetch(url, { headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || "TON transactions request failed");
  }
  return Array.isArray(data.transactions) ? data.transactions : Array.isArray(data) ? data : [];
}

function findTonPaymentForOrder(order, transactions) {
  const expectedNano = Math.round(Number(order.cryptoAmount || 0) * 1_000_000_000);
  const expectedComment = order.payload || `qwz:${order.id}`;

  for (const tx of transactions) {
    const transfer = extractTonInboundTransfer(tx);
    if (!transfer) continue;
    if (transfer.valueNano < expectedNano) continue;
    if (!transfer.comment.includes(expectedComment)) continue;
    return transfer;
  }
  return null;
}

function extractTonInboundTransfer(tx) {
  const message = tx.in_msg || tx.inMessage || tx.inMessageDescr || tx.in_message;
  if (!message) return null;
  const valueNano = Number(message.value || message.amount || message.value_extra_currencies || 0);
  if (!Number.isFinite(valueNano) || valueNano <= 0) return null;
  return {
    hash: tx.hash || tx.transaction_hash || tx.tx_hash || "",
    lt: String(tx.lt || tx.logical_time || tx.transaction_id?.lt || ""),
    source: message.source || message.src || "",
    destination: message.destination || message.dst || message.dest || "",
    valueNano,
    tonAmount: valueNano / 1_000_000_000,
    comment: tonMessageComment(message)
  };
}

function tonMessageComment(message) {
  const candidates = [
    message.message,
    message.comment,
    message.decoded_body?.text,
    message.decoded_body?.comment,
    message.message_content?.decoded?.comment,
    message.message_content?.decoded?.text,
    message.message_content?.body,
    message.msg_data?.text,
    message.msg_data?.body
  ];
  return candidates
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");
}

function normalizeCryptoPaymentStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["paid", "confirmed", "confirming", "finished", "success", "completed"].includes(value)) return "paid";
  if (["expired", "timeout", "cancelled", "canceled"].includes(value)) return "expired";
  if (["failed", "error", "rejected"].includes(value)) return "failed";
  return "pending";
}

async function cryptoOrderFromId(orderId) {
  return cryptoOrders.get(orderId) || await dbGetPaymentOrder(orderId);
}

async function paymentOrderFromId(orderId) {
  return starOrders.get(orderId) || cryptoOrders.get(orderId) || await dbGetPaymentOrder(orderId);
}

async function orderFromPayload(payload) {
  const orderId = String(payload).startsWith("qwz:") ? payload.slice(4) : "";
  if (!orderId) return null;
  return starOrders.get(orderId) || await dbGetPaymentOrder(orderId);
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

async function sendBotMessage(chatId, text) {
  if (!chatId || !BOT_TOKEN || BOT_TOKEN.includes("replace_with") || BOT_TOKEN === "test-token") return;
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  }).catch((error) => {
    console.error("Bot message failed:", error.message);
  });
}

function notifyAdmin(type, title, { user, lines = [] } = {}) {
  adminEvents.unshift({
    id: randomId("event"),
    type,
    title,
    user: user ? {
      id: user.id,
      name: user.name || "",
      username: user.username || ""
    } : null,
    lines,
    createdAt: new Date().toISOString()
  });
  adminEvents.splice(50);
  dbRecordAdminEvent(adminEvents[0]).catch((error) => {
    console.error("Admin event persistence failed:", error.message);
  });

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
  let filePath = path.join(publicDir, (url.pathname === "/" || url.pathname === "/admin") ? "index.html" : url.pathname);
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
    ".svg": "image/svg+xml; charset=utf-8",
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

async function sendIdempotentJson(req, res, user, scope, handler) {
  const rawKey = requestIdempotencyKey(req);
  const key = rawKey ? normalizeIdempotencyKey({
    scope,
    actorId: user?.id || "anonymous",
    targetId: "",
    requestId: rawKey
  }) : "";

  if (!key) {
    const result = await handler("");
    const normalized = normalizeRouteResult(result);
    sendJson(res, normalized.status, normalized.body);
    return;
  }

  const cached = await getApiIdempotencyResult(key);
  if (cached) {
    sendJson(res, Number(cached.status || 200), cached.body || {});
    return;
  }

  if (pendingIdempotencyResults.has(key)) {
    const replay = await pendingIdempotencyResults.get(key);
    sendJson(res, replay.status, replay.body);
    return;
  }

  const promise = (async () => {
    const result = normalizeRouteResult(await handler(key));
    await saveApiIdempotencyResult({
      key,
      scope,
      userId: user?.id || "",
      status: result.status,
      body: result.body
    });
    return result;
  })();

  pendingIdempotencyResults.set(key, promise);
  try {
    const result = await promise;
    sendJson(res, result.status, result.body);
  } finally {
    pendingIdempotencyResults.delete(key);
  }
}

function requestIdempotencyKey(req) {
  const value = req.headers["x-idempotency-key"];
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

async function getApiIdempotencyResult(key) {
  const dbResult = await dbGetIdempotencyResult(key);
  if (dbResult) return dbResult;
  const memoryResult = apiIdempotencyResults.get(key);
  if (!memoryResult) return null;
  if (memoryResult.expiresAt <= Date.now()) {
    apiIdempotencyResults.delete(key);
    return null;
  }
  return memoryResult;
}

async function saveApiIdempotencyResult(record) {
  await dbSaveIdempotencyResult(record);
  apiIdempotencyResults.set(record.key, {
    status: record.status,
    body: record.body,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });
  if (apiIdempotencyResults.size > 1000) {
    const expiredAt = Date.now();
    for (const [key, value] of apiIdempotencyResults.entries()) {
      if (value.expiresAt <= expiredAt || apiIdempotencyResults.size > 800) {
        apiIdempotencyResults.delete(key);
      }
    }
  }
}

function normalizeRouteResult(result) {
  if (result && typeof result === "object" && "body" in result) {
    return {
      status: Number(result.status || 200),
      body: result.body || {}
    };
  }
  return {
    status: 200,
    body: result || {}
  };
}

function randomId(prefix) {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

function normalizeBotUsername(username) {
  return username.replace(/^@/, "");
}

function parseIdList(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && !item.startsWith("-"))
  );
}

function validateEnvironment() {
  if (!isProduction) return;
  const problems = [];
  if (!BOT_TOKEN || BOT_TOKEN.includes("replace_with") || BOT_TOKEN === "test-token") {
    problems.push("BOT_TOKEN is required in production");
  }
  if (!process.env.DATABASE_URL) {
    console.warn("[warn] DATABASE_URL is empty — production will run in memory mode until PostgreSQL is configured.");
  }
  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.warn("[warn] TELEGRAM_WEBHOOK_SECRET is empty — webhook endpoint is unprotected.");
  }
  if ((process.env.TON_PAYMENTS_ENABLED === "true" || process.env.USDT_TRC20_PAYMENTS_ENABLED === "true") && !CRYPTO_WEBHOOK_SECRET) {
    console.warn("[warn] CRYPTO_WEBHOOK_SECRET is empty — crypto confirmations will be rejected in production.");
  }
  if (problems.length) {
    for (const message of problems) console.error(`[fatal] ${message}`);
    process.exit(1);
  }
}

function initSentry() {
  const dsn = process.env.SENTRY_DSN || "";
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: isProduction ? "production" : (process.env.NODE_ENV || "development"),
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      release: process.env.SENTRY_RELEASE || undefined
    });
  } catch (error) {
    console.error("Sentry init failed:", error.message);
  }
}

function registerProcessHandlers() {
  process.on("uncaughtException", (error) => {
    console.error("uncaughtException:", error);
    reportError(error, { kind: "uncaughtException" });
  });
  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    console.error("unhandledRejection:", error);
    reportError(error, { kind: "unhandledRejection" });
  });
}

function reportError(error, context = {}) {
  if (!error) return;
  try {
    if (process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        for (const [key, value] of Object.entries(context)) {
          scope.setTag(key, String(value).slice(0, 200));
        }
        Sentry.captureException(error);
      });
    }
  } catch (sentryError) {
    console.error("Sentry capture failed:", sentryError.message);
  }
  if (!process.env.SENTRY_DSN) console.error(error);
}

function verifyTelegramWebhook(req) {
  if (!TELEGRAM_WEBHOOK_SECRET) return true;
  const provided = req.headers["x-telegram-bot-api-secret-token"] || "";
  return provided === TELEGRAM_WEBHOOK_SECRET;
}

function verifyCryptoWebhook(req) {
  if (!CRYPTO_WEBHOOK_SECRET) return !isProduction;
  const provided = req.headers["x-qwz-crypto-secret"] || req.headers["x-webhook-secret"] || "";
  return provided === CRYPTO_WEBHOOK_SECRET;
}

function ensureCryptoPaymentMethodEnabled(method) {
  const settings = depositSettings();
  const item = settings.methods.find((candidate) => candidate.id === method);
  if (!item?.enabled) {
    const error = new Error("Этот crypto-метод еще не подключен");
    error.status = 409;
    throw error;
  }
}

function cryptoOrderView(order) {
  return {
    id: order.id,
    method: order.method,
    asset: order.asset,
    network: order.network,
    rubAmount: order.rubAmount,
    chips: order.chips,
    cryptoAmount: order.cryptoAmount,
    receiverAddress: order.receiverAddress || "",
    payload: order.payload || "",
    status: order.status,
    expiresAt: order.expiresAt,
    tonConnect: order.method === "ton" ? {
      address: order.receiverAddress || "",
      amountNano: String(Math.round(Number(order.cryptoAmount || 0) * 1_000_000_000)),
      comment: order.payload || order.id,
      validUntil: Math.floor(new Date(order.expiresAt || Date.now() + 20 * 60 * 1000).getTime() / 1000)
    } : null
  };
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
