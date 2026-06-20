import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import {
  ASSETS,
  BALANCE_BUCKETS,
  CASH_TABLE_LIMITS,
  CASH_CLUB,
  ECONOMY,
  PLAY_TABLE_LIMITS,
  RATING,
  advanceWelcomeBonusWagering,
  cashClubPointsFromRake,
  cashClubProgress,
  cashClubStatus,
  cashSettings,
  depositSettings,
  formatUsdtMicros,
  playSettings,
  quoteCashDeposit,
  quoteDeposit,
  quoteWelcomeBonus,
  quoteWithdrawal as quoteCashWithdrawal,
  ratingDeltaForHand,
  ratingLeague,
  nextRatingPoints
} from "./economy.js";
import {
  createCryptoBotInvoice,
  createTelegramStarsInvoiceLink,
  createXRocketInvoice,
  normalizeExternalInvoiceOrderId,
  parseCryptoBotInvoiceWebhook,
  parseXRocketInvoiceWebhook,
  verifyCryptoBotWebhookSignature,
  verifyXRocketWebhookSignature
} from "./payments.js";
import {
  addCashWalletEntry as dbAddCashWalletEntry,
  addWalletEntry as dbAddWalletEntry,
  applyBonusWagering as dbApplyBonusWagering,
  completePaymentOrder as dbCompletePaymentOrder,
  createPaymentOrder as dbCreatePaymentOrder,
  createWithdrawalOrder as dbCreateWithdrawalOrder,
  analyticsOverview as dbAnalyticsOverview,
  dashboardStats as dbDashboardStats,
  databaseHealth as dbDatabaseHealth,
  databaseEnabled,
  deleteActiveTableSnapshot as dbDeleteActiveTableSnapshot,
  getCashWallet as dbGetCashWallet,
  getDailyPlayClaim as dbGetDailyPlayClaim,
  getBonusSummary as dbGetBonusSummary,
  getPaymentOrder as dbGetPaymentOrder,
  getPlayerProfile as dbGetPlayerProfile,
  getIdempotencyResult as dbGetIdempotencyResult,
  getSavedStack as dbGetSavedStack,
  getWithdrawalOrder as dbGetWithdrawalOrder,
  getWallet as dbGetWallet,
  claimDailyPlayChips as dbClaimDailyPlayChips,
  initDatabase,
  expireWelcomeBonuses as dbExpireWelcomeBonuses,
  listActiveTableSnapshots as dbListActiveTableSnapshots,
  listAdminEvents as dbListAdminEvents,
  listCashLedger as dbListCashLedger,
  listLedger as dbListLedger,
  listTournamentRegistrations as dbListTournamentRegistrations,
  listTournamentStates as dbListTournamentStates,
  listTournamentHistory as dbListTournamentHistory,
  listHandHistories as dbListHandHistories,
  listUsers as dbListUsers,
  listPaymentOrders as dbListPaymentOrders,
  listPendingCryptoPaymentOrders as dbListPendingCryptoPaymentOrders,
  listRatingLeaderboard as dbListRatingLeaderboard,
  listAdminAuditLogs as dbListAdminAuditLogs,
  listRiskFlags as dbListRiskFlags,
  listWithdrawalOrders as dbListWithdrawalOrders,
  markPaymentOrderPaid as dbMarkPaymentOrderPaid,
  recordAnalyticsEvent as dbRecordAnalyticsEvent,
  recordAdminAuditLog as dbRecordAdminAuditLog,
  recordAdminEvent as dbRecordAdminEvent,
  recordDeviceSession as dbRecordDeviceSession,
  recordFundMovement as dbRecordFundMovement,
  recordHandHistory as dbRecordHandHistory,
  recordProfileHandProgress as dbRecordProfileHandProgress,
  recordPlatformLedgerEntry as dbRecordPlatformLedgerEntry,
  recordRiskFlag as dbRecordRiskFlag,
  reviewWithdrawalOrder as dbReviewWithdrawalOrder,
  registerTournament as dbRegisterTournament,
  saveTournamentTables as dbSaveTournamentTables,
  settleTournament as dbSettleTournament,
  updateTournamentState as dbUpdateTournamentState,
  upsertTournamentDefinitions as dbUpsertTournamentDefinitions,
  saveIdempotencyResult as dbSaveIdempotencyResult,
  cancelTournamentRegistration as dbCancelTournamentRegistration,
  setSavedStack as dbSetSavedStack,
  setCashWallet as dbSetCashWallet,
  setWallet as dbSetWallet,
  updatePaymentOrderStatus as dbUpdatePaymentOrderStatus,
  upsertActiveTableSnapshot as dbUpsertActiveTableSnapshot,
  upsertTelegramUser
} from "./db.js";
import {
  deleteTableSnapshot as stateDeleteTableSnapshot,
  getSession as stateGetSession,
  initStateStore,
  listTableSnapshots as stateListTableSnapshots,
  setSession as stateSetSession,
  setTableSnapshot as stateSetTableSnapshot,
  stateStoreEnabled,
  stateStoreHealth,
  updateUserSessions as stateUpdateUserSessions
} from "./state-store.js";
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
  setPlayerFairnessSeed,
  sitIn,
  sitOut,
  startHand,
  testBotAct,
  tickTables
} from "./poker-engine.js";
import {
  TOURNAMENT_STATUSES,
  applyTournamentTransition,
  balancedSeating,
  calculateTournamentPayouts,
  cancellationAllowed,
  createTournamentRuntime,
  currentBlindLevel,
  registrationAllowed,
  schedulerDecision,
  seatTournamentPlayers
} from "./tournament-engine.js";

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
const ADMIN_OWNER_IDS = parseIdList(process.env.ADMIN_OWNER_IDS || process.env.ADMIN_USER_IDS || ADMIN_CHAT_ID);
const ADMIN_FINANCE_IDS = parseIdList(process.env.ADMIN_FINANCE_IDS || "");
const ADMIN_SUPPORT_IDS = parseIdList(process.env.ADMIN_SUPPORT_IDS || "");
const ADMIN_RISK_IDS = parseIdList(process.env.ADMIN_RISK_IDS || "");
const ADMIN_WEB_SECRET = process.env.ADMIN_WEB_SECRET || "";
const ADMIN_WEB_USER_ID = "web-admin";
const ADMIN_GRANT_MAX_CHIPS = Number(process.env.ADMIN_GRANT_MAX_CHIPS || 500000);
const METRICS_TOKEN = process.env.METRICS_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const CRYPTO_WEBHOOK_SECRET = process.env.CRYPTO_WEBHOOK_SECRET || "";
const CRYPTOBOT_API_KEY = process.env.CRYPTOBOT_API_KEY || process.env.CRYPTO_PROVIDER_API_KEY || "";
const CRYPTOBOT_API_BASE = (process.env.CRYPTOBOT_API_BASE || "https://pay.crypt.bot/api").replace(/\/$/, "");
const XROCKET_PAY_API_KEY = process.env.XROCKET_PAY_API_KEY || "";
const XROCKET_PAY_API_BASE = (process.env.XROCKET_PAY_API_BASE || "https://pay.xrocket.tg").replace(/\/$/, "");
const XROCKET_WEBHOOK_SECRET = process.env.XROCKET_WEBHOOK_SECRET || "";
const TELEGRAM_API_BASE = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
const TON_RECEIVER_ADDRESS = process.env.TON_RECEIVER_ADDRESS || "";
const TON_POLLING_ENABLED = process.env.TON_POLLING_ENABLED === "true";
const TONCENTER_API_BASE = (process.env.TONCENTER_API_BASE || "https://toncenter.com/api/v3").replace(/\/$/, "");
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || "";
const TON_POLLING_INTERVAL_MS = Number(process.env.TON_POLLING_INTERVAL_MS || 60 * 1000);
const REAL_MONEY_ENABLED = process.env.REAL_MONEY_ENABLED === "true";
const isProduction = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
const startedAt = Date.now();

validateEnvironment();
initSentry();
registerProcessHandlers();

const tables = new Map();
const sessions = new Map();
const sessionExpirations = new Map();
const userProfiles = new Map();
const savedStacks = new Map();
const wallets = new Map();
const cashWallets = new Map();
const bonusWallets = new Map();
const bonusGrants = new Map();
const bonusLedgerEntries = new Map();
const dailyPlayClaims = new Map();
const memoryWelcomeBonusUsers = new Set();
const memoryBonusWageringEvents = new Set();
const transactions = new Map();
const cashTransactions = new Map();
const fundMovements = new Map();
const starOrders = new Map();
const cryptoOrders = new Map();
const withdrawalOrders = new Map();
const adminEvents = [];
const analyticsEvents = [];
const platformLedgerEntries = [];
const loggedAppOpens = new Set();
const persistedHandIds = new Set();
const recentHandHistories = [];
const idempotencyResults = new Map();
const apiIdempotencyResults = new Map();
const pendingIdempotencyResults = new Map();
const adminAuditLogs = [];
const deviceSessions = new Map();
const riskFlags = [];
const DEFAULT_STACK = 0;
const DEFAULT_WALLET = 0;
const RECONCILIATION_INTERVAL_MS = Number(process.env.RECONCILIATION_INTERVAL_MS || 15 * 60 * 1000);
const RECONCILIATION_DRIFT_ALERT_CHIPS = Number(process.env.RECONCILIATION_DRIFT_ALERT_CHIPS || 1);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_SECONDS || 24 * 60 * 60) * 1000;
const RISK_LARGE_WITHDRAWAL_USDT_MICROS = Math.max(0, Math.round(Number(process.env.RISK_LARGE_WITHDRAWAL_USDT || 1000) * 1_000_000));
const RISK_LARGE_ADMIN_ADJUST_CHIPS = Math.max(0, Math.round(Number(process.env.RISK_LARGE_ADMIN_ADJUST_CHIPS || ADMIN_GRANT_MAX_CHIPS / 2)));
const BONUS_EXPIRY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DAILY_PLAY_CLAIM_COOLDOWN_SECONDS = 24 * 60 * 60;
let lastReconciliationAlertKey = "";
let telegramWebhookDiagnostics = null;
let lastTelegramWebhookAlertKey = "";
let tournamentTickRunning = false;

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
await dbUpsertTournamentDefinitions([...tournaments.values()]);
await initStateStore();
await hydrateActiveTables();
await hydrateTournamentRegistrations();

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`${APP_NAME} running at http://${displayHost}:${PORT}`);
  notifyAdmin("server_start", "Admin logs online", {
    lines: [
      `Сервер: ${isProduction ? "production" : "development"}`,
      `Bot: @${BOT_USERNAME}`,
      `Database: ${databaseEnabled() ? "PostgreSQL" : "memory"}`,
      `State store: ${stateStoreEnabled() ? "Redis" : "memory"}`
    ]
  });
  checkTelegramWebhookConfiguration().catch((error) => {
    reportError(error, { kind: "telegram_webhook_check" });
  });
});

setInterval(async () => {
  try {
    tickTables(tables);
    await tickTournaments();
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
    await checkTelegramWebhookConfiguration();
  } catch (error) {
    reportError(error, { kind: "telegram_webhook_check" });
  }
}, 5 * 60 * 1000);

setInterval(async () => {
  try {
    await pollTonDeposits();
  } catch (error) {
    console.error("TON polling failed:", error.message);
  }
}, TON_POLLING_INTERVAL_MS);

setInterval(async () => {
  try {
    await expireBonuses();
  } catch (error) {
    console.error("Bonus expiry failed:", error.message);
  }
}, BONUS_EXPIRY_INTERVAL_MS);

setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of sessionExpirations.entries()) {
    if (expiresAt > now) continue;
    sessionExpirations.delete(token);
    sessions.delete(token);
  }
}, Math.min(SESSION_TTL_MS, 60 * 1000));

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    const health = await healthSnapshot({ publicView: true });
    sendJson(res, health.ok ? 200 : 503, { health });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/metrics") {
    if (!verifyMetricsAccess(req)) {
      sendJson(res, 403, { error: "Invalid metrics token" });
      return;
    }
    const [health, dbStats] = await Promise.all([
      healthSnapshot(),
      dbDashboardStats()
    ]);
    sendMetrics(res, buildPrometheusMetrics(health, dbStats));
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
    const rawBody = await readRawBody(req);
    const signature = String(req.headers["crypto-pay-api-signature"] || req.headers["rocket-pay-signature"] || "");
    const isCryptoBotWebhook = Boolean(req.headers["crypto-pay-api-signature"]) || rawBody.includes('"update_type":"invoice_paid"') || rawBody.includes('"type":"invoice_paid"');
    const isXRocketWebhook = Boolean(req.headers["rocket-pay-signature"]) || rawBody.includes('"type":"invoicePay"');

    if (isCryptoBotWebhook) {
      if (!verifyCryptoBotWebhookSignature(rawBody, signature, CRYPTOBOT_API_KEY)) {
        sendJson(res, 403, { error: "Invalid crypto webhook signature" });
        return;
      }
      const event = parseCryptoBotInvoiceWebhook(rawBody);
      if (!event) {
        sendJson(res, 400, { error: "Invalid Crypto Bot webhook payload" });
        return;
      }
      await handleCryptoWebhook(event);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (isXRocketWebhook) {
      if (!verifyXRocketWebhookSignature(rawBody, signature, XROCKET_WEBHOOK_SECRET || XROCKET_PAY_API_KEY)) {
        sendJson(res, 403, { error: "Invalid xRocket webhook signature" });
        return;
      }
      const event = parseXRocketInvoiceWebhook(rawBody);
      if (!event) {
        sendJson(res, 400, { error: "Invalid xRocket webhook payload" });
        return;
      }
      await handleCryptoWebhook(event);
      sendJson(res, 200, { ok: true });
      return;
    }

    let event;
    try {
      event = rawBody ? JSON.parse(rawBody) : {};
    } catch (error) {
      sendJson(res, 400, { error: "Invalid crypto webhook payload" });
      return;
    }
    if (!verifyCryptoWebhook(req)) {
      sendJson(res, 403, { error: "Invalid crypto webhook secret" });
      return;
    }
    await handleCryptoWebhook(event);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, {
      appName: APP_NAME,
      botUsername: BOT_USERNAME,
      realMoneyEnabled: REAL_MONEY_ENABLED,
      play: playSettings(),
      cash: cashSettings()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth") {
    const body = await readJson(req);
    if (Object.hasOwn(body, "adminSecret")) {
      const webAdmin = authenticateWebAdmin(body.adminSecret || "");
      if (!webAdmin.ok) {
        sendJson(res, 401, { error: webAdmin.error });
        return;
      }
      const token = randomId("admin_session");
      sessions.set(token, webAdmin.user);
      sessionExpirations.set(token, Date.now() + SESSION_TTL_MS);
      await stateSetSession(token, webAdmin.user);
      await recordDeviceSessionForRequest(req, webAdmin.user, body);
      await recordAdminAudit({
        req,
        admin: webAdmin.user,
        action: "admin_login",
        targetType: "admin_session",
        targetId: token,
        result: "ok",
        meta: { source: "web_admin" }
      });
      sendJson(res, 200, { token, user: webAdmin.user });
      return;
    }

    const auth = authenticateTelegram(body.initData || "");
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }

    const token = randomId("session");
    const user = await normalizeUser(auth.user);
    sessions.set(token, user);
    sessionExpirations.set(token, Date.now() + SESSION_TTL_MS);
    await stateSetSession(token, user);
    await recordDeviceSessionForRequest(req, user, body);
    await trackAnalytics("app_open", {
      user,
      category: "acquisition",
      meta: {
        cashBalanceMicros: user.cashBalanceMicros || 0,
        playBalance: user.balance || 0
      }
    });
    if (!loggedAppOpens.has(user.id)) {
      loggedAppOpens.add(user.id);
      notifyAdmin("open", "Игрок открыл Mini App", {
        user,
        lines: [
          `Play: ${formatNumber(user.balance)} chips`,
          `Cash: ${formatUsdtMicros(user.cashBalanceMicros)} USDT`
        ]
      });
    }
    sendJson(res, 200, { token, user });
    return;
  }

  const user = await requireSession(req);
  if (!user) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tables") {
    sendJson(res, 200, { tables: [...tables.values()].map((table) => publicTable(table, user.id)) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/profile") {
    sendJson(res, 200, { profile: await profileView(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/progression") {
    sendJson(res, 200, { progression: await progressionView(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/play/daily-claim") {
    await sendIdempotentJson(req, res, user, "play_daily_claim", async (idempotencyKey) => {
      const result = await claimDailyPlayReward(user, idempotencyKey);
      const dailyPlayClaim = await dailyPlayClaimView(user);
      if (!result.claimed) {
        return {
          status: 409,
          body: {
            error: "Ежедневные игровые фишки уже получены. Следующая выдача доступна позже.",
            dailyPlayClaim
          }
        };
      }
      return {
        dailyPlayClaim,
        profile: await profileView(user),
        progression: await progressionView(user)
      };
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/cashier") {
    await trackAnalytics("cashier_open", { user, category: "payments" });
    sendJson(res, 200, { cashier: await cashierView(user) });
    return;
  }

  const paymentStatusMatch = url.pathname.match(/^\/api\/cashier\/payment-orders\/([^/]+)$/);
  if (req.method === "GET" && paymentStatusMatch) {
    const order = await paymentOrderFromId(paymentStatusMatch[1]);
    if (!order || String(order.userId) !== String(user.id)) {
      sendJson(res, 404, { error: "Платёж не найден" });
      return;
    }
    sendJson(res, 200, {
      order: cryptoOrderView(order),
      cashier: await cashierView(user)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tournaments") {
    sendJson(res, 200, { tournaments: tournamentListView(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tournaments/history") {
    const history = await dbListTournamentHistory(user.id);
    sendJson(res, 200, { history: history || memoryTournamentHistory(user.id) });
    return;
  }

  const tournamentDetailsMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)$/);
  if (req.method === "GET" && tournamentDetailsMatch) {
    const tournament = tournaments.get(tournamentDetailsMatch[1]);
    if (!tournament) {
      sendJson(res, 404, { error: "Турнир не найден" });
      return;
    }
    sendJson(res, 200, { tournament: tournamentView(tournament, user) });
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

    await sendIdempotentJson(req, res, user, `tournament_${action}:${tournamentId}`, async (idempotencyKey) => {
      if (action === "register") {
        await registerTournament(tournament, user, idempotencyKey);
      } else {
        await cancelTournamentRegistration(tournament, user, idempotencyKey);
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
    if (REAL_MONEY_ENABLED) {
      const error = new Error("Demo-пополнение отключено в режиме реальных средств");
      error.status = 409;
      throw error;
    }
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
    requireRealMoneyEnabled();
    await sendIdempotentJson(req, res, user, "cashier_stars_invoice", async () => {
      await requireTelegramPaymentsReady();
      const body = await readJson(req);
      const quote = quoteCashDeposit({ ...body, method: "stars" });
      const orderId = randomId("stars");
      const payload = `qwz:${orderId}`;
      const order = {
        id: orderId,
        userId: user.id,
        userName: user.name,
        username: user.username,
        provider: "telegram",
        method: "stars",
        asset: "USDT",
        network: "Telegram Stars",
        rubAmount: 0,
        chips: 0,
        stars: quote.stars,
        creditedAsset: quote.creditedAsset,
        cashUsdtMicros: quote.cashUsdtMicros,
        usdtAmount: quote.usdtAmount,
        starsUsdtRate: quote.starsUsdtRate,
        cryptoAmount: quote.cryptoAmount,
        receiverAddress: "",
        confirmationsRequired: 0,
        payload,
        raw: {},
        status: "pending",
        expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      };
      starOrders.set(orderId, order);
      await dbCreatePaymentOrder(order);
      const invoiceLink = await createTelegramStarsInvoiceLink({
        botToken: BOT_TOKEN,
        baseUrl: TELEGRAM_API_BASE,
        title: "QWZ Poker deposit",
        description: `Пополнение ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
        payload,
        stars: quote.stars
      });
      order.invoiceLink = invoiceLink;
      order.invoiceUrl = invoiceLink;
      order.raw = { invoiceUrl: invoiceLink, provider: "telegram" };
      starOrders.set(orderId, order);
      await dbUpdatePaymentOrderStatus(order.id, {
        status: "pending",
        externalId: order.externalId || order.id,
        raw: { invoiceUrl: invoiceLink, provider: "telegram" }
      });
      await trackAnalytics("deposit_order_created", {
        user,
        category: "payments",
        amount: quote.cashUsdtMicros,
        asset: "USDT",
        contextId: order.id,
        meta: { method: "stars", stars: quote.stars }
      });
      return { order: cryptoOrderView(order), cashier: await cashierView(user) };
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cashier/crypto-order") {
    requireRealMoneyEnabled();
    await sendIdempotentJson(req, res, user, "cashier_crypto_order", async () => {
      const body = await readJson(req);
      const quote = quoteCashDeposit(body);
      ensureCryptoPaymentMethodEnabled(quote.method);

      const orderId = randomId(quote.method);
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const payload = `qwz:${orderId}`;
      const order = {
        id: orderId,
        userId: user.id,
        userName: user.name,
        username: user.username,
        provider: quote.provider || quote.method,
        method: quote.method,
        asset: quote.asset,
        network: quote.network,
        rubAmount: 0,
        chips: 0,
        creditedAsset: quote.creditedAsset,
        cashUsdtMicros: quote.cashUsdtMicros,
        usdtAmount: quote.usdtAmount,
        tonUsdtRate: quote.tonUsdtRate,
        starsUsdtRate: quote.starsUsdtRate,
        stars: quote.stars || 0,
        cryptoAmount: quote.cryptoAmount,
        receiverAddress: quote.receiverAddress,
        confirmationsRequired: quote.confirmationsRequired,
        payload,
        raw: {},
        status: "pending",
        expiresAt,
        createdAt: new Date().toISOString()
      };
      cryptoOrders.set(orderId, order);
      await dbCreatePaymentOrder(order);
      await trackAnalytics("deposit_order_created", {
        user,
        category: "payments",
        amount: quote.cashUsdtMicros,
        asset: "USDT",
        contextId: order.id,
        meta: {
          method: quote.method,
          asset: quote.asset,
          network: quote.network,
          cryptoAmount: quote.cryptoAmount,
          stars: quote.stars || 0
        }
      });

      if (quote.method === "stars") {
        const invoiceLink = await createTelegramStarsInvoiceLink({
          botToken: BOT_TOKEN,
          baseUrl: TELEGRAM_API_BASE,
          title: "QWZ Poker deposit",
          description: `Пополнение ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
          payload,
          stars: quote.stars
        });
        order.invoiceLink = invoiceLink;
        order.invoiceUrl = invoiceLink;
        order.raw = { invoiceUrl: invoiceLink, provider: "telegram" };
        starOrders.set(orderId, order);
        notifyAdmin("stars_order", "Создан Stars-счет", {
          user,
          lines: [
            `Зачисление: ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
            `Оплата: ${formatNumber(quote.stars)} Stars`,
            `Order: ${order.id}`
          ]
        });
        return { order: cryptoOrderView(order), cashier: await cashierView(user) };
      }

      if (quote.method === "cryptobot") {
        const result = await createCryptoBotInvoice({
          apiKey: CRYPTOBOT_API_KEY,
          baseUrl: CRYPTOBOT_API_BASE,
          title: "QWZ Poker deposit",
          description: `Пополнение ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
          payload,
          usdtAmount: quote.usdtAmount,
          callbackUrl: APP_PUBLIC_URL || ""
        });
        order.externalId = result.invoiceId || order.externalId;
        order.invoiceUrl = result.link || "";
        order.raw = {
          ...(order.raw || {}),
          invoiceUrl: result.link || "",
          provider: "cryptobot"
        };
        cryptoOrders.set(orderId, order);
        await dbUpdatePaymentOrderStatus(order.id, {
          status: "pending",
          externalId: order.externalId,
          raw: { invoiceUrl: result.link || "", provider: "cryptobot" }
        });
        notifyAdmin("crypto_order", "Создан Crypto Bot счет", {
          user,
          lines: [
            `Метод: Crypto Bot`,
            `Зачисление: ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
            `К оплате: ${quote.usdtAmount} USDT`,
            `Order: ${order.id}`
          ]
        });
        return { order: cryptoOrderView(order), cashier: await cashierView(user) };
      }

      if (quote.method === "xrocket") {
        const result = await createXRocketInvoice({
          apiKey: XROCKET_PAY_API_KEY,
          baseUrl: XROCKET_PAY_API_BASE,
          title: "QWZ Poker deposit",
          description: `Пополнение ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
          payload,
          usdtAmount: quote.usdtAmount,
          callbackUrl: APP_PUBLIC_URL || "",
          platformId: process.env.XROCKET_PLATFORM_ID || ""
        });
        order.externalId = result.invoiceId || order.externalId;
        order.invoiceUrl = result.link || "";
        order.raw = {
          ...(order.raw || {}),
          invoiceUrl: result.link || "",
          provider: "xrocket"
        };
        cryptoOrders.set(orderId, order);
        await dbUpdatePaymentOrderStatus(order.id, {
          status: "pending",
          externalId: order.externalId,
          raw: { invoiceUrl: result.link || "", provider: "xrocket" }
        });
        notifyAdmin("crypto_order", "Создан xRocket счет", {
          user,
          lines: [
            `Метод: xRocket`,
            `Зачисление: ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
            `К оплате: ${quote.usdtAmount} USDT`,
            `Order: ${order.id}`
          ]
        });
        return { order: cryptoOrderView(order), cashier: await cashierView(user) };
      }

      if (quote.method === "ton") {
        notifyAdmin("crypto_order", "Создан crypto-счет", {
          user,
          lines: [
            `Метод: ${quote.asset} ${quote.network}`,
            `Зачисление: ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
            `К оплате: ${quote.cryptoAmount} ${quote.asset}`,
            `Курс: 1 TON = ${quote.tonUsdtRate} USDT`,
            `Order: ${order.id}`
          ]
        });
        return { order: cryptoOrderView(order), cashier: await cashierView(user) };
      }

      notifyAdmin("crypto_order", "Создан crypto-счет", {
        user,
        lines: [
          `Метод: ${quote.asset} ${quote.network}`,
          `Зачисление: ${formatUsdtMicros(quote.cashUsdtMicros)} USDT`,
          `К оплате: ${quote.cryptoAmount} ${quote.asset}`,
          `Курс: 1 TON = ${quote.tonUsdtRate} USDT`,
          `Order: ${order.id}`
        ]
      });
      return { order: cryptoOrderView(order), cashier: await cashierView(user) };
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cashier/withdraw") {
    await sendIdempotentJson(req, res, user, "cashier_withdraw", async (idempotencyKey) => {
      const body = await readJson(req);
      const result = await createWithdrawalRequest(user, body, idempotencyKey);
      await trackAnalytics("withdrawal_requested", {
        user,
        category: "payments",
        amount: Number(result.order?.grossUsdtMicros || result.order?.chips || 0),
        asset: result.order?.asset || "PLAY_CHIPS",
        contextId: result.order?.id || "",
        meta: {
          method: result.order?.method || body.method || "",
          payoutUsdtMicros: result.order?.payoutUsdtMicros || 0,
          feeUsdtMicros: result.order?.feeUsdtMicros || 0
        }
      });
      return { withdrawal: result.order, cashier: await cashierView(user) };
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tables") {
    await sendIdempotentJson(req, res, user, "table_create", async (idempotencyKey) => {
      const body = await readJson(req);
      body.visibility = "private";
      const table = createTable(user, body, { joinOwner: false });
      await prepareInitialStack(user, body, idempotencyKey, table);
      joinTable(table, user);
      tables.set(table.id, table);
      await persistActiveTableSnapshot(table);
      await trackAnalytics("table_join", {
        user,
        category: "gameplay",
        amount: table.seats[0]?.stack || 0,
        asset: table.gameMode === "cash" ? "USDT" : "PLAY_CHIPS",
        contextId: table.id,
        meta: {
          tableName: table.name,
          gameMode: table.gameMode,
          privateTable: true,
          smallBlind: table.smallBlind,
          bigBlind: table.bigBlind
        }
      });
      notifyAdmin("table_create", "Создан приватный стол", {
        user,
        lines: [
          `Стол: ${table.name}`,
          `Блайнды: ${table.smallBlind}/${table.bigBlind}`,
          `Бай-ин: ${formatTableAmount(table, table.seats[0]?.stack || 0)}`
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
      if (table.tournamentId) {
        sendJson(res, 409, { error: "Посадкой за турнирный стол управляет сервер" });
        return;
      }
      await sendIdempotentJson(req, res, user, `table_join:${table.id}`, async (idempotencyKey) => {
        const body = await readJson(req);
        const wasSeated = table.seats.some((seat) => seat.userId === user.id);
        if (!wasSeated) {
          await prepareInitialStack(user, body, idempotencyKey, table);
        }
        joinTable(table, user);
        maybeStartHand(table);
        await persistActiveTableSnapshot(table);
        if (!wasSeated) {
          await trackAnalytics("table_join", {
            user,
            category: "gameplay",
            amount: table.seats.find((seat) => seat.userId === user.id)?.stack || 0,
            asset: table.gameMode === "cash" ? "USDT" : "PLAY_CHIPS",
            contextId: table.id,
            meta: {
              tableName: table.name,
              gameMode: table.gameMode,
              smallBlind: table.smallBlind,
              bigBlind: table.bigBlind,
              players: table.seats.length
            }
          });
          notifyAdmin("table_join", "Игрок сел за стол", {
            user,
            lines: [
              `Стол: ${table.name}`,
              `Блайнды: ${table.smallBlind}/${table.bigBlind}`,
              `Стек: ${formatTableAmount(table, table.seats.find((seat) => seat.userId === user.id)?.stack || 0)}`,
              `Игроков: ${table.seats.length}/${table.maxPlayers}`
            ]
          });
        }
        return { table: tableView(table, user) };
      });
      return;
    }

    if (req.method === "POST" && action === "leave") {
      if (table.tournamentId) {
        sendJson(res, 409, { error: "Покинуть турнирный стол с возвратом стека нельзя" });
        return;
      }
      const departingStack = table.seats.find((seat) => seat.userId === user.id)?.stack || 0;
      const result = leaveTable(table, user);
      await persistCompletedHands(table);
      await settleLeftTableStack(user, table, departingStack || result.stack, { returnToWallet: true });
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
          `${table.gameMode === "cash" ? "Возврат" : "Возврат на баланс"}: ${formatTableAmount(table, result.stack)}`,
          `Баланс: ${formatAvailableBalance(user, table)}`
        ]
      });
      await trackAnalytics("table_leave", {
        user,
        category: "gameplay",
        amount: result.stack || 0,
        asset: table.gameMode === "cash" ? "USDT" : "PLAY_CHIPS",
        contextId: table.id,
        meta: { tableName: table.name, gameMode: table.gameMode, returnToWallet: true }
      });
      sendJson(res, 200, { ok: true, balance: user.balance });
      return;
    }

    if (req.method === "POST" && action === "stand") {
      if (table.tournamentId) {
        sendJson(res, 409, { error: "Встать из-за турнирного стола нельзя" });
        return;
      }
      const departingStack = table.seats.find((seat) => seat.userId === user.id)?.stack || 0;
      const result = leaveTable(table, user);
      await persistCompletedHands(table);
      await settleLeftTableStack(user, table, departingStack || result.stack);
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
          `${table.gameMode === "cash" ? "Возврат" : "Сохраненный стек"}: ${formatTableAmount(table, result.stack)}`,
          `Баланс: ${formatAvailableBalance(user, table)}`
        ]
      });
      await trackAnalytics("table_leave", {
        user,
        category: "gameplay",
        amount: result.stack || 0,
        asset: table.gameMode === "cash" ? "USDT" : "PLAY_CHIPS",
        contextId: table.id,
        meta: { tableName: table.name, gameMode: table.gameMode, standOnly: true }
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
      if (table.tournamentId) {
        sendJson(res, 409, { error: "Re-entry и add-on не входят в MVP турниров" });
        return;
      }
      await sendIdempotentJson(req, res, user, `table_rebuy:${table.id}`, async (idempotencyKey) => {
        const body = await readJson(req);
        const availableBalance = tableWalletBalance(user, table);
        if (availableBalance <= 0) {
          const error = new Error("На общем балансе нет средств для докупки");
          error.status = 409;
          throw error;
        }

        const amount = clamp(Number(body.amount || DEFAULT_STACK), 1, availableBalance);
        const beforeStack = table.seats.find((seat) => seat.userId === user.id)?.stack || 0;
        const afterStack = addBuyIn(table, user, amount);
        const actualAmount = afterStack - beforeStack;
        if (actualAmount > 0) {
          await recordTableTransaction(user, table, {
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
              `Сумма: ${formatTableAmount(table, actualAmount)}`,
              `Стек: ${formatTableAmount(table, afterStack)}`,
              `Баланс: ${formatAvailableBalance(user, table)}`
            ]
          });
          await trackAnalytics("table_rebuy", {
            user,
            category: "gameplay",
            amount: actualAmount,
            asset: table.gameMode === "cash" ? "USDT" : "PLAY_CHIPS",
            contextId: table.id,
            meta: { tableName: table.name, gameMode: table.gameMode }
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

    if (req.method === "POST" && action === "fairness-seed") {
      const body = await readJson(req);
      const fairnessSeed = setPlayerFairnessSeed(table, user, body.seed);
      await persistActiveTableSnapshot(table);
      sendJson(res, 200, { fairnessSeed, table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "act") {
      const body = await readJson(req);
      act(table, user, body);
      await persistCompletedHands(table);
      await persistActiveTableSnapshot(table);
      await trackAnalytics("poker_action", {
        user,
        category: "gameplay",
        amount: Number(body.amount || 0),
        asset: table.gameMode === "cash" ? "USDT" : "PLAY_CHIPS",
        contextId: table.id,
        meta: {
          action: body.action || "",
          tableName: table.name,
          gameMode: table.gameMode,
          handNumber: table.handNumber
        }
      });
      sendJson(res, 200, { table: tableView(table, user) });
      return;
    }

    if (req.method === "POST" && action === "add-test-player") {
      if (table.gameMode === "cash" || table.tournamentId) {
        const error = new Error("Тестовые игроки недоступны за денежным столом");
        error.status = 409;
        throw error;
      }
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
  const withdrawalActionMatch = url.pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/(approve|reject)$/);

  if (req.method === "GET" && url.pathname === "/api/admin") {
    sendJson(res, 200, { admin: await adminDashboardView({ analyticsDays: url.searchParams.get("days") }) });
    return;
  }

  if (req.method === "GET" && userMatch) {
    sendJson(res, 200, { player: await adminPlayerView(userMatch[1]) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/wallet-adjust") {
    requireAdminRole(adminUser.id, "finance");
    const body = await readJson(req);
    const result = await adjustWalletManually({
      admin: adminUser,
      targetId: body.telegramId,
      type: body.type,
      amount: body.amount,
      reason: body.reason,
      requestId: body.requestId || req.headers["x-idempotency-key"] || ""
    });
    await recordAdminAudit({
      req,
      admin: adminUser,
      action: `wallet_${result.type}`,
      targetType: "user",
      targetId: result.targetId,
      result: "ok",
      reason: result.reason,
      meta: {
        amount: result.amount,
        before: result.before,
        balance: result.balance,
        requestId: result.requestId || ""
      }
    });
    sendJson(res, 200, { player: await adminPlayerView(result.targetId), adjustment: result });
    return;
  }

  if (req.method === "POST" && paymentActionMatch) {
    requireAdminRole(adminUser.id, "finance");
    const [, paymentId, action] = paymentActionMatch;
    await sendIdempotentJson(req, res, adminUser, `admin_payment_${action}:${paymentId}`, async () => {
      const body = await readJson(req);
      const result = await handleAdminPaymentAction({
        admin: adminUser,
        paymentId,
        action,
        reason: body.reason || "",
        confirmPaid: body.confirmPaid === true
      });
      await recordAdminAudit({
        req,
        admin: adminUser,
        action: `payment_${action}`,
        targetType: "payment_order",
        targetId: paymentId,
        result: action === "reject" ? "failed" : "ok",
        reason: body.reason || "",
        meta: { status: result.status || "" }
      });
      return { payment: result, admin: await adminDashboardView() };
    });
    return;
  }

  if (req.method === "POST" && withdrawalActionMatch) {
    requireAdminRole(adminUser.id, "finance");
    const [, withdrawalId, action] = withdrawalActionMatch;
    await sendIdempotentJson(req, res, adminUser, `admin_withdrawal_${action}:${withdrawalId}`, async () => {
      const body = await readJson(req);
      const result = await handleAdminWithdrawalAction({
        admin: adminUser,
        withdrawalId,
        action,
        reason: body.reason || ""
      });
      await recordAdminAudit({
        req,
        admin: adminUser,
        action: `withdrawal_${action}`,
        targetType: "withdrawal_order",
        targetId: withdrawalId,
        result: action === "reject" ? "failed" : "ok",
        reason: body.reason || "",
        meta: { status: result.order?.status || result.status || "" }
      });
      return { withdrawal: result.order || result, admin: await adminDashboardView() };
    });
    return;
  }

  sendJson(res, 404, { error: "Admin endpoint not found" });
}

async function adminDashboardView(options = {}) {
  const diagnostics = await healthSnapshot();
  const players = [...new Set([...wallets.keys(), ...userProfiles.keys(), ...transactions.keys()])];
  const dbStats = await dbDashboardStats();
  const analytics = await analyticsDashboard(options.analyticsDays || 7);
  const walletTotal = dbStats ? dbStats.walletTotal : [...wallets.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  const cashWalletTotal = dbStats ? dbStats.cashWalletTotal : [...cashWallets.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  const pendingWithdrawalUsdtTotal = dbStats ? dbStats.pendingWithdrawalUsdtTotal : [...withdrawalOrders.values()]
    .filter((order) => ["pending", "manual_review"].includes(order.status))
    .reduce((sum, order) => sum + Number(order.grossUsdtMicros || 0), 0);
  const lockedUsdtTotal = dbStats ? dbStats.lockedUsdtTotal : pendingWithdrawalUsdtTotal;
  const tableStacks = activeTableStackTotals();
  const tableStackTotal = tableStacks.play;
  const cashTableStackTotal = tableStacks.cash;
  const savedStackTotal = dbStats ? dbStats.savedStackTotal : [...savedStacks.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  const tournamentEscrowTotal = tournamentEscrow();
  const tournamentPrizePoolTotal = tournamentPrizePool();
  const tournamentFeeReserveTotal = tournamentFeeReserve();
  const cashTournamentEscrowMicros = tournamentEscrow("cash");
  const cashTournamentPrizePoolMicros = tournamentPrizePool("cash");
  const cashTournamentFeeReserveMicros = tournamentFeeReserve("cash");
  const rakeCollectedTotal = [...tables.values()].reduce((sum, table) => sum + Number(table.rakeCollected || 0), 0);
  const ledgerCreditTotal = dbStats ? dbStats.ledgerCreditTotal : memoryLedgerTotal("credit");
  const ledgerDebitTotal = dbStats ? dbStats.ledgerDebitTotal : memoryLedgerTotal("debit");
  const cashLedgerCreditTotal = dbStats ? dbStats.cashLedgerCreditTotal : memoryCashLedgerTotal("credit");
  const cashLedgerDebitTotal = dbStats ? dbStats.cashLedgerDebitTotal : memoryCashLedgerTotal("debit");
  const paidStarsChipsTotal = dbStats ? dbStats.paidStarsChipsTotal : [...starOrders.values()]
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + Number(order.creditedAsset === "USDT" ? order.cashUsdtMicros : order.chips || 0), 0);
  const depositStarsLedgerTotal = dbStats ? dbStats.depositStarsLedgerTotal : memoryLedgerCategoryTotal("credit", "deposit_stars");
  const playerFundsTotal = walletTotal + tableStackTotal + savedStackTotal + tournamentEscrowTotal;
  const reconciliation = buildReconciliationAudit({
    walletTotal,
    ledgerCreditTotal,
    ledgerDebitTotal,
    cashWalletTotal,
    cashLedgerCreditTotal,
    cashLedgerDebitTotal,
    paidStarsChipsTotal,
    depositStarsLedgerTotal
  });
  const paidStars = [...starOrders.values()].filter((order) => order.status === "paid");
  const pendingStars = [...starOrders.values()].filter((order) => order.status === "pending");
  const recentPayments = await dbListPaymentOrders(30);
  const recentWithdrawals = await dbListWithdrawalOrders(30);
  const recentEvents = await dbListAdminEvents(20);
  const recentAdminAudit = await dbListAdminAuditLogs(50);
  const recentRiskFlags = await dbListRiskFlags(50);
  const recentHands = await dbListHandHistories(20);
  const recentUsers = await adminUsersList(100);
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
      cashTournamentEscrowMicros,
      cashTournamentPrizePoolMicros,
      cashTournamentFeeReserveMicros,
      rakeCollectedTotal,
      playerFundsTotal,
      ledgerCreditTotal,
      ledgerDebitTotal,
      ledgerNetTotal: ledgerCreditTotal - ledgerDebitTotal,
      cashLedgerCreditTotal,
      cashLedgerDebitTotal,
      cashLedgerNetTotal: cashLedgerCreditTotal - cashLedgerDebitTotal,
      platformLedgerCreditTotal: dbStats ? dbStats.platformLedgerCreditTotal : memoryPlatformLedgerTotal("credit"),
      platformLedgerDebitTotal: dbStats ? dbStats.platformLedgerDebitTotal : memoryPlatformLedgerTotal("debit"),
      platformLedgerNetTotal: dbStats
        ? dbStats.platformLedgerCreditTotal - dbStats.platformLedgerDebitTotal
        : memoryPlatformLedgerTotal("credit") - memoryPlatformLedgerTotal("debit"),
      playPlatformLedgerCreditTotal: dbStats ? dbStats.playPlatformLedgerCreditTotal : memoryPlatformLedgerTotal("credit", "play"),
      playPlatformLedgerDebitTotal: dbStats ? dbStats.playPlatformLedgerDebitTotal : memoryPlatformLedgerTotal("debit", "play"),
      cashPlatformLedgerCreditTotal: dbStats ? dbStats.cashPlatformLedgerCreditTotal : memoryPlatformLedgerTotal("credit", "cash"),
      cashPlatformLedgerDebitTotal: dbStats ? dbStats.cashPlatformLedgerDebitTotal : memoryPlatformLedgerTotal("debit", "cash"),
      cashWalletTotal,
      cashTableStackTotal,
      lockedUsdtTotal,
      approvedWithdrawalFeeUsdtTotal: dbStats ? dbStats.approvedWithdrawalFeeUsdtTotal : [...withdrawalOrders.values()]
        .filter((order) => order.status === "approved")
        .reduce((sum, order) => sum + Number(order.feeUsdtMicros || 0), 0),
      approvedWithdrawalPayoutUsdtTotal: dbStats ? dbStats.approvedWithdrawalPayoutUsdtTotal : [...withdrawalOrders.values()]
        .filter((order) => order.status === "approved")
        .reduce((sum, order) => sum + Number(order.payoutUsdtMicros || 0), 0),
      paidStarsChipsTotal,
      depositStarsLedgerTotal,
      idempotencyKeyCount: dbStats ? dbStats.idempotencyKeyCount : apiIdempotencyResults.size,
      handHistoryCount: dbStats ? dbStats.handHistoryCount : memoryHandHistoryCount,
      handHistoryRakeTotal: dbStats ? dbStats.handHistoryRakeTotal : memoryHandHistoryRakeTotal,
      activeTableSnapshotCount: dbStats ? dbStats.activeTableSnapshotCount : 0,
      bankrollTotal: playerFundsTotal,
      paidStars: dbStats ? dbStats.paidStars : paidStars.length,
      pendingStars: dbStats ? dbStats.pendingStars : pendingStars.length,
      pendingWithdrawals: dbStats ? dbStats.pendingWithdrawals : [...withdrawalOrders.values()].filter((order) => ["pending", "manual_review"].includes(order.status)).length,
      pendingWithdrawalChipsTotal: dbStats ? dbStats.pendingWithdrawalChipsTotal : [...withdrawalOrders.values()]
        .filter((order) => ["pending", "manual_review"].includes(order.status))
        .reduce((sum, order) => sum + Number(order.chips || 0), 0),
      pendingWithdrawalUsdtTotal,
      analyticsEvents: dbStats ? dbStats.analyticsEventCount : analytics.totalEvents
    },
    analytics,
    adminRoles: adminRoleSummary(),
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
      cashWalletTotal,
      cashTableStackTotal,
      lockedUsdtTotal,
      cashLedgerCreditTotal,
      cashLedgerDebitTotal,
      cashLedgerNetTotal: cashLedgerCreditTotal - cashLedgerDebitTotal,
      reconciliation,
      notes: [
        "playerFundsTotal = wallets + active table stacks + saved stacks + tournament escrow",
        "walletLedgerDrift must stay at 0: play walletTotal should match play ledger credits minus debits",
        "cashWalletLedgerDrift must stay at 0: cash wallet should match cash ledger credits minus debits",
        "starsDepositDrift must stay at 0: paid Stars orders should match deposit_stars ledger credits"
      ]
    },
    recentFundMovements: recentFundMovements(20),
    recentUsers,
    recentHands: recentHands || recentHandHistories.slice(0, 20),
    recentPayments: recentPayments || [...starOrders.values(), ...cryptoOrders.values()]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 30),
    recentWithdrawals: recentWithdrawals || [...withdrawalOrders.values()]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 30),
    recentEvents: recentEvents || adminEvents.slice(0, 20),
    recentAdminAudit: recentAdminAudit || adminAuditLogs.slice(0, 50),
    recentRiskFlags: recentRiskFlags || riskFlags.slice(0, 50)
  };
}

async function trackAnalytics(eventName, options = {}) {
  const event = {
    id: randomId("analytics"),
    name: eventName,
    category: options.category || "product",
    userId: options.user?.id || options.userId || "",
    provider: options.provider || "telegram",
    sessionId: options.sessionId || "",
    source: options.source || "server",
    amount: Number(options.amount || 0),
    asset: options.asset || "",
    contextId: options.contextId || "",
    meta: options.meta || {},
    createdAt: new Date().toISOString()
  };
  analyticsEvents.unshift(event);
  analyticsEvents.splice(1000);
  try {
    await dbRecordAnalyticsEvent(event);
  } catch (error) {
    console.error("Analytics event failed:", error.message);
  }
}

async function recordPlatformLedger(entry = {}) {
  const amount = Math.max(0, Math.round(Number(entry.amount || 0)));
  if (amount <= 0) return null;
  const idempotencyKey = String(entry.idempotencyKey || "");
  if (idempotencyKey && platformLedgerEntries.some((item) => item.idempotencyKey === idempotencyKey)) {
    return { idempotentReplay: true };
  }
  const normalized = {
    id: entry.id || randomId("platform"),
    type: entry.type === "debit" ? "debit" : "credit",
    category: normalizeLedgerCategory(entry.category || "platform"),
    title: entry.title || "Platform ledger entry",
    amount,
    contextId: entry.contextId || "",
    meta: entry.meta || "",
    asset: entry.asset || ASSETS.PLAY,
    balanceBucket: entry.balanceBucket === "cash" ? "cash" : "play",
    idempotencyKey,
    createdAt: new Date().toISOString()
  };
  platformLedgerEntries.unshift(normalized);
  platformLedgerEntries.splice(500);
  try {
    await dbRecordPlatformLedgerEntry(normalized);
  } catch (error) {
    console.error("Platform ledger failed:", error.message);
  }
  return normalized;
}

async function analyticsDashboard(days = 7) {
  const dbAnalytics = await dbAnalyticsOverview(days);
  if (dbAnalytics) return dbAnalytics;
  const cutoff = Date.now() - Math.max(1, Number(days || 7)) * 24 * 60 * 60 * 1000;
  const events = analyticsEvents.filter((event) => new Date(event.createdAt).getTime() >= cutoff);
  const now = Date.now();
  const byName = new Map();
  const usersByEvent = new Map();
  const uniqueUsers = new Set();
  const addUser = (name, userId) => {
    if (!userId) return;
    uniqueUsers.add(userId);
    if (!usersByEvent.has(name)) usersByEvent.set(name, new Set());
    usersByEvent.get(name).add(userId);
  };
  for (const event of events) {
    const current = byName.get(event.name) || { name: event.name, category: event.category, count: 0, amount: 0 };
    current.count += 1;
    current.amount += Number(event.amount || 0);
    byName.set(event.name, current);
    addUser(event.name, event.userId);
  }
  const count = (name) => byName.get(name)?.count || 0;
  const amount = (name) => byName.get(name)?.amount || 0;
  const userCount = (name) => usersByEvent.get(name)?.size || 0;
  const appOpenUsers = userCount("app_open");
  const cashierUsers = userCount("cashier_open");
  const depositOrderUsers = userCount("deposit_order_created");
  const tableJoinUsers = userCount("table_join");
  const activeUsersSince = (ms) => new Set(analyticsEvents
    .filter((event) => event.name === "app_open" && event.userId && new Date(event.createdAt).getTime() >= now - ms)
    .map((event) => event.userId)).size;
  const firstPaidByUser = new Map();
  for (const event of analyticsEvents) {
    if (event.name !== "deposit_paid" || !event.userId) continue;
    const at = new Date(event.createdAt).getTime();
    const current = firstPaidByUser.get(event.userId);
    if (!current || at < current) firstPaidByUser.set(event.userId, at);
  }
  const firstDepositUsers = [...firstPaidByUser.values()].filter((at) => at >= cutoff).length;
  return {
    days: Number(days || 7),
    totalEvents: events.length,
    uniqueUsers: uniqueUsers.size,
    dau: activeUsersSince(24 * 60 * 60 * 1000),
    wau: activeUsersSince(7 * 24 * 60 * 60 * 1000),
    mau: activeUsersSince(30 * 24 * 60 * 60 * 1000),
    firstDepositUsers,
    appOpens: count("app_open"),
    appOpenUsers,
    cashierOpens: count("cashier_open"),
    cashierUsers,
    depositOrders: count("deposit_order_created"),
    depositOrderUsers,
    paidDeposits: count("deposit_paid"),
    payingUsers: userCount("deposit_paid"),
    paidDepositAmount: amount("deposit_paid"),
    withdrawalRequests: count("withdrawal_requested"),
    withdrawalAmount: amount("withdrawal_requested"),
    withdrawalApproved: count("withdrawal_approved"),
    withdrawalRejected: count("withdrawal_rejected"),
    withdrawalApprovedAmount: amount("withdrawal_approved"),
    withdrawalRejectedAmount: amount("withdrawal_rejected"),
    tableJoins: count("table_join"),
    tableJoinUsers,
    tableLeaves: count("table_leave"),
    pokerActions: count("poker_action"),
    handsCompleted: count("hand_completed"),
    rakeAmount: amount("hand_completed"),
    tournamentRegisters: count("tournament_register"),
    tournamentCancels: count("tournament_cancel"),
    conversion: {
      openToCashier: metricRatio(cashierUsers, appOpenUsers),
      cashierToOrder: metricRatio(depositOrderUsers, cashierUsers),
      orderToPaid: metricRatio(userCount("deposit_paid"), depositOrderUsers),
      openToTable: metricRatio(tableJoinUsers, appOpenUsers)
    },
    daily: [],
    events: [...byName.values()].map((event) => ({
      ...event,
      users: userCount(event.name)
    })).sort((a, b) => b.count - a.count).slice(0, 30)
  };
}

async function adminUsersList(limit = 100) {
  const tableStacks = activeTableStacksByUser();
  const dbUsers = await dbListUsers(limit);
  if (dbUsers) {
    return dbUsers.map((user) => enrichAdminUserListItem(user, tableStacks));
  }

  const ids = [...new Set([
    ...userProfiles.keys(),
    ...wallets.keys(),
    ...cashWallets.keys(),
    ...savedStacks.keys(),
    ...transactions.keys(),
    ...cashTransactions.keys()
  ])].slice(0, limit);

  return ids.map((id) => enrichAdminUserListItem({
    id,
    name: userProfiles.get(id)?.name || "unknown",
    username: userProfiles.get(id)?.username || "",
    photoUrl: userProfiles.get(id)?.photoUrl || "",
    balance: getWalletLocal(id),
    cashBalanceMicros: getCashWalletLocal(id),
    savedStack: savedStacks.get(id) || 0,
    ledgerCount: (transactions.get(id)?.length || 0) + (cashTransactions.get(id)?.length || 0),
    updatedAt: new Date().toISOString()
  }, tableStacks));
}

function activeTableStacksByUser() {
  const stacks = new Map();
  for (const table of tables.values()) {
    if (table.tournamentId) continue;
    for (const seat of table.seats) {
      const userId = String(seat.user?.id || seat.userId || "");
      if (!userId) continue;
      stacks.set(userId, (stacks.get(userId) || 0) + Number(seat.stack || 0));
    }
  }
  return stacks;
}

function activeTableStackTotals() {
  return [...tables.values()].reduce((result, table) => {
    if (table.tournamentId) return result;
    const stack = table.seats.reduce((sum, seat) => sum + Number(seat.stack || 0), 0);
    if (table.gameMode === "cash") {
      result.cash += stack;
    } else {
      result.play += stack;
    }
    return result;
  }, { play: 0, cash: 0 });
}

function enrichAdminUserListItem(user, tableStacks) {
  const tableStack = Number(tableStacks.get(String(user.id)) || 0);
  return {
    ...user,
    tableStack,
    totalBankroll: Number(user.balance || 0) + Number(user.savedStack || 0) + tableStack,
    displayName: user.username ? `@${user.username}` : user.name || user.id
  };
}

function tournamentEscrow(bucket = "play") {
  return [...tournaments.values()].reduce((sum, tournament) => (
    sum + (tournament.balanceBucket === bucket && ![TOURNAMENT_STATUSES.FINISHED, TOURNAMENT_STATUSES.CANCELLED].includes(tournament.status)
      ? tournament.registrations.size * Number(tournament.buyIn || 0)
      : 0)
  ), 0);
}

function tournamentPrizePool(bucket = "play") {
  return [...tournaments.values()].reduce((sum, tournament) => (
    sum + (tournament.balanceBucket === bucket && ![TOURNAMENT_STATUSES.FINISHED, TOURNAMENT_STATUSES.CANCELLED].includes(tournament.status)
      ? tournament.registrations.size * Number(tournament.buyIn || 0)
      : 0)
  ), 0);
}

function tournamentFeeReserve(bucket = "play") {
  return [...tournaments.values()].reduce((sum, tournament) => (
    sum + (tournament.balanceBucket === bucket && ![TOURNAMENT_STATUSES.FINISHED, TOURNAMENT_STATUSES.CANCELLED].includes(tournament.status)
      ? tournament.registrations.size * Number(tournament.fee || 0)
      : 0)
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

function memoryCashLedgerTotal(type) {
  return [...cashTransactions.values()].reduce((sum, history) => (
    sum + history
      .filter((entry) => entry.type === type)
      .reduce((entrySum, entry) => entrySum + Number(entry.amount || 0), 0)
  ), 0);
}

function memoryPlatformLedgerTotal(type, bucket = null) {
  return platformLedgerEntries
    .filter((entry) => entry.type === type && (!bucket || (entry.balanceBucket || "play") === bucket))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

function buildReconciliationAudit({
  walletTotal,
  ledgerCreditTotal,
  ledgerDebitTotal,
  cashWalletTotal = 0,
  cashLedgerCreditTotal = 0,
  cashLedgerDebitTotal = 0,
  paidStarsChipsTotal,
  depositStarsLedgerTotal
}) {
  const ledgerNetTotal = Number(ledgerCreditTotal || 0) - Number(ledgerDebitTotal || 0);
  const cashLedgerNetTotal = Number(cashLedgerCreditTotal || 0) - Number(cashLedgerDebitTotal || 0);
  const walletLedgerDrift = Number(walletTotal || 0) - ledgerNetTotal;
  const cashWalletLedgerDrift = Number(cashWalletTotal || 0) - cashLedgerNetTotal;
  const starsDepositDrift = Number(paidStarsChipsTotal || 0) - Number(depositStarsLedgerTotal || 0);
  const maxDrift = Math.max(Math.abs(walletLedgerDrift), Math.abs(cashWalletLedgerDrift), Math.abs(starsDepositDrift));
  return {
    ok: maxDrift < RECONCILIATION_DRIFT_ALERT_CHIPS,
    walletLedgerDrift,
    cashWalletLedgerDrift,
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
    reconciliation.cashWalletLedgerDrift,
    reconciliation.starsDepositDrift
  ].join(":");
  if (alertKey === lastReconciliationAlertKey) return reconciliation;
  lastReconciliationAlertKey = alertKey;

  notifyAdmin("reconciliation_alert", "Ошибка сверки балансов", {
    lines: [
      `Причина проверки: ${reason}`,
      `Wallet/Ledger drift: ${formatNumber(reconciliation.walletLedgerDrift)} chips`,
      `Cash/Ledger drift: ${formatUsdtMicros(reconciliation.cashWalletLedgerDrift || 0)} USDT`,
      `Stars paid/Ledger drift: ${formatNumber(reconciliation.starsDepositDrift)} chips`,
      `Wallet total: ${formatNumber(dashboard.stats.walletTotal)} chips`,
      `Ledger net: ${formatNumber(dashboard.stats.ledgerNetTotal)} chips`,
      `Cash wallet total: ${formatUsdtMicros(dashboard.stats.cashWalletTotal || 0)} USDT`,
      `Cash ledger net: ${formatUsdtMicros(dashboard.stats.cashLedgerNetTotal || 0)} USDT`,
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
  const stateStore = await stateStoreHealth();
  const tableStatuses = [...tables.values()].reduce((result, table) => {
    result[table.status] = (result[table.status] || 0) + 1;
    return result;
  }, {});
  const activeTables = [...tables.values()].filter((table) => table.seats.length > 0).length;
  const tournamentRegistrations = [...tournaments.values()].reduce((sum, tournament) => sum + tournament.registrations.size, 0);
  const memory = process.memoryUsage();
  const uptimeSeconds = Math.round((Date.now() - startedAt) / 1000);

  const health = {
    ok: Boolean(database.ok && stateStore.ok),
    appName: APP_NAME,
    environment: isProduction ? "production" : "development",
    uptimeSeconds,
    startedAt: new Date(startedAt).toISOString(),
    now: new Date().toISOString(),
    database,
    stateStore,
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
    health.telegramWebhook = telegramWebhookDiagnostics;
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
      const progressUserIds = Array.isArray(hand.seats)
        ? hand.seats.map((seat) => seat.userId).filter(Boolean)
        : [];
      if (progressUserIds.length) {
        updateMemoryProfileProgress(progressUserIds, table.gameMode, hand, table);
        await dbRecordProfileHandProgress({
          providerUserIds: progressUserIds,
          gameMode: table.gameMode,
          handId: hand.id,
          hand,
          table
        });
        if (table.gameMode === "cash" && Number(hand.rake || 0) > 0) {
          const rakeShare = Math.floor(Number(hand.rake || 0) / progressUserIds.length);
          const dbUnlocks = await dbApplyBonusWagering({
            providerUserIds: progressUserIds,
            rakeAmountMicros: rakeShare,
            handId: hand.id
          });
          const unlocks = dbUnlocks ?? applyMemoryBonusWagering(progressUserIds, rakeShare, hand.id);
          for (const unlock of unlocks) notifyBonusUnlocked(unlock);
        }
      }
      await trackAnalytics("hand_completed", {
        category: "gameplay",
        amount: Number(hand.rake || 0),
        asset: table.gameMode === "cash" ? "USDT" : "PLAY_CHIPS",
        contextId: hand.id,
        meta: {
          tableId: table.id,
          tableName: table.name,
          gameMode: table.gameMode,
          handNumber: hand.handNumber,
          smallBlind: table.smallBlind,
          bigBlind: table.bigBlind,
          players: Array.isArray(hand.seats) ? hand.seats.length : 0,
          potTotal: Array.isArray(hand.pots) ? hand.pots.reduce((sum, pot) => sum + Number(pot.amount || 0), 0) : 0
        }
      });
      if (Number(hand.rake || 0) > 0) {
        await recordPlatformLedger({
          type: "credit",
          category: "rake_cash",
          title: "Cash game rake",
          amount: hand.rake,
          contextId: hand.id,
          meta: `${table.name} · ${table.smallBlind}/${table.bigBlind} · hand #${hand.handNumber}`,
          idempotencyKey: `rake:${hand.id}`,
          asset: table.gameMode === "cash" ? "USDT" : "PLAY_CHIPS",
          balanceBucket: table.gameMode === "cash" ? "cash" : "play"
        });
      }
      persistedHandIds.add(key);
    } catch (error) {
      console.error("Hand history persist failed:", error.message);
    }
  }
}

async function hydrateActiveTables() {
  const redisSnapshots = await stateListTableSnapshots();
  const snapshots = redisSnapshots?.length ? redisSnapshots : await dbListActiveTableSnapshots();
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

  await reconcileSystemPublicTables();
  console.log(`Restored ${tables.size} table snapshot${tables.size === 1 ? "" : "s"} from ${redisSnapshots?.length ? "Redis" : "PostgreSQL"}`);
}

function normalizeHydratedTable(table, now = Date.now()) {
  if (!table || typeof table !== "object") return null;

  table.seats = Array.isArray(table.seats) ? table.seats : [];
  table.communityCards = Array.isArray(table.communityCards) ? table.communityCards : [];
  table.actionLog = Array.isArray(table.actionLog) ? table.actionLog : [];
  table.handHistory = Array.isArray(table.handHistory) ? table.handHistory : [];
  table.departedContributions = Array.isArray(table.departedContributions) ? table.departedContributions : [];
  table.runoutQueue = Array.isArray(table.runoutQueue) ? table.runoutQueue : [];
  table.deck = Array.isArray(table.deck) ? table.deck : [];
  table.status = table.status || "waiting";
  table.gameMode = table.gameMode === "cash" ? "cash" : "play";
  table.currency = table.gameMode === "cash" ? ASSETS.CASH : ASSETS.PLAY;
  table.minBuyIn = Math.max(table.bigBlind || 1, Number(table.minBuyIn || table.bigBlind * (table.gameMode === "cash" ? 40 : 50)));
  table.maxBuyIn = Math.max(table.minBuyIn, Number(table.maxBuyIn || table.bigBlind * (table.gameMode === "cash" ? 100 : 400)));
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
    seat.fairnessSeed = seat.fairnessSeed && typeof seat.fairnessSeed === "object" ? seat.fairnessSeed : null;
  }
  for (const departed of table.departedContributions) {
    departed.cards = Array.isArray(departed.cards) ? departed.cards : [];
    departed.stack = Math.max(0, Math.round(Number(departed.stack) || 0));
    departed.totalBet = Math.max(0, Math.round(Number(departed.totalBet) || 0));
    departed.handStartStack = Math.max(0, Math.round(Number(departed.handStartStack) || departed.stack || 0));
    departed.folded = true;
  }

  return table;
}

async function persistActiveTableSnapshots() {
  for (const table of tables.values()) {
    await persistActiveTableSnapshot(table);
  }
}

async function persistActiveTableSnapshot(table) {
  try {
    await Promise.all([
      stateSetTableSnapshot(table),
      dbUpsertActiveTableSnapshot(table)
    ]);
  } catch (error) {
    console.error("Active table snapshot persist failed:", error.message);
    reportError(error, { kind: "active_table_snapshot", tableId: table.id });
  }
}

async function deleteActiveTableSnapshot(tableId) {
  try {
    await Promise.all([
      stateDeleteTableSnapshot(tableId),
      dbDeleteActiveTableSnapshot(tableId)
    ]);
  } catch (error) {
    console.error("Active table snapshot delete failed:", error.message);
    reportError(error, { kind: "active_table_delete", tableId });
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

function authenticateWebAdmin(secret) {
  if (!ADMIN_WEB_SECRET) return { ok: false, error: "ADMIN_WEB_SECRET is not configured" };
  if (String(secret || "") !== ADMIN_WEB_SECRET) return { ok: false, error: "Invalid admin secret" };
  return {
    ok: true,
    user: {
      id: ADMIN_WEB_USER_ID,
      name: "Admin",
      username: "admin",
      photoUrl: "",
      balance: 0,
      cashBalanceMicros: 0,
      isWebAdmin: true
    }
  };
}

async function normalizeUser(user) {
  const id = String(user.id);
  const normalized = {
    id,
    name: user.first_name || user.username || "Player",
    username: user.username || "",
    photoUrl: user.photo_url || "",
    balance: 0,
    cashBalanceMicros: 0,
    profile: defaultPlayerProfile()
  };
  await upsertTelegramUser(normalized);
  normalized.balance = await getWallet(id);
  normalized.cashBalanceMicros = await getCashWallet(id);
  normalized.profile = await getProfileForUser(normalized);
  userProfiles.set(id, normalized);
  return normalized;
}

async function profileView(user) {
  await refreshUserWallets(user);
  const profile = await getProfileForUser(user);
  const tournamentHistory = await dbListTournamentHistory(user.id) || memoryTournamentHistory(user.id);
  const bonus = await bonusSummary(user);
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
        gameMode: table.gameMode || "play",
        currency: table.currency || ASSETS.PLAY,
        tournamentId: table.tournamentId || null,
        sittingOut: seat.sittingOut,
        sitOutNextHand: seat.sitOutNextHand
      };
    })
    .filter(Boolean);
  const tableStack = activeTables.filter((table) => table.gameMode !== "cash" && !table.tournamentId).reduce((sum, table) => sum + table.stack, 0);
  const cashTableStackMicros = activeTables.filter((table) => table.gameMode === "cash" && !table.tournamentId).reduce((sum, table) => sum + table.stack, 0);

  return {
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      photoUrl: user.photoUrl || ""
    },
    balance: user.balance,
    playBalance: user.balance,
    cashBalanceMicros: user.cashBalanceMicros,
    bonusBalanceMicros: bonus.bonusBalanceMicros,
    activeBonuses: bonus.grants,
    dailyPlayClaim: await dailyPlayClaimView(user),
    savedStack: await getSavedStack(user),
    tableStack,
    cashTableStackMicros,
    activeTables,
    activeTableCount: activeTables.length,
    handsPlayed: profile.handsPlayed || 0,
    tournamentHistory,
    profile
  };
}

async function getProfileForUser(user) {
  const dbProfile = await dbGetPlayerProfile(user.id);
  if (dbProfile) {
    user.profile = dbProfile;
    return dbProfile;
  }
  user.profile = user.profile || defaultPlayerProfile();
  return user.profile;
}

async function progressionView(user) {
  const profile = await getProfileForUser(user);
  const seasonId = activeRatingSeasonId();
  const dbLeaderboard = await dbListRatingLeaderboard({ seasonId, limit: 50 });
  return {
    profile,
    dailyPlayClaim: await dailyPlayClaimView(user),
    rating: {
      seasonId,
      mode: "rating",
      currency: ASSETS.PLAY,
      startingRp: RATING.seasonStartingRp,
      minRp: RATING.minRp,
      maxHandDelta: RATING.maxHandDelta,
      minActiveHandsForLeaderboard: RATING.minActiveHandsForLeaderboard,
      minActiveDaysForLeaderboard: RATING.minActiveDaysForLeaderboard,
      leagues: RATING.leagues,
      leaderboard: dbLeaderboard || memoryRatingLeaderboard(50)
    },
    cashClub: {
      mode: "cash",
      currency: ASSETS.CASH,
      pointsRule: "points are earned from contributed rake and fees, not from deposits",
      statuses: cashClubStatusesView(),
      current: {
        id: profile.cashClubId,
        title: profile.cashClubStatus,
        points: profile.cashClubPoints,
        rakeContributed: profile.cashRakeContributed,
        rakebackPercent: profile.cashRakebackPercent,
        nextStatus: profile.cashClubNextStatus,
        progress: profile.cashXpProgress
      }
    },
    tournaments: {
      mode: "scheduled",
      stats: {
        entries: profile.tournamentEntries,
        itm: profile.tournamentItm,
        finalTables: profile.tournamentFinalTables,
        wins: profile.tournamentWins,
        feesPaid: profile.tournamentFeesPaid,
        playFeesPaid: profile.tournamentPlayFeesPaid,
        cashFeesPaidMicros: profile.tournamentCashFeesPaidMicros,
        prizeWon: profile.tournamentPrizeWon,
        playPrizeWon: profile.tournamentPlayPrizeWon,
        cashPrizeWonMicros: profile.tournamentCashPrizeWonMicros
      }
    },
    sitAndGo: {
      mode: "sit_and_go",
      status: "planned",
      stats: {
        played: profile.sngPlayed,
        wins: profile.sngWins,
        feesPaid: profile.sngFeesPaid,
        playFeesPaid: profile.sngPlayFeesPaid,
        cashFeesPaidMicros: profile.sngCashFeesPaidMicros,
        prizeWon: profile.sngPrizeWon,
        playPrizeWon: profile.sngPlayPrizeWon,
        cashPrizeWonMicros: profile.sngCashPrizeWonMicros
      }
    }
  };
}

async function dailyPlayClaimView(user, now = Date.now()) {
  const dbState = await dbGetDailyPlayClaim(user.id);
  const claimedAtValue = dbState ? dbState.claimedAt : dailyPlayClaims.get(String(user.id)) || null;
  const claimedAtMs = claimedAtValue ? new Date(claimedAtValue).getTime() : 0;
  const availableAtMs = claimedAtMs
    ? claimedAtMs + DAILY_PLAY_CLAIM_COOLDOWN_SECONDS * 1000
    : now;
  const cooldownSeconds = claimedAtMs
    ? Math.max(0, Math.ceil((availableAtMs - now) / 1000))
    : 0;
  return {
    canClaim: cooldownSeconds === 0,
    claimedAt: claimedAtMs ? new Date(claimedAtMs).toISOString() : null,
    availableAt: new Date(availableAtMs).toISOString(),
    cooldownSeconds,
    amount: ECONOMY.play.dailyRefillChips
  };
}

async function claimDailyPlayReward(user, idempotencyKey = "") {
  const dbResult = await dbClaimDailyPlayChips(user.id, {
    amount: ECONOMY.play.dailyRefillChips,
    cooldownSeconds: DAILY_PLAY_CLAIM_COOLDOWN_SECONDS,
    idempotencyKey
  });
  if (dbResult) {
    setWalletBalanceLocal(user.id, dbResult.balance);
    if (dbResult.claimedAt) dailyPlayClaims.set(String(user.id), new Date(dbResult.claimedAt).toISOString());
    return dbResult;
  }

  const userId = String(user.id);
  const now = Date.now();
  const claimedAtValue = dailyPlayClaims.get(userId) || null;
  const claimedAtMs = claimedAtValue ? new Date(claimedAtValue).getTime() : 0;
  if (claimedAtMs && claimedAtMs + DAILY_PLAY_CLAIM_COOLDOWN_SECONDS * 1000 > now) {
    return { claimed: false, claimedAt: claimedAtValue, balance: await getWallet(userId), cooldown: true };
  }

  const balance = await recordTransaction(user, {
    type: "credit",
    category: "daily_play_claim",
    title: "Ежедневные игровые фишки",
    amount: ECONOMY.play.dailyRefillChips,
    meta: "24h rating play claim",
    idempotencyKey
  });
  const claimedAt = new Date(now).toISOString();
  dailyPlayClaims.set(userId, claimedAt);
  return { claimed: true, claimedAt, balance };
}

function cashClubStatusesView() {
  return CASH_CLUB.statuses.map((status) => ({
    id: status.id,
    title: status.title,
    min: status.min,
    rakebackPercent: status.rakebackPercent
  }));
}

function memoryRatingLeaderboard(limit = 50) {
  const rows = [...userProfiles.entries()]
    .map(([id, user]) => {
      const profile = user.profile || defaultPlayerProfile();
      return {
        id,
        name: user.name || "Player",
        username: user.username || "",
        photoUrl: user.photoUrl || "",
        ratingPoints: Number(profile.ratingPoints || RATING.seasonStartingRp),
        ratingPeakPoints: Number(profile.ratingPeakPoints || RATING.seasonStartingRp),
        ratingTier: profile.ratingTier || ratingLeague(profile.ratingPoints).title,
        ratingHandsPlayed: Number(profile.ratingHandsPlayed || 0),
        ratingActiveDays: Number(profile.ratingActiveDays || 0),
        updatedAt: new Date().toISOString()
      };
    })
    .filter((row) => row.ratingHandsPlayed > 0)
    .sort((a, b) => b.ratingPoints - a.ratingPoints || b.ratingHandsPlayed - a.ratingHandsPlayed)
    .slice(0, limit);
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    eligible: row.ratingHandsPlayed >= RATING.minActiveHandsForLeaderboard
      && row.ratingActiveDays >= RATING.minActiveDaysForLeaderboard
  }));
}

function defaultPlayerProfile() {
  const clubStatus = cashClubStatus(0);
  const clubProgress = cashClubProgress(0);
  const league = ratingLeague(RATING.seasonStartingRp);
  return {
    cashLevel: 1,
    cashXp: 0,
    cashClubPoints: 0,
    cashRakeContributed: 0,
    cashStatus: clubStatus.title,
    cashClubStatus: clubStatus.title,
    cashClubId: clubStatus.id,
    cashRakebackPercent: clubStatus.rakebackPercent,
    cashXpCurrent: clubProgress.current,
    cashXpRequired: clubProgress.required,
    cashXpProgress: clubProgress.progress,
    cashClubNextStatus: clubProgress.nextStatus?.title || "",
    ratingPoints: RATING.seasonStartingRp,
    ratingTier: league.title,
    ratingLeague: league.title,
    ratingLeagueId: league.id,
    ratingPeakPoints: RATING.seasonStartingRp,
    ratingSeasonId: activeRatingSeasonId(),
    ratingActiveDays: 0,
    handsPlayed: 0,
    cashHandsPlayed: 0,
    ratingHandsPlayed: 0,
    tournamentsPlayed: 0,
    tournamentEntries: 0,
    tournamentItm: 0,
    tournamentFinalTables: 0,
    tournamentWins: 0,
    tournamentFeesPaid: 0,
    tournamentCashFeesPaidMicros: 0,
    tournamentPlayFeesPaid: 0,
    tournamentPrizeWon: 0,
    tournamentCashPrizeWonMicros: 0,
    tournamentPlayPrizeWon: 0,
    sngPlayed: 0,
    sngWins: 0,
    sngFeesPaid: 0,
    sngCashFeesPaidMicros: 0,
    sngPlayFeesPaid: 0,
    sngPrizeWon: 0,
    sngCashPrizeWonMicros: 0,
    sngPlayPrizeWon: 0
  };
}

function updateMemoryProfileProgress(userIds, gameMode, hand = null, table = null) {
  const cashMode = gameMode === "cash";
  const ratingEligible = !cashMode && !Boolean(table?.isPrivate) && gameMode !== "private";
  const handSeats = Array.isArray(hand?.seats) ? hand.seats : [];
  const seatByUserId = new Map(handSeats.map((seat) => [String(seat.userId || ""), seat]));
  const activePlayers = handSeats.filter((seat) => seat.userId).length;
  const rakeShare = cashMode && activePlayers > 0 ? Math.floor(Number(hand?.rake || 0) / activePlayers) : 0;
  for (const id of [...new Set(userIds.map(String).filter(Boolean))]) {
    const profileUser = userProfiles.get(id);
    if (!profileUser) continue;
    const profile = profileUser.profile || defaultPlayerProfile();
    profile.handsPlayed += 1;
    if (cashMode) {
      profile.cashHandsPlayed += 1;
      const clubPointsDelta = cashClubPointsFromRake(rakeShare);
      profile.cashClubPoints = Number(profile.cashClubPoints ?? profile.cashXp ?? 0) + clubPointsDelta;
      profile.cashXp = profile.cashClubPoints;
      profile.cashRakeContributed = Number(profile.cashRakeContributed || 0) + rakeShare;
      const status = cashClubStatus(profile.cashClubPoints);
      const progress = cashClubProgress(profile.cashClubPoints);
      profile.cashLevel = memoryCashLevel(profile.cashClubPoints);
      profile.cashStatus = status.title;
      profile.cashClubStatus = status.title;
      profile.cashClubId = status.id;
      profile.cashRakebackPercent = status.rakebackPercent;
      profile.cashXpCurrent = progress.current;
      profile.cashXpRequired = progress.required;
      profile.cashXpProgress = progress.progress;
      profile.cashClubNextStatus = progress.nextStatus?.title || "";
    } else if (ratingEligible) {
      profile.ratingHandsPlayed += 1;
      const seatResult = seatByUserId.get(id) || {};
      const delta = ratingDeltaForHand({
        profit: Number(seatResult.profit || 0),
        bigBlind: Number(table?.bigBlind || 0),
        isPrivate: Boolean(table?.isPrivate),
        activePlayers
      });
      profile.ratingPoints = nextRatingPoints(profile.ratingPoints, delta);
      profile.ratingPeakPoints = Math.max(Number(profile.ratingPeakPoints || 0), profile.ratingPoints);
      profile.ratingSeasonId = activeRatingSeasonId();
      const league = ratingLeague(profile.ratingPoints);
      profile.ratingTier = league.title;
      profile.ratingLeague = league.title;
      profile.ratingLeagueId = league.id;
    }
    profileUser.profile = profile;
  }
}

function activeRatingSeasonId() {
  const now = new Date();
  return `rating-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function memoryCashLevel(xp) {
  const value = Math.max(0, Number(xp || 0));
  if (value >= 6000) return 8;
  if (value >= 4000) return 7;
  if (value >= 2600) return 6;
  if (value >= 1600) return 5;
  if (value >= 900) return 4;
  if (value >= 400) return 3;
  if (value >= 120) return 2;
  return 1;
}

function memoryCashProgress(xp, level = memoryCashLevel(xp)) {
  const thresholds = [0, 120, 400, 900, 1600, 2600, 4000, 6000, 8500];
  const currentLevel = Math.max(1, Math.min(thresholds.length - 1, Number(level || 1)));
  const start = thresholds[currentLevel - 1] || 0;
  const next = thresholds[currentLevel] || start + 3000;
  const current = Math.max(0, Number(xp || 0) - start);
  const required = Math.max(1, next - start);
  return {
    cashXpCurrent: current,
    cashXpRequired: required,
    cashXpProgress: Math.max(0, Math.min(1, Number((current / required).toFixed(4))))
  };
}

function memoryCashStatus(level) {
  const value = Number(level || 1);
  if (value >= 8) return "High Roller";
  if (value >= 6) return "Regular";
  if (value >= 4) return "Grinder";
  if (value >= 2) return "Игрок";
  return "Новичок";
}

function memoryRatingTier(points) {
  const value = Number(points || 0);
  if (value >= 5000) return "Legend";
  if (value >= 2500) return "Diamond";
  if (value >= 1200) return "Platinum";
  if (value >= 600) return "Gold";
  if (value >= 250) return "Silver";
  if (value >= 50) return "Bronze";
  return "Unranked";
}

async function bonusSummary(user) {
  const dbSummary = await dbGetBonusSummary(user.id);
  if (dbSummary) return dbSummary;
  return {
    bonusBalanceMicros: Number(bonusWallets.get(user.id) || 0),
    grants: (bonusGrants.get(user.id) || [])
      .filter((grant) => grant.status === "active")
      .map((grant) => ({ ...grant }))
  };
}

async function awardWelcomeBonus(order, completed) {
  let grant = completed?.bonusGrant || null;
  if (!completed) {
    if (memoryWelcomeBonusUsers.has(order.userId)) return null;
    const quote = quoteWelcomeBonus(order.cashUsdtMicros);
    if (quote.bonusAmountMicros <= 0) return null;
    memoryWelcomeBonusUsers.add(order.userId);
    grant = {
      id: `bonus_welcome_${order.userId}`,
      type: "welcome",
      status: "active",
      bonusAmountMicros: quote.bonusAmountMicros,
      wageringRequiredMicros: quote.wageringRequiredMicros,
      wageringPaidMicros: 0,
      sourceId: order.id,
      expiresAt: new Date(Date.now() + quote.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    };
    const grants = bonusGrants.get(order.userId) || [];
    grants.push(grant);
    bonusGrants.set(order.userId, grants);
    const nextBonusBalance = Number(bonusWallets.get(order.userId) || 0) + grant.bonusAmountMicros;
    bonusWallets.set(order.userId, nextBonusBalance);
    addMemoryBonusLedger(order.userId, {
      type: "credit",
      category: "bonus_credit",
      title: "Welcome Bonus",
      amount: grant.bonusAmountMicros,
      balanceAfter: nextBonusBalance,
      grantId: grant.id
    });
  }
  if (!grant) return null;
  await sendBotMessage(order.userId, [
    `Вам начислен Welcome Bonus ${formatCash(grant.bonusAmountMicros)}.`,
    `Сыграйте ${formatCash(grant.wageringRequiredMicros)} рейка за 30 дней, чтобы перевести бонус на основной баланс.`
  ].join("\n"));
  return grant;
}

function applyMemoryBonusWagering(userIds, rakeAmountMicros, handId) {
  const rake = Math.max(0, Math.round(Number(rakeAmountMicros) || 0));
  if (rake <= 0) return [];
  const unlocked = [];
  for (const userId of [...new Set(userIds.map(String).filter(Boolean))]) {
    const grants = bonusGrants.get(userId) || [];
    for (const grant of grants) {
      if (grant.status !== "active" || new Date(grant.expiresAt).getTime() <= Date.now()) continue;
      const eventKey = `${grant.id}:${handId}`;
      if (memoryBonusWageringEvents.has(eventKey)) continue;
      memoryBonusWageringEvents.add(eventKey);
      const progress = advanceWelcomeBonusWagering({
        paidMicros: grant.wageringPaidMicros,
        requiredMicros: grant.wageringRequiredMicros,
        rakeMicros: rake
      });
      grant.wageringPaidMicros = progress.wageringPaidMicros;
      if (!progress.completed) continue;
      const bonusBefore = Number(bonusWallets.get(userId) || 0);
      if (bonusBefore < grant.bonusAmountMicros) throw new Error(`Bonus wallet invariant failed for grant ${grant.id}`);
      const bonusAfter = bonusBefore - grant.bonusAmountMicros;
      const cashAfter = getCashWalletLocal(userId) + grant.bonusAmountMicros;
      bonusWallets.set(userId, bonusAfter);
      setCashWalletBalanceLocal(userId, cashAfter);
      grant.status = "completed";
      grant.completedAt = new Date().toISOString();
      addMemoryBonusLedger(userId, {
        type: "debit",
        category: "bonus_unlock",
        title: "Welcome Bonus unlocked",
        amount: grant.bonusAmountMicros,
        balanceAfter: bonusAfter,
        grantId: grant.id
      });
      const history = cashTransactions.get(userId) || [];
      history.unshift({
        id: randomId("tx"),
        type: "credit",
        category: "bonus_unlock",
        title: "Welcome Bonus unlocked",
        amount: grant.bonusAmountMicros,
        asset: ASSETS.CASH,
        balanceBucket: BALANCE_BUCKETS.CASH,
        meta: `grant ${grant.id}`,
        createdAt: new Date().toISOString()
      });
      cashTransactions.set(userId, history.slice(0, 30));
      unlocked.push({
        grantId: grant.id,
        providerUserId: userId,
        bonusAmountMicros: grant.bonusAmountMicros,
        cashBalanceMicros: cashAfter
      });
    }
  }
  return unlocked;
}

async function expireBonuses() {
  const dbExpired = await dbExpireWelcomeBonuses();
  const expired = dbExpired ?? await expireMemoryBonuses();
  for (const grant of expired) {
    await sendBotMessage(grant.providerUserId, `Ваш Welcome Bonus ${formatCash(grant.bonusAmountMicros)} истёк.`);
  }
  return expired;
}

async function expireMemoryBonuses(now = Date.now()) {
  const expired = [];
  for (const [userId, grants] of bonusGrants) {
    for (const grant of grants) {
      if (grant.status !== "active" || new Date(grant.expiresAt).getTime() > now) continue;
      const bonusBefore = Number(bonusWallets.get(userId) || 0);
      const amount = Math.min(bonusBefore, grant.bonusAmountMicros);
      const bonusAfter = bonusBefore - amount;
      bonusWallets.set(userId, bonusAfter);
      grant.status = "expired";
      grant.expiredAt = new Date(now).toISOString();
      addMemoryBonusLedger(userId, {
        type: "debit",
        category: "bonus_expired",
        title: "Welcome Bonus expired",
        amount,
        balanceAfter: bonusAfter,
        grantId: grant.id
      });
      if (amount > 0) {
        await recordPlatformLedger({
          type: "credit",
          category: "bonus_expired",
          title: "Expired Welcome Bonus",
          amount,
          contextId: grant.id,
          meta: `user ${userId}`,
          idempotencyKey: `bonus:${grant.id}:expired:platform`,
          asset: "USDT",
          balanceBucket: "cash"
        });
      }
      expired.push({ grantId: grant.id, providerUserId: userId, bonusAmountMicros: amount });
    }
  }
  return expired;
}

function addMemoryBonusLedger(userId, entry) {
  const history = bonusLedgerEntries.get(userId) || [];
  history.unshift({ id: randomId("ledger"), ...entry, asset: "USDT", balanceBucket: "bonus_usdt", createdAt: new Date().toISOString() });
  bonusLedgerEntries.set(userId, history.slice(0, 100));
}

function notifyBonusUnlocked(unlock) {
  setCashWalletBalanceLocal(unlock.providerUserId, unlock.cashBalanceMicros);
  sendBotMessage(
    unlock.providerUserId,
    `Бонус разблокирован! ${formatCash(unlock.bonusAmountMicros)} добавлено на основной счёт.`
  );
}

function formatCash(amountMicros) {
  return `$${formatUsdtMicros(amountMicros)} USDT`;
}

async function cashierView(user) {
  await refreshUserWallets(user);
  const activeTables = userActiveTables(user);
  const playTableStack = activeTables.filter((table) => table.gameMode !== "cash" && !table.tournamentId).reduce((sum, table) => sum + table.stack, 0);
  const cashTableStackMicros = activeTables.filter((table) => table.gameMode === "cash" && !table.tournamentId).reduce((sum, table) => sum + table.stack, 0);
  const cashMode = REAL_MONEY_ENABLED;
  const bonus = await bonusSummary(user);
  const balance = cashMode ? user.cashBalanceMicros : user.balance;
  const tableStack = cashMode ? cashTableStackMicros : playTableStack;
  return {
    balance,
    playBalance: user.balance,
    cashBalanceMicros: user.cashBalanceMicros,
    bonusBalanceMicros: bonus.bonusBalanceMicros,
    activeBonuses: bonus.grants,
    tableStack,
    cashTableStackMicros,
    totalBankroll: balance + tableStack,
    cashTotalBankrollMicros: user.cashBalanceMicros + cashTableStackMicros,
    activeTableCount: activeTables.length,
    currency: cashMode ? ASSETS.CASH : ASSETS.PLAY,
    mode: cashMode ? "cash" : "play",
    realMoneyEnabled: REAL_MONEY_ENABLED,
    deposit: cashMode ? depositSettings({ realMoneyEnabled: REAL_MONEY_ENABLED }) : ECONOMY.play.deposit,
    withdrawals: withdrawalSettings(),
    transactions: cashMode ? await getCashTransactions(user) : await getTransactions(user),
    playTransactions: await getTransactions(user)
  };
}

async function refreshUserWallets(user) {
  const [playBalance, cashBalanceMicros] = await Promise.all([
    getWallet(user.id),
    getCashWallet(user.id)
  ]);
  user.balance = playBalance;
  user.cashBalanceMicros = cashBalanceMicros;
  return user;
}

function userActiveTables(user) {
  return [...tables.values()]
    .map((table) => {
      const seat = table.seats.find((candidate) => candidate.userId === user.id);
      if (!seat) return null;
      return {
        id: table.id,
        name: table.name,
        stack: seat.stack,
        gameMode: table.gameMode || "play",
        currency: table.currency || ASSETS.PLAY,
        tournamentId: table.tournamentId || null
      };
    })
    .filter(Boolean);
}

function seedPublicTables() {
  for (const limit of PLAY_TABLE_LIMITS) {
    for (let index = 1; index <= limit.count; index += 1) {
      const table = createTable(null, {
        name: `QWZ NL ${limit.smallBlind}/${limit.smallBlind * 2} #${index}`,
        maxPlayers: 6,
        smallBlind: limit.smallBlind,
        bigBlind: limit.bigBlind,
        gameMode: "play",
        isSystem: true,
        isPrivate: false
      });
      tables.set(table.id, table);
    }
  }

  if (!REAL_MONEY_ENABLED) return;
  for (const limit of CASH_TABLE_LIMITS) {
    for (let index = 1; index <= limit.count; index += 1) {
      const table = createTable(null, {
        name: `QWZ NL $${formatUsdtMicros(limit.smallBlind)}/$${formatUsdtMicros(limit.bigBlind)} #${index}`,
        maxPlayers: 6,
        smallBlind: limit.smallBlind,
        bigBlind: limit.bigBlind,
        minBuyIn: limit.minBuyIn,
        maxBuyIn: limit.maxBuyIn,
        gameMode: "cash",
        isSystem: true,
        isPrivate: false
      });
      tables.set(table.id, table);
    }
  }
}

async function reconcileSystemPublicTables() {
  const targets = [
    ...PLAY_TABLE_LIMITS.map((limit) => ({ ...limit, gameMode: "play" })),
    ...(REAL_MONEY_ENABLED ? CASH_TABLE_LIMITS.map((limit) => ({ ...limit, gameMode: "cash" })) : [])
  ];
  const targetCounts = new Map(targets.map((limit) => [systemTableKey(limit), Number(limit.count || 0)]));
  const seen = new Map();

  for (const table of [...tables.values()]) {
    if (!table.isSystem || table.isPrivate) continue;
    const key = systemTableKey(table);
    const desiredCount = targetCounts.get(key) || 0;
    const currentCount = seen.get(key) || 0;
    const removable = table.seats.length === 0 && table.status === "waiting";
    if (removable && (desiredCount === 0 || currentCount >= desiredCount)) {
      tables.delete(table.id);
      await Promise.all([
        stateDeleteTableSnapshot(table.id),
        dbDeleteActiveTableSnapshot(table.id)
      ]);
      continue;
    }
    seen.set(key, currentCount + 1);
  }

  for (const limit of targets) {
    const key = systemTableKey(limit);
    const desiredCount = Number(limit.count || 0);
    const currentCount = seen.get(key) || 0;
    for (let index = currentCount + 1; index <= desiredCount; index += 1) {
      const cashMode = limit.gameMode === "cash";
      const table = createTable(null, {
        name: cashMode
          ? `QWZ NL $${formatUsdtMicros(limit.smallBlind)}/$${formatUsdtMicros(limit.bigBlind)} #${index}`
          : `QWZ NL ${limit.smallBlind}/${limit.bigBlind} #${index}`,
        maxPlayers: 6,
        smallBlind: limit.smallBlind,
        bigBlind: limit.bigBlind,
        minBuyIn: limit.minBuyIn,
        maxBuyIn: limit.maxBuyIn,
        gameMode: limit.gameMode,
        isSystem: true,
        isPrivate: false
      });
      tables.set(table.id, table);
      await persistActiveTableSnapshot(table);
    }
  }
}

function systemTableKey(table) {
  return [
    table.gameMode === "cash" ? "cash" : "play",
    Number(table.smallBlind || 0),
    Number(table.bigBlind || 0),
    Number(table.maxPlayers || 6)
  ].join(":");
}

function seedTournaments() {
  const now = Date.now();
  const fastTournamentTest = process.env.NODE_ENV === "test" && process.env.TOURNAMENT_TEST_MODE === "true";
  const entries = [
    {
      id: "sng-25-evening",
      title: "QWZ Sit&Go 25/50",
      type: "sng",
      status: "registration_open",
      balanceBucket: "play",
      buyIn: 5000,
      fee: 250,
      minPlayers: 2,
      maxPlayers: fastTournamentTest ? 2 : 6,
      maxPlayersPerTable: 6,
      startingStack: fastTournamentTest ? 50 : 10_000,
      registrationOpensAt: new Date(now - 60 * 1000).toISOString(),
      startsAt: new Date(now + 30 * 60 * 1000).toISOString(),
      prizePoolMode: "buyins"
    },
    {
      id: "freezeout-daily",
      title: "Daily Freezeout",
      type: "mtt",
      status: "registration_open",
      balanceBucket: "cash",
      buyIn: 1_000_000,
      fee: 100_000,
      minPlayers: 2,
      maxPlayers: 36,
      maxPlayersPerTable: 6,
      startingStack: 10_000,
      registrationOpensAt: new Date(now - 60 * 1000).toISOString(),
      startsAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
      lateRegEndsAt: new Date(now + 3.5 * 60 * 60 * 1000).toISOString(),
      prizePoolMode: "buyins"
    },
    {
      id: "mtt-weekly",
      title: "Weekly MTT",
      type: "mtt",
      status: "created",
      balanceBucket: "cash",
      buyIn: 3_000_000,
      fee: 300_000,
      minPlayers: 6,
      maxPlayers: 72,
      maxPlayersPerTable: 6,
      startingStack: 15_000,
      registrationOpensAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
      startsAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      prizePoolMode: "buyins"
    }
  ];

  return new Map(entries.map((tournament) => [
    tournament.id,
    createTournamentRuntime(tournament, now)
  ]));
}

function tournamentListView(user) {
  return [...tournaments.values()].map((tournament) => tournamentView(tournament, user));
}

async function tickTournaments(now = Date.now()) {
  if (tournamentTickRunning) return;
  tournamentTickRunning = true;
  try {
    for (const tournament of tournaments.values()) {
      const decision = schedulerDecision(tournament, now);
      if (decision === "open_registration") {
        applyTournamentTransition(tournament, decision, now);
        await dbUpdateTournamentState(tournament);
        continue;
      }
      if (decision === "cancel") {
        await cancelTournamentAndRefund(tournament, now);
        continue;
      }
      if (decision === "start") {
        await startTournament(tournament, now);
        continue;
      }
      if (tournament.status === TOURNAMENT_STATUSES.LATE_REGISTRATION
        && tournament.lateRegEndsAt && new Date(tournament.lateRegEndsAt).getTime() <= now) {
        applyTournamentTransition(tournament, "close_late_registration", now);
        await dbUpdateTournamentState(tournament);
      }
      if ([TOURNAMENT_STATUSES.LATE_REGISTRATION, TOURNAMENT_STATUSES.RUNNING, TOURNAMENT_STATUSES.FINAL_TABLE].includes(tournament.status)) {
        await advanceRunningTournament(tournament, now);
      }
    }
  } finally {
    tournamentTickRunning = false;
  }
}

async function startTournament(tournament, now = Date.now()) {
  applyTournamentTransition(tournament, "start", now);
  const seating = seatTournamentPlayers([...tournament.registrations.values()], tournament.maxPlayersPerTable);
  for (const group of seating) createTournamentTable(tournament, group.players, group.index + 1);
  await persistTournamentRuntime(tournament);
}

function createTournamentTable(tournament, players, tableNumber) {
  const level = currentBlindLevel(tournament);
  const table = createTable(null, {
    name: `${tournament.title} · стол ${tableNumber}`,
    maxPlayers: tournament.maxPlayersPerTable,
    smallBlind: level.smallBlind,
    bigBlind: level.bigBlind,
    minBuyIn: tournament.startingStack,
    maxBuyIn: tournament.startingStack,
    gameMode: "play",
    isSystem: true,
    isPrivate: true
  });
  table.tournamentId = tournament.id;
  table.tournamentTableNumber = tableNumber;
  table.ante = level.ante;
  for (const player of players) {
    joinTable(table, {
      id: String(player.userId),
      name: player.name || "Player",
      username: player.username || "",
      photoUrl: player.photoUrl || "",
      stack: Math.max(1, Number(player.stack || tournament.startingStack))
    });
  }
  tables.set(table.id, table);
  tournament.tables.set(table.id, table);
  maybeStartHand(table);
  return table;
}

async function seatLateRegistration(tournament, registration) {
  if (tournament.status !== TOURNAMENT_STATUSES.LATE_REGISTRATION) return;
  const target = [...tournament.tables.values()]
    .filter((table) => table.seats.length < table.maxPlayers)
    .sort((left, right) => left.seats.length - right.seats.length)[0];
  if (target) {
    joinTable(target, { ...registration, id: registration.userId, stack: tournament.startingStack });
    maybeStartHand(target);
  } else {
    createTournamentTable(tournament, [registration], tournament.tables.size + 1);
  }
  await persistTournamentRuntime(tournament);
}

async function advanceRunningTournament(tournament, now) {
  const level = currentBlindLevel(tournament, now);
  if (level.level !== tournament.currentLevel) {
    tournament.currentLevel = level.level;
    for (const table of tournament.tables.values()) {
      table.smallBlind = level.smallBlind;
      table.bigBlind = level.bigBlind;
      table.minRaise = level.bigBlind;
      table.ante = level.ante;
    }
    await dbUpdateTournamentState(tournament);
  }

  const safeToMove = [...tournament.tables.values()].every((table) => ["waiting", "showdown", "starting"].includes(table.status));
  if (!safeToMove) return;
  const busted = [...tournament.tables.values()].flatMap((table) => table.seats
    .filter((seat) => seat.stack <= 0)
    .map((seat) => ({ table, seat })));
  const survivors = activeTournamentPlayers(tournament).length;
  for (const [index, { table, seat }] of busted.entries()) {
    tournament.eliminations.push({
      userId: seat.userId,
      name: seat.name,
      username: seat.username || "",
      place: survivors + busted.length - index,
      eliminatedAt: new Date(now).toISOString()
    });
    leaveTable(table, { id: seat.userId });
  }

  const active = activeTournamentPlayers(tournament);
  if (active.length <= 1 && tournament.registrations.size >= tournament.minPlayers) {
    await finishTournament(tournament, active[0], now);
    return;
  }
  if (!active.length) return;

  const desiredTables = Math.ceil(active.length / tournament.maxPlayersPerTable);
  if (active.length <= tournament.maxPlayersPerTable && tournament.status === TOURNAMENT_STATUSES.RUNNING) {
    applyTournamentTransition(tournament, "final_table", now);
  }
  const sizes = [...tournament.tables.values()].filter((table) => table.seats.length).map((table) => table.seats.length);
  const needsBalance = sizes.length !== desiredTables || (sizes.length > 1 && Math.max(...sizes) - Math.min(...sizes) > 1);
  if (needsBalance || tournament.status === TOURNAMENT_STATUSES.FINAL_TABLE && tournament.tables.size > 1) {
    await rebuildTournamentTables(tournament, active);
  } else {
    await persistTournamentRuntime(tournament);
  }
}

function activeTournamentPlayers(tournament) {
  return [...tournament.tables.values()].flatMap((table) => table.seats)
    .filter((seat) => seat.stack > 0)
    .map((seat) => ({
      userId: seat.userId,
      name: seat.name,
      username: seat.username || "",
      photoUrl: seat.photoUrl || "",
      stack: seat.stack
    }));
}

async function rebuildTournamentTables(tournament, players) {
  for (const table of tournament.tables.values()) {
    tables.delete(table.id);
    await deleteActiveTableSnapshot(table.id);
  }
  tournament.tables.clear();
  const seating = balancedSeating(players, tournament.maxPlayersPerTable);
  seating.forEach((group, index) => createTournamentTable(tournament, group.players, index + 1));
  await persistTournamentRuntime(tournament);
}

async function finishTournament(tournament, winner, now) {
  const rankedPlayers = [
    { ...winner, place: 1 },
    ...[...tournament.eliminations].sort((left, right) => left.place - right.place)
  ];
  const { prizePool, payouts } = calculateTournamentPayouts(tournament, rankedPlayers);
  const payoutKey = `tournament-payout:${tournament.id}`;
  const dbResult = await dbSettleTournament(tournament, rankedPlayers, payouts, payoutKey);
  if (dbResult) {
    for (const payout of payouts) {
      if (tournament.balanceBucket === "cash") {
        setCashWalletBalanceLocal(payout.userId, await getCashWallet(payout.userId));
      } else {
        setWalletBalanceLocal(payout.userId, await getWallet(payout.userId));
      }
      const sessionUser = userProfiles.get(String(payout.userId));
      if (sessionUser) sessionUser.profile = await getProfileForUser(sessionUser);
    }
  } else {
    for (const payout of payouts) {
      const registration = tournament.registrations.get(String(payout.userId));
      if (!registration || payout.amount <= 0) continue;
      const payoutUser = {
        id: String(payout.userId),
        name: registration.name || "Player",
        username: registration.username || "",
        balance: getWalletLocal(String(payout.userId)),
        cashBalanceMicros: getCashWalletLocal(String(payout.userId))
      };
      const record = tournament.balanceBucket === "cash" ? recordCashTransaction : recordTransaction;
      await record(payoutUser, {
        type: "credit",
        category: "tournament_payout",
        title: "Приз турнира",
        amount: payout.amount,
        meta: `${tournament.title} · место ${payout.place}`,
        idempotencyKey: `${payoutKey}:${payout.userId}`
      });
    }
    for (const result of rankedPlayers) {
      applyMemoryTournamentResult({ id: result.userId }, tournament, {
        ...result,
        amount: payouts.find((payout) => String(payout.userId) === String(result.userId))?.amount || 0
      });
    }
  }
  tournament.results = rankedPlayers.map((result) => ({
    ...result,
    prizeAmount: payouts.find((payout) => String(payout.userId) === String(result.userId))?.amount || 0
  }));
  tournament.prizePool = prizePool;
  applyTournamentTransition(tournament, "finish", now);
  for (const table of tournament.tables.values()) {
    tables.delete(table.id);
    await deleteActiveTableSnapshot(table.id);
  }
  tournament.tables.clear();
  await dbUpdateTournamentState(tournament);
}

async function cancelTournamentAndRefund(tournament, now) {
  for (const registration of [...tournament.registrations.values()]) {
    const user = {
      id: String(registration.userId),
      name: registration.name || "Player",
      username: registration.username || "",
      balance: getWalletLocal(String(registration.userId)),
      cashBalanceMicros: getCashWalletLocal(String(registration.userId))
    };
    await cancelTournamentRegistration(tournament, user, `tournament-cancel:${tournament.id}:${user.id}`);
  }
  applyTournamentTransition(tournament, "cancel", now);
  await dbUpdateTournamentState(tournament);
}

async function persistTournamentRuntime(tournament) {
  await dbUpdateTournamentState(tournament);
  await dbSaveTournamentTables(tournament.id, [...tournament.tables.values()].map((table) => ({
    id: table.id,
    tableNumber: table.tournamentTableNumber,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    ante: table.ante || 0,
    seats: table.seats.map((seat) => ({ userId: seat.userId, stack: seat.stack }))
  })));
}

function tournamentPlayerState(tournament, userId) {
  const id = String(userId);
  const result = tournament.results.find((entry) => String(entry.userId) === id);
  if (result) return { status: "finished", place: result.place, prizeAmount: result.prizeAmount || 0 };
  const table = [...tournament.tables.values()].find((candidate) => candidate.seats.some((seat) => String(seat.userId) === id));
  if (table) return { status: "playing", tableId: table.id };
  const eliminated = tournament.eliminations.find((entry) => String(entry.userId) === id);
  if (eliminated) return { status: "eliminated", place: eliminated.place };
  if (tournament.registrations.has(id)) return { status: "registered" };
  return null;
}

function memoryTournamentHistory(userId) {
  return [...tournaments.values()].flatMap((tournament) => tournament.results
    .filter((result) => String(result.userId) === String(userId))
    .map((result) => ({
      tournamentId: tournament.id,
      title: tournament.title,
      type: tournament.type,
      status: tournament.status,
      place: result.place,
      prizeAmount: result.prizeAmount || 0,
      balanceBucket: tournament.balanceBucket,
      finishedAt: tournament.finishedAt
    })));
}

function applyMemoryTournamentResult(user, tournament, payout) {
  const profile = userProfiles.get(String(user.id))?.profile || defaultPlayerProfile();
  profile.tournamentItm += payout.amount > 0 ? 1 : 0;
  profile.tournamentFinalTables += payout.place <= tournament.maxPlayersPerTable ? 1 : 0;
  profile.tournamentWins += payout.place === 1 ? 1 : 0;
  if (tournament.balanceBucket === "cash") {
    profile.tournamentCashPrizeWonMicros += payout.amount;
  } else {
    profile.tournamentPrizeWon += payout.amount;
    profile.tournamentPlayPrizeWon += payout.amount;
  }
  if (tournament.type === "sng") {
    profile.sngPlayed += 1;
    profile.sngWins += payout.place === 1 ? 1 : 0;
    if (tournament.balanceBucket === "cash") profile.sngCashPrizeWonMicros += payout.amount;
    else {
      profile.sngPrizeWon += payout.amount;
      profile.sngPlayPrizeWon += payout.amount;
    }
  }
  const stored = userProfiles.get(String(user.id));
  if (stored) stored.profile = profile;
}

async function hydrateTournamentRegistrations() {
  const tournamentIds = [...tournaments.keys()];
  const [rows, states] = await Promise.all([
    dbListTournamentRegistrations(tournamentIds),
    dbListTournamentStates(tournamentIds)
  ]);
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
  for (const state of states || []) {
    const tournament = tournaments.get(state.id);
    if (!tournament) continue;
    Object.assign(tournament, {
      status: state.status,
      startsAt: state.startsAt,
      registrationOpensAt: state.registrationOpensAt,
      lateRegEndsAt: state.lateRegEndsAt,
      currentLevel: state.currentLevel,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      cancelledAt: state.cancelledAt,
      eliminations: state.eliminations || [],
      results: state.results || []
    });
  }
  for (const table of tables.values()) {
    if (!table.tournamentId) continue;
    tournaments.get(table.tournamentId)?.tables.set(table.id, table);
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
    balanceBucket: tournament.balanceBucket,
    currency: tournament.balanceBucket === "cash" ? "USDT" : "PLAY_CHIPS",
    buyIn: tournament.buyIn,
    fee: tournament.fee,
    totalCost,
    maxPlayers: tournament.maxPlayers,
    participants,
    prizePool,
    startsAt: tournament.startsAt,
    lateRegEndsAt: tournament.lateRegEndsAt,
    structure: tournament.structure,
    currentLevel: tournament.currentLevel,
    currentBlinds: tournament.startedAt ? currentBlindLevel(tournament) : tournament.structure[0],
    playerState: tournamentPlayerState(tournament, user.id),
    results: tournament.results,
    tableIds: [...tournament.tables.keys()],
    registered: tournament.registrations.has(user.id),
    canRegister: registrationAllowed(tournament, user.id),
    canCancel: cancellationAllowed(tournament, user.id)
  };
}

async function registerTournament(tournament, user, idempotencyKey = "") {
  if (!registrationAllowed(tournament, user.id)) {
    const error = new Error("Регистрация на турнир пока закрыта");
    error.status = 409;
    throw error;
  }
  const totalCost = tournament.buyIn + tournament.fee;
  const availableBalance = tournament.balanceBucket === "cash" ? user.cashBalanceMicros : user.balance;
  if (availableBalance < totalCost) {
    const formatted = tournament.balanceBucket === "cash" ? `${formatUsdtMicros(totalCost)} USDT` : `${formatNumber(totalCost)} chips`;
    const error = new Error(`Недостаточно средств для регистрации. Нужно ${formatted}`);
    error.status = 409;
    throw error;
  }

  const registeredAt = new Date().toISOString();
  const dbResult = await dbRegisterTournament(user.id, tournament, "telegram", idempotencyKey);
  if (dbResult) {
    if (tournament.balanceBucket === "cash") {
      user.cashBalanceMicros = setCashWalletBalanceLocal(user.id, dbResult.cashBalanceMicros);
    } else {
      user.balance = setWalletBalanceLocal(user.id, dbResult.balance);
    }
  } else {
    const record = tournament.balanceBucket === "cash" ? recordCashTransaction : recordTransaction;
    const balance = await record(user, {
      type: "debit",
      category: "tournament_buyin",
      title: "Вход в турнир",
      amount: totalCost,
      meta: `${tournament.title} · бай-ин ${formatNumber(tournament.buyIn)} + fee ${formatNumber(tournament.fee)}`,
      idempotencyKey
    });
    if (tournament.balanceBucket === "cash") user.cashBalanceMicros = balance;
    else user.balance = balance;
  }

  tournament.registrations.set(user.id, {
    userId: user.id,
    name: user.name,
    username: user.username,
    registeredAt
  });
  if (tournament.status === TOURNAMENT_STATUSES.LATE_REGISTRATION) {
    await seatLateRegistration(tournament, tournament.registrations.get(user.id));
  }
  applyMemoryTournamentRegistration(user, tournament, "register");
  await recordPlatformLedger({
    type: "credit",
    category: "tournament_fee",
    title: "Комиссия турнира",
    amount: tournament.fee,
    contextId: tournament.id,
    meta: tournament.title,
    idempotencyKey: idempotencyKey ? `fee:${idempotencyKey}` : "",
    asset: tournament.balanceBucket === "cash" ? "USDT" : "PLAY_CHIPS",
    balanceBucket: tournament.balanceBucket
  });
  await recordFundMovement(user, {
    id: idempotencyKey ? `move_buyin_${idempotencyKey}` : undefined,
    category: "wallet_to_tournament_escrow",
    from: tournament.balanceBucket === "cash" ? "cash_wallet" : "play_wallet",
    to: "tournament_escrow",
    amount: tournament.buyIn,
    contextId: tournament.id,
    meta: tournament.title
  });
  await recordFundMovement(user, {
    id: idempotencyKey ? `move_fee_${idempotencyKey}` : undefined,
    category: "wallet_to_tournament_fee",
    from: tournament.balanceBucket === "cash" ? "cash_wallet" : "play_wallet",
    to: "platform_fee",
    amount: tournament.fee,
    contextId: tournament.id,
    meta: tournament.title
  });
  notifyAdmin("tournament_register", "Регистрация в турнир", {
    user,
    lines: [
      `Турнир: ${tournament.title}`,
      `Стоимость: ${tournament.balanceBucket === "cash" ? `${formatUsdtMicros(totalCost)} USDT` : `${formatNumber(totalCost)} chips`}`,
      `Участников: ${tournament.registrations.size}/${tournament.maxPlayers}`,
      `Баланс: ${tournament.balanceBucket === "cash" ? `${formatUsdtMicros(user.cashBalanceMicros)} USDT` : `${formatNumber(user.balance)} chips`}`
    ]
  });
  await trackAnalytics("tournament_register", {
    user,
    category: "tournament",
    amount: totalCost,
    asset: tournament.balanceBucket === "cash" ? "USDT" : "PLAY_CHIPS",
    contextId: tournament.id,
    meta: {
      title: tournament.title,
      buyIn: tournament.buyIn,
      fee: tournament.fee,
      participants: tournament.registrations.size
    }
  });
}

async function cancelTournamentRegistration(tournament, user, idempotencyKey = "") {
  if (!tournament.registrations.has(user.id)) return;
  if (!cancellationAllowed(tournament, user.id)) {
    const error = new Error("Отменить регистрацию уже нельзя");
    error.status = 409;
    throw error;
  }

  const totalCost = tournament.buyIn + tournament.fee;
  const dbResult = await dbCancelTournamentRegistration(user.id, tournament, "telegram", idempotencyKey);
  if (dbResult) {
    if (tournament.balanceBucket === "cash") {
      user.cashBalanceMicros = setCashWalletBalanceLocal(user.id, dbResult.cashBalanceMicros);
    } else {
      user.balance = setWalletBalanceLocal(user.id, dbResult.balance);
    }
  } else {
    const record = tournament.balanceBucket === "cash" ? recordCashTransaction : recordTransaction;
    const balance = await record(user, {
      type: "credit",
      category: "tournament_refund",
      title: "Возврат турнирного бай-ина",
      amount: totalCost,
      meta: tournament.title,
      idempotencyKey
    });
    if (tournament.balanceBucket === "cash") user.cashBalanceMicros = balance;
    else user.balance = balance;
  }
  tournament.registrations.delete(user.id);
  applyMemoryTournamentRegistration(user, tournament, "cancel");
  await recordPlatformLedger({
    type: "debit",
    category: "tournament_fee_refund",
    title: "Возврат комиссии турнира",
    amount: tournament.fee,
    contextId: tournament.id,
    meta: tournament.title,
    idempotencyKey: idempotencyKey ? `fee-refund:${idempotencyKey}` : "",
    asset: tournament.balanceBucket === "cash" ? "USDT" : "PLAY_CHIPS",
    balanceBucket: tournament.balanceBucket
  });
  await recordFundMovement(user, {
    id: idempotencyKey ? `move_buyin_refund_${idempotencyKey}` : undefined,
    category: "tournament_escrow_to_wallet",
    from: "tournament_escrow",
    to: tournament.balanceBucket === "cash" ? "cash_wallet" : "play_wallet",
    amount: tournament.buyIn,
    contextId: tournament.id,
    meta: tournament.title
  });
  await recordFundMovement(user, {
    id: idempotencyKey ? `move_fee_refund_${idempotencyKey}` : undefined,
    category: "tournament_fee_to_wallet",
    from: "platform_fee",
    to: tournament.balanceBucket === "cash" ? "cash_wallet" : "play_wallet",
    amount: tournament.fee,
    contextId: tournament.id,
    meta: tournament.title
  });
  notifyAdmin("tournament_cancel", "Отмена регистрации в турнир", {
    user,
    lines: [
      `Турнир: ${tournament.title}`,
      `Возврат: ${tournament.balanceBucket === "cash" ? `${formatUsdtMicros(totalCost)} USDT` : `${formatNumber(totalCost)} chips`}`,
      `Баланс: ${tournament.balanceBucket === "cash" ? `${formatUsdtMicros(user.cashBalanceMicros)} USDT` : `${formatNumber(user.balance)} chips`}`
    ]
  });
  await trackAnalytics("tournament_cancel", {
    user,
    category: "tournament",
    amount: totalCost,
    asset: tournament.balanceBucket === "cash" ? "USDT" : "PLAY_CHIPS",
    contextId: tournament.id,
    meta: { title: tournament.title }
  });
}

function applyMemoryTournamentRegistration(user, tournament, action) {
  const profileUser = userProfiles.get(String(user.id));
  if (!profileUser) return;
  const profile = profileUser.profile || defaultPlayerProfile();
  const sign = action === "cancel" ? -1 : 1;
  profile.tournamentsPlayed = Math.max(0, Number(profile.tournamentsPlayed || 0) + sign);
  profile.tournamentEntries = Math.max(0, Number(profile.tournamentEntries || 0) + sign);
  if (tournament.balanceBucket === "cash") {
    profile.tournamentCashFeesPaidMicros = Math.max(0, Number(profile.tournamentCashFeesPaidMicros || 0) + sign * Number(tournament.fee || 0));
  } else {
    profile.tournamentFeesPaid = Math.max(0, Number(profile.tournamentFeesPaid || 0) + sign * Number(tournament.fee || 0));
    profile.tournamentPlayFeesPaid = Math.max(0, Number(profile.tournamentPlayFeesPaid || 0) + sign * Number(tournament.fee || 0));
  }
  if (tournament.type === "sit_and_go" || tournament.type === "sng") {
    if (tournament.balanceBucket === "cash") {
      profile.sngCashFeesPaidMicros = Math.max(0, Number(profile.sngCashFeesPaidMicros || 0) + sign * Number(tournament.fee || 0));
    } else {
      profile.sngFeesPaid = Math.max(0, Number(profile.sngFeesPaid || 0) + sign * Number(tournament.fee || 0));
      profile.sngPlayFeesPaid = Math.max(0, Number(profile.sngPlayFeesPaid || 0) + sign * Number(tournament.fee || 0));
    }
  }
  profileUser.profile = profile;
}

async function getSavedStack(user) {
  const dbStack = await dbGetSavedStack(user.id);
  if (dbStack !== null) {
    savedStacks.set(user.id, dbStack);
    return dbStack;
  }
  return savedStacks.get(user.id) || DEFAULT_STACK;
}

async function prepareInitialStack(user, body = {}, idempotencyKey = "", table = null) {
  const requested = Number(body.buyInAmount || 0);
  if (!requested) {
    if (table?.gameMode === "cash") {
      const error = new Error("Выберите сумму бай-ина для денежного стола");
      error.status = 409;
      throw error;
    }
    user.stack = await getSavedStack(user);
    if (user.stack <= 0) {
      const error = new Error("Сначала пополните баланс и выберите бай-ин");
      error.status = 409;
      throw error;
    }
    return;
  }

  const availableBalance = tableWalletBalance(user, table);
  if (availableBalance <= 0) {
    const error = new Error("На общем балансе нет средств для бай-ина");
    error.status = 409;
    throw error;
  }
  const amount = clamp(requested, 1, availableBalance);
  const bigBlind = Number(table?.bigBlind || Number(body.smallBlind || 25) * 2);
  const minimumBuyIn = Math.max(Number(table?.minBuyIn || bigBlind * 50), bigBlind);
  const maximumBuyIn = Math.max(minimumBuyIn, Number(table?.maxBuyIn || bigBlind * 100));
  if (amount < minimumBuyIn) {
    const error = new Error(`Минимальный бай-ин: ${formatTableAmount(table, minimumBuyIn)}`);
    error.status = 409;
    throw error;
  }
  user.stack = Math.min(amount, maximumBuyIn);
  await recordTableTransaction(user, table, {
    type: "debit",
    category: "table_buyin",
    title: "Бай-ин за стол",
    amount: user.stack,
    meta: "Texas NL",
    idempotencyKey
  });
  await recordFundMovement(user, {
    category: "wallet_to_table",
    from: "wallet",
    to: "table",
    amount: user.stack,
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

async function settleLeftTableStack(user, table, stack, options = {}) {
  if (table.gameMode !== "cash") {
    if (options.returnToWallet) {
      await returnPlayTableStackToWallet(user, table, stack);
      return;
    }
    await saveStack(user, stack);
    return;
  }
  if (stack <= 0) return;
  await recordCashTransaction(user, {
    type: "credit",
    category: "table_cashout",
    title: "Возврат со стола",
    amount: stack,
    meta: table.name,
    idempotencyKey: `cashout:${table.id}:${user.id}:${table.handNumber}:${stack}`
  });
  await recordFundMovement(user, {
    category: "table_to_cash_wallet",
    from: "table",
    to: "cash_usdt",
    amount: stack,
    contextId: table.id,
    meta: table.name
  });
}

async function returnPlayTableStackToWallet(user, table, stack) {
  const amount = Math.max(0, Math.round(Number(stack) || 0));
  await saveStack(user, 0);
  if (amount <= 0) return;
  await recordTransaction(user, {
    type: "credit",
    category: "table_cashout",
    title: "Возврат со стола",
    amount,
    meta: table.name,
    idempotencyKey: randomId("play-cashout")
  });
  await recordFundMovement(user, {
    category: "table_to_wallet",
    from: "table",
    to: "wallet",
    amount,
    contextId: table.id,
    meta: table.name
  });
}

async function getWallet(userId) {
  const dbBalance = await dbGetWallet(userId);
  if (dbBalance !== null) return setWalletBalanceLocal(userId, dbBalance);
  if (!wallets.has(userId)) wallets.set(userId, DEFAULT_WALLET);
  return wallets.get(userId);
}

async function getCashWallet(userId) {
  const dbBalance = await dbGetCashWallet(userId);
  if (dbBalance !== null) return setCashWalletBalanceLocal(userId, dbBalance);
  if (!cashWallets.has(userId)) cashWallets.set(userId, 0);
  return cashWallets.get(userId);
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
  stateUpdateUserSessions(id, { balance: normalized }).catch((error) => {
    console.error("Redis session balance update failed:", error.message);
    reportError(error, { kind: "session_balance_update", userId: id });
  });
  return normalized;
}

function setCashWalletBalanceLocal(userId, balance) {
  const id = String(userId);
  const normalized = Math.max(0, Math.round(Number(balance) || 0));
  cashWallets.set(id, normalized);
  for (const sessionUser of sessions.values()) {
    if (sessionUser.id === id) sessionUser.cashBalanceMicros = normalized;
  }
  const profile = userProfiles.get(id);
  if (profile) profile.cashBalanceMicros = normalized;
  stateUpdateUserSessions(id, { cashBalanceMicros: normalized }).catch((error) => {
    reportError(error, { kind: "cash_session_balance_update", userId: id });
  });
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

async function getCashTransactions(user) {
  const dbLedger = await dbListCashLedger(user.id, 30);
  if (dbLedger) {
    cashTransactions.set(user.id, dbLedger);
    return dbLedger;
  }
  if (!cashTransactions.has(user.id)) cashTransactions.set(user.id, []);
  return cashTransactions.get(user.id);
}

async function recordCashTransaction(user, transaction) {
  const dbEntry = await dbAddCashWalletEntry(user.id, transaction);
  if (dbEntry) {
    setCashWalletBalanceLocal(user.id, dbEntry.balance);
    await getCashTransactions(user);
    return dbEntry.balance;
  }
  const nextBalance = setCashWalletBalanceLocal(
    user.id,
    getCashWalletLocal(user.id) + (transaction.type === "debit" ? -transaction.amount : transaction.amount)
  );
  const history = await getCashTransactions(user);
  history.unshift({
    id: randomId("tx"),
    type: transaction.type,
    category: normalizeLedgerCategory(transaction.category),
    title: transaction.title,
    amount: transaction.amount,
    asset: ASSETS.CASH,
    balanceBucket: BALANCE_BUCKETS.CASH,
    meta: transaction.meta || "",
    createdAt: new Date().toISOString()
  });
  cashTransactions.set(user.id, history.slice(0, 30));
  return nextBalance;
}

async function recordFundMovement(user, movement) {
  const normalized = {
    id: movement.id || randomId("move"),
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

function getCashWalletLocal(userId) {
  if (!cashWallets.has(userId)) cashWallets.set(userId, 0);
  return cashWallets.get(userId);
}

function tableWalletBalance(user, table) {
  return table?.gameMode === "cash" ? Number(user.cashBalanceMicros || 0) : Number(user.balance || 0);
}

async function recordTableTransaction(user, table, transaction) {
  if (table?.gameMode === "cash") {
    return recordCashTransaction(user, transaction);
  }
  user.balance = await recordTransaction(user, transaction);
  return user.balance;
}

function formatTableAmount(table, amount) {
  return table?.gameMode === "cash"
    ? `$${formatUsdtMicros(amount)} USDT`
    : `${formatNumber(amount)} chips`;
}

function formatAvailableBalance(user, table) {
  return table?.gameMode === "cash"
    ? `$${formatUsdtMicros(user.cashBalanceMicros)} USDT`
    : `${formatNumber(user.balance)} chips`;
}

function isAdminUser(userId) {
  return adminRolesFor(userId).length > 0;
}

function requireAdminRole(userId, role) {
  if (hasAdminRole(userId, role)) return;
  const error = new Error(`Admin role required: ${role}`);
  error.status = 403;
  throw error;
}

function hasAdminRole(userId, role) {
  const roles = new Set(adminRolesFor(userId));
  if (roles.has("owner")) return true;
  return roles.has(role);
}

function adminRolesFor(userId) {
  const id = String(userId || "");
  const roles = [];
  if (ADMIN_WEB_SECRET && id === ADMIN_WEB_USER_ID) roles.push("owner");
  if (ADMIN_OWNER_IDS.has(id)) roles.push("owner");
  if (ADMIN_USER_IDS.has(id) && !roles.includes("owner")) roles.push("owner");
  if (ADMIN_FINANCE_IDS.has(id)) roles.push("finance");
  if (ADMIN_SUPPORT_IDS.has(id)) roles.push("support");
  if (ADMIN_RISK_IDS.has(id)) roles.push("risk");
  return roles;
}

function adminRoleSummary() {
  return {
    owner: ADMIN_OWNER_IDS.size || ADMIN_USER_IDS.size,
    finance: ADMIN_FINANCE_IDS.size,
    support: ADMIN_SUPPORT_IDS.size,
    risk: ADMIN_RISK_IDS.size
  };
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

function parsePositiveChips(value) {
  const amount = Number(String(value || "").replace(/\s+/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Укажите положительную сумму chips");
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
    meta: `${normalizedReason} · admin ${adminProfile.id}`,
    idempotencyKey
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
  if (normalizedType === "grant" && normalizedAmount >= RISK_LARGE_ADMIN_ADJUST_CHIPS) {
    await recordRiskFlag({
      userId: normalizedTargetId,
      type: "large_admin_grant",
      severity: normalizedAmount >= ADMIN_GRANT_MAX_CHIPS ? "high" : "medium",
      reason: `Large manual grant: ${formatNumber(normalizedAmount)} chips`,
      sourceId: idempotencyKey || `admin-grant:${adminProfile.id}:${normalizedTargetId}:${Date.now()}`,
      meta: {
        adminId: adminProfile.id,
        amount: normalizedAmount,
        reason: normalizedReason
      }
    });
  }
  return result;
}

async function createWithdrawalRequest(user, body = {}, idempotencyKey = "") {
  requireRealMoneyEnabled();
  if (process.env.WITHDRAWALS_ENABLED !== "true") {
    const error = new Error("Вывод временно закрыт");
    error.status = 409;
    throw error;
  }
  const quote = quoteWithdrawal(body);
  const order = {
    id: randomId("wd"),
    userId: user.id,
    userName: user.name,
    username: user.username,
    method: quote.method,
    chips: quote.chips || 0,
    feeChips: quote.feeChips || 0,
    payoutChips: quote.payoutChips || 0,
    grossUsdtMicros: quote.grossUsdtMicros || 0,
    feeUsdtMicros: quote.feeUsdtMicros || 0,
    payoutUsdtMicros: quote.payoutUsdtMicros || 0,
    asset: quote.asset || ASSETS.PLAY,
    balanceBucket: quote.balanceBucket || BALANCE_BUCKETS.PLAY,
    destination: quote.destination,
    status: "pending",
    idempotencyKey,
    createdAt: new Date().toISOString()
  };

  const dbResult = await dbCreateWithdrawalOrder(order);
  if (dbResult?.order) {
    if (order.grossUsdtMicros > 0) {
      setCashWalletBalanceLocal(user.id, dbResult.balance ?? user.cashBalanceMicros);
    } else {
      setWalletBalanceLocal(user.id, dbResult.balance ?? user.balance);
    }
    withdrawalOrders.set(dbResult.order.id, dbResult.order);
    notifyWithdrawalCreated(user, dbResult.order, dbResult.balance ?? (order.grossUsdtMicros > 0 ? user.cashBalanceMicros : user.balance));
    await maybeFlagWithdrawalRisk(user, dbResult.order);
    return { order: dbResult.order, balance: dbResult.balance };
  }

  if (idempotencyKey && idempotencyResults.has(idempotencyKey)) {
    const replay = idempotencyResults.get(idempotencyKey);
    return {
      order: replay.order || replay,
      balance: replay.balance ?? (Number(replay.order?.grossUsdtMicros || replay.grossUsdtMicros || 0) > 0
        ? getCashWalletLocal(user.id)
        : getWalletLocal(user.id)),
      idempotentReplay: true
    };
  }

  const cashMode = Number(quote.grossUsdtMicros || 0) > 0;
  const before = cashMode ? await getCashWallet(user.id) : await getWallet(user.id);
  const holdAmount = cashMode ? quote.grossUsdtMicros : quote.chips;
  if (before < holdAmount) {
    const error = new Error(cashMode ? `Недостаточно USDT. Баланс игрока: ${formatUsdtMicros(before)}` : `Недостаточно chips. Баланс игрока: ${formatNumber(before)}`);
    error.status = 409;
    throw error;
  }
  const transaction = {
    type: "debit",
    category: "withdrawal_hold",
    title: "Заявка на вывод",
    amount: holdAmount,
    meta: cashMode
      ? `${quote.method} · payout ${quote.payoutUsdtMicros} · fee ${quote.feeUsdtMicros} · ${quote.destination}`
      : `${quote.method} · payout ${quote.payoutChips} · fee ${quote.feeChips} · ${quote.destination}`,
    idempotencyKey: `withdrawal:${order.id}:hold`
  };
  const balance = cashMode ? await recordCashTransaction(user, transaction) : await recordTransaction(user, transaction);
  withdrawalOrders.set(order.id, order);
  if (idempotencyKey) idempotencyResults.set(idempotencyKey, { order, balance });
  notifyWithdrawalCreated(user, order, balance);
  await maybeFlagWithdrawalRisk(user, order);
  return { order, balance };
}

async function maybeFlagWithdrawalRisk(user, order) {
  const grossUsdtMicros = Number(order.grossUsdtMicros || 0);
  if (grossUsdtMicros <= 0 || grossUsdtMicros < RISK_LARGE_WITHDRAWAL_USDT_MICROS) return;
  await recordRiskFlag({
    userId: order.userId || user.id,
    type: "large_withdrawal",
    severity: grossUsdtMicros >= RISK_LARGE_WITHDRAWAL_USDT_MICROS * 5 ? "high" : "medium",
    reason: `Large withdrawal request: ${formatUsdtMicros(grossUsdtMicros)} USDT`,
    sourceId: order.id,
    meta: {
      method: order.method,
      destination: order.destination ? hashSensitive(order.destination) : "",
      grossUsdtMicros,
      payoutUsdtMicros: order.payoutUsdtMicros || 0,
      feeUsdtMicros: order.feeUsdtMicros || 0
    }
  });
}

async function handleAdminWithdrawalAction({ admin, withdrawalId, action, reason = "" }) {
  const order = await withdrawalOrderFromId(withdrawalId);
  if (!order) {
    const error = new Error("Заявка на вывод не найдена");
    error.status = 404;
    throw error;
  }
  if (!["pending", "manual_review"].includes(order.status)) {
    const error = new Error(`Заявка уже в статусе ${order.status}`);
    error.status = 409;
    throw error;
  }

  const adminProfile = admin || { id: "system", name: "Admin", username: "" };
  const normalizedReason = String(reason || "").trim() || `manual_${action}`;
  const dbResult = await dbReviewWithdrawalOrder(order.id, {
    action,
    reason: normalizedReason,
    adminId: adminProfile.id
  });
  if (dbResult?.order) {
    withdrawalOrders.set(dbResult.order.id, dbResult.order);
    if (dbResult.balance !== null && dbResult.balance !== undefined) {
      if (Number(dbResult.order.grossUsdtMicros || 0) > 0) {
        setCashWalletBalanceLocal(dbResult.order.userId, dbResult.balance);
      } else {
        setWalletBalanceLocal(dbResult.order.userId, dbResult.balance);
      }
    }
    notifyWithdrawalReviewed(adminProfile, dbResult.order, normalizedReason);
    await trackAnalytics(`withdrawal_${dbResult.order.status}`, {
      userId: dbResult.order.userId,
      category: "payments",
      amount: Number(dbResult.order.grossUsdtMicros || dbResult.order.chips || 0),
      asset: dbResult.order.asset || "PLAY_CHIPS",
      contextId: dbResult.order.id,
      meta: {
        adminId: adminProfile.id,
        reason: normalizedReason,
        payoutUsdtMicros: dbResult.order.payoutUsdtMicros || 0,
        feeUsdtMicros: dbResult.order.feeUsdtMicros || 0
      }
    });
    return dbResult;
  }

  const nextStatus = action === "approve" ? "approved" : "rejected";
  const reviewed = {
    ...order,
    status: nextStatus,
    adminReason: normalizedReason,
    reviewedBy: adminProfile.id,
    reviewedAt: new Date().toISOString()
  };
  withdrawalOrders.set(order.id, reviewed);
  let balance = null;
  if (action === "reject") {
    const cashMode = Number(order.grossUsdtMicros || 0) > 0;
    const refundAmount = cashMode ? order.grossUsdtMicros : order.chips;
    const refund = {
      type: "credit",
      category: "withdrawal_refund",
      title: "Возврат заявки на вывод",
      amount: refundAmount,
      meta: `${normalizedReason} · order ${order.id}`,
      idempotencyKey: `withdrawal:${order.id}:refund`
    };
    balance = cashMode ? await recordCashTransaction({ id: order.userId }, refund) : await recordTransaction({ id: order.userId }, refund);
  } else if (Number(order.grossUsdtMicros || 0) > 0 && Number(order.feeUsdtMicros || 0) > 0) {
    await recordPlatformLedger({
      type: "credit",
      category: "withdrawal_fee",
      title: "Withdrawal hidden fee",
      amount: order.feeUsdtMicros,
      contextId: order.id,
      meta: `${order.method} · gross ${order.grossUsdtMicros} · payout ${order.payoutUsdtMicros}`,
      idempotencyKey: `withdrawal:${order.id}:fee`,
      asset: "USDT",
      balanceBucket: "cash"
    });
  }
  notifyWithdrawalReviewed(adminProfile, reviewed, normalizedReason);
  await trackAnalytics(`withdrawal_${reviewed.status}`, {
    userId: reviewed.userId,
    category: "payments",
    amount: Number(reviewed.grossUsdtMicros || reviewed.chips || 0),
    asset: reviewed.asset || "PLAY_CHIPS",
    contextId: reviewed.id,
    meta: {
      adminId: adminProfile.id,
      reason: normalizedReason,
      payoutUsdtMicros: reviewed.payoutUsdtMicros || 0,
      feeUsdtMicros: reviewed.feeUsdtMicros || 0
    }
  });
  return { order: reviewed, balance };
}

async function withdrawalOrderFromId(orderId) {
  return withdrawalOrders.get(orderId) || await dbGetWithdrawalOrder(orderId);
}

function quoteWithdrawal(body = {}) {
  if (body.usdtAmount !== undefined || body.amountUsdt !== undefined || body.currency === "USDT") {
    return quoteCashWithdrawal({
      usdtAmount: body.usdtAmount ?? body.amountUsdt ?? body.amount,
      method: body.method || "ton",
      destination: body.destination
    });
  }

  const chips = parsePositiveChips(body.chips || body.amount);
  const method = normalizeWithdrawalMethod(body.method || "ton");
  const minimumChips = Math.max(1, Math.round(Number(ECONOMY.withdrawals.minimumChips || 0) || ECONOMY.withdrawals.minimumUsdtMicros / 100));
  if (chips < minimumChips) {
    const error = new Error(`Минимальный вывод: ${formatNumber(minimumChips)} chips`);
    error.status = 400;
    throw error;
  }
  const methodSettings = ECONOMY.withdrawals.methods.find((item) => item.id === method);
  const feeChips = Math.ceil(chips * Number(methodSettings?.feePercent || 0));
  const destination = String(body.destination || "").trim();
  if (destination.length < 4) {
    const error = new Error("Укажите реквизиты/адрес для вывода");
    error.status = 400;
    throw error;
  }
  if (destination.length > 240) {
    const error = new Error("Реквизиты вывода слишком длинные");
    error.status = 400;
    throw error;
  }
  return {
    method,
    chips,
    feeChips,
    payoutChips: Math.max(0, chips - feeChips),
    asset: ASSETS.PLAY,
    balanceBucket: BALANCE_BUCKETS.PLAY,
    destination
  };
}

function normalizeWithdrawalMethod(method) {
  const normalized = normalizeLedgerCategory(method);
  const methodIds = new Set(ECONOMY.withdrawals.methods.map((item) => item.id));
  if (!methodIds.has(normalized)) {
    const error = new Error("Метод вывода не поддерживается");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function withdrawalSettings() {
  return {
    enabled: REAL_MONEY_ENABLED && process.env.WITHDRAWALS_ENABLED === "true",
    minimumUsdtMicros: ECONOMY.withdrawals.minimumUsdtMicros,
    maximumUsdtMicros: ECONOMY.withdrawals.maximumUsdtMicros,
    methods: ECONOMY.withdrawals.methods.map((method) => ({
      ...method,
      feePercent: undefined,
      hiddenSpreadPercent: undefined,
      networkFeeUsdtMicros: undefined,
      enabled: REAL_MONEY_ENABLED && process.env.WITHDRAWALS_ENABLED === "true"
    }))
  };
}

function notifyWithdrawalCreated(user, order, balance) {
  const cashMode = Number(order.grossUsdtMicros || 0) > 0;
  notifyAdmin("withdrawal_request", "Создана заявка на вывод", {
    user,
    lines: [
      `Order: ${order.id}`,
      `Метод: ${order.method}`,
      cashMode ? `Hold: ${formatUsdtMicros(order.grossUsdtMicros)} USDT` : `Hold: ${formatNumber(order.chips)} chips`,
      cashMode ? `Скрытая комиссия: ${formatUsdtMicros(order.feeUsdtMicros)} USDT` : `Комиссия: ${formatNumber(order.feeChips)} chips`,
      cashMode ? `К выплате: ${formatUsdtMicros(order.payoutUsdtMicros)} USDT` : `К выплате: ${formatNumber(order.payoutChips)} chips`,
      cashMode ? `Баланс: ${formatUsdtMicros(balance)} USDT` : `Баланс: ${formatNumber(balance)} chips`
    ]
  });
}

function notifyWithdrawalReviewed(admin, order, reason) {
  const cashMode = Number(order.grossUsdtMicros || 0) > 0;
  notifyAdmin(`withdrawal_${order.status}`, order.status === "approved" ? "Вывод подтвержден" : "Вывод отклонен", {
    user: { id: order.userId, name: order.userName, username: order.username },
    lines: [
      `Админ: ${formatUser(admin)}`,
      `Order: ${order.id}`,
      `Метод: ${order.method}`,
      cashMode ? `Сумма: ${formatUsdtMicros(order.grossUsdtMicros)} USDT` : `Сумма: ${formatNumber(order.chips)} chips`,
      `Статус: ${order.status}`,
      `Причина: ${reason}`
    ]
  });
}

async function handleAdminPaymentAction({ admin, paymentId, action, reason = "", confirmPaid = false }) {
  const order = await paymentOrderFromId(paymentId);
  if (!order) {
    const error = new Error("Платеж не найден");
    error.status = 404;
    throw error;
  }
  if (!["pending", "manual_review"].includes(order.status)) {
    const error = new Error(`Платеж уже в статусе ${order.status}`);
    error.status = 409;
    throw error;
  }

  const adminProfile = admin || { id: "system", name: "Admin", username: "" };
  const normalizedReason = String(reason || "").trim() || `manual_${action}`;
  if (order.method === "stars" && action === "approve" && !confirmPaid) {
    const error = new Error("Для ручного подтверждения Stars требуется проверка Telegram receipt");
    error.status = 409;
    throw error;
  }

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
    balance = await recordCashTransaction({ id: order.userId }, {
      type: "credit",
      category: `deposit_${normalizeLedgerCategory(order.method)}`,
      title: "Пополнение USDT",
      amount: order.cashUsdtMicros,
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
  setCashWalletBalanceLocal(order.userId, balance);
  await awardWelcomeBonus(order, completed);
  await trackAnalytics("deposit_paid", {
    userId: order.userId,
    category: "payments",
    amount: order.cashUsdtMicros,
    asset: "USDT",
    contextId: order.id,
    meta: {
      method: order.method,
      manualApproval: true,
      adminId: adminProfile.id,
      reason: normalizedReason
    }
  });
  notifyAdmin("payment_approved", "Админ подтвердил платеж", {
    user: { id: order.userId, name: order.userName, username: order.username },
    lines: [
      `Админ: ${formatUser(adminProfile)}`,
      `Order: ${order.id}`,
      `Метод: ${order.method}`,
      `Сумма: ${formatUsdtMicros(order.cashUsdtMicros)} USDT`,
      `Баланс: ${formatUsdtMicros(balance)} USDT`,
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
    balance = await recordCashTransaction({ id: order.userId }, {
      type: "credit",
      category: "deposit_stars",
      title: "Пополнение Stars",
      amount: order.cashUsdtMicros,
      meta: `${order.stars} Stars · ${formatUsdtMicros(order.cashUsdtMicros)} USDT`,
      idempotencyKey: paymentKey
    });
    idempotencyResults.set(paymentKey, { balance });
    await dbMarkPaymentOrderPaid(order.id, payment);
  }

  order.status = "paid";
  order.paidAt = new Date().toISOString();
  order.telegramPaymentChargeId = payment.telegram_payment_charge_id || "";
  starOrders.set(order.id, order);
  setCashWalletBalanceLocal(order.userId, balance);
  await awardWelcomeBonus(order, completed);
  await trackAnalytics("deposit_paid", {
    userId: order.userId,
    category: "payments",
    amount: order.cashUsdtMicros,
    asset: "USDT",
    contextId: order.id,
    meta: {
      method: "stars",
      stars: order.stars,
      telegramPaymentChargeId: order.telegramPaymentChargeId || ""
    }
  });
  notifyAdmin("stars_paid", "Оплачено Stars-пополнение", {
    user: { id: order.userId, name: order.userName, username: order.username },
    lines: [
      `Зачисление: ${formatUsdtMicros(order.cashUsdtMicros)} USDT`,
      `Оплата: ${formatNumber(order.stars)} Stars`,
      `Order: ${order.id}`,
      `Telegram charge: ${order.telegramPaymentChargeId || "n/a"}`,
      `Баланс: ${formatUsdtMicros(balance)} USDT`
    ]
  });
}

async function handleCryptoWebhook(event) {
  const normalizedEvent = event?.provider
    ? event
    : {
        provider: "legacy",
        orderId: event?.orderId || event?.order_id || event?.merchantOrderId || "",
        status: event?.status || event?.paymentStatus || event?.state || "pending",
        paidAmount: event?.paidAmount ?? event?.amount ?? event?.cryptoAmount ?? 0,
        externalId: event?.externalId || event?.paymentId || event?.invoiceId || "",
        txHash: event?.txHash || event?.tx_hash || event?.transactionHash || "",
        raw: event
      };
  const orderId = normalizeExternalInvoiceOrderId(normalizedEvent.orderId);
  if (!orderId) {
    notifyAdmin("crypto_webhook_error", "Crypto webhook без orderId", {
      lines: [`Payload: ${JSON.stringify(normalizedEvent.raw || event).slice(0, 500)}`]
    });
    return;
  }

  const order = await cryptoOrderFromId(orderId);
  if (!order) {
    notifyAdmin("crypto_webhook_error", "Crypto webhook для неизвестного order", {
      lines: [`Order: ${orderId}`, `Payload: ${JSON.stringify(normalizedEvent.raw || event).slice(0, 500)}`]
    });
    return;
  }

  const status = normalizeCryptoPaymentStatus(normalizedEvent.status || normalizedEvent.paymentStatus || normalizedEvent.state);
  const paidAmount = Number(normalizedEvent.paidAmount ?? normalizedEvent.amount ?? normalizedEvent.cryptoAmount ?? 0);
  const txHash = String(normalizedEvent.txHash || normalizedEvent.tx_hash || normalizedEvent.transactionHash || "");
  const externalId = String(normalizedEvent.externalId || normalizedEvent.paymentId || normalizedEvent.invoiceId || "");
  const expectedAmount = Number(order.cryptoAmount || 0);
  const underpaid = paidAmount > 0 && expectedAmount > 0 && paidAmount + 0.00000001 < expectedAmount;

  if (underpaid) {
    await dbUpdatePaymentOrderStatus(order.id, {
      status: "manual_review",
      externalId,
      raw: { cryptoWebhook: normalizedEvent.raw || event, reason: "underpaid" }
    });
    const reviewOrder = { ...order, status: "manual_review", externalId, txHash };
    cryptoOrders.set(order.id, reviewOrder);
    await trackAnalytics("deposit_manual_review", {
      userId: order.userId,
      category: "payments",
      amount: order.cashUsdtMicros,
      asset: "USDT",
      contextId: order.id,
      meta: {
        method: order.method,
        expectedAmount,
        paidAmount,
        reason: "underpaid"
      }
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
      raw: { cryptoWebhook: normalizedEvent.raw || event }
    });
    const patchedOrder = { ...order, status: mappedStatus, externalId, txHash };
    cryptoOrders.set(order.id, patchedOrder);
    if (mappedStatus !== "pending") {
      await trackAnalytics(`deposit_${mappedStatus}`, {
        userId: order.userId,
        category: "payments",
        amount: order.cashUsdtMicros,
        asset: "USDT",
        contextId: order.id,
        meta: {
          method: order.method,
          providerStatus: normalizedEvent.status || ""
        }
      });
    }
    return;
  }

  const completed = await dbCompletePaymentOrder(order.id, {
    crypto_payment: true,
    telegram_payment_charge_id: txHash || externalId,
    provider_event: normalizedEvent.raw || event
  });
  if (completed?.alreadyPaid || completed?.ignored) return;
  let balance = completed?.balance;
  if (!completed) {
    const paymentKey = `payment:${order.id}`;
    if (idempotencyResults.has(paymentKey)) return;
    balance = await recordCashTransaction({ id: order.userId }, {
      type: "credit",
      category: `deposit_${normalizeLedgerCategory(order.method)}`,
      title: "Пополнение USDT",
      amount: order.cashUsdtMicros,
      meta: `${paidAmount || order.cryptoAmount} ${order.asset} ${order.network} · ${txHash || externalId || order.id}`,
      idempotencyKey: paymentKey
    });
    idempotencyResults.set(paymentKey, { balance });
    order.status = "paid";
    order.paidAt = new Date().toISOString();
  }

  const paidOrder = { ...order, status: "paid", externalId, txHash, paidAt: new Date().toISOString() };
  cryptoOrders.set(order.id, paidOrder);
  setCashWalletBalanceLocal(order.userId, balance);
  await awardWelcomeBonus(order, completed);
  await trackAnalytics("deposit_paid", {
    userId: order.userId,
    category: "payments",
    amount: order.cashUsdtMicros,
    asset: "USDT",
    contextId: order.id,
    meta: {
      method: order.method,
      asset: order.asset,
      network: order.network,
      paidAmount: paidAmount || order.cryptoAmount,
      txHash: txHash || externalId || ""
    }
  });
  notifyAdmin("crypto_paid", "Оплачено crypto-пополнение", {
    user: { id: order.userId, name: order.userName, username: order.username },
    lines: [
      `Метод: ${order.asset} ${order.network}`,
      `Зачисление: ${formatUsdtMicros(order.cashUsdtMicros)} USDT`,
      `Оплата: ${paidAmount || order.cryptoAmount} ${order.asset}`,
      `Order: ${order.id}`,
      `TX: ${txHash || externalId || "n/a"}`,
      `Баланс: ${formatUsdtMicros(balance)} USDT`
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
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/${method}`, {
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

async function requireTelegramPaymentsReady() {
  const diagnostics = await checkTelegramWebhookConfiguration({ notify: false });
  if (diagnostics?.ok) return;
  const error = new Error("Платежи Stars временно недоступны: сервер не готов принять подтверждение Telegram");
  error.status = 503;
  throw error;
}

async function checkTelegramWebhookConfiguration({ notify = true } = {}) {
  if (!REAL_MONEY_ENABLED) return { ok: true, skipped: "real_money_disabled" };
  if (!APP_PUBLIC_URL) {
    telegramWebhookDiagnostics = { ok: false, error: "APP_PUBLIC_URL is not configured" };
  } else {
    try {
      const data = await callTelegram("getWebhookInfo", {});
      const info = data.result || {};
      const expectedUrl = `${APP_PUBLIC_URL}/api/telegram/webhook`;
      telegramWebhookDiagnostics = {
        ok: info.url === expectedUrl,
        checkedAt: new Date().toISOString(),
        urlMatches: info.url === expectedUrl,
        pendingUpdateCount: Number(info.pending_update_count || 0),
        lastErrorDate: Number(info.last_error_date || 0),
        lastErrorMessage: info.last_error_message || ""
      };
    } catch (error) {
      telegramWebhookDiagnostics = {
        ok: false,
        checkedAt: new Date().toISOString(),
        error: error.message
      };
    }
  }

  if (notify && !telegramWebhookDiagnostics.ok) {
    const alertKey = [
      telegramWebhookDiagnostics.urlMatches,
      telegramWebhookDiagnostics.pendingUpdateCount,
      telegramWebhookDiagnostics.lastErrorDate,
      telegramWebhookDiagnostics.lastErrorMessage,
      telegramWebhookDiagnostics.error
    ].join(":");
    if (alertKey !== lastTelegramWebhookAlertKey) {
      lastTelegramWebhookAlertKey = alertKey;
      notifyAdmin("telegram_webhook_unhealthy", "Telegram webhook не готов принимать платежи", {
        lines: [
          `URL совпадает: ${telegramWebhookDiagnostics.urlMatches ? "да" : "нет"}`,
          `Ожидающих updates: ${telegramWebhookDiagnostics.pendingUpdateCount || 0}`,
          `Ошибка: ${telegramWebhookDiagnostics.lastErrorMessage || telegramWebhookDiagnostics.error || "неизвестно"}`
        ]
      });
    }
  } else if (telegramWebhookDiagnostics.ok) {
    lastTelegramWebhookAlertKey = "";
  }
  return telegramWebhookDiagnostics;
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

async function recordDeviceSessionForRequest(req, user, body = {}) {
  if (!user?.id) return;
  const ipHash = requestIpHash(req);
  const userAgent = requestUserAgent(req);
  const platform = String(body.platform || req.headers["sec-ch-ua-platform"] || "").slice(0, 80);
  const deviceIdHash = hashSensitive([
    user.id,
    ipHash,
    userAgent,
    platform
  ].join(":"));
  const session = {
    ipHash,
    userAgent,
    platform,
    deviceIdHash,
    meta: {
      colorScheme: body.colorScheme || "",
      source: user.isWebAdmin ? "admin" : "miniapp"
    }
  };
  deviceSessions.set(`${user.id}:${deviceIdHash}`, {
    userId: user.id,
    ...session,
    lastSeenAt: new Date().toISOString()
  });
  try {
    await dbRecordDeviceSession(user.id, session, user.isWebAdmin ? "web" : "telegram");
  } catch (error) {
    console.error("Device session failed:", error.message);
  }
}

async function recordAdminAudit({ req, admin, action, targetType = "", targetId = "", result = "ok", reason = "", meta = {} } = {}) {
  const audit = {
    id: randomId("audit"),
    actorProvider: admin?.isWebAdmin ? "web" : "telegram",
    actorProviderUserId: admin?.id || "system",
    actorRole: adminRolesFor(admin?.id || "").join(",") || (admin?.isWebAdmin ? "web-admin" : ""),
    action,
    targetType,
    targetId,
    result,
    reason,
    ipHash: req ? requestIpHash(req) : "",
    meta,
    createdAt: new Date().toISOString()
  };
  adminAuditLogs.unshift(audit);
  adminAuditLogs.splice(200);
  try {
    await dbRecordAdminAuditLog(audit);
  } catch (error) {
    console.error("Admin audit failed:", error.message);
  }
}

async function recordRiskFlag(flag = {}) {
  const entry = {
    id: flag.id || randomId("risk"),
    userId: flag.userId || "",
    type: flag.type || "risk",
    severity: flag.severity || "medium",
    reason: flag.reason || "",
    sourceId: flag.sourceId || "",
    meta: flag.meta || {},
    createdAt: new Date().toISOString()
  };
  riskFlags.unshift(entry);
  riskFlags.splice(200);
  try {
    await dbRecordRiskFlag(entry);
  } catch (error) {
    console.error("Risk flag failed:", error.message);
  }
}

function requestIpHash(req) {
  const forwarded = Array.isArray(req.headers["x-forwarded-for"])
    ? req.headers["x-forwarded-for"][0]
    : req.headers["x-forwarded-for"];
  const ip = String(
    forwarded?.split(",")[0]
      || req.headers["cf-connecting-ip"]
      || req.headers["x-real-ip"]
      || req.socket?.remoteAddress
      || ""
  ).trim();
  return ip ? hashSensitive(ip) : "";
}

function requestUserAgent(req) {
  const value = req.headers["user-agent"];
  return String(Array.isArray(value) ? value[0] : value || "").slice(0, 600);
}

function hashSensitive(value) {
  const secret = process.env.DEVICE_HASH_SECRET || BOT_TOKEN || "dev-secret";
  return createHmac("sha256", secret).update(String(value || "")).digest("hex");
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
  view.tournamentId = table.tournamentId || null;
  view.tournamentTableNumber = table.tournamentTableNumber || null;
  view.ante = table.ante || 0;
  view.viewer.balance = tableWalletBalance(user, table);
  view.viewer.canBuyIn = !table.tournamentId && view.viewer.canBuyIn && view.viewer.balance > 0;
  return view;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function requireSession(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const localSession = sessions.get(token);
  if (localSession) {
    if ((sessionExpirations.get(token) || 0) <= Date.now()) {
      sessions.delete(token);
      sessionExpirations.delete(token);
    } else {
      sessionExpirations.set(token, Date.now() + SESSION_TTL_MS);
      await stateSetSession(token, localSession);
      return localSession;
    }
  }
  const storedSession = await stateGetSession(token);
  if (storedSession) {
    sessions.set(token, storedSession);
    sessionExpirations.set(token, Date.now() + SESSION_TTL_MS);
  }
  return storedSession;
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
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

async function readRawBody(req) {
  if (Object.hasOwn(req, "__qwzRawBody")) return req.__qwzRawBody;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  req.__qwzRawBody = Buffer.concat(chunks).toString("utf8");
  return req.__qwzRawBody;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendMetrics(res, body) {
  res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
  res.end(body);
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

  const requestHash = await requestBodyHash(req);
  const cached = await getApiIdempotencyResult(key);
  if (cached) {
    if (cached.requestHash && requestHash && cached.requestHash !== requestHash) {
      sendJson(res, 409, { error: "Idempotency key already used with a different request body" });
      return;
    }
    sendJson(res, Number(cached.status || 200), cached.body || {});
    return;
  }

  if (pendingIdempotencyResults.has(key)) {
    const pending = pendingIdempotencyResults.get(key);
    if (pending.requestHash && requestHash && pending.requestHash !== requestHash) {
      sendJson(res, 409, { error: "Idempotency key is already processing a different request body" });
      return;
    }
    const replay = await pending.promise;
    sendJson(res, replay.status, replay.body);
    return;
  }

  const promise = (async () => {
    const result = normalizeRouteResult(await handler(key));
    await saveApiIdempotencyResult({
      key,
      scope,
      userId: user?.id || "",
      requestHash,
      status: result.status,
      body: result.body
    });
    return result;
  })();

  pendingIdempotencyResults.set(key, { requestHash, promise });
  try {
    const result = await promise;
    sendJson(res, result.status, result.body);
  } finally {
    pendingIdempotencyResults.delete(key);
  }
}

function buildPrometheusMetrics(health, stats = null) {
  const databaseMode = String(health?.database?.mode || "memory");
  const stateStoreMode = String(health?.stateStore?.mode || "memory");
  const memory = health?.memory || process.memoryUsage();
  const reconciliation = buildMetricsReconciliation(stats);
  const lines = [
    "# HELP qwz_app_up Application availability indicator.",
    "# TYPE qwz_app_up gauge",
    `qwz_app_up ${health?.ok ? 1 : 0}`,
    "# HELP qwz_uptime_seconds App uptime in seconds.",
    "# TYPE qwz_uptime_seconds gauge",
    `qwz_uptime_seconds ${Number(health?.uptimeSeconds || 0)}`,
    "# HELP qwz_database_ok PostgreSQL health indicator.",
    "# TYPE qwz_database_ok gauge",
    `qwz_database_ok{mode="${escapePrometheusLabelValue(databaseMode)}"} ${health?.database?.ok ? 1 : 0}`,
    "# HELP qwz_state_store_ok Redis health indicator.",
    "# TYPE qwz_state_store_ok gauge",
    `qwz_state_store_ok{mode="${escapePrometheusLabelValue(stateStoreMode)}"} ${health?.stateStore?.ok ? 1 : 0}`,
    "# HELP qwz_open_tables Total open tables in memory.",
    "# TYPE qwz_open_tables gauge",
    `qwz_open_tables ${Number(health?.tables?.open || 0)}`,
    "# HELP qwz_active_tables Tables with seated players.",
    "# TYPE qwz_active_tables gauge",
    `qwz_active_tables ${Number(health?.tables?.active || 0)}`,
    "# HELP qwz_sessions Active session count.",
    "# TYPE qwz_sessions gauge",
    `qwz_sessions ${Number(health?.sessions || 0)}`,
    "# HELP qwz_tournament_registrations Active tournament registrations.",
    "# TYPE qwz_tournament_registrations gauge",
    `qwz_tournament_registrations ${Number(health?.tournaments?.registrations || 0)}`,
    "# HELP qwz_pending_withdrawals Pending or manual-review withdrawals.",
    "# TYPE qwz_pending_withdrawals gauge",
    `qwz_pending_withdrawals ${Number(stats?.pendingWithdrawals ?? 0)}`,
    "# HELP qwz_pending_stars_orders Pending Stars orders.",
    "# TYPE qwz_pending_stars_orders gauge",
    `qwz_pending_stars_orders ${Number(stats?.pendingStars ?? 0)}`,
    "# HELP qwz_wallet_total_chips Player wallet total in chips.",
    "# TYPE qwz_wallet_total_chips gauge",
    `qwz_wallet_total_chips ${Number(stats?.walletTotal ?? 0)}`,
    "# HELP qwz_ledger_net_total_chips Ledger credit minus debit in chips.",
    "# TYPE qwz_ledger_net_total_chips gauge",
    `qwz_ledger_net_total_chips ${Number(stats?.ledgerCreditTotal ?? 0) - Number(stats?.ledgerDebitTotal ?? 0)}`,
    "# HELP qwz_wallet_ledger_drift_chips Difference between wallet total and ledger net.",
    "# TYPE qwz_wallet_ledger_drift_chips gauge",
    `qwz_wallet_ledger_drift_chips ${reconciliation.walletLedgerDrift}`,
    "# HELP qwz_cash_wallet_ledger_drift_micros Difference between cash USDT wallet total and cash ledger net in micro-USDT.",
    "# TYPE qwz_cash_wallet_ledger_drift_micros gauge",
    `qwz_cash_wallet_ledger_drift_micros ${reconciliation.cashWalletLedgerDrift}`,
    "# HELP qwz_stars_deposit_drift_chips Difference between paid Stars chips and ledger deposits.",
    "# TYPE qwz_stars_deposit_drift_chips gauge",
    `qwz_stars_deposit_drift_chips ${reconciliation.starsDepositDrift}`,
    "# HELP qwz_process_resident_memory_bytes Resident set size.",
    "# TYPE qwz_process_resident_memory_bytes gauge",
    `qwz_process_resident_memory_bytes ${Number(memory.rss || 0)}`,
    "# HELP qwz_process_heap_used_bytes Heap used bytes.",
    "# TYPE qwz_process_heap_used_bytes gauge",
    `qwz_process_heap_used_bytes ${Number(memory.heapUsed || 0)}`,
    "# HELP qwz_process_heap_total_bytes Heap total bytes.",
    "# TYPE qwz_process_heap_total_bytes gauge",
    `qwz_process_heap_total_bytes ${Number(memory.heapTotal || 0)}`,
    "# HELP qwz_process_external_bytes External memory bytes.",
    "# TYPE qwz_process_external_bytes gauge",
    `qwz_process_external_bytes ${Number(memory.external || 0)}`,
    "# HELP qwz_process_array_buffers_bytes Array buffer bytes.",
    "# TYPE qwz_process_array_buffers_bytes gauge",
    `qwz_process_array_buffers_bytes ${Number(memory.arrayBuffers || 0)}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildMetricsReconciliation(stats) {
  const walletTotal = Number(stats?.walletTotal || 0);
  const ledgerCreditTotal = Number(stats?.ledgerCreditTotal || 0);
  const ledgerDebitTotal = Number(stats?.ledgerDebitTotal || 0);
  const cashWalletTotal = Number(stats?.cashWalletTotal || 0);
  const cashLedgerCreditTotal = Number(stats?.cashLedgerCreditTotal || 0);
  const cashLedgerDebitTotal = Number(stats?.cashLedgerDebitTotal || 0);
  const paidStarsChipsTotal = Number(stats?.paidStarsChipsTotal || 0);
  const depositStarsLedgerTotal = Number(stats?.depositStarsLedgerTotal || 0);
  return {
    walletLedgerDrift: walletTotal - (ledgerCreditTotal - ledgerDebitTotal),
    cashWalletLedgerDrift: cashWalletTotal - (cashLedgerCreditTotal - cashLedgerDebitTotal),
    starsDepositDrift: paidStarsChipsTotal - depositStarsLedgerTotal
  };
}

async function requestBodyHash(req) {
  const raw = await readRawBody(req);
  return createHash("sha256").update(raw || "").digest("hex");
}

function escapePrometheusLabelValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
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
    requestHash: record.requestHash || "",
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

function requireRealMoneyEnabled() {
  if (REAL_MONEY_ENABLED) return;
  const error = new Error("Режим реальных средств пока отключен");
  error.status = 409;
  throw error;
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
  if (REAL_MONEY_ENABLED && !process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is required in production; money storage cannot use memory fallback");
  }
  if (REAL_MONEY_ENABLED && !process.env.REDIS_URL) {
    problems.push("REDIS_URL is required in production; sessions and active table state cannot use memory fallback");
  }
  if (!REAL_MONEY_ENABLED && (!process.env.DATABASE_URL || !process.env.REDIS_URL)) {
    console.warn("[warn] REAL_MONEY_ENABLED=false — PostgreSQL/Redis fallback allowed only for demo/play mode.");
  }
  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.warn("[warn] TELEGRAM_WEBHOOK_SECRET is empty — webhook endpoint is unprotected.");
  }
  if ((process.env.TON_PAYMENTS_ENABLED === "true" || process.env.USDT_TRC20_PAYMENTS_ENABLED === "true") && !CRYPTO_WEBHOOK_SECRET) {
    console.warn("[warn] CRYPTO_WEBHOOK_SECRET is empty — crypto confirmations will be rejected in production.");
  }
  if (process.env.REAL_MONEY_ENABLED === "true" && !process.env.CRYPTOBOT_API_KEY && !process.env.XROCKET_PAY_API_KEY && process.env.TON_PAYMENTS_ENABLED !== "true") {
    console.warn("[warn] No payment rail configured yet — Stars/Crypto Bot/xRocket/TON invoices will stay disabled.");
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

function verifyMetricsAccess(req) {
  if (!METRICS_TOKEN) return true;
  const provided = req.headers["x-qwz-metrics-token"] || req.headers["authorization"] || "";
  const token = String(provided).replace(/^Bearer\s+/i, "").trim();
  return token === METRICS_TOKEN;
}

function verifyCryptoWebhook(req) {
  if (!CRYPTO_WEBHOOK_SECRET) return !isProduction;
  const provided = req.headers["x-qwz-crypto-secret"] || req.headers["x-webhook-secret"] || "";
  return provided === CRYPTO_WEBHOOK_SECRET;
}

function ensureCryptoPaymentMethodEnabled(method) {
  const settings = depositSettings({ realMoneyEnabled: REAL_MONEY_ENABLED });
  const item = settings.methods.find((candidate) => candidate.id === method);
  if (!item?.enabled) {
    const error = new Error("Этот crypto-метод еще не подключен");
    error.status = 409;
    throw error;
  }
}

function metricRatio(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  return bottom > 0 ? Number((top / bottom).toFixed(4)) : 0;
}

function cryptoOrderView(order) {
  return {
    id: order.id,
    method: order.method,
    provider: order.provider || order.method,
    asset: order.asset,
    network: order.network,
    creditedAsset: order.creditedAsset || ASSETS.CASH,
    cashUsdtMicros: order.cashUsdtMicros || 0,
    usdtAmount: Number(order.usdtAmount || (order.cashUsdtMicros || 0) / 1_000_000),
    tonUsdtRate: order.tonUsdtRate,
    starsUsdtRate: order.starsUsdtRate,
    stars: Number(order.stars || 0),
    cryptoAmount: order.cryptoAmount,
    receiverAddress: order.receiverAddress || "",
    invoiceUrl: order.invoiceUrl || order.raw?.invoiceUrl || "",
    payload: order.payload || "",
    status: order.status,
    paidAt: order.paidAt || "",
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
