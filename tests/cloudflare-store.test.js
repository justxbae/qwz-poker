import test from "node:test";
import assert from "node:assert/strict";
import { RoomStore, serializeRoom, deserializeRoom } from "../infra/cloudflare/room-store.js";

class Storage {
  data = new Map(); alarm = null; fail = false;
  async get(key) {
    return Array.isArray(key) ? new Map(key.filter(k => this.data.has(k)).map(k => [k, this.data.get(k)])) : this.data.get(key);
  }
  async put(key, value) { this.data.set(key, value); }
  async delete(key) { this.data.delete(key); }
  async getAlarm() { return this.alarm; }
  async setAlarm(time) { this.alarm = time; }
  async deleteAlarm() { this.alarm = null; }
  async transaction(callback) {
    const tx = new Storage(); tx.data = structuredClone(this.data); tx.alarm = this.alarm;
    await callback(tx);
    if (this.fail) throw new Error("commit failed");
    this.data = tx.data; this.alarm = tx.alarm;
  }
}

test("durable restoration retains shared session/profile references and cycles", () => {
  const user = { id: "u1", profile: { hands: 0 } };
  const original = { sessions: new Map([["a", user], ["b", user]]), users: new Map([["u1", user]]) };
  original.self = original;
  const restored = deserializeRoom(serializeRoom(original));
  restored.users.get("u1").profile.hands++;
  assert.equal(restored.sessions.get("a").profile.hands, 1);
  assert.equal(restored.sessions.get("b"), restored.users.get("u1"));
  assert.equal(restored.self, restored);
});

test("durable encoding preserves nested Maps/Sets and untrusted objects without type confusion", () => {
  const snapshot = { wallets: new Map([["u1", 35000]]), dates: new Map([["u1", new Set(["2026-10-17"])]]),
    payload: { __type: "Map", value: [["balance", -1]], __proto__: null }, missing: undefined,
    date: new Date("2026-10-17T00:00:00Z") };
  assert.deepEqual(deserializeRoom(serializeRoom(snapshot)), { ...snapshot, payload: { __type: "Map", value: [["balance", -1]] } });
});

test("room snapshot and next alarm commit together; failed writes preserve the prior durable state", async () => {
  const storage = new Storage(); const store = new RoomStore(storage);
  const first = { users: new Map([["u1", { balance: 35000, name: "🃏".repeat(40000) }]]) };
  await store.save(first, 1000);
  assert.ok(storage.data.get("room:count") > 1);
  assert.equal(storage.alarm, 1000);
  assert.deepEqual(await new RoomStore(storage).load(), first);
  const previousParts = [...store.parts];
  storage.fail = true;
  await assert.rejects(store.save({ balance: 0 }, 2000), /commit failed/);
  assert.deepEqual(store.parts, previousParts);
  assert.equal(storage.alarm, 1000);
  assert.deepEqual(await new RoomStore(storage).load(), first);
  storage.fail = false;
  await store.save({ balance: 35000 }, null);
  assert.equal(storage.alarm, null);
  assert.deepEqual(await new RoomStore(storage).load(), { balance: 35000 });
  assert.equal(storage.data.size, 2); // one part + manifest, no stale large chunks
});

test("incomplete durable state fails closed instead of starting with empty wallets", async () => {
  const storage = new Storage(); await storage.put("room:count", 2); await storage.put("room:0", "{}");
  await assert.rejects(new RoomStore(storage).load(), /Incomplete room snapshot/);
});
