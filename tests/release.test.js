import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createCleanRelease } from "../scripts/create-clean-release.js";

test("runtime export can resolve a showdown with its own vendored dependency", async (t) => {
  const out = await mkdtemp(path.join(os.tmpdir(), "weez-release-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await createCleanRelease(out);

  const { resolveShowdown } = await import(pathToFileURL(path.join(out, "server/poker-evaluator.js")));
  const result = resolveShowdown([
    { userId: "winner", cards: ["As", "Ah"] },
    { userId: "loser", cards: ["Ks", "Kh"] }
  ], ["Ad", "7c", "7d", "2h", "3s"]);
  assert.deepEqual(result.winners.map(({ seat }) => seat.userId), ["winner"]);
  assert.equal(result.handName, "Full House");
  const engine = await import(pathToFileURL(path.join(out, "server/poker-engine.js")));
  const owner = { id: "owner", name: "Owner", stack: 1000 };
  const table = engine.createTable(owner);
  engine.joinTable(table, { id: "other", name: "Other", stack: 1000 });
  engine.startHand(table);
  engine.act(table, owner, { action: "call" });
  assert.equal(table.seats[0].bet, 50);
  assert.equal(engine.publicTable(table, owner.id).rulesEngine, "poker-kernel");
  await access(path.join(out, "vendor/poker-kernel/src/kernel/PokerKernel.ts"));
  const kernelLicense = await readFile(path.join(out, "vendor/poker-kernel/LICENSE"), "utf8");
  assert.match(kernelLicense, /GNU AFFERO GENERAL PUBLIC LICENSE/);

  const license = await readFile(path.join(out, "vendor/pokersolver/LICENSE.md"), "utf8");
  assert.match(license, /GoldFire Studios/);
  await access(path.join(out, "vendor/pokersolver/package.json"));
  await access(path.join(out, "package-lock.json"));
  await access(path.join(out, "public/index.html"));
  for (const excluded of [".env", ".git", "docs", "tests", "figma", "node_modules"]) {
    assert.ok(!(await readdir(out)).includes(excluded), `${excluded} leaked into the runtime export`);
  }
  await assert.rejects(access(path.join(out, "vendor/pokersolver/test")), { code: "ENOENT" });
});
