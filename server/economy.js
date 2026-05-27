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
export const CASH_TABLE_LIMITS = [
  cashLimit("0.01", "0.02", 2),
  cashLimit("0.02", "0.05", 2),
  cashLimit("0.05", "0.10", 2),
  cashLimit("0.10", "0.25", 1),
  cashLimit("0.25", "0.50", 1),
  cashLimit("0.50", "1.00", 1),
  cashLimit("1.00", "2.00", 1)
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
    methods: [
      { id: "ton", title: "TON", feePercent: 0.03 },
      { id: "usdt", title: "USDT", feePercent: 0.04 }
    ]
  },
  marketingReservePercent: 0.25,
  riskReservePercent: 0.1
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

function cashLimit(smallBlind, bigBlind, count) {
  const smallBlindMicros = toUsdtMicros(smallBlind);
  const bigBlindMicros = toUsdtMicros(bigBlind);
  return {
    smallBlind: smallBlindMicros,
    bigBlind: bigBlindMicros,
    minBuyIn: bigBlindMicros * 40,
    maxBuyIn: bigBlindMicros * 100,
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
