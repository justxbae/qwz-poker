import test from "node:test";
import assert from "node:assert/strict";
import {
  ACHIEVEMENT_CATALOG,
  achievementDefinition,
  publicAchievementDefinition
} from "../server/achievements.js";

test("achievement catalogue has stable unique codes and no gameplay rewards", () => {
  assert.ok(ACHIEVEMENT_CATALOG.length >= 6);
  assert.equal(new Set(ACHIEVEMENT_CATALOG.map((item) => item.code)).size, ACHIEVEMENT_CATALOG.length);
  for (const item of ACHIEVEMENT_CATALOG) {
    assert.equal(item.rewardType, "none");
    assert.equal(item.rewardAmount, 0);
    assert.equal(item.rules.gameplayAdvantage, false);
  }
});

test("manual titles and automatic achievements are distinguished in metadata", () => {
  const beta = achievementDefinition("beta_tester");
  const firstWin = achievementDefinition("first_cash_win");
  assert.equal(beta.rules.trigger, "manual");
  assert.equal(beta.rules.isStatus, true);
  assert.equal(firstWin.rules.trigger, "cash_hand_profit_positive");
  assert.equal(firstWin.rules.isStatus, false);
  assert.equal(publicAchievementDefinition(beta).title, "Бета-тестер");
});
