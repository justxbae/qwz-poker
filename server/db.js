import { randomUUID } from "node:crypto";

let pool = null;

export function databaseEnabled() {
  return Boolean(pool);
}

export async function databaseHealth() {
  if (!pool) {
    return {
      enabled: false,
      ok: true,
      mode: "memory"
    };
  }

  const started = Date.now();
  try {
    await query("select 1");
    return {
      enabled: true,
      ok: true,
      mode: "postgres",
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      enabled: true,
      ok: false,
      mode: "postgres",
      latencyMs: Date.now() - started,
      error: error.message
    };
  }
}

export async function initDatabase() {
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) return false;

  const { Pool } = await import("pg");
  pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });

  await migrate();
  return true;
}

export async function closeDatabase() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export async function upsertTelegramUser(user) {
  if (!pool) return null;
  const providerUserId = String(user.id);
  const appUserId = await ensureIdentity("telegram", providerUserId);

  await query(`
    update app_users
    set display_name = $2,
        username = $3,
        photo_url = $4,
        updated_at = now()
    where id = $1
  `, [
    appUserId,
    user.name || user.first_name || user.username || "Player",
    user.username || "",
    user.photoUrl || user.photo_url || ""
  ]);

  return appUserId;
}

export async function getWallet(providerUserId, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query("select balance from wallets where app_user_id = $1", [appUserId]);
  if (!result.rowCount) {
    await query("insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing", [appUserId]);
    return 0;
  }
  return Number(result.rows[0].balance || 0);
}

export async function setWallet(providerUserId, balance, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const normalized = Math.max(0, Math.round(Number(balance) || 0));
  await query(`
    insert into wallets (app_user_id, balance, updated_at)
    values ($1, $2, now())
    on conflict (app_user_id) do update set balance = excluded.balance, updated_at = now()
  `, [appUserId, normalized]);
  return normalized;
}

export async function addWalletEntry(providerUserId, entry, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const amount = Math.max(0, Math.round(Number(entry.amount) || 0));
  const idempotencyKey = normalizeIdempotencyKey(entry.idempotencyKey);
  if (idempotencyKey) {
    const existing = await query(`
      select balance_after
      from ledger_entries
      where idempotency_key = $1
      limit 1
    `, [idempotencyKey]);
    if (existing.rowCount) {
      return {
        balance: Number(existing.rows[0].balance_after || 0),
        before: Number(existing.rows[0].balance_after || 0),
        idempotentReplay: true
      };
    }
  }
  const sign = entry.type === "debit" ? -1 : 1;
  const delta = sign * amount;
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      "insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing",
      [appUserId]
    );
    const current = await client.query(
      "select balance from wallets where app_user_id = $1 for update",
      [appUserId]
    );
    const before = Number(current.rows[0]?.balance || 0);
    const after = before + delta;
    if (after < 0) {
      const error = new Error(`Недостаточно chips. Баланс игрока: ${before.toLocaleString("ru-RU")}`);
      error.status = 409;
      throw error;
    }

    await client.query(
      "update wallets set balance = $2, updated_at = now() where app_user_id = $1",
      [appUserId, after]
    );
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta, balance_after, idempotency_key
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      entry.id || id("ledger"),
      appUserId,
      provider,
      String(providerUserId),
      entry.type,
      normalizeLedgerCategory(entry.category),
      entry.title,
      amount,
      entry.meta || "",
      after,
      idempotencyKey || null
    ]);
    await client.query("commit");
    return { balance: after, before };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listLedger(providerUserId, limit = 30, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query(`
    select id, type, category, title, amount, meta, created_at as "createdAt"
    from ledger_entries
    where app_user_id = $1
    order by created_at desc
    limit $2
  `, [appUserId, limit]);
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0)
  }));
}

export async function recordFundMovement(providerUserId, movement, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const amount = Math.max(0, Math.round(Number(movement.amount) || 0));
  await query(`
    insert into fund_movements (
      id, app_user_id, provider, provider_user_id, category,
      from_bucket, to_bucket, amount, context_id, meta
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    movement.id || id("move"),
    appUserId,
    provider,
    String(providerUserId),
    normalizeLedgerCategory(movement.category),
    normalizeLedgerCategory(movement.from || movement.fromBucket),
    normalizeLedgerCategory(movement.to || movement.toBucket),
    amount,
    movement.contextId || "",
    movement.meta || ""
  ]);
  return true;
}

export async function listFundMovements(providerUserId, limit = 30, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query(`
    select id, category, from_bucket as "from", to_bucket as "to", amount,
           context_id as "contextId", meta, created_at as "createdAt"
    from fund_movements
    where app_user_id = $1
    order by created_at desc
    limit $2
  `, [appUserId, limit]);
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0)
  }));
}

export async function recordHandHistory(table, hand) {
  if (!pool) return null;
  await query(`
    insert into hand_histories (
      id, table_id, table_name, hand_number, small_blind, big_blind,
      board, pots, seats, rake, raw, finished_at
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb, to_timestamp($12 / 1000.0))
    on conflict (id) do nothing
  `, [
    hand.id,
    table.id,
    table.name || "",
    hand.handNumber || 0,
    table.smallBlind || 0,
    table.bigBlind || 0,
    JSON.stringify(hand.board || []),
    JSON.stringify(hand.pots || []),
    JSON.stringify(hand.seats || []),
    hand.rake || 0,
    JSON.stringify(hand),
    Number(hand.at || Date.now())
  ]);
  return true;
}

export async function recordPlatformLedgerEntry(entry) {
  if (!pool) return null;
  const amount = Math.max(0, Math.round(Number(entry.amount) || 0));
  if (amount <= 0) return null;
  const idempotencyKey = normalizeIdempotencyKey(entry.idempotencyKey);
  if (idempotencyKey) {
    const existing = await query("select id from platform_ledger_entries where idempotency_key = $1 limit 1", [idempotencyKey]);
    if (existing.rowCount) return { id: existing.rows[0].id, idempotentReplay: true };
  }
  const result = await query(`
    insert into platform_ledger_entries (
      id, type, category, title, amount, context_id, meta, idempotency_key
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict do nothing
    returning id
  `, [
    entry.id || id("platform"),
    entry.type === "debit" ? "debit" : "credit",
    normalizeLedgerCategory(entry.category),
    entry.title || "Platform ledger entry",
    amount,
    entry.contextId || "",
    entry.meta || "",
    idempotencyKey || null
  ]);
  return { id: result.rows[0]?.id || null };
}

export async function listHandHistories(limit = 20) {
  if (!pool) return null;
  const result = await query(`
    select id, table_id as "tableId", table_name as "tableName", hand_number as "handNumber",
           small_blind as "smallBlind", big_blind as "bigBlind", board, pots, seats, rake,
           finished_at as "finishedAt"
    from hand_histories
    order by finished_at desc
    limit $1
  `, [limit]);
  return result.rows.map((row) => ({
    ...row,
    handNumber: Number(row.handNumber || 0),
    smallBlind: Number(row.smallBlind || 0),
    bigBlind: Number(row.bigBlind || 0),
    rake: Number(row.rake || 0)
  }));
}

export async function upsertActiveTableSnapshot(table) {
  if (!pool) return null;
  await query(`
    insert into active_table_snapshots (
      id, table_name, is_private, is_system, small_blind, big_blind,
      status, hand_number, raw, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
    on conflict (id) do update
    set table_name = excluded.table_name,
        is_private = excluded.is_private,
        is_system = excluded.is_system,
        small_blind = excluded.small_blind,
        big_blind = excluded.big_blind,
        status = excluded.status,
        hand_number = excluded.hand_number,
        raw = excluded.raw,
        updated_at = now()
  `, [
    table.id,
    table.name || "",
    Boolean(table.isPrivate),
    Boolean(table.isSystem),
    Number(table.smallBlind || 0),
    Number(table.bigBlind || 0),
    table.status || "waiting",
    Number(table.handNumber || 0),
    JSON.stringify(table)
  ]);
  return true;
}

export async function deleteActiveTableSnapshot(tableId) {
  if (!pool) return null;
  await query("delete from active_table_snapshots where id = $1", [tableId]);
  return true;
}

export async function listActiveTableSnapshots() {
  if (!pool) return null;
  const result = await query(`
    select id, raw, updated_at as "updatedAt"
    from active_table_snapshots
    order by is_system desc, small_blind asc, table_name asc
  `);
  return result.rows.map((row) => ({
    id: row.id,
    raw: row.raw,
    updatedAt: row.updatedAt
  }));
}

export async function listTournamentRegistrations(tournamentIds = []) {
  if (!pool) return null;
  if (!tournamentIds.length) return [];
  const result = await query(`
    select tr.tournament_id as "tournamentId",
           tr.provider_user_id as "userId",
           tr.buy_in as "buyIn",
           tr.fee,
           tr.registered_at as "registeredAt",
           au.display_name as name,
           au.username
    from tournament_registrations tr
    left join app_users au on au.id = tr.app_user_id
    where tr.status = 'active'
      and tr.tournament_id = any($1::text[])
    order by tr.registered_at asc
  `, [tournamentIds]);
  return result.rows.map((row) => ({
    ...row,
    buyIn: Number(row.buyIn || 0),
    fee: Number(row.fee || 0)
  }));
}

export async function registerTournament(providerUserId, tournament, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const buyIn = Math.max(0, Math.round(Number(tournament.buyIn) || 0));
  const fee = Math.max(0, Math.round(Number(tournament.fee) || 0));
  const totalCost = buyIn + fee;
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [String(tournament.id)]);
    await client.query("insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing", [appUserId]);

    const existing = await client.query(`
      select status
      from tournament_registrations
      where tournament_id = $1 and app_user_id = $2
      for update
    `, [tournament.id, appUserId]);
    if (existing.rows[0]?.status === "active") {
      const wallet = await client.query("select balance from wallets where app_user_id = $1", [appUserId]);
      await client.query("commit");
      return { balance: Number(wallet.rows[0]?.balance || 0), alreadyRegistered: true };
    }

    const count = await client.query(`
      select count(*)::int as count
      from tournament_registrations
      where tournament_id = $1 and status = 'active'
    `, [tournament.id]);
    if (Number(count.rows[0]?.count || 0) >= Number(tournament.maxPlayers || 0)) {
      const error = new Error("Турнир уже заполнен");
      error.status = 409;
      throw error;
    }

    const current = await client.query("select balance from wallets where app_user_id = $1 for update", [appUserId]);
    const before = Number(current.rows[0]?.balance || 0);
    const after = before - totalCost;
    if (after < 0) {
      const error = new Error(`Недостаточно chips для регистрации. Нужно ${totalCost.toLocaleString("ru-RU")} chips`);
      error.status = 409;
      throw error;
    }

    await client.query("update wallets set balance = $2, updated_at = now() where app_user_id = $1", [appUserId, after]);
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta, balance_after
      )
      values ($1, $2, $3, $4, 'debit', 'tournament_buyin', 'Вход в турнир', $5, $6, $7)
    `, [
      id("ledger"),
      appUserId,
      provider,
      String(providerUserId),
      totalCost,
      `${tournament.title} · бай-ин ${buyIn.toLocaleString("ru-RU")} + fee ${fee.toLocaleString("ru-RU")}`,
      after
    ]);
    await client.query(`
      insert into tournament_registrations (
        tournament_id, app_user_id, provider, provider_user_id, buy_in, fee, status, registered_at, cancelled_at
      )
      values ($1, $2, $3, $4, $5, $6, 'active', now(), null)
      on conflict (tournament_id, app_user_id) do update
      set buy_in = excluded.buy_in,
          fee = excluded.fee,
          status = 'active',
          registered_at = now(),
          cancelled_at = null
    `, [tournament.id, appUserId, provider, String(providerUserId), buyIn, fee]);
    await client.query("commit");
    return { balance: after, alreadyRegistered: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelTournamentRegistration(providerUserId, tournament, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [String(tournament.id)]);
    const registration = await client.query(`
      select buy_in, fee
      from tournament_registrations
      where tournament_id = $1 and app_user_id = $2 and status = 'active'
      for update
    `, [tournament.id, appUserId]);
    if (!registration.rowCount) {
      const wallet = await client.query("select balance from wallets where app_user_id = $1", [appUserId]);
      await client.query("commit");
      return { balance: Number(wallet.rows[0]?.balance || 0), cancelled: false };
    }

    const refund = Number(registration.rows[0].buy_in || 0) + Number(registration.rows[0].fee || 0);
    await client.query("insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing", [appUserId]);
    const current = await client.query("select balance from wallets where app_user_id = $1 for update", [appUserId]);
    const after = Number(current.rows[0]?.balance || 0) + refund;

    await client.query("update wallets set balance = $2, updated_at = now() where app_user_id = $1", [appUserId, after]);
    await client.query(`
      update tournament_registrations
      set status = 'cancelled', cancelled_at = now()
      where tournament_id = $1 and app_user_id = $2
    `, [tournament.id, appUserId]);
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta, balance_after
      )
      values ($1, $2, $3, $4, 'credit', 'tournament_refund', 'Возврат турнирного бай-ина', $5, $6, $7)
    `, [
      id("ledger"),
      appUserId,
      provider,
      String(providerUserId),
      refund,
      tournament.title,
      after
    ]);
    await client.query("commit");
    return { balance: after, cancelled: true };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getSavedStack(providerUserId, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query("select stack from saved_stacks where app_user_id = $1", [appUserId]);
  return result.rowCount ? Number(result.rows[0].stack || 0) : 0;
}

export async function setSavedStack(providerUserId, stack, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  await query(`
    insert into saved_stacks (app_user_id, stack, updated_at)
    values ($1, $2, now())
    on conflict (app_user_id) do update set stack = excluded.stack, updated_at = now()
  `, [appUserId, Math.max(0, Math.round(Number(stack) || 0))]);
}

export async function createPaymentOrder(order, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, order.userId);
  await query(`
    insert into payment_orders (
      id, app_user_id, provider, provider_user_id, method, status,
      rub_amount, chips, stars, asset, network, crypto_amount, external_id, payload, raw, expires_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
  `, [
    order.id,
    appUserId,
    provider,
    String(order.userId),
    order.method || "stars",
    order.status || "pending",
    order.rubAmount || 0,
    order.chips || 0,
    order.stars || 0,
    order.asset || "",
    order.network || "",
    order.cryptoAmount ?? null,
    order.externalId || "",
    order.payload || "",
    JSON.stringify(order),
    order.expiresAt ? new Date(order.expiresAt) : null
  ]);
}

export async function updatePaymentOrderStatus(orderId, patch = {}) {
  if (!pool) return null;
  await query(`
    update payment_orders
    set status = $2,
        external_id = coalesce($3, external_id),
        raw = coalesce(raw, '{}'::jsonb) || $4::jsonb
    where id = $1
  `, [
    orderId,
    patch.status,
    patch.externalId || null,
    JSON.stringify(patch.raw || {})
  ]);
  return getPaymentOrder(orderId);
}

export async function getPaymentOrder(orderId) {
  if (!pool) return null;
  const result = await query(`
    select po.*, au.display_name as "userName", au.username
    from payment_orders po
    left join app_users au on au.id = po.app_user_id
    where po.id = $1
  `, [orderId]);
  return result.rowCount ? paymentRow(result.rows[0]) : null;
}

export async function markPaymentOrderPaid(orderId, payment) {
  if (!pool) return null;
  await query(`
    update payment_orders
    set status = 'paid',
        paid_at = now(),
        telegram_payment_charge_id = $2,
        raw = coalesce(raw, '{}'::jsonb) || $3::jsonb
    where id = $1 and status = 'pending'
  `, [
    orderId,
    payment.telegram_payment_charge_id || "",
    JSON.stringify({ successfulPayment: payment })
  ]);
  return getPaymentOrder(orderId);
}

export async function completePaymentOrder(orderId, payment) {
  if (!pool) return null;
  const client = await pool.connect();

  try {
    await client.query("begin");
    const currentOrder = await client.query(`
      select po.*, au.display_name as "userName", au.username
      from payment_orders po
      left join app_users au on au.id = po.app_user_id
      where po.id = $1
      for update
    `, [orderId]);
    if (!currentOrder.rowCount) {
      await client.query("commit");
      return null;
    }

    const order = paymentRow(currentOrder.rows[0]);
    if (order.status === "paid") {
      const wallet = await client.query("select balance from wallets where app_user_id = $1", [currentOrder.rows[0].app_user_id]);
      await client.query("commit");
      return { order, balance: Number(wallet.rows[0]?.balance || 0), alreadyPaid: true };
    }
    if (order.status !== "pending") {
      await client.query("commit");
      return { order, balance: null, ignored: true };
    }

    const appUserId = currentOrder.rows[0].app_user_id;
    await client.query("insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing", [appUserId]);
    const wallet = await client.query("select balance from wallets where app_user_id = $1 for update", [appUserId]);
    const before = Number(wallet.rows[0]?.balance || 0);
    const amount = Math.max(0, Math.round(Number(order.chips) || 0));
    const after = before + amount;
    const method = normalizeLedgerCategory(order.method || "stars");
    const asset = order.asset || (method === "stars" ? "Stars" : method.toUpperCase());
    const network = order.network || "";
    const ledgerKey = `payment:${order.id}`;

    await client.query("update wallets set balance = $2, updated_at = now() where app_user_id = $1", [appUserId, after]);
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta, balance_after, idempotency_key
      )
      values ($1, $2, $3, $4, 'credit', $5, $6, $7, $8, $9, $10)
      on conflict do nothing
    `, [
      id("ledger"),
      appUserId,
      order.provider || "telegram",
      String(order.userId),
      `deposit_${method}`,
      method === "stars" ? "Пополнение Stars" : "Пополнение баланса",
      amount,
      `${order.cryptoAmount || order.stars || 0} ${asset}${network ? ` ${network}` : ""} · order ${order.id}`,
      after,
      ledgerKey
    ]);
    await client.query(`
      update payment_orders
      set status = 'paid',
          paid_at = now(),
          telegram_payment_charge_id = $2,
          raw = coalesce(raw, '{}'::jsonb) || $3::jsonb
      where id = $1
    `, [
      order.id,
      payment.telegram_payment_charge_id || "",
      JSON.stringify({ successfulPayment: payment })
    ]);
    await client.query("commit");
    return {
      order: {
        ...order,
        status: "paid",
        paidAt: new Date().toISOString(),
        telegramPaymentChargeId: payment.telegram_payment_charge_id || ""
      },
      balance: after,
      alreadyPaid: false
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listPaymentOrders(limit = 10) {
  if (!pool) return null;
  const result = await query(`
    select po.*, au.display_name as "userName", au.username
    from payment_orders po
    left join app_users au on au.id = po.app_user_id
    order by po.created_at desc
    limit $1
  `, [limit]);
  return result.rows.map(paymentRow);
}

export async function getIdempotencyResult(key) {
  if (!pool) return null;
  const normalized = normalizeIdempotencyKey(key);
  if (!normalized) return null;
  const result = await query(`
    select response_status as "status", response_body as "body", created_at as "createdAt"
    from idempotency_keys
    where key = $1 and expires_at > now()
  `, [normalized]);
  return result.rowCount ? result.rows[0] : null;
}

export async function saveIdempotencyResult(record) {
  if (!pool) return null;
  const key = normalizeIdempotencyKey(record.key);
  if (!key) return null;
  const appUserId = record.userId ? await ensureIdentity(record.provider || "telegram", record.userId) : null;
  await query(`
    insert into idempotency_keys (
      key, scope, app_user_id, provider, provider_user_id, request_hash, response_status, response_body, expires_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now() + ($9::text)::interval)
    on conflict (key) do update
    set response_status = excluded.response_status,
        response_body = excluded.response_body,
        expires_at = excluded.expires_at
  `, [
    key,
    normalizeLedgerCategory(record.scope || "api"),
    appUserId,
    record.provider || "telegram",
    record.userId ? String(record.userId) : "",
    record.requestHash || "",
    Number(record.status || 200),
    JSON.stringify(record.body || {}),
    record.ttl || "24 hours"
  ]);
  return true;
}

export async function recordAdminEvent(event) {
  if (!pool) return null;
  const targetAppUserId = event.user?.id ? await ensureIdentity("telegram", event.user.id) : null;
  await query(`
    insert into admin_events (id, type, title, target_app_user_id, target_provider_user_id, lines)
    values ($1, $2, $3, $4, $5, $6)
  `, [
    event.id || id("event"),
    event.type,
    event.title,
    targetAppUserId,
    event.user?.id ? String(event.user.id) : "",
    JSON.stringify(event.lines || [])
  ]);
}

export async function listAdminEvents(limit = 20) {
  if (!pool) return null;
  const result = await query(`
    select ae.id, ae.type, ae.title, ae.target_provider_user_id, ae.lines, ae.created_at as "createdAt",
           au.display_name, au.username
    from admin_events ae
    left join app_users au on au.id = ae.target_app_user_id
    order by ae.created_at desc
    limit $1
  `, [limit]);
  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    user: row.target_provider_user_id ? {
      id: row.target_provider_user_id,
      name: row.display_name || "",
      username: row.username || ""
    } : null,
    lines: row.lines || [],
    createdAt: row.createdAt
  }));
}

export async function dashboardStats() {
  if (!pool) return null;
  const result = await query(`
    select
      (select count(*)::int from user_identities where provider = 'telegram') as players,
      (select coalesce(sum(balance), 0)::bigint from wallets) as wallet_total,
      (select coalesce(sum(stack), 0)::bigint from saved_stacks) as saved_stack_total,
      (select coalesce(sum(amount), 0)::bigint from ledger_entries where type = 'credit') as ledger_credit_total,
      (select coalesce(sum(amount), 0)::bigint from ledger_entries where type = 'debit') as ledger_debit_total,
      (select coalesce(sum(amount), 0)::bigint from platform_ledger_entries where type = 'credit') as platform_ledger_credit_total,
      (select coalesce(sum(amount), 0)::bigint from platform_ledger_entries where type = 'debit') as platform_ledger_debit_total,
      (select count(*)::int from hand_histories) as hand_history_count,
      (select coalesce(sum(rake), 0)::bigint from hand_histories) as hand_history_rake_total,
      (select count(*)::int from payment_orders where status = 'paid' and method = 'stars') as paid_stars,
      (select count(*)::int from payment_orders where status = 'pending' and method = 'stars') as pending_stars,
      (select coalesce(sum(chips), 0)::bigint from payment_orders where status = 'paid' and method = 'stars') as paid_stars_chips_total,
      (select coalesce(sum(amount), 0)::bigint from ledger_entries where type = 'credit' and category = 'deposit_stars') as deposit_stars_ledger_total,
      (select count(*)::int from idempotency_keys where expires_at > now()) as idempotency_key_count,
      (select count(*)::int from active_table_snapshots) as active_table_snapshot_count
  `);
  return {
    players: Number(result.rows[0].players || 0),
    walletTotal: Number(result.rows[0].wallet_total || 0),
    savedStackTotal: Number(result.rows[0].saved_stack_total || 0),
    ledgerCreditTotal: Number(result.rows[0].ledger_credit_total || 0),
    ledgerDebitTotal: Number(result.rows[0].ledger_debit_total || 0),
    platformLedgerCreditTotal: Number(result.rows[0].platform_ledger_credit_total || 0),
    platformLedgerDebitTotal: Number(result.rows[0].platform_ledger_debit_total || 0),
    handHistoryCount: Number(result.rows[0].hand_history_count || 0),
    handHistoryRakeTotal: Number(result.rows[0].hand_history_rake_total || 0),
    paidStars: Number(result.rows[0].paid_stars || 0),
    pendingStars: Number(result.rows[0].pending_stars || 0),
    paidStarsChipsTotal: Number(result.rows[0].paid_stars_chips_total || 0),
    depositStarsLedgerTotal: Number(result.rows[0].deposit_stars_ledger_total || 0),
    idempotencyKeyCount: Number(result.rows[0].idempotency_key_count || 0),
    activeTableSnapshotCount: Number(result.rows[0].active_table_snapshot_count || 0)
  };
}

async function ensureIdentity(provider, providerUserId) {
  const providerId = String(providerUserId);
  const existing = await query(
    "select app_user_id from user_identities where provider = $1 and provider_user_id = $2",
    [provider, providerId]
  );
  if (existing.rowCount) return existing.rows[0].app_user_id;

  const appUserId = randomUUID();
  await query("insert into app_users (id) values ($1) on conflict do nothing", [appUserId]);
  await query(`
    insert into user_identities (provider, provider_user_id, app_user_id)
    values ($1, $2, $3)
    on conflict (provider, provider_user_id) do nothing
  `, [provider, providerId, appUserId]);
  await query("insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing", [appUserId]);

  const finalIdentity = await query(
    "select app_user_id from user_identities where provider = $1 and provider_user_id = $2",
    [provider, providerId]
  );
  return finalIdentity.rows[0].app_user_id;
}

async function migrate() {
  // Concurrent instances (Render scaleup, blue-green deploy) могут запускать
  // миграцию одновременно. Advisory lock сериализует их без блокировок
  // на пользовательских транзакциях.
  const MIGRATION_LOCK_KEY = 7421983457;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(`
    create table if not exists app_users (
      id text primary key,
      display_name text not null default 'Player',
      username text not null default '',
      photo_url text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists user_identities (
      provider text not null,
      provider_user_id text not null,
      app_user_id text not null references app_users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (provider, provider_user_id)
    );

    create index if not exists idx_user_identities_app_user_id on user_identities(app_user_id);

    create table if not exists wallets (
      app_user_id text primary key references app_users(id) on delete cascade,
      balance bigint not null default 0 check (balance >= 0),
      updated_at timestamptz not null default now()
    );

    create table if not exists saved_stacks (
      app_user_id text primary key references app_users(id) on delete cascade,
      stack bigint not null default 0 check (stack >= 0),
      updated_at timestamptz not null default now()
    );

    create table if not exists ledger_entries (
      id text primary key,
      app_user_id text not null references app_users(id) on delete cascade,
      provider text not null,
      provider_user_id text not null,
      type text not null check (type in ('credit', 'debit')),
      category text not null default 'other',
      title text not null,
      amount bigint not null check (amount >= 0),
      meta text not null default '',
      balance_after bigint,
      idempotency_key text,
      reversal_of text references ledger_entries(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_ledger_entries_app_user_created on ledger_entries(app_user_id, created_at desc);
    alter table ledger_entries add column if not exists category text not null default 'other';
    alter table ledger_entries add column if not exists idempotency_key text;
    alter table ledger_entries add column if not exists reversal_of text references ledger_entries(id) on delete set null;
    create index if not exists idx_ledger_entries_category_created on ledger_entries(category, created_at desc);
    create unique index if not exists idx_ledger_entries_idempotency_key on ledger_entries(idempotency_key) where idempotency_key is not null;

    create table if not exists fund_movements (
      id text primary key,
      app_user_id text not null references app_users(id) on delete cascade,
      provider text not null,
      provider_user_id text not null,
      category text not null,
      from_bucket text not null,
      to_bucket text not null,
      amount bigint not null check (amount >= 0),
      context_id text not null default '',
      meta text not null default '',
      created_at timestamptz not null default now()
    );

    create index if not exists idx_fund_movements_app_user_created on fund_movements(app_user_id, created_at desc);
    create index if not exists idx_fund_movements_category_created on fund_movements(category, created_at desc);

    create table if not exists tournament_registrations (
      tournament_id text not null,
      app_user_id text not null references app_users(id) on delete cascade,
      provider text not null,
      provider_user_id text not null,
      buy_in bigint not null default 0 check (buy_in >= 0),
      fee bigint not null default 0 check (fee >= 0),
      status text not null default 'active' check (status in ('active', 'cancelled', 'seated', 'finished')),
      registered_at timestamptz not null default now(),
      cancelled_at timestamptz,
      primary key (tournament_id, app_user_id)
    );

    create index if not exists idx_tournament_registrations_status on tournament_registrations(tournament_id, status);
    create index if not exists idx_tournament_registrations_user on tournament_registrations(app_user_id, registered_at desc);

    create table if not exists hand_histories (
      id text primary key,
      table_id text not null,
      table_name text not null default '',
      hand_number integer not null default 0,
      small_blind integer not null default 0,
      big_blind integer not null default 0,
      board jsonb not null default '[]'::jsonb,
      pots jsonb not null default '[]'::jsonb,
      seats jsonb not null default '[]'::jsonb,
      rake bigint not null default 0 check (rake >= 0),
      raw jsonb not null default '{}'::jsonb,
      finished_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create index if not exists idx_hand_histories_finished on hand_histories(finished_at desc);
    create index if not exists idx_hand_histories_table_hand on hand_histories(table_id, hand_number desc);

    create table if not exists platform_ledger_entries (
      id text primary key,
      type text not null check (type in ('credit', 'debit')),
      category text not null,
      title text not null,
      amount bigint not null check (amount >= 0),
      context_id text not null default '',
      meta text not null default '',
      idempotency_key text,
      reversal_of text references platform_ledger_entries(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_platform_ledger_entries_category_created on platform_ledger_entries(category, created_at desc);
    create index if not exists idx_platform_ledger_entries_context on platform_ledger_entries(context_id);
    create unique index if not exists idx_platform_ledger_entries_idempotency_key on platform_ledger_entries(idempotency_key) where idempotency_key is not null;

    create table if not exists payment_orders (
      id text primary key,
      app_user_id text not null references app_users(id) on delete cascade,
      provider text not null,
      provider_user_id text not null,
      method text not null,
      status text not null check (status in ('pending', 'paid', 'expired', 'failed', 'manual_review')),
      rub_amount integer not null default 0,
      chips bigint not null default 0,
      stars integer not null default 0,
      asset text not null default '',
      network text not null default '',
      crypto_amount numeric(24, 8),
      external_id text not null default '',
      payload text not null default '',
      telegram_payment_charge_id text not null default '',
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      expires_at timestamptz,
      paid_at timestamptz
    );

    alter table payment_orders add column if not exists asset text not null default '';
    alter table payment_orders add column if not exists network text not null default '';
    alter table payment_orders add column if not exists crypto_amount numeric(24, 8);
    alter table payment_orders add column if not exists external_id text not null default '';
    alter table payment_orders add column if not exists expires_at timestamptz;
    create index if not exists idx_payment_orders_app_user_created on payment_orders(app_user_id, created_at desc);
    create index if not exists idx_payment_orders_status_created on payment_orders(status, created_at desc);
    create index if not exists idx_payment_orders_external_id on payment_orders(external_id) where external_id <> '';

    create table if not exists idempotency_keys (
      key text primary key,
      scope text not null,
      app_user_id text references app_users(id) on delete set null,
      provider text not null default 'telegram',
      provider_user_id text not null default '',
      request_hash text not null default '',
      response_status integer not null default 200,
      response_body jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );

    create index if not exists idx_idempotency_keys_expires on idempotency_keys(expires_at);
    create index if not exists idx_idempotency_keys_user_created on idempotency_keys(provider, provider_user_id, created_at desc);

    create table if not exists active_table_snapshots (
      id text primary key,
      table_name text not null default '',
      is_private boolean not null default false,
      is_system boolean not null default false,
      small_blind integer not null default 0,
      big_blind integer not null default 0,
      status text not null default 'waiting',
      hand_number integer not null default 0,
      raw jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_active_table_snapshots_updated on active_table_snapshots(updated_at desc);
    create index if not exists idx_active_table_snapshots_status on active_table_snapshots(status, updated_at desc);

    create table if not exists admin_events (
      id text primary key,
      type text not null,
      title text not null,
      target_app_user_id text references app_users(id) on delete set null,
      target_provider_user_id text not null default '',
      lines jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_admin_events_created on admin_events(created_at desc);
    `);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function paymentRow(row) {
  return {
    id: row.id,
    userId: row.provider_user_id,
    provider: row.provider || "telegram",
    method: row.method || "stars",
    userName: row.userName || row.display_name || "",
    username: row.username || "",
    rubAmount: Number(row.rub_amount || 0),
    chips: Number(row.chips || 0),
    stars: Number(row.stars || 0),
    asset: row.asset || "",
    network: row.network || "",
    cryptoAmount: row.crypto_amount === null || row.crypto_amount === undefined ? null : Number(row.crypto_amount),
    externalId: row.external_id || "",
    status: row.status,
    payload: row.payload || "",
    telegramPaymentChargeId: row.telegram_payment_charge_id || "",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at
  };
}

function query(sql, params = []) {
  return pool.query(sql, params);
}

function normalizeLedgerCategory(category) {
  return String(category || "other").trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 64) || "other";
}

function normalizeIdempotencyKey(key) {
  return String(key || "").trim().replace(/\s+/g, "_").slice(0, 240);
}

function id(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
