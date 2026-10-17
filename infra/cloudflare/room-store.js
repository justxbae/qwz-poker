// Encode every container explicitly: user-provided objects cannot impersonate a Map.
function encode(value, seen = new Map()) {
  if (value === undefined) return ["u"];
  if (typeof value === "bigint") return ["b", String(value)];
  if (typeof value === "number" && !Number.isFinite(value)) return ["n", String(value)];
  if (value === null || typeof value !== "object") return ["v", value];
  if (seen.has(value)) return ["r", seen.get(value)];
  const id = seen.size; seen.set(value, id);
  if (value instanceof Date) return ["d", id, value.toISOString()];
  if (value instanceof Map) return ["m", id, [...value].map(([k, v]) => [encode(k, seen), encode(v, seen)])];
  if (value instanceof Set) return ["s", id, [...value].map(v => encode(v, seen))];
  if (Array.isArray(value)) return ["a", id, value.map(v => encode(v, seen))];
  return ["o", id, Object.entries(value).map(([k, v]) => [k, encode(v, seen)])];
}

function decode([kind, id, value], refs = new Map()) {
  if (kind === "u") return undefined;
  if (kind === "v") return id;
  if (kind === "b") return BigInt(id);
  if (kind === "n") return Number(id);
  if (kind === "r") {
    if (!refs.has(id)) throw new Error("Invalid room snapshot reference");
    return refs.get(id);
  }
  const result = kind === "m" ? new Map() : kind === "s" ? new Set()
    : kind === "a" ? [] : kind === "o" ? {} : kind === "d" ? new Date(value) : null;
  if (!result) throw new Error("Invalid room snapshot encoding");
  refs.set(id, result);
  if (kind === "m") for (const [k,v] of value) result.set(decode(k, refs), decode(v, refs));
  if (kind === "s") for (const v of value) result.add(decode(v, refs));
  if (kind === "a") for (const v of value) result.push(decode(v, refs));
  if (kind === "o") for (const [k,v] of value) Object.defineProperty(result, k, { value: decode(v, refs), writable: true, configurable: true, enumerable: true });
  return result;
}

export const serializeRoom = value => JSON.stringify(encode(value));
export const deserializeRoom = value => decode(JSON.parse(value));

export class RoomStore {
  constructor(storage) { this.storage = storage; this.parts = []; }

  async load() {
    const count = await this.storage.get("room:count");
    if (count === undefined) return null;
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid room snapshot manifest");
    const keys = Array.from({ length: count }, (_, i) => `room:${i}`);
    const values = await this.storage.get(keys);
    this.parts = keys.map(key => {
      const value = values.get(key);
      if (typeof value !== "string") throw new Error("Incomplete room snapshot");
      return value;
    });
    return deserializeRoom(this.parts.join(""));
  }

  async save(snapshot, nextWakeAt) {
    const text = serializeRoom(snapshot);
    // At most 64 KB UTF-8 per part, below the storage value limit, including emoji.
    const parts = [];
    for (let i = 0; i < text.length; i += 16_000) parts.push(text.slice(i, i + 16_000));
    await this.storage.transaction(async tx => {
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] !== this.parts[i]) await tx.put(`room:${i}`, parts[i]);
      }
      for (let i = parts.length; i < this.parts.length; i++) await tx.delete(`room:${i}`);
      if (parts.length !== this.parts.length) await tx.put("room:count", parts.length);
      const alarm = await tx.getAlarm();
      if (nextWakeAt && alarm !== nextWakeAt) await tx.setAlarm(nextWakeAt);
      else if (!nextWakeAt && alarm) await tx.deleteAlarm();
    });
    // Never advance the cache until the durable commit succeeded.
    this.parts = parts;
  }
}
