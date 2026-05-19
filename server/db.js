import { randomUUID } from "node:crypto";

let pool = null;

export function databaseEnabled() {
  return Boolean(pool);
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
        id, app_user_id, provider, provider_user_id, type, title, amount, meta, balance_after
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      entry.id || id("ledger"),
      appUserId,
      provider,
      String(providerUserId),
      entry.type,
      entry.title,
      amount,
      entry.meta || "",
      after
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
    select id, type, title, amount, meta, created_at as "createdAt"
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
      rub_amount, chips, stars, payload, raw
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
    order.payload || "",
    JSON.stringify(order)
  ]);
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
      (select count(*)::int from payment_orders where status = 'paid') as paid_stars,
      (select count(*)::int from payment_orders where status = 'pending') as pending_stars
  `);
  return {
    players: Number(result.rows[0].players || 0),
    walletTotal: Number(result.rows[0].wallet_total || 0),
    savedStackTotal: Number(result.rows[0].saved_stack_total || 0),
    ledgerCreditTotal: Number(result.rows[0].ledger_credit_total || 0),
    ledgerDebitTotal: Number(result.rows[0].ledger_debit_total || 0),
    paidStars: Number(result.rows[0].paid_stars || 0),
    pendingStars: Number(result.rows[0].pending_stars || 0)
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
  await query(`
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
      title text not null,
      amount bigint not null check (amount >= 0),
      meta text not null default '',
      balance_after bigint,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_ledger_entries_app_user_created on ledger_entries(app_user_id, created_at desc);

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
      payload text not null default '',
      telegram_payment_charge_id text not null default '',
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      paid_at timestamptz
    );

    create index if not exists idx_payment_orders_app_user_created on payment_orders(app_user_id, created_at desc);
    create index if not exists idx_payment_orders_status_created on payment_orders(status, created_at desc);

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
}

function paymentRow(row) {
  return {
    id: row.id,
    userId: row.provider_user_id,
    userName: row.userName || row.display_name || "",
    username: row.username || "",
    rubAmount: Number(row.rub_amount || 0),
    chips: Number(row.chips || 0),
    stars: Number(row.stars || 0),
    status: row.status,
    payload: row.payload || "",
    telegramPaymentChargeId: row.telegram_payment_charge_id || "",
    createdAt: row.created_at,
    paidAt: row.paid_at
  };
}

function query(sql, params = []) {
  return pool.query(sql, params);
}

function id(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
