export const ECONOMY = {
  currency: "chips",
  depositBalanceType: "deposit",
  bonusBalanceType: "bonus",
  starsPackages: [
    { id: "starter", chips: 10000, stars: 50 },
    { id: "regular", chips: 25000, stars: 120 },
    { id: "deep", chips: 60000, stars: 250 },
    { id: "highroller", chips: 150000, stars: 600 }
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
    chipsPerStar: Math.round(pack.chips / pack.stars)
  }));
}

export function findCashierPackage(packageId) {
  return cashierPackages().find((item) => item.id === packageId);
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
