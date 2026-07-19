const PLACEHOLDER_PATTERN = /(replace_with|change_me|example|test-token)/i;

function csvValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function configuredSecret(value, minimumLength = 16) {
  const text = String(value || "").trim();
  return text.length >= minimumLength && !PLACEHOLDER_PATTERN.test(text);
}

function validUrl(value, protocols) {
  try {
    return protocols.includes(new URL(String(value || "")).protocol);
  } catch {
    return false;
  }
}

export function evaluateLaunchReadiness(env = {}) {
  const errors = [];
  const warnings = [];
  const checks = [];
  const add = (ok, code, message, severity = "error") => {
    checks.push({ ok, code, message, severity });
    if (ok) return;
    (severity === "warning" ? warnings : errors).push({ code, message });
  };

  add(env.NODE_ENV === "production", "runtime.production", "NODE_ENV должен быть production.");
  add(env.REAL_MONEY_ENABLED === "true", "money.real_mode", "REAL_MONEY_ENABLED должен быть true.");
  add(env.TEST_PLAYERS_ENABLED !== "true", "runtime.test_players", "TEST_PLAYERS_ENABLED нельзя включать в production.");
  add(String(env.APP_NAME || "").trim() === "Weez Poker", "brand.app_name", "APP_NAME должен быть Weez Poker.");
  add(
    String(env.BOT_USERNAME || "").replace(/^@/, "").toLowerCase().includes("weez"),
    "brand.bot_username",
    "BOT_USERNAME должен указывать на актуального Weez-бота."
  );
  add(configuredSecret(env.BOT_TOKEN, 20), "telegram.bot_token", "Нужен действующий BOT_TOKEN.");
  add(validUrl(env.APP_PUBLIC_URL, ["https:"]), "runtime.public_url", "APP_PUBLIC_URL должен быть публичным HTTPS URL.");
  add(validUrl(env.DATABASE_URL, ["postgres:", "postgresql:"]), "infra.postgres", "Нужен PostgreSQL DATABASE_URL.");
  add(validUrl(env.REDIS_URL, ["redis:", "rediss:"]), "infra.redis", "Нужен Redis REDIS_URL.");
  add(
    /^[A-Za-z0-9_-]{16,256}$/.test(String(env.TELEGRAM_WEBHOOK_SECRET || "")),
    "telegram.webhook_secret",
    "TELEGRAM_WEBHOOK_SECRET должен содержать 16-256 допустимых Telegram символов."
  );
  add(configuredSecret(env.METRICS_TOKEN, 32), "ops.metrics_token", "METRICS_TOKEN должен быть независимым секретом длиной от 32 символов.");
  add(configuredSecret(env.DEVICE_HASH_SECRET, 32), "risk.device_hash_secret", "DEVICE_HASH_SECRET должен быть независимым секретом длиной от 32 символов.");

  const owners = csvValues(env.ADMIN_OWNER_IDS || env.ADMIN_USER_IDS || env.ADMIN_CHAT_ID);
  const finance = csvValues(env.ADMIN_FINANCE_IDS);
  add(owners.length > 0, "admin.owner", "Нужен хотя бы один owner/admin Telegram ID.");
  add(env.WITHDRAWALS_ENABLED === "true", "withdrawals.enabled", "WITHDRAWALS_ENABLED должен быть true для полного денежного запуска.");
  if (env.WITHDRAWALS_ENABLED === "true") {
    add(finance.length > 0, "admin.finance", "Для ручного вывода нужен отдельный ADMIN_FINANCE_IDS.");
  }

  const starsRate = Number(env.STARS_USDT_RATE || 0.01);
  add(starsRate === 0.01, "money.stars_rate", "STARS_USDT_RATE должен соответствовать канону 0.01 USDT за Star.");
  add(
    Number(env.WITHDRAWAL_RAKE_THRESHOLD_PERCENT || 0) <= 0,
    "withdrawals.global_rake_gate",
    "Глобальный rake gate включён: для beta по канону он должен быть 0, риск обрабатывается manual review.",
    "warning"
  );
  add(configuredSecret(env.SENTRY_DSN, 10), "ops.error_tracking", "SENTRY_DSN не настроен: инциденты могут остаться только в логах.", "warning");

  if (env.TON_PAYMENTS_ENABLED === "true") {
    add(Boolean(String(env.TON_RECEIVER_ADDRESS || "").trim()), "payments.ton_address", "Для TON нужен TON_RECEIVER_ADDRESS.");
    add(Number(env.TON_USDT_RATE) > 0, "payments.ton_rate", "Для TON нужен положительный TON_USDT_RATE.");
    add(configuredSecret(env.CRYPTO_WEBHOOK_SECRET, 16), "payments.ton_webhook", "Для TON webhook нужен CRYPTO_WEBHOOK_SECRET.");
  }
  if (env.XROCKET_PAY_API_KEY) {
    add(configuredSecret(env.XROCKET_WEBHOOK_SECRET, 16), "payments.xrocket_webhook", "Для xRocket нужен XROCKET_WEBHOOK_SECRET.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks
  };
}
