export const ACHIEVEMENT_CATALOG = Object.freeze([
  definition({
    code: "beta_tester",
    title: "Бета-тестер",
    description: "Участник закрытого тестирования Weez Poker.",
    category: "founder",
    rarity: "founder",
    trigger: "manual",
    isStatus: true
  }),
  definition({
    code: "founding_player",
    title: "Первопроходец",
    description: "Один из первых игроков Weez Poker.",
    category: "founder",
    rarity: "founder",
    trigger: "manual",
    isStatus: true
  }),
  definition({
    code: "first_cash_win",
    title: "Первая победа",
    description: "Первая выигранная раздача за cash-столом.",
    category: "cash",
    rarity: "common",
    trigger: "cash_hand_profit_positive",
    isStatus: false
  }),
  definition({
    code: "freeroll_winner",
    title: "Победитель Freeroll",
    description: "Первое место в официальном freeroll Weez Poker.",
    category: "tournament",
    rarity: "rare",
    trigger: "tournament_finish_first",
    isStatus: true
  }),
  definition({
    code: "season_1_final_table",
    title: "Финалист сезона I",
    description: "Участник финального стола первого сезона.",
    category: "season",
    rarity: "epic",
    trigger: "season_settlement",
    isStatus: true
  }),
  definition({
    code: "season_1_champion",
    title: "Чемпион сезона I",
    description: "Победитель первого рейтингового сезона.",
    category: "season",
    rarity: "legendary",
    trigger: "season_settlement",
    isStatus: true
  })
]);

export function achievementDefinition(code) {
  return ACHIEVEMENT_CATALOG.find((item) => item.code === String(code || "")) || null;
}

export function publicAchievementDefinition(item) {
  if (!item) return null;
  return {
    id: item.id,
    code: item.code,
    title: item.title,
    description: item.description,
    category: item.category,
    rarity: item.rules?.rarity || "common",
    trigger: item.rules?.trigger || "manual",
    isStatus: Boolean(item.rules?.isStatus)
  };
}

function definition({ code, title, description, category, rarity, trigger, isStatus }) {
  return Object.freeze({
    id: `achievement_${code}`,
    code,
    title,
    description,
    category,
    rewardType: "none",
    rewardAmount: 0,
    isHidden: false,
    isActive: true,
    rules: Object.freeze({
      version: 1,
      rarity,
      trigger,
      isStatus: Boolean(isStatus),
      gameplayAdvantage: false
    })
  });
}
