import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLaunchReadiness } from "../server/launch-readiness.js";

const validEnv = {
  NODE_ENV: "production",
  REAL_MONEY_ENABLED: "true",
  TEST_PLAYERS_ENABLED: "false",
  APP_NAME: "Weez Poker",
  APP_PUBLIC_URL: "https://poker.weez.example",
  BOT_USERNAME: "weezpokerbot",
  BOT_TOKEN: "123456789:abcdefghijklmnopqrstuvwxyz",
  DATABASE_URL: "postgresql://user:pass@db.example/weez",
  REDIS_URL: "rediss://default:pass@redis.example:6379",
  TELEGRAM_WEBHOOK_SECRET: "telegram_webhook_secret_123456",
  METRICS_TOKEN: "m".repeat(32),
  DEVICE_HASH_SECRET: "d".repeat(32),
  ADMIN_OWNER_IDS: "1",
  ADMIN_FINANCE_IDS: "2",
  WITHDRAWALS_ENABLED: "true",
  WITHDRAWAL_RAKE_THRESHOLD_PERCENT: "0",
  STARS_USDT_RATE: "0.01",
  SENTRY_DSN: "https://public@example.ingest.sentry.io/1"
};

test("launch readiness accepts a complete production contract", () => {
  const result = evaluateLaunchReadiness(validEnv);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("launch readiness fails closed on missing financial infrastructure and secrets", () => {
  const result = evaluateLaunchReadiness({
    NODE_ENV: "production",
    REAL_MONEY_ENABLED: "true",
    TEST_PLAYERS_ENABLED: "true",
    APP_NAME: "QWZ Poker",
    BOT_USERNAME: "qwzpokerbot",
    WITHDRAWALS_ENABLED: "true"
  });
  assert.equal(result.ok, false);
  const codes = new Set(result.errors.map((item) => item.code));
  for (const code of [
    "brand.app_name",
    "infra.postgres",
    "infra.redis",
    "telegram.webhook_secret",
    "ops.metrics_token",
    "risk.device_hash_secret",
    "admin.finance",
    "runtime.test_players"
  ]) assert.equal(codes.has(code), true, code);
});

test("global withdrawal rake gate is visible as a launch warning", () => {
  const result = evaluateLaunchReadiness({
    ...validEnv,
    WITHDRAWAL_RAKE_THRESHOLD_PERCENT: "25"
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((item) => item.code === "withdrawals.global_rake_gate"), true);
});

test("Stars-only launch is allowed but missing a separate crypto rail is visible", () => {
  const result = evaluateLaunchReadiness(validEnv);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((item) => item.code === "payments.crypto_rail"), true);

  const withCryptoBot = evaluateLaunchReadiness({
    ...validEnv,
    CRYPTOBOT_API_KEY: "crypto-provider-key-123456789"
  });
  assert.equal(withCryptoBot.warnings.some((item) => item.code === "payments.crypto_rail"), false);
});
