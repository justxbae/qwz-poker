import Redis from "ioredis";
import { randomUUID } from "node:crypto";

const PREFIX = "qwz";
const TABLE_SET_KEY = `${PREFIX}:tables`;
const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60;

let redis = null;
let subscriber = null;
let lastError = "";
const tableListeners = new Map();

export function stateStoreEnabled() {
  return Boolean(redis);
}

function stateStoreBootTimeoutMs() {
  const parsed = Number.parseInt(process.env.REDIS_BOOT_TIMEOUT_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
}

function withTimeout(promise, timeoutMs, message) {
  let timeout = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function disconnectRedisClients() {
  if (subscriber) {
    subscriber.disconnect();
    subscriber = null;
  }
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}

export async function initStateStore({ required = false } = {}) {
  const url = process.env.REDIS_URL || "";
  if (!url) {
    if (required) throw new Error("REDIS_URL is required but is empty");
    return false;
  }

  const bootTimeoutMs = stateStoreBootTimeoutMs();

  redis = new Redis(url, {
    lazyConnect: true,
    enableReadyCheck: true,
    connectTimeout: Math.min(bootTimeoutMs, 10_000),
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      return Math.min(times * 100, 2000);
    }
  });
  redis.on("error", (error) => {
    lastError = error.message;
    console.error("Redis error:", error.message);
  });
  try {
    await withTimeout(redis.connect(), bootTimeoutMs, `Redis connect timed out after ${bootTimeoutMs}ms`);
    await withTimeout(redis.ping(), bootTimeoutMs, `Redis ping timed out after ${bootTimeoutMs}ms`);
    subscriber = redis.duplicate();
    await withTimeout(subscriber.connect(), bootTimeoutMs, `Redis subscriber connect timed out after ${bootTimeoutMs}ms`);
    await withTimeout(subscriber.psubscribe(`${PREFIX}:table-events:*`), bootTimeoutMs, `Redis subscriber subscribe timed out after ${bootTimeoutMs}ms`);
    subscriber.on("pmessage", (_pattern, channel, message) => {
      const tableId = channel.slice(`${PREFIX}:table-events:`.length);
      for (const listener of tableListeners.get(tableId) || []) listener(message);
    });
    lastError = "";
    return true;
  } catch (error) {
    lastError = error.message;
    await disconnectRedisClients();
    if (required) throw error;
    console.warn(`[warn] Redis unavailable, falling back to memory state store: ${error.message}`);
    return false;
  }
}

export async function stateStoreHealth() {
  if (!redis) {
    return {
      enabled: false,
      ok: true,
      mode: "memory"
    };
  }

  const started = Date.now();
  try {
    await redis.ping();
    lastError = "";
    return {
      enabled: true,
      ok: true,
      mode: "redis",
      latencyMs: Date.now() - started
    };
  } catch (error) {
    lastError = error.message;
    return {
      enabled: true,
      ok: false,
      mode: "redis",
      latencyMs: Date.now() - started,
      error: lastError
    };
  }
}

export async function closeStateStore() {
  if (!redis) return;
  if (subscriber) await subscriber.quit();
  await redis.quit();
  subscriber = null;
  redis = null;
}

export async function setSession(token, user, ttlSeconds = sessionTtlSeconds()) {
  if (!redis) return false;
  const tokenKey = sessionKey(token);
  const userSetKey = userSessionsKey(user.id);
  const payload = JSON.stringify(user);
  const transaction = redis.multi();
  transaction.set(tokenKey, payload, "EX", ttlSeconds);
  transaction.sadd(userSetKey, token);
  transaction.expire(userSetKey, ttlSeconds);
  await transaction.exec();
  return true;
}

export async function getSession(token, ttlSeconds = sessionTtlSeconds()) {
  if (!redis || !token) return null;
  const value = await redis.get(sessionKey(token));
  if (!value) return null;
  const user = JSON.parse(value);
  await redis.expire(sessionKey(token), ttlSeconds);
  await redis.expire(userSessionsKey(user.id), ttlSeconds);
  return user;
}

export async function updateUserSessions(userId, patch = {}, ttlSeconds = sessionTtlSeconds()) {
  if (!redis || !userId) return false;
  const userSetKey = userSessionsKey(userId);
  const tokens = await redis.smembers(userSetKey);
  if (!tokens.length) return false;
  const values = await redis.mget(tokens.map(sessionKey));
  const transaction = redis.multi();

  tokens.forEach((token, index) => {
    const raw = values[index];
    if (!raw) {
      transaction.srem(userSetKey, token);
      return;
    }
    const user = { ...JSON.parse(raw), ...patch };
    transaction.set(sessionKey(token), JSON.stringify(user), "EX", ttlSeconds);
  });
  transaction.expire(userSetKey, ttlSeconds);
  await transaction.exec();
  return true;
}

export async function setTableSnapshot(table) {
  const payload = JSON.stringify({
    tableId: table.id,
    revision: Number(table.stateRevision || 0),
    events: Array.isArray(table.events) ? table.events.slice(-20) : []
  });
  if (!redis) {
    for (const listener of tableListeners.get(table.id) || []) listener(payload);
    return false;
  }
  const transaction = redis.multi();
  transaction.set(tableKey(table.id), JSON.stringify(table));
  transaction.sadd(TABLE_SET_KEY, table.id);
  transaction.publish(tableEventsChannel(table.id), payload);
  await transaction.exec();
  return true;
}

export async function getTableSnapshot(tableId) {
  if (!redis) return null;
  const raw = await redis.get(tableKey(tableId));
  return raw ? JSON.parse(raw) : null;
}

export async function withTableLock(tableId, callback, { ttlMs = 10_000, waitMs = 2_000 } = {}) {
  if (!redis) return callback();
  const key = `${PREFIX}:table-lock:${tableId}`;
  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  while (Date.now() <= deadline) {
    const acquired = await redis.set(key, token, "PX", ttlMs, "NX");
    if (acquired === "OK") {
      const renewal = setInterval(() => {
        redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
          1,
          key,
          token,
          ttlMs
        ).catch((error) => { lastError = error.message; });
      }, Math.max(250, Math.floor(ttlMs / 3)));
      try {
        return await callback();
      } finally {
        clearInterval(renewal);
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          key,
          token
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const error = new Error("Стол занят другим игровым процессом, повторите действие");
  error.status = 409;
  throw error;
}

export function subscribeTableEvents(tableId, listener) {
  const listeners = tableListeners.get(tableId) || new Set();
  listeners.add(listener);
  tableListeners.set(tableId, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) tableListeners.delete(tableId);
  };
}

export async function deleteTableSnapshot(tableId) {
  if (!redis) return false;
  const transaction = redis.multi();
  transaction.del(tableKey(tableId));
  transaction.srem(TABLE_SET_KEY, tableId);
  await transaction.exec();
  return true;
}

export async function listTableSnapshots() {
  if (!redis) return null;
  const tableIds = await redis.smembers(TABLE_SET_KEY);
  if (!tableIds.length) return [];
  const values = await redis.mget(tableIds.map(tableKey));
  return values
    .filter(Boolean)
    .map((raw) => ({ raw: JSON.parse(raw) }));
}

function sessionTtlSeconds() {
  return Number(process.env.SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
}

function sessionKey(token) {
  return `${PREFIX}:session:${token}`;
}

function userSessionsKey(userId) {
  return `${PREFIX}:user_sessions:${userId}`;
}

function tableKey(tableId) {
  return `${PREFIX}:table:${tableId}`;
}

function tableEventsChannel(tableId) {
  return `${PREFIX}:table-events:${tableId}`;
}
