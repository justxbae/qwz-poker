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
  starsPackages: [
    { id: "starter", chips: 5000, stars: 50 },
    { id: "regular", chips: 12000, stars: 120 },
    { id: "deep", chips: 30000, stars: 250 },
    { id: "highroller", chips: 75000, stars: 600 }
  ],
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

export function cashierPackages() {
  return ECONOMY.starsPackages.map((pack) => ({
    ...pack,
    rubAmount: Math.round(pack.stars * ECONOMY.deposit.rubPerStar),
    chipsPerStar: Math.round(pack.chips / pack.stars)
  }));
}

export function findCashierPackage(packageId) {
  return cashierPackages().find((item) => item.id === packageId);
}

export function depositSettings() {
  return {
    ...ECONOMY.deposit,
    methods: [
      { id: "stars", title: "Telegram Stars", enabled: true, speed: "моментально" },
      { id: "ton", title: "TON", enabled: false, speed: "скоро" },
      { id: "usdt", title: "USDT TRC20", enabled: false, speed: "скоро" }
    ]
  };
}

export function quoteDeposit({ packageId = "", rubAmount = 0 } = {}) {
  const pack = packageId ? findCashierPackage(packageId) : null;
  const amountRub = pack
    ? pack.rubAmount
    : clamp(Number(rubAmount || ECONOMY.deposit.minRub), ECONOMY.deposit.minRub, ECONOMY.deposit.maxRub);
  const stars = Math.ceil(amountRub / ECONOMY.deposit.rubPerStar);
  return {
    packageId: pack?.id || "",
    rubAmount: amountRub,
    stars,
    chips: pack?.chips || Math.round(amountRub * ECONOMY.deposit.chipsPerRub),
    chipsPerRub: ECONOMY.deposit.chipsPerRub,
    method: "stars"
  };
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
