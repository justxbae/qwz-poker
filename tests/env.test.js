import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadEnv } from "../server/env.js";

test("local .env cannot reactivate explicitly disabled services or replace environment values", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "weez-env-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, ".env");
  await writeFile(file, [
    "# Local settings\r",
    "DATABASE_URL=local-database\r",
    "REDIS_URL=local-redis\r",
    "BOT_TOKEN=local-token\r",
    "APP_NAME=Weez Poker\r",
    "VALUE_WITH_EQUALS=a=b\r",
    "invalid line\r",
    "=invalid-key\r",
    ""
  ].join("\n"));

  const env = { DATABASE_URL: "", REDIS_URL: "", BOT_TOKEN: "explicit-token" };
  loadEnv(file, env);
  assert.deepEqual(env, {
    DATABASE_URL: "",
    REDIS_URL: "",
    BOT_TOKEN: "explicit-token",
    APP_NAME: "Weez Poker",
    VALUE_WITH_EQUALS: "a=b"
  });
});

test(".env is optional, but unreadable paths surface an error", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "weez-env-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.doesNotThrow(() => loadEnv(path.join(directory, "missing.env"), {}));
  assert.throws(() => loadEnv(directory, {}));
});
