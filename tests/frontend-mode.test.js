import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const renderConfig = await readFile(new URL("../render.yaml", import.meta.url), "utf8");
const dbSource = await readFile(new URL("../server/db.js", import.meta.url), "utf8");
const tonConnectManifest = JSON.parse(await readFile(new URL("../public/tonconnect-manifest.json", import.meta.url), "utf8"));
const publicTerms = await readFile(new URL("../public/terms.html", import.meta.url), "utf8");
const publicPrivacy = await readFile(new URL("../public/privacy.html", import.meta.url), "utf8");

test("lobby starts in Rating mode with the Рейтинг | Cash switch order", () => {
  assert.match(appSource, /gameMode:\s*"play"/);
  assert.doesNotMatch(appSource, /selectLobbyTab\(state\.gameMode === "play"/);
  assert.match(htmlSource, /class="active" data-game-mode="play"/);
  assert.doesNotMatch(htmlSource, /class="active" data-game-mode="cash"/);
  // Рейтинг comes first in the segmented switch.
  assert.ok(htmlSource.indexOf('data-game-mode="play"') < htmlSource.indexOf('data-game-mode="cash"'));
});

test("rating mode hides cash-only game formats", () => {
  assert.match(
    cssSource,
    /body\[data-game-mode="play"\]:not\(\.in-game\) \.play-format-grid\s*\{[^}]*display:\s*none\s*!important;/s
  );
});

test("Render starts the production server with real money enabled", () => {
  assert.match(renderConfig, /startCommand:\s*npm start/);
  assert.match(renderConfig, /key:\s*REAL_MONEY_ENABLED\s*\n\s*value:\s*"true"/);
});

test("TonConnect publishes real Weez terms and privacy documents", () => {
  assert.equal(tonConnectManifest.name, "Weez Poker");
  assert.match(tonConnectManifest.termsOfUseUrl, /\/terms$/);
  assert.match(tonConnectManifest.privacyPolicyUrl, /\/privacy$/);
  assert.match(publicTerms, /Условия использования Weez Poker/);
  assert.match(publicPrivacy, /Политика конфиденциальности Weez Poker/);
});

test("Telegram loader stays visible until the lobby is hydrated", () => {
  assert.match(htmlSource, /<html[^>]*class="app-loading"/);
  assert.match(htmlSource, /id="appBoot"/);
  assert.match(appSource, /boot\(\)\.then\(completeBoot\)\.catch\(showBootError\)/);
  assert.match(appSource, /function completeBoot\(\)[\s\S]*classList\.remove\("app-loading"\)[\s\S]*tg\?\.ready\(\)/);
  const bootBody = appSource.slice(appSource.indexOf("async function boot()"), appSource.indexOf("function completeBoot()"));
  assert.doesNotMatch(bootBody, /tg\?\.ready\(\)/);
});

test("Stars UI confirms balance only after server marks the order paid", () => {
  assert.match(appSource, /waitForPaymentConfirmation\(order\)/);
  assert.match(appSource, /data\.order\?\.status === "paid"/);
  assert.match(appSource, /Не оплачивайте повторно/);
  assert.doesNotMatch(appSource, /if \(status === "paid"\) \{[\s\S]{0,300}showStatus\("Баланс пополнен"\)/);
});

test("PostgreSQL locks only payment and withdrawal orders across left joins", () => {
  assert.match(dbSource, /where po\.id = \$1\s+for update of po/);
  assert.match(dbSource, /where wo\.id = \$1\s+for update of wo/);
});

test("admin UI exposes guarded actions for pending Stars orders", () => {
  assert.match(appSource, /const canAdminAct = \["pending", "manual_review"\]/);
  assert.match(appSource, /telegram_receipt_verified/);
  assert.match(appSource, /confirmPaid: action === "approve" && isStars/);
});

test("daily play claim persists cooldown and credits only the play ledger bucket", () => {
  assert.match(dbSource, /create table if not exists daily_play_claims/);
  assert.match(dbSource, /'daily_play_claim', 'Ежедневные игровые фишки'/);
  assert.match(dbSource, /'PLAY_CHIPS', 'play'/);
  assert.match(appSource, /gameMode:\s*"cash"/);
});

test("frontend wires the daily play claim button to the backend endpoint and countdown state", () => {
  assert.match(appSource, /dailyPlayClaim:\s*null/);
  assert.match(appSource, /homeWalletSideAction\?\.addEventListener\("click",\s*\(\)\s*=> runAction\(claimDailyPlayBonus\)\)/);
  assert.match(appSource, /api\("\/api\/play\/daily-claim",\s*\{\s*method:\s*"POST"/);
  assert.match(appSource, /formatCooldown\(dailyPlayClaim\.cooldownSeconds \|\| 0\)/);
  assert.doesNotMatch(appSource, /Ежедневная бесплатная выдача в разработке/);
});

test("public tournaments UI treats the main lobby feed as cash-only and uses idempotent admin actions", () => {
  assert.match(appSource, /state\.tournaments = \(data\.tournaments \|\| \[\]\)\.filter\(\(tournament\) => \(tournament\.currency \|\| "USDT"\) === "USDT"\)/);
  assert.match(appSource, /<span>\$<\/span>/);
  assert.doesNotMatch(appSource, /tournament\.balanceBucket === "cash" \? "USDT" : "PLAY"/);
  assert.match(appSource, /requestKey\(`tournament-\$\{endpoint\}-\$\{id\}`\)/);
  assert.match(appSource, /requestKey\(`admin-tournament-action-\$\{tournamentId\}-\$\{action\}`\)/);
  assert.match(htmlSource, /data-admin-tab="tournaments"/);
});

test("table drawer renders completed hands from the current session", () => {
  assert.match(appSource, /function renderActionLog\(logItems, handHistory = \[\]\)/);
  assert.match(appSource, /hands\.map\(renderHandHistoryItem\)/);
  assert.match(appSource, /renderActionLog\(table\.actionLog \|\| \[\], table\.handHistory \|\| \[\]\)/);
});

test("interactive markup has unique ids and explicit button behavior", () => {
  const ids = [...htmlSource.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of htmlSource.matchAll(/<button\b([^>]*)>/g)) {
    assert.match(match[1], /\btype=["'](?:button|submit)["']/);
  }
});

test("player table mutations send idempotency keys", () => {
  assert.match(appSource, /table-act-\$\{tableId\}/);
  assert.match(appSource, /table-show-muck-\$\{state\.currentTableId\}/);
  assert.match(appSource, /table-stand-\$\{tableId\}/);
  assert.match(appSource, /table-sit-out-\$\{tableId\}/);
  assert.match(appSource, /table-sit-in-\$\{tableId\}/);
  assert.match(appSource, /fairness-commit:\$\{table\.id\}/);
  assert.match(appSource, /fairness-reveal:\$\{table\.id\}/);
});
