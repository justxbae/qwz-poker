import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("staging is isolated from main and disables withdrawals", async () => {
  const yaml = await readFile(new URL("../render.staging.yaml", import.meta.url), "utf8");
  assert.match(yaml, /name:\s*weez-poker-staging/);
  assert.match(yaml, /branch:\s*staging/);
  assert.match(yaml, /key:\s*REAL_MONEY_ENABLED\s*\n\s*value:\s*"true"/);
  assert.match(yaml, /key:\s*WITHDRAWALS_ENABLED\s*\n\s*value:\s*"false"/);
  for (const secret of ["DATABASE_URL", "REDIS_URL", "BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"]) {
    assert.match(yaml, new RegExp(`key:\\s*${secret}\\s*\\n\\s*sync:\\s*false`));
  }
});
