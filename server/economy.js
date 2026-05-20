export const ECONOMY = {
  currency: "chips",
  depositBalanceType: "deposit",
  bonusBalanceType: "bonus",
  deposit: {
    rubPerStar: 2,
    chipsPerRub: 50,
    minRub: 100,
    maxRub: 5000,
    presetsRub: [100, 250, 500, 1000]
  },
  rake: {
    enabled: true,
    percent: 0.05,
    capBigBlinds: 3,
    noFlopNoDrop: true
  },
  withdrawals: {
    enabled: false,
    minimumChips: 50000,
    methods: [
      { id: "stars", title: "Stars / Gifts", feePercent: 0.08 },
      { id: "ton", title: "TON", feePercent: 0.05 },
      { id: "usdt", title: "USDT", feePercent: 0.05 },
      { id: "rub", title: "RUB partner", feePercent: 0.1 }
    ]
  },
  marketingReservePercent: 0.25,
  riskReservePercent: 0.1
};

export function depositSettings() {
  const tonEnabled = process.env.TON_PAYMENTS_ENABLED === "true" && Boolean(process.env.TON_RECEIVER_ADDRESS);
  const usdtEnabled = process.env.USDT_TRC20_PAYMENTS_ENABLED === "true" && Boolean(process.env.CRYPTO_PROVIDER_API_KEY || process.env.USDT_TRC20_RECEIVER_ADDRESS);
  return {
    ...ECONOMY.deposit,
    methods: [
      { id: "stars", title: "Telegram Stars", enabled: true, speed: "моментально" },
      { id: "ton", title: "TON", enabled: tonEnabled, speed: tonEnabled ? "on-chain" : "скоро" },
      { id: "usdt_trc20", title: "USDT TRC20", enabled: usdtEnabled, speed: usdtEnabled ? "on-chain" : "скоро" }
    ]
  };
}

export function quoteDeposit({ rubAmount = 0 } = {}) {
  const amountRub = clamp(Number(rubAmount || ECONOMY.deposit.minRub), ECONOMY.deposit.minRub, ECONOMY.deposit.maxRub);
  const stars = Math.ceil(amountRub / ECONOMY.deposit.rubPerStar);
  return {
    rubAmount: amountRub,
    stars,
    chips: Math.round(amountRub * ECONOMY.deposit.chipsPerRub),
    chipsPerRub: ECONOMY.deposit.chipsPerRub,
    method: "stars"
  };
}

export function quoteCryptoDeposit({ rubAmount = 0, method = "ton" } = {}) {
  const quote = quoteDeposit({ rubAmount });
  const methodId = String(method || "ton").toLowerCase();
  if (methodId === "ton") {
    const rubPerTon = Number(process.env.TON_RUB_RATE || 300);
    return {
      ...quote,
      method: "ton",
      asset: "TON",
      network: "TON",
      cryptoAmount: decimalAmount(quote.rubAmount / rubPerTon, 4),
      receiverAddress: process.env.TON_RECEIVER_ADDRESS || "",
      confirmationsRequired: Number(process.env.TON_CONFIRMATIONS_REQUIRED || 1)
    };
  }

  if (methodId === "usdt_trc20") {
    const rubPerUsdt = Number(process.env.USDT_RUB_RATE || 100);
    return {
      ...quote,
      method: "usdt_trc20",
      asset: "USDT",
      network: "TRC20",
      cryptoAmount: decimalAmount(quote.rubAmount / rubPerUsdt, 2),
      receiverAddress: process.env.USDT_TRC20_RECEIVER_ADDRESS || "",
      confirmationsRequired: Number(process.env.USDT_TRC20_CONFIRMATIONS_REQUIRED || 20)
    };
  }

  const error = new Error("Unsupported crypto payment method");
  error.status = 400;
  throw error;
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
