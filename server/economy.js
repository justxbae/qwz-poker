export const USDT_SCALE = 1_000_000;
export const BALANCE_BUCKETS = {
  PLAY: "play",
  CASH: "cash_usdt"
};
export const ASSETS = {
  PLAY: "PLAY_CHIPS",
  CASH: "USDT"
};

export const PLAY_TABLE_LIMITS = [
  { smallBlind: 25, bigBlind: 50, count: 4 },
  { smallBlind: 50, bigBlind: 100, count: 4 },
  { smallBlind: 100, bigBlind: 200, count: 3 }
];

// Values are stored as micro-USDT. All cash accounting remains integer based.
// Cash limits follow a poker-room style ladder: Low tables for liquidity,
// Mid tables for regulars, and VIP kept sparse until the room has demand.
export const CASH_TABLE_LIMITS = [
  cashLimit("0.02", "0.05", 2, { tier: "low", minBuyIn: "2.50", maxBuyIn: "12.50" }),
  cashLimit("0.05", "0.10", 2, { tier: "low", minBuyIn: "2.50", maxBuyIn: "25.00" }),
  cashLimit("0.10", "0.25", 2, { tier: "low", minBuyIn: "6.25", maxBuyIn: "62.50" }),
  cashLimit("0.25", "0.50", 1, { tier: "mid", minBuyIn: "12.50", maxBuyIn: "125.00" }),
  cashLimit("0.50", "1.00", 1, { tier: "mid", minBuyIn: "25.00", maxBuyIn: "250.00" }),
  cashLimit("1.00", "2.00", 1, { tier: "mid", minBuyIn: "50.00", maxBuyIn: "500.00" }),
  cashLimit("2.00", "5.00", 1, { tier: "vip", minBuyIn: "250.00", maxBuyIn: "1250.00" })
];

export const ECONOMY = {
  play: {
    currency: ASSETS.PLAY,
    dailyRefillChips: 10_000,
    deposit: {
      rubPerStar: 2,
      chipsPerRub: 50,
      minRub: 100,
      maxRub: 5000,
      presetsRub: [100, 250, 500, 1000]
    }
  },
  cash: {
    currency: ASSETS.CASH,
    scale: USDT_SCALE,
    deposit: {
      minUsdtMicros: toUsdtMicros(1),
      maxUsdtMicros: toUsdtMicros(5000),
      presetsUsdt: [5, 10, 25, 50, 100]
    }
  },
  rake: {
    enabled: true,
    percent: 0.05,
    capBigBlinds: 3,
    noFlopNoDrop: true
  },
  withdrawals: {
    enabled: false,
    minimumUsdtMicros: toUsdtMicros(10),
    maximumUsdtMicros: toUsdtMicros(5000),
    methods: [
      {
        id: "ton",
        title: "TON",
        feePercent: 0.025,
        networkFeeUsdtMicros: toUsdtMicros(0.15),
        hiddenSpreadPercent: 0.01
      },
      {
        id: "usdt",
        title: "USDT TRC20",
        feePercent: 0.035,
        networkFeeUsdtMicros: toUsdtMicros(1),
        hiddenSpreadPercent: 0.015
      }
    ]
  },
  marketingReservePercent: 0.25,
  riskReservePercent: 0.1
};

export const RATING = {
  seasonStartingRp: 1000,
  minRp: 0,
  tableMultiplier: 1,
  maxHandDelta: 25,
  minActiveHandsForLeaderboard: 100,
  minActiveDaysForLeaderboard: 5,
  leagues: [
    { id: "bronze", title: "Bronze", min: 0 },
    { id: "silver", title: "Silver", min: 1200 },
    { id: "gold", title: "Gold", min: 1600 },
    { id: "platinum", title: "Platinum", min: 2200 },
    { id: "diamond", title: "Diamond", min: 3000 },
    { id: "legend", title: "Legend", min: 4200 }
  ]
};

export const CASH_CLUB = {
  pointsPerUsdtRake: 100,
  statuses: [
    { id: "starter", title: "Starter Club", min: 0, rakebackPercent: 0 },
    { id: "bronze", title: "Bronze Club", min: 100, rakebackPercent: 0.02 },
    { id: "silver", title: "Silver Club", min: 500, rakebackPercent: 0.04 },
    { id: "gold", title: "Gold Club", min: 1500, rakebackPercent: 0.06 },
    { id: "platinum", title: "Platinum Club", min: 4000, rakebackPercent: 0.08 },
    { id: "diamond", title: "Diamond Club", min: 10000, rakebackPercent: 0.1 }
  ]
};

export const TOURNAMENT_PROFILE = {
  feePointsPerUsdt: 100,
  itmBadgeMin: 1,
  finalTablePlayers: 9
};

export function depositSettings({ realMoneyEnabled = true } = {}) {
  const starsEnabled = realMoneyEnabled && Boolean(process.env.BOT_TOKEN);
  const cryptoBotEnabled = realMoneyEnabled && Boolean(process.env.CRYPTOBOT_API_KEY || process.env.CRYPTO_PROVIDER_API_KEY);
  const xRocketEnabled = realMoneyEnabled && Boolean(process.env.XROCKET_PAY_API_KEY);
  const tonEnabled = realMoneyEnabled && process.env.TON_PAYMENTS_ENABLED === "true" && Boolean(process.env.TON_RECEIVER_ADDRESS);
  return {
    ...ECONOMY.cash.deposit,
    currency: ASSETS.CASH,
    balanceBucket: BALANCE_BUCKETS.CASH,
    starsUsdtRate: Number(process.env.STARS_USDT_RATE || 0.0125),
    tonUsdtRate: Number(process.env.TON_USDT_RATE || 3),
    methods: [
      { id: "stars", title: "Stars", enabled: starsEnabled, speed: starsEnabled ? "Telegram invoice" : "скоро" },
      { id: "cryptobot", title: "Crypto Bot", enabled: cryptoBotEnabled, speed: cryptoBotEnabled ? "Crypto invoice" : "скоро" },
      { id: "xrocket", title: "xRocket", enabled: xRocketEnabled, speed: xRocketEnabled ? "xRocket invoice" : "скоро" },
      { id: "ton", title: "TON", enabled: tonEnabled, speed: tonEnabled ? "TON Connect" : "скоро" }
    ]
  };
}

export function playSettings() {
  return {
    currency: ASSETS.PLAY,
    dailyRefillChips: ECONOMY.play.dailyRefillChips,
    deposit: ECONOMY.play.deposit,
    limits: PLAY_TABLE_LIMITS
  };
}

export function cashSettings() {
  return {
    currency: ASSETS.CASH,
    scale: USDT_SCALE,
    limits: CASH_TABLE_LIMITS,
    starsUsdtRate: Number(process.env.STARS_USDT_RATE || 0.0125),
    tonUsdtRate: Number(process.env.TON_USDT_RATE || 3)
  };
}

// Kept for the development/play faucet until daily play-chip claims replace it.
export function quoteDeposit({ rubAmount = 0 } = {}) {
  const deposit = ECONOMY.play.deposit;
  const amountRub = clamp(Number(rubAmount || deposit.minRub), deposit.minRub, deposit.maxRub);
  const stars = Math.ceil(amountRub / deposit.rubPerStar);
  return {
    rubAmount: amountRub,
    stars,
    chips: Math.round(amountRub * deposit.chipsPerRub),
    chipsPerRub: deposit.chipsPerRub,
    asset: ASSETS.PLAY,
    balanceBucket: BALANCE_BUCKETS.PLAY,
    method: "demo"
  };
}

export function quoteCashDeposit({ usdtAmount = 0, method = "stars" } = {}) {
  const methodId = String(method || "stars").toLowerCase();
  const deposit = ECONOMY.cash.deposit;
  const requestedMicros = toUsdtMicros(usdtAmount || deposit.minUsdtMicros / USDT_SCALE);
  const cashUsdtMicros = clamp(requestedMicros, deposit.minUsdtMicros, deposit.maxUsdtMicros);
  const tonUsdtRate = Number(process.env.TON_USDT_RATE || 3);
  const starsUsdtRate = Number(process.env.STARS_USDT_RATE || 0.0125);
  const usdtAmountValue = fromUsdtMicros(cashUsdtMicros);

  if (methodId === "stars") {
    if (!Number.isFinite(starsUsdtRate) || starsUsdtRate <= 0) {
      const error = new Error("Stars/USDT quote is unavailable");
      error.status = 503;
      throw error;
    }
    const stars = Math.max(1, Math.ceil(usdtAmountValue / starsUsdtRate));
    return {
      method: "stars",
      provider: "telegram",
      asset: "USDT",
      network: "Telegram Stars",
      creditedAsset: ASSETS.CASH,
      balanceBucket: BALANCE_BUCKETS.CASH,
      cashUsdtMicros,
      usdtAmount: usdtAmountValue,
      stars,
      starsUsdtRate,
      cryptoAmount: stars,
      confirmationsRequired: 0
    };
  }

  if (methodId === "cryptobot" || methodId === "xrocket") {
    return {
      method: methodId,
      provider: methodId,
      asset: "USDT",
      network: "USDT",
      creditedAsset: ASSETS.CASH,
      balanceBucket: BALANCE_BUCKETS.CASH,
      cashUsdtMicros,
      usdtAmount: usdtAmountValue,
      cryptoAmount: decimalAmount(usdtAmountValue, 6),
      confirmationsRequired: 1
    };
  }

  if (methodId !== "ton") {
    const error = new Error("Метод пополнения не поддерживается");
    error.status = 400;
    throw error;
  }

  if (!Number.isFinite(tonUsdtRate) || tonUsdtRate <= 0) {
    const error = new Error("TON/USDT quote is unavailable");
    error.status = 503;
    throw error;
  }

  return {
    method: "ton",
    provider: "ton",
    asset: "TON",
    network: "TON",
    creditedAsset: ASSETS.CASH,
    balanceBucket: BALANCE_BUCKETS.CASH,
    cashUsdtMicros,
    usdtAmount: usdtAmountValue,
    tonUsdtRate,
    cryptoAmount: decimalAmount(usdtAmountValue / tonUsdtRate, 6),
    receiverAddress: process.env.TON_RECEIVER_ADDRESS || "",
    confirmationsRequired: Number(process.env.TON_CONFIRMATIONS_REQUIRED || 1)
  };
}

export const quoteCryptoDeposit = quoteCashDeposit;

export function quoteWithdrawal({ usdtAmount = 0, amount = 0, method = "ton", destination = "" } = {}) {
  const settings = ECONOMY.withdrawals;
  const methodId = String(method || "ton").toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  const methodSettings = settings.methods.find((item) => item.id === methodId);
  if (!methodSettings) {
    const error = new Error("Метод вывода не поддерживается");
    error.status = 400;
    throw error;
  }

  const requested = usdtAmount || amount;
  const grossUsdtMicros = toUsdtMicros(requested);
  if (grossUsdtMicros < settings.minimumUsdtMicros) {
    const error = new Error(`Минимальный вывод: ${formatUsdtMicros(settings.minimumUsdtMicros)} USDT`);
    error.status = 400;
    throw error;
  }
  if (grossUsdtMicros > settings.maximumUsdtMicros) {
    const error = new Error(`Максимальный вывод за заявку: ${formatUsdtMicros(settings.maximumUsdtMicros)} USDT`);
    error.status = 400;
    throw error;
  }

  const feePercent = Number(methodSettings.feePercent || 0);
  const hiddenSpreadPercent = Number(methodSettings.hiddenSpreadPercent || 0);
  const networkFeeUsdtMicros = Math.max(0, Math.round(Number(methodSettings.networkFeeUsdtMicros || 0)));
  const percentFeeUsdtMicros = Math.ceil(grossUsdtMicros * feePercent);
  const hiddenSpreadUsdtMicros = Math.ceil(grossUsdtMicros * hiddenSpreadPercent);
  const feeUsdtMicros = Math.min(grossUsdtMicros, percentFeeUsdtMicros + networkFeeUsdtMicros + hiddenSpreadUsdtMicros);
  const payoutUsdtMicros = Math.max(0, grossUsdtMicros - feeUsdtMicros);
  const destinationValue = String(destination || "").trim();
  if (destinationValue.length < 4) {
    const error = new Error("Укажите реквизиты/адрес для вывода");
    error.status = 400;
    throw error;
  }
  if (destinationValue.length > 240) {
    const error = new Error("Реквизиты вывода слишком длинные");
    error.status = 400;
    throw error;
  }

  return {
    method: methodId,
    title: methodSettings.title,
    asset: ASSETS.CASH,
    balanceBucket: BALANCE_BUCKETS.CASH,
    grossUsdtMicros,
    feeUsdtMicros,
    payoutUsdtMicros,
    percentFeeUsdtMicros,
    networkFeeUsdtMicros,
    hiddenSpreadUsdtMicros,
    feePercent,
    hiddenSpreadPercent,
    destination: destinationValue
  };
}

export function toUsdtMicros(value) {
  return Math.max(0, Math.round(Number(value || 0) * USDT_SCALE));
}

export function fromUsdtMicros(value) {
  return Number(value || 0) / USDT_SCALE;
}

export function formatUsdtMicros(value) {
  return fromUsdtMicros(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function rakePreview(bigBlind) {
  return {
    enabled: ECONOMY.rake.enabled,
    percent: ECONOMY.rake.percent,
    cap: rakeCap(bigBlind),
    capBigBlinds: ECONOMY.rake.capBigBlinds,
    noFlopNoDrop: ECONOMY.rake.noFlopNoDrop
  };
}

export function calculateRake({ pot, bigBlind, boardCards = 0 }) {
  if (!ECONOMY.rake.enabled || pot <= 0) return 0;
  if (ECONOMY.rake.noFlopNoDrop && boardCards < 3) return 0;
  return Math.min(Math.floor(pot * ECONOMY.rake.percent), rakeCap(bigBlind));
}

export function ratingLeague(points) {
  const value = Math.max(0, Math.round(Number(points || 0)));
  return [...RATING.leagues].reverse().find((league) => value >= league.min) || RATING.leagues[0];
}

export function ratingDeltaForHand({ profit = 0, bigBlind = 1, isPrivate = false, activePlayers = 0 } = {}) {
  if (isPrivate || Number(activePlayers || 0) < 2) return 0;
  const blind = Math.max(1, Math.round(Number(bigBlind || 1)));
  const resultBb = Number(profit || 0) / blind;
  if (!Number.isFinite(resultBb) || resultBb === 0) return 0;
  const raw = resultBb * RATING.tableMultiplier;
  return Math.max(-RATING.maxHandDelta, Math.min(RATING.maxHandDelta, Math.round(raw)));
}

export function nextRatingPoints(currentPoints, delta) {
  return Math.max(RATING.minRp, Math.round(Number(currentPoints || RATING.seasonStartingRp) + Number(delta || 0)));
}

export function cashClubPointsFromRake(rakeMicros) {
  const value = Math.max(0, Math.round(Number(rakeMicros || 0)));
  if (value <= 0) return 0;
  return Math.max(1, Math.floor((value / USDT_SCALE) * CASH_CLUB.pointsPerUsdtRake));
}

export function cashClubStatus(points) {
  const value = Math.max(0, Math.round(Number(points || 0)));
  return [...CASH_CLUB.statuses].reverse().find((status) => value >= status.min) || CASH_CLUB.statuses[0];
}

export function cashClubProgress(points) {
  const value = Math.max(0, Math.round(Number(points || 0)));
  const current = cashClubStatus(value);
  const index = CASH_CLUB.statuses.findIndex((status) => status.id === current.id);
  const next = CASH_CLUB.statuses[index + 1] || null;
  if (!next) {
    return {
      current: value - current.min,
      required: 0,
      progress: 1,
      nextStatus: null
    };
  }
  const span = Math.max(1, next.min - current.min);
  const currentInLevel = Math.max(0, value - current.min);
  return {
    current: currentInLevel,
    required: span,
    progress: Math.max(0, Math.min(1, Number((currentInLevel / span).toFixed(4)))),
    nextStatus: next
  };
}

function cashLimit(smallBlind, bigBlind, count, options = {}) {
  const smallBlindMicros = toUsdtMicros(smallBlind);
  const bigBlindMicros = toUsdtMicros(bigBlind);
  const minBuyIn = options.minBuyIn ? toUsdtMicros(options.minBuyIn) : bigBlindMicros * 50;
  const maxBuyIn = options.maxBuyIn ? toUsdtMicros(options.maxBuyIn) : bigBlindMicros * 250;
  return {
    tier: options.tier || "low",
    smallBlind: smallBlindMicros,
    bigBlind: bigBlindMicros,
    minBuyIn,
    maxBuyIn,
    count
  };
}

function rakeCap(bigBlind) {
  return Math.max(0, Math.round(Number(bigBlind || 0) * ECONOMY.rake.capBigBlinds));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function decimalAmount(value, precision) {
  const factor = 10 ** precision;
  return Math.max(0, Math.ceil(Number(value || 0) * factor) / factor);
}
