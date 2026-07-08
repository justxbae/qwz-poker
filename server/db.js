import { createHash, randomUUID } from "node:crypto";
import {
  RATING,
  advanceWelcomeBonusWagering,
  cashClubPointsFromRake,
  cashClubProgress,
  cashClubStatus,
  nextRatingPoints,
  quoteWelcomeBonus,
  ratingDeltaForHand,
  ratingLeague
} from "./economy.js";

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

export async function getCashWallet(providerUserId, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query("select cash_usdt_micros from wallets where app_user_id = $1", [appUserId]);
  return result.rowCount ? Number(result.rows[0].cash_usdt_micros || 0) : 0;
}

export async function getDailyPlayClaim(providerUserId, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query(`
    select claimed_at as "claimedAt"
    from daily_play_claims
    where app_user_id = $1
  `, [appUserId]);
  return { claimedAt: result.rows[0]?.claimedAt || null };
}

export async function claimDailyPlayChips(providerUserId, {
  amount = 35_000,
  cooldownSeconds = 24 * 60 * 60,
  idempotencyKey = ""
} = {}, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const normalizedAmount = Math.max(1, Math.round(Number(amount) || 35_000));
  const normalizedCooldown = Math.max(1, Math.round(Number(cooldownSeconds) || 24 * 60 * 60));
  const ledgerKey = normalizeIdempotencyKey(idempotencyKey);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(`
      insert into daily_play_claims (app_user_id)
      values ($1)
      on conflict do nothing
    `, [appUserId]);
    const claimState = await client.query(`
      select claimed_at as "claimedAt", now() as "currentTime"
      from daily_play_claims
      where app_user_id = $1
      for update
    `, [appUserId]);
    await client.query(
      "insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing",
      [appUserId]
    );
    const wallet = await client.query(
      "select balance from wallets where app_user_id = $1 for update",
      [appUserId]
    );
    const balance = Number(wallet.rows[0]?.balance || 0);

    if (ledgerKey) {
      const existing = await client.query(`
        select 1
        from ledger_entries
        where idempotency_key = $1
        limit 1
      `, [ledgerKey]);
      if (existing.rowCount) {
        await client.query("commit");
        return {
          claimed: true,
          claimedAt: claimState.rows[0]?.claimedAt || null,
          balance,
          idempotentReplay: true
        };
      }
    }

    const currentTime = new Date(claimState.rows[0].currentTime).getTime();
    const claimedAt = claimState.rows[0].claimedAt ? new Date(claimState.rows[0].claimedAt).getTime() : 0;
    const availableAt = claimedAt ? claimedAt + normalizedCooldown * 1000 : currentTime;
    if (claimedAt && availableAt > currentTime) {
      await client.query("commit");
      return {
        claimed: false,
        claimedAt: new Date(claimedAt).toISOString(),
        balance,
        cooldown: true
      };
    }

    const after = balance + normalizedAmount;
    const updatedClaim = await client.query(`
      update daily_play_claims
      set claimed_at = now(), updated_at = now()
      where app_user_id = $1
      returning claimed_at as "claimedAt"
    `, [appUserId]);
    await client.query(
      "update wallets set balance = $2, updated_at = now() where app_user_id = $1",
      [appUserId, after]
    );
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title,
        amount, meta, balance_after, idempotency_key, asset, balance_bucket
      )
      values ($1, $2, $3, $4, 'credit', 'daily_play_claim', 'Ежедневные игровые фишки',
              $5, '24h rating play claim', $6, $7, 'PLAY_CHIPS', 'play')
    `, [
      id("ledger"),
      appUserId,
      provider,
      String(providerUserId),
      normalizedAmount,
      after,
      ledgerKey || null
    ]);
    await client.query("commit");
    return {
      claimed: true,
      claimedAt: updatedClaim.rows[0].claimedAt,
      balance: after,
      idempotentReplay: false
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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

export async function setCashWallet(providerUserId, balance, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const normalized = Math.max(0, Math.round(Number(balance) || 0));
  await query(`
    insert into wallets (app_user_id, cash_usdt_micros, updated_at)
    values ($1, $2, now())
    on conflict (app_user_id) do update set cash_usdt_micros = excluded.cash_usdt_micros, updated_at = now()
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

export async function addCashWalletEntry(providerUserId, entry, provider = "telegram") {
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
  const delta = (entry.type === "debit" ? -1 : 1) * amount;
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      "insert into wallets (app_user_id, cash_usdt_micros) values ($1, 0) on conflict do nothing",
      [appUserId]
    );
    const current = await client.query(
      "select cash_usdt_micros from wallets where app_user_id = $1 for update",
      [appUserId]
    );
    const before = Number(current.rows[0]?.cash_usdt_micros || 0);
    const after = before + delta;
    if (after < 0) {
      const error = new Error("Недостаточно USDT на балансе");
      error.status = 409;
      throw error;
    }

    await client.query(
      "update wallets set cash_usdt_micros = $2, updated_at = now() where app_user_id = $1",
      [appUserId, after]
    );
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta, balance_after,
        idempotency_key, asset, balance_bucket
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'USDT', 'cash_usdt')
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

export async function applyTableWalletMutation(providerUserId, {
  table,
  entry,
  movement = null,
  deleteSnapshot = false
} = {}, provider = "telegram") {
  if (!pool) return null;
  if (!table?.id || !entry) throw new Error("Table wallet mutation requires table and ledger entry");
  const appUserId = await ensureIdentity(provider, providerUserId);
  const cashMode = table.gameMode === "cash";
  const column = cashMode ? "cash_usdt_micros" : "balance";
  const bucket = cashMode ? "cash_usdt" : "play";
  const asset = cashMode ? "USDT" : "PLAY_CHIPS";
  const amount = Math.max(0, Math.round(Number(entry.amount) || 0));
  const idempotencyKey = normalizeIdempotencyKey(entry.idempotencyKey);
  const delta = (entry.type === "debit" ? -1 : 1) * amount;
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (idempotencyKey) {
      const existing = await client.query(`
        select le.balance_after as balance, ats.raw as snapshot
        from ledger_entries le
        left join active_table_snapshots ats on ats.id = $2
        where le.idempotency_key = $1
        limit 1
      `, [idempotencyKey, table.id]);
      if (existing.rowCount) {
        await client.query("commit");
        return {
          balance: Number(existing.rows[0].balance || 0),
          snapshot: existing.rows[0].snapshot || null,
          idempotentReplay: true
        };
      }
    }
    await client.query("insert into wallets (app_user_id) values ($1) on conflict do nothing", [appUserId]);
    const current = await client.query(`select ${column} as balance from wallets where app_user_id = $1 for update`, [appUserId]);
    const before = Number(current.rows[0]?.balance || 0);
    const after = before + delta;
    if (after < 0) {
      const error = new Error(cashMode ? "Недостаточно USDT на балансе" : "Недостаточно PLAY_CHIPS на балансе");
      error.status = 409;
      throw error;
    }
    await client.query(`update wallets set ${column} = $2, updated_at = now() where app_user_id = $1`, [appUserId, after]);
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta,
        balance_after, idempotency_key, asset, balance_bucket
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      entry.id || id("ledger"), appUserId, provider, String(providerUserId), entry.type,
      normalizeLedgerCategory(entry.category), entry.title, amount, entry.meta || "", after,
      idempotencyKey || null, asset, bucket
    ]);
    if (movement && amount > 0) {
      await client.query(`
        insert into fund_movements (
          id, app_user_id, provider, provider_user_id, category, from_bucket, to_bucket,
          amount, context_id, meta
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        movement.id || id("move"), appUserId, provider, String(providerUserId), movement.category,
        movement.from, movement.to, Math.max(0, Math.round(Number(movement.amount ?? amount) || 0)),
        movement.contextId || table.id, movement.meta || ""
      ]);
    }
    if (deleteSnapshot) {
      await client.query("delete from active_table_snapshots where id = $1", [table.id]);
    } else {
      await client.query(`
        insert into active_table_snapshots (
          id, table_name, is_private, is_system, small_blind, big_blind, status, hand_number, raw, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
        on conflict (id) do update set
          table_name=excluded.table_name, is_private=excluded.is_private, is_system=excluded.is_system,
          small_blind=excluded.small_blind, big_blind=excluded.big_blind, status=excluded.status,
          hand_number=excluded.hand_number, raw=excluded.raw, updated_at=now()
      `, [
        table.id, table.name || "", Boolean(table.isPrivate), Boolean(table.isSystem),
        Number(table.smallBlind || 0), Number(table.bigBlind || 0), table.status || "waiting",
        Number(table.handNumber || 0), JSON.stringify(table)
      ]);
    }
    await client.query("commit");
    return { balance: after, before, snapshot: deleteSnapshot ? null : table };
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

export async function listCashLedger(providerUserId, limit = 30, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query(`
    select id, type, category, title, amount, meta, asset, balance_bucket as "balanceBucket", created_at as "createdAt"
    from ledger_entries
    where app_user_id = $1 and balance_bucket in ('cash_usdt', 'cash')
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
      board, pots, seats, rake, fairness_proof, raw, finished_at
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12::jsonb, to_timestamp($13 / 1000.0))
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
    JSON.stringify(hand.fairnessProof || {}),
    JSON.stringify(hand),
    Number(hand.at || Date.now())
  ]);
  return true;
}

export async function getPlayerProfile(providerUserId, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  await query("insert into player_profiles (app_user_id) values ($1) on conflict do nothing", [appUserId]);
  const result = await query(`
    select cash_level, cash_xp, cash_status, rating_points, rating_tier, rating_season_id,
           cash_club_points, cash_rake_contributed, rating_peak_points, rating_active_days,
           tournament_entries, tournament_itm, tournament_final_tables, tournament_wins,
           tournament_fees_paid, tournament_cash_fees_paid_micros, tournament_play_fees_paid, tournament_prize_won,
           tournament_cash_prize_won_micros, tournament_play_prize_won,
           sng_played, sng_wins, sng_fees_paid, sng_cash_fees_paid_micros, sng_play_fees_paid, sng_prize_won,
           sng_cash_prize_won_micros, sng_play_prize_won,
           hands_played, cash_hands_played, rating_hands_played, tournaments_played
    from player_profiles
    where app_user_id = $1
  `, [appUserId]);
  return normalizePlayerProfileRow(result.rows[0]);
}

export async function recordProfileHandProgress({
  providerUserIds = [],
  provider = "telegram",
  gameMode = "play",
  handId = "",
  hand = null,
  table = null
} = {}) {
  if (!pool) return null;
  const uniqueIds = [...new Set(providerUserIds.map(String).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const cashMode = gameMode === "cash";
  const ratingEligible = gameMode === "play" && !Boolean(table?.isPrivate) && !Boolean(table?.tournamentId);
  const seasonId = activeRatingSeasonId();
  const handSeats = Array.isArray(hand?.seats) ? hand.seats : [];
  const seatByUserId = new Map(handSeats.map((seat) => [String(seat.userId || ""), seat]));
  const activePlayers = handSeats.filter((seat) => seat.userId).length;
  const changes = [];
  for (const providerUserId of uniqueIds) {
    const appUserId = await ensureIdentity(provider, providerUserId);
    await query("insert into player_profiles (app_user_id) values ($1) on conflict do nothing", [appUserId]);
    const progressKey = String(handId || "");
    if (progressKey) {
      const mark = await query(`
        insert into profile_hand_progress (hand_id, app_user_id, game_mode)
        values ($1, $2, $3)
        on conflict do nothing
        returning hand_id
      `, [progressKey, appUserId, gameMode === "tournament" ? "tournament" : cashMode ? "cash" : "play"]);
      if (!mark.rowCount) continue;
    }
    const seatResult = seatByUserId.get(String(providerUserId)) || {};
    const rakeShare = cashMode ? Math.max(0, Number(seatResult.rakeContributed || 0)) : 0;
    const ratingDelta = ratingEligible ? ratingDeltaForHand({
      profit: Number(seatResult.profit || 0),
      bigBlind: Number(table?.bigBlind || 0),
      isPrivate: Boolean(table?.isPrivate),
      activePlayers
    }) : 0;
    const clubPointsDelta = cashMode ? cashClubPointsFromRake(rakeShare) : 0;
    const currentResult = await query(`
      select cash_xp, cash_club_points, cash_rake_contributed, rating_points, rating_peak_points,
             cash_hands_played, rating_hands_played
      from player_profiles
      where app_user_id = $1
      for update
    `, [appUserId]);
    const current = currentResult.rows[0] || {};
    const currentClubPoints = Number(current.cash_club_points ?? current.cash_xp ?? 0);
    const nextClubPoints = currentClubPoints + clubPointsDelta;
    const clubStatus = cashClubStatus(nextClubPoints);
    const nextRatingPointsValue = cashMode
      ? Number(current.rating_points || RATING.seasonStartingRp)
      : nextRatingPoints(Number(current.rating_points || RATING.seasonStartingRp), ratingDelta);
    const nextRatingPeak = Math.max(Number(current.rating_peak_points || 0), nextRatingPointsValue);
    const nextRatingTier = ratingLeague(nextRatingPointsValue).title;
    const updated = await query(`
      update player_profiles
      set cash_xp = $2,
          cash_club_points = $2,
          cash_level = $3,
          cash_status = $4,
          cash_rake_contributed = cash_rake_contributed + $5,
          rating_points = $6,
          rating_peak_points = $7,
          rating_tier = $8,
          rating_season_id = case when $9 <> '' then $9 else rating_season_id end,
          rating_active_days = rating_active_days + case
            when $10::boolean and not exists (
              select 1 from profile_hand_progress php
              where php.app_user_id = player_profiles.app_user_id
                and php.game_mode = 'play'
                and php.created_at::date = now()::date
                and php.hand_id <> $11
            ) then 1 else 0 end,
          hands_played = hands_played + 1,
          cash_hands_played = cash_hands_played + $12,
          rating_hands_played = rating_hands_played + $13,
          updated_at = now()
      where app_user_id = $1
      returning cash_level, cash_xp, cash_status, rating_points, rating_tier, rating_season_id,
                cash_club_points, cash_rake_contributed, rating_peak_points, rating_active_days,
                tournament_entries, tournament_itm, tournament_final_tables, tournament_wins,
                tournament_fees_paid, tournament_cash_fees_paid_micros, tournament_play_fees_paid, tournament_prize_won,
                tournament_cash_prize_won_micros, tournament_play_prize_won,
                sng_played, sng_wins, sng_fees_paid, sng_cash_fees_paid_micros, sng_play_fees_paid, sng_prize_won,
                sng_cash_prize_won_micros, sng_play_prize_won,
                hands_played, cash_hands_played, rating_hands_played, tournaments_played
    `, [
      appUserId,
      nextClubPoints,
      profileCashLevel(nextClubPoints),
      clubStatus.title,
      cashMode ? rakeShare : 0,
      nextRatingPointsValue,
      nextRatingPeak,
      nextRatingTier,
      ratingEligible ? seasonId : "",
      ratingEligible,
      progressKey,
      cashMode ? 1 : 0,
      ratingEligible ? 1 : 0
    ]);
    if (ratingEligible && ratingDelta !== 0) {
      await query(`
        insert into rating_entries (
          id, season_id, app_user_id, provider, provider_user_id, type,
          points_delta, points_after, source_id, meta
        )
        values ($1, $2, $3, $4, $5, 'hand', $6, $7, $8, $9::jsonb)
      `, [
        id("rating"),
        seasonId,
        appUserId,
        provider,
        String(providerUserId),
        ratingDelta,
        nextRatingPointsValue,
        progressKey,
        JSON.stringify({
          profit: Number(seatResult.profit || 0),
          bigBlind: Number(table?.bigBlind || 0),
          activePlayers,
          tableId: table?.id || ""
        })
      ]);
    }
    changes.push({
      providerUserId,
      handId,
      ratingDelta,
      clubPointsDelta,
      profile: normalizePlayerProfileRow(updated.rows[0])
    });
  }
  return changes;
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
      id, type, category, title, amount, context_id, meta, idempotency_key, asset, balance_bucket
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
    idempotencyKey || null,
    entry.asset || "PLAY_CHIPS",
    entry.balanceBucket === "cash" ? "cash" : "play"
  ]);
  return { id: result.rows[0]?.id || null };
}

export async function listHandHistories(limit = 20) {
  if (!pool) return null;
  const result = await query(`
    select id, table_id as "tableId", table_name as "tableName", hand_number as "handNumber",
           small_blind as "smallBlind", big_blind as "bigBlind", board, pots, seats, rake,
           fairness_proof as "fairnessProof", finished_at as "finishedAt"
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

export async function listTournaments({ includeArchived = true } = {}) {
  if (!pool) return null;
  const result = await query(`
    select id, title, type, status, balance_bucket as "balanceBucket",
           buy_in as "buyIn", fee, guaranteed_prize_pool as "guaranteedPrizePool",
           max_players as "maxPlayers", min_players as "minPlayers",
           max_players_per_table as "maxPlayersPerTable", starting_stack as "startingStack",
           structure, payout_structure as "payoutStructure",
           registration_opens_at as "registrationOpensAt", starts_at as "startsAt",
           late_reg_ends_at as "lateRegEndsAt", re_entry_limit as "reEntryLimit",
           add_on_allowed as "addOnAllowed", current_level as "currentLevel",
           started_at as "startedAt", finished_at as "finishedAt", cancelled_at as "cancelledAt",
           raw, created_at as "createdAt", updated_at as "updatedAt"
    from tournaments
    where $1::boolean = true
       or status not in ('finished', 'cancelled')
    order by starts_at asc, created_at asc
  `, [includeArchived]);
  return result.rows.map(normalizeTournamentDefinitionRow);
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
    where tr.status in ('active', 'seated')
      and tr.tournament_id = any($1::text[])
    order by tr.registered_at asc
  `, [tournamentIds]);
  return result.rows.map((row) => ({
    ...row,
    buyIn: Number(row.buyIn || 0),
    fee: Number(row.fee || 0)
  }));
}

export async function listTournamentStates(tournamentIds = []) {
  if (!pool) return null;
  if (!tournamentIds.length) return [];
  const [stateRows, resultRows] = await Promise.all([
    query(`
      select id, status, starts_at as "startsAt", registration_opens_at as "registrationOpensAt",
             late_reg_ends_at as "lateRegEndsAt", current_level as "currentLevel",
             started_at as "startedAt", finished_at as "finishedAt", cancelled_at as "cancelledAt", raw
      from tournaments where id = any($1::text[])
    `, [tournamentIds]),
    query(`
      select tr.tournament_id as "tournamentId", ui.provider_user_id as "userId",
             au.display_name as name, au.username, tr.place,
             tr.prize_amount as "prizeAmount", tr.eliminated_at as "eliminatedAt"
      from tournament_results tr
      join app_users au on au.id = tr.app_user_id
      left join user_identities ui on ui.app_user_id = tr.app_user_id and ui.provider = 'telegram'
      where tr.tournament_id = any($1::text[])
      order by tr.tournament_id, tr.place
    `, [tournamentIds])
  ]);
  return stateRows.rows.map((row) => ({
    ...row,
    currentLevel: Number(row.currentLevel || 1),
    eliminations: Array.isArray(row.raw?.eliminations) ? row.raw.eliminations : [],
    results: resultRows.rows.filter((result) => result.tournamentId === row.id).map((result) => ({
      ...result,
      place: Number(result.place || 0),
      prizeAmount: Number(result.prizeAmount || 0)
    }))
  }));
}

export async function upsertTournamentDefinitions(tournaments = []) {
  if (!pool) return null;
  for (const tournament of tournaments) {
    await query(`
      insert into tournaments (
        id, title, type, status, balance_bucket, buy_in, fee, guaranteed_prize_pool,
        max_players, min_players, max_players_per_table, starting_stack, structure,
        payout_structure, registration_opens_at, starts_at, late_reg_ends_at,
        re_entry_limit, add_on_allowed, current_level, raw, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
        $14::jsonb, $15, $16, $17, $18, $19, $20, $21::jsonb, now()
      )
      on conflict (id) do update set
        title = excluded.title,
        type = excluded.type,
        balance_bucket = excluded.balance_bucket,
        buy_in = excluded.buy_in,
        fee = excluded.fee,
        guaranteed_prize_pool = excluded.guaranteed_prize_pool,
        max_players = excluded.max_players,
        min_players = excluded.min_players,
        max_players_per_table = excluded.max_players_per_table,
        starting_stack = excluded.starting_stack,
        structure = excluded.structure,
        payout_structure = excluded.payout_structure,
        re_entry_limit = excluded.re_entry_limit,
        add_on_allowed = excluded.add_on_allowed,
        raw = excluded.raw,
        updated_at = now()
    `, [
      tournament.id,
      tournament.title,
      tournament.type,
      tournament.status,
      tournament.balanceBucket,
      tournament.buyIn,
      tournament.fee,
      tournament.guaranteedPrizePool || 0,
      tournament.maxPlayers,
      tournament.minPlayers,
      tournament.maxPlayersPerTable,
      tournament.startingStack,
      JSON.stringify(tournament.structure || []),
      tournament.payoutStructure ? JSON.stringify(tournament.payoutStructure) : null,
      tournament.registrationOpensAt,
      tournament.startsAt,
      tournament.lateRegEndsAt,
      tournament.reEntryLimit || 0,
      tournament.addOnAllowed === true,
      tournament.currentLevel || 1,
      JSON.stringify(tournamentRawDocument(tournament))
    ]);
  }
  return true;
}

export async function updateTournamentState(tournament) {
  if (!pool) return null;
  await query(`
    update tournaments
    set status = $2,
        current_level = $3,
        started_at = $4,
        finished_at = $5,
        cancelled_at = $6,
        raw = coalesce(raw, '{}'::jsonb) || $7::jsonb,
        updated_at = now()
    where id = $1
  `, [
    tournament.id,
    tournament.status,
    tournament.currentLevel || 1,
    tournament.startedAt || null,
    tournament.finishedAt || null,
    tournament.cancelledAt || null,
    JSON.stringify({
      ...tournamentRawDocument(tournament),
      eliminations: tournament.eliminations || []
    })
  ]);
  return true;
}

export async function saveTournamentTables(tournamentId, tables = []) {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("update tournament_tables set status = 'closed', updated_at = now() where tournament_id = $1", [tournamentId]);
    for (const table of tables) {
      await client.query(`
        insert into tournament_tables (
          id, tournament_id, table_number, status, small_blind, big_blind, ante, seats, updated_at
        ) values ($1, $2, $3, 'active', $4, $5, $6, $7::jsonb, now())
        on conflict (id) do update set
          status = 'active', small_blind = excluded.small_blind, big_blind = excluded.big_blind,
          ante = excluded.ante, seats = excluded.seats, updated_at = now()
      `, [
        table.id,
        tournamentId,
        table.tableNumber,
        table.smallBlind || 0,
        table.bigBlind || 0,
        table.ante || 0,
        JSON.stringify(table.seats || [])
      ]);
    }
    await client.query(`
      update tournament_registrations
      set status = 'seated'
      where tournament_id = $1 and status = 'active'
    `, [tournamentId]);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function settleTournament(tournament, rankedPlayers, payouts, idempotencyKey) {
  if (!pool) return null;
  const client = await pool.connect();
  const bucket = tournament.balanceBucket === "cash" ? "cash" : "play";
  try {
    await client.query("begin");
    const locked = await client.query("select status from tournaments where id = $1 for update", [tournament.id]);
    if (!locked.rowCount) throw new Error("Tournament persistence row is missing");
    if (locked.rows[0].status === "finished") {
      await client.query("commit");
      return { idempotentReplay: true };
    }

    const registrations = await client.query(`
      select app_user_id, provider, provider_user_id
      from tournament_registrations
      where tournament_id = $1 and status in ('active', 'seated')
      for update
    `, [tournament.id]);
    const byProviderUserId = new Map(registrations.rows.map((row) => [String(row.provider_user_id), row]));
    const payoutByUserId = new Map(payouts.map((payout) => [String(payout.userId), payout]));
    const payoutTotal = payouts.reduce((sum, payout) => sum + Math.max(0, Math.round(Number(payout.amount) || 0)), 0);
    const buyInPool = Math.max(0, Math.round(Number(tournament.buyIn) || 0)) * registrations.rowCount;
    const guaranteeFunding = Math.max(0, payoutTotal - buyInPool);
    if (guaranteeFunding > 0) {
      await client.query(`
        insert into platform_ledger_entries (
          id, type, category, title, amount, context_id, meta, idempotency_key, asset, balance_bucket
        ) values ($1, 'debit', 'tournament_guarantee', 'Гарантия призового фонда', $2, $3, $4, $5, 'USDT', 'cash')
      `, [id("platform"), guaranteeFunding, tournament.id, tournament.title, `${idempotencyKey}:guarantee`]);
    }

    for (const result of rankedPlayers) {
      const registration = byProviderUserId.get(String(result.userId));
      if (!registration) continue;
      const payout = payoutByUserId.get(String(result.userId));
      const amount = Math.max(0, Math.round(Number(payout?.amount) || 0));
      await client.query(`
        insert into tournament_results (
          tournament_id, app_user_id, place, prize_amount, balance_bucket, eliminated_at
        ) values ($1, $2, $3, $4, $5, $6)
        on conflict (tournament_id, app_user_id) do nothing
      `, [tournament.id, registration.app_user_id, result.place, amount, bucket, result.eliminatedAt || null]);
      if (amount <= 0) continue;

      await client.query("insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing", [registration.app_user_id]);
      const column = bucket === "cash" ? "cash_usdt_micros" : "balance";
      const wallet = await client.query(`select ${column} as balance from wallets where app_user_id = $1 for update`, [registration.app_user_id]);
      const after = Number(wallet.rows[0]?.balance || 0) + amount;
      await client.query(`update wallets set ${column} = $2, updated_at = now() where app_user_id = $1`, [registration.app_user_id, after]);
      const payoutKey = `${idempotencyKey}:${result.userId}`;
      await client.query(`
        insert into ledger_entries (
          id, app_user_id, provider, provider_user_id, type, category, title, amount,
          meta, balance_after, idempotency_key, asset, balance_bucket
        ) values ($1, $2, $3, $4, 'credit', 'tournament_payout', 'Приз турнира', $5,
          $6, $7, $8, $9, $10)
      `, [
        id("ledger"), registration.app_user_id, registration.provider, registration.provider_user_id,
        amount, `${tournament.title} · место ${result.place}`, after, payoutKey,
        bucket === "cash" ? "USDT" : "PLAY_CHIPS", bucket
      ]);
      await client.query(`
        insert into tournament_payouts (
          id, tournament_id, app_user_id, place, amount, balance_bucket, idempotency_key
        ) values ($1, $2, $3, $4, $5, $6, $7)
      `, [id("tpayout"), tournament.id, registration.app_user_id, result.place, amount, bucket, payoutKey]);
    }

    const paidPlaces = payouts.length;
    await client.query(`
      update player_profiles pp
      set tournament_itm = tournament_itm + case when tr.place <= $2 then 1 else 0 end,
          tournament_final_tables = tournament_final_tables + case when tr.place <= $3 then 1 else 0 end,
          tournament_wins = tournament_wins + case when tr.place = 1 then 1 else 0 end,
          tournament_prize_won = tournament_prize_won + case when $5 = 'play' then tr.prize_amount else 0 end,
          tournament_play_prize_won = tournament_play_prize_won + case when $5 = 'play' then tr.prize_amount else 0 end,
          tournament_cash_prize_won_micros = tournament_cash_prize_won_micros + case when $5 = 'cash' then tr.prize_amount else 0 end,
          sng_played = sng_played + case when $4 = 'sng' then 1 else 0 end,
          sng_wins = sng_wins + case when $4 = 'sng' and tr.place = 1 then 1 else 0 end,
          sng_prize_won = sng_prize_won + case when $4 = 'sng' and $5 = 'play' then tr.prize_amount else 0 end,
          sng_play_prize_won = sng_play_prize_won + case when $4 = 'sng' and $5 = 'play' then tr.prize_amount else 0 end,
          sng_cash_prize_won_micros = sng_cash_prize_won_micros + case when $4 = 'sng' and $5 = 'cash' then tr.prize_amount else 0 end,
          updated_at = now()
      from tournament_results tr
      where tr.tournament_id = $1 and tr.app_user_id = pp.app_user_id
    `, [tournament.id, paidPlaces, tournament.maxPlayersPerTable, tournament.type, bucket]);
    await client.query("update tournament_registrations set status = 'finished' where tournament_id = $1 and status in ('active', 'seated')", [tournament.id]);
    await client.query(`
      update tournaments set status = 'finished', finished_at = now(), updated_at = now() where id = $1
    `, [tournament.id]);
    await client.query("update tournament_tables set status = 'closed', updated_at = now() where tournament_id = $1", [tournament.id]);
    await client.query("commit");
    return { idempotentReplay: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listTournamentHistory(providerUserId, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query(`
    select tr.tournament_id as "tournamentId", t.title, t.type, t.status,
           tr.place, tr.prize_amount as "prizeAmount", tr.balance_bucket as "balanceBucket",
           tr.created_at as "finishedAt"
    from tournament_results tr
    join tournaments t on t.id = tr.tournament_id
    where tr.app_user_id = $1
    order by tr.created_at desc
  `, [appUserId]);
  return result.rows.map((row) => ({
    ...row,
    place: Number(row.place || 0),
    prizeAmount: Number(row.prizeAmount || 0)
  }));
}

export async function listRewardTournamentEvents() {
  if (!pool) return null;
  const result = await query(`
    select rte.id, rte.title, rte.season_id as "seasonId", rte.status,
           rte.starts_at as "startsAt", rte.description, rte.raw,
           rte.created_at as "createdAt", rte.updated_at as "updatedAt",
           count(rt.id)::int as "ticketCount",
           count(rt.id) filter (where rt.status = 'used')::int as "usedTicketCount"
    from reward_tournament_events rte
    left join reward_tickets rt on rt.event_id = rte.id
    group by rte.id
    order by coalesce(rte.starts_at, rte.created_at) desc, rte.created_at desc
  `);
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    seasonId: row.seasonId || "",
    status: row.status,
    startsAt: row.startsAt,
    description: row.description || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ticketCount: Number(row.ticketCount || 0),
    usedTicketCount: Number(row.usedTicketCount || 0),
    raw: row.raw || {}
  }));
}

export async function getRewardTournamentEvent(eventId) {
  if (!pool) return null;
  const [eventResult, ticketResult] = await Promise.all([
    query(`
      select id, title, season_id as "seasonId", status,
             starts_at as "startsAt", description, raw,
             created_at as "createdAt", updated_at as "updatedAt"
      from reward_tournament_events
      where id = $1
      limit 1
    `, [eventId]),
    query(`
      select rt.id, rt.provider_user_id as "userId", rt.provider, rt.leaderboard_rank as "leaderboardRank",
             rt.status, rt.granted_at as "grantedAt", rt.used_at as "usedAt",
             au.display_name as name, au.username, rt.raw
      from reward_tickets rt
      left join app_users au on au.id = rt.app_user_id
      where rt.event_id = $1
      order by rt.leaderboard_rank asc, rt.granted_at asc
    `, [eventId])
  ]);
  if (!eventResult.rowCount) return null;
  const event = eventResult.rows[0];
  return {
    id: event.id,
    title: event.title,
    seasonId: event.seasonId || "",
    status: event.status,
    startsAt: event.startsAt,
    description: event.description || "",
    raw: event.raw || {},
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    tickets: ticketResult.rows.map((ticket) => ({
      id: ticket.id,
      userId: ticket.userId,
      provider: ticket.provider,
      leaderboardRank: Number(ticket.leaderboardRank || 0),
      status: ticket.status,
      grantedAt: ticket.grantedAt,
      usedAt: ticket.usedAt,
      name: ticket.name || "Player",
      username: ticket.username || "",
      raw: ticket.raw || {}
    }))
  };
}

export async function createRewardTournamentEvent(event, tickets = []) {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`
      insert into reward_tournament_events (
        id, title, season_id, status, starts_at, description, raw, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
    `, [
      event.id,
      event.title,
      event.seasonId || "",
      event.status || "tickets_issued",
      event.startsAt ? new Date(event.startsAt) : null,
      event.description || "",
      JSON.stringify(event.raw || {})
    ]);
    for (const ticket of tickets) {
      const appUserId = await ensureIdentity(ticket.provider || "telegram", ticket.userId);
      await client.query(`
        insert into reward_tickets (
          id, event_id, app_user_id, provider, provider_user_id, leaderboard_rank,
          status, granted_at, used_at, raw
        ) values ($1, $2, $3, $4, $5, $6, 'active', now(), null, $7::jsonb)
        on conflict (event_id, app_user_id) do update set
          leaderboard_rank = excluded.leaderboard_rank,
          status = 'active',
          granted_at = now(),
          used_at = null,
          raw = excluded.raw
      `, [
        ticket.id || id("rticket"),
        event.id,
        appUserId,
        ticket.provider || "telegram",
        String(ticket.userId),
        Number(ticket.leaderboardRank || 0),
        JSON.stringify(ticket.raw || {})
      ]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getRewardTournamentEvent(event.id);
}

export async function registerTournament(providerUserId, tournament, provider = "telegram", idempotencyKey = "") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const buyIn = Math.max(0, Math.round(Number(tournament.buyIn) || 0));
  const fee = Math.max(0, Math.round(Number(tournament.fee) || 0));
  const totalCost = buyIn + fee;
  const bucket = tournament.balanceBucket === "cash" ? "cash" : "play";
  const walletColumn = bucket === "cash" ? "cash_usdt_micros" : "balance";
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
      const wallet = await client.query(`select ${walletColumn} as balance from wallets where app_user_id = $1`, [appUserId]);
      await client.query("commit");
      return bucket === "cash"
        ? { cashBalanceMicros: Number(wallet.rows[0]?.balance || 0), alreadyRegistered: true }
        : { balance: Number(wallet.rows[0]?.balance || 0), alreadyRegistered: true };
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

    const current = await client.query(`select ${walletColumn} as balance from wallets where app_user_id = $1 for update`, [appUserId]);
    const before = Number(current.rows[0]?.balance || 0);
    const after = before - totalCost;
    if (after < 0) {
      const unit = bucket === "cash" ? "USDT micros" : "chips";
      const error = new Error(`Недостаточно средств для регистрации. Нужно ${totalCost.toLocaleString("ru-RU")} ${unit}`);
      error.status = 409;
      throw error;
    }

    await client.query(`update wallets set ${walletColumn} = $2, updated_at = now() where app_user_id = $1`, [appUserId, after]);
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta,
        balance_after, idempotency_key, asset, balance_bucket
      )
      values ($1, $2, $3, $4, 'debit', 'tournament_buyin', 'Вход в турнир', $5, $6, $7, $8, $9, $10)
    `, [
      id("ledger"),
      appUserId,
      provider,
      String(providerUserId),
      totalCost,
      `${tournament.title} · бай-ин ${buyIn.toLocaleString("ru-RU")} + fee ${fee.toLocaleString("ru-RU")}`,
      after,
      idempotencyKey || null,
      bucket === "cash" ? "USDT" : "PLAY_CHIPS",
      bucket
    ]);
    if (fee > 0) {
      await client.query(`
        insert into platform_ledger_entries (
          id, type, category, title, amount, context_id, meta, idempotency_key, asset, balance_bucket
        ) values ($1, 'credit', 'tournament_fee', 'Комиссия турнира', $2, $3, $4, $5, $6, $7)
        on conflict do nothing
      `, [id("platform"), fee, tournament.id, tournament.title, idempotencyKey ? `fee:${idempotencyKey}` : null,
        bucket === "cash" ? "USDT" : "PLAY_CHIPS", bucket]);
    }
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
    await client.query(`
      update player_profiles
      set tournaments_played = tournaments_played + 1,
          tournament_entries = tournament_entries + 1,
          tournament_fees_paid = tournament_fees_paid + case when $3 = 'play' then $2 else 0 end,
          tournament_play_fees_paid = tournament_play_fees_paid + case when $3 = 'play' then $2 else 0 end,
          tournament_cash_fees_paid_micros = tournament_cash_fees_paid_micros + case when $3 = 'cash' then $2 else 0 end,
          sng_fees_paid = sng_fees_paid + case when $4 = 'sng' and $3 = 'play' then $2 else 0 end,
          sng_play_fees_paid = sng_play_fees_paid + case when $4 = 'sng' and $3 = 'play' then $2 else 0 end,
          sng_cash_fees_paid_micros = sng_cash_fees_paid_micros + case when $4 = 'sng' and $3 = 'cash' then $2 else 0 end,
          updated_at = now()
      where app_user_id = $1
    `, [appUserId, fee, bucket, tournament.type]);
    await client.query("commit");
    return bucket === "cash"
      ? { cashBalanceMicros: after, alreadyRegistered: false }
      : { balance: after, alreadyRegistered: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelTournamentRegistration(providerUserId, tournament, provider = "telegram", idempotencyKey = "") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const bucket = tournament.balanceBucket === "cash" ? "cash" : "play";
  const walletColumn = bucket === "cash" ? "cash_usdt_micros" : "balance";
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
      const wallet = await client.query(`select ${walletColumn} as balance from wallets where app_user_id = $1`, [appUserId]);
      await client.query("commit");
      return bucket === "cash"
        ? { cashBalanceMicros: Number(wallet.rows[0]?.balance || 0), cancelled: false }
        : { balance: Number(wallet.rows[0]?.balance || 0), cancelled: false };
    }

    const refund = Number(registration.rows[0].buy_in || 0) + Number(registration.rows[0].fee || 0);
    await client.query("insert into wallets (app_user_id, balance) values ($1, 0) on conflict do nothing", [appUserId]);
    const current = await client.query(`select ${walletColumn} as balance from wallets where app_user_id = $1 for update`, [appUserId]);
    const after = Number(current.rows[0]?.balance || 0) + refund;

    await client.query(`update wallets set ${walletColumn} = $2, updated_at = now() where app_user_id = $1`, [appUserId, after]);
    await client.query(`
      update tournament_registrations
      set status = 'cancelled', cancelled_at = now()
      where tournament_id = $1 and app_user_id = $2
    `, [tournament.id, appUserId]);
    await client.query(`
      update player_profiles
      set tournaments_played = greatest(0, tournaments_played - 1),
          tournament_entries = greatest(0, tournament_entries - 1),
          tournament_fees_paid = greatest(0, tournament_fees_paid - case when $3 = 'play' then $2 else 0 end),
          tournament_play_fees_paid = greatest(0, tournament_play_fees_paid - case when $3 = 'play' then $2 else 0 end),
          tournament_cash_fees_paid_micros = greatest(0, tournament_cash_fees_paid_micros - case when $3 = 'cash' then $2 else 0 end),
          sng_fees_paid = greatest(0, sng_fees_paid - case when $4 = 'sng' and $3 = 'play' then $2 else 0 end),
          sng_play_fees_paid = greatest(0, sng_play_fees_paid - case when $4 = 'sng' and $3 = 'play' then $2 else 0 end),
          sng_cash_fees_paid_micros = greatest(0, sng_cash_fees_paid_micros - case when $4 = 'sng' and $3 = 'cash' then $2 else 0 end),
          updated_at = now()
      where app_user_id = $1
    `, [appUserId, Number(registration.rows[0].fee || 0), bucket, tournament.type]);
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta,
        balance_after, idempotency_key, asset, balance_bucket
      )
      values ($1, $2, $3, $4, 'credit', 'tournament_refund', 'Возврат турнирного бай-ина', $5, $6, $7, $8, $9, $10)
    `, [
      id("ledger"),
      appUserId,
      provider,
      String(providerUserId),
      refund,
      tournament.title,
      after,
      idempotencyKey || null,
      bucket === "cash" ? "USDT" : "PLAY_CHIPS",
      bucket
    ]);
    const fee = Number(registration.rows[0].fee || 0);
    if (fee > 0) {
      await client.query(`
        insert into platform_ledger_entries (
          id, type, category, title, amount, context_id, meta, idempotency_key, asset, balance_bucket
        ) values ($1, 'debit', 'tournament_fee_refund', 'Возврат комиссии турнира', $2, $3, $4, $5, $6, $7)
        on conflict do nothing
      `, [id("platform"), fee, tournament.id, tournament.title, idempotencyKey ? `fee-refund:${idempotencyKey}` : null,
        bucket === "cash" ? "USDT" : "PLAY_CHIPS", bucket]);
    }
    await client.query("commit");
    return bucket === "cash"
      ? { cashBalanceMicros: after, cancelled: true }
      : { balance: after, cancelled: true };
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
      rub_amount, chips, stars, asset, network, crypto_amount, external_id, payload, raw, expires_at,
      credited_asset, cash_usdt_micros
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
    order.expiresAt ? new Date(order.expiresAt) : null,
    order.creditedAsset || "PLAY_CHIPS",
    order.cashUsdtMicros || 0
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
      for update of po
    `, [orderId]);
    if (!currentOrder.rowCount) {
      await client.query("commit");
      return null;
    }

    const order = paymentRow(currentOrder.rows[0]);
    const cashPayment = order.creditedAsset === "USDT";
    const balanceColumn = cashPayment ? "cash_usdt_micros" : "balance";
    if (order.status === "paid") {
      const wallet = await client.query(`select ${balanceColumn} as balance from wallets where app_user_id = $1`, [currentOrder.rows[0].app_user_id]);
      await client.query("commit");
      return { order, balance: Number(wallet.rows[0]?.balance || 0), alreadyPaid: true };
    }
    if (order.status !== "pending") {
      await client.query("commit");
      return { order, balance: null, ignored: true };
    }

    const appUserId = currentOrder.rows[0].app_user_id;
    await client.query("insert into wallets (app_user_id, balance, cash_usdt_micros, bonus_usdt_micros) values ($1, 0, 0, 0) on conflict do nothing", [appUserId]);
    const wallet = await client.query(`select ${balanceColumn} as balance from wallets where app_user_id = $1 for update`, [appUserId]);
    const before = Number(wallet.rows[0]?.balance || 0);
    const amount = Math.max(0, Math.round(Number(cashPayment ? order.cashUsdtMicros : order.chips) || 0));
    const after = before + amount;
    const method = normalizeLedgerCategory(order.method || "stars");
    const asset = order.asset || (method === "stars" ? "Stars" : method.toUpperCase());
    const network = order.network || "";
    const ledgerKey = `payment:${order.id}`;
    const priorPaidDeposits = cashPayment ? await client.query(`
      select count(*)::int as count
      from payment_orders
      where app_user_id = $1
        and status = 'paid'
        and credited_asset = 'USDT'
        and id <> $2
    `, [appUserId, order.id]) : { rows: [{ count: 0 }] };
    const firstCashDeposit = cashPayment && Number(priorPaidDeposits.rows[0]?.count || 0) === 0;

    await client.query(`update wallets set ${balanceColumn} = $2, updated_at = now() where app_user_id = $1`, [appUserId, after]);
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta, balance_after, idempotency_key,
        asset, balance_bucket
      )
      values ($1, $2, $3, $4, 'credit', $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict do nothing
    `, [
      id("ledger"),
      appUserId,
      order.provider || "telegram",
      String(order.userId),
      `deposit_${method}`,
      cashPayment ? "Пополнение USDT" : (method === "stars" ? "Пополнение Stars" : "Пополнение баланса"),
      amount,
      `${order.cryptoAmount || order.stars || 0} ${asset}${network ? ` ${network}` : ""} · order ${order.id}`,
      after,
      ledgerKey,
      cashPayment ? "USDT" : "PLAY_CHIPS",
      cashPayment ? "cash_usdt" : "play"
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
    let bonusGrant = null;
    if (firstCashDeposit && amount > 0) {
      const quote = quoteWelcomeBonus(amount);
      if (quote.bonusAmountMicros > 0) {
        const grantId = deterministicId("bonus", `welcome:${appUserId}`);
        const insertedGrant = await client.query(`
          insert into bonus_grants (
            id, app_user_id, provider, provider_user_id, bonus_type, status,
            amount_usdt_micros, wagering_required, wagering_done,
            bonus_amount_micros, wagering_required_micros, wagering_paid_micros,
            source_id, expires_at, meta
          )
          values (
            $1, $2, $3, $4, 'welcome', 'active',
            $5, $6, 0, $5, $6, 0,
            $7, now() + ($8::text || ' days')::interval, $9::jsonb
          )
          on conflict do nothing
          returning id, bonus_amount_micros, wagering_required_micros, wagering_paid_micros, expires_at, status
        `, [
          grantId,
          appUserId,
          order.provider || "telegram",
          String(order.userId),
          quote.bonusAmountMicros,
          quote.wageringRequiredMicros,
          order.id,
          quote.expiresInDays,
          JSON.stringify({ depositOrderId: order.id, depositUsdtMicros: amount, percent: 0.25 })
        ]);
        if (insertedGrant.rowCount) {
          const bonusWallet = await client.query(`
            update wallets
            set bonus_usdt_micros = bonus_usdt_micros + $2, updated_at = now()
            where app_user_id = $1
            returning bonus_usdt_micros
          `, [appUserId, quote.bonusAmountMicros]);
          const bonusBalance = Number(bonusWallet.rows[0]?.bonus_usdt_micros || 0);
          await client.query(`
            insert into ledger_entries (
              id, app_user_id, provider, provider_user_id, type, category, title,
              amount, meta, balance_after, idempotency_key, asset, balance_bucket
            )
            values ($1, $2, $3, $4, 'credit', 'bonus_credit', 'Welcome Bonus',
                    $5, $6, $7, $8, 'USDT', 'bonus_usdt')
            on conflict do nothing
          `, [
            id("ledger"),
            appUserId,
            order.provider || "telegram",
            String(order.userId),
            quote.bonusAmountMicros,
            `25% first deposit bonus · order ${order.id}`,
            bonusBalance,
            `bonus:${grantId}:credit`
          ]);
          bonusGrant = {
            id: grantId,
            type: "welcome",
            status: "active",
            bonusAmountMicros: quote.bonusAmountMicros,
            wageringRequiredMicros: quote.wageringRequiredMicros,
            wageringPaidMicros: 0,
            expiresAt: insertedGrant.rows[0].expires_at
          };
        }
      }
    }
    await client.query("commit");
    return {
      order: {
        ...order,
        status: "paid",
        paidAt: new Date().toISOString(),
        telegramPaymentChargeId: payment.telegram_payment_charge_id || ""
      },
      balance: after,
      bonusGrant,
      alreadyPaid: false
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function applyBonusWagering({
  providerUserIds = [],
  rakeAmountMicros = 0,
  handId = "",
  provider = "telegram"
} = {}) {
  if (!pool) return null;
  const userIds = [...new Set(providerUserIds.map(String).filter(Boolean))];
  const rake = Math.max(0, Math.round(Number(rakeAmountMicros) || 0));
  if (!userIds.length || rake <= 0 || !handId) return [];
  const client = await pool.connect();
  const completed = [];

  try {
    await client.query("begin");
    for (const providerUserId of userIds) {
      const identity = await client.query(`
        select app_user_id
        from user_identities
        where provider = $1 and provider_user_id = $2
      `, [provider, providerUserId]);
      if (!identity.rowCount) continue;
      const appUserId = identity.rows[0].app_user_id;
      const grants = await client.query(`
        select id, bonus_amount_micros, wagering_required_micros, wagering_paid_micros, expires_at
        from bonus_grants
        where app_user_id = $1 and status = 'active' and expires_at > now()
        order by created_at asc
        for update
      `, [appUserId]);

      for (const grant of grants.rows) {
        const event = await client.query(`
          insert into bonus_wagering_events (grant_id, hand_id, rake_amount_micros)
          values ($1, $2, $3)
          on conflict do nothing
          returning grant_id
        `, [grant.id, handId, rake]);
        if (!event.rowCount) continue;

        const progress = advanceWelcomeBonusWagering({
          paidMicros: grant.wagering_paid_micros,
          requiredMicros: grant.wagering_required_micros,
          rakeMicros: rake
        });
        const nextPaid = progress.wageringPaidMicros;
        const required = Number(grant.wagering_required_micros || 0);
        if (!progress.completed) {
          await client.query(`
            update bonus_grants
            set wagering_paid_micros = $2, wagering_done = $2, updated_at = now()
            where id = $1
          `, [grant.id, nextPaid]);
          continue;
        }

        const wallet = await client.query(`
          select cash_usdt_micros, bonus_usdt_micros
          from wallets
          where app_user_id = $1
          for update
        `, [appUserId]);
        const bonusAmount = Number(grant.bonus_amount_micros || 0);
        const bonusBefore = Number(wallet.rows[0]?.bonus_usdt_micros || 0);
        const cashBefore = Number(wallet.rows[0]?.cash_usdt_micros || 0);
        if (bonusBefore < bonusAmount) {
          throw new Error(`Bonus wallet invariant failed for grant ${grant.id}`);
        }
        const bonusAfter = bonusBefore - bonusAmount;
        const cashAfter = cashBefore + bonusAmount;
        await client.query(`
          update bonus_grants
          set wagering_paid_micros = $2, wagering_done = $2, status = 'completed', updated_at = now()
          where id = $1
        `, [grant.id, nextPaid]);
        await client.query(`
          update wallets
          set bonus_usdt_micros = $2, cash_usdt_micros = $3, updated_at = now()
          where app_user_id = $1
        `, [appUserId, bonusAfter, cashAfter]);
        await insertBonusTransferLedger(client, {
          appUserId,
          provider,
          providerUserId,
          grantId: grant.id,
          amount: bonusAmount,
          bonusAfter,
          cashAfter,
          category: "bonus_unlock",
          title: "Welcome Bonus unlocked"
        });
        completed.push({
          grantId: grant.id,
          providerUserId,
          bonusAmountMicros: bonusAmount,
          wageringPaidMicros: nextPaid,
          wageringRequiredMicros: required,
          cashBalanceMicros: cashAfter
        });
      }
    }
    await client.query("commit");
    return completed;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function expireWelcomeBonuses() {
  if (!pool) return null;
  const client = await pool.connect();
  const expired = [];
  try {
    await client.query("begin");
    const grants = await client.query(`
      select bg.id, bg.app_user_id, bg.provider, bg.provider_user_id, bg.bonus_amount_micros
      from bonus_grants bg
      where bg.status = 'active' and bg.expires_at <= now()
      order by bg.expires_at asc
      for update
    `);
    for (const grant of grants.rows) {
      const wallet = await client.query(`
        select bonus_usdt_micros
        from wallets
        where app_user_id = $1
        for update
      `, [grant.app_user_id]);
      const bonusBefore = Number(wallet.rows[0]?.bonus_usdt_micros || 0);
      const amount = Math.min(bonusBefore, Number(grant.bonus_amount_micros || 0));
      const bonusAfter = bonusBefore - amount;
      await client.query(`
        update bonus_grants set status = 'expired', updated_at = now() where id = $1
      `, [grant.id]);
      await client.query(`
        update wallets set bonus_usdt_micros = $2, updated_at = now() where app_user_id = $1
      `, [grant.app_user_id, bonusAfter]);
      if (amount > 0) {
        await client.query(`
          insert into ledger_entries (
            id, app_user_id, provider, provider_user_id, type, category, title,
            amount, meta, balance_after, idempotency_key, asset, balance_bucket
          )
          values ($1, $2, $3, $4, 'debit', 'bonus_expired', 'Welcome Bonus expired',
                  $5, $6, $7, $8, 'USDT', 'bonus_usdt')
          on conflict do nothing
        `, [
          id("ledger"), grant.app_user_id, grant.provider, grant.provider_user_id,
          amount, `grant ${grant.id}`, bonusAfter, `bonus:${grant.id}:expired`
        ]);
        await client.query(`
          insert into platform_ledger_entries (
            id, type, category, title, amount, context_id, meta, idempotency_key, asset, balance_bucket
          )
          values ($1, 'credit', 'bonus_expired', 'Expired Welcome Bonus', $2, $3, $4, $5, 'USDT', 'cash')
          on conflict do nothing
        `, [id("platform"), amount, grant.id, `user ${grant.provider_user_id}`, `bonus:${grant.id}:expired:platform`]);
      }
      expired.push({ grantId: grant.id, providerUserId: grant.provider_user_id, bonusAmountMicros: amount });
    }
    await client.query("commit");
    return expired;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getBonusSummary(providerUserId, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query(`
    select coalesce(w.bonus_usdt_micros, 0)::bigint as bonus_balance_micros,
           coalesce(jsonb_agg(jsonb_build_object(
             'id', bg.id,
             'type', bg.bonus_type,
             'status', bg.status,
             'bonusAmountMicros', bg.bonus_amount_micros,
             'wageringRequiredMicros', bg.wagering_required_micros,
             'wageringPaidMicros', bg.wagering_paid_micros,
             'expiresAt', bg.expires_at
           ) order by bg.created_at desc) filter (where bg.id is not null), '[]'::jsonb) as grants
    from wallets w
    left join bonus_grants bg on bg.app_user_id = w.app_user_id and bg.status = 'active'
    where w.app_user_id = $1
    group by w.bonus_usdt_micros
  `, [appUserId]);
  if (!result.rowCount) return { bonusBalanceMicros: 0, grants: [] };
  return {
    bonusBalanceMicros: Number(result.rows[0].bonus_balance_micros || 0),
    grants: (result.rows[0].grants || []).map((grant) => ({
      ...grant,
      bonusAmountMicros: Number(grant.bonusAmountMicros || 0),
      wageringRequiredMicros: Number(grant.wageringRequiredMicros || 0),
      wageringPaidMicros: Number(grant.wageringPaidMicros || 0)
    }))
  };
}

async function insertBonusTransferLedger(client, {
  appUserId, provider, providerUserId, grantId, amount, bonusAfter, cashAfter, category, title
}) {
  await client.query(`
    insert into ledger_entries (
      id, app_user_id, provider, provider_user_id, type, category, title,
      amount, meta, balance_after, idempotency_key, asset, balance_bucket
    )
    values
      ($1, $2, $3, $4, 'debit', $5, $6, $7, $8, $9, $10, 'USDT', 'bonus_usdt'),
      ($11, $2, $3, $4, 'credit', $5, $6, $7, $8, $12, $13, 'USDT', 'cash_usdt')
    on conflict do nothing
  `, [
    id("ledger"), appUserId, provider, String(providerUserId), category, title,
    amount, `grant ${grantId}`, bonusAfter, `bonus:${grantId}:${category}:debit`,
    id("ledger"), cashAfter, `bonus:${grantId}:${category}:credit`
  ]);
}

export async function getCashDepositTotal(providerUserId, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query(`
    select coalesce(sum(cash_usdt_micros), 0)::bigint as total
    from payment_orders
    where app_user_id = $1
      and status = 'paid'
      and credited_asset = 'USDT'
  `, [appUserId]);
  return Number(result.rows[0]?.total || 0);
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

export async function createWithdrawalOrder(order, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, order.userId);
  const idempotencyKey = normalizeIdempotencyKey(order.idempotencyKey);
  if (idempotencyKey) {
    const existing = await query(`
      select wo.*, au.display_name as "userName", au.username
      from withdrawal_orders wo
      left join app_users au on au.id = wo.app_user_id
      where wo.idempotency_key = $1
      limit 1
    `, [idempotencyKey]);
    if (existing.rowCount) return { order: withdrawalRow(existing.rows[0]), idempotentReplay: true };
  }

  const grossUsdtMicros = Math.max(0, Math.round(Number(order.grossUsdtMicros || order.cashUsdtMicros) || 0));
  const feeUsdtMicros = Math.max(0, Math.round(Number(order.feeUsdtMicros) || 0));
  const payoutUsdtMicros = Math.max(0, Math.round(Number(order.payoutUsdtMicros) || Math.max(0, grossUsdtMicros - feeUsdtMicros)));
  const cashMode = grossUsdtMicros > 0;
  const chips = Math.max(0, Math.round(Number(order.chips) || 0));
  const feeChips = Math.max(0, Math.round(Number(order.feeChips) || 0));
  const payoutChips = Math.max(0, chips - feeChips);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("insert into wallets (app_user_id, balance, cash_usdt_micros, locked_usdt_micros) values ($1, 0, 0, 0) on conflict do nothing", [appUserId]);
    const wallet = await client.query("select balance, cash_usdt_micros, locked_usdt_micros from wallets where app_user_id = $1 for update", [appUserId]);
    const before = cashMode ? Number(wallet.rows[0]?.cash_usdt_micros || 0) : Number(wallet.rows[0]?.balance || 0);
    const amount = cashMode ? grossUsdtMicros : chips;
    const after = before - amount;
    if (after < 0) {
      const error = new Error(cashMode ? "Недостаточно USDT на балансе" : `Недостаточно chips. Баланс игрока: ${before.toLocaleString("ru-RU")}`);
      error.status = 409;
      throw error;
    }

    if (cashMode) {
      const lockedBefore = Number(wallet.rows[0]?.locked_usdt_micros || 0);
      await client.query(
        "update wallets set cash_usdt_micros = $2, locked_usdt_micros = $3, updated_at = now() where app_user_id = $1",
        [appUserId, after, lockedBefore + grossUsdtMicros]
      );
    } else {
      await client.query("update wallets set balance = $2, updated_at = now() where app_user_id = $1", [appUserId, after]);
    }
    await client.query(`
      insert into withdrawal_orders (
        id, app_user_id, provider, provider_user_id, method, status,
        chips, fee_chips, payout_chips, gross_usdt_micros, fee_usdt_micros, payout_usdt_micros,
        asset, balance_bucket, destination, idempotency_key, raw
      )
      values ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
    `, [
      order.id,
      appUserId,
      provider,
      String(order.userId),
      normalizeLedgerCategory(order.method),
      chips,
      feeChips,
      payoutChips,
      grossUsdtMicros,
      feeUsdtMicros,
      payoutUsdtMicros,
      order.asset || (cashMode ? "USDT" : "PLAY_CHIPS"),
      order.balanceBucket || (cashMode ? "cash_usdt" : "play"),
      order.destination || "",
      idempotencyKey || null,
      JSON.stringify(order)
    ]);
    await client.query(`
      insert into ledger_entries (
        id, app_user_id, provider, provider_user_id, type, category, title, amount, meta, balance_after,
        idempotency_key, asset, balance_bucket
      )
      values ($1, $2, $3, $4, 'debit', 'withdrawal_hold', 'Заявка на вывод', $5, $6, $7, $8, $9, $10)
    `, [
      id("ledger"),
      appUserId,
      provider,
      String(order.userId),
      amount,
      cashMode
        ? `${order.method} · payout ${payoutUsdtMicros} · fee ${feeUsdtMicros} · order ${order.id}`
        : `${order.method} · payout ${payoutChips} · fee ${feeChips} · order ${order.id}`,
      after,
      `withdrawal:${order.id}:hold`,
      cashMode ? "USDT" : "PLAY_CHIPS",
      cashMode ? "cash_usdt" : "play"
    ]);
    await client.query("commit");
    return {
      order: await getWithdrawalOrder(order.id),
      balance: after,
      before
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function reviewWithdrawalOrder(orderId, review) {
  if (!pool) return null;
  const client = await pool.connect();
  const action = review.action === "approve" ? "approve" : "reject";
  const reviewedStatus = action === "approve" ? "approved" : "rejected";

  try {
    await client.query("begin");
    const current = await client.query(`
      select wo.*, au.display_name as "userName", au.username
      from withdrawal_orders wo
      left join app_users au on au.id = wo.app_user_id
      where wo.id = $1
      for update of wo
    `, [orderId]);
    if (!current.rowCount) {
      await client.query("commit");
      return null;
    }
    const row = current.rows[0];
    const order = withdrawalRow(row);
    if (order.status !== "pending" && order.status !== "manual_review") {
      await client.query("commit");
      return { order, ignored: true };
    }

    let balance = null;
    const cashMode = Number(order.grossUsdtMicros || 0) > 0;
    if (action === "reject") {
      await client.query("insert into wallets (app_user_id, balance, cash_usdt_micros, locked_usdt_micros) values ($1, 0, 0, 0) on conflict do nothing", [row.app_user_id]);
      const wallet = await client.query("select balance, cash_usdt_micros, locked_usdt_micros from wallets where app_user_id = $1 for update", [row.app_user_id]);
      if (cashMode) {
        const beforeCash = Number(wallet.rows[0]?.cash_usdt_micros || 0);
        const beforeLocked = Number(wallet.rows[0]?.locked_usdt_micros || 0);
        balance = beforeCash + order.grossUsdtMicros;
        await client.query(
          "update wallets set cash_usdt_micros = $2, locked_usdt_micros = $3, updated_at = now() where app_user_id = $1",
          [row.app_user_id, balance, Math.max(0, beforeLocked - order.grossUsdtMicros)]
        );
      } else {
        const before = Number(wallet.rows[0]?.balance || 0);
        balance = before + order.chips;
        await client.query("update wallets set balance = $2, updated_at = now() where app_user_id = $1", [row.app_user_id, balance]);
      }
      await client.query(`
        insert into ledger_entries (
          id, app_user_id, provider, provider_user_id, type, category, title, amount, meta, balance_after,
          idempotency_key, asset, balance_bucket
        )
        values ($1, $2, $3, $4, 'credit', 'withdrawal_refund', 'Возврат заявки на вывод', $5, $6, $7, $8, $9, $10)
        on conflict do nothing
      `, [
        id("ledger"),
        row.app_user_id,
        row.provider,
        row.provider_user_id,
        cashMode ? order.grossUsdtMicros : order.chips,
        `${review.reason || "manual_reject"} · order ${order.id}`,
        balance,
        `withdrawal:${order.id}:refund`,
        cashMode ? "USDT" : "PLAY_CHIPS",
        cashMode ? "cash_usdt" : "play"
      ]);
    } else if (cashMode) {
      await client.query("insert into wallets (app_user_id, balance, cash_usdt_micros, locked_usdt_micros) values ($1, 0, 0, 0) on conflict do nothing", [row.app_user_id]);
      const wallet = await client.query("select locked_usdt_micros from wallets where app_user_id = $1 for update", [row.app_user_id]);
      const beforeLocked = Number(wallet.rows[0]?.locked_usdt_micros || 0);
      await client.query(
        "update wallets set locked_usdt_micros = $2, updated_at = now() where app_user_id = $1",
        [row.app_user_id, Math.max(0, beforeLocked - order.grossUsdtMicros)]
      );
      if (order.feeUsdtMicros > 0) {
        await client.query(`
          insert into platform_ledger_entries (
            id, type, category, title, amount, context_id, meta, idempotency_key, asset, balance_bucket
          )
          values ($1, 'credit', 'withdrawal_fee', 'Withdrawal hidden fee', $2, $3, $4, $5, 'USDT', 'cash')
          on conflict do nothing
        `, [
          id("platform"),
          order.feeUsdtMicros,
          order.id,
          `${order.method} · gross ${order.grossUsdtMicros} · payout ${order.payoutUsdtMicros}`,
          `withdrawal:${order.id}:fee`
        ]);
      }
    }

    await client.query(`
      update withdrawal_orders
      set status = $2,
          admin_reason = $3,
          reviewed_by_provider_user_id = $4,
          reviewed_at = now(),
          raw = coalesce(raw, '{}'::jsonb) || $5::jsonb
      where id = $1
    `, [
      order.id,
      reviewedStatus,
      review.reason || "",
      String(review.adminId || ""),
      JSON.stringify({ review })
    ]);
    await client.query("commit");
    return {
      order: await getWithdrawalOrder(order.id),
      balance
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getWithdrawalOrder(orderId) {
  if (!pool) return null;
  const result = await query(`
    select wo.*, au.display_name as "userName", au.username
    from withdrawal_orders wo
    left join app_users au on au.id = wo.app_user_id
    where wo.id = $1
  `, [orderId]);
  return result.rowCount ? withdrawalRow(result.rows[0]) : null;
}

export async function listWithdrawalOrders(limit = 30) {
  if (!pool) return null;
  const result = await query(`
    select wo.*, au.display_name as "userName", au.username
    from withdrawal_orders wo
    left join app_users au on au.id = wo.app_user_id
    order by wo.created_at desc
    limit $1
  `, [limit]);
  return result.rows.map(withdrawalRow);
}

export async function listUserWithdrawalOrders(providerUserId, provider = "telegram", limit = 20) {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const result = await query(`
    select wo.*, au.display_name as "userName", au.username
    from withdrawal_orders wo
    left join app_users au on au.id = wo.app_user_id
    where wo.app_user_id = $1
    order by wo.created_at desc
    limit $2
  `, [appUserId, limit]);
  return result.rows.map(withdrawalRow);
}

export async function listPendingCryptoPaymentOrders(limit = 50) {
  if (!pool) return null;
  const result = await query(`
    select po.*, au.display_name as "userName", au.username
    from payment_orders po
    left join app_users au on au.id = po.app_user_id
    where po.status = 'pending'
      and po.method in ('ton', 'usdt_trc20')
      and (po.expires_at is null or po.expires_at > now())
    order by po.created_at asc
    limit $1
  `, [limit]);
  return result.rows.map(paymentRow);
}

export async function getIdempotencyResult(key) {
  if (!pool) return null;
  const normalized = normalizeIdempotencyKey(key);
  if (!normalized) return null;
  const result = await query(`
    select request_hash as "requestHash", response_status as "status", response_body as "body", created_at as "createdAt"
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
    set request_hash = excluded.request_hash,
        response_status = excluded.response_status,
        response_body = excluded.response_body,
        expires_at = excluded.expires_at
    where idempotency_keys.request_hash = excluded.request_hash
       or idempotency_keys.request_hash = ''
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

export async function recordAdminAuditLog(audit = {}) {
  if (!pool) return null;
  await query(`
    insert into admin_audit_logs (
      id, actor_provider, actor_provider_user_id, actor_role, action,
      target_type, target_id, result, reason, ip_hash, meta
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
  `, [
    audit.id || id("audit"),
    audit.actorProvider || "telegram",
    String(audit.actorProviderUserId || audit.actorId || ""),
    String(audit.actorRole || ""),
    normalizeLedgerCategory(audit.action || "admin_action"),
    normalizeLedgerCategory(audit.targetType || ""),
    String(audit.targetId || ""),
    normalizeAdminAuditResult(audit.result || "ok"),
    String(audit.reason || "").slice(0, 1000),
    String(audit.ipHash || "").slice(0, 160),
    JSON.stringify(audit.meta || {})
  ]);
  return true;
}

export async function listAdminAuditLogs(limit = 50) {
  if (!pool) return null;
  const normalizedLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 50)));
  const result = await query(`
    select id,
           actor_provider as "actorProvider",
           actor_provider_user_id as "actorProviderUserId",
           actor_role as "actorRole",
           action,
           target_type as "targetType",
           target_id as "targetId",
           result,
           reason,
           ip_hash as "ipHash",
           meta,
           created_at as "createdAt"
    from admin_audit_logs
    order by created_at desc
    limit $1
  `, [normalizedLimit]);
  return result.rows;
}

export async function listRiskFlags(limit = 50) {
  if (!pool) return null;
  const normalizedLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 50)));
  const result = await query(`
    select rf.id,
           rf.provider_user_id as "userId",
           au.display_name as "userName",
           au.username,
           rf.flag_type as "type",
           rf.severity,
           rf.status,
           rf.reason,
           rf.source_id as "sourceId",
           rf.meta,
           rf.created_at as "createdAt"
    from risk_flags rf
    left join app_users au on au.id = rf.app_user_id
    order by rf.created_at desc
    limit $1
  `, [normalizedLimit]);
  return result.rows;
}

export async function recordDeviceSession(providerUserId, session = {}, provider = "telegram") {
  if (!pool) return null;
  const appUserId = await ensureIdentity(provider, providerUserId);
  const ipHash = String(session.ipHash || "").slice(0, 160);
  const userAgent = String(session.userAgent || "").slice(0, 600);
  const platform = String(session.platform || "").slice(0, 80);
  const deviceIdHash = String(session.deviceIdHash || "").slice(0, 160);
  const stableId = session.id || deterministicId("device", [
    provider,
    appUserId,
    ipHash,
    createHash("sha256").update(userAgent).digest("hex"),
    platform,
    deviceIdHash
  ].join(":"));

  const result = await query(`
    insert into device_sessions (
      id, app_user_id, provider, provider_user_id, ip_hash, user_agent,
      platform, device_id_hash, meta, first_seen_at, last_seen_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
    on conflict (id) do update
    set last_seen_at = now(),
        ip_hash = excluded.ip_hash,
        user_agent = excluded.user_agent,
        platform = excluded.platform,
        device_id_hash = excluded.device_id_hash,
        meta = device_sessions.meta || excluded.meta
    returning id, first_seen_at as "firstSeenAt", last_seen_at as "lastSeenAt"
  `, [
    stableId,
    appUserId,
    provider,
    String(providerUserId),
    ipHash,
    userAgent,
    platform,
    deviceIdHash,
    JSON.stringify(session.meta || {})
  ]);
  return result.rows[0] || null;
}

export async function recordRiskFlag(flag = {}) {
  if (!pool) return null;
  const provider = flag.provider || "telegram";
  const providerUserId = flag.userId ? String(flag.userId) : "";
  const appUserId = providerUserId ? await ensureIdentity(provider, providerUserId) : null;
  const sourceId = String(flag.sourceId || "").slice(0, 240);
  if (sourceId) {
    const existing = await query(`
      select id
      from risk_flags
      where source_id = $1
        and flag_type = $2
        and status in ('open', 'review')
      limit 1
    `, [sourceId, normalizeLedgerCategory(flag.type || "risk")]);
    if (existing.rowCount) return { id: existing.rows[0].id, duplicate: true };
  }

  const result = await query(`
    insert into risk_flags (
      id, app_user_id, provider, provider_user_id, flag_type,
      severity, status, reason, source_id, meta
    )
    values ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9::jsonb)
    returning id
  `, [
    flag.id || id("risk"),
    appUserId,
    provider,
    providerUserId,
    normalizeLedgerCategory(flag.type || "risk"),
    normalizeRiskSeverity(flag.severity || "medium"),
    String(flag.reason || "").slice(0, 1000),
    sourceId,
    JSON.stringify(flag.meta || {})
  ]);
  return { id: result.rows[0]?.id || null };
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

export async function recordAnalyticsEvent(event = {}) {
  if (!pool) return null;
  const provider = event.provider || "telegram";
  const providerUserId = event.userId ? String(event.userId) : "";
  const appUserId = providerUserId ? await ensureIdentity(provider, providerUserId) : null;
  const amount = Math.round(Number(event.amount || 0));
  await query(`
    insert into analytics_events (
      id, event_name, category, app_user_id, provider, provider_user_id,
      session_id, source, amount, asset, context_id, meta
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
  `, [
    event.id || id("analytics"),
    normalizeLedgerCategory(event.name || event.eventName),
    normalizeLedgerCategory(event.category || "product"),
    appUserId,
    provider,
    providerUserId,
    String(event.sessionId || ""),
    normalizeLedgerCategory(event.source || "server"),
    Number.isFinite(amount) ? amount : 0,
    String(event.asset || ""),
    String(event.contextId || ""),
    JSON.stringify(event.meta || {})
  ]);
  return true;
}

export async function analyticsOverview(days = 7) {
  if (!pool) return null;
  const windowDays = Math.max(1, Math.min(90, Math.round(Number(days) || 7)));
  const [summary, daily, events] = await Promise.all([
    query(`
      select
        count(*)::int as total_events,
        count(distinct app_user_id) filter (where app_user_id is not null)::int as unique_users,
        (select count(distinct app_user_id)::int from analytics_events where event_name = 'app_open' and app_user_id is not null and created_at >= now() - interval '1 day') as dau,
        (select count(distinct app_user_id)::int from analytics_events where event_name = 'app_open' and app_user_id is not null and created_at >= now() - interval '7 day') as wau,
        (select count(distinct app_user_id)::int from analytics_events where event_name = 'app_open' and app_user_id is not null and created_at >= now() - interval '30 day') as mau,
        (select count(*)::int from (
          select app_user_id, min(created_at) as first_paid_at
          from analytics_events
          where event_name = 'deposit_paid' and app_user_id is not null
          group by app_user_id
        ) first_deposits where first_paid_at >= now() - ($1::int * interval '1 day')) as first_deposit_users,
        count(*) filter (where event_name = 'app_open')::int as app_opens,
        count(distinct app_user_id) filter (where event_name = 'app_open' and app_user_id is not null)::int as app_open_users,
        count(*) filter (where event_name = 'cashier_open')::int as cashier_opens,
        count(distinct app_user_id) filter (where event_name = 'cashier_open' and app_user_id is not null)::int as cashier_users,
        count(*) filter (where event_name = 'deposit_order_created')::int as deposit_orders,
        count(distinct app_user_id) filter (where event_name = 'deposit_order_created' and app_user_id is not null)::int as deposit_order_users,
        count(*) filter (where event_name = 'deposit_paid')::int as paid_deposits,
        count(distinct app_user_id) filter (where event_name = 'deposit_paid' and app_user_id is not null)::int as paying_users,
        coalesce(sum(amount) filter (where event_name = 'deposit_paid'), 0)::bigint as paid_deposit_amount,
        count(*) filter (where event_name = 'withdrawal_requested')::int as withdrawal_requests,
        coalesce(sum(amount) filter (where event_name = 'withdrawal_requested'), 0)::bigint as withdrawal_amount,
        count(*) filter (where event_name = 'withdrawal_approved')::int as withdrawal_approved,
        count(*) filter (where event_name = 'withdrawal_rejected')::int as withdrawal_rejected,
        coalesce(sum(amount) filter (where event_name = 'withdrawal_approved'), 0)::bigint as withdrawal_approved_amount,
        coalesce(sum(amount) filter (where event_name = 'withdrawal_rejected'), 0)::bigint as withdrawal_rejected_amount,
        count(*) filter (where event_name = 'table_join')::int as table_joins,
        count(distinct app_user_id) filter (where event_name = 'table_join' and app_user_id is not null)::int as table_join_users,
        count(*) filter (where event_name = 'table_leave')::int as table_leaves,
        count(*) filter (where event_name = 'poker_action')::int as poker_actions,
        count(*) filter (where event_name = 'hand_completed')::int as hands_completed,
        coalesce(sum(amount) filter (where event_name = 'hand_completed'), 0)::bigint as rake_amount,
        count(*) filter (where event_name = 'tournament_register')::int as tournament_registers,
        count(*) filter (where event_name = 'tournament_cancel')::int as tournament_cancels
      from analytics_events
      where created_at >= now() - ($1::int * interval '1 day')
    `, [windowDays]),
    query(`
      select
        date_trunc('day', created_at)::date as day,
        count(*)::int as events,
        count(distinct app_user_id) filter (where app_user_id is not null)::int as users,
        count(*) filter (where event_name = 'app_open')::int as app_opens,
        count(*) filter (where event_name = 'deposit_order_created')::int as deposit_orders,
        count(*) filter (where event_name = 'deposit_paid')::int as paid_deposits,
        coalesce(sum(amount) filter (where event_name = 'deposit_paid'), 0)::bigint as deposit_amount,
        count(*) filter (where event_name = 'table_join')::int as table_joins,
        count(*) filter (where event_name = 'hand_completed')::int as hands_completed,
        coalesce(sum(amount) filter (where event_name = 'hand_completed'), 0)::bigint as rake_amount
      from analytics_events
      where created_at >= now() - ($1::int * interval '1 day')
      group by 1
      order by 1 desc
    `, [windowDays]),
    query(`
      select event_name as name, category, count(*)::int as count,
             count(distinct app_user_id) filter (where app_user_id is not null)::int as users,
             coalesce(sum(amount), 0)::bigint as amount
      from analytics_events
      where created_at >= now() - ($1::int * interval '1 day')
      group by event_name, category
      order by count desc, event_name asc
      limit 30
    `, [windowDays])
  ]);

  const row = summary.rows[0] || {};
  const numbers = {
    totalEvents: Number(row.total_events || 0),
    uniqueUsers: Number(row.unique_users || 0),
    dau: Number(row.dau || 0),
    wau: Number(row.wau || 0),
    mau: Number(row.mau || 0),
    firstDepositUsers: Number(row.first_deposit_users || 0),
    appOpens: Number(row.app_opens || 0),
    appOpenUsers: Number(row.app_open_users || 0),
    cashierOpens: Number(row.cashier_opens || 0),
    cashierUsers: Number(row.cashier_users || 0),
    depositOrders: Number(row.deposit_orders || 0),
    depositOrderUsers: Number(row.deposit_order_users || 0),
    paidDeposits: Number(row.paid_deposits || 0),
    payingUsers: Number(row.paying_users || 0),
    paidDepositAmount: Number(row.paid_deposit_amount || 0),
    withdrawalRequests: Number(row.withdrawal_requests || 0),
    withdrawalAmount: Number(row.withdrawal_amount || 0),
    withdrawalApproved: Number(row.withdrawal_approved || 0),
    withdrawalRejected: Number(row.withdrawal_rejected || 0),
    withdrawalApprovedAmount: Number(row.withdrawal_approved_amount || 0),
    withdrawalRejectedAmount: Number(row.withdrawal_rejected_amount || 0),
    tableJoins: Number(row.table_joins || 0),
    tableJoinUsers: Number(row.table_join_users || 0),
    tableLeaves: Number(row.table_leaves || 0),
    pokerActions: Number(row.poker_actions || 0),
    handsCompleted: Number(row.hands_completed || 0),
    rakeAmount: Number(row.rake_amount || 0),
    tournamentRegisters: Number(row.tournament_registers || 0),
    tournamentCancels: Number(row.tournament_cancels || 0)
  };
  return {
    days: windowDays,
    ...numbers,
    conversion: {
      openToCashier: ratio(numbers.cashierUsers, numbers.appOpenUsers),
      cashierToOrder: ratio(numbers.depositOrderUsers, numbers.cashierUsers),
      orderToPaid: ratio(numbers.payingUsers, numbers.depositOrderUsers),
      openToTable: ratio(numbers.tableJoinUsers, numbers.appOpenUsers)
    },
    daily: daily.rows.map((item) => ({
      day: item.day,
      events: Number(item.events || 0),
      users: Number(item.users || 0),
      appOpens: Number(item.app_opens || 0),
      depositOrders: Number(item.deposit_orders || 0),
      paidDeposits: Number(item.paid_deposits || 0),
      depositAmount: Number(item.deposit_amount || 0),
      tableJoins: Number(item.table_joins || 0),
      handsCompleted: Number(item.hands_completed || 0),
      rakeAmount: Number(item.rake_amount || 0)
    })),
    events: events.rows.map((item) => ({
      name: item.name,
      category: item.category,
      count: Number(item.count || 0),
      users: Number(item.users || 0),
      amount: Number(item.amount || 0)
    }))
  };
}

export async function dashboardStats() {
  if (!pool) return null;
  const result = await query(`
    select
      (select count(*)::int from user_identities where provider = 'telegram') as players,
      (select count(*)::int from player_profiles) as player_profile_count,
      (select coalesce(sum(balance), 0)::bigint from wallets) as wallet_total,
      (select coalesce(sum(stack), 0)::bigint from saved_stacks) as saved_stack_total,
      (select coalesce(sum(amount), 0)::bigint from ledger_entries where type = 'credit' and balance_bucket = 'play') as ledger_credit_total,
      (select coalesce(sum(amount), 0)::bigint from ledger_entries where type = 'debit' and balance_bucket = 'play') as ledger_debit_total,
      (select coalesce(sum(amount), 0)::bigint from ledger_entries where type = 'credit' and balance_bucket in ('cash_usdt', 'cash')) as cash_ledger_credit_total,
      (select coalesce(sum(amount), 0)::bigint from ledger_entries where type = 'debit' and balance_bucket in ('cash_usdt', 'cash')) as cash_ledger_debit_total,
      (select coalesce(sum(amount), 0)::bigint from platform_ledger_entries where type = 'credit') as platform_ledger_credit_total,
      (select coalesce(sum(amount), 0)::bigint from platform_ledger_entries where type = 'debit') as platform_ledger_debit_total,
      (select coalesce(sum(amount), 0)::bigint from platform_ledger_entries where type = 'credit' and balance_bucket = 'play') as play_platform_ledger_credit_total,
      (select coalesce(sum(amount), 0)::bigint from platform_ledger_entries where type = 'debit' and balance_bucket = 'play') as play_platform_ledger_debit_total,
      (select coalesce(sum(amount), 0)::bigint from platform_ledger_entries where type = 'credit' and balance_bucket = 'cash') as cash_platform_ledger_credit_total,
      (select coalesce(sum(amount), 0)::bigint from platform_ledger_entries where type = 'debit' and balance_bucket = 'cash') as cash_platform_ledger_debit_total,
      (select count(*)::int from hand_histories) as hand_history_count,
      (select coalesce(sum(rake), 0)::bigint from hand_histories) as hand_history_rake_total,
      (select count(*)::int from hand_actions) as hand_action_count,
      (select count(*)::int from hand_results) as hand_result_count,
      (select count(*)::int from payment_orders where status = 'paid' and method = 'stars') as paid_stars,
      (select count(*)::int from payment_orders where status = 'pending' and method = 'stars') as pending_stars,
      (select count(*)::int from withdrawal_orders where status in ('pending', 'manual_review')) as pending_withdrawals,
      (select coalesce(sum(chips), 0)::bigint from withdrawal_orders where status in ('pending', 'manual_review')) as pending_withdrawal_chips_total,
      (select coalesce(sum(gross_usdt_micros), 0)::bigint from withdrawal_orders where status in ('pending', 'manual_review')) as pending_withdrawal_usdt_total,
      (select coalesce(sum(fee_usdt_micros), 0)::bigint from withdrawal_orders where status = 'approved') as approved_withdrawal_fee_usdt_total,
      (select coalesce(sum(payout_usdt_micros), 0)::bigint from withdrawal_orders where status = 'approved') as approved_withdrawal_payout_usdt_total,
      (select coalesce(sum(cash_usdt_micros), 0)::bigint from wallets) as cash_wallet_total,
      (select coalesce(sum(locked_usdt_micros), 0)::bigint from wallets) as locked_usdt_total,
      (select coalesce(sum(
        case when credited_asset = 'USDT' then cash_usdt_micros else chips end
      ), 0)::bigint from payment_orders where status = 'paid' and method = 'stars') as paid_stars_chips_total,
      (select coalesce(sum(amount), 0)::bigint from ledger_entries where type = 'credit' and category = 'deposit_stars') as deposit_stars_ledger_total,
      (select count(*)::int from idempotency_keys where expires_at > now()) as idempotency_key_count,
      (select count(*)::int from active_table_snapshots) as active_table_snapshot_count,
      (select count(*)::int from rating_seasons) as rating_season_count,
      (select count(*)::int from rating_entries) as rating_entry_count,
      (select count(*)::int from achievement_definitions) as achievement_definition_count,
      (select count(*)::int from user_achievements) as user_achievement_count,
      (select count(*)::int from battle_pass_seasons) as battle_pass_season_count,
      (select count(*)::int from bonus_grants) as bonus_grant_count,
      (select count(*)::int from referrals) as referral_count,
      (select count(*)::int from risk_flags where status in ('open', 'review')) as open_risk_flag_count,
      (select count(*)::int from device_sessions) as device_session_count,
      (select count(*)::int from admin_audit_logs) as admin_audit_log_count,
      (select count(*)::int from analytics_events) as analytics_event_count
  `);
  return {
    players: Number(result.rows[0].players || 0),
    playerProfileCount: Number(result.rows[0].player_profile_count || 0),
    walletTotal: Number(result.rows[0].wallet_total || 0),
    savedStackTotal: Number(result.rows[0].saved_stack_total || 0),
    ledgerCreditTotal: Number(result.rows[0].ledger_credit_total || 0),
    ledgerDebitTotal: Number(result.rows[0].ledger_debit_total || 0),
    cashLedgerCreditTotal: Number(result.rows[0].cash_ledger_credit_total || 0),
    cashLedgerDebitTotal: Number(result.rows[0].cash_ledger_debit_total || 0),
    platformLedgerCreditTotal: Number(result.rows[0].platform_ledger_credit_total || 0),
    platformLedgerDebitTotal: Number(result.rows[0].platform_ledger_debit_total || 0),
    playPlatformLedgerCreditTotal: Number(result.rows[0].play_platform_ledger_credit_total || 0),
    playPlatformLedgerDebitTotal: Number(result.rows[0].play_platform_ledger_debit_total || 0),
    cashPlatformLedgerCreditTotal: Number(result.rows[0].cash_platform_ledger_credit_total || 0),
    cashPlatformLedgerDebitTotal: Number(result.rows[0].cash_platform_ledger_debit_total || 0),
    handHistoryCount: Number(result.rows[0].hand_history_count || 0),
    handHistoryRakeTotal: Number(result.rows[0].hand_history_rake_total || 0),
    handActionCount: Number(result.rows[0].hand_action_count || 0),
    handResultCount: Number(result.rows[0].hand_result_count || 0),
    paidStars: Number(result.rows[0].paid_stars || 0),
    pendingStars: Number(result.rows[0].pending_stars || 0),
    pendingWithdrawals: Number(result.rows[0].pending_withdrawals || 0),
    pendingWithdrawalChipsTotal: Number(result.rows[0].pending_withdrawal_chips_total || 0),
    pendingWithdrawalUsdtTotal: Number(result.rows[0].pending_withdrawal_usdt_total || 0),
    approvedWithdrawalFeeUsdtTotal: Number(result.rows[0].approved_withdrawal_fee_usdt_total || 0),
    approvedWithdrawalPayoutUsdtTotal: Number(result.rows[0].approved_withdrawal_payout_usdt_total || 0),
    cashWalletTotal: Number(result.rows[0].cash_wallet_total || 0),
    lockedUsdtTotal: Number(result.rows[0].locked_usdt_total || 0),
    paidStarsChipsTotal: Number(result.rows[0].paid_stars_chips_total || 0),
    depositStarsLedgerTotal: Number(result.rows[0].deposit_stars_ledger_total || 0),
    idempotencyKeyCount: Number(result.rows[0].idempotency_key_count || 0),
    activeTableSnapshotCount: Number(result.rows[0].active_table_snapshot_count || 0),
    ratingSeasonCount: Number(result.rows[0].rating_season_count || 0),
    ratingEntryCount: Number(result.rows[0].rating_entry_count || 0),
    achievementDefinitionCount: Number(result.rows[0].achievement_definition_count || 0),
    userAchievementCount: Number(result.rows[0].user_achievement_count || 0),
    battlePassSeasonCount: Number(result.rows[0].battle_pass_season_count || 0),
    bonusGrantCount: Number(result.rows[0].bonus_grant_count || 0),
    referralCount: Number(result.rows[0].referral_count || 0),
    openRiskFlagCount: Number(result.rows[0].open_risk_flag_count || 0),
    deviceSessionCount: Number(result.rows[0].device_session_count || 0),
    adminAuditLogCount: Number(result.rows[0].admin_audit_log_count || 0),
    analyticsEventCount: Number(result.rows[0].analytics_event_count || 0)
  };
}

export async function listUsers(limit = 100) {
  if (!pool) return null;
  const normalizedLimit = Math.max(1, Math.min(500, Math.round(Number(limit) || 100)));
  const result = await query(`
    select
      ui.provider_user_id as id,
      au.display_name as name,
      au.username,
      au.photo_url,
      au.created_at,
      au.updated_at,
      coalesce(w.balance, 0)::bigint as balance,
      coalesce(w.cash_usdt_micros, 0)::bigint as cash_balance_micros,
      coalesce(w.bonus_usdt_micros, 0)::bigint as bonus_usdt_micros,
      coalesce(w.locked_usdt_micros, 0)::bigint as locked_usdt_micros,
      coalesce(pp.cash_level, 1)::int as cash_level,
      coalesce(pp.cash_xp, 0)::bigint as cash_xp,
      coalesce(pp.cash_status, 'Новичок') as cash_status,
      coalesce(pp.rating_points, 0)::bigint as rating_points,
      coalesce(ss.stack, 0)::bigint as saved_stack,
      (select count(*)::int from ledger_entries le where le.app_user_id = au.id) as ledger_count
    from user_identities ui
    join app_users au on au.id = ui.app_user_id
    left join wallets w on w.app_user_id = au.id
    left join player_profiles pp on pp.app_user_id = au.id
    left join saved_stacks ss on ss.app_user_id = au.id
    where ui.provider = 'telegram'
    order by greatest(
      au.updated_at,
      coalesce(w.updated_at, au.updated_at),
      coalesce(ss.updated_at, au.updated_at)
    ) desc
    limit $1
  `, [normalizedLimit]);

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name || "unknown",
    username: row.username || "",
    photoUrl: row.photo_url || "",
    balance: Number(row.balance || 0),
    cashBalanceMicros: Number(row.cash_balance_micros || 0),
    bonusUsdtMicros: Number(row.bonus_usdt_micros || 0),
    lockedUsdtMicros: Number(row.locked_usdt_micros || 0),
    cashLevel: Number(row.cash_level || 1),
    cashXp: Number(row.cash_xp || 0),
    cashStatus: row.cash_status || "Новичок",
    ratingPoints: Number(row.rating_points || 0),
    savedStack: Number(row.saved_stack || 0),
    ledgerCount: Number(row.ledger_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function listRatingLeaderboard({ seasonId = activeRatingSeasonId(), limit = 50 } = {}) {
  if (!pool) return null;
  const normalizedLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 50)));
  const result = await query(`
    select
      ui.provider_user_id as id,
      au.display_name as name,
      au.username,
      au.photo_url as "photoUrl",
      pp.rating_points as "ratingPoints",
      pp.rating_peak_points as "ratingPeakPoints",
      pp.rating_tier as "ratingTier",
      pp.rating_hands_played as "ratingHandsPlayed",
      pp.rating_active_days as "ratingActiveDays",
      pp.updated_at as "updatedAt"
    from player_profiles pp
    join app_users au on au.id = pp.app_user_id
    join user_identities ui on ui.app_user_id = au.id and ui.provider = 'telegram'
    where pp.rating_season_id = $1 or pp.rating_hands_played > 0
    order by pp.rating_points desc, pp.rating_hands_played desc, pp.updated_at asc
    limit $2
  `, [seasonId, normalizedLimit]);
  return result.rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    name: row.name || "Player",
    username: row.username || "",
    photoUrl: row.photoUrl || "",
    ratingPoints: Number(row.ratingPoints || RATING.seasonStartingRp),
    ratingPeakPoints: Number(row.ratingPeakPoints || RATING.seasonStartingRp),
    ratingTier: row.ratingTier || ratingLeague(row.ratingPoints).title,
    ratingHandsPlayed: Number(row.ratingHandsPlayed || 0),
    ratingActiveDays: Number(row.ratingActiveDays || 0),
    eligible: Number(row.ratingHandsPlayed || 0) >= RATING.minActiveHandsForLeaderboard
      && Number(row.ratingActiveDays || 0) >= RATING.minActiveDaysForLeaderboard,
    updatedAt: row.updatedAt
  }));
}

function normalizeTournamentDefinitionRow(row = {}) {
  const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
  return {
    id: row.id,
    title: row.title || "Tournament",
    type: row.type === "sng" ? "sng" : "mtt",
    status: row.status || "created",
    balanceBucket: "cash",
    buyIn: Number(row.buyIn || 0),
    fee: Number(row.fee || 0),
    guaranteedPrizePool: Number(row.guaranteedPrizePool || 0),
    maxPlayers: Number(row.maxPlayers || 2),
    minPlayers: Number(row.minPlayers || 2),
    maxPlayersPerTable: Number(row.maxPlayersPerTable || 6),
    startingStack: Number(row.startingStack || 10_000),
    structure: Array.isArray(row.structure) ? row.structure : [],
    payoutStructure: Array.isArray(row.payoutStructure) ? row.payoutStructure : null,
    registrationOpensAt: row.registrationOpensAt,
    startsAt: row.startsAt,
    lateRegEndsAt: row.lateRegEndsAt,
    lateRegMinutes: Number(raw.lateRegMinutes || 0),
    reEntryLimit: Number(row.reEntryLimit || 0),
    addOnAllowed: row.addOnAllowed === true,
    currentLevel: Number(row.currentLevel || 1),
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null,
    cancelledAt: row.cancelledAt || null,
    description: String(raw.description || ""),
    registrationLocked: raw.registrationLocked === true,
    prizePoolMode: raw.prizePoolMode || "buyins",
    eventSequence: Number(raw.eventSequence || 0),
    events: Array.isArray(raw.events) ? raw.events : [],
    notifications: raw.notifications && typeof raw.notifications === "object" ? raw.notifications : {},
    raw,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  };
}

function tournamentRawDocument(tournament = {}) {
  const raw = tournament.raw && typeof tournament.raw === "object" ? tournament.raw : {};
  return {
    ...raw,
    prizePoolMode: raw.prizePoolMode || tournament.prizePoolMode || "buyins",
    description: String(tournament.description || raw.description || ""),
    lateRegMinutes: Math.max(0, Math.round(Number(tournament.lateRegMinutes || raw.lateRegMinutes || 0))),
    registrationLocked: tournament.registrationLocked === true || raw.registrationLocked === true,
    eventSequence: Math.max(0, Number(tournament.eventSequence || raw.eventSequence || 0)),
    events: Array.isArray(tournament.events) ? tournament.events.slice(-160) : (Array.isArray(raw.events) ? raw.events.slice(-160) : []),
    notifications: tournament.notifications && typeof tournament.notifications === "object" ? tournament.notifications : (raw.notifications || {})
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
  await query("insert into player_profiles (app_user_id) values ($1) on conflict do nothing", [appUserId]);

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
      cash_usdt_micros bigint not null default 0 check (cash_usdt_micros >= 0),
      bonus_usdt_micros bigint not null default 0 check (bonus_usdt_micros >= 0),
      locked_usdt_micros bigint not null default 0 check (locked_usdt_micros >= 0),
      withdrawable_usdt_micros bigint not null default 0 check (withdrawable_usdt_micros >= 0),
      updated_at timestamptz not null default now()
    );
    alter table wallets add column if not exists cash_usdt_micros bigint not null default 0 check (cash_usdt_micros >= 0);
    alter table wallets add column if not exists bonus_usdt_micros bigint not null default 0 check (bonus_usdt_micros >= 0);
    alter table wallets add column if not exists locked_usdt_micros bigint not null default 0 check (locked_usdt_micros >= 0);
    alter table wallets add column if not exists withdrawable_usdt_micros bigint not null default 0 check (withdrawable_usdt_micros >= 0);

    create table if not exists player_profiles (
      app_user_id text primary key references app_users(id) on delete cascade,
      cash_level integer not null default 1 check (cash_level >= 1),
      cash_xp bigint not null default 0 check (cash_xp >= 0),
      cash_status text not null default 'Новичок',
      cash_club_points bigint not null default 0 check (cash_club_points >= 0),
      cash_rake_contributed bigint not null default 0 check (cash_rake_contributed >= 0),
      rating_points bigint not null default 1000,
      rating_peak_points bigint not null default 1000,
      rating_tier text not null default 'Bronze',
      rating_season_id text not null default '',
      rating_active_days integer not null default 0 check (rating_active_days >= 0),
      hands_played integer not null default 0 check (hands_played >= 0),
      cash_hands_played integer not null default 0 check (cash_hands_played >= 0),
      rating_hands_played integer not null default 0 check (rating_hands_played >= 0),
      tournaments_played integer not null default 0 check (tournaments_played >= 0),
      tournament_entries integer not null default 0 check (tournament_entries >= 0),
      tournament_itm integer not null default 0 check (tournament_itm >= 0),
      tournament_final_tables integer not null default 0 check (tournament_final_tables >= 0),
      tournament_wins integer not null default 0 check (tournament_wins >= 0),
      tournament_fees_paid bigint not null default 0 check (tournament_fees_paid >= 0),
      tournament_cash_fees_paid_micros bigint not null default 0 check (tournament_cash_fees_paid_micros >= 0),
      tournament_play_fees_paid bigint not null default 0 check (tournament_play_fees_paid >= 0),
      tournament_prize_won bigint not null default 0 check (tournament_prize_won >= 0),
      tournament_cash_prize_won_micros bigint not null default 0 check (tournament_cash_prize_won_micros >= 0),
      tournament_play_prize_won bigint not null default 0 check (tournament_play_prize_won >= 0),
      sng_played integer not null default 0 check (sng_played >= 0),
      sng_wins integer not null default 0 check (sng_wins >= 0),
      sng_fees_paid bigint not null default 0 check (sng_fees_paid >= 0),
      sng_cash_fees_paid_micros bigint not null default 0 check (sng_cash_fees_paid_micros >= 0),
      sng_play_fees_paid bigint not null default 0 check (sng_play_fees_paid >= 0),
      sng_prize_won bigint not null default 0 check (sng_prize_won >= 0),
      sng_cash_prize_won_micros bigint not null default 0 check (sng_cash_prize_won_micros >= 0),
      sng_play_prize_won bigint not null default 0 check (sng_play_prize_won >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table player_profiles add column if not exists cash_club_points bigint not null default 0 check (cash_club_points >= 0);
    alter table player_profiles add column if not exists cash_rake_contributed bigint not null default 0 check (cash_rake_contributed >= 0);
    alter table player_profiles add column if not exists rating_peak_points bigint not null default 1000;
    alter table player_profiles add column if not exists rating_active_days integer not null default 0 check (rating_active_days >= 0);
    alter table player_profiles add column if not exists tournament_entries integer not null default 0 check (tournament_entries >= 0);
    alter table player_profiles add column if not exists tournament_itm integer not null default 0 check (tournament_itm >= 0);
    alter table player_profiles add column if not exists tournament_final_tables integer not null default 0 check (tournament_final_tables >= 0);
    alter table player_profiles add column if not exists tournament_wins integer not null default 0 check (tournament_wins >= 0);
    alter table player_profiles add column if not exists tournament_fees_paid bigint not null default 0 check (tournament_fees_paid >= 0);
    alter table player_profiles add column if not exists tournament_cash_fees_paid_micros bigint not null default 0 check (tournament_cash_fees_paid_micros >= 0);
    alter table player_profiles add column if not exists tournament_play_fees_paid bigint not null default 0 check (tournament_play_fees_paid >= 0);
    alter table player_profiles add column if not exists tournament_prize_won bigint not null default 0 check (tournament_prize_won >= 0);
    alter table player_profiles add column if not exists tournament_cash_prize_won_micros bigint not null default 0 check (tournament_cash_prize_won_micros >= 0);
    alter table player_profiles add column if not exists tournament_play_prize_won bigint not null default 0 check (tournament_play_prize_won >= 0);
    alter table player_profiles add column if not exists sng_played integer not null default 0 check (sng_played >= 0);
    alter table player_profiles add column if not exists sng_wins integer not null default 0 check (sng_wins >= 0);
    alter table player_profiles add column if not exists sng_fees_paid bigint not null default 0 check (sng_fees_paid >= 0);
    alter table player_profiles add column if not exists sng_cash_fees_paid_micros bigint not null default 0 check (sng_cash_fees_paid_micros >= 0);
    alter table player_profiles add column if not exists sng_play_fees_paid bigint not null default 0 check (sng_play_fees_paid >= 0);
    alter table player_profiles add column if not exists sng_prize_won bigint not null default 0 check (sng_prize_won >= 0);
    alter table player_profiles add column if not exists sng_cash_prize_won_micros bigint not null default 0 check (sng_cash_prize_won_micros >= 0);
    alter table player_profiles add column if not exists sng_play_prize_won bigint not null default 0 check (sng_play_prize_won >= 0);
    alter table player_profiles alter column rating_points set default 1000;
    alter table player_profiles alter column rating_peak_points set default 1000;
    alter table player_profiles alter column rating_tier set default 'Bronze';
    alter table player_profiles alter column cash_club_points set default 0;
    alter table player_profiles alter column cash_rake_contributed set default 0;
    update player_profiles
    set cash_club_points = greatest(cash_club_points, cash_xp),
        rating_points = case when rating_points = 0 and rating_hands_played = 0 then 1000 else rating_points end,
        rating_peak_points = greatest(rating_peak_points, rating_points, 1000),
        rating_tier = case
          when rating_tier in ('', 'Unranked') and rating_points >= 0 then 'Bronze'
          else rating_tier
        end;
    create index if not exists idx_player_profiles_rating on player_profiles(rating_season_id, rating_points desc);
    create index if not exists idx_player_profiles_cash_level on player_profiles(cash_level desc, cash_xp desc);
    create index if not exists idx_player_profiles_cash_club on player_profiles(cash_club_points desc, cash_rake_contributed desc);

    create table if not exists profile_hand_progress (
      hand_id text not null,
      app_user_id text not null references app_users(id) on delete cascade,
      game_mode text not null default 'play',
      created_at timestamptz not null default now(),
      primary key (hand_id, app_user_id)
    );
    create index if not exists idx_profile_hand_progress_user_created on profile_hand_progress(app_user_id, created_at desc);

    create table if not exists saved_stacks (
      app_user_id text primary key references app_users(id) on delete cascade,
      stack bigint not null default 0 check (stack >= 0),
      updated_at timestamptz not null default now()
    );

    create table if not exists daily_play_claims (
      app_user_id text primary key references app_users(id) on delete cascade,
      claimed_at timestamptz,
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_daily_play_claims_claimed_at on daily_play_claims(claimed_at desc);

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
      asset text not null default 'PLAY_CHIPS',
      balance_bucket text not null default 'play' check (balance_bucket in ('play', 'cash', 'cash_usdt', 'bonus_usdt')),
      reversal_of text references ledger_entries(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_ledger_entries_app_user_created on ledger_entries(app_user_id, created_at desc);
    alter table ledger_entries add column if not exists category text not null default 'other';
    alter table ledger_entries add column if not exists idempotency_key text;
    alter table ledger_entries add column if not exists asset text not null default 'PLAY_CHIPS';
    alter table ledger_entries add column if not exists balance_bucket text not null default 'play';
    alter table ledger_entries drop constraint if exists ledger_entries_balance_bucket_check;
    alter table ledger_entries add constraint ledger_entries_balance_bucket_check
      check (balance_bucket in ('play', 'cash', 'cash_usdt', 'bonus_usdt'));
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

    create table if not exists poker_tables (
      id text primary key,
      table_name text not null default '',
      game_type text not null default 'texas_holdem',
      game_mode text not null default 'rating' check (game_mode in ('cash', 'rating', 'tournament', 'private')),
      currency text not null default 'PLAY_CHIPS',
      small_blind bigint not null default 0 check (small_blind >= 0),
      big_blind bigint not null default 0 check (big_blind >= 0),
      min_buy_in bigint not null default 0 check (min_buy_in >= 0),
      max_buy_in bigint not null default 0 check (max_buy_in >= 0),
      max_players integer not null default 6 check (max_players between 2 and 9),
      rake_percent numeric(5, 2) not null default 0 check (rake_percent >= 0),
      rake_cap bigint not null default 0 check (rake_cap >= 0),
      status text not null default 'waiting' check (status in ('waiting', 'active', 'paused', 'closed')),
      is_private boolean not null default false,
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_poker_tables_mode_limit on poker_tables(game_mode, small_blind, big_blind);
    create index if not exists idx_poker_tables_status_updated on poker_tables(status, updated_at desc);

    create table if not exists table_seats (
      table_id text not null references poker_tables(id) on delete cascade,
      seat_number integer not null check (seat_number >= 0),
      app_user_id text references app_users(id) on delete set null,
      status text not null default 'empty' check (status in ('empty', 'reserved', 'active', 'folded', 'sitting_out', 'all_in', 'left')),
      stack_amount bigint not null default 0 check (stack_amount >= 0),
      current_bet bigint not null default 0 check (current_bet >= 0),
      last_action text not null default '',
      raw jsonb not null default '{}'::jsonb,
      seated_at timestamptz,
      updated_at timestamptz not null default now(),
      primary key (table_id, seat_number)
    );

    create index if not exists idx_table_seats_user on table_seats(app_user_id, updated_at desc) where app_user_id is not null;

    create table if not exists tournaments (
      id text primary key,
      title text not null,
      type text not null check (type in ('mtt', 'sng')),
      status text not null check (status in ('created', 'registration_open', 'late_registration', 'running', 'final_table', 'finished', 'cancelled')),
      balance_bucket text not null default 'cash' check (balance_bucket in ('play', 'cash')),
      buy_in bigint not null default 0 check (buy_in >= 0),
      fee bigint not null default 0 check (fee >= 0),
      guaranteed_prize_pool bigint not null default 0 check (guaranteed_prize_pool >= 0),
      max_players integer not null check (max_players >= 2),
      min_players integer not null default 2 check (min_players >= 2),
      max_players_per_table integer not null default 6 check (max_players_per_table between 2 and 9),
      starting_stack bigint not null default 10000 check (starting_stack > 0),
      structure jsonb not null default '[]'::jsonb,
      payout_structure jsonb,
      registration_opens_at timestamptz not null,
      starts_at timestamptz not null,
      late_reg_ends_at timestamptz,
      re_entry_limit integer not null default 0 check (re_entry_limit >= 0),
      add_on_allowed boolean not null default false,
      current_level integer not null default 1 check (current_level >= 1),
      started_at timestamptz,
      finished_at timestamptz,
      cancelled_at timestamptz,
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_tournaments_status_start on tournaments(status, starts_at);

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

    create table if not exists tournament_tables (
      id text primary key,
      tournament_id text not null references tournaments(id) on delete cascade,
      table_number integer not null,
      status text not null default 'active' check (status in ('active', 'closed')),
      small_blind bigint not null default 0,
      big_blind bigint not null default 0,
      ante bigint not null default 0,
      seats jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tournament_id, table_number)
    );

    create index if not exists idx_tournament_tables_active on tournament_tables(tournament_id, status);

    create table if not exists tournament_results (
      tournament_id text not null references tournaments(id) on delete cascade,
      app_user_id text not null references app_users(id) on delete cascade,
      place integer not null check (place > 0),
      prize_amount bigint not null default 0 check (prize_amount >= 0),
      balance_bucket text not null check (balance_bucket in ('play', 'cash')),
      eliminated_at timestamptz,
      created_at timestamptz not null default now(),
      primary key (tournament_id, app_user_id),
      unique (tournament_id, place)
    );

    create index if not exists idx_tournament_results_user on tournament_results(app_user_id, created_at desc);

    create table if not exists tournament_payouts (
      id text primary key,
      tournament_id text not null references tournaments(id) on delete cascade,
      app_user_id text not null references app_users(id) on delete cascade,
      place integer not null check (place > 0),
      amount bigint not null check (amount >= 0),
      balance_bucket text not null check (balance_bucket in ('play', 'cash')),
      idempotency_key text not null unique,
      paid_at timestamptz not null default now(),
      unique (tournament_id, app_user_id)
    );

    create table if not exists reward_tournament_events (
      id text primary key,
      title text not null,
      season_id text not null default '',
      status text not null default 'tickets_issued',
      starts_at timestamptz,
      description text not null default '',
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_reward_tournament_events_season on reward_tournament_events(season_id, created_at desc);

    create table if not exists reward_tickets (
      id text primary key,
      event_id text not null references reward_tournament_events(id) on delete cascade,
      app_user_id text not null references app_users(id) on delete cascade,
      provider text not null default 'telegram',
      provider_user_id text not null,
      leaderboard_rank integer not null check (leaderboard_rank > 0),
      status text not null default 'active' check (status in ('active', 'used', 'revoked')),
      granted_at timestamptz not null default now(),
      used_at timestamptz,
      raw jsonb not null default '{}'::jsonb,
      unique (event_id, app_user_id)
    );

    create index if not exists idx_reward_tickets_event_rank on reward_tickets(event_id, leaderboard_rank asc);
    create index if not exists idx_reward_tickets_user on reward_tickets(app_user_id, granted_at desc);

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
      fairness_proof jsonb not null default '{}'::jsonb,
      raw jsonb not null default '{}'::jsonb,
      finished_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    alter table hand_histories add column if not exists fairness_proof jsonb not null default '{}'::jsonb;
    create index if not exists idx_hand_histories_finished on hand_histories(finished_at desc);
    create index if not exists idx_hand_histories_table_hand on hand_histories(table_id, hand_number desc);

    create table if not exists hand_actions (
      id text primary key,
      hand_id text not null references hand_histories(id) on delete cascade,
      table_id text not null,
      app_user_id text references app_users(id) on delete set null,
      provider text not null default 'telegram',
      provider_user_id text not null default '',
      seat_number integer not null default -1,
      street text not null default 'preflop',
      action text not null,
      amount bigint not null default 0 check (amount >= 0),
      stack_before bigint,
      stack_after bigint,
      pot_after bigint,
      sequence integer not null default 0,
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_hand_actions_hand_sequence on hand_actions(hand_id, sequence asc, created_at asc);
    create index if not exists idx_hand_actions_user_created on hand_actions(app_user_id, created_at desc) where app_user_id is not null;

    create table if not exists hand_results (
      id text primary key,
      hand_id text not null references hand_histories(id) on delete cascade,
      table_id text not null,
      app_user_id text references app_users(id) on delete set null,
      provider text not null default 'telegram',
      provider_user_id text not null default '',
      seat_number integer not null default -1,
      hand_name text not null default '',
      cards jsonb not null default '[]'::jsonb,
      win_amount bigint not null default 0 check (win_amount >= 0),
      rake_amount bigint not null default 0 check (rake_amount >= 0),
      is_winner boolean not null default false,
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_hand_results_hand on hand_results(hand_id, is_winner desc);
    create index if not exists idx_hand_results_user_created on hand_results(app_user_id, created_at desc) where app_user_id is not null;

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
    alter table platform_ledger_entries add column if not exists asset text not null default 'PLAY_CHIPS';
    alter table platform_ledger_entries add column if not exists balance_bucket text not null default 'play';
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
      paid_at timestamptz,
      credited_asset text not null default 'PLAY_CHIPS',
      cash_usdt_micros bigint not null default 0 check (cash_usdt_micros >= 0)
    );

    alter table payment_orders add column if not exists asset text not null default '';
    alter table payment_orders add column if not exists network text not null default '';
    alter table payment_orders add column if not exists crypto_amount numeric(24, 8);
    alter table payment_orders add column if not exists external_id text not null default '';
    alter table payment_orders add column if not exists expires_at timestamptz;
    alter table payment_orders add column if not exists credited_asset text not null default 'PLAY_CHIPS';
    alter table payment_orders add column if not exists cash_usdt_micros bigint not null default 0 check (cash_usdt_micros >= 0);
    create index if not exists idx_payment_orders_app_user_created on payment_orders(app_user_id, created_at desc);
    create index if not exists idx_payment_orders_status_created on payment_orders(status, created_at desc);
    create index if not exists idx_payment_orders_external_id on payment_orders(external_id) where external_id <> '';

    create table if not exists withdrawal_orders (
      id text primary key,
      app_user_id text not null references app_users(id) on delete cascade,
      provider text not null,
      provider_user_id text not null,
      method text not null,
      status text not null check (status in ('pending', 'manual_review', 'approved', 'rejected', 'cancelled', 'failed')),
      chips bigint not null default 0 check (chips >= 0),
      fee_chips bigint not null default 0 check (fee_chips >= 0),
      payout_chips bigint not null default 0 check (payout_chips >= 0),
      gross_usdt_micros bigint not null default 0 check (gross_usdt_micros >= 0),
      fee_usdt_micros bigint not null default 0 check (fee_usdt_micros >= 0),
      payout_usdt_micros bigint not null default 0 check (payout_usdt_micros >= 0),
      asset text not null default 'PLAY_CHIPS',
      balance_bucket text not null default 'play',
      destination text not null default '',
      admin_reason text not null default '',
      reviewed_by_provider_user_id text not null default '',
      idempotency_key text,
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      reviewed_at timestamptz
    );

    alter table withdrawal_orders drop constraint if exists withdrawal_orders_chips_check;
    alter table withdrawal_orders alter column chips set default 0;
    alter table withdrawal_orders add constraint withdrawal_orders_chips_check check (chips >= 0);
    create index if not exists idx_withdrawal_orders_app_user_created on withdrawal_orders(app_user_id, created_at desc);
    create index if not exists idx_withdrawal_orders_status_created on withdrawal_orders(status, created_at desc);
    alter table withdrawal_orders add column if not exists gross_usdt_micros bigint not null default 0 check (gross_usdt_micros >= 0);
    alter table withdrawal_orders add column if not exists fee_usdt_micros bigint not null default 0 check (fee_usdt_micros >= 0);
    alter table withdrawal_orders add column if not exists payout_usdt_micros bigint not null default 0 check (payout_usdt_micros >= 0);
    alter table withdrawal_orders add column if not exists asset text not null default 'PLAY_CHIPS';
    alter table withdrawal_orders add column if not exists balance_bucket text not null default 'play';
    create unique index if not exists idx_withdrawal_orders_idempotency_key on withdrawal_orders(idempotency_key) where idempotency_key is not null;

    create table if not exists rating_seasons (
      id text primary key,
      title text not null,
      status text not null default 'draft' check (status in ('draft', 'active', 'settling', 'finished', 'cancelled')),
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      freeroll_title text not null default '',
      freeroll_prize_pool_usdt_micros bigint not null default 0 check (freeroll_prize_pool_usdt_micros >= 0),
      rules jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_rating_seasons_status_dates on rating_seasons(status, starts_at, ends_at);

    create table if not exists rating_entries (
      id text primary key,
      season_id text not null references rating_seasons(id) on delete cascade,
      app_user_id text not null references app_users(id) on delete cascade,
      provider text not null default 'telegram',
      provider_user_id text not null default '',
      type text not null default 'game',
      points_delta bigint not null default 0,
      points_after bigint not null default 0,
      source_id text not null default '',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_rating_entries_season_user on rating_entries(season_id, app_user_id, created_at desc);
    create index if not exists idx_rating_entries_leaderboard on rating_entries(season_id, points_after desc, created_at desc);

    create table if not exists achievement_definitions (
      id text primary key,
      category text not null default 'general',
      code text not null unique,
      title text not null,
      description text not null default '',
      reward_type text not null default 'none',
      reward_amount bigint not null default 0 check (reward_amount >= 0),
      is_hidden boolean not null default false,
      is_active boolean not null default true,
      rules jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_achievement_definitions_active on achievement_definitions(is_active, category);

    create table if not exists user_achievements (
      app_user_id text not null references app_users(id) on delete cascade,
      achievement_id text not null references achievement_definitions(id) on delete cascade,
      progress bigint not null default 0 check (progress >= 0),
      status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'claimed')),
      completed_at timestamptz,
      claimed_at timestamptz,
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (app_user_id, achievement_id)
    );

    create index if not exists idx_user_achievements_status on user_achievements(status, updated_at desc);

    create table if not exists battle_pass_seasons (
      id text primary key,
      title text not null,
      status text not null default 'draft' check (status in ('draft', 'active', 'finished', 'cancelled')),
      price_usdt_micros bigint not null default 0 check (price_usdt_micros >= 0),
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      rewards jsonb not null default '[]'::jsonb,
      rules jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_battle_pass_seasons_status_dates on battle_pass_seasons(status, starts_at, ends_at);

    create table if not exists battle_pass_progress (
      season_id text not null references battle_pass_seasons(id) on delete cascade,
      app_user_id text not null references app_users(id) on delete cascade,
      xp bigint not null default 0 check (xp >= 0),
      premium_unlocked boolean not null default false,
      claimed_rewards jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (season_id, app_user_id)
    );

    create index if not exists idx_battle_pass_progress_user on battle_pass_progress(app_user_id, updated_at desc);

    create table if not exists bonus_grants (
      id text primary key,
      app_user_id text not null references app_users(id) on delete cascade,
      provider text not null default 'telegram',
      provider_user_id text not null default '',
      bonus_type text not null,
      status text not null default 'pending' check (status in ('pending', 'active', 'completed', 'expired', 'cancelled')),
      amount_usdt_micros bigint not null default 0 check (amount_usdt_micros >= 0),
      rating_chips bigint not null default 0 check (rating_chips >= 0),
      wagering_required bigint not null default 0 check (wagering_required >= 0),
      wagering_done bigint not null default 0 check (wagering_done >= 0),
      source_id text not null default '',
      expires_at timestamptz,
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table bonus_grants add column if not exists bonus_amount_micros bigint not null default 0 check (bonus_amount_micros >= 0);
    alter table bonus_grants add column if not exists wagering_required_micros bigint not null default 0 check (wagering_required_micros >= 0);
    alter table bonus_grants add column if not exists wagering_paid_micros bigint not null default 0 check (wagering_paid_micros >= 0);
    update bonus_grants
    set bonus_amount_micros = greatest(bonus_amount_micros, amount_usdt_micros),
        wagering_required_micros = greatest(wagering_required_micros, wagering_required),
        wagering_paid_micros = greatest(wagering_paid_micros, wagering_done);
    with duplicate_welcome as (
      select id, row_number() over (partition by app_user_id order by created_at asc, id asc) as position
      from bonus_grants
      where bonus_type = 'welcome'
    )
    update bonus_grants bg
    set bonus_type = 'welcome_duplicate_archived', status = 'cancelled', updated_at = now()
    from duplicate_welcome duplicate
    where bg.id = duplicate.id and duplicate.position > 1;

    create index if not exists idx_bonus_grants_user_status on bonus_grants(app_user_id, status, created_at desc);
    create unique index if not exists idx_bonus_grants_welcome_once
      on bonus_grants(app_user_id, bonus_type)
      where bonus_type = 'welcome';

    create table if not exists bonus_wagering_events (
      grant_id text not null references bonus_grants(id) on delete cascade,
      hand_id text not null,
      rake_amount_micros bigint not null default 0 check (rake_amount_micros >= 0),
      created_at timestamptz not null default now(),
      primary key (grant_id, hand_id)
    );

    create table if not exists referrals (
      id text primary key,
      referrer_app_user_id text not null references app_users(id) on delete cascade,
      referred_app_user_id text not null references app_users(id) on delete cascade,
      code text not null default '',
      source text not null default '',
      status text not null default 'registered' check (status in ('registered', 'qualified', 'blocked', 'paid')),
      qualified_at timestamptz,
      paid_at timestamptz,
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      unique (referred_app_user_id)
    );

    create index if not exists idx_referrals_referrer_created on referrals(referrer_app_user_id, created_at desc);
    create index if not exists idx_referrals_code on referrals(code) where code <> '';

    create table if not exists risk_flags (
      id text primary key,
      app_user_id text references app_users(id) on delete set null,
      provider text not null default 'telegram',
      provider_user_id text not null default '',
      flag_type text not null,
      severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
      status text not null default 'open' check (status in ('open', 'review', 'resolved', 'dismissed')),
      reason text not null default '',
      source_id text not null default '',
      meta jsonb not null default '{}'::jsonb,
      reviewed_by text not null default '',
      reviewed_at timestamptz,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_risk_flags_status_severity on risk_flags(status, severity, created_at desc);
    create index if not exists idx_risk_flags_user on risk_flags(app_user_id, created_at desc) where app_user_id is not null;

    create table if not exists device_sessions (
      id text primary key,
      app_user_id text references app_users(id) on delete cascade,
      provider text not null default 'telegram',
      provider_user_id text not null default '',
      ip_hash text not null default '',
      user_agent text not null default '',
      platform text not null default '',
      device_id_hash text not null default '',
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      meta jsonb not null default '{}'::jsonb
    );

    create index if not exists idx_device_sessions_user_seen on device_sessions(app_user_id, last_seen_at desc) where app_user_id is not null;
    create index if not exists idx_device_sessions_ip_hash on device_sessions(ip_hash, last_seen_at desc) where ip_hash <> '';

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

    create table if not exists admin_audit_logs (
      id text primary key,
      actor_provider text not null default 'telegram',
      actor_provider_user_id text not null default '',
      actor_role text not null default '',
      action text not null,
      target_type text not null default '',
      target_id text not null default '',
      result text not null default 'ok' check (result in ('ok', 'failed', 'denied', 'manual_review')),
      reason text not null default '',
      ip_hash text not null default '',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_admin_audit_logs_actor_created on admin_audit_logs(actor_provider_user_id, created_at desc);
    create index if not exists idx_admin_audit_logs_action_created on admin_audit_logs(action, created_at desc);

    create table if not exists analytics_events (
      id text primary key,
      event_name text not null,
      category text not null default 'product',
      app_user_id text references app_users(id) on delete set null,
      provider text not null default 'telegram',
      provider_user_id text not null default '',
      session_id text not null default '',
      source text not null default 'server',
      amount bigint not null default 0,
      asset text not null default '',
      context_id text not null default '',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_analytics_events_created on analytics_events(created_at desc);
    create index if not exists idx_analytics_events_name_created on analytics_events(event_name, created_at desc);
    create index if not exists idx_analytics_events_user_created on analytics_events(app_user_id, created_at desc) where app_user_id is not null;
    create index if not exists idx_analytics_events_context on analytics_events(context_id, created_at desc) where context_id <> '';
    update tournaments set balance_bucket = 'cash' where balance_bucket <> 'cash';
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
    creditedAsset: row.credited_asset || "PLAY_CHIPS",
    cashUsdtMicros: Number(row.cash_usdt_micros || 0),
    usdtAmount: Number(row.raw?.usdtAmount || Number(row.cash_usdt_micros || 0) / 1_000_000),
    tonUsdtRate: Number(row.raw?.tonUsdtRate || 0),
    stars: Number(row.stars || 0),
    asset: row.asset || "",
    network: row.network || "",
    cryptoAmount: row.crypto_amount === null || row.crypto_amount === undefined ? null : Number(row.crypto_amount),
    externalId: row.external_id || "",
    receiverAddress: row.raw?.receiverAddress || "",
    invoiceUrl: row.raw?.invoiceUrl || "",
    confirmationsRequired: Number(row.raw?.confirmationsRequired || 0),
    status: row.status,
    payload: row.payload || "",
    telegramPaymentChargeId: row.telegram_payment_charge_id || "",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at
  };
}

function withdrawalRow(row) {
  return {
    id: row.id,
    userId: row.provider_user_id,
    provider: row.provider || "telegram",
    method: row.method || "ton",
    userName: row.userName || row.display_name || "",
    username: row.username || "",
    status: row.status,
    chips: Number(row.chips || 0),
    feeChips: Number(row.fee_chips || 0),
    payoutChips: Number(row.payout_chips || 0),
    grossUsdtMicros: Number(row.gross_usdt_micros || 0),
    feeUsdtMicros: Number(row.fee_usdt_micros || 0),
    payoutUsdtMicros: Number(row.payout_usdt_micros || 0),
    asset: row.asset || "PLAY_CHIPS",
    balanceBucket: row.balance_bucket || "play",
    destination: row.destination || "",
    adminReason: row.admin_reason || "",
    reviewedBy: row.reviewed_by_provider_user_id || "",
    idempotencyKey: row.idempotency_key || "",
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at
  };
}

function query(sql, params = []) {
  return pool.query(sql, params);
}

function deterministicId(prefix, value) {
  return `${prefix}_${createHash("sha256").update(String(value || "")).digest("hex").slice(0, 32)}`;
}

function normalizeAdminAuditResult(result) {
  return ["ok", "failed", "denied", "manual_review"].includes(result) ? result : "ok";
}

function normalizeRiskSeverity(severity) {
  return ["low", "medium", "high", "critical"].includes(severity) ? severity : "medium";
}

function normalizeLedgerCategory(category) {
  return String(category || "other").trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 64) || "other";
}

function normalizeIdempotencyKey(key) {
  return String(key || "").trim().replace(/\s+/g, "_").slice(0, 240);
}

function normalizePlayerProfileRow(row = {}) {
  const cashClubPoints = Number(row.cash_club_points ?? row.cash_xp ?? 0);
  const ratingPoints = Number(row.rating_points ?? RATING.seasonStartingRp);
  const clubStatus = cashClubStatus(cashClubPoints);
  const clubProgress = cashClubProgress(cashClubPoints);
  const cashLevel = Number(row.cash_level || profileCashLevel(cashClubPoints));
  const league = ratingLeague(ratingPoints);
  return {
    cashLevel,
    cashXp: cashClubPoints,
    cashClubPoints,
    cashRakeContributed: Number(row.cash_rake_contributed || 0),
    cashStatus: row.cash_status || clubStatus.title,
    cashClubStatus: clubStatus.title,
    cashClubId: clubStatus.id,
    cashRakebackPercent: clubStatus.rakebackPercent,
    cashXpCurrent: clubProgress.current,
    cashXpRequired: clubProgress.required,
    cashXpProgress: clubProgress.progress,
    cashClubNextStatus: clubProgress.nextStatus?.title || "",
    ratingPoints,
    ratingTier: row.rating_tier || league.title,
    ratingLeague: league.title,
    ratingLeagueId: league.id,
    ratingPeakPoints: Number(row.rating_peak_points || ratingPoints),
    ratingSeasonId: row.rating_season_id || "",
    ratingActiveDays: Number(row.rating_active_days || 0),
    handsPlayed: Number(row.hands_played || 0),
    cashHandsPlayed: Number(row.cash_hands_played || 0),
    ratingHandsPlayed: Number(row.rating_hands_played || 0),
    tournamentsPlayed: Number(row.tournaments_played || row.tournament_entries || 0),
    tournamentEntries: Number(row.tournament_entries || row.tournaments_played || 0),
    tournamentItm: Number(row.tournament_itm || 0),
    tournamentFinalTables: Number(row.tournament_final_tables || 0),
    tournamentWins: Number(row.tournament_wins || 0),
    tournamentFeesPaid: Number(row.tournament_fees_paid || 0),
    tournamentCashFeesPaidMicros: Number(row.tournament_cash_fees_paid_micros || 0),
    tournamentPlayFeesPaid: Number(row.tournament_play_fees_paid || row.tournament_fees_paid || 0),
    tournamentPrizeWon: Number(row.tournament_prize_won || 0),
    tournamentCashPrizeWonMicros: Number(row.tournament_cash_prize_won_micros || 0),
    tournamentPlayPrizeWon: Number(row.tournament_play_prize_won || row.tournament_prize_won || 0),
    sngPlayed: Number(row.sng_played || 0),
    sngWins: Number(row.sng_wins || 0),
    sngFeesPaid: Number(row.sng_fees_paid || 0),
    sngCashFeesPaidMicros: Number(row.sng_cash_fees_paid_micros || 0),
    sngPlayFeesPaid: Number(row.sng_play_fees_paid || row.sng_fees_paid || 0),
    sngPrizeWon: Number(row.sng_prize_won || 0),
    sngCashPrizeWonMicros: Number(row.sng_cash_prize_won_micros || 0),
    sngPlayPrizeWon: Number(row.sng_play_prize_won || row.sng_prize_won || 0)
  };
}

function activeRatingSeasonId() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `rating-${year}-${month}`;
}

function profileCashLevel(xp) {
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

function profileCashLevelProgress(xp, level = profileCashLevel(xp)) {
  const thresholds = [0, 120, 400, 900, 1600, 2600, 4000, 6000, 8500];
  const currentLevel = Math.max(1, Math.min(thresholds.length - 1, Number(level || 1)));
  const start = thresholds[currentLevel - 1] || 0;
  const next = thresholds[currentLevel] || start + 3000;
  const current = Math.max(0, Number(xp || 0) - start);
  const required = Math.max(1, next - start);
  return {
    current,
    required,
    progress: Math.max(0, Math.min(1, Number((current / required).toFixed(4))))
  };
}

function profileCashStatus(level) {
  const value = Number(level || 1);
  if (value >= 8) return "High Roller";
  if (value >= 6) return "Regular";
  if (value >= 4) return "Grinder";
  if (value >= 2) return "Игрок";
  return "Новичок";
}

function profileRatingTier(points) {
  return ratingLeague(points).title;
}

function id(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function ratio(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  return bottom > 0 ? Number((top / bottom).toFixed(4)) : 0;
}
