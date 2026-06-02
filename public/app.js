const tg = window.Telegram?.WebApp;
const BOT_USERNAME = "qwzpokerbot";
const params = new URLSearchParams(window.location.search);
const DEV_MODE = params.has("dev1")
  || params.get("dev") === "1"
  || window.localStorage.getItem("qwzDevMode") === "1";
const ADMIN_MODE = params.get("admin") === "1" || window.location.pathname === "/admin";
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}
window.scrollTo({ top: 0, left: 0 });
document.documentElement.classList.toggle("dev-mode", DEV_MODE);
document.documentElement.classList.toggle("admin-mode", ADMIN_MODE);
const state = {
  token: "",
  user: null,
  currentTableId: "",
  currentTable: null,
  config: null,
  gameMode: "play",
  selectedSmallBlind: 25,
  tables: [],
  tournaments: []
};
const cashierState = {
  deposit: null,
  selectedMethod: "stars",
  demoTopup: false,
  disabled: false,
  sheet: ""
};
const cashierSheetHomes = new Map();

const profile = document.querySelector("#profile");
const lobbyAvatar = document.querySelector("#lobbyAvatar");
const lobbyName = document.querySelector("#lobbyName");
const lobbyUsername = document.querySelector("#lobbyUsername");
const lobbyBalance = document.querySelector("#lobbyBalance");
const lobbyTableStack = document.querySelector("#lobbyTableStack");
const lobbyActiveTables = document.querySelector("#lobbyActiveTables");
const homeActivityText = document.querySelector("#homeActivityText");
const homeSessionPill = document.querySelector("#homeSessionPill");
const homeScreenInstallButton = document.querySelector("#homeScreenInstallButton");
const homeScreenInstallStatus = document.querySelector("#homeScreenInstallStatus");
const homeOfferMeta = document.querySelector("#homeOfferMeta");
const quickPlayHint = document.querySelector("#quickPlayHint");
const homeGamesTitle = document.querySelector("#homeGamesTitle");
const homeTableList = document.querySelector("#homeTableList");
const promoCarousel = document.querySelector(".home-promo-banners");
const promoDots = document.querySelector("#homePromoDots");
const gameModeSwitch = document.querySelector("#gameModeSwitch");
const lobbyBalanceCurrency = document.querySelector("#lobbyBalanceCurrency");
const modeBanner = document.querySelector("#modeBanner");
const modeBannerKicker = document.querySelector("#modeBannerKicker");
const modeBannerTitle = document.querySelector("#modeBannerTitle");
const modeBannerText = document.querySelector("#modeBannerText");
const publicGamesTitle = document.querySelector("#publicGamesTitle");
const privateGamesTitle = document.querySelector("#privateGamesTitle");
const cashierBalance = document.querySelector("#cashierBalance");
const cashierAssetLabel = document.querySelector("#cashierAssetLabel");
const cashierTopupTitle = document.querySelector("#cashierTopupTitle");
const cashierDepositNetwork = document.querySelector("#cashierDepositNetwork");
const cashierNote = document.querySelector("#cashierNote");
const cashierAmountAsset = document.querySelector("#cashierAmountAsset");
const cashierWithdrawTitle = document.querySelector("#cashierWithdrawTitle");
const cashierWithdrawText = document.querySelector("#cashierWithdrawText");
const cashierPrimaryButton = document.querySelector("#cashierPrimaryButton");
const cashierSheetBackdrop = document.querySelector("#cashierSheetBackdrop");
const cashierSheetCloseButtons = document.querySelectorAll("[data-cashier-sheet-close]");
const walletTopupButton = document.querySelector("#walletTopupButton");
const walletWithdrawButton = document.querySelector(".home-withdraw");
const cashierTableStack = document.querySelector("#cashierTableStack");
const cashierTotalBankroll = document.querySelector("#cashierTotalBankroll");
const cashierRubAmount = document.querySelector("#cashierRubAmount");
const cashierPresets = document.querySelector("#cashierPresets");
const cashierMethods = document.querySelector("#cashierMethods");
const cashierQuoteChips = document.querySelector("#cashierQuoteChips");
const cashierQuoteStars = document.querySelector("#cashierQuoteStars");
const cashierPayButton = document.querySelector("#cashierPayButton");
const cashierHistory = document.querySelector("#cashierHistory");
const cashierStatus = document.querySelector("#cashierStatus");
const profileAvatar = document.querySelector("#profileAvatar");
const navProfileAvatar = document.querySelector("#navProfileAvatar");
const profileName = document.querySelector("#profileName");
const profileUsername = document.querySelector("#profileUsername");
const profileBalance = document.querySelector("#profileBalance");
const profileHands = document.querySelector("#profileHands");
const profileTables = document.querySelector("#profileTables");
const profileChips = document.querySelector("#profileChips");
const profileTableStack = document.querySelector("#profileTableStack");
const profileSavedStack = document.querySelector("#profileSavedStack");
const profileStatus = document.querySelector("#profileStatus");
const profileSessionBadge = document.querySelector("#profileSessionBadge");
const profileSessionList = document.querySelector("#profileSessionList");
const profileRefreshButton = document.querySelector("#profileRefreshButton");
const adminNavButton = document.querySelector(".admin-nav-button");
const adminBankrollTotal = document.querySelector("#adminBankrollTotal");
const adminSummary = document.querySelector("#adminSummary");
const adminLookupForm = document.querySelector("#adminLookupForm");
const adminUserId = document.querySelector("#adminUserId");
const adminStatus = document.querySelector("#adminStatus");
const adminPlayerCard = document.querySelector("#adminPlayerCard");
const adminPlayerName = document.querySelector("#adminPlayerName");
const adminPlayerId = document.querySelector("#adminPlayerId");
const adminPlayerBalance = document.querySelector("#adminPlayerBalance");
const adminPlayerTableStack = document.querySelector("#adminPlayerTableStack");
const adminPlayerTotal = document.querySelector("#adminPlayerTotal");
const adminAdjustForm = document.querySelector("#adminAdjustForm");
const adminAdjustType = document.querySelector("#adminAdjustType");
const adminAdjustAmount = document.querySelector("#adminAdjustAmount");
const adminAdjustReason = document.querySelector("#adminAdjustReason");
const adminPlayerTransactions = document.querySelector("#adminPlayerTransactions");
const adminRecentPayments = document.querySelector("#adminRecentPayments");
const adminRecentWithdrawals = document.querySelector("#adminRecentWithdrawals");
const adminPaymentFilter = document.querySelector("#adminPaymentFilter");
const adminRecentEvents = document.querySelector("#adminRecentEvents");
const adminFundMovements = document.querySelector("#adminFundMovements");
const adminRecentHands = document.querySelector("#adminRecentHands");
const tournamentList = document.querySelector("#tournamentList");
const tournamentStatus = document.querySelector("#tournamentStatus");
const continueCard = document.querySelector("#continueCard");
const continueMeta = document.querySelector("#continueMeta");
const continueGameButton = document.querySelector("#continueGameButton");
const onlineStatus = document.querySelector("#onlineStatus");
const publicTablesStatus = document.querySelector("#publicTablesStatus");
const privateTablesStatus = document.querySelector("#privateTablesStatus");
const quickPlayButton = document.querySelector("#quickPlayButton");
const quickPrivateButton = document.querySelector("#quickPrivateButton");
const limitPills = document.querySelector("#limitPills");
const tableLimitPills = document.querySelector("#tableLimitPills");
const tablesFilterStatus = document.querySelector("#tablesFilterStatus");
const publicTableList = document.querySelector("#publicTableList");
const privateTableList = document.querySelector("#privateTableList");
const currentTable = document.querySelector("#currentTable");
const tableCode = document.querySelector("#tableCode");
const communityCards = document.querySelector("#communityCards");
const pot = document.querySelector("#pot");
const potChips = document.querySelector("#potChips");
const blinds = document.querySelector("#blinds");
const tableDetails = document.querySelector("#tableDetails");
const tableStatus = document.querySelector("#tableStatus");
const bettingActions = document.querySelector("#bettingActions");
const preActions = document.querySelector("#preActions");
const actionAmount = document.querySelector("#actionAmount");
const amountLabel = document.querySelector("#amountLabel");
const betSlider = document.querySelector("#betSlider");
const confirmBetButton = document.querySelector("#confirmBetButton");
const startOverlay = document.querySelector("#startOverlay");
const startTitle = document.querySelector("#startTitle");
const startSubtitle = document.querySelector("#startSubtitle");
const actionToast = document.querySelector("#actionToast");
const streetOverlay = document.querySelector("#streetOverlay");
const seats = document.querySelector("#seats");
const actionLog = document.querySelector("#actionLog");
const tableInfo = document.querySelector("#tableInfo");
const statsTable = document.querySelector("#statsTable");
const lobby = document.querySelector("#lobby");
const createTableForm = document.querySelector("#createTableForm");
const refreshButton = document.querySelector("#refreshButton");
const addTestPlayerButton = document.querySelector("#addTestPlayerButton");
const autoActButton = document.querySelector("#autoActButton");
const botActions = document.querySelector("#botActions");
const botActionLabel = document.querySelector("#botActionLabel");
const botFoldButton = document.querySelector("#botFoldButton");
const botCallButton = document.querySelector("#botCallButton");
const standButton = document.querySelector("#standButton");
const sitOutButton = document.querySelector("#sitOutButton");
const quickSitOutButton = document.querySelector("#quickSitOutButton");
const buyInButton = document.querySelector("#buyInButton");
const inviteButton = document.querySelector("#inviteButton");
const quickBuyInButton = document.querySelector("#quickBuyInButton");
const backToLobbyButton = document.querySelector("#backToLobbyButton");
const sitButton = document.querySelector("#sitButton");
const observerBanner = document.querySelector("#observerBanner");
const observerHint = document.querySelector("#observerHint");
const observerSitButton = document.querySelector("#observerSitButton");
const menuButton = document.querySelector("#menuButton");
const sideMenu = document.querySelector("#sideMenu");
const closeMenuButton = document.querySelector("#closeMenuButton");
const sitOutPopover = document.querySelector("#sitOutPopover");
const confirmSitOutButton = document.querySelector("#confirmSitOutButton");
const sitOutInfoButton = document.querySelector("#sitOutInfoButton");
const sitOutInfoText = document.querySelector("#sitOutInfoText");
const infoDrawer = document.querySelector("#infoDrawer");
const closeDrawerButton = document.querySelector("#closeDrawerButton");
const buyInOverlay = document.querySelector("#buyInOverlay");
const buyInSheet = document.querySelector(".buyin-sheet");
const closeBuyInOverlay = document.querySelector("#closeBuyInOverlay");
const buyInGameType = document.querySelector("#buyInGameType");
const buyInBalance = document.querySelector("#buyInBalance");
const buyInDebit = document.querySelector("#buyInDebit");
const buyInStackPreview = document.querySelector("#buyInStackPreview");
const buyInModeLabel = document.querySelector("#buyInModeLabel");
const buyInAmount = document.querySelector("#buyInAmount");
const buyInSlider = document.querySelector("#buyInSlider");
const buyInMinButton = document.querySelector("#buyInMinButton");
const buyInMaxButton = document.querySelector("#buyInMaxButton");
const confirmBuyInButton = document.querySelector("#confirmBuyInButton");
const drawerPages = {
  log: document.querySelector("#drawerLog"),
  info: document.querySelector("#drawerInfo"),
  stats: document.querySelector("#drawerStats"),
  waitlist: document.querySelector("#drawerWaitlist")
};
const tableItemTemplate = document.querySelector("#tableItemTemplate");
let actionAmountContext = "";
let overlayFadeTimer = 0;
let overlayWasVisible = false;
let lastToastText = "";
let toastTimer = 0;
let streetOverlayTimer = 0;
let lastStreetOverlayKey = "";
let communityCardsKey = "";
let potAmountKey = "";
let previousSeatCardKeys = new Map();
let previousSeatBets = new Map();
let previousSeatFolded = new Map();
let activeSeatKey = "";
let rebuyPromptKey = "";
let queuedPreAction = "";
let queuedPreActionKey = "";
let pendingBetAction = "";
let pendingBuyIn = null;
let currentLobbyTab = "home";
let fairnessSeedSyncing = false;
const fairnessSeedSyncedTables = new Set();
let revealObserver = null;

boot();

async function boot() {
  resetScroll();
  setupTapGuards();
  setupScrollDynamics();
  setupLobbyOverscroll();
  tg?.ready();
  tg?.expand();
  setupTelegramControls();

  await auth();
  await loadConfig();
  await loadTables();
  await loadProfile();
  setupScrollReveal();
  setupPromoCarousel();
  if (ADMIN_MODE) {
    selectLobbyTab("admin", { keepScroll: true });
  }

  const startParam = tg?.initDataUnsafe?.start_param;
  if (startParam) await joinTable(startParam);

  createTableForm.addEventListener("submit", onCreateTable);
  refreshButton?.addEventListener("click", loadTables);
  profileRefreshButton.addEventListener("click", () => runAction(loadProfile));
  cashierPrimaryButton?.addEventListener("click", () => {
    document.querySelector(".cashier-topup-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  walletTopupButton?.addEventListener("click", () => runAction(openCashierTopup));
  cashierSheetBackdrop?.addEventListener("click", closeCashierSheet);
  document.querySelectorAll("[data-cashier-sheet]").forEach((sheet) => {
    wireCashierSheetDrag(sheet);
  });
  cashierSheetCloseButtons.forEach((button) => {
    button.addEventListener("click", closeCashierSheet);
  });
  cashierRubAmount?.addEventListener("input", syncCashierQuote);
  cashierPresets?.addEventListener("click", onCashierPresetClick);
  cashierMethods?.addEventListener("click", onCashierMethodClick);
  cashierPayButton?.addEventListener("click", () => runAction(payCashierAmount));
  tournamentList?.addEventListener("click", onTournamentAction);
  quickPlayButton.addEventListener("click", () => runAction(quickPlay));
  quickPrivateButton.addEventListener("click", () => runAction(quickCreatePrivateTable));
  continueGameButton.addEventListener("click", continueGame);
  if (adminNavButton) adminNavButton.hidden = !ADMIN_MODE;
  updateBottomNavIndicator();
  adminLookupForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(() => loadAdminPlayer(adminUserId.value));
  });
  adminAdjustForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(adjustAdminPlayerWallet);
  });
  adminRecentPayments?.addEventListener("click", onAdminPaymentAction);
  adminRecentWithdrawals?.addEventListener("click", onAdminWithdrawalAction);
  adminPaymentFilter?.addEventListener("change", () => runAction(loadAdminDashboard));
  limitPills.addEventListener("click", onLimitSelect);
  tableLimitPills.addEventListener("click", onLimitSelect);
  gameModeSwitch?.addEventListener("click", onGameModeSelect);
  document.querySelectorAll("[data-lobby-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.lobbyTab === "cashier" && button.dataset.cashierSection) {
        runAction(() => openCashierSection(button.dataset.cashierSection));
        return;
      }
      selectLobbyTab(button.dataset.lobbyTab);
    });
  });
  if (DEV_MODE) {
    addTestPlayerButton.addEventListener("click", () => runAction(addTestPlayer));
    autoActButton.addEventListener("click", () => runAction(autoAct));
    botFoldButton.addEventListener("click", () => runAction(() => testBotAct("fold")));
    botCallButton.addEventListener("click", () => runAction(() => testBotAct("call")));
  }
  standButton.addEventListener("click", () => runAction(standFromTable));
  sitOutButton.addEventListener("click", openSitOutPopover);
  quickSitOutButton.addEventListener("click", openSitOutPopover);
  confirmSitOutButton.addEventListener("click", () => runAction(sitOut));
  sitOutInfoButton.addEventListener("click", () => {
    sitOutInfoText.hidden = !sitOutInfoText.hidden;
  });
  buyInButton.addEventListener("click", () => runAction(buyIn));
  inviteButton.addEventListener("click", inviteToTable);
  quickBuyInButton.addEventListener("click", () => runAction(buyIn));
  backToLobbyButton.addEventListener("click", () => runAction(goToLobby));
  sitButton.addEventListener("click", () => runAction(sitAtTable));
  observerSitButton.addEventListener("click", () => runAction(returnToSeat));
  menuButton.addEventListener("click", () => openMenu());
  closeMenuButton.addEventListener("click", closeMenu);
  closeDrawerButton.addEventListener("click", closeDrawer);
  document.querySelectorAll("[data-panel-tab]").forEach((button) => {
    button.addEventListener("click", () => openDrawer(button.dataset.panelTab));
  });
  document.querySelectorAll("[data-drawer-tab]").forEach((button) => {
    button.addEventListener("click", () => switchDrawerTab(button.dataset.drawerTab));
  });
  bettingActions.addEventListener("click", onPokerAction);
  bettingActions.addEventListener("click", onBetPreset);
  confirmBetButton.addEventListener("click", onConfirmBet);
  preActions.addEventListener("click", onPreAction);
  currentTable.addEventListener("click", onTableBackdropClick);
  actionAmount.addEventListener("input", syncSliderFromAmount);
  betSlider.addEventListener("input", syncAmountFromSlider);
  buyInOverlay.addEventListener("click", (event) => {
    if (event.target === buyInOverlay) hideBuyInOverlay();
  });
  buyInSheet?.addEventListener("click", (event) => event.stopPropagation());
  wireBuyInSheetDrag();
  closeBuyInOverlay.addEventListener("click", hideBuyInOverlay);
  buyInAmount.addEventListener("input", syncBuyInSliderFromAmount);
  buyInSlider.addEventListener("input", syncBuyInAmountFromSlider);
  buyInMinButton.addEventListener("click", () => setBuyInAmount(Number(buyInAmount.dataset.min || 10000)));
  buyInMaxButton.addEventListener("click", () => setBuyInAmount(Number(buyInAmount.dataset.max || 40000)));
  confirmBuyInButton.addEventListener("click", () => runAction(confirmBuyIn));
  updateTelegramBackButton();
  window.requestAnimationFrame(resetScroll);

  setInterval(async () => {
    try {
      if (state.currentTableId) await loadCurrentTable();
      if (!state.currentTableId) await loadTables();
    } catch (error) {
      if (error.message === "Unauthorized" || error.message === "Table not found") {
        state.currentTableId = "";
        state.currentTable = null;
        currentTable.hidden = true;
        lobby.hidden = false;
        await auth();
        await loadTables();
        return;
      }
      console.error(error);
    }
  }, 1000);
}

async function auth() {
  const data = await api("/api/auth", {
    method: "POST",
    body: {
      initData: tg?.initData || ""
    },
    auth: false
  });

  state.token = data.token;
  state.user = data.user;
  profile.textContent = `${data.user.name} · ${data.user.balance.toLocaleString("ru-RU")}`;
  if (lobbyName) lobbyName.textContent = data.user.name;
  if (lobbyUsername) lobbyUsername.textContent = data.user.username ? `@${data.user.username}` : `id ${data.user.id}`;
  renderModeBalance();
  renderModeContext();
  cashierBalance.textContent = data.user.balance.toLocaleString("ru-RU");
  renderAvatar(lobbyAvatar, data.user);
  renderAvatar(profileAvatar, data.user);
  renderAvatar(navProfileAvatar, data.user);
  profileName.textContent = data.user.name;
  profileUsername.textContent = data.user.username ? `@${data.user.username}` : `id ${data.user.id}`;
  profileBalance.textContent = state.gameMode === "cash"
    ? `${formatUsdt(data.user.cashBalanceMicros || 0)} USDT`
    : `${data.user.balance.toLocaleString("ru-RU")} фишек`;
  profileChips.textContent = data.user.balance.toLocaleString("ru-RU");
  renderHomeCta();
}

async function loadConfig() {
  state.config = await api("/api/config", { auth: false });
  const cashButton = gameModeSwitch?.querySelector('[data-game-mode="cash"]');
  if (cashButton) {
    cashButton.disabled = !state.config.realMoneyEnabled;
    cashButton.title = state.config.realMoneyEnabled ? "" : "USDT-игра станет доступна после запуска денежных операций";
  }
  if (state.config.realMoneyEnabled) {
    state.gameMode = "cash";
    const limits = currentLimits();
    state.selectedSmallBlind = Number(limits[0]?.smallBlind || 25);
  }
  gameModeSwitch?.querySelectorAll("[data-game-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.gameMode === state.gameMode);
  });
  renderModeBalance();
  renderModeContext();
  renderLimitOptions();
}

function onGameModeSelect(event) {
  const button = event.target.closest("[data-game-mode]");
  if (!button) return;
  state.gameMode = button.dataset.gameMode === "cash" ? "cash" : "play";
  const limits = currentLimits();
  state.selectedSmallBlind = Number(limits[0]?.smallBlind || 25);
  gameModeSwitch.querySelectorAll("[data-game-mode]").forEach((item) => {
    item.classList.toggle("active", item.dataset.gameMode === state.gameMode);
  });
  renderLimitOptions();
  renderModeBalance();
  renderModeContext();
  renderTables();
  renderHomeCta();
  haptic("selection");
}

function currentLimits() {
  const configured = state.gameMode === "cash" ? state.config?.cash?.limits : state.config?.play?.limits;
  return configured?.length ? configured : [{ smallBlind: 25, bigBlind: 50 }];
}

function activeBalance() {
  return state.gameMode === "cash" ? Number(state.user?.cashBalanceMicros || 0) : Number(state.user?.balance || 0);
}

function renderModeBalance() {
  if (!lobbyBalance) return;
  lobbyBalance.textContent = state.gameMode === "cash" ? formatUsdt(activeBalance()) : formatChips(activeBalance());
  if (!lobbyBalanceCurrency) return;
  if (state.gameMode === "cash") {
    lobbyBalanceCurrency.replaceChildren(" ", createTetherMark());
  } else {
    lobbyBalanceCurrency.textContent = " фишек";
  }
}

function renderModeContext() {
  const cashMode = state.gameMode === "cash";
  if (modeBanner) {
    if (modeBannerKicker) modeBannerKicker.textContent = cashMode ? "USDT" : "Без вывода";
    if (modeBannerTitle) {
      if (cashMode) modeBannerTitle.replaceChildren("Денежная игра ", createTetherMark());
      else modeBannerTitle.textContent = "Игровые фишки";
    }
    modeBanner.dataset.mode = cashMode ? "cash" : "play";
  }
  if (homeGamesTitle) homeGamesTitle.textContent = cashMode ? "Cash-столы" : "Игровые столы";
  if (publicGamesTitle) publicGamesTitle.textContent = cashMode ? "Cash-столы" : "Игровые столы";
  if (privateGamesTitle) privateGamesTitle.textContent = cashMode ? "Приватные cash-столы" : "Приватные столы";
  if (walletWithdrawButton) walletWithdrawButton.disabled = !cashMode;
}

function renderLimitOptions() {
  const limits = currentLimits();
  for (const container of [limitPills, tableLimitPills]) {
    if (!container) continue;
    container.replaceChildren(...limits.map((limit) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.smallBlind = String(limit.smallBlind);
      button.className = Number(limit.smallBlind) === Number(state.selectedSmallBlind) ? "active" : "";
      renderLimitValue(button, limit.smallBlind, limit.bigBlind, state.gameMode === "cash");
      return button;
    }));
  }
}

function setupTelegramControls() {
  applyTelegramTheme();
  tg?.onEvent?.("themeChanged", applyTelegramTheme);
  setupTelegramHomeScreenInstall();
  tg?.BackButton?.onClick?.(() => {
    runAction(handleTelegramBack);
  });
}

function setupTelegramHomeScreenInstall() {
  if (!homeScreenInstallButton) return;

  const canInstall = Boolean(tg?.addToHomeScreen && tg?.checkHomeScreenStatus);
  if (!canInstall) {
    homeScreenInstallButton.hidden = true;
    return;
  }

  homeScreenInstallButton.addEventListener("click", () => {
    haptic("selection");
    if (homeScreenInstallStatus) homeScreenInstallStatus.textContent = "откройте подсказку";
    try {
      tg.addToHomeScreen();
    } catch {
      homeScreenInstallButton.hidden = true;
    }
  });

  tg?.onEvent?.("homeScreenAdded", () => {
    updateHomeScreenInstallRow("added");
    haptic("success");
  });

  refreshHomeScreenInstallStatus();
}

function refreshHomeScreenInstallStatus() {
  try {
    tg?.checkHomeScreenStatus?.((status) => {
      updateHomeScreenInstallRow(status || "unknown");
    });
  } catch {
    homeScreenInstallButton.hidden = true;
  }
}

function updateHomeScreenInstallRow(status) {
  if (!homeScreenInstallButton) return;
  const normalized = String(status || "unknown");
  const shouldShow = normalized === "unknown" || normalized === "missed";
  homeScreenInstallButton.hidden = !shouldShow;
  if (!homeScreenInstallStatus) return;
  if (normalized === "missed") homeScreenInstallStatus.textContent = "можно добавить";
  else if (normalized === "added") homeScreenInstallStatus.textContent = "уже добавлено";
  else homeScreenInstallStatus.textContent = "быстрый вход";
}

function applyTelegramTheme() {
  const themeBg = tg?.themeParams?.bg_color || tg?.themeParams?.secondary_bg_color || "#17212b";
  const secondaryBg = tg?.themeParams?.secondary_bg_color || themeBg;
  const textColor = tg?.themeParams?.text_color || "#f4f7fb";
  const hintColor = tg?.themeParams?.hint_color || "#7d8b99";
  const linkColor = tg?.themeParams?.link_color || "#2aabee";
  const buttonColor = tg?.themeParams?.button_color || linkColor;
  const buttonTextColor = tg?.themeParams?.button_text_color || "#ffffff";
  document.documentElement.style.setProperty("--tg-bg", themeBg);
  document.documentElement.style.setProperty("--tg-secondary-bg", secondaryBg);
  document.documentElement.style.setProperty("--tg-surface", secondaryBg);
  document.documentElement.style.setProperty("--tg-text", textColor);
  document.documentElement.style.setProperty("--tg-hint", hintColor);
  document.documentElement.style.setProperty("--tg-link", linkColor);
  document.documentElement.style.setProperty("--tg-button", buttonColor);
  document.documentElement.style.setProperty("--tg-button-text", buttonTextColor);
  tg?.setHeaderColor?.(themeBg);
  tg?.setBackgroundColor?.(themeBg);
}

function setupTapGuards() {
  let lastTapAt = 0;
  const editableSelector = "input, textarea, select, [contenteditable='true']";

  document.addEventListener("dblclick", (event) => {
    if (!event.target.closest(editableSelector)) event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchend", (event) => {
    if (event.target.closest(editableSelector)) return;

    const now = Date.now();
    if (now - lastTapAt < 320) {
      event.preventDefault();
    }
    lastTapAt = now;
  }, { passive: false });
}

function setupScrollDynamics() {
  let lastY = getScrollY();
  let ticking = false;
  let settleTimer = 0;

  const update = () => {
    const y = getScrollY();
    const delta = y - lastY;
    if (Math.abs(delta) > 1) {
      document.body.classList.add("is-scrolling");
      document.body.classList.toggle("scrolling-down", delta > 0);
      document.body.classList.toggle("scrolling-up", delta < 0);
      document.body.classList.toggle("scroll-at-top", y <= 2);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        document.body.classList.remove("is-scrolling", "scrolling-down", "scrolling-up");
        document.body.classList.toggle("scroll-at-top", getScrollY() <= 2);
      }, 150);
    }
    lastY = y;
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
}

function setupLobbyOverscroll() {
  let startY = 0;
  let overscroll = 0;

  const maxScrollY = () => Math.max(0, (document.scrollingElement?.scrollHeight || 0) - window.innerHeight);
  const reset = () => {
    if (!overscroll) return;
    overscroll = 0;
    document.body.classList.add("scroll-bounce-release");
    document.body.classList.remove("scroll-bounce-active");
    lobby?.style.setProperty("--scroll-bounce-y", "0px");
    window.setTimeout(() => document.body.classList.remove("scroll-bounce-release"), 220);
  };

  window.addEventListener("touchstart", (event) => {
    if (document.body.classList.contains("in-game") || event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    overscroll = 0;
  }, { passive: true });

  window.addEventListener("touchmove", (event) => {
    if (document.body.classList.contains("in-game") || !lobby || event.touches.length !== 1) return;
    if (cashierState.sheet || !buyInOverlay.hidden || !sideMenu.hidden || !infoDrawer.hidden) return;
    const pull = event.touches[0].clientY - startY;
    const y = getScrollY();
    const atTop = y <= 0 && pull > 0;
    const atBottom = y >= maxScrollY() - 2 && pull < 0;
    if (!atTop && !atBottom) {
      reset();
      return;
    }
    overscroll = Math.max(-26, Math.min(26, pull * 0.18));
    document.body.classList.add("scroll-bounce-active");
    document.body.classList.remove("scroll-bounce-release");
    lobby.style.setProperty("--scroll-bounce-y", `${overscroll.toFixed(1)}px`);
  }, { passive: true });

  window.addEventListener("touchend", reset, { passive: true });
  window.addEventListener("touchcancel", reset, { passive: true });
}

function setupScrollReveal() {
  if (revealObserver) revealObserver.disconnect();
  const items = revealItems();
  if (!items.length) return;
  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("scroll-reveal", "is-visible"));
    return;
  }
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -8% 0px"
  });
  items.forEach((item, index) => {
    item.classList.add("scroll-reveal");
    item.style.setProperty("--reveal-delay", `${Math.min(index, 8) * 26}ms`);
    revealObserver.observe(item);
  });
}

function refreshScrollReveal() {
  window.requestAnimationFrame(setupScrollReveal);
}

function setupPromoCarousel() {
  if (!promoCarousel || !promoDots) return;
  const items = [...promoCarousel.querySelectorAll(".promo-banner")];
  if (items.length <= 1) return;
  let autoTimer = 0;
  let scrollTimer = 0;

  const scheduleAuto = () => {
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(() => {
      if (document.hidden || document.body.classList.contains("in-game")) {
        scheduleAuto();
        return;
      }
      const active = [...promoDots.children].findIndex((dot) => dot.classList.contains("active"));
      const next = items[((active >= 0 ? active : 0) + 1) % items.length];
      next?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      scheduleAuto();
    }, 10000);
  };

  const pauseAuto = () => {
    window.clearTimeout(autoTimer);
  };

  promoDots.replaceChildren(...items.map((_, index) => {
    const dot = document.createElement("span");
    dot.className = index === 0 ? "active" : "";
    dot.addEventListener("click", () => {
      pauseAuto();
      items[index].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      scheduleAuto();
    });
    return dot;
  }));

  const update = () => {
    const center = promoCarousel.scrollLeft + promoCarousel.clientWidth / 2;
    let active = 0;
    let distance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const nextDistance = Math.abs(center - itemCenter);
      if (nextDistance < distance) {
        distance = nextDistance;
        active = index;
      }
    });
    [...promoDots.children].forEach((dot, index) => {
      dot.classList.toggle("active", index === active);
    });
  };

  promoCarousel.addEventListener("scroll", () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      update();
      scheduleAuto();
    }, 80);
  }, { passive: true });

  promoCarousel.addEventListener("pointerdown", pauseAuto);
  promoCarousel.addEventListener("pointerup", scheduleAuto);
  promoCarousel.addEventListener("pointercancel", scheduleAuto);
  promoCarousel.addEventListener("touchstart", pauseAuto, { passive: true });
  promoCarousel.addEventListener("touchend", scheduleAuto, { passive: true });
  promoCarousel.addEventListener("touchcancel", scheduleAuto, { passive: true });

  update();
  scheduleAuto();
}

function revealItems() {
  return [...document.querySelectorAll(`
    .lobby-view.active > section,
    .lobby-view.active > form,
    .lobby-view.active .lobby-card,
    .lobby-view.active .tg-menu-group
  `)]
    .filter((item) => !item.closest(".bottom-nav") && !item.closest(".profile-nav-fab"));
}

function getScrollY() {
  return window.scrollY
    || document.scrollingElement?.scrollTop
    || document.documentElement.scrollTop
    || document.body.scrollTop
    || 0;
}

async function handleTelegramBack() {
  if (cashierState.sheet) {
    closeCashierSheet();
    return;
  }
  if (!buyInOverlay.hidden) {
    hideBuyInOverlay();
    return;
  }
  if (!sideMenu.hidden) {
    closeMenu();
    return;
  }
  if (!infoDrawer.hidden) {
    closeDrawer();
    return;
  }
  if (!sitOutPopover.hidden) {
    closeSitOutPopover();
    return;
  }
  if (state.currentTableId || !currentTable.hidden) {
    await goToLobby();
    return;
  }
  if (currentLobbyTab !== "home") {
    selectLobbyTab("home");
  }
}

function updateTelegramBackButton() {
  const shouldShow = !buyInOverlay.hidden
    || Boolean(cashierState.sheet)
    || !sideMenu.hidden
    || !infoDrawer.hidden
    || !sitOutPopover.hidden
    || Boolean(state.currentTableId)
    || currentLobbyTab !== "home";
  if (shouldShow) {
    tg?.BackButton?.show?.();
  } else {
    tg?.BackButton?.hide?.();
  }
}

function haptic(type = "light") {
  try {
    if (type === "selection") {
      tg?.HapticFeedback?.selectionChanged?.();
      return;
    }
    if (type === "error" || type === "success" || type === "warning") {
      tg?.HapticFeedback?.notificationOccurred?.(type);
      return;
    }
    tg?.HapticFeedback?.impactOccurred?.(type);
  } catch {
    // Telegram haptics are optional outside the Mini App runtime.
  }
}

async function loadCashier() {
  if (!state.token) return;
  const data = await api("/api/cashier");
  renderCashier(data.cashier);
}

function renderCashier(cashier) {
  const cashMode = Boolean(cashier.realMoneyEnabled);
  if (cashierAssetLabel) cashierAssetLabel.textContent = cashMode ? "Баланс USDT" : "Игровые фишки";
  if (cashierTopupTitle) cashierTopupTitle.textContent = cashMode ? "Пополнить баланс" : "Тестовый баланс";
  if (cashierDepositNetwork) cashierDepositNetwork.textContent = cashMode ? "USDT" : "DEV";
  if (cashierAmountAsset) {
    if (cashMode) cashierAmountAsset.replaceChildren(createTetherMark());
    else cashierAmountAsset.textContent = "₽";
  }
  if (cashierNote) {
    cashierNote.textContent = cashMode
      ? "Введите сумму в USDT, выберите способ оплаты и откройте счет. Баланс пополнится после подтверждения платежа."
      : "Игровые фишки используются только в игровом режиме и не выводятся. Тестовое начисление доступно только в режиме разработчика.";
  }
  if (cashierWithdrawTitle) cashierWithdrawTitle.textContent = cashMode ? "Вывод USDT пока закрыт" : "У игровых фишек нет вывода";
  if (cashierWithdrawText) {
    cashierWithdrawText.textContent = cashMode
      ? "Сначала запускаем честную экономику пополнений, открытые столы и историю операций. Методы вывода добавим после отдельной настройки правил и комиссий."
      : "Игровые фишки используются только в игровых столах и не обмениваются на денежный баланс.";
  }
  renderMoneyValue(cashierBalance, cashMode ? cashier.cashBalanceMicros : cashier.playBalance, cashMode);
  renderMoneyValue(cashierTableStack, cashMode ? (cashier.cashTableStackMicros || 0) : (cashier.tableStack || 0), cashMode);
  renderMoneyValue(cashierTotalBankroll, cashMode
    ? (cashier.cashTotalBankrollMicros || cashier.cashBalanceMicros || 0)
    : (cashier.totalBankroll || cashier.balance || 0), cashMode);
  cashierState.deposit = cashier.deposit || null;
  cashierState.demoTopup = DEV_MODE && !cashier.realMoneyEnabled;
  cashierState.disabled = !cashMode && !cashierState.demoTopup;
  renderCashierControls(cashierState.demoTopup ? (state.config?.play?.deposit || {}) : (cashier.deposit || {}));
  renderCashierHistory(cashierState.demoTopup ? (cashier.playTransactions || []) : (cashier.transactions || []), cashMode);
}

function renderCashierControls(deposit) {
  if (!cashierRubAmount || !cashierPresets || !cashierMethods) return;

  const playDemo = cashierState.demoTopup;
  if (cashierState.disabled) {
    cashierRubAmount.disabled = true;
    cashierRubAmount.value = "";
    cashierRubAmount.placeholder = "Недоступно";
    cashierPresets.replaceChildren();
    cashierMethods.replaceChildren();
    if (cashierQuoteChips) cashierQuoteChips.textContent = "—";
    if (cashierQuoteStars) cashierQuoteStars.textContent = "Без оплаты";
    if (cashierPayButton) {
      cashierPayButton.disabled = true;
      cashierPayButton.textContent = "Пополнение выключено";
    }
    return;
  }
  cashierRubAmount.disabled = false;
  cashierRubAmount.placeholder = "";
  cashierRubAmount.min = String(playDemo ? (deposit.minRub || 100) : ((deposit.minUsdtMicros || 1_000_000) / 1_000_000));
  cashierRubAmount.max = String(playDemo ? (deposit.maxRub || 5000) : ((deposit.maxUsdtMicros || 5_000_000_000) / 1_000_000));
  cashierRubAmount.step = playDemo ? "50" : "1";
  cashierRubAmount.value = String(playDemo ? (deposit.minRub || 100) : 5);

  const methods = playDemo ? [] : (deposit.methods || []);
  if (methods.length && !methods.some((method) => method.id === cashierState.selectedMethod && method.enabled)) {
    cashierState.selectedMethod = methods.find((method) => method.enabled)?.id || methods[0].id || "stars";
  }

  cashierPresets.replaceChildren(...(playDemo ? (deposit.presetsRub || []) : (deposit.presetsUsdt || [])).map((amount) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.rubAmount = String(amount);
    if (playDemo) button.textContent = `${formatChips(amount)} ₽`;
    else button.replaceChildren(String(amount), " ", createTetherMark());
    return button;
  }));

  cashierMethods.replaceChildren(...methods.map((method) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.method = method.id;
    button.disabled = !method.enabled;
    button.className = method.id === cashierState.selectedMethod ? "active" : "";
    button.innerHTML = `<strong>${method.title}</strong><span>${method.speed}</span>`;
    return button;
  }));

  syncCashierQuote();
}

function onCashierPresetClick(event) {
  const button = event.target.closest("[data-rub-amount]");
  if (!button || !cashierRubAmount) return;
  cashierRubAmount.value = button.dataset.rubAmount;
  syncCashierQuote();
}

function onCashierMethodClick(event) {
  const button = event.target.closest("[data-method]");
  if (!button || button.disabled) return;
  cashierState.selectedMethod = button.dataset.method;
  cashierMethods.querySelectorAll("button").forEach((item) => {
    item.classList.toggle("active", item.dataset.method === cashierState.selectedMethod);
  });
  syncCashierQuote();
}

function syncCashierQuote() {
  const quote = cashierQuote();
  if (!cashierState.demoTopup) updateCashierMethodCopy(cashierState.selectedMethod);
  if (cashierQuoteChips) {
    if (cashierState.demoTopup) cashierQuoteChips.textContent = `${formatChips(quote.chips)} фишек`;
    else cashierQuoteChips.replaceChildren(Number(quote.usdtAmount).toFixed(2), " ", createTetherMark());
  }
  if (cashierQuoteStars) {
    if (cashierState.demoTopup) {
      cashierQuoteStars.textContent = `${formatChips(quote.stars)} Stars`;
    } else if (cashierState.selectedMethod === "stars") {
      cashierQuoteStars.textContent = `${formatNumber(quote.stars || 0)} Stars`;
    } else if (cashierState.selectedMethod === "ton") {
      cashierQuoteStars.textContent = `${Number(quote.cryptoAmount || 0).toFixed(6)} TON`;
    } else {
      cashierQuoteStars.replaceChildren(Number(quote.usdtAmount || 0).toFixed(2), " ", createTetherMark());
    }
  }
  if (!cashierPayButton) return;
  const enabledMethod = (cashierState.deposit?.methods || []).find((method) => method.id === cashierState.selectedMethod && method.enabled);
  cashierPayButton.disabled = !cashierState.demoTopup && !enabledMethod;
  if (cashierState.demoTopup) {
    cashierPayButton.textContent = `Dev: начислить ${formatChips(quote.chips)} игровых фишек`;
  } else if (enabledMethod) {
    cashierPayButton.textContent = paymentButtonLabel(cashierState.selectedMethod, quote);
  } else {
    cashierPayButton.textContent = "Пополнение скоро";
  }
}

function updateCashierMethodCopy(method) {
  if (cashierDepositNetwork) cashierDepositNetwork.textContent = paymentMethodTitleShort(method);
  if (!cashierNote) return;
  if (method === "stars") {
    cashierNote.textContent = "Оплата пройдет через Telegram Stars. Баланс USDT начислится после успешного платежа в Telegram.";
    return;
  }
  if (method === "cryptobot") {
    cashierNote.textContent = "Откроется счет Crypto Bot. После оплаты webhook подтвердит платеж и зачислит USDT на баланс.";
    return;
  }
  if (method === "xrocket") {
    cashierNote.textContent = "Откроется счет xRocket. USDT зачисляются только после подтверждения платежа провайдером.";
    return;
  }
  if (method === "ton") {
    cashierNote.textContent = "Счет TON фиксирует сумму перевода. USDT поступят на баланс после подтверждения сети.";
    return;
  }
  cashierNote.textContent = "Введите сумму в USDT, выберите способ оплаты и откройте счет.";
}

function paymentMethodTitleShort(method) {
  if (method === "stars") return "Stars";
  if (method === "cryptobot") return "Crypto Bot";
  if (method === "xrocket") return "xRocket";
  if (method === "ton") return "TON";
  return "USDT";
}

function cashierQuote() {
  const deposit = cashierState.deposit || {};
  if (!cashierState.demoTopup) {
    const minUsdt = Number(deposit.minUsdtMicros || 1_000_000) / 1_000_000;
    const maxUsdt = Number(deposit.maxUsdtMicros || 5_000_000_000) / 1_000_000;
    const usdtAmount = clampAmount(Number(cashierRubAmount?.value || minUsdt), minUsdt, maxUsdt);
    const quote = { usdtAmount };
    if (cashierState.selectedMethod === "stars") {
      const starsUsdtRate = Number(deposit.starsUsdtRate || 0.0125);
      quote.stars = starsUsdtRate > 0 ? Math.max(1, Math.ceil(usdtAmount / starsUsdtRate)) : 0;
    }
    if (cashierState.selectedMethod === "ton") {
      const tonUsdtRate = Number(deposit.tonUsdtRate || 3);
      quote.cryptoAmount = tonUsdtRate > 0 ? decimalAmount(usdtAmount / tonUsdtRate, 6) : 0;
    }
    return quote;
  }
  const minRub = Number(deposit.minRub || 100);
  const maxRub = Number(deposit.maxRub || 5000);
  const rubPerStar = Number(deposit.rubPerStar || 2);
  const chipsPerRub = Number(deposit.chipsPerRub || 50);
  const rubAmount = clampAmount(Number(cashierRubAmount?.value || minRub), minRub, maxRub);
  const stars = Math.ceil(rubAmount / rubPerStar);
  return {
    rubAmount,
    stars,
    chips: Math.round(rubAmount * chipsPerRub)
  };
}

function paymentButtonLabel(method, quote) {
  if (method === "stars") return `Оплатить ${formatNumber(quote.stars || 0)} Stars`;
  if (method === "cryptobot") return "Открыть счёт Crypto Bot";
  if (method === "xrocket") return "Открыть счёт xRocket";
  if (method === "ton") return "Открыть TON счёт";
  return "Пополнить";
}

function openPaymentUrl(url) {
  if (!url) return;
  if (tg?.openTelegramLink && isTelegramUrl(url)) {
    tg.openTelegramLink(url);
    return;
  }
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function isTelegramUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "tg:" || parsed.hostname === "t.me" || parsed.hostname.endsWith(".t.me");
  } catch {
    return String(url || "").startsWith("tg:");
  }
}

function renderCashierHistory(transactions, cashMode = false) {
  cashierHistory.replaceChildren();
  if (!transactions.length) {
    const empty = document.createElement("div");
    empty.className = "cashier-empty";
    empty.textContent = "Операций пока нет";
    cashierHistory.append(empty);
    return;
  }

  for (const transaction of transactions) {
    const row = document.createElement("div");
    row.className = `cashier-transaction ${transaction.type === "credit" ? "credit" : "debit"}`;

    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = transaction.title;
    const meta = document.createElement("span");
    meta.textContent = formatTransactionMeta(transaction);
    main.append(title, meta);

    const amount = document.createElement("b");
    amount.append(`${transaction.type === "credit" ? "+" : "-"}${cashMode ? formatUsdt(transaction.amount) : formatChips(transaction.amount)}`);
    if (cashMode) amount.append(" ", createTetherMark());

    row.append(main, amount);
    cashierHistory.append(row);
  }
}

function formatTransactionMeta(transaction) {
  const parts = [];
  if (transaction.category) parts.push(transaction.category);
  if (transaction.meta) parts.push(transaction.meta);
  if (transaction.createdAt) {
    parts.push(new Date(transaction.createdAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }));
  }
  return parts.join(" · ");
}

async function payCashierAmount() {
  if (cashierPayButton) cashierPayButton.disabled = true;
  if (cashierState.demoTopup) {
    try {
      const quote = cashierQuote();
      const data = await api("/api/cashier/demo-topup", {
        method: "POST",
        idempotencyKey: requestKey("demo-topup"),
        body: { rubAmount: quote.rubAmount }
      });
      renderCashier(data.cashier);
      await auth();
      await loadProfile();
      cashierStatus.textContent = "Dev-баланс начислен.";
      haptic("success");
      return;
    } finally {
      if (cashierPayButton) cashierPayButton.disabled = false;
    }
  }
  const method = cashierState.selectedMethod || "stars";
  cashierStatus.textContent = method === "stars"
    ? "Создаём счёт Stars..."
    : method === "cryptobot"
      ? "Создаём счёт Crypto Bot..."
      : method === "xrocket"
        ? "Создаём счёт xRocket..."
        : "Создаём счёт TON...";

  try {
    const quote = cashierQuote();
    if (method === "stars") {
      const data = await api("/api/cashier/stars-invoice", {
        method: "POST",
        idempotencyKey: requestKey("stars-invoice"),
        body: {
          usdtAmount: quote.usdtAmount
        }
      });
      openStarsInvoice(data.order?.invoiceUrl || data.order?.invoiceLink || "");
      cashierStatus.textContent = "Счёт Stars открыт.";
      return;
    }

    const data = await api("/api/cashier/crypto-order", {
      method: "POST",
      idempotencyKey: requestKey(`crypto-order-${method}`),
      body: {
        method,
        usdtAmount: quote.usdtAmount
      }
    });

    if (method === "ton") {
      renderCryptoPaymentInstructions(data.order);
      return;
    }

    const invoiceUrl = data.order?.invoiceUrl || "";
    if (!invoiceUrl) {
      cashierStatus.textContent = "Не удалось создать счёт.";
      return;
    }
    openPaymentUrl(invoiceUrl);
    cashierStatus.textContent = `${method === "cryptobot" ? "Crypto Bot" : "xRocket"} счёт открыт.`;
  } finally {
    if (cashierPayButton) cashierPayButton.disabled = false;
  }
}

function renderCryptoPaymentInstructions(order) {
  if (!order) {
    cashierStatus.textContent = "Не удалось создать crypto-счёт.";
    return;
  }

  const address = order.receiverAddress ? `\nАдрес: ${order.receiverAddress}` : "";
  const comment = order.payload ? `\nКомментарий: ${order.payload}` : "";
  cashierStatus.textContent = [
    `Счёт TON создан: ${Number(order.cryptoAmount || 0).toFixed(6)} ${order.asset}.`,
    `${Number(order.usdtAmount || 0).toFixed(2)} USDT будут начислены только после подтверждения сети.`,
    address,
    comment
  ].join("").trim();
}

async function openStarsInvoice(invoiceLink) {
  if (!invoiceLink) {
    showError("Не удалось создать счёт Telegram Stars");
    return;
  }

  if (tg?.openInvoice) {
    tg.openInvoice(invoiceLink, async (status) => {
      if (status === "paid") {
        cashierStatus.textContent = "Оплата прошла. Обновляем баланс...";
        await auth();
        await loadCashier();
        await loadProfile();
        cashierStatus.textContent = "Баланс обновлён";
        showStatus("Баланс пополнен");
        return;
      }
      cashierStatus.textContent = status === "cancelled" ? "Оплата отменена" : "Оплата не завершена";
    });
    return;
  }

  cashierStatus.textContent = "Откройте счёт Telegram Stars в Telegram";
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(invoiceLink);
    return;
  }
  window.open(invoiceLink, "_blank", "noopener,noreferrer");
}

async function loadProfile() {
  if (!state.token) return;
  const data = await api("/api/profile");
  renderProfile(data.profile);
}

function renderProfile(profileData) {
  const user = profileData.user || {};
  profileName.textContent = user.name || "Игрок";
  profileUsername.textContent = user.username ? `@${user.username}` : `id ${user.id || ""}`;
  profileBalance.replaceChildren(`${formatUsdt(profileData.cashBalanceMicros || 0)} `, createTetherMark(), ` · ${formatChips(profileData.balance)} фишек`);
  profileChips.textContent = formatChips(profileData.balance);
  profileTableStack.replaceChildren(`${formatUsdt(profileData.cashTableStackMicros || 0)} `, createTetherMark());
  profileSavedStack.textContent = formatChips(profileData.savedStack);
  lobbyTableStack.textContent = formatChips(profileData.tableStack);
  lobbyActiveTables.textContent = String(profileData.activeTableCount || 0);
  homeActivityText.textContent = profileData.activeTableCount
    ? `${profileData.activeTableCount} ${plural(profileData.activeTableCount, "стол", "стола", "столов")} · ${formatChips(profileData.tableStack)} за столами`
    : "Выберите стол и начните игру.";
  if (homeSessionPill) {
    homeSessionPill.textContent = profileData.activeTableCount ? "активно" : "нет активных";
    homeSessionPill.dataset.status = profileData.activeTableCount ? "active" : "idle";
  }
  profileHands.textContent = String(profileData.handsPlayed || 0);
  profileTables.textContent = String(profileData.activeTableCount || 0);
  profileStatus.textContent = profileData.activeTableCount ? "В игре" : "В лобби";
  profileSessionBadge.textContent = profileData.activeTableCount
    ? `${profileData.activeTableCount} ${plural(profileData.activeTableCount, "стол", "стола", "столов")}`
    : "нет";

  renderAvatar(profileAvatar, user);
  renderAvatar(lobbyAvatar, user);
  renderAvatar(navProfileAvatar, user);

  renderProfileSessions(profileData.activeTables || []);
}

function renderProfileSessions(activeTables) {
  profileSessionList.replaceChildren();
  if (!activeTables.length) {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = "<span>Активных столов нет</span><strong>Лобби</strong>";
    profileSessionList.append(row);
    return;
  }

  for (const table of activeTables) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "settings-row settings-row-button";
    row.innerHTML = "<span></span><strong></strong>";
    row.querySelector("span").textContent = `${table.name} · ${formatTableLimit(table)}`;
    row.querySelector("strong").textContent = `${formatTableAmount(table, table.stack)} · #${table.handNumber}`;
    row.addEventListener("click", () => {
      state.currentTableId = table.id;
      continueGame();
    });
    profileSessionList.append(row);
  }
}

async function loadAdminDashboard() {
  if (!ADMIN_MODE || !state.token) return;
  const data = await api("/api/admin");
  renderAdminDashboard(data.admin);
}

function renderAdminDashboard(admin) {
  const stats = admin?.stats || {};
  const diagnostics = admin?.diagnostics || {};
  const database = diagnostics.database || {};
  const memory = diagnostics.memory || {};
  adminBankrollTotal.textContent = formatChips(stats.bankrollTotal || 0);
  adminSummary.replaceChildren(...[
    ["Health", diagnostics.ok ? "ok" : "fail"],
    ["DB", database.enabled ? `${database.ok ? "ok" : "fail"} · ${database.mode}` : "memory"],
    ["Uptime", formatDuration(diagnostics.uptimeSeconds || 0)],
    ["Heap", memory.heapUsedMb ? `${memory.heapUsedMb}/${memory.heapTotalMb} MB` : "n/a"],
    ["Игроков", stats.players || 0],
    ["Активных столов", stats.activeTables || 0],
    ["Столов всего", stats.openTables || 0],
    ["Кошельки", formatChips(stats.walletTotal || 0)],
    ["За столами", formatChips(stats.tableStackTotal || 0)],
    ["Сохранено", formatChips(stats.savedStackTotal || 0)],
    ["Турнир escrow", formatChips(stats.tournamentEscrowTotal || 0)],
    ["Prize pool", formatChips(stats.tournamentPrizePoolTotal || 0)],
    ["Fee reserve", formatChips(stats.tournamentFeeReserveTotal || 0)],
    ["Рейк", formatChips(stats.rakeCollectedTotal || 0)],
    ["История рук", stats.handHistoryCount || 0],
    ["Рейк history", formatChips(stats.handHistoryRakeTotal || 0)],
    ["Ledger +", formatChips(stats.ledgerCreditTotal || 0)],
    ["Ledger -", formatChips(stats.ledgerDebitTotal || 0)],
    ["Platform ledger", formatChips(stats.platformLedgerNetTotal || 0)],
    ["Wallet drift", formatChips(admin?.audit?.reconciliation?.walletLedgerDrift || 0)],
    ["Stars drift", formatChips(admin?.audit?.reconciliation?.starsDepositDrift || 0)],
    ["Idempotency", stats.idempotencyKeyCount || 0],
    ["Stars paid", stats.paidStars || 0],
    ["Stars pending", stats.pendingStars || 0],
    ["Withdrawals", stats.pendingWithdrawals || 0],
    ["Withdrawal hold", formatChips(stats.pendingWithdrawalChipsTotal || 0)]
  ].map(([label, value]) => {
    const item = document.createElement("div");
    item.innerHTML = "<span></span><strong></strong>";
    item.querySelector("span").textContent = label;
    item.querySelector("strong").textContent = String(value);
    return item;
  }));

  renderAdminPayments(admin?.recentPayments || []);
  renderAdminWithdrawals(admin?.recentWithdrawals || []);
  renderAdminFundMovements(admin?.recentFundMovements || []);
  renderAdminHands(admin?.recentHands || []);
  renderAdminEvents(admin?.recentEvents || []);
}

async function loadAdminPlayer(telegramId) {
  const id = String(telegramId || "").trim();
  if (!id) {
    adminStatus.textContent = "Введите Telegram ID игрока.";
    return;
  }
  adminStatus.textContent = "Ищем игрока...";
  const data = await api(`/api/admin/users/${encodeURIComponent(id)}`);
  renderAdminPlayer(data.player);
  adminStatus.textContent = "Игрок загружен.";
}

function renderAdminPlayer(player) {
  const user = player.user || {};
  adminPlayerCard.hidden = false;
  adminPlayerName.textContent = user.username ? `@${user.username}` : user.name || "unknown";
  adminPlayerId.textContent = `ID ${user.id}`;
  adminPlayerBalance.textContent = formatChips(player.balance || 0);
  adminPlayerTableStack.textContent = formatChips(player.tableStack || 0);
  adminPlayerTotal.textContent = formatChips(player.totalBankroll || 0);
  adminUserId.value = user.id || adminUserId.value;
  renderAdminTransactions(player.transactions || []);
}

async function adjustAdminPlayerWallet() {
  const telegramId = String(adminUserId.value || "").trim();
  const amount = Number(String(adminAdjustAmount.value || "").replace(/\s+/g, ""));
  if (!telegramId || !amount) {
    adminStatus.textContent = "Укажите Telegram ID и сумму chips.";
    return;
  }
  adminStatus.textContent = "Применяем операцию...";
  const data = await api("/api/admin/wallet-adjust", {
    method: "POST",
    body: {
      telegramId,
      type: adminAdjustType.value,
      amount,
      reason: adminAdjustReason.value,
      requestId: `admin-${Date.now()}-${cryptoRandomHex(12)}`
    }
  });
  renderAdminPlayer(data.player);
  adminAdjustAmount.value = "";
  adminStatus.textContent = "Баланс обновлён.";
  await loadAdminDashboard();
}

function renderAdminTransactions(transactions) {
  renderAdminRows(adminPlayerTransactions, transactions.map((transaction) => ({
    title: transaction.title,
    meta: formatTransactionMeta(transaction),
    value: `${transaction.type === "credit" ? "+" : "-"}${formatChips(transaction.amount)}`,
    positive: transaction.type === "credit"
  })), "Операций нет");
}

function renderAdminPayments(payments) {
  const filter = adminPaymentFilter?.value || "all";
  const filtered = payments.filter((payment) => {
    if (filter === "all") return true;
    if (filter === "failed") return ["failed", "expired"].includes(payment.status);
    return payment.status === filter;
  });

  adminRecentPayments.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "cashier-empty";
    empty.textContent = "Платежей по фильтру нет";
    adminRecentPayments.append(empty);
    return;
  }

  for (const payment of filtered) {
    const row = document.createElement("div");
    row.className = `cashier-transaction admin-payment-row ${payment.status === "paid" ? "credit" : "debit"}`;
    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${paymentMethodTitle(payment)} · ${formatPaymentAmount(payment)}`;
    const meta = document.createElement("span");
    meta.textContent = adminPaymentMeta(payment);
    main.append(title, meta);

    const status = document.createElement("b");
    status.textContent = payment.status;
    row.append(main, status);

    const canAdminAct = payment.method !== "stars" && ["pending", "manual_review"].includes(payment.status);
    if (canAdminAct) {
      const actions = document.createElement("div");
      actions.className = "admin-payment-actions";
      actions.innerHTML = `
        <button type="button" data-payment-action="approve" data-payment-id="${payment.id}">Подтвердить</button>
        <button type="button" data-payment-action="reject" data-payment-id="${payment.id}">Отклонить</button>
      `;
      row.append(actions);
    }

    adminRecentPayments.append(row);
  }
}

function paymentMethodTitle(payment) {
  if (payment.method === "stars") return "Stars";
  if (payment.method === "cryptobot") return "Crypto Bot";
  if (payment.method === "xrocket") return "xRocket";
  if (payment.method === "ton") return "TON";
  if (payment.method === "usdt_trc20") return "USDT TRC20";
  return payment.method || "payment";
}

function adminPaymentMeta(payment) {
  const money = payment.method === "stars"
    ? `${formatUsdt(payment.cashUsdtMicros || 0)} USDT · ${formatNumber(payment.stars || 0)} Stars`
    : payment.creditedAsset === "USDT"
      ? `${formatUsdt(payment.cashUsdtMicros || 0)} USDT`
      : `${Number(payment.cryptoAmount || 0).toFixed(6)} ${payment.asset || ""} ${payment.network || ""}`.trim();
  return [
    payment.userName || payment.userId,
    payment.creditedAsset === "USDT" ? `${formatUsdt(payment.cashUsdtMicros || 0)} USDT` : `${payment.rubAmount || 0} ₽`,
    money,
    payment.externalId ? `external ${payment.externalId}` : "",
    payment.id
  ].filter(Boolean).join(" · ");
}

function formatPaymentAmount(payment) {
  if (payment.creditedAsset === "USDT") {
    return `${formatUsdt(payment.cashUsdtMicros || 0)} USDT`;
  }
  if (payment.method === "stars") {
    return `${formatNumber(payment.stars || 0)} Stars`;
  }
  return `${Number(payment.cryptoAmount || 0).toFixed(6)} ${payment.asset || payment.method || ""}`.trim();
}

function renderAdminWithdrawals(withdrawals) {
  adminRecentWithdrawals?.replaceChildren();
  if (!withdrawals.length) {
    const empty = document.createElement("div");
    empty.className = "cashier-empty";
    empty.textContent = "Заявок на вывод нет";
    adminRecentWithdrawals?.append(empty);
    return;
  }

  for (const withdrawal of withdrawals) {
    const row = document.createElement("div");
    row.className = `cashier-transaction admin-payment-row ${withdrawal.status === "approved" ? "credit" : "debit"}`;
    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${withdrawal.method?.toUpperCase?.() || withdrawal.method} · ${formatChips(withdrawal.chips)} chips`;
    const meta = document.createElement("span");
    meta.textContent = [
      withdrawal.userName || withdrawal.username || withdrawal.userId,
      `fee ${formatChips(withdrawal.feeChips || 0)}`,
      `payout ${formatChips(withdrawal.payoutChips || 0)}`,
      formatDateTime(withdrawal.createdAt)
    ].filter(Boolean).join(" · ");
    main.append(title, meta);

    const status = document.createElement("b");
    status.textContent = withdrawal.status;
    row.append(main, status);

    if (["pending", "manual_review"].includes(withdrawal.status)) {
      const actions = document.createElement("div");
      actions.className = "admin-payment-actions";
      actions.innerHTML = `
        <button type="button" data-withdrawal-action="approve" data-withdrawal-id="${withdrawal.id}">Approve</button>
        <button type="button" data-withdrawal-action="reject" data-withdrawal-id="${withdrawal.id}">Reject</button>
      `;
      row.append(actions);
    }

    adminRecentWithdrawals?.append(row);
  }
}

async function onAdminWithdrawalAction(event) {
  const button = event.target.closest("button[data-withdrawal-action]");
  if (!button) return;
  const withdrawalId = button.dataset.withdrawalId;
  const action = button.dataset.withdrawalAction;
  adminStatus.textContent = action === "approve" ? "Подтверждаем вывод..." : "Отклоняем вывод...";
  await api(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/${action}`, {
    method: "POST",
    idempotencyKey: requestKey(`admin-withdrawal-${action}-${withdrawalId}`),
    body: {
      reason: action === "approve" ? "manual_withdrawal_approval" : "manual_withdrawal_reject"
    }
  });
  adminStatus.textContent = action === "approve" ? "Вывод подтвержден." : "Вывод отклонен.";
  await loadAdminDashboard();
}

async function onAdminPaymentAction(event) {
  const button = event.target.closest("[data-payment-action]");
  if (!button) return;
  const paymentId = button.dataset.paymentId;
  const action = button.dataset.paymentAction;
  if (!paymentId || !action) return;
  adminStatus.textContent = action === "approve" ? "Подтверждаем платеж..." : "Отклоняем платеж...";
  await api(`/api/admin/payments/${encodeURIComponent(paymentId)}/${action}`, {
    method: "POST",
    idempotencyKey: requestKey(`admin-payment-${action}-${paymentId}`),
    body: {
      reason: action === "approve" ? "manual_admin_approval" : "manual_admin_reject"
    }
  });
  adminStatus.textContent = action === "approve" ? "Платеж подтвержден." : "Платеж отклонен.";
  await loadAdminDashboard();
}

function renderAdminFundMovements(movements) {
  renderAdminRows(adminFundMovements, movements.map((movement) => ({
    title: `${movement.from} → ${movement.to}`,
    meta: `${movement.category} · ${movement.user?.name || movement.userId} · ${formatDateTime(movement.createdAt)}`,
    value: formatChips(movement.amount),
    positive: false
  })), "Движений chips пока нет");
}

function renderAdminHands(hands) {
  renderAdminRows(adminRecentHands, hands.map((hand) => ({
    title: `${hand.tableName || hand.tableId} · #${hand.handNumber}`,
    meta: `${(hand.board || []).join(" ")} · rake ${formatChips(hand.rake || 0)} · ${formatDateTime(hand.finishedAt || hand.at)}`,
    value: `${hand.smallBlind || 0}/${hand.bigBlind || 0}`,
    positive: false
  })), "Истории раздач пока нет");
}

function renderAdminEvents(events) {
  renderAdminRows(adminRecentEvents, events.map((event) => ({
    title: event.title,
    meta: `${event.type} · ${event.user?.id || "system"} · ${formatDateTime(event.createdAt)}`,
    value: "log",
    positive: false
  })), "Событий пока нет");
}

function renderAdminRows(container, rows, emptyText) {
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "cashier-empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const item of rows) {
    const row = document.createElement("div");
    row.className = `cashier-transaction ${item.positive ? "credit" : "debit"}`;
    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title || "";
    const meta = document.createElement("span");
    meta.textContent = item.meta || "";
    const value = document.createElement("b");
    value.textContent = item.value || "";
    main.append(title, meta);
    row.append(main, value);
    container.append(row);
  }
}

async function onCreateTable(event) {
  event.preventDefault();
  const form = new FormData(createTableForm);
  const body = Object.fromEntries(form.entries());
  body.gameMode = state.gameMode;
  openBuyInOverlay({
    mode: "create",
    body,
    smallBlind: Number(body.smallBlind || state.selectedSmallBlind),
    gameMode: state.gameMode
  });
}

async function quickPlay() {
  if (activeBalance() <= 0) {
    openCashierTopup();
    return;
  }

  const table = state.tables.find((item) => (
    !item.isPrivate
      && (item.gameMode || "play") === state.gameMode
      && Number(item.smallBlind) === state.selectedSmallBlind
      && Number(item.seats.length) < Number(item.maxPlayers)
  ));

  if (!table) {
    showError("Свободных общих столов на этом лимите сейчас нет");
    return;
  }

  openBuyInOverlay({
    mode: "join",
    tableId: table.id,
    table
  });
}

function renderHomeCta() {
  if (!quickPlayButton || !quickPlayHint) return;
  const limit = currentLimits().find((item) => Number(item.smallBlind) === Number(state.selectedSmallBlind)) || currentLimits()[0];
  const minBuyIn = Number(limit.minBuyIn || Number(limit.bigBlind || 50) * 50);
  const balance = activeBalance();
  const quickPlayTitle = quickPlayButton.querySelector(".tg-row-main");
  const cashMode = state.gameMode === "cash";
  quickPlayButton.disabled = false;

  if (balance <= 0) {
    if (!cashMode && !DEV_MODE) {
      if (quickPlayTitle) quickPlayTitle.textContent = "Игровые фишки скоро";
      quickPlayHint.textContent = "Ежедневная бесплатная выдача в разработке";
      renderHomeOfferMeta(limit, minBuyIn, "entry", cashMode);
      quickPlayButton.disabled = true;
      return;
    }
    if (quickPlayTitle) quickPlayTitle.textContent = cashMode ? "Внести депозит" : "Получить фишки";
    else quickPlayButton.textContent = cashMode ? "Внести депозит" : "Получить фишки";
    renderHomeOfferMeta(limit, minBuyIn, "entry", cashMode);
    if (cashMode) {
      quickPlayHint.replaceChildren("Для cash-игры нужен бай-ин от ");
      renderMoneyValue(quickPlayHint, minBuyIn, true, { append: true });
    } else {
      quickPlayHint.textContent = `Для старта нужен бай-ин от ${formatGameAmount(minBuyIn)}`;
    }
    return;
  }

  if (quickPlayTitle) quickPlayTitle.textContent = cashMode ? "Начать игру USDT" : "Начать игру";
  else quickPlayButton.textContent = cashMode ? "Начать игру USDT" : "Начать игру";
  renderHomeOfferMeta(limit, balance, "balance", cashMode);
  if (balance < minBuyIn && cashMode) {
    quickPlayHint.replaceChildren("Баланс ниже минимального бай-ина ");
    renderMoneyValue(quickPlayHint, minBuyIn, true, { append: true });
  } else {
    quickPlayHint.textContent = balance < minBuyIn
      ? `Баланс ниже минимального бай-ина ${formatGameAmount(minBuyIn)}`
      : `Подберём свободный ${cashMode ? "cash" : "игровой"} стол автоматически`;
  }
}

async function quickCreatePrivateTable() {
  const smallBlind = Number(state.selectedSmallBlind || 25);
  const limit = currentLimits().find((item) => Number(item.smallBlind) === smallBlind);
  openBuyInOverlay({
    mode: "create",
    table: { ...limit, gameMode: state.gameMode, currency: state.gameMode === "cash" ? "USDT" : "PLAY_CHIPS" },
    body: {
      name: `QWZ private ${formatGameLimit(smallBlind, Number(limit?.bigBlind || smallBlind * 2))}`,
      maxPlayers: "6",
      smallBlind: String(smallBlind),
      minBuyIn: String(limit?.minBuyIn || ""),
      maxBuyIn: String(limit?.maxBuyIn || ""),
      gameMode: state.gameMode,
      visibility: "private"
    }
  });
}

function onLimitSelect(event) {
  const button = event.target.closest("[data-small-blind]");
  if (!button) return;

  haptic("selection");
  state.selectedSmallBlind = Number(button.dataset.smallBlind);
  createTableForm.elements.smallBlind.value = String(state.selectedSmallBlind);
  syncLimitSelection();
  renderTables();
}

function syncLimitSelection() {
  document.querySelectorAll("[data-small-blind]").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.smallBlind) === state.selectedSmallBlind);
  });
  if (tablesFilterStatus) {
    const limit = currentLimits().find((item) => Number(item.smallBlind) === state.selectedSmallBlind);
    if (limit && state.gameMode === "cash") {
      renderLimitValue(tablesFilterStatus, limit.smallBlind, limit.bigBlind, true);
      tablesFilterStatus.append(" · cash");
    } else {
      tablesFilterStatus.textContent = limit
        ? `${formatLimit(limit)} · play`
        : formatGameLimit(state.selectedSmallBlind, state.selectedSmallBlind * 2);
    }
  }
  renderHomeCta();
}

function selectLobbyTab(tab, options = {}) {
  if (cashierState.sheet) closeCashierSheet({ silent: true });
  const tabChanged = currentLobbyTab !== tab;
  currentLobbyTab = tab;
  updateBottomNavIndicator(tab);
  haptic("light");
  document.querySelectorAll("[data-lobby-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.lobbyTab === tab);
    if (tabChanged && button.dataset.lobbyTab === tab) {
      button.classList.remove("nav-pressed");
      void button.offsetWidth;
      button.classList.add("nav-pressed");
      window.setTimeout(() => button.classList.remove("nav-pressed"), 360);
    }
  });
  document.querySelectorAll("[data-lobby-view]").forEach((view) => {
    view.classList.toggle("active", view.dataset.lobbyView === tab);
  });
  if (tab === "profile") runAction(loadProfile);
  if (tab === "cashier") runAction(loadCashier);
  if (tab === "tournaments") runAction(loadTournaments);
  if (tab === "admin") runAction(loadAdminDashboard);
  if (tabChanged && !options.keepScroll) {
    window.requestAnimationFrame(resetScroll);
  }
  if (tabChanged) refreshScrollReveal();
  updateTelegramBackButton();
}

function updateBottomNavIndicator(tab = currentLobbyTab) {
  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;
  const visibleButtons = [...nav.querySelectorAll("[data-lobby-tab]")].filter((button) => !button.hidden);
  const index = visibleButtons.findIndex((button) => button.dataset.lobbyTab === tab);
  nav.style.setProperty("--nav-count", String(Math.max(1, visibleButtons.length)));
  nav.style.setProperty("--nav-active-index", String(Math.max(0, index)));
  nav.classList.toggle("has-active-tab", index >= 0);
}

async function openCashierTopup() {
  await openCashierSection("deposit");
}

async function openCashierSection(section = "deposit") {
  haptic("light");
  if (section === "deposit" || section === "withdraw") {
    await loadCashier();
    openCashierSheet(section);
    return;
  }
  selectLobbyTab("cashier");
  const selector = section === "withdraw"
    ? ".cashier-withdraw-card"
    : section === "history"
      ? ".cashier-history-card"
      : ".cashier-topup-card";
  window.requestAnimationFrame(() => {
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function openCashierSheet(section = "deposit") {
  const normalized = section === "withdraw" ? "withdraw" : "deposit";
  closeCashierSheet({ silent: true });
  const sheet = document.querySelector(`[data-cashier-sheet="${normalized}"]`);
  if (!sheet) return;
  if (!cashierSheetHomes.has(sheet)) {
    cashierSheetHomes.set(sheet, {
      parent: sheet.parentNode,
      nextSibling: sheet.nextSibling
    });
  }
  cashierSheetBackdrop?.before(sheet);
  cashierState.sheet = normalized;
  document.body.classList.add("cashier-sheet-open");
  if (cashierSheetBackdrop) cashierSheetBackdrop.hidden = false;
  sheet.classList.add("sheet-open");
  sheet.removeAttribute("hidden");
  window.requestAnimationFrame(() => {
    sheet.classList.add("sheet-visible");
  });
  updateTelegramBackButton();
}

function closeCashierSheet(options = {}) {
  const sheet = cashierState.sheet ? document.querySelector(`[data-cashier-sheet="${cashierState.sheet}"]`) : null;
  cashierState.sheet = "";
  document.body.classList.remove("cashier-sheet-open");
  cashierSheetBackdrop?.setAttribute("hidden", "");
  document.querySelectorAll("[data-cashier-sheet].sheet-open").forEach((item) => {
    item.classList.remove("sheet-visible", "sheet-open");
    item.style.removeProperty("--sheet-drag-y");
    const home = cashierSheetHomes.get(item);
    if (home?.parent) {
      home.parent.insertBefore(item, home.nextSibling);
    }
  });
  if (!options.silent) {
    haptic("light");
    updateTelegramBackButton();
  }
  if (sheet?.contains(document.activeElement)) {
    document.activeElement.blur();
  }
}

function wireCashierSheetDrag(sheet) {
  let startY = 0;
  let dragStartY = 0;
  let dragY = 0;
  let pending = false;
  let tracking = false;
  let pointerId = null;

  const begin = (clientY, id = null) => {
    if (!sheet.classList.contains("sheet-open")) return false;
    startY = clientY;
    dragStartY = clientY;
    dragY = 0;
    pending = true;
    tracking = false;
    pointerId = id;
    sheet.style.setProperty("--sheet-drag-y", "0px");
    return true;
  };

  const move = (clientY, event) => {
    if (!pending && !tracking) return;
    const delta = clientY - startY;
    if (!tracking) {
      if (delta < -4) {
        pending = false;
        return;
      }
      if (delta <= 4) return;
      if (sheet.scrollTop > 2) {
        startY = clientY;
        return;
      }
      tracking = true;
      pending = false;
      dragStartY = startY;
      sheet.style.transition = "none";
      if (sheet.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
    dragY = Math.max(0, clientY - dragStartY);
    if (dragY > 0) event?.preventDefault?.();
    sheet.style.setProperty("--sheet-drag-y", `${Math.round(dragY)}px`);
  };

  const finish = (event) => {
    if (!pending && !tracking) return;
    const shouldClose = tracking && dragY > 58;
    pending = false;
    tracking = false;
    if (pointerId !== null) sheet.releasePointerCapture?.(pointerId);
    pointerId = null;
    sheet.style.transition = "";
    if (shouldClose) {
      closeCashierSheet();
      return;
    }
    sheet.style.setProperty("--sheet-drag-y", "0px");
  };

  sheet.addEventListener("pointerdown", (event) => {
    if (!begin(event.clientY, event.pointerId)) return;
    sheet.setPointerCapture?.(event.pointerId);
  });

  sheet.addEventListener("pointermove", (event) => {
    move(event.clientY, event);
  });

  sheet.addEventListener("pointerup", finish);
  sheet.addEventListener("pointercancel", finish);

  sheet.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    begin(touch.clientY);
  }, { passive: true });

  sheet.addEventListener("touchmove", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    move(touch.clientY, event);
  }, { passive: false });

  sheet.addEventListener("touchend", finish);
  sheet.addEventListener("touchcancel", finish);
}

function wireBuyInSheetDrag() {
  if (!buyInSheet || !buyInOverlay) return;
  let startY = 0;
  let dragStartY = 0;
  let dragY = 0;
  let pending = false;
  let tracking = false;
  let pointerId = null;

  const begin = (clientY, id = null) => {
    if (buyInOverlay.hidden) return false;
    startY = clientY;
    dragStartY = clientY;
    dragY = 0;
    pending = true;
    tracking = false;
    pointerId = id;
    buyInSheet.style.setProperty("--buyin-drag-y", "0px");
    return true;
  };

  const move = (clientY, event) => {
    if (!pending && !tracking) return;
    const delta = clientY - startY;
    if (!tracking) {
      if (delta < -4) {
        pending = false;
        return;
      }
      if (delta <= 4) return;
      if (buyInSheet.scrollTop > 2) {
        startY = clientY;
        return;
      }
      tracking = true;
      pending = false;
      dragStartY = startY;
      buyInSheet.style.transition = "none";
      if (buyInSheet.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
    dragY = Math.max(0, clientY - dragStartY);
    if (dragY > 0) event?.preventDefault?.();
    buyInSheet.style.setProperty("--buyin-drag-y", `${Math.round(dragY)}px`);
  };

  const finish = () => {
    if (!pending && !tracking) return;
    const shouldClose = tracking && dragY > 58;
    pending = false;
    tracking = false;
    if (pointerId !== null) buyInSheet.releasePointerCapture?.(pointerId);
    pointerId = null;
    buyInSheet.style.transition = "";
    if (shouldClose) {
      hideBuyInOverlay();
      return;
    }
    buyInSheet.style.setProperty("--buyin-drag-y", "0px");
  };

  buyInSheet.addEventListener("pointerdown", (event) => {
    if (!begin(event.clientY, event.pointerId)) return;
    buyInSheet.setPointerCapture?.(event.pointerId);
  });
  buyInSheet.addEventListener("pointermove", (event) => move(event.clientY, event));
  buyInSheet.addEventListener("pointerup", finish);
  buyInSheet.addEventListener("pointercancel", finish);
  buyInSheet.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];
    if (touch) begin(touch.clientY);
  }, { passive: true });
  buyInSheet.addEventListener("touchmove", (event) => {
    const touch = event.touches?.[0];
    if (touch) move(touch.clientY, event);
  }, { passive: false });
  buyInSheet.addEventListener("touchend", finish);
  buyInSheet.addEventListener("touchcancel", finish);
}

async function loadTables() {
  const data = await api("/api/tables");
  state.tables = data.tables;
  renderTables();
}

async function loadTournaments() {
  if (!tournamentList) return;
  const data = await api("/api/tournaments");
  state.tournaments = data.tournaments || [];
  renderTournaments();
}

function renderTournaments() {
  if (!tournamentList) return;
  tournamentList.replaceChildren();

  if (!state.tournaments.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Турниров пока нет.";
    tournamentList.append(empty);
    return;
  }

  for (const tournament of state.tournaments) {
    const node = document.createElement("article");
    node.className = "tournament-card";
    node.dataset.status = tournament.status;

    const startsAt = new Date(tournament.startsAt);
    const time = Number.isNaN(startsAt.getTime())
      ? "время уточняется"
      : startsAt.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const action = tournament.registered ? "cancel" : "register";
    const actionText = tournament.registered ? "Отменить" : tournament.canRegister ? "Участвовать" : "Скоро";

    node.innerHTML = `
      <div class="tournament-main">
        <div>
          <span>${escapeHtml(tournament.type)}</span>
          <strong>${escapeHtml(tournament.title)}</strong>
          <small>${time} · ${tournament.participants}/${tournament.maxPlayers} игроков</small>
        </div>
        <b>${tournament.registered ? "Вы в игре" : statusLabel(tournament.status)}</b>
      </div>
      <div class="tournament-meta">
        <span>Бай-ин <strong>${formatChips(tournament.buyIn)}</strong></span>
        <span>Fee <strong>${formatChips(tournament.fee)}</strong></span>
        <span>Призовой фонд <strong>${formatChips(tournament.prizePool)}</strong></span>
      </div>
      <button type="button" data-tournament-action="${action}" data-tournament-id="${tournament.id}" ${(!tournament.canRegister && !tournament.canCancel) ? "disabled" : ""}>${actionText}</button>
    `;
    tournamentList.append(node);
  }
}

async function onTournamentAction(event) {
  const button = event.target.closest("[data-tournament-action]");
  if (!button) return;
  const id = button.dataset.tournamentId;
  const action = button.dataset.tournamentAction;
  const endpoint = action === "cancel" ? "cancel" : "register";
  const data = await api(`/api/tournaments/${id}/${endpoint}`, {
    method: "POST",
    idempotencyKey: requestKey(`tournament-${endpoint}-${id}`)
  });
  state.tournaments = data.tournaments || [];
  if (data.profile) {
    state.user.balance = data.profile.balance;
    lobbyBalance.textContent = formatChips(data.profile.balance);
    renderProfile(data.profile);
    renderHomeCta();
  }
  if (data.cashier) renderCashier(data.cashier);
  renderTournaments();
  if (tournamentStatus) {
    tournamentStatus.textContent = action === "cancel" ? "Регистрация отменена, chips возвращены." : "Вы зарегистрированы в турнире.";
  }
  haptic("success");
}

function renderTables() {
  syncLimitSelection();
  const selectedBlind = Number(state.selectedSmallBlind);
  const publicTables = state.tables.filter((table) => !table.isPrivate && (table.gameMode || "play") === state.gameMode && Number(table.smallBlind) === selectedBlind);
  const privateTables = state.tables.filter((table) => table.isPrivate && (table.gameMode || "play") === state.gameMode && Number(table.smallBlind) === selectedBlind);
  const availablePublicTables = publicTables.filter((table) => table.seats.length < table.maxPlayers);
  onlineStatus.textContent = `${availablePublicTables.length} ${plural(availablePublicTables.length, "стол", "стола", "столов")}`;
  publicTablesStatus.textContent = `${publicTables.length} ${plural(publicTables.length, "стол", "стола", "столов")}`;
  privateTablesStatus.textContent = `${privateTables.length} ${plural(privateTables.length, "стол", "стола", "столов")}`;
  renderContinueCard();
  const limitText = formatGameLimit(selectedBlind, Number(currentLimits().find((item) => Number(item.smallBlind) === selectedBlind)?.bigBlind || selectedBlind * 2));
  renderTableList(homeTableList, availablePublicTables.slice(0, 2), `На лимите ${limitText} сейчас нет свободных столов.`);
  renderTableList(publicTableList, publicTables, `На лимите ${limitText} свободных общих столов пока нет.`);
  renderTableList(privateTableList, privateTables, `Приватных столов ${limitText} пока нет. Создай игру для друзей.`);
}

function renderTableList(container, tables, emptyText) {
  container.replaceChildren();

  if (!tables.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const table of tables) {
    const node = tableItemTemplate.content.cloneNode(true);
    const isFull = table.seats.length >= table.maxPlayers;
    const isActive = table.status !== "waiting" && table.status !== "starting";
    const statusText = isFull ? "занят" : isActive ? "идёт" : "свободно";
    const avatar = node.querySelector('[data-field="avatar"]');
    avatar.textContent = table.isPrivate ? "🔒" : "♠";
    avatar.classList.toggle("private", Boolean(table.isPrivate));
    node.querySelector('[data-field="name"]').textContent = table.name;
    const status = node.querySelector('[data-field="status"]');
    status.textContent = statusText;
    status.dataset.status = isFull ? "full" : isActive ? "live" : "open";
    const meta = node.querySelector('[data-field="meta"]');
    if (table.gameMode === "cash") {
      renderLimitValue(meta, table.smallBlind, table.bigBlind, true);
      meta.append(` · бай-ин ${formatUsdt(table.minBuyIn || table.bigBlind * 50)}-${formatUsdt(table.maxBuyIn || table.bigBlind * 250)} USDT`);
      meta.append(` · ${table.seats.length}/${table.maxPlayers} игроков${table.isPrivate ? " · приватный" : ""}`);
    } else {
      meta.textContent = `${formatTableLimit(table)} · ${table.seats.length}/${table.maxPlayers} игроков${table.isPrivate ? " · приватный" : ""}`;
    }
    const button = node.querySelector('[data-action="join"]');
    button.textContent = isFull ? "Заполнен" : "Войти";
    button.disabled = isFull;
    button.addEventListener("click", () => openBuyInOverlay({
      mode: "join",
      tableId: table.id,
      table
    }));
    container.append(node);
  }
}

function renderContinueCard() {
  const table = state.tables.find((item) => item.id === state.currentTableId);
  continueCard.hidden = !table;
  if (!table) return;
  continueMeta.textContent = `${table.seats.length}/${table.maxPlayers} · ${formatTableLimit(table)}`;
}

function continueGame() {
  if (!state.currentTableId) return;
  haptic("light");
  currentTable.hidden = false;
  enterGameMode();
  loadCurrentTable();
}

async function joinTable(tableId, buyInAmount = 0) {
  if (!buyInAmount) {
    const table = await tablePreview(tableId);
    if (!table) {
      showError("Стол не найден или уже закрыт");
      return;
    }
    if (table.seats.length >= table.maxPlayers && !table.viewer?.isSeated) {
      showError("Стол заполнен");
      return;
    }
    openBuyInOverlay({
      mode: "join",
      tableId,
      table,
      balance: table.gameMode === "cash" ? state.user?.cashBalanceMicros : state.user?.balance
    });
    return;
  }
  await runAction(async () => {
    const data = await api(`/api/tables/${tableId}/join`, {
      method: "POST",
      idempotencyKey: requestKey(`table-join-${tableId}`),
      body: { buyInAmount }
    });
    state.currentTableId = data.table.id;
    enterGameMode();
    renderCurrentTable(data.table);
    await ensurePlayerFairnessSeed(data.table);
    haptic("success");
  });
}

async function tablePreview(tableId) {
  const cached = state.tables.find((table) => table.id === tableId);
  if (cached) return cached;

  try {
    const data = await api(`/api/tables/${tableId}`);
    return data.table;
  } catch {
    return null;
  }
}

function openBuyInOverlay(intent) {
  haptic("light");
  closeMenu();
  closeDrawer();
  pendingBuyIn = intent;
  const table = intent.table || {};
  const cashMode = (table.gameMode || intent.gameMode || state.gameMode) === "cash";
  const smallBlind = Number(table.smallBlind || intent.smallBlind || state.selectedSmallBlind || 25);
  const bigBlind = Number(table.bigBlind || smallBlind * 2);
  const balance = Number(intent.balance ?? (cashMode ? state.user?.cashBalanceMicros : state.user?.balance) ?? 0);
  const minimumBuyIn = Math.max(Number(table.minBuyIn || bigBlind * 50), bigBlind);
  if (balance < minimumBuyIn && intent.mode !== "rebuy") {
    selectLobbyTab("cashier");
    cashierStatus.textContent = cashMode
      ? `Для входа на ${formatGameLimit(smallBlind, bigBlind, true)} внесите депозит минимум ${formatModeAmount(minimumBuyIn, true)}.`
      : DEV_MODE
        ? `Для игрового стола начислите минимум ${formatModeAmount(minimumBuyIn, false)}.`
        : "Бесплатная выдача игровых фишек будет доступна перед запуском игровых столов.";
    document.querySelector(".cashier-topup-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const bounds = buyInBounds(bigBlind, balance, { ...intent, minAmount: minimumBuyIn, maxAmount: table.maxBuyIn });
  const minAmount = bounds.min;
  const maxAmount = bounds.max;
  const defaultAmount = clampAmount(Number(intent.defaultAmount || bounds.defaultAmount), minAmount, maxAmount);
  if (buyInModeLabel) {
    buyInModeLabel.replaceChildren("Texas Hold'em ");
    renderLimitValue(buyInModeLabel, smallBlind, bigBlind, cashMode, { append: true });
    buyInModeLabel.append(" · ");
    if (cashMode) {
      buyInModeLabel.append("USDT ");
      buyInModeLabel.append(createTetherMark());
    } else {
      buyInModeLabel.append("фишки");
    }
  }

  document.querySelector(".buyin-title").textContent = intent.mode === "rebuy" ? "Re-buy" : "Buy-in";
  buyInGameType.textContent = "";
  renderMoneyValue(buyInBalance, balance, cashMode);
  buyInAmount.dataset.cashMode = cashMode ? "true" : "false";
  buyInAmount.dataset.min = String(minAmount);
  buyInAmount.dataset.max = String(maxAmount);
  buyInSlider.min = String(minAmount);
  buyInSlider.max = String(maxAmount);
  buyInSlider.step = String(Math.max(cashMode ? 10_000 : 100, bigBlind));
  renderMoneyValue(buyInMinButton.querySelector("span"), minAmount, cashMode);
  renderMoneyValue(buyInMaxButton.querySelector("span"), maxAmount, cashMode);
  setBuyInAmount(defaultAmount);
  buyInOverlay.hidden = false;
  document.documentElement.classList.add("buyin-sheet-open");
  document.body.classList.add("buyin-sheet-open");
  buyInOverlay.classList.add("sheet-open");
  buyInSheet?.classList.remove("sheet-visible");
  buyInSheet?.style.removeProperty("--buyin-drag-y");
  window.requestAnimationFrame(() => {
    buyInSheet?.classList.add("sheet-visible");
  });
  updateTelegramBackButton();
}

function buyInBounds(bigBlind, balance, intent = {}) {
  const minBuyIn = Math.max(Number(intent.minAmount || bigBlind * 50), bigBlind);
  const maxBuyIn = Math.max(minBuyIn, bigBlind * 100);
  const requestedMin = Number(intent.minAmount || minBuyIn);
  const requestedMax = Number(intent.maxAmount || maxBuyIn);
  const min = Math.min(balance, requestedMin);
  const max = Math.max(min, Math.min(balance, requestedMax));
  return {
    min,
    max,
    defaultAmount: Math.min(maxBuyIn, max)
  };
}

function hideBuyInOverlay() {
  buyInSheet?.classList.remove("sheet-visible");
  buyInSheet?.style.removeProperty("--buyin-drag-y");
  document.documentElement.classList.remove("buyin-sheet-open");
  document.body.classList.remove("buyin-sheet-open");
  buyInOverlay.classList.remove("sheet-open");
  buyInOverlay.hidden = true;
  pendingBuyIn = null;
  haptic("light");
  updateTelegramBackButton();
}

async function confirmBuyIn() {
  if (!pendingBuyIn) return;
  haptic("medium");
  const buyInAmount = Number(buyInAmountValue());
  const intent = pendingBuyIn;
  buyInSheet?.classList.remove("sheet-visible");
  buyInSheet?.style.removeProperty("--buyin-drag-y");
  document.documentElement.classList.remove("buyin-sheet-open");
  document.body.classList.remove("buyin-sheet-open");
  buyInOverlay.classList.remove("sheet-open");
  buyInOverlay.hidden = true;
  pendingBuyIn = null;
  updateTelegramBackButton();

  if (intent.mode === "create") {
    const data = await api("/api/tables", {
      method: "POST",
      idempotencyKey: requestKey("table-create"),
      body: { ...intent.body, buyInAmount }
    });
    state.currentTableId = data.table.id;
    enterGameMode();
    renderCurrentTable(data.table);
    await ensurePlayerFairnessSeed(data.table);
    haptic("success");
    await auth();
    await loadCashier();
    await loadTables();
    return;
  }

  if (intent.mode === "join") {
    await joinTable(intent.tableId, buyInAmount);
    await auth();
    await loadCashier();
    await loadTables();
    return;
  }

  if (intent.mode === "rebuy") {
    const data = await api(`/api/tables/${intent.tableId}/rebuy`, {
      method: "POST",
      idempotencyKey: requestKey(`table-rebuy-${intent.tableId}`),
      body: { amount: buyInAmount }
    });
    closeMenu();
    renderCurrentTable(data.table);
    await auth();
    await loadCashier();
  }
}

function buyInAmountValue() {
  const minAmount = Number(buyInAmount.dataset.min || 10000);
  const maxAmount = Number(buyInAmount.dataset.max || minAmount);
  return clampAmount(Number(String(buyInAmount.value || "").replace(/\s/g, "")), minAmount, maxAmount);
}

function syncBuyInSliderFromAmount() {
  setBuyInAmount(buyInAmountValue());
}

function syncBuyInAmountFromSlider() {
  setBuyInAmount(Number(buyInSlider.value || 0));
}

function setBuyInAmount(amount) {
  const minAmount = Number(buyInAmount.dataset.min || 10000);
  const maxAmount = Number(buyInAmount.dataset.max || minAmount);
  const safeAmount = clampAmount(amount, minAmount, maxAmount);
  buyInAmount.value = String(safeAmount);
  buyInSlider.value = String(safeAmount);
  const cashMode = buyInAmount.dataset.cashMode === "true";
  renderMoneyValue(buyInDebit, safeAmount, cashMode);
  renderMoneyValue(buyInStackPreview, safeAmount, cashMode);
}

async function loadCurrentTable() {
  const data = await api(`/api/tables/${state.currentTableId}`);
  renderCurrentTable(data.table);
  await ensurePlayerFairnessSeed(data.table);
}

async function ensurePlayerFairnessSeed(table) {
  if (!table?.id || !state.user?.id || !table.viewer?.isSeated) return;
  if (!["waiting", "starting", "showdown"].includes(table.status)) return;

  const viewerSeat = (table.seats || []).find((seat) => seat.userId === state.user.id);
  if (!viewerSeat || viewerSeat.fairnessSeedSource === "player") return;

  const syncKey = `${table.id}:${viewerSeat.fairnessSeedHash || "missing"}`;
  if (fairnessSeedSyncing || fairnessSeedSyncedTables.has(syncKey)) return;

  fairnessSeedSyncing = true;
  fairnessSeedSyncedTables.add(syncKey);
  try {
    const data = await api(`/api/tables/${table.id}/fairness-seed`, {
      method: "POST",
      body: { seed: getLocalFairnessSeed() }
    });
    if (data.table) renderCurrentTable(data.table);
  } catch (error) {
    console.warn("Fairness seed sync failed:", error.message);
  } finally {
    fairnessSeedSyncing = false;
  }
}

function getLocalFairnessSeed() {
  const userId = state.user?.id || "anonymous";
  const storageKey = `qwzFairnessSeed:${userId}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing && existing.length >= 32) return existing;

  const seed = `qwz:${userId}:${Date.now()}:${cryptoRandomHex(32)}`;
  window.localStorage.setItem(storageKey, seed);
  return seed;
}

async function onPokerAction(event) {
  const button = event.target.closest("button[data-poker-action]");
  if (!button || !state.currentTableId) return;

  const action = button.dataset.pokerAction;
  if (action === "raise" || action === "bet") {
    openAmountPanel(action);
    return;
  }
  closeAmountPanel();
  await submitPokerAction(action);
}

async function onConfirmBet() {
  if (!pendingBetAction) return;
  const action = pendingBetAction;
  closeAmountPanel();
  await submitPokerAction(action);
}

async function submitPokerAction(action) {
  haptic(action === "fold" ? "warning" : "medium");
  const body = { action };
  if (action === "raise" || action === "bet") body.amount = Number(actionAmount.value || 0);
  await runAction(async () => {
    const data = await api(`/api/tables/${state.currentTableId}/act`, {
      method: "POST",
      body
    });
    renderCurrentTable(data.table);
  });
}

async function addTestPlayer() {
  if (!state.currentTableId) return;
  const data = await api(`/api/tables/${state.currentTableId}/add-test-player`, { method: "POST" });
  renderCurrentTable(data.table);
  await loadTables();
}

async function autoAct() {
  if (!state.currentTableId) return;
  const data = await api(`/api/tables/${state.currentTableId}/auto-act`, { method: "POST" });
  renderCurrentTable(data.table);
  await loadTables();
}

async function testBotAct(action) {
  if (!state.currentTableId) return;
  const data = await api(`/api/tables/${state.currentTableId}/test-bot-act`, {
    method: "POST",
    body: { action }
  });
  renderCurrentTable(data.table);
  await loadTables();
}

async function standFromTable() {
  if (!state.currentTableId) return;
  const data = await api(`/api/tables/${state.currentTableId}/stand`, { method: "POST" });
  closeMenu();
  await auth();
  if (data.table) {
    renderCurrentTable(data.table);
    return;
  }
  await goToLobby();
}

async function sitAtTable() {
  if (!state.currentTableId) return;
  const data = await api(`/api/tables/${state.currentTableId}/join`, { method: "POST" });
  closeMenu();
  renderCurrentTable(data.table);
}

async function returnToSeat() {
  if (state.currentTable?.viewer?.sittingOutReason === "rebuy") {
    await buyIn();
    return;
  }
  if (state.currentTable?.viewer?.sittingOut) {
    await sitIn();
    return;
  }
  await sitAtTable();
}

async function sitOut() {
  if (!state.currentTableId) return;
  const data = await api(`/api/tables/${state.currentTableId}/sit-out`, { method: "POST" });
  closeMenu();
  closeSitOutPopover();
  renderCurrentTable(data.table);
}

async function sitIn() {
  if (!state.currentTableId) return;
  const data = await api(`/api/tables/${state.currentTableId}/sit-in`, { method: "POST" });
  closeMenu();
  renderCurrentTable(data.table);
}

async function buyIn() {
  if (!state.currentTableId || !state.currentTable?.viewer?.canBuyIn) {
    showError("Докупить фишки можно только между раздачами");
    return;
  }

  const viewer = state.currentTable.viewer;
  const balance = Number(viewer.balance || 0);
  if (balance <= 0) {
    showError("На общем балансе нет средств для докупки");
    return;
  }

  openBuyInOverlay({
    mode: "rebuy",
    tableId: state.currentTableId,
    table: state.currentTable,
    balance
  });
}

async function goToLobby() {
  if (state.currentTable?.viewer?.isSeated && state.currentTableId) {
    await api(`/api/tables/${state.currentTableId}/leave`, { method: "POST" });
  }
  state.currentTableId = "";
  state.currentTable = null;
  currentTable.hidden = true;
  lobby.hidden = false;
  document.body.classList.remove("in-game");
  closeMenu();
  closeDrawer();
  selectLobbyTab("home");
  await auth();
  await loadCashier();
  await loadTables();
  resetScroll();
  updateTelegramBackButton();
}

function resetScroll() {
  const options = { top: 0, left: 0, behavior: "instant" };
  window.scrollTo(options);
  document.scrollingElement?.scrollTo?.(options);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  lobby.scrollTop = 0;
  document.querySelector("[data-lobby-view].active")?.scrollTo?.(options);
}

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    haptic("error");
    showError(error.message);
  }
}

function showError(message) {
  if (tg?.showAlert) {
    try {
      const result = tg.showAlert(message);
      if (result?.catch) result.catch(() => window.alert(message));
      return;
    } catch {
      window.alert(message);
      return;
    }
  }
  window.alert(message);
}

function showStatus(message) {
  haptic("success");
  if (tg?.showPopup) {
    try {
      tg.showPopup({
        title: "QWZ Poker",
        message,
        buttons: [{ type: "ok" }]
      });
      return;
    } catch {
      // Fall through to the lightweight browser fallback.
    }
  }
  actionToast.hidden = false;
  actionToast.textContent = message;
  actionToast.classList.remove("show");
  void actionToast.offsetWidth;
  actionToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    actionToast.classList.remove("show");
    window.setTimeout(() => {
      actionToast.hidden = true;
    }, 220);
  }, 1400);
}

function renderCurrentTable(table) {
  state.currentTable = table;
  currentTable.hidden = false;
  enterGameMode();
  tableCode.textContent = `#${table.id.slice(-8)}`;
  renderLimitValue(blinds, table.smallBlind, table.bigBlind, table.gameMode === "cash");
  tableDetails.textContent = `Texas NL · Блайнды ${formatTableLimit(table)} · #${table.handNumber || 1}`;
  const shouldCollectBets = shouldAnimateBetCollection(table);
  if (shouldCollectBets) animateBetStacksToPot();
  pot.replaceChildren("Банк: ");
  renderTableValue(pot, table, table.pot, { append: true });
  if (potAmountKey !== String(table.pot)) {
    potAmountKey = String(table.pot);
    restartAnimation(pot, "pulse");
  }
  pot.dataset.amount = String(table.pot);
  potChips.dataset.size = chipSize(table.pot, table.bigBlind);
  potChips.dataset.chipTheme = chipTheme(table.pot, table.bigBlind);
  tableStatus.textContent = formatStatus(table);
  renderBettingActions(table);
  renderPreActions(table);
  renderStartOverlay(table);
  renderActionToast(table);
  renderStreetOverlay(table);
  renderActionLog(table.actionLog || [], table.handHistory || []);
  renderTableInfo(table);
  renderStats(table);
  renderSeatControls(table);
  renderBotControls(table);
  maybePromptRebuy(table);
  const nextCommunityKey = table.communityCards.join("|");
  const animateCommunity = nextCommunityKey !== communityCardsKey;
  communityCardsKey = nextCommunityKey;
  communityCards.replaceChildren(...renderCommunityCards(table.communityCards, { animate: animateCommunity }));
  seats.replaceChildren(
    ...table.seats.map((seat, index) => {
      const node = document.createElement("article");
      node.dataset.userId = seat.userId;
      const seatCardKey = `${table.handNumber}:${seat.userId}:${seat.cards.join("|")}`;
      const previousCardKey = previousSeatCardKeys.get(seat.userId) || "";
      const shouldAnimateCards = Boolean(seat.cards.length && seatCardKey !== previousCardKey);
      previousSeatCardKeys.set(seat.userId, seatCardKey);
      const previousBet = previousSeatBets.get(seat.userId) || 0;
      const shouldAnimateBet = Boolean(seat.bet && seat.bet !== previousBet);
      previousSeatBets.set(seat.userId, seat.bet || 0);
      const previousFolded = previousSeatFolded.get(seat.userId) || false;
      const becameFolded = Boolean(seat.folded && !previousFolded);
      previousSeatFolded.set(seat.userId, Boolean(seat.folded));
      const nextActiveSeatKey = `${table.handNumber}:${table.activeSeatIndex}:${seat.userId}`;
      const shouldAnimateTurn = index === table.activeSeatIndex && activeSeatKey !== nextActiveSeatKey;
      node.className = [
        "seat",
        `seat-${index}`,
        `seat-count-${table.seats.length}`,
        index === table.activeSeatIndex ? "active" : "",
        shouldAnimateTurn ? "turn-in" : "",
        seat.sittingOut ? "sitting-out" : "",
        seat.sitOutNextHand ? "sitout-pending" : "",
        seat.folded ? "folded" : "",
        becameFolded ? "fold-out" : "",
        seat.userId === state.user?.id ? "viewer-seat" : "",
        seat.isAllIn ? "all-in" : "",
        shouldAnimateBet ? "bet-pop" : "",
        isWinningSeat(table, seat) ? "winner" : ""
      ].filter(Boolean).join(" ");
      node.innerHTML = `
        <div class="seat-avatar"></div>
        <div class="seat-cards"></div>
        <div class="bet-spot">
          <div class="chip-stack" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <span class="bet-amount"></span>
        </div>
        <div class="seat-plate">
          <div class="seat-name"></div>
          <div class="seat-timer"><span></span></div>
          <div class="seat-meta"></div>
        </div>
      `;
      const badges = [
        index === table.dealerIndex ? "D" : "",
        index === table.smallBlindIndex ? "SB" : "",
        index === table.bigBlindIndex ? "BB" : "",
        seat.isAllIn ? "All-in" : "",
        seat.sitOutNextHand ? "Away next" : "",
        seat.sittingOut ? sittingOutLabel(seat) : "",
        index === table.activeSeatIndex ? "Ход" : "",
        seat.folded ? "Fold" : ""
      ].filter(Boolean);
      renderAvatar(node.querySelector(".seat-avatar"), seat);
      node.querySelector(".seat-name").textContent = seat.name;
      renderTableValue(node.querySelector(".seat-meta"), table, seat.stack);
      node.querySelector(".seat-cards").replaceChildren(...renderCards(seat.cards, { animate: shouldAnimateCards }));
      if (seat.bet) renderTableValue(node.querySelector(".bet-amount"), table, seat.bet);
      node.dataset.badges = badges.join(" ");
      node.dataset.bet = seat.bet ? formatTableAmount(table, seat.bet) : "";
      node.dataset.betSize = chipSize(seat.bet, table.bigBlind);
      node.dataset.chipTheme = chipTheme(seat.bet, table.bigBlind);
      if (index === table.activeSeatIndex && table.actionDeadline) {
        node.style.setProperty("--timer-progress", `${timerProgress(table)}%`);
      }
      return node;
    })
  );
  activeSeatKey = table.activeSeatIndex >= 0
    ? `${table.handNumber}:${table.activeSeatIndex}:${table.seats[table.activeSeatIndex]?.userId || ""}`
    : "";
}

function renderSeatControls(table) {
  const isSeated = Boolean(table.viewer?.isSeated);
  const isSittingOut = Boolean(table.viewer?.sittingOut);
  const tableIsFull = table.seats.length >= table.maxPlayers;
  const canSit = !isSeated && !tableIsFull;
  sitButton.hidden = true;
  observerBanner.hidden = isSeated && !isSittingOut;
  observerSitButton.hidden = !canSit && !isSittingOut;
  if (isSittingOut) {
    observerBanner.querySelector("strong").textContent = table.viewer?.sittingOutReason === "rebuy"
      ? "Нужна докупка"
      : "Вы отошли от стола";
    observerHint.textContent = table.viewer?.sittingOutReason === "rebuy"
      ? "Докупить фишки можно через кнопку ниже."
      : "Вы пропускаете раздачи, пока не вернётесь.";
    observerSitButton.textContent = table.viewer?.sittingOutReason === "rebuy" ? "Докупить" : "Вернуться";
  } else {
    observerBanner.querySelector("strong").textContent = "Вы наблюдаете за столом";
    observerHint.textContent = tableIsFull
      ? "Свободных мест нет. Можно наблюдать за раздачей."
      : "Можно сесть за свободное место и войти в игру.";
    observerSitButton.textContent = "Сесть за стол";
  }
  standButton.hidden = !isSeated;
  sitOutButton.hidden = !isSeated || isSittingOut;
  quickSitOutButton.hidden = !isSeated || isSittingOut;
  buyInButton.disabled = !table.viewer?.canBuyIn;
  quickBuyInButton.disabled = !table.viewer?.canBuyIn;
  quickBuyInButton.hidden = !isSeated;
}

function renderBotControls(table) {
  const viewer = table.viewer || {};
  const canControlTestBot = DEV_MODE && viewer.canControlTestBot;
  botActions.hidden = !canControlTestBot;
  currentTable.classList.toggle("has-bot-actions", Boolean(canControlTestBot));
  if (!canControlTestBot) return;

  botActionLabel.textContent = `${viewer.testBotName} ходит`;
  botCallButton.textContent = viewer.testBotToCall > 0 ? `Dev call ${formatTableAmount(table, viewer.testBotToCall)}` : "Dev check";
}

function openMenu() {
  haptic("light");
  sideMenu.hidden = false;
  inviteButton.hidden = !state.currentTableId;
  closeSitOutPopover();
  closeDrawer();
  updateTelegramBackButton();
}

function closeMenu() {
  sideMenu.hidden = true;
  updateTelegramBackButton();
}

async function inviteToTable() {
  if (!state.currentTableId) return;

  const table = state.currentTable;
  const blindText = table ? `${table.smallBlind}/${table.bigBlind}` : "";
  const inviteLink = tableInviteLink(state.currentTableId);
  const shareText = `QWZ Poker: стол ${blindText}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

  haptic("light");
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
    return;
  }

  try {
    await navigator.clipboard.writeText(inviteLink);
    showStatus("Ссылка на стол скопирована");
  } catch {
    window.prompt("Ссылка на стол", inviteLink);
  }
}

function tableInviteLink(tableId) {
  return `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(tableId)}`;
}

function openSitOutPopover() {
  haptic("light");
  closeMenu();
  sitOutInfoText.hidden = true;
  sitOutPopover.hidden = false;
  updateTelegramBackButton();
}

function closeSitOutPopover() {
  sitOutPopover.hidden = true;
  sitOutInfoText.hidden = true;
  updateTelegramBackButton();
}

function openDrawer(tab = "log") {
  haptic("light");
  infoDrawer.hidden = false;
  closeMenu();
  if (state.currentTable) {
    renderActionLog(state.currentTable.actionLog || []);
    renderTableInfo(state.currentTable);
    renderStats(state.currentTable);
  }
  switchDrawerTab(tab);
  updateTelegramBackButton();
}

function closeDrawer() {
  infoDrawer.hidden = true;
  updateTelegramBackButton();
}

function switchDrawerTab(tab) {
  for (const [key, page] of Object.entries(drawerPages)) {
    page.hidden = key !== tab;
  }

  document.querySelectorAll("[data-drawer-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.drawerTab === tab);
  });
}

function renderBettingActions(table) {
  const viewer = table.viewer || {};
  bettingActions.hidden = !viewer.canAct;
  currentTable.classList.toggle("has-actions", Boolean(viewer.canAct));
  if (!viewer.canAct) {
    closeAmountPanel();
    return;
  }

  const fold = bettingActions.querySelector('[data-poker-action="fold"]');
  const check = bettingActions.querySelector('[data-poker-action="check"]');
  const call = bettingActions.querySelector('[data-poker-action="call"]');
  const bet = bettingActions.querySelector('[data-poker-action="bet"]');
  const raise = bettingActions.querySelector('[data-poker-action="raise"]');

  fold.textContent = "Фолд";
  check.textContent = "Чек";
  check.hidden = !viewer.canCheck;
  call.hidden = !viewer.canCall;
  bet.hidden = !viewer.canBet;
  raise.hidden = viewer.canBet;
  call.replaceChildren("Колл ");
  renderTableValue(call, table, viewer.toCall, { append: true });
  bet.textContent = "Ставка";
  raise.textContent = "Рейз";
  amountLabel.textContent = viewer.canBet ? "Ставка" : "Рейз";
  raise.disabled = !viewer.canRaise;
  fold.disabled = false;
  const minAmount = viewer.canBet ? viewer.bigBlind || viewer.minRaise || 1 : viewer.minRaise || 1;
  const maxAmount = Math.max(minAmount, viewer.stack || minAmount);
  const context = [
    table.id,
    table.handNumber,
    table.status,
    table.activeSeatIndex,
    table.currentBet,
    viewer.canBet ? "bet" : "raise"
  ].join(":");

  actionAmount.dataset.min = String(minAmount);
  actionAmount.dataset.max = String(maxAmount);
  actionAmount.dataset.bigBlind = String(viewer.bigBlind || minAmount);
  betSlider.min = String(minAmount);
  betSlider.max = String(maxAmount);
  updateAmountPanel(viewer.canBet ? "bet" : "raise");

  if (context !== actionAmountContext) {
    actionAmountContext = context;
    setActionAmount(minAmount);
    tryQueuedPreAction(table, viewer);
    return;
  }

  const currentAmount = clampAmount(Number(actionAmount.value || 0), minAmount, maxAmount);
  if (String(currentAmount) !== actionAmount.value && document.activeElement !== actionAmount) {
    setActionAmount(currentAmount);
  } else {
    betSlider.value = String(currentAmount);
  }
  tryQueuedPreAction(table, viewer);
}

function renderPreActions(table) {
  const viewer = table.viewer || {};
  const isHandActive = ["preflop", "flop", "turn", "river"].includes(table.status);
  const show = Boolean(
    viewer.isSeated
      && !viewer.canAct
      && !viewer.canControlTestBot
      && !viewer.sittingOut
      && isHandActive
  );
  preActions.hidden = !show;
  currentTable.classList.toggle("has-pre-actions", show);
  preActions.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.preAction === queuedPreAction);
  });
}

function renderStartOverlay(table) {
  const isStarting = table.status === "starting";
  if (!isStarting) {
    if (overlayWasVisible && !startOverlay.hidden) {
      overlayWasVisible = false;
      startOverlay.classList.add("fading");
      clearTimeout(overlayFadeTimer);
      overlayFadeTimer = window.setTimeout(() => {
        startOverlay.hidden = true;
        startOverlay.classList.remove("fading");
      }, 520);
    }
    return;
  }

  clearTimeout(overlayFadeTimer);
  overlayWasVisible = true;
  startOverlay.hidden = false;
  startOverlay.classList.remove("fading");
  const smallBlind = table.seats[table.smallBlindIndex]?.name || "SB";
  const bigBlind = table.seats[table.bigBlindIndex]?.name || "BB";
  startTitle.textContent = `Блайнды ${formatTableLimit(table)}`;
  startSubtitle.textContent = `${smallBlind}: SB · ${bigBlind}: BB`;
}

function renderActionToast(table) {
  const text = table.message || "";
  const shouldToast =
    text &&
    text !== lastToastText &&
    table.status !== "starting" &&
    (/(чек|колл|рейз|ставка|сбросил|забирает|Флоп|Терн|Ривер|авто)/i.test(text));

  if (!shouldToast) return;

  lastToastText = text;
  actionToast.hidden = false;
  actionToast.textContent = text;
  actionToast.classList.remove("show");
  void actionToast.offsetWidth;
  actionToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    actionToast.classList.remove("show");
    window.setTimeout(() => {
      actionToast.hidden = true;
    }, 220);
  }, 1200);
}

function renderStreetOverlay(table) {
  if (!streetOverlay) return;
  const overlay = streetOverlayFor(table);
  if (!overlay) return;

  const key = `${table.handNumber}:${overlay.title}:${overlay.subtitle}`;
  if (key === lastStreetOverlayKey) return;
  lastStreetOverlayKey = key;

  streetOverlay.querySelector("strong").textContent = overlay.title;
  streetOverlay.querySelector("span").textContent = overlay.subtitle;
  streetOverlay.hidden = false;
  streetOverlay.classList.remove("show");
  void streetOverlay.offsetWidth;
  streetOverlay.classList.add("show");
  clearTimeout(streetOverlayTimer);
  streetOverlayTimer = window.setTimeout(() => {
    streetOverlay.classList.remove("show");
    window.setTimeout(() => {
      streetOverlay.hidden = true;
    }, 260);
  }, overlay.duration);
}

function streetOverlayFor(table) {
  if (table.status === "flop" && table.communityCards.length === 3) {
    return { title: "Флоп", subtitle: table.communityCards.join(" "), duration: 760 };
  }
  if (table.status === "turn" && table.communityCards.length === 4) {
    return { title: "Терн", subtitle: table.communityCards.at(-1), duration: 700 };
  }
  if (table.status === "river" && table.communityCards.length === 5) {
    return { title: "Ривер", subtitle: table.communityCards.at(-1), duration: 700 };
  }
  if (table.status === "runout") {
    return { title: "All-in", subtitle: "Открываем карты", duration: 760 };
  }
  if (table.status === "showdown" && table.message) {
    return { title: "Шоудаун", subtitle: table.message, duration: 980 };
  }
  return null;
}

function renderActionLog(logItems, handHistory = []) {
  const historyNodes = handHistory.slice(0, 8).map(renderHandHistoryItem);
  const logNodes = logItems.slice(-10).reverse().map((item) => {
    const row = document.createElement("div");
    row.className = "log-item";
    row.textContent = item.text;
    return row;
  });
  actionLog.replaceChildren(
    ...historyNodes,
    ...logNodes
  );
}

function renderHandHistoryItem(hand) {
  const row = document.createElement("article");
  row.className = "hand-history-item";
  const mainPot = hand.pots?.[0];
  row.innerHTML = `
    <div class="hand-history-head">
      <strong></strong>
      <span></span>
    </div>
    <div class="hand-history-board"></div>
    <div class="hand-history-pots"></div>
    <div class="hand-history-players"></div>
  `;
  row.querySelector("strong").textContent = `Раздача #${hand.handNumber}`;
  row.querySelector("span").textContent = mainPot
    ? `${mainPot.winners.join(", ")} +${formatChips(mainPot.amount)}`
    : "Без банка";
  row.querySelector(".hand-history-board").replaceChildren(...renderCards(hand.board || []));
  row.querySelector(".hand-history-pots").replaceChildren(...(hand.pots || []).map((potItem) => {
    const item = document.createElement("div");
    item.textContent = `${potItem.label}: ${formatChips(potItem.amount)} · ${potItem.winners.join(", ")}`;
    return item;
  }));
  row.querySelector(".hand-history-players").replaceChildren(...(hand.seats || []).map((seat) => {
    const item = document.createElement("div");
    item.className = "hand-history-player";
    item.innerHTML = "<span></span><div></div><strong></strong>";
    item.querySelector("span").textContent = seat.name;
    item.querySelector("div").replaceChildren(...renderCards(seat.cards || []));
    item.querySelector("strong").textContent = `${seat.profit >= 0 ? "+" : ""}${formatChips(seat.profit)}`;
    item.querySelector("strong").className = seat.profit >= 0 ? "positive" : "negative";
    return item;
  }));
  return row;
}

function renderTableInfo(table) {
  const inviteLink = tableInviteLink(table.id);
  const inviteCard = document.createElement("div");
  inviteCard.className = "table-invite-card";
  inviteCard.innerHTML = `
    <div>
      <span>Приглашение</span>
      <strong>Отправить ссылку друзьям</strong>
      <small></small>
    </div>
    <button type="button">Поделиться</button>
  `;
  inviteCard.querySelector("small").textContent = inviteLink;
  inviteCard.querySelector("button").addEventListener("click", inviteToTable);

  const rows = [
    ["Название стола", table.name],
    ["Тип игры", "Texas Hold'em"],
    ["Тип банка", "Безлимитный"],
    ["Ставки стола", formatTableLimit(table)],
    ["Игроки", `${table.seats.length}/${table.maxPlayers}`],
    ["Время на ход", "20 c."],
    ["Раздача", `#${table.handNumber || 0}`]
  ];

  tableInfo.replaceChildren(
    inviteCard,
    ...rows.map(([label, value]) => {
      const row = document.createElement("div");
      row.className = "info-row";
      row.innerHTML = `<span></span><strong></strong>`;
      row.querySelector("span").textContent = label;
      row.querySelector("strong").textContent = value;
      return row;
    })
  );
}

function renderStats(table) {
  const initialStack = 10000;
  statsTable.replaceChildren(
    headerRow(["Игроки", "Бай-ин", "Выигрыш"]),
    ...table.seats.map((seat) => {
      const profit = seat.stack - initialStack;
      const row = document.createElement("div");
      row.className = "stats-row";
      row.innerHTML = `<span></span><span></span><strong></strong>`;
      row.children[0].textContent = seat.name;
      row.children[1].textContent = formatChips(initialStack);
      row.children[2].textContent = `${profit >= 0 ? "+" : ""}${formatChips(profit)}`;
      row.children[2].className = profit >= 0 ? "positive" : "negative";
      return row;
    })
  );
}

function isWinningSeat(table, seat) {
  return table.status === "showdown" && table.message.includes(`${seat.name} забирает`);
}

function chipSize(amount, bigBlind = 50) {
  if (!amount) return "none";
  const ratio = amount / Math.max(1, bigBlind);
  if (ratio >= 12) return "huge";
  if (ratio >= 6) return "large";
  if (ratio >= 2) return "medium";
  return "small";
}

function chipTheme(amount, bigBlind = 50) {
  if (!amount) return "black";
  const ratio = amount / Math.max(1, bigBlind);
  if (ratio >= 12) return "blue";
  if (ratio >= 6) return "red";
  if (ratio >= 2) return "green";
  return "black";
}

function shouldAnimateBetCollection(table) {
  const hadBetsOnTable = [...previousSeatBets.values()].some((amount) => Number(amount) > 0);
  if (!hadBetsOnTable) return false;
  if (!table.seats.every((seat) => Number(seat.bet || 0) === 0)) return false;
  return ["flop", "turn", "river", "runout"].includes(table.status);
}

function animateBetStacksToPot() {
  const board = document.querySelector(".board");
  if (!board || !potChips) return;
  const potRect = potChips.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  const targetX = potRect.left + potRect.width / 2 - boardRect.left;
  const targetY = potRect.top + potRect.height / 2 - boardRect.top;
  const spots = [...board.querySelectorAll('.seat:not([data-bet=""]) .bet-spot')];

  spots.forEach((spot, spotIndex) => {
    const seat = spot.closest(".seat");
    const rect = spot.getBoundingClientRect();
    const fromX = rect.left + rect.width / 2 - boardRect.left;
    const fromY = rect.top + rect.height / 2 - boardRect.top;
    const stack = spot.querySelector(".chip-stack");
    const theme = seat?.dataset.chipTheme || "black";
    if (!stack) return;

    const collectStack = stack.cloneNode(true);
    const side = fromX < targetX ? -1 : 1;
    const midX = fromX + (targetX - fromX) * 0.54 + side * (18 + spotIndex * 2);
    const midY = Math.min(fromY, targetY) - 34 - spotIndex * 4;

    collectStack.className = "chip-stack chip-collect";
    collectStack.dataset.chipTheme = theme;
    collectStack.style.setProperty("--from-x", `${fromX}px`);
    collectStack.style.setProperty("--from-y", `${fromY}px`);
    collectStack.style.setProperty("--mid-x", `${midX}px`);
    collectStack.style.setProperty("--mid-y", `${midY}px`);
    collectStack.style.setProperty("--to-x", `${targetX + side * 4}px`);
    collectStack.style.setProperty("--to-y", `${targetY}px`);
    collectStack.style.setProperty("--delay", `${spotIndex * 90}ms`);
    collectStack.style.setProperty("--rot-from", `${side * -8}deg`);
    collectStack.style.setProperty("--rot-mid", `${side * 6}deg`);
    collectStack.style.setProperty("--rot-to", `${side * 10}deg`);

    spot.classList.add("collecting");
    board.append(collectStack);
    window.setTimeout(() => collectStack.remove(), 1050 + spotIndex * 90);
    window.setTimeout(() => spot.classList.remove("collecting"), 520);
  });

  restartAnimation(potChips, "collect-pop");
}

function timerProgress(table) {
  const remaining = Math.max(0, table.actionDeadline - table.now);
  return Math.max(0, Math.min(100, Math.round((remaining / 20000) * 100)));
}

function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function headerRow(labels) {
  const row = document.createElement("div");
  row.className = "stats-row stats-head";
  row.replaceChildren(...labels.map((label) => {
    const cell = document.createElement("span");
    cell.textContent = label;
    return cell;
  }));
  return row;
}

function formatChips(value) {
  return Number(value).toLocaleString("ru-RU");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function formatUsdt(value) {
  return (Number(value || 0) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatModeAmount(value, cashMode) {
  return cashMode ? `${formatUsdt(value)} USDT` : `${formatChips(value)} фишек`;
}

function formatGameAmount(value) {
  return formatModeAmount(value, state.gameMode === "cash");
}

function formatGameLimit(smallBlind, bigBlind, cashMode = state.gameMode === "cash") {
  return cashMode
    ? `${formatUsdt(smallBlind)}/${formatUsdt(bigBlind)} USDT`
    : `${formatChips(smallBlind)}/${formatChips(bigBlind)}`;
}

function formatLimit(limit) {
  return formatGameLimit(limit.smallBlind, limit.bigBlind, state.gameMode === "cash");
}

function formatTableLimit(table) {
  return formatGameLimit(table.smallBlind, table.bigBlind, table.gameMode === "cash");
}

function formatTableAmount(table, value) {
  return formatModeAmount(value, table?.gameMode === "cash");
}

function createTetherMark() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.classList.add("tether-mark");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-label", "USDT");
  svg.innerHTML = '<circle cx="12" cy="12" r="12"/><path d="M13.55 10.18V8.56h3.8V6H6.65v2.56h3.8v1.62C7.36 10.34 5 10.96 5 11.71c0 .75 2.36 1.37 5.45 1.53V18h3.1v-4.76c3.09-.16 5.45-.78 5.45-1.53 0-.75-2.36-1.37-5.45-1.53Zm0 2.07v-.01c-.49.03-1 .04-1.55.04s-1.06-.01-1.55-.04v.01c-2.21-.12-3.87-.51-3.87-.98 0-.39 1.18-.73 2.91-.9v.86c.78.07 1.63.11 2.51.11.88 0 1.73-.04 2.51-.11v-.86c1.73.17 2.91.51 2.91.9 0 .47-1.66.86-3.87.98Z"/>';
  return svg;
}

function renderMoneyValue(node, value, cashMode, { append = false } = {}) {
  if (!node) return;
  const contents = cashMode
    ? [formatUsdt(value), " ", createTetherMark()]
    : [`${formatChips(value)} фишек`];
  if (append) node.append(...contents);
  else node.replaceChildren(...contents);
}

function renderLimitValue(node, smallBlind, bigBlind, cashMode, { append = false } = {}) {
  if (!node) return;
  const contents = cashMode
    ? [`$${formatUsdt(smallBlind)}/$${formatUsdt(bigBlind)}`]
    : [`${formatChips(smallBlind)}/${formatChips(bigBlind)}`];
  if (append) node.append(...contents);
  else node.replaceChildren(...contents);
}

function renderHomeOfferMeta(limit, value, kind, cashMode) {
  if (!homeOfferMeta) return;
  if (!cashMode) {
    const descriptor = kind === "entry" ? "вход от" : "баланс";
    homeOfferMeta.textContent = `${formatLimit(limit)} · игровые фишки · ${descriptor} ${formatGameAmount(value)}`;
    return;
  }
  renderLimitValue(homeOfferMeta, limit.smallBlind, limit.bigBlind, true);
  homeOfferMeta.append(kind === "entry" ? " · cash · вход от " : " · cash · баланс ");
  renderMoneyValue(homeOfferMeta, value, true, { append: true });
}

function renderTableValue(node, table, value, { append = false } = {}) {
  if (!node) return;
  const contents = table?.gameMode === "cash"
    ? [formatUsdt(value), " ", createTetherMark()]
    : [formatChips(value)];
  if (append) node.append(...contents);
  else node.replaceChildren(...contents);
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const rest = safeSeconds % 60;
  if (hours) return `${hours}ч ${minutes}м`;
  if (minutes) return `${minutes}м ${rest}с`;
  return `${rest}с`;
}

function statusLabel(status) {
  const labels = {
    registering: "регистрация",
    planned: "скоро",
    running: "идёт",
    finished: "завершён"
  };
  return labels[status] || status || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function initials(name) {
  return String(name || "P").trim().slice(0, 1).toUpperCase();
}

function renderAvatar(node, user = {}) {
  if (!node) return;
  if (user.photoUrl) {
    node.textContent = "";
    node.style.backgroundImage = `url("${user.photoUrl}")`;
    node.classList.add("has-photo");
    return;
  }
  node.style.backgroundImage = "";
  node.classList.remove("has-photo");
  node.textContent = initials(user.name);
}

function onBetPreset(event) {
  const button = event.target.closest("button[data-bet-preset]");
  if (!button) return;

  const minAmount = Number(actionAmount.dataset.min || 1);
  const maxAmount = Number(actionAmount.dataset.max || minAmount);
  const potAmount = Number(pot.dataset.amount || 0);
  const preset = button.dataset.betPreset;
  const amount = {
    min: minAmount,
    half: Math.round(potAmount * 0.5),
    pot: potAmount,
    max: maxAmount
  }[preset];

  setActionAmount(clampAmount(amount, minAmount, maxAmount));
}

function onPreAction(event) {
  const button = event.target.closest("button[data-pre-action]");
  if (!button) return;

  const wasSelected = button.classList.contains("selected");
  preActions.querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
  queuedPreAction = wasSelected ? "" : button.dataset.preAction;
  queuedPreActionKey = "";
  if (!wasSelected) button.classList.add("selected");
}

function onTableBackdropClick(event) {
  if (!sitOutPopover.hidden && !event.target.closest(".sitout-popover") && !event.target.closest("#quickSitOutButton")) {
    closeSitOutPopover();
  }
  if (!pendingBetAction) return;
  if (event.target.closest(".betting-actions")) return;
  closeAmountPanel();
}

function tryQueuedPreAction(table, viewer) {
  if (!queuedPreAction || !viewer.canAct || !state.currentTableId) return;

  const key = [
    table.id,
    table.handNumber,
    table.status,
    table.activeSeatIndex,
    table.currentBet,
    queuedPreAction
  ].join(":");
  if (key === queuedPreActionKey) return;

  const action = resolveQueuedAction(queuedPreAction, viewer);
  if (!action) return;

  queuedPreActionKey = key;
  queuedPreAction = "";
  window.setTimeout(() => submitPokerAction(action), 80);
}

function resolveQueuedAction(preAction, viewer) {
  if (preAction === "check-fold") return viewer.canCheck ? "check" : "fold";
  if (preAction === "check") return viewer.canCheck ? "check" : "";
  if (preAction === "call-any") {
    if (viewer.canCall) return "call";
    if (viewer.canCheck) return "check";
  }
  return "";
}

function syncSliderFromAmount() {
  const minAmount = Number(actionAmount.dataset.min || 1);
  const maxAmount = Number(actionAmount.dataset.max || minAmount);
  betSlider.value = String(clampAmount(Number(actionAmount.value || 0), minAmount, maxAmount));
  updateConfirmAmount();
}

function syncAmountFromSlider() {
  setActionAmount(Number(betSlider.value || 0));
}

function setActionAmount(amount) {
  const minAmount = Number(actionAmount.dataset.min || 1);
  const maxAmount = Number(actionAmount.dataset.max || minAmount);
  const safeAmount = clampAmount(amount, minAmount, maxAmount);
  actionAmount.value = String(safeAmount);
  betSlider.value = String(safeAmount);
  updateConfirmAmount();
}

function openAmountPanel(action) {
  pendingBetAction = action;
  bettingActions.classList.add("amount-open");
  updateAmountPanel(action);
}

function closeAmountPanel() {
  pendingBetAction = "";
  bettingActions.classList.remove("amount-open");
}

function updateAmountPanel(action) {
  const label = action === "bet" ? "Ставка" : "Рейз";
  amountLabel.textContent = label;
  confirmBetButton.firstChild.textContent = "Подтвердить";
  updateConfirmAmount();
}

function updateConfirmAmount() {
  confirmBetButton.querySelector("span").textContent = state.currentTable
    ? formatTableAmount(state.currentTable, Number(actionAmount.value || 0))
    : formatChips(Number(actionAmount.value || 0));
}

function clampAmount(amount, min, max) {
  if (!Number.isFinite(amount)) return min;
  return Math.max(min, Math.min(max, Math.round(amount)));
}

function enterGameMode() {
  lobby.hidden = true;
  document.body.classList.add("in-game");
  updateTelegramBackButton();
}

function formatStatus(table) {
  const fallback = {
    waiting: "Ожидание игроков",
    preflop: "Префлоп",
    flop: "Флоп",
    turn: "Терн",
    river: "Ривер",
    runout: "All-in",
    showdown: "Шоудаун"
  }[table.status] || table.status;

  const base = table.message || fallback;
  if (!table.actionDeadline || table.activeSeatIndex < 0) return base;

  const secondsLeft = Math.max(0, Math.ceil((table.actionDeadline - table.now) / 1000));
  return `${base} · ${secondsLeft} сек`;
}

function maybePromptRebuy(table) {
  const viewer = table.viewer || {};
  const key = `${table.id}:${table.handNumber}:${viewer.stack}:${viewer.sittingOutReason}`;
  if (!viewer.needsRebuy || !viewer.balance || rebuyPromptKey === key) return;
  rebuyPromptKey = key;
  window.setTimeout(() => runAction(buyIn), 50);
}

function sittingOutLabel(seat) {
  if (seat.sittingOutReason === "rebuy") return "Re-buy";
  if (seat.sittingOutSecondsLeft > 0) return `Away ${seat.sittingOutSecondsLeft}s`;
  return "Away";
}

function renderCards(cards, options = {}) {
  if (!cards.length) {
    return [];
  }

  return cards.map((card, index) => {
    const node = document.createElement("span");
    node.className = [
      "card",
      card === "hidden" ? "hidden" : "",
      card !== "hidden" && isRed(card) ? "red" : "",
      options.animate ? "dealt" : ""
    ].filter(Boolean).join(" ");
    if (options.animate) node.style.animationDelay = `${index * 70}ms`;
    if (card === "hidden") {
      node.textContent = "";
    } else {
      const rank = document.createElement("span");
      const suit = document.createElement("span");
      rank.className = "card-rank";
      suit.className = "card-suit";
      rank.textContent = prettyRank(card);
      suit.textContent = prettySuit(card);
      node.replaceChildren(rank, suit);
    }
    return node;
  });
}

function renderCommunityCards(cards, options = {}) {
  return Array.from({ length: 5 }, (_, index) => {
    const slot = document.createElement("span");
    const card = cards[index];
    slot.className = `board-card-slot${card ? " filled" : ""}`;
    slot.setAttribute("aria-hidden", card ? "false" : "true");
    if (card) {
      slot.replaceChildren(...renderCards([card], {
        animate: options.animate
      }));
    }
    return slot;
  });
}

function prettyRank(card) {
  return card[0].replace("T", "10");
}

function prettySuit(card) {
  return { s: "♠", h: "♥", d: "♦", c: "♣" }[card[1]] || "";
}

function isRed(card) {
  return card.endsWith("h") || card.endsWith("d");
}

async function api(path, options = {}) {
  const headers = {
    "content-type": "application/json"
  };

  if (options.auth !== false && state.token) {
    headers.authorization = `Bearer ${state.token}`;
  }
  if (options.idempotencyKey) {
    headers["x-idempotency-key"] = options.idempotencyKey;
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function requestKey(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}:${window.crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${cryptoRandomHex(12)}`;
}

function cryptoRandomHex(bytes = 16) {
  const array = new Uint8Array(bytes);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let index = 0; index < array.length; index += 1) {
      array[index] = (Date.now() + index * 17) % 256;
    }
  }
  return [...array].map((value) => value.toString(16).padStart(2, "0")).join("");
}
