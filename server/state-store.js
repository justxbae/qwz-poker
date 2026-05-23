import Redis from "ioredis";

const PREFIX = "qwz";
const TABLE_SET_KEY = `${PREFIX}:tables`;
const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60;

let redis = null;
let lastError = "";

export function stateStoreEnabled() {
  return Boolean(redis);
}

export async function initStateStore() {
  const url = process.env.REDIS_URL || "";
  if (!url) return false;

  redis = new Redis(url, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      return Math.min(times * 100, 2000);
    }
  });
  redis.on("error", (error) => {
    lastError = error.message;
    console.error("Redis error:", error.message);
  });
  await redis.connect();
  await redis.ping();
  lastError = "";
  return true;
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
  await redis.quit();
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
  if (!redis) return false;
  const transaction = redis.multi();
  transaction.set(tableKey(table.id), JSON.stringify(table));
  transaction.sadd(TABLE_SET_KEY, table.id);
  await transaction.exec();
  return true;
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
