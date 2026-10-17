import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = await mkdtemp(path.join(os.tmpdir(), "weez-cloudflare-"));
const botToken = "123456789:cloudflare-integration-test";
let child, output = "", base;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function start() {
  const socket = createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(root, "infra/cloudflare/node_modules/wrangler/bin/wrangler.js"),
    "dev", "--local", "--config", path.join(work, "wrangler.json"), "--port", String(port), "--persist-to", path.join(work, "state")],
    { cwd: work, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`Workers runtime exited: ${output.slice(-4000)}`);
    try { const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }); if (r.ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`Workers runtime did not start: ${output.slice(-4000)}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const current = child;
  await new Promise(resolve => {
    const timer = setTimeout(() => current.kill("SIGKILL"), 5000);
    current.once("exit", () => { clearTimeout(timer); resolve(); }); current.kill("SIGTERM");
  });
  child = null;
}
async function request(route, { token, body, key } = {}) {
  const r = await fetch(base + route, {
    method: body ? "POST" : "GET", headers: { "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { "X-Idempotency-Key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json();
  assert.ok(r.ok, `${route}: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
async function auth(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: `Test ${id}` }), query_id: randomUUID() });
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return (await request("/api/auth", { body: { initData: params.toString() } })).token;
}

try {
  const config = JSON.parse(await readFile(path.join(root, "wrangler.jsonc"), "utf8"));
  delete config.$schema;
  config.main = path.join(root, config.main); config.assets.directory = path.join(root, config.assets.directory);
  config.vars = { ...config.vars, BOT_TOKEN: botToken, METRICS_TOKEN: "m".repeat(32), TELEGRAM_WEBHOOK_SECRET: "s".repeat(32) };
  await writeFile(path.join(work, "wrangler.json"), JSON.stringify(config));
  await start();
  const noAuth = await fetch(base + "/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: '{"initData":""}' });
  assert.equal(noAuth.status, 401);
  const a = await auth(990001), b = await auth(990002);
  await request("/api/play/daily-claim", { token: a, body: {}, key: "a-claim" });
  await request("/api/play/daily-claim", { token: b, body: {}, key: "b-claim" });
  let table = (await request("/api/tables", { token: a, body: { name: "Workers recovery", smallBlind: 10, maxPlayers: 2, buyInAmount: 2000 }, key: "create" })).table;
  const id = table.id;
  await request(`/api/tables/${id}/join`, { token: b, body: { buyInAmount: 2000 }, key: "join" });
  await sleep(3700);
  table = (await request(`/api/tables/${id}`, { token: a })).table;
  assert.equal(table.status, "preflop"); assert.equal(table.pot, 30);
  const cards = table.seats.find(seat => seat.userId === "990001").cards;
  const token = table.turnToken;
  const balance = (await request("/api/profile", { token: a })).profile.balance;
  assert.equal(balance, 33000);
  await stop(); await start();
  const restored = (await request(`/api/tables/${id}`, { token: a })).table;
  assert.equal(restored.turnToken, token); assert.equal(restored.pot, 30);
  assert.deepEqual(restored.seats.find(seat => seat.userId === "990001").cards, cards);
  assert.equal((await request("/api/profile", { token: a })).profile.balance, balance);
  await request("/api/play/daily-claim", { token: a, body: {}, key: "a-claim" });
  assert.equal((await request("/api/profile", { token: a })).profile.balance, balance);
  const actor = restored.viewer.canAct ? a : b;
  table = (await request(`/api/tables/${id}/act`, { token: actor, body: { action: "fold", turnToken: token } })).table;
  assert.equal(table.status, "showdown"); assert.equal(table.pot, 0);
  await request(`/api/tables/${id}/leave`, { token: a, body: {}, key: "a-leave" });
  await request(`/api/tables/${id}/leave`, { token: b, body: {}, key: "b-leave" });
  const pa = (await request("/api/profile", { token: a })).profile;
  const pb = (await request("/api/profile", { token: b })).profile;
  assert.equal(pa.balance + pb.balance, 70000); // preflop fold: no flop, no rake
  const manifest = await request("/tonconnect-manifest.json");
  assert.equal(new URL(manifest.iconUrl).origin, config.vars.APP_PUBLIC_URL);
  const configView = await request("/api/config"); assert.equal(configView.realMoneyEnabled, false);
  console.log("Cloudflare runtime passed: Telegram auth, daily claim, two-player hand, durable restart, idempotency, settlement and money conservation.");
} finally { await stop(); await rm(work, { recursive: true, force: true }); }
