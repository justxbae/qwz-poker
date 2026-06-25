const tg = window.Telegram?.WebApp;
const BOT_USERNAME = "qwzpokerbot";
const params = new URLSearchParams(window.location.search);
const DEV_MODE = params.has("dev1")
  || params.get("dev") === "1";
const ADMIN_MODE = params.get("admin") === "1" || window.location.pathname === "/admin";
let MINIMAL_LAUNCH = params.get("minimal") === "1";
const ADMIN_SECRET_STORAGE_KEY = "qwzAdminWebSecret";
const adminHashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
if (ADMIN_MODE && (params.has("key") || adminHashParams.has("key"))) {
  window.localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, params.get("key") || adminHashParams.get("key") || "");
  window.history.replaceState({}, "", "/admin");
}
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}
window.scrollTo({ top: 0, left: 0 });
document.documentElement.classList.toggle("dev-mode", DEV_MODE);
document.documentElement.classList.toggle("admin-mode", ADMIN_MODE);
document.documentElement.classList.toggle("minimal-launch", MINIMAL_LAUNCH);
const state = {
  token: "",
  user: null,
  currentTableId: "",
  currentTable: null,
  config: null,
  progression: null,
  dailyPlayClaim: null,
  homeStats: null,
  tournamentHistory: [],
  selectedTournamentId: "",
  selectedTournamentDetails: null,
  adminTournaments: [],
  adminRewardTournaments: [],
  selectedAdminTournamentId: "",
  gameMode: "cash",
  selectedSmallBlind: 25,
  tables: [],
  tournaments: []
};
let tableEventAbortController = null;
let tableEventStreamId = "";
let tableEventLastId = "";
let tableEventRefreshQueued = false;
let tableEventReconnectTimer = 0;
let tableEventProcessing = false;
let tableEventEverConnected = false;
let lastPresenceHeartbeatAt = 0;
let lastTournamentRefreshAt = 0;
const cashierState = {
  deposit: null,
  selectedMethod: "stars",
  demoTopup: false,
  disabled: false,
  sheet: ""
};
let adminAnalyticsDays = Number(window.localStorage.getItem("qwzAdminAnalyticsDays") || 7);
if (![1, 7, 30].includes(adminAnalyticsDays)) adminAnalyticsDays = 7;
const cashierSheetHomes = new Map();

const profile = document.querySelector("#profile");
const appBoot = document.querySelector("#appBoot");
const appBootStatus = document.querySelector("#appBootStatus");
const appBootRetry = document.querySelector("#appBootRetry");
const lobbyAvatar = document.querySelector("#lobbyAvatar");
const lobbyName = document.querySelector("#lobbyName");
const lobbyUsername = document.querySelector("#lobbyUsername");
const lobbyBalance = document.querySelector("#lobbyBalance");
const lobbyTableStack = document.querySelector("#lobbyTableStack");
const lobbyActiveTables = document.querySelector("#lobbyActiveTables");
const lobbyRank = document.querySelector("#lobbyRank");
const homeWalletSide = document.querySelector("#homeWalletSide");
const homeWalletSideLabel = document.querySelector("#homeWalletSideLabel");
const homeWalletSideValue = document.querySelector("#homeWalletSideValue");
const homeWalletSideCurrency = document.querySelector("#homeWalletSideCurrency");
const homeWalletSideHint = document.querySelector("#homeWalletSideHint");
const homeWalletSideMeter = document.querySelector("#homeWalletSideMeter");
const homeWalletSideAction = document.querySelector("#homeWalletSideAction");
const homeActivityText = document.querySelector("#homeActivityText");
const homeSessionPill = document.querySelector("#homeSessionPill");
const homeScreenInstallButton = document.querySelector("#homeScreenInstallButton");
const homeScreenInstallStatus = document.querySelector("#homeScreenInstallStatus");
const homeOfferMeta = document.querySelector("#homeOfferMeta");
const productModeHub = document.querySelector("#productModeHub");
const homeRatingLeague = document.querySelector("#homeRatingLeague");
const homeRatingPoints = document.querySelector("#homeRatingPoints");
const homeCashClub = document.querySelector("#homeCashClub");
const ratingLeaderboardMeta = document.querySelector("#ratingLeaderboardMeta");
const ratingLeaderboardList = document.querySelector("#ratingLeaderboardList");
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
const profileName = document.querySelector("#profileName");
const profileUsername = document.querySelector("#profileUsername");
const profileBalance = document.querySelector("#profileBalance");
const profileHands = document.querySelector("#profileHands");
const profileCashTitle = document.querySelector("#profileCashTitle");
const profileCashXpLabel = document.querySelector("#profileCashXpLabel");
const profileCashProgress = document.querySelector("#profileCashProgress");
const profileCashHands = document.querySelector("#profileCashHands");
const profileRatingTitle = document.querySelector("#profileRatingTitle");
const profileRatingPoints = document.querySelector("#profileRatingPoints");
const profileRatingHands = document.querySelector("#profileRatingHands");
const profileRatingSeason = document.querySelector("#profileRatingSeason");
const profileTables = document.querySelector("#profileTables");
const profileChips = document.querySelector("#profileChips");
const profileTableStack = document.querySelector("#profileTableStack");
const profileSavedStack = document.querySelector("#profileSavedStack");
const profileStatus = document.querySelector("#profileStatus");
const profileSessionBadge = document.querySelector("#profileSessionBadge");
const profileSessionList = document.querySelector("#profileSessionList");
const profileRefreshButton = document.querySelector("#profileRefreshButton");
const profileTournamentStats = document.querySelector("#profileTournamentStats");
const profileTournamentHistory = document.querySelector("#profileTournamentHistory");
const profileTournamentSummary = document.querySelector("#profileTournamentSummary");
const adminNavButton = document.querySelector(".admin-nav-button");
const adminTournamentForm = document.querySelector("#adminTournamentForm");
const adminTournamentId = document.querySelector("#adminTournamentId");
const adminTournamentTitle = document.querySelector("#adminTournamentTitle");
const adminTournamentType = document.querySelector("#adminTournamentType");
const adminTournamentBuyIn = document.querySelector("#adminTournamentBuyIn");
const adminTournamentFee = document.querySelector("#adminTournamentFee");
const adminTournamentStartsAt = document.querySelector("#adminTournamentStartsAt");
const adminTournamentRegistrationOpen = document.querySelector("#adminTournamentRegistrationOpen");
const adminTournamentLateRegMinutes = document.querySelector("#adminTournamentLateRegMinutes");
const adminTournamentMaxPlayers = document.querySelector("#adminTournamentMaxPlayers");
const adminTournamentMinPlayers = document.querySelector("#adminTournamentMinPlayers");
const adminTournamentBlindStructure = document.querySelector("#adminTournamentBlindStructure");
const adminTournamentPayoutStructure = document.querySelector("#adminTournamentPayoutStructure");
const adminTournamentReEntryLimit = document.querySelector("#adminTournamentReEntryLimit");
const adminTournamentAddOnAllowed = document.querySelector("#adminTournamentAddOnAllowed");
const adminTournamentDescription = document.querySelector("#adminTournamentDescription");
const adminTournamentStatusInput = document.querySelector("#adminTournamentStatus");
const adminTournamentSubmit = document.querySelector("#adminTournamentSubmit");
const adminTournamentReset = document.querySelector("#adminTournamentReset");
const adminTournamentUiStatus = document.querySelector("#adminTournamentStatus");
const adminTournamentFormMeta = document.querySelector("#adminTournamentFormMeta");
const adminTournamentCount = document.querySelector("#adminTournamentCount");
const adminRewardTournamentCount = document.querySelector("#adminRewardTournamentCount");
const adminTournamentList = document.querySelector("#adminTournamentList");
const adminRewardTournamentList = document.querySelector("#adminRewardTournamentList");
const adminRefreshButton = document.querySelector("#adminRefreshButton");
const adminOperationalStatus = document.querySelector("#adminOperationalStatus");
const adminBankrollTotal = document.querySelector("#adminBankrollTotal");
const adminSummary = document.querySelector("#adminSummary");
const adminHealthStrip = document.querySelector("#adminHealthStrip");
const adminLookupForm = document.querySelector("#adminLookupForm");
const adminUserId = document.querySelector("#adminUserId");
const adminUsersCount = document.querySelector("#adminUsersCount");
const adminUsersList = document.querySelector("#adminUsersList");
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
const adminRiskSignals = document.querySelector("#adminRiskSignals");
const adminSettingsList = document.querySelector("#adminSettingsList");
const tournamentList = document.querySelector("#tournamentList");
const tournamentStatus = document.querySelector("#tournamentStatus");
const tournamentHistoryList = document.querySelector("#tournamentHistoryList");
const tournamentHistoryMeta = document.querySelector("#tournamentHistoryMeta");
const tournamentDetailBackdrop = document.querySelector("#tournamentDetailBackdrop");
const tournamentDetailSheet = document.querySelector("#tournamentDetailSheet");
const tournamentDetailClose = document.querySelector("#tournamentDetailClose");
const tournamentDetailSecondary = document.querySelector("#tournamentDetailSecondary");
const tournamentDetailTitle = document.querySelector("#tournamentDetailTitle");
const tournamentDetailBadge = document.querySelector("#tournamentDetailBadge");
const tournamentDetailSubtitle = document.querySelector("#tournamentDetailSubtitle");
const tournamentDetailDescription = document.querySelector("#tournamentDetailDescription");
const tournamentDetailSummary = document.querySelector("#tournamentDetailSummary");
const tournamentDetailCountdown = document.querySelector("#tournamentDetailCountdown");
const tournamentDetailStart = document.querySelector("#tournamentDetailStart");
const tournamentDetailPayout = document.querySelector("#tournamentDetailPayout");
const tournamentDetailGrid = document.querySelector("#tournamentDetailGrid");
const tournamentDetailStructure = document.querySelector("#tournamentDetailStructure");
const tournamentDetailNote = document.querySelector("#tournamentDetailNote");
const tournamentDetailAction = document.querySelector("#tournamentDetailAction");
const tournamentRegistrationNotice = document.querySelector("#tournamentRegistrationNotice");
const tournamentRegistrationTitle = document.querySelector("#tournamentRegistrationTitle");
const tournamentRegistrationMeta = document.querySelector("#tournamentRegistrationMeta");
const tournamentRegistrationBadge = document.querySelector("#tournamentRegistrationBadge");
const tournamentDetailHome = tournamentDetailSheet && tournamentDetailBackdrop ? {
  sheetParent: tournamentDetailSheet.parentNode,
  sheetNextSibling: tournamentDetailSheet.nextSibling,
  backdropParent: tournamentDetailBackdrop.parentNode,
  backdropNextSibling: tournamentDetailBackdrop.nextSibling
} : null;
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
const viewerHandBadge = document.querySelector("#viewerHandBadge");
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
const lobbyMenuButton = document.querySelector("#lobbyMenuButton");
const lobbyMenuSheet = document.querySelector("#lobbyMenuSheet");
const lobbyMenuBackdrop = document.querySelector("#lobbyMenuBackdrop");
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
  hands: document.querySelector("#drawerHands"),
  stats: document.querySelector("#drawerStats"),
  waitlist: document.querySelector("#drawerWaitlist")
};
const pokerHandsGuide = document.querySelector("#pokerHandsGuide");
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
let viewerActionHapticKey = "";
let showdownPayoutKey = "";
let rebuyPromptKey = "";
let queuedPreAction = "";
let queuedPreActionKey = "";
let pendingBetAction = "";
let pendingBuyIn = null;
let pendingDailyPlayClaim = false;
const pendingTournamentRequests = new Set();
const pendingAdminTournamentRequests = new Set();
const tableEventQueue = [];
const tableEventLastSequence = new Map();
const tournamentEventLastSequence = new Map();
let currentLobbyTab = "home";
let fairnessSeedSyncing = false;
let tournamentCountdownTimer = 0;
let tournamentRegistrationNoticeTimer = 0;
const fairnessSeedSyncedTables = new Set();
let revealObserver = null;

boot().then(completeBoot).catch(showBootError);

async function boot() {
  resetScroll();
  setupTapGuards();
  setupScrollDynamics();
  setupLobbyOverscroll();
  tg?.expand();
  setupTelegramControls();
  renderPokerHandsGuide();

  await auth();
  await loadConfig();
  await loadTables();
  await loadProfile();
  if (!MINIMAL_LAUNCH || ADMIN_MODE) await loadTournaments();
  resetAdminTournamentForm();
  setupScrollReveal();
  setupPromoCarousel();
  if (ADMIN_MODE) {
    selectLobbyTab("admin", { keepScroll: true });
  }

  const startParam = tg?.initDataUnsafe?.start_param;
  if (startParam) await joinTable(startParam);

  createTableForm.addEventListener("submit", onCreateTable);
  refreshButton?.addEventListener("click", loadTables);
  profileRefreshButton?.addEventListener("click", () => runAction(loadProfile));
  cashierPrimaryButton?.addEventListener("click", () => {
    document.querySelector(".cashier-topup-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  walletTopupButton?.addEventListener("click", () => runAction(openCashierTopup));
  cashierSheetBackdrop?.addEventListener("click", closeCashierSheet);
  document.querySelectorAll("[data-cashier-sheet]").forEach((sheet) => {
    wireCashierSheetDrag(sheet);
  });
  if (tournamentDetailSheet) wireCashierSheetDrag(tournamentDetailSheet, closeTournamentDetails);
  if (lobbyMenuSheet) wireCashierSheetDrag(lobbyMenuSheet, closeLobbyMenu);
  cashierSheetCloseButtons.forEach((button) => {
    button.addEventListener("click", closeCashierSheet);
  });
  cashierRubAmount?.addEventListener("input", syncCashierQuote);
  cashierPresets?.addEventListener("click", onCashierPresetClick);
  cashierMethods?.addEventListener("click", onCashierMethodClick);
  cashierPayButton?.addEventListener("click", () => runAction(payCashierAmount));
  tournamentList?.addEventListener("click", onTournamentAction);
  tournamentDetailBackdrop?.addEventListener("click", closeTournamentDetails);
  tournamentDetailClose?.addEventListener("click", closeTournamentDetails);
  tournamentDetailSecondary?.addEventListener("click", closeTournamentDetails);
  tournamentDetailAction?.addEventListener("click", onTournamentDetailAction);
  tournamentDetailSheet?.addEventListener("click", onTournamentDetailTabSelect);
  document.querySelector(".home-tools")?.addEventListener("click", onGameFormatSelect);
  quickPlayButton.addEventListener("click", () => runAction(quickPlay));
  quickPrivateButton?.addEventListener("click", () => runAction(quickCreatePrivateTable));
  homeWalletSideAction?.addEventListener("click", () => runAction(claimDailyPlayBonus));
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
  adminTournamentForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(saveAdminTournament);
  });
  adminTournamentReset?.addEventListener("click", resetAdminTournamentForm);
  adminRecentPayments?.addEventListener("click", onAdminPaymentAction);
  adminRecentWithdrawals?.addEventListener("click", onAdminWithdrawalAction);
  adminTournamentList?.addEventListener("click", onAdminTournamentAction);
  adminRewardTournamentList?.addEventListener("click", onAdminRewardTournamentAction);
  adminPaymentFilter?.addEventListener("change", () => runAction(loadAdminDashboard));
  adminRefreshButton?.addEventListener("click", () => runAction(loadAdminDashboard));
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => selectAdminPanel(button.dataset.adminTab));
  });
  limitPills.addEventListener("click", onLimitSelect);
  tableLimitPills.addEventListener("click", onLimitSelect);
  gameModeSwitch?.addEventListener("click", onGameModeSelect);
  productModeHub?.addEventListener("click", onGameFormatSelect);
  document.querySelectorAll("[data-lobby-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.lobbyTab === "cashier" && button.dataset.cashierSection) {
        runAction(() => openCashierSection(button.dataset.cashierSection));
        return;
      }
      selectLobbyTab(button.dataset.lobbyTab);
    });
  });
  lobbyMenuButton?.addEventListener("click", openLobbyMenu);
  lobbyMenuBackdrop?.addEventListener("click", closeLobbyMenu);
  lobbyMenuSheet?.addEventListener("click", onLobbyMenuAction);
  if (DEV_MODE) {
    addTestPlayerButton.addEventListener("click", () => runAction(addTestPlayer));
    autoActButton.addEventListener("click", () => runAction(autoAct));
    botFoldButton.addEventListener("click", () => runAction(() => testBotAct("fold")));
    botCallButton.addEventListener("click", () => runAction(() => testBotAct("call")));
  }
  standButton.addEventListener("click", () => runAction(leaveCurrentTable));
  sitOutButton.addEventListener("click", () => runAction(sitOut));
  quickSitOutButton.addEventListener("click", () => runAction(sitOut));
  confirmSitOutButton.addEventListener("click", () => runAction(sitOut));
  sitOutInfoButton.addEventListener("click", () => {
    sitOutInfoText.hidden = !sitOutInfoText.hidden;
  });
  buyInButton.addEventListener("click", () => runAction(buyIn));
  inviteButton.addEventListener("click", inviteToTable);
  quickBuyInButton.addEventListener("click", () => runAction(buyIn));
  backToLobbyButton.addEventListener("click", () => runAction(backToLobbyFromTable));
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
      if (state.currentTableId && !tableEventStreamId) {
        await loadCurrentTable();
      }
      if (state.currentTableId && Date.now() - lastPresenceHeartbeatAt >= 5_000) {
        lastPresenceHeartbeatAt = Date.now();
        await api(`/api/tables/${state.currentTableId}/presence`, { method: "POST" });
      }
      if (!state.currentTableId) await loadTables();
      if (!MINIMAL_LAUNCH && !state.currentTableId && currentLobbyTab === "tournaments" && Date.now() - lastTournamentRefreshAt >= 5_000) {
        lastTournamentRefreshAt = Date.now();
        await loadTournaments({ silent: true });
      }
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

  window.setInterval(tickDailyPlayClaim, 1000);
}

function completeBoot() {
  window.requestAnimationFrame(() => {
    document.documentElement.classList.remove("app-loading");
    document.documentElement.classList.add("app-ready");
    tg?.ready();
  });
}

function showBootError(error) {
  console.error("App boot failed:", error);
  if (appBootStatus) appBootStatus.textContent = "Не удалось загрузить приложение";
  if (appBootRetry) appBootRetry.hidden = false;
  appBoot?.classList.add("has-error");
  tg?.ready();
}

async function auth() {
  const body = {
    initData: tg?.initData || "",
    platform: tg?.platform || "",
    colorScheme: tg?.colorScheme || ""
  };
  if (ADMIN_MODE) {
    body.adminSecret = adminWebSecret();
  }

  const data = await api("/api/auth", {
    method: "POST",
    body,
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
  profileName.textContent = data.user.name;
  profileUsername.textContent = data.user.username ? `@${data.user.username}` : `id ${data.user.id}`;
  profileBalance.textContent = state.gameMode === "cash"
    ? `${formatUsdtDisplay(data.user.cashBalanceMicros || 0)} USDT`
    : `${data.user.balance.toLocaleString("ru-RU")} фишек`;
  profileChips.textContent = data.user.balance.toLocaleString("ru-RU");
  renderHomeCta();
}

function adminWebSecret() {
  if (!ADMIN_MODE) return "";
  let secret = window.localStorage.getItem(ADMIN_SECRET_STORAGE_KEY) || "";
  if (!secret) {
    secret = window.prompt("Введите ADMIN_WEB_SECRET для входа в админку") || "";
    if (secret) window.localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, secret);
  }
  return secret;
}

async function loadConfig() {
  state.config = await api("/api/config", { auth: false });
  MINIMAL_LAUNCH = Boolean(state.config?.minimalLaunch || MINIMAL_LAUNCH);
  document.documentElement.classList.toggle("minimal-launch", MINIMAL_LAUNCH);
  applyMinimalLaunchMode();
  const cashButton = gameModeSwitch?.querySelector('[data-game-mode="cash"]');
  if (cashButton) {
    cashButton.disabled = false;
    cashButton.title = state.config.realMoneyEnabled
      ? ""
      : "USDT-игра доступна только если сервер запущен с REAL_MONEY_ENABLED=true";
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

function applyMinimalLaunchMode() {
  if (!MINIMAL_LAUNCH) return;
  document.querySelectorAll('[data-lobby-tab="tournaments"]').forEach((node) => {
    node.hidden = true;
    node.setAttribute("aria-hidden", "true");
  });
  document.querySelectorAll('[data-menu-action="affiliate"]').forEach((node) => {
    node.hidden = true;
    node.setAttribute("aria-hidden", "true");
  });
  const ratingButton = gameModeSwitch?.querySelector('[data-game-mode="play"] small');
  if (ratingButton) ratingButton.textContent = "фишки";
  const modeCopy = document.querySelector("#modeContextCopy");
  if (modeCopy) modeCopy.textContent = "Cash — USDT-столы. Рейтинг — игра на фишки без денежных операций.";
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

function onGameFormatSelect(event) {
  const actionButton = event.target.closest("[data-mode-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.modeAction;
  haptic("selection");
  if (action === "private") {
    selectLobbyTab("tables");
    document.querySelector("#createTableForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
    showStatus("Приватный стол создаётся в форме ниже: выберите лимит и количество игроков.");
    return;
  }
  if (action === "sitgo") {
    if (MINIMAL_LAUNCH) {
      showStatus("В тестовом запуске доступны cash и игра на фишки.");
      return;
    }
    selectLobbyTab("tournaments");
    document.querySelector("#sitGoPreview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showStatus("Sit&Go: быстрые столы будут открываться из турнирного раздела.");
    return;
  }
}

function currentLimits() {
  const configured = state.gameMode === "cash" ? state.config?.cash?.limits : state.config?.play?.limits;
  return configured?.length ? configured : [{ smallBlind: 25, bigBlind: 50 }];
}

function activeBalance() {
  return state.gameMode === "cash" ? Number(state.user?.cashBalanceMicros || 0) : Number(state.user?.balance || 0);
}

function getDailyPlayClaimState(profileData = null) {
  return profileData?.dailyPlayClaim || state.progression?.dailyPlayClaim || state.dailyPlayClaim || null;
}

function formatCooldown(seconds) {
  const totalSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

function setDailyPlayClaim(nextClaim) {
  if (!nextClaim) return;
  const cooldownSeconds = Math.max(0, Number(nextClaim.cooldownSeconds || 0));
  state.dailyPlayClaim = {
    ...nextClaim,
    canClaim: Boolean(nextClaim.canClaim || cooldownSeconds === 0),
    cooldownSeconds
  };
}

function tickDailyPlayClaim() {
  const claim = state.dailyPlayClaim;
  if (!claim || claim.canClaim) return;
  const availableAtMs = claim.availableAt ? new Date(claim.availableAt).getTime() : 0;
  const remainingSeconds = availableAtMs
    ? Math.max(0, Math.ceil((availableAtMs - Date.now()) / 1000))
    : Math.max(0, Number(claim.cooldownSeconds || 0) - 1);
  const canClaim = remainingSeconds === 0;
  state.dailyPlayClaim = {
    ...claim,
    canClaim,
    cooldownSeconds: remainingSeconds
  };
  renderHomeWalletSide(state.homeStats || {});
  renderHomeCta();
}

function renderModeBalance() {
  if (!lobbyBalance) return;
  const cashMode = state.gameMode === "cash";
  lobbyBalance.textContent = cashMode ? formatUsdt(activeBalance()) : formatChips(activeBalance());
  if (!lobbyBalanceCurrency) return;
  if (cashMode) {
    lobbyBalanceCurrency.replaceChildren(createTetherMark("tether-mark--hero"));
    lobbyBalanceCurrency.setAttribute("aria-label", "USDT");
  } else {
    lobbyBalanceCurrency.textContent = " фишек";
    lobbyBalanceCurrency.removeAttribute("aria-label");
  }
  renderHomeWalletSide(state.homeStats || {});
}

function renderModeContext() {
  const cashMode = state.gameMode === "cash";
  document.body.dataset.gameMode = cashMode ? "cash" : "play";
  if (modeBanner) {
    if (modeBannerKicker) modeBannerKicker.textContent = cashMode ? "USDT" : "Рейтинг";
    if (modeBannerTitle) {
      if (cashMode) modeBannerTitle.replaceChildren("Денежная игра ", createTetherMark());
      else modeBannerTitle.textContent = "Рейтинговый режим";
    }
    modeBanner.dataset.mode = cashMode ? "cash" : "play";
  }
  if (homeGamesTitle) homeGamesTitle.textContent = cashMode ? "Cash-столы" : "Рейтинговые столы";
  if (publicGamesTitle) publicGamesTitle.textContent = cashMode ? "Cash-столы" : "Рейтинговые столы";
  if (privateGamesTitle) privateGamesTitle.textContent = cashMode ? "Приватные cash-столы" : "Приватные рейтинговые столы";
  if (walletWithdrawButton) walletWithdrawButton.disabled = !cashMode;
  renderHomeWalletSide(state.homeStats || {});
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
  try {
    tg?.disableVerticalSwipes?.();
  } catch {
    // Older Telegram WebViews do not expose this API.
  }
  tg?.onEvent?.("themeChanged", applyTelegramTheme);
  setupTelegramHomeScreenInstall();
  tg?.BackButton?.onClick?.(() => {
    runAction(handleTelegramBack);
  });
}

function setupTelegramHomeScreenInstall() {
  if (!homeScreenInstallButton) return;

  const canInstall = Boolean(tg?.addToHomeScreen && tg?.checkHomeScreenStatus && telegramVersionAtLeast("8.0"));
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

function telegramVersionAtLeast(target) {
  const currentParts = String(tg?.version || "0").split(".").map((part) => Number(part) || 0);
  const targetParts = String(target || "0").split(".").map((part) => Number(part) || 0);
  const length = Math.max(currentParts.length, targetParts.length);
  for (let index = 0; index < length; index += 1) {
    const current = currentParts[index] || 0;
    const expected = targetParts[index] || 0;
    if (current > expected) return true;
    if (current < expected) return false;
  }
  return true;
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
  const fixedTheme = {
    bg: "#17212b",
    secondaryBg: "#17212b",
    surface: "#202b36",
    text: "#f4f7fb",
    hint: "#8b98a5",
    link: "#2aabee",
    button: "#2aabee",
    buttonText: "#ffffff",
  };
  document.documentElement.style.setProperty("--tg-bg", fixedTheme.bg);
  document.documentElement.style.setProperty("--tg-secondary-bg", fixedTheme.secondaryBg);
  document.documentElement.style.setProperty("--tg-surface", fixedTheme.surface);
  document.documentElement.style.setProperty("--tg-text", fixedTheme.text);
  document.documentElement.style.setProperty("--tg-hint", fixedTheme.hint);
  document.documentElement.style.setProperty("--tg-link", fixedTheme.link);
  document.documentElement.style.setProperty("--tg-button", fixedTheme.button);
  document.documentElement.style.setProperty("--tg-button-text", fixedTheme.buttonText);
  tg?.setHeaderColor?.(fixedTheme.bg);
  tg?.setBackgroundColor?.(fixedTheme.bg);
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
      scrollPromoTo(next);
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
      scrollPromoTo(items[index]);
      scheduleAuto();
    });
    return dot;
  }));

  const scrollPromoTo = (item) => {
    if (!item) return;
    promoCarousel.scrollTo({
      left: Math.max(0, item.offsetLeft - items[0].offsetLeft),
      behavior: "smooth",
    });
  };

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
  if (pendingBetAction) {
    closeAmountPanel();
    return;
  }
  if (state.selectedTournamentId) {
    closeTournamentDetails();
    return;
  }
  if (cashierState.sheet) {
    closeCashierSheet();
    return;
  }
  if (!buyInOverlay.hidden) {
    hideBuyInOverlay();
    return;
  }
  if (lobbyMenuSheet && !lobbyMenuSheet.hidden) {
    closeLobbyMenu();
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
    await backToLobbyFromTable();
    return;
  }
  if (currentLobbyTab !== "home") {
    selectLobbyTab("home");
  }
}

function updateTelegramBackButton() {
  const shouldShow = Boolean(pendingBetAction)
    || Boolean(state.selectedTournamentId)
    || !buyInOverlay.hidden
    || Boolean(cashierState.sheet)
    || Boolean(lobbyMenuSheet && !lobbyMenuSheet.hidden)
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
  if (state.user) {
    state.user.balance = Number(cashier.playBalance || 0);
    state.user.cashBalanceMicros = Number(cashier.cashBalanceMicros || 0);
    renderModeBalance();
    renderHomeCta();
  }
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
    amount.append(`${transaction.type === "credit" ? "+" : "-"}${cashMode ? formatUsdtDisplay(transaction.amount) : formatChips(transaction.amount)}`);
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
      openStarsInvoice(data.order);
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

async function openStarsInvoice(order) {
  const invoiceLink = order?.invoiceUrl || order?.invoiceLink || "";
  if (!invoiceLink) {
    showError("Не удалось создать счёт Telegram Stars");
    return;
  }

  if (tg?.openInvoice) {
    tg.openInvoice(invoiceLink, async (status) => {
      if (status === "paid") {
        cashierStatus.textContent = "Stars списаны. Ждём подтверждение сервера...";
        const confirmed = await waitForPaymentConfirmation(order);
        if (confirmed) {
          cashierStatus.textContent = "Баланс пополнен";
          showStatus(`Баланс пополнен на ${Number(order.usdtAmount || 0).toFixed(2)} USDT`);
          haptic("success");
          return;
        }
        cashierStatus.textContent = "Платёж принят Telegram, подтверждение задерживается. Не оплачивайте повторно — баланс обновится автоматически.";
        showStatus("Платёж обрабатывается. Не оплачивайте повторно.");
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

async function waitForPaymentConfirmation(order, options = {}) {
  const orderId = String(order?.id || "");
  if (!orderId) return false;
  const attempts = Math.max(1, Number(options.attempts || 20));
  const intervalMs = Math.max(250, Number(options.intervalMs || 1500));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const data = await api(`/api/cashier/payment-orders/${encodeURIComponent(orderId)}`);
      if (data.cashier) renderCashier(data.cashier);
      if (data.order?.status === "paid") {
        await loadProfile();
        return true;
      }
      if (["failed", "expired", "manual_review"].includes(data.order?.status)) return false;
    } catch (error) {
      console.warn("payment confirmation unavailable", error);
    }
    if (attempt < attempts - 1) await delay(intervalMs);
  }

  return false;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadProfile() {
  if (!state.token) return;
  const data = await api("/api/profile");
  renderProfile(data.profile);
  await loadProgression();
}

async function loadProgression() {
  if (!state.token) return;
  try {
    const data = await api("/api/progression");
    state.progression = data.progression || null;
    if (data.progression?.dailyPlayClaim) setDailyPlayClaim(data.progression.dailyPlayClaim);
    renderProgression(state.progression);
  } catch (error) {
    console.warn("progression unavailable", error);
    renderProgression(null);
  }
}

function renderProfile(profileData) {
  const user = profileData.user || {};
  const profile = profileData.profile || {};
  state.homeStats = profileData;
  state.tournamentHistory = Array.isArray(profileData.tournamentHistory) ? profileData.tournamentHistory : (state.tournamentHistory || []);
  if (profileData.dailyPlayClaim) setDailyPlayClaim(profileData.dailyPlayClaim);
  profileName.textContent = user.name || "Игрок";
  profileUsername.textContent = user.username ? `@${user.username}` : `id ${user.id || ""}`;
  const ratingLeagueText = MINIMAL_LAUNCH ? "Play chips" : (profile.ratingLeague || profile.ratingTier || "Bronze");
  const ratingPointsText = `${formatNumber(profile.ratingPoints || 1000)} RP`;
  const cashRankText = MINIMAL_LAUNCH ? "Cash" : cashLevelLabel(profile);
  if (lobbyRank) lobbyRank.textContent = cashRankText;
  profileBalance.replaceChildren(`${formatUsdtDisplay(profileData.cashBalanceMicros || 0)} `, createTetherMark(), ` · ${formatChips(profileData.balance)} фишек`);
  profileChips.textContent = formatChips(profileData.balance);
  profileTableStack.replaceChildren(`${formatUsdtDisplay(profileData.cashTableStackMicros || 0)} `, createTetherMark());
  profileSavedStack.textContent = formatChips(profileData.savedStack);
  lobbyTableStack.textContent = formatChips(profileData.tableStack);
  lobbyActiveTables.textContent = String(profileData.activeTableCount || 0);
  renderHomeWalletSide(profileData);
  homeActivityText.textContent = profileData.activeTableCount
    ? `${profileData.activeTableCount} ${plural(profileData.activeTableCount, "стол", "стола", "столов")} · ${formatChips(profileData.tableStack)} за столами`
    : "Выберите стол и начните игру.";
  if (homeSessionPill) {
    homeSessionPill.textContent = profileData.activeTableCount ? "активно" : "нет активных";
    homeSessionPill.dataset.status = profileData.activeTableCount ? "active" : "idle";
  }
  if (profileCashTitle) profileCashTitle.textContent = cashRankText;
  if (profileCashXpLabel) profileCashXpLabel.textContent = MINIMAL_LAUNCH
    ? `${formatNumber(profile.cashHandsPlayed || 0)} cash-рук`
    : `${cashLevelMeta(profile)} · рейк ${formatUsdtDisplay(profile.cashRakeContributed || 0)}`;
  if (profileCashProgress) profileCashProgress.style.width = `${Math.max(0, Math.min(100, Number(profile.cashXpProgress || 0) * 100))}%`;
  if (profileCashHands) profileCashHands.textContent = formatNumber(profile.cashHandsPlayed || 0);
  if (profileRatingTitle) profileRatingTitle.textContent = ratingLeagueText;
  if (profileRatingPoints) profileRatingPoints.textContent = ratingPointsText;
  if (profileRatingHands) profileRatingHands.textContent = formatNumber(profile.ratingHandsPlayed || 0);
  if (profileRatingSeason) profileRatingSeason.textContent = MINIMAL_LAUNCH ? "—" : (profile.ratingSeasonId || "текущий");
  profileHands.textContent = formatNumber(profileData.handsPlayed || profile.handsPlayed || 0);
  profileTables.textContent = String(profileData.activeTableCount || 0);
  profileStatus.textContent = profileData.activeTableCount ? "В игре" : "В лобби";
  profileSessionBadge.textContent = profileData.activeTableCount
    ? `${profileData.activeTableCount} ${plural(profileData.activeTableCount, "стол", "стола", "столов")}`
    : "нет";

  renderAvatar(profileAvatar, user);
  renderAvatar(lobbyAvatar, user);

  renderProfileSessions(profileData.activeTables || []);
  renderProfileTournamentStats(profileData);
}

function renderHomeWalletSide(profileData = {}) {
  if (!homeWalletSideValue || !homeWalletSideCurrency || !homeWalletSideHint) return;
  const cashMode = state.gameMode === "cash";
  const profile = profileData.profile || {};
  const dailyPlayClaim = getDailyPlayClaimState(profileData);
  const progress = Math.max(0, Math.min(1, Number(profile.cashXpProgress || 0)));

  homeWalletSideCurrency.hidden = true;
  if (cashMode) {
    if (homeWalletSideLabel) homeWalletSideLabel.textContent = MINIMAL_LAUNCH ? "За столами" : "Уровень";
    if (MINIMAL_LAUNCH) {
      const tableStack = Number(profileData.cashTableStackMicros || 0);
      homeWalletSideValue.textContent = formatUsdtDisplay(tableStack);
      homeWalletSideCurrency.hidden = false;
      homeWalletSideCurrency.replaceChildren(createTetherMark("tether-mark--mini"));
      homeWalletSideHint.textContent = tableStack > 0 ? "в игре" : "нет активных";
      if (homeWalletSideMeter) homeWalletSideMeter.style.width = tableStack > 0 ? "100%" : "8%";
    } else {
      homeWalletSideValue.textContent = cashLevelLabel(profile);
      homeWalletSideHint.textContent = cashLevelMeta(profile);
      if (homeWalletSideMeter) homeWalletSideMeter.style.width = `${Math.max(8, Math.round(progress * 100))}%`;
    }
    if (homeWalletSideAction) {
      homeWalletSideAction.textContent = "";
      homeWalletSideAction.disabled = true;
    }
  } else {
    const cooldownSeconds = Math.max(0, Number(dailyPlayClaim?.cooldownSeconds || 0));
    const canClaim = Boolean(dailyPlayClaim?.canClaim || cooldownSeconds === 0);
    const amount = Number(dailyPlayClaim?.amount || 10000);
    const bonusProgress = canClaim ? 1 : Math.max(0.08, Math.min(1, 1 - (cooldownSeconds / (24 * 60 * 60))));
    if (homeWalletSideLabel) homeWalletSideLabel.textContent = "Бонус дня";
    homeWalletSideValue.textContent = formatNumber(amount);
    homeWalletSideHint.textContent = canClaim ? "доступно сейчас" : formatCooldown(cooldownSeconds);
    if (homeWalletSideMeter) homeWalletSideMeter.style.width = `${Math.round(bonusProgress * 100)}%`;
    if (homeWalletSideAction) {
      homeWalletSideAction.textContent = "Получить";
      homeWalletSideAction.disabled = !canClaim || pendingDailyPlayClaim;
    }
  }
  if (cashMode && homeWalletSideAction) homeWalletSideAction.title = "Прогресс уровня";
  if (!cashMode && homeWalletSideAction) {
    homeWalletSideAction.title = !dailyPlayClaim
      ? "Состояние бонуса загружается"
      : dailyPlayClaim.canClaim
      ? "Получить ежедневные игровые фишки"
      : `Следующая выдача через ${formatCooldown(dailyPlayClaim?.cooldownSeconds || 0)}`;
  }
  if (!cashMode && homeWalletSideMeter) homeWalletSideMeter.dataset.mode = "bonus";
  if (cashMode && homeWalletSideMeter) homeWalletSideMeter.dataset.mode = "cash";
  if (homeWalletSide) {
    homeWalletSide.dataset.mode = cashMode ? "cash" : "play";
    homeWalletSide.dataset.state = cashMode ? "club" : "bonus";
  }
}

function renderProgression(progression) {
  const profile = progression?.profile || {};
  const rating = progression?.rating || {};
  const cashClub = progression?.cashClub?.current || {};
  if (progression?.dailyPlayClaim) setDailyPlayClaim(progression.dailyPlayClaim);
  renderProfileTournamentStats(state.homeStats || {});
  if (MINIMAL_LAUNCH) {
    if (homeRatingLeague) homeRatingLeague.textContent = "Play";
    if (homeRatingPoints) homeRatingPoints.textContent = formatNumber(profile.ratingPoints || rating.startingRp || 1000);
    if (homeCashClub) homeCashClub.textContent = "Cash";
    if (ratingLeaderboardMeta) ratingLeaderboardMeta.textContent = "игра на фишки";
    if (ratingLeaderboardList) {
      ratingLeaderboardList.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "leaderboard-empty";
      empty.textContent = "Рейтинговый режим пока работает как игра на фишки.";
      ratingLeaderboardList.append(empty);
    }
    return;
  }
  const league = profile.ratingLeague || profile.ratingTier || "Bronze";
  const ratingPoints = Number(profile.ratingPoints || rating.startingRp || 1000);
  if (homeRatingLeague) homeRatingLeague.textContent = league;
  if (homeRatingPoints) homeRatingPoints.textContent = formatNumber(ratingPoints);
  if (homeCashClub) homeCashClub.textContent = cashLevelLabel({
    cashLevel: cashClub.level || profile.cashLevel || 1
  });

  const rows = Array.isArray(rating.leaderboard) ? rating.leaderboard.slice(0, 5) : [];
  if (ratingLeaderboardMeta) {
    ratingLeaderboardMeta.textContent = rows.length
      ? `${rows.length} ${plural(rows.length, "игрок", "игрока", "игроков")}`
      : "сезон открыт";
  }
  if (!ratingLeaderboardList) return;
  ratingLeaderboardList.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "leaderboard-empty";
    empty.textContent = "Сыграйте рейтинговую раздачу, чтобы попасть в таблицу.";
    ratingLeaderboardList.append(empty);
    return;
  }
  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "leaderboard-row";
    item.innerHTML = `
      <span class="leaderboard-rank">#${row.rank || index + 1}</span>
      <span class="leaderboard-player">${escapeHtml(row.name || row.username || "Игрок")}</span>
      <strong>${formatNumber(row.ratingPoints || 0)} RP</strong>
      <small>${row.eligible ? "в зачёте" : "калибровка"}</small>
    `;
    ratingLeaderboardList.append(item);
  });
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

function tournamentStatsSnapshot(profileData = {}) {
  const profile = profileData.profile || state.homeStats?.profile || {};
  const stats = state.progression?.tournaments?.stats || {};
  return {
    entries: Number(stats.entries ?? profile.tournamentEntries ?? profile.tournamentsPlayed ?? 0),
    itm: Number(stats.itm ?? profile.tournamentItm ?? 0),
    finalTables: Number(stats.finalTables ?? profile.tournamentFinalTables ?? 0),
    wins: Number(stats.wins ?? profile.tournamentWins ?? 0),
    cashFeesPaidMicros: Number(stats.cashFeesPaidMicros ?? profile.tournamentCashFeesPaidMicros ?? 0),
    cashPrizeWonMicros: Number(stats.cashPrizeWonMicros ?? profile.tournamentCashPrizeWonMicros ?? 0)
  };
}

function renderProfileTournamentStats(profileData = {}) {
  const stats = tournamentStatsSnapshot(profileData);
  if (profileTournamentSummary) {
    profileTournamentSummary.textContent = `${stats.entries} ${plural(stats.entries, "вход", "входа", "входов")}`;
  }
  if (profileTournamentStats) {
    profileTournamentStats.replaceChildren();
    const items = [
      ["Турниры", formatNumber(stats.entries)],
      ["ITM", formatNumber(stats.itm)],
      ["Финалки", formatNumber(stats.finalTables)],
      ["Победы", formatNumber(stats.wins)],
      ["Fee cash", `${formatUsdt(stats.cashFeesPaidMicros)} USDT`],
      ["Призы cash", `${formatUsdt(stats.cashPrizeWonMicros)} USDT`]
    ];
    items.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "profile-tournament-stat";
      item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
      profileTournamentStats.append(item);
    });
  }
  renderTournamentHistoryList(profileTournamentHistory, state.tournamentHistory, {
    emptyText: "История участия появится после первого завершённого турнира.",
    limit: 4
  });
}

function cashLevelLabel(profile = {}) {
  return `Уровень ${Math.max(1, Number(profile.cashLevel || 1))}`;
}

function cashLevelMeta(profile = {}) {
  return `${formatNumber(profile.cashClubPoints || profile.cashXpCurrent || 0)} pts`;
}

function tournamentStartParts(tournament) {
  if (!tournament?.startsAt) {
    return tournament?.type === "sng" || tournament?.type === "sit_and_go"
      ? { day: "SNG", time: "по набору" }
      : { day: "скоро", time: "время уточняется" };
  }
  const date = new Date(tournament.startsAt);
  if (Number.isNaN(date.getTime())) return { day: "скоро", time: "время уточняется" };
  return {
    day: date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }).replace(".", ""),
    time: date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  };
}

function tournamentTypeLabel(type) {
  const labels = {
    mtt: "MTT",
    sng: "SNG",
    sit_and_go: "SNG",
    freeroll: "Freeroll",
    satellite: "Satellite"
  };
  return labels[type] || String(type || "Турнир").toUpperCase();
}

function tournamentStatusLabel(status) {
  const labels = {
    created: "создан",
    registration_open: "регистрация",
    late_registration: "late reg",
    running: "идёт",
    final_table: "финальный стол",
    finished: "завершён",
    cancelled: "отменён"
  };
  return labels[status] || statusLabel(status);
}

function formatTournamentAmountText(value, balanceBucket) {
  return `${formatUsdt(value)} USDT`;
}

function formatTournamentStartLabel(tournament) {
  const startsAt = formatDateTime(tournament.startsAt);
  if (tournament.type === "sng" || tournament.type === "sit_and_go") {
    if (["running", "final_table", "late_registration"].includes(tournament.status)) return "стартовал";
    return startsAt ? `старт ${startsAt}` : "по набору";
  }
  return startsAt ? `старт ${startsAt}` : "время уточняется";
}

function tournamentBadge(tournament) {
  const playerState = tournament.playerState || null;
  if (playerState?.status === "playing") {
    return {
      text: tournament.status === "final_table" ? "Финальный стол" : "Идёт турнир",
      state: tournament.status === "final_table" ? "final" : "live"
    };
  }
  if (playerState?.status === "registered") {
    return {
      text: tournament.status === "late_registration" ? "Late reg" : "Вы зарегистрированы",
      state: "registered"
    };
  }
  if (playerState?.status === "eliminated") {
    return { text: `Выбыли · #${playerState.place}`, state: "out" };
  }
  if (playerState?.status === "finished") {
    return {
      text: playerState.prizeAmount > 0 ? `ITM · #${playerState.place}` : `Завершён · #${playerState.place}`,
      state: playerState.prizeAmount > 0 ? "itm" : "finished"
    };
  }
  return { text: tournamentStatusLabel(tournament.status), state: tournament.status };
}

function tournamentActionProps(tournament) {
  const playerState = tournament.playerState || null;
  if (playerState?.status === "playing" && playerState.tableId) {
    return {
      action: "open-table",
      text: tournament.status === "final_table" ? "К финалке" : "К столу",
      tableId: playerState.tableId,
      disabled: false
    };
  }
  if (tournament.registered) {
    if (tournament.canCancel) return { action: "cancel", text: "Отменить", disabled: false };
    if (playerState?.status === "registered") return { action: "wait", text: "Ожидание старта", disabled: true };
    if (playerState?.status === "eliminated") return { action: "done", text: `Место #${playerState.place}`, disabled: true };
    if (playerState?.status === "finished") return { action: "done", text: "Результат", disabled: true };
    return { action: "wait", text: "Вы в игре", disabled: true };
  }
  if (tournament.canRegister) {
    return {
      action: "register",
      text: tournament.status === "late_registration" ? "Войти в late reg" : "Регистрация",
      disabled: false
    };
  }
  return {
    action: "closed",
    text: tournament.status === "cancelled" ? "Отменён" : tournament.status === "finished" ? "Завершён" : "Недоступно",
    disabled: true
  };
}

function tournamentRuntimeBits(tournament) {
  const bits = [];
  if (tournament.lateRegEndsAt && ["registration_open", "late_registration"].includes(tournament.status)) {
    bits.push({ label: "Late reg", value: formatDateTime(tournament.lateRegEndsAt) || "до старта" });
  }
  if (Number(tournament.currentLevel || 0) > 0 && ["late_registration", "running", "final_table"].includes(tournament.status)) {
    bits.push({ label: "Уровень", value: `#${formatNumber(tournament.currentLevel)}` });
  }
  const playerState = tournament.playerState || null;
  if (playerState?.status === "playing") bits.push({ label: "Игрок", value: tournament.status === "final_table" ? "за финальным столом" : "за столом" });
  if (playerState?.status === "eliminated") bits.push({ label: "Место", value: `#${playerState.place}` });
  if (playerState?.status === "finished") bits.push({ label: "Место", value: `#${playerState.place}` });
  return bits;
}

function tournamentPlayerNote(tournament) {
  const playerState = tournament.playerState || null;
  if (playerState?.status === "finished") {
    return playerState.prizeAmount > 0
      ? `Приз ${formatTournamentAmountText(playerState.prizeAmount, tournament.balanceBucket)}`
      : "Без ITM";
  }
  if (playerState?.status === "eliminated") return "Выбыли из турнира";
  if (playerState?.status === "playing") return tournament.status === "final_table" ? "Вы уже за финальным столом." : "Турнир идёт, место за столом уже назначено.";
  if (playerState?.status === "registered") return tournament.canCancel ? "До старта регистрацию можно отменить." : "Регистрация подтверждена.";
  return "";
}

function renderTournamentHistoryList(container, history, { emptyText = "История пуста.", limit = 5 } = {}) {
  if (!container) return;
  container.replaceChildren();
  const rows = Array.isArray(history)
    ? [...history].sort((left, right) => new Date(right.finishedAt || 0).getTime() - new Date(left.finishedAt || 0).getTime()).slice(0, limit)
    : [];
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  rows.forEach((item) => {
    const node = document.createElement("article");
    node.className = "tournament-history-item";
    node.innerHTML = `
      <div class="tournament-history-copy">
        <span>${escapeHtml(tournamentTypeLabel(item.type))} · #${escapeHtml(String(item.place || "—"))}</span>
        <strong>${escapeHtml(item.title || "Турнир")}</strong>
        <small>${escapeHtml(formatDateTime(item.finishedAt) || "дата уточняется")}</small>
      </div>
      <b>${escapeHtml(Number(item.prizeAmount || 0) > 0 ? `+${formatTournamentAmountText(item.prizeAmount, item.balanceBucket)}` : "без призов")}</b>
    `;
    container.append(node);
  });
}

function parseJsonField(value, fallback = []) {
  const source = String(value || "").trim();
  if (!source) return fallback;
  return JSON.parse(source);
}

function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resetAdminTournamentForm() {
  state.selectedAdminTournamentId = "";
  adminTournamentForm?.reset();
  if (adminTournamentId) adminTournamentId.value = "";
  if (adminTournamentType) adminTournamentType.value = "mtt";
  if (adminTournamentStatusInput) adminTournamentStatusInput.value = "created";
  if (adminTournamentBlindStructure) {
    adminTournamentBlindStructure.value = JSON.stringify([
      { level: 1, smallBlind: 25_000, bigBlind: 50_000, durationSeconds: 600 },
      { level: 2, smallBlind: 50_000, bigBlind: 100_000, durationSeconds: 600 }
    ], null, 2);
  }
  if (adminTournamentPayoutStructure) adminTournamentPayoutStructure.value = JSON.stringify([], null, 2);
  if (adminTournamentFormMeta) adminTournamentFormMeta.textContent = "cash-only";
  if (adminTournamentSubmit) adminTournamentSubmit.textContent = "Создать турнир";
  if (adminTournamentUiStatus) adminTournamentUiStatus.textContent = "";
}

function fillAdminTournamentForm(tournament) {
  if (!tournament) return;
  state.selectedAdminTournamentId = tournament.id;
  if (adminTournamentId) adminTournamentId.value = tournament.id || "";
  if (adminTournamentTitle) adminTournamentTitle.value = tournament.title || "";
  if (adminTournamentType) adminTournamentType.value = tournament.type || "mtt";
  if (adminTournamentBuyIn) adminTournamentBuyIn.value = String(tournament.buyIn ?? "");
  if (adminTournamentFee) adminTournamentFee.value = String(tournament.fee ?? "");
  if (adminTournamentStartsAt) adminTournamentStartsAt.value = toLocalDateTimeInput(tournament.startsAt);
  if (adminTournamentRegistrationOpen) adminTournamentRegistrationOpen.checked = tournament.registrationOpen === true;
  if (adminTournamentLateRegMinutes) adminTournamentLateRegMinutes.value = String(tournament.lateRegMinutes ?? 0);
  if (adminTournamentMaxPlayers) adminTournamentMaxPlayers.value = String(tournament.maxPlayers ?? "");
  if (adminTournamentMinPlayers) adminTournamentMinPlayers.value = String(tournament.minPlayers ?? "");
  if (adminTournamentBlindStructure) adminTournamentBlindStructure.value = JSON.stringify(tournament.blindStructure || tournament.structure || [], null, 2);
  if (adminTournamentPayoutStructure) adminTournamentPayoutStructure.value = JSON.stringify(tournament.payoutStructure || [], null, 2);
  if (adminTournamentReEntryLimit) adminTournamentReEntryLimit.value = String(tournament.reEntryLimit ?? 0);
  if (adminTournamentAddOnAllowed) adminTournamentAddOnAllowed.checked = tournament.addOnAllowed === true;
  if (adminTournamentDescription) adminTournamentDescription.value = tournament.description || "";
  if (adminTournamentStatusInput) adminTournamentStatusInput.value = tournament.status || "created";
  if (adminTournamentFormMeta) adminTournamentFormMeta.textContent = `${tournamentStatusLabel(tournament.status)} · ${tournament.participants || 0}/${tournament.maxPlayers || 0}`;
  if (adminTournamentSubmit) adminTournamentSubmit.textContent = "Сохранить турнир";
}

async function saveAdminTournament() {
  const tournamentId = adminTournamentId?.value || "";
  const payload = {
    title: adminTournamentTitle?.value || "",
    type: adminTournamentType?.value || "mtt",
    buyIn: Number(adminTournamentBuyIn?.value || 0),
    fee: Number(adminTournamentFee?.value || 0),
    startsAt: new Date(adminTournamentStartsAt?.value || Date.now()).toISOString(),
    registrationOpen: adminTournamentRegistrationOpen?.checked === true,
    lateRegMinutes: Number(adminTournamentLateRegMinutes?.value || 0),
    maxPlayers: Number(adminTournamentMaxPlayers?.value || 2),
    minPlayers: Number(adminTournamentMinPlayers?.value || 2),
    blindStructure: parseJsonField(adminTournamentBlindStructure?.value, []),
    payoutStructure: parseJsonField(adminTournamentPayoutStructure?.value, []),
    reEntryLimit: Number(adminTournamentReEntryLimit?.value || 0),
    addOnAllowed: adminTournamentAddOnAllowed?.checked === true,
    description: adminTournamentDescription?.value || "",
    status: adminTournamentStatusInput?.value || "created"
  };
  const key = tournamentId ? `admin-tournament-update-${tournamentId}` : "admin-tournament-create";
  if (pendingAdminTournamentRequests.has(key)) return;
  pendingAdminTournamentRequests.add(key);
  if (adminTournamentSubmit) adminTournamentSubmit.disabled = true;
  if (adminTournamentUiStatus) adminTournamentUiStatus.textContent = tournamentId ? "Сохраняем турнир..." : "Создаём турнир...";
  try {
    const data = await api(tournamentId ? `/api/admin/tournaments/${encodeURIComponent(tournamentId)}` : "/api/admin/tournaments", {
      method: tournamentId ? "PATCH" : "POST",
      body: payload,
      idempotencyKey: requestKey(key)
    });
    state.adminTournaments = data.tournaments || state.adminTournaments || [];
    if (data.tournament) fillAdminTournamentForm(data.tournament);
    renderAdminTournamentControls(state.adminTournaments, state.adminRewardTournaments);
    if (adminTournamentUiStatus) adminTournamentUiStatus.textContent = tournamentId ? "Турнир сохранён." : "Турнир создан.";
    haptic("success");
  } catch (error) {
    if (error.status === 409) {
      if (adminTournamentUiStatus) adminTournamentUiStatus.textContent = error.message;
      haptic("warning");
      return;
    }
    throw error;
  } finally {
    pendingAdminTournamentRequests.delete(key);
    if (adminTournamentSubmit) adminTournamentSubmit.disabled = false;
  }
}

function adminTournamentActionButtons(tournament) {
  const actions = tournament.actions || {};
  const mapping = [
    ["registration-open", "Открыть рег.", actions.canOpenRegistration],
    ["registration-close", "Закрыть рег.", actions.canCloseRegistration],
    ["force-start", "Форс-старт", actions.canForceStart],
    ["force-finish", "Форс-финиш", actions.canForceFinish],
    ["cancel", "Отменить", actions.canCancel]
  ];
  return mapping
    .filter(([, , allowed]) => allowed)
    .map(([action, label]) => {
      const key = `${tournament.id}:${action}`;
      return `<button type="button" data-admin-tournament-action="${action}" data-admin-tournament-id="${escapeHtml(tournament.id)}" ${pendingAdminTournamentRequests.has(key) ? "disabled" : ""}>${label}</button>`;
    })
    .join("");
}

function renderAdminTournamentControls(tournaments, rewardTournaments) {
  state.adminTournaments = Array.isArray(tournaments) ? tournaments : [];
  state.adminRewardTournaments = Array.isArray(rewardTournaments) ? rewardTournaments : [];
  if (adminTournamentCount) adminTournamentCount.textContent = `${state.adminTournaments.length}`;
  if (adminRewardTournamentCount) adminRewardTournamentCount.textContent = `${state.adminRewardTournaments.length}`;

  if (adminTournamentList) {
    adminTournamentList.replaceChildren();
    if (!state.adminTournaments.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Обычных cash-турниров пока нет.";
      adminTournamentList.append(empty);
    } else {
      state.adminTournaments.forEach((tournament) => {
        const card = document.createElement("article");
        card.className = "admin-tournament-card";
        card.dataset.selected = state.selectedAdminTournamentId === tournament.id ? "true" : "false";
        card.innerHTML = `
          <div class="admin-tournament-head">
            <div>
              <span>${escapeHtml(tournamentTypeLabel(tournament.type))} · USDT</span>
              <strong>${escapeHtml(tournament.title)}</strong>
              <small>${escapeHtml(tournamentStatusLabel(tournament.status))} · ${escapeHtml(formatDateTime(tournament.startsAt) || "без даты")} · ${tournament.participants}/${tournament.maxPlayers}</small>
            </div>
            <button type="button" data-admin-tournament-edit="${escapeHtml(tournament.id)}">Редактировать</button>
          </div>
          <div class="admin-tournament-meta">
            <span>Buy-in<strong>${escapeHtml(formatTournamentAmountText(tournament.buyIn, "cash"))}</strong></span>
            <span>Fee<strong>${escapeHtml(formatTournamentAmountText(tournament.fee, "cash"))}</strong></span>
            <span>Prize pool<strong>${escapeHtml(formatTournamentAmountText(tournament.prizePool, "cash"))}</strong></span>
            <span>Late reg<strong>${escapeHtml(tournament.lateRegMinutes ? `${tournament.lateRegMinutes}м` : "нет")}</strong></span>
          </div>
          <div class="admin-tournament-actions">${adminTournamentActionButtons(tournament)}</div>
          <details class="admin-tournament-details">
            <summary>Участники и payout</summary>
            <div class="admin-tournament-participants">
              ${(tournament.participantsList || []).length
                ? tournament.participantsList.map((entry) => `<div><span>${escapeHtml(entry.name || entry.username || entry.userId)}</span><small>${escapeHtml(entry.registeredAt ? formatDateTime(entry.registeredAt) : entry.userId)}</small></div>`).join("")
                : "<p class=\"empty\">Участников пока нет.</p>"}
            </div>
            <div class="admin-tournament-payouts">
              ${(tournament.payoutPreview || []).length
                ? tournament.payoutPreview.map((entry) => `<div><span>#${entry.place}</span><strong>${escapeHtml(formatTournamentAmountText(entry.amount, "cash"))}</strong><small>${escapeHtml(String(entry.percent || 0))}%</small></div>`).join("")
                : "<p class=\"empty\">Payout preview появится после регистраций.</p>"}
            </div>
          </details>
        `;
        adminTournamentList.append(card);
      });
    }
  }

  if (adminRewardTournamentList) {
    adminRewardTournamentList.replaceChildren();
    if (!state.adminRewardTournaments.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Reward tournaments пока не созданы.";
      adminRewardTournamentList.append(empty);
    } else {
      state.adminRewardTournaments.forEach((event) => {
        const item = document.createElement("article");
        item.className = "admin-reward-card";
        item.innerHTML = `
          <div>
            <span>Reward tournament</span>
            <strong>${escapeHtml(event.title || "Reward event")}</strong>
            <small>${escapeHtml(event.status || "tickets_issued")} · сезон ${escapeHtml(event.seasonId || "—")}</small>
          </div>
          <div class="admin-reward-meta">
            <span>Tickets<strong>${escapeHtml(String(event.ticketCount || 0))}</strong></span>
            <span>Used<strong>${escapeHtml(String(event.usedTicketCount || 0))}</strong></span>
          </div>
          <button type="button" data-admin-reward-view="${escapeHtml(event.id)}">Показать tickets</button>
        `;
        adminRewardTournamentList.append(item);
      });
    }
  }
}

async function onAdminTournamentAction(event) {
  const editButton = event.target.closest("[data-admin-tournament-edit]");
  if (editButton) {
    const tournament = state.adminTournaments.find((item) => item.id === editButton.dataset.adminTournamentEdit);
    if (tournament) fillAdminTournamentForm(tournament);
    return;
  }
  const actionButton = event.target.closest("[data-admin-tournament-action]");
  if (!actionButton) return;
  const tournamentId = actionButton.dataset.adminTournamentId;
  const action = actionButton.dataset.adminTournamentAction;
  const key = `${tournamentId}:${action}`;
  if (pendingAdminTournamentRequests.has(key)) return;
  pendingAdminTournamentRequests.add(key);
  actionButton.disabled = true;
  if (adminTournamentUiStatus) adminTournamentUiStatus.textContent = "Отправляем действие...";
  try {
    const data = await api(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/${action}`, {
      method: "POST",
      idempotencyKey: requestKey(`admin-tournament-action-${tournamentId}-${action}`)
    });
    state.adminTournaments = data.tournaments || state.adminTournaments || [];
    if (data.tournament && state.selectedAdminTournamentId === data.tournament.id) fillAdminTournamentForm(data.tournament);
    renderAdminTournamentControls(state.adminTournaments, state.adminRewardTournaments);
    if (adminTournamentUiStatus) adminTournamentUiStatus.textContent = "Действие выполнено.";
    haptic("success");
  } catch (error) {
    if (error.status === 409) {
      if (adminTournamentUiStatus) adminTournamentUiStatus.textContent = error.message;
      haptic("warning");
      return;
    }
    throw error;
  } finally {
    pendingAdminTournamentRequests.delete(key);
    renderAdminTournamentControls(state.adminTournaments, state.adminRewardTournaments);
  }
}

async function onAdminRewardTournamentAction(event) {
  const button = event.target.closest("[data-admin-reward-view]");
  if (!button) return;
  const data = await api(`/api/admin/reward-tournaments/${encodeURIComponent(button.dataset.adminRewardView)}`);
  const tickets = data.rewardTournament?.tickets || [];
  if (adminTournamentUiStatus) {
    adminTournamentUiStatus.textContent = tickets.length
      ? tickets.map((ticket) => `#${ticket.leaderboardRank} ${ticket.name || ticket.username || ticket.userId} · ${ticket.status}`).join(" | ")
      : "У event пока нет tickets.";
  }
}

async function loadAdminDashboard() {
  if (!ADMIN_MODE || !state.token) return;
  if (adminOperationalStatus) adminOperationalStatus.textContent = "Обновляем данные...";
  const data = await api(`/api/admin?days=${encodeURIComponent(adminAnalyticsDays)}`);
  renderAdminDashboard(data.admin);
}

function selectAdminPanel(panel) {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminTab === panel);
  });
  document.querySelectorAll("[data-admin-panel]").forEach((item) => {
    item.classList.toggle("active", item.dataset.adminPanel === panel);
  });
}

function renderAdminDashboard(admin) {
  const stats = admin?.stats || {};
  const analytics = admin?.analytics || {};
  const conversion = analytics.conversion || {};
  const diagnostics = admin?.diagnostics || {};
  const database = diagnostics.database || {};
  const memory = diagnostics.memory || {};
  const reconciliation = admin?.audit?.reconciliation || {};
  const roles = admin?.adminRoles || {};

  if (adminOperationalStatus) {
    adminOperationalStatus.textContent = diagnostics.ok
      ? `System ok · uptime ${formatDuration(diagnostics.uptimeSeconds || 0)}`
      : "System requires attention";
  }
  if (adminBankrollTotal) {
    adminBankrollTotal.textContent = Number(stats.cashWalletTotal || 0) > 0
      ? `${formatUsdt(stats.cashWalletTotal)} USDT`
      : formatChips(stats.bankrollTotal || 0);
  }
  renderAdminHealthStrip({
    diagnostics,
    database,
    memory,
    stats,
    reconciliation
  });
  renderAdminOverview({ admin, stats, analytics, conversion, diagnostics, database, memory, reconciliation });

  renderAdminPayments(admin?.recentPayments || []);
  renderAdminUsers(admin?.recentUsers || []);
  renderAdminWithdrawals(admin?.recentWithdrawals || []);
  renderAdminFundMovements(admin?.recentFundMovements || []);
  renderAdminHands(admin?.recentHands || []);
  renderAdminRiskSignals({ diagnostics, database, stats, reconciliation });
  renderAdminSettings({ diagnostics, database, roles, stats, notes: admin?.audit?.notes || [] });
  renderAdminTournamentControls(admin?.tournaments || [], admin?.rewardTournaments || []);
  renderAdminEvents(admin?.recentEvents || []);
}

function renderAdminOverview({ admin, stats, analytics, conversion, diagnostics, database, memory, reconciliation }) {
  if (!adminSummary) return;
  const days = Number(analytics.days || adminAnalyticsDays || 7);
  const periodLabel = days === 1 ? "24 часа" : `${days} дней`;
  const sections = document.createElement("div");
  sections.className = "admin-report-dashboard";

  const toolbar = document.createElement("section");
  toolbar.className = "admin-report-toolbar";
  toolbar.innerHTML = `
    <div>
      <p class="eyebrow">Reports</p>
      <h2>Метрики проекта</h2>
      <span>Период: ${periodLabel}. Управление воронкой, деньгами, игрой и рисками.</span>
    </div>
    <div class="admin-report-controls">
      <div class="admin-period-toggle" role="group" aria-label="Период аналитики"></div>
      <div class="admin-report-tabs" role="group" aria-label="Раздел отчёта">
        <button type="button" class="active" data-admin-report-filter="all">Сводка</button>
        <button type="button" data-admin-report-filter="acquisition">Воронка</button>
        <button type="button" data-admin-report-filter="finance">Финансы</button>
        <button type="button" data-admin-report-filter="gameplay">Игра</button>
        <button type="button" data-admin-report-filter="risk">Риски</button>
      </div>
    </div>
  `;
  const periodToggle = toolbar.querySelector(".admin-period-toggle");
  [
    [1, "24h"],
    [7, "7d"],
    [30, "30d"],
    [90, "90d"]
  ].forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = days === value ? "active" : "";
    button.addEventListener("click", () => {
      adminAnalyticsDays = value;
      window.localStorage.setItem("qwzAdminAnalyticsDays", String(value));
      runAction(loadAdminDashboard);
    });
    periodToggle.append(button);
  });

  const arpu = ratioValue(analytics.paidDepositAmount || 0, analytics.appOpenUsers || 0);
  const arppu = ratioValue(analytics.paidDepositAmount || 0, analytics.payingUsers || 0);
  const averageDeposit = ratioValue(analytics.paidDepositAmount || 0, analytics.paidDeposits || 0);
  const withdrawalRatio = ratioValue(analytics.withdrawalAmount || 0, analytics.paidDepositAmount || 0);
  const tableOccupancy = ratioValue(stats.activeTables || 0, stats.openTables || 0);
  const depositConversion = conversion.orderToPaid || 0;
  const cashierConversion = conversion.openToCashier || 0;

  const kpis = document.createElement("section");
  kpis.className = "admin-report-kpis";
  [
    {
      label: "DAU / WAU / MAU",
      value: `${formatNumber(analytics.dau || 0)} / ${formatNumber(analytics.wau || 0)} / ${formatNumber(analytics.mau || 0)}`,
      meta: `${formatNumber(analytics.appOpens || 0)} визитов за период`,
      tone: "primary"
    },
    {
      label: "Депозитная выручка",
      value: `${formatUsdt(analytics.paidDepositAmount || 0)} USDT`,
      meta: `${formatNumber(analytics.paidDeposits || 0)} оплат · avg ${formatUsdt(averageDeposit)} USDT`,
      tone: Number(analytics.paidDeposits || 0) > 0 ? "success" : "neutral"
    },
    {
      label: "FTD",
      value: formatNumber(analytics.firstDepositUsers || 0),
      meta: `первых депозитов · CR ${formatPercent(depositConversion)}`,
      tone: "primary"
    },
    {
      label: "ARPU / ARPPU",
      value: `${formatUsdt(arpu)} / ${formatUsdt(arppu)}`,
      meta: "USDT на активного / платящего",
      tone: "success"
    },
    {
      label: "Игровая активность",
      value: formatNumber(analytics.handsCompleted || 0),
      meta: `${formatNumber(analytics.tableJoins || 0)} входов · occupancy ${formatPercent(tableOccupancy)}`,
      tone: "primary"
    },
    {
      label: "Выводы",
      value: `${formatUsdt(analytics.withdrawalAmount || 0)} USDT`,
      meta: `${formatNumber(stats.pendingWithdrawals || 0)} pending · ratio ${formatPercent(withdrawalRatio)}`,
      tone: Number(stats.pendingWithdrawals || 0) > 0 ? "warning" : "neutral"
    },
    {
      label: "Hidden fee",
      value: `${formatUsdt(stats.approvedWithdrawalFeeUsdtTotal || 0)} USDT`,
      meta: "доход на выводах",
      tone: "success"
    },
    {
      label: "Balance drift",
      value: `${formatChips(reconciliation.walletLedgerDrift || 0)} / ${formatUsdt(reconciliation.cashWalletLedgerDrift || 0)}`,
      meta: "play chips / USDT ledger drift",
      tone: Number(reconciliation.walletLedgerDrift || 0) === 0 && Number(reconciliation.cashWalletLedgerDrift || 0) === 0 ? "success" : "danger"
    }
  ].forEach((item) => kpis.append(adminKpiCard(item)));

  const reportGrid = document.createElement("section");
  reportGrid.className = "admin-report-grid";
  reportGrid.dataset.reportSection = "acquisition";
  reportGrid.append(adminDailyChartCard(analytics));
  reportGrid.append(adminFunnelCard(analytics, conversion));

  const financeRows = [
    ["Cash USDT wallet", `${formatUsdt(stats.cashWalletTotal || 0)} USDT`, "Деньги пользователей в cash-режиме"],
    ["Locked withdrawal", `${formatUsdt(stats.lockedUsdtTotal || 0)} USDT`, "Заморожено под заявки на вывод"],
    ["Approved payout", `${formatUsdt(stats.approvedWithdrawalPayoutUsdtTotal || 0)} USDT`, "Выплачено по подтвержденным заявкам"],
    ["Hidden fee income", `${formatUsdt(stats.approvedWithdrawalFeeUsdtTotal || 0)} USDT`, "Комиссия/спред, остающийся проекту"],
    ["Withdrawal approved", formatNumber(analytics.withdrawalApproved || 0), `Запросов: ${formatNumber(analytics.withdrawalRequests || 0)}`],
    ["Withdrawal rejected", formatNumber(analytics.withdrawalRejected || 0), "Отклоненные заявки"],
    ["Play chips wallet", `${formatChips(stats.walletTotal || 0)} chips`, "Рейтинговые/игровые фишки"],
    ["Cash ledger net", `${formatUsdt((stats.cashLedgerCreditTotal || 0) - (stats.cashLedgerDebitTotal || 0))} USDT`, "credit - debit по USDT"],
    ["Table stacks", `${formatChips(stats.tableStackTotal || 0)} chips`, "Сейчас за столами"],
    ["Ledger net", `${formatChips(stats.ledgerNetTotal || 0)} chips`, "credit - debit"],
    ["Platform ledger", `${formatChips(stats.platformLedgerNetTotal || 0)}`, "Доходы/резервы платформы"]
  ];
  const productRows = [
    ["Players", formatNumber(stats.players || 0), "Все Telegram users"],
    ["Open users", formatNumber(analytics.appOpenUsers || 0), `${formatNumber(analytics.appOpens || 0)} визитов`],
    ["Cashier users", formatNumber(analytics.cashierUsers || 0), `open → cashier ${formatPercent(cashierConversion)}`],
    ["Paying users", formatNumber(analytics.payingUsers || 0), `order → paid ${formatPercent(depositConversion)}`],
    ["FTD", formatNumber(analytics.firstDepositUsers || 0), "первые депозиты"],
    ["ARPU", `${formatUsdt(arpu)} USDT`, "депозиты / активные"],
    ["ARPPU", `${formatUsdt(arppu)} USDT`, "депозиты / платящие"],
    ["Active tables", formatNumber(stats.activeTables || 0), "Сейчас"],
    ["Hands", formatNumber(analytics.handsCompleted || 0), `За ${periodLabel}`],
    ["Poker actions", formatNumber(analytics.pokerActions || 0), "Clicks/actions"],
    ["Analytics events", formatNumber(analytics.totalEvents || stats.analyticsEvents || 0), "Все события"]
  ];
  const riskRows = [
    ["API", diagnostics.ok ? "online" : "attention", diagnostics.ok ? "OK" : "Проверить"],
    ["Database", database.enabled ? `${database.ok ? "ok" : "fail"} · ${database.mode}` : "memory", "Production без memory"],
    ["Wallet drift", formatChips(reconciliation.walletLedgerDrift || 0), "Должен быть 0"],
    ["Cash drift", `${formatUsdt(reconciliation.cashWalletLedgerDrift || 0)} USDT`, "Должен быть 0"],
    ["Stars drift", formatChips(reconciliation.starsDepositDrift || 0), "Должен быть 0"],
    ["Pending withdrawals", formatNumber(stats.pendingWithdrawals || 0), "Очередь finance"],
    ["Idempotency keys", formatNumber(stats.idempotencyKeyCount || 0), "Защита дублей"],
    ["Hand history", formatNumber(stats.handHistoryCount || 0), "Раздачи в базе"],
    ["Heap", memory.heapUsedMb ? `${memory.heapUsedMb}/${memory.heapTotalMb} MB` : "n/a", "Node memory"]
  ];

  const tables = document.createElement("section");
  tables.className = "admin-report-tables";
  tables.append(adminReportTable("Финансы", "cash / ledger / withdrawal", financeRows, "finance"));
  tables.append(adminReportTable("Продукт", "воронка / активность / игра", productRows, "gameplay"));
  tables.append(adminReportTable("Контроль", "health / drift / risk", riskRows, "risk"));

  const kpiWrap = document.createElement("section");
  kpiWrap.className = "admin-report-section";
  kpiWrap.dataset.reportSection = "all";
  kpiWrap.append(kpis);

  sections.replaceChildren(toolbar, kpiWrap, reportGrid, tables);
  adminSummary.replaceChildren(sections);
  wireAdminReportFilters(sections);
}

function ratioValue(numerator, denominator) {
  const bottom = Number(denominator || 0);
  if (!bottom) return 0;
  return Number(numerator || 0) / bottom;
}

function adminKpiCard(item) {
  const card = document.createElement("article");
  card.className = `admin-kpi-card ${item.tone || "neutral"}`;
  card.innerHTML = "<span></span><strong></strong><small></small>";
  card.querySelector("span").textContent = item.label;
  card.querySelector("strong").textContent = item.value;
  card.querySelector("small").textContent = item.meta;
  return card;
}

function adminReportTable(title, subtitle, rows, section = "all") {
  const card = document.createElement("section");
  card.className = "admin-report-table";
  card.dataset.reportSection = section;
  card.innerHTML = `
    <div class="admin-section-header">
      <div>
        <p class="eyebrow">${subtitle}</p>
        <h3>${title}</h3>
      </div>
    </div>
    <div class="admin-report-table-body"></div>
  `;
  const body = card.querySelector(".admin-report-table-body");
  rows.forEach(([name, value, note]) => {
    const row = document.createElement("div");
    row.className = "admin-report-row";
    row.innerHTML = `
      <span></span>
      <strong></strong>
      <small></small>
    `;
    row.querySelector("span").textContent = name;
    row.querySelector("strong").textContent = value;
    row.querySelector("small").textContent = note;
    body.append(row);
  });
  return card;
}

function wireAdminReportFilters(root) {
  const buttons = [...root.querySelectorAll("[data-admin-report-filter]")];
  const sections = [...root.querySelectorAll("[data-report-section]")];
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.adminReportFilter;
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      sections.forEach((section) => {
        const sectionName = section.dataset.reportSection;
        section.hidden = filter !== "all" && sectionName !== filter && sectionName !== "all";
      });
    });
  });
}

function adminFunnelCard(analytics, conversion) {
  const card = document.createElement("section");
  card.className = "admin-dashboard-card admin-funnel-card";
  const steps = [
    ["Открыли app", analytics.appOpenUsers || 0, 1],
    ["Открыли кассу", analytics.cashierUsers || 0, conversion.openToCashier || 0],
    ["Создали счет", analytics.depositOrderUsers || analytics.depositOrders || 0, conversion.cashierToOrder || 0],
    ["Оплатили", analytics.payingUsers || analytics.paidDeposits || 0, conversion.orderToPaid || 0],
    ["Сели за стол", analytics.tableJoinUsers || analytics.tableJoins || 0, conversion.openToTable || 0]
  ];
  const maxValue = Math.max(1, ...steps.map((step) => Number(step[1] || 0)));
  card.innerHTML = `
    <div class="admin-section-header">
      <div>
        <p class="eyebrow">Funnel</p>
        <h3>Путь игрока</h3>
      </div>
      <span>${formatNumber(analytics.totalEvents || 0)} событий</span>
    </div>
    <div class="admin-funnel"></div>
  `;
  const list = card.querySelector(".admin-funnel");
  steps.forEach(([label, value, rate], index) => {
    const row = document.createElement("div");
    row.className = "admin-funnel-step";
    const width = Math.max(6, Math.round((Number(value || 0) / maxValue) * 100));
    row.innerHTML = `
      <div class="admin-funnel-row">
        <span>${index + 1}. ${label}</span>
        <strong>${formatNumber(value)}</strong>
      </div>
      <div class="admin-funnel-track"><i style="width:${width}%"></i></div>
      <small>${index === 0 ? "точка входа" : `конверсия ${formatPercent(rate)}`}</small>
    `;
    list.append(row);
  });
  return card;
}

function adminDailyChartCard(analytics) {
  const card = document.createElement("section");
  card.className = "admin-dashboard-card admin-chart-card";
  const daily = [...(analytics.daily || [])].reverse();
  const maxValue = Math.max(1, ...daily.flatMap((item) => [
    Number(item.appOpens || 0),
    Number(item.handsCompleted || 0),
    Number(item.paidDeposits || 0)
  ]));
  card.innerHTML = `
    <div class="admin-section-header">
      <div>
        <p class="eyebrow">Trend</p>
        <h3>Динамика по дням</h3>
      </div>
      <span class="admin-chart-legend">
        <i class="visits"></i> визиты
        <i class="hands"></i> руки
        <i class="deposits"></i> депозиты
      </span>
    </div>
    <div class="admin-chart-bars"></div>
  `;
  const chart = card.querySelector(".admin-chart-bars");
  if (!daily.length) {
    const empty = document.createElement("div");
    empty.className = "cashier-empty";
    empty.textContent = "Данных за период пока нет";
    chart.append(empty);
    return card;
  }
  daily.forEach((item) => {
    const bar = document.createElement("div");
    bar.className = "admin-chart-bar";
    const appHeight = Math.max(4, Math.round((Number(item.appOpens || 0) / maxValue) * 100));
    const handsHeight = Math.max(4, Math.round((Number(item.handsCompleted || 0) / maxValue) * 100));
    const depositHeight = Math.max(4, Math.round((Number(item.paidDeposits || 0) / maxValue) * 100));
    const dayLabel = new Date(item.day).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    bar.innerHTML = `
      <span>${formatNumber(item.users || 0)}</span>
      <div class="admin-chart-stack">
        <i class="visits" style="height:${appHeight}%"></i>
        <i class="hands" style="height:${handsHeight}%"></i>
        <i class="deposits" style="height:${depositHeight}%"></i>
      </div>
      <small>${dayLabel}</small>
    `;
    bar.title = `${dayLabel}: ${formatNumber(item.appOpens || 0)} visits, ${formatNumber(item.handsCompleted || 0)} hands, ${formatNumber(item.paidDeposits || 0)} deposits`;
    chart.append(bar);
  });
  return card;
}

function adminMetricGroup(title, subtitle, rows) {
  const card = document.createElement("section");
  card.className = "admin-dashboard-card admin-metric-group";
  card.innerHTML = `
    <div class="admin-section-header">
      <div>
        <p class="eyebrow">${subtitle}</p>
        <h3>${title}</h3>
      </div>
    </div>
    <div class="admin-metric-list"></div>
  `;
  const list = card.querySelector(".admin-metric-list");
  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.innerHTML = "<span></span><strong></strong>";
    row.querySelector("span").textContent = label;
    row.querySelector("strong").textContent = String(value);
    list.append(row);
  });
  return card;
}

function renderAdminUsers(users) {
  if (!adminUsersList) return;
  if (adminUsersCount) adminUsersCount.textContent = `${formatNumber(users.length)} пользователей`;
  adminUsersList.replaceChildren();
  if (!users.length) {
    const empty = document.createElement("div");
    empty.className = "cashier-empty";
    empty.textContent = "Пользователей пока нет";
    adminUsersList.append(empty);
    return;
  }

  for (const user of users) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "admin-user-row";
    row.innerHTML = `
      <span class="admin-user-avatar"></span>
      <span class="admin-user-main">
        <strong></strong>
        <small></small>
      </span>
      <span class="admin-user-money">
        <strong></strong>
        <small></small>
      </span>
    `;
    renderAvatar(row.querySelector(".admin-user-avatar"), {
      name: user.name || user.displayName || "P",
      photoUrl: user.photoUrl || ""
    });
    row.querySelector(".admin-user-main strong").textContent = user.displayName || user.name || "unknown";
    row.querySelector(".admin-user-main small").textContent = [
      `ID ${user.id}`,
      user.ledgerCount ? `${formatNumber(user.ledgerCount)} операций` : "операций нет"
    ].join(" · ");
    row.querySelector(".admin-user-money strong").textContent = `${formatChips(user.balance || 0)} chips`;
    row.querySelector(".admin-user-money small").textContent = `${formatUsdt(user.cashBalanceMicros || 0)} USDT · за столами ${formatChips(user.tableStack || 0)}`;
    row.addEventListener("click", () => {
      adminUserId.value = user.id;
      runAction(() => loadAdminPlayer(user.id));
    });
    adminUsersList.append(row);
  }
}

function renderAdminHealthStrip({ diagnostics, database, memory, stats, reconciliation }) {
  if (!adminHealthStrip) return;
  const items = [
    {
      label: "API",
      value: diagnostics.ok ? "online" : "attention",
      state: diagnostics.ok ? "ok" : "danger"
    },
    {
      label: "Database",
      value: database.enabled ? `${database.mode || "postgres"} · ${database.ok ? "ok" : "fail"}` : "memory",
      state: database.enabled && database.ok ? "ok" : "warning"
    },
    {
      label: "Withdrawals",
      value: `${stats.pendingWithdrawals || 0} pending`,
      state: Number(stats.pendingWithdrawals || 0) > 0 ? "warning" : "ok"
    },
    {
      label: "Wallet drift",
      value: formatChips(reconciliation.walletLedgerDrift || 0),
      state: Number(reconciliation.walletLedgerDrift || 0) === 0 ? "ok" : "danger"
    },
    {
      label: "Heap",
      value: memory.heapUsedMb ? `${memory.heapUsedMb}/${memory.heapTotalMb} MB` : "n/a",
      state: "neutral"
    }
  ];
  adminHealthStrip.replaceChildren(...items.map(adminStatusPill));
}

function adminStatusPill(item) {
  const pill = document.createElement("div");
  pill.className = `admin-status-pill ${item.state || "neutral"}`;
  pill.innerHTML = "<span></span><strong></strong>";
  pill.querySelector("span").textContent = item.label;
  pill.querySelector("strong").textContent = item.value;
  return pill;
}

function renderAdminRiskSignals({ diagnostics, database, stats, reconciliation }) {
  if (!adminRiskSignals) return;
  const signals = [
    {
      title: "Wallet / ledger drift",
      value: formatChips(reconciliation.walletLedgerDrift || 0),
      status: Number(reconciliation.walletLedgerDrift || 0) === 0 ? "ok" : "critical",
      meta: "Должно быть 0. Любое отклонение значит финансовую рассинхронизацию."
    },
    {
      title: "Stars deposit drift",
      value: formatChips(reconciliation.starsDepositDrift || 0),
      status: Number(reconciliation.starsDepositDrift || 0) === 0 ? "ok" : "critical",
      meta: "Сверка оплаченных Stars с ledger deposit_stars."
    },
    {
      title: "Pending withdrawals",
      value: String(stats.pendingWithdrawals || 0),
      status: Number(stats.pendingWithdrawals || 0) > 0 ? "review" : "ok",
      meta: `${formatChips(stats.pendingWithdrawalChipsTotal || 0)} chips на hold.`
    },
    {
      title: "Database mode",
      value: database.enabled ? database.mode || "postgres" : "memory",
      status: database.enabled && database.ok ? "ok" : "critical",
      meta: database.enabled ? "Production must use persistent DB." : "Memory mode нельзя использовать с реальными деньгами."
    },
    {
      title: "Idempotency keys",
      value: String(stats.idempotencyKeyCount || 0),
      status: "info",
      meta: "Контроль дублей для платежей и ручных операций."
    },
    {
      title: "Service health",
      value: diagnostics.ok ? "ok" : "fail",
      status: diagnostics.ok ? "ok" : "critical",
      meta: "Общий health snapshot backend."
    }
  ];
  adminRiskSignals.replaceChildren(...signals.map((signal) => {
    const row = document.createElement("div");
    row.className = `admin-risk-row ${signal.status}`;
    row.innerHTML = "<div><strong></strong><span></span></div><b></b>";
    row.querySelector("strong").textContent = signal.title;
    row.querySelector("span").textContent = signal.meta;
    row.querySelector("b").textContent = signal.value;
    return row;
  }));
}

function renderAdminSettings({ diagnostics, database, roles, stats, notes }) {
  if (!adminSettingsList) return;
  const rows = [
    ["Owner roles", roles.owner || 0],
    ["Finance roles", roles.finance || 0],
    ["Support roles", roles.support || 0],
    ["Risk roles", roles.risk || 0],
    ["Database", database.enabled ? `${database.mode || "postgres"} · ${database.ok ? "ok" : "fail"}` : "memory fallback"],
    ["Uptime", formatDuration(diagnostics.uptimeSeconds || 0)],
    ["Active tables", stats.activeTables || 0],
    ["Total tables", stats.openTables || 0],
    ["Audit notes", (notes || []).join(" / ") || "n/a"]
  ];
  adminSettingsList.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement("div");
    row.className = "admin-setting-row";
    row.innerHTML = "<span></span><strong></strong>";
    row.querySelector("span").textContent = label;
    row.querySelector("strong").textContent = String(value);
    return row;
  }));
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
    row.dataset.paymentMethod = payment.method || "";
    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${paymentMethodTitle(payment)} · ${formatPaymentAmount(payment)}`;
    const meta = document.createElement("span");
    meta.textContent = adminPaymentMeta(payment);
    main.append(title, meta);

    const status = document.createElement("b");
    status.textContent = payment.status;
    row.append(main, status);

    const canAdminAct = ["pending", "manual_review"].includes(payment.status);
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
    const cashMode = Number(withdrawal.grossUsdtMicros || 0) > 0 || withdrawal.asset === "USDT";
    title.textContent = cashMode
      ? `${withdrawal.method?.toUpperCase?.() || withdrawal.method} · ${formatUsdt(withdrawal.grossUsdtMicros || 0)} USDT`
      : `${withdrawal.method?.toUpperCase?.() || withdrawal.method} · ${formatChips(withdrawal.chips)} chips`;
    const meta = document.createElement("span");
    const financeMeta = cashMode
      ? [
          `hold ${formatUsdt(withdrawal.grossUsdtMicros || 0)} USDT`,
          `hidden fee ${formatUsdt(withdrawal.feeUsdtMicros || 0)} USDT`,
          `net payout ${formatUsdt(withdrawal.payoutUsdtMicros || 0)} USDT`
        ]
      : [
          `fee ${formatChips(withdrawal.feeChips || 0)}`,
          `payout ${formatChips(withdrawal.payoutChips || 0)}`
        ];
    meta.textContent = [
      withdrawal.userName || withdrawal.username || withdrawal.userId,
      ...financeMeta,
      formatDateTime(withdrawal.createdAt),
      withdrawal.id
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
  const paymentRow = button.closest(".admin-payment-row");
  const isStars = paymentRow?.dataset.paymentMethod === "stars";
  const warning = action === "approve"
    ? isStars
      ? "Подтвердить Stars-платёж вручную? Делайте это только после проверки Telegram receipt. Операция начислит реальный USDT-баланс."
      : "Подтвердить платёж вручную и начислить USDT?"
    : "Отклонить платёж?";
  if (!window.confirm(warning)) return;
  adminStatus.textContent = action === "approve" ? "Подтверждаем платеж..." : "Отклоняем платеж...";
  await api(`/api/admin/payments/${encodeURIComponent(paymentId)}/${action}`, {
    method: "POST",
    idempotencyKey: requestKey(`admin-payment-${action}-${paymentId}`),
    body: {
      reason: action === "approve"
        ? isStars ? "telegram_receipt_verified" : "manual_admin_approval"
        : "manual_admin_reject",
      confirmPaid: action === "approve" && isStars
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
    if (state.gameMode === "play") {
      const claim = getDailyPlayClaimState(state.homeStats || {});
      if (claim?.canClaim) {
        await claimDailyPlayBonus();
        return;
      }
      showError(claim
        ? `Следующая выдача игровых фишек через ${formatCooldown(claim.cooldownSeconds || 0)}`
        : "Игровые фишки сейчас недоступны");
      return;
    }
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
  const dailyPlayClaim = getDailyPlayClaimState(state.homeStats || {});
  quickPlayButton.disabled = false;

  if (balance <= 0) {
    if (!cashMode) {
      const amount = Number(dailyPlayClaim?.amount || 10000);
      if (dailyPlayClaim?.canClaim) {
        if (quickPlayTitle) quickPlayTitle.textContent = "Получить фишки";
        else quickPlayButton.textContent = "Получить фишки";
        quickPlayHint.textContent = `Бонус дня ${formatNumber(amount)} доступен сейчас`;
      } else {
        if (quickPlayTitle) quickPlayTitle.textContent = "Фишки по таймеру";
        else quickPlayButton.textContent = "Фишки по таймеру";
        quickPlayHint.textContent = dailyPlayClaim
          ? `Следующая выдача через ${formatCooldown(dailyPlayClaim.cooldownSeconds || 0)}`
          : "Ежедневная выдача загружается";
        quickPlayButton.disabled = !dailyPlayClaim?.canClaim;
      }
      renderHomeOfferMeta(limit, minBuyIn, "entry", cashMode);
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
  if (MINIMAL_LAUNCH && tab === "tournaments" && !ADMIN_MODE) tab = "home";
  closeLobbyMenu({ silent: true });
  if (cashierState.sheet) closeCashierSheet({ silent: true });
  lobbyMenuButton?.classList.remove("active");
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
  if (tab === "tournaments" && (!MINIMAL_LAUNCH || ADMIN_MODE)) runAction(loadTournaments);
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
  const visibleButtons = [...nav.querySelectorAll("button")].filter((button) => !button.hidden);
  const index = visibleButtons.findIndex((button) => {
    if (tab === "__menu") return button.hasAttribute("data-lobby-menu-trigger");
    return button.dataset.lobbyTab === tab;
  });
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

function wireCashierSheetDrag(sheet, closeSheet = closeCashierSheet) {
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
      closeSheet();
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

async function loadTournaments({ silent = false } = {}) {
  if (MINIMAL_LAUNCH && !ADMIN_MODE) {
    state.tournaments = [];
    state.tournamentHistory = [];
    renderTournaments?.();
    return;
  }
  if (!tournamentList) return;
  if (tournamentStatus && !silent) tournamentStatus.textContent = "Загружаем турниры...";
  try {
    const [data, historyData] = await Promise.all([
      api("/api/tournaments"),
      api("/api/tournaments/history").catch(() => ({ history: state.tournamentHistory || state.homeStats?.tournamentHistory || [] }))
    ]);
    state.tournaments = (data.tournaments || []).filter((tournament) => (tournament.currency || "USDT") === "USDT");
    state.tournamentHistory = historyData.history || state.tournamentHistory || [];
    processTournamentEvents(state.tournaments);
    renderTournaments();
    if (tournamentStatus && !silent) tournamentStatus.textContent = "";
  } catch (error) {
    if (tournamentStatus && !silent) tournamentStatus.textContent = "Не удалось загрузить турниры.";
    throw error;
  }
}

function processTournamentEvents(tournaments) {
  for (const tournament of tournaments || []) {
    const events = Array.isArray(tournament.events) ? tournament.events : [];
    if (!tournamentEventLastSequence.has(tournament.id)) {
      tournamentEventLastSequence.set(tournament.id, Math.max(0, ...events.map((event) => Number(event.sequence || 0))));
      continue;
    }
    const lastSequence = Number(tournamentEventLastSequence.get(tournament.id) || 0);
    for (const event of events.sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0))) {
      const sequence = Number(event.sequence || 0);
      if (!sequence || sequence <= lastSequence) continue;
      tournamentEventLastSequence.set(tournament.id, sequence);
      handleTournamentEvent(tournament, event);
    }
  }
}

function handleTournamentEvent(tournament, event) {
  const payload = event.payload || {};
  const playerId = String(state.user?.id || "");
  const isForPlayer = !payload.userId || String(payload.userId) === playerId || (payload.payouts || []).some((item) => String(item.userId) === playerId);
  if (!isForPlayer) return;

  if (event.type === "tournament_started") {
    showStatus(`Турнир «${tournament.title}» начался`);
    return;
  }
  if (event.type === "tournament_table_move") {
    const tableId = payload.toTableId || payload.tableId;
    if (!tableId) return;
    const openNow = window.confirm(`Турнир «${tournament.title}»: вас пересадили за новый стол. Открыть?`);
    if (openNow) runAction(() => openTournamentTable(tableId));
    return;
  }
  if (event.type === "payout_complete") {
    const payout = (payload.payouts || []).find((item) => String(item.userId) === playerId);
    if (payout?.amount > 0) {
      showStatus(`Выплата турнира: ${formatTournamentAmountText(payout.amount, "cash")}`);
    } else if (tournament.playerState?.status === "finished") {
      showStatus(`Турнир завершён. Место ${tournament.playerState.place || "—"}`);
    }
  }
}

function renderTournaments() {
  if (!tournamentList) return;
  tournamentList.replaceChildren();
  renderTournamentRegistrationNotice();
  renderTournamentHistoryList(tournamentHistoryList, state.tournamentHistory, {
    emptyText: "История участия появится после первого завершённого турнира.",
    limit: 6
  });
  if (tournamentHistoryMeta) {
    const count = Number(state.tournamentHistory?.length || 0);
    tournamentHistoryMeta.textContent = count
      ? `${count} ${plural(count, "результат", "результата", "результатов")}`
      : "история";
  }

  if (!state.tournaments.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Cash-турниров пока нет.";
    tournamentList.append(empty);
    return;
  }

  for (const tournament of state.tournaments) {
    const node = document.createElement("article");
    node.className = "tournament-card";
    node.dataset.tournamentCard = tournament.id;
    node.dataset.status = tournament.status;
    const badge = tournamentBadge(tournament);
    const action = tournamentActionProps(tournament);
    const playerNote = tournamentPlayerNote(tournament);
    const timing = tournamentStartParts(tournament);
    const buyIn = formatTournamentAmountText(tournament.buyIn, tournament.balanceBucket);
    const fee = formatTournamentAmountText(tournament.fee, tournament.balanceBucket);

    node.innerHTML = `
      <div class="tournament-card-shell">
        <div class="tournament-card-timebox">
          <strong>${escapeHtml(timing.time)}</strong>
          <small>${escapeHtml(timing.day)}</small>
        </div>
        <div class="tournament-card-main">
          <div class="tournament-card-head">
            <div class="tournament-card-copy">
              <strong>${escapeHtml(tournament.title)}</strong>
              <small>${escapeHtml(tournamentTypeLabel(tournament.type))} · <span>USDT</span></small>
            </div>
            <b class="tournament-status-pill" data-state="${badge.state}">${escapeHtml(badge.text)}</b>
          </div>
          <div class="tournament-card-facts">
            <span><small>Призовой</small><strong>${escapeHtml(formatTournamentAmountText(tournament.prizePool, tournament.balanceBucket))}</strong></span>
            <span><small>Игроки</small><strong>${escapeHtml(`${tournament.participants}/${tournament.maxPlayers}`)}</strong></span>
          </div>
          <div class="tournament-card-entry">
            <span><small>Бай-ин + fee</small><strong>${escapeHtml(buyIn)} <i>+</i> ${escapeHtml(fee)}</strong></span>
            <button
              type="button"
              data-tournament-action="${action.action}"
              data-tournament-id="${tournament.id}"
              ${action.tableId ? `data-table-id="${action.tableId}"` : ""}
              ${action.disabled || pendingTournamentRequests.has(tournament.id) ? "disabled" : ""}
            >${escapeHtml(action.text)}</button>
          </div>
          ${playerNote ? `<p class="tournament-player-note">${escapeHtml(playerNote)}</p>` : ""}
        </div>
      </div>
    `;
    tournamentList.append(node);
  }
}

function renderTournamentRegistrationNotice() {
  const registered = state.tournaments.find((tournament) => {
    const playerStatus = tournament.playerState?.status;
    return tournament.registered || playerStatus === "registered" || playerStatus === "playing";
  });
  if (tournamentRegistrationNotice) {
    tournamentRegistrationNotice.hidden = !registered;
    tournamentRegistrationNotice.style.setProperty("display", registered ? "" : "none", registered ? "" : "important");
  }
  if (tournamentRegistrationBadge) {
    tournamentRegistrationBadge.hidden = !registered;
    tournamentRegistrationBadge.style.setProperty("display", registered ? "" : "none", registered ? "" : "important");
  }
  window.clearInterval(tournamentRegistrationNoticeTimer);
  const updateMeta = () => {
    if (!tournamentRegistrationMeta || !registered) return;
    const startsAt = new Date(registered.startsAt || "").getTime();
    const remaining = startsAt - Date.now();
    if (Number.isFinite(startsAt) && remaining > 0 && remaining <= 12 * 60 * 60 * 1000) {
      const totalSeconds = Math.floor(remaining / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      tournamentRegistrationMeta.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      return;
    }
    tournamentRegistrationMeta.textContent = formatTournamentStartLabel(registered);
  };
  if (registered) {
    updateMeta();
    tournamentRegistrationNoticeTimer = window.setInterval(updateMeta, 1000);
  } else if (tournamentRegistrationMeta) {
    tournamentRegistrationMeta.textContent = "Открыть";
  }
  if (tournamentRegistrationTitle) tournamentRegistrationTitle.textContent = registered?.title || "Турнир";
}

async function onTournamentAction(event) {
  const button = event.target.closest("[data-tournament-action]");
  if (button) {
    event.preventDefault();
    event.stopPropagation();
    await handleTournamentActionButton(button);
    return;
  }
  const card = event.target.closest("[data-tournament-card]");
  if (!card) return;
  await openTournamentDetails(card.dataset.tournamentCard);
}

async function handleTournamentActionButton(button) {
  if (!button) return;
  if (button.dataset.tournamentAction === "open-table") {
    closeTournamentDetails();
    await openTournamentTable(button.dataset.tableId);
    return;
  }
  const id = button.dataset.tournamentId;
  const action = button.dataset.tournamentAction;
  if (!id || !["register", "cancel"].includes(action)) return;
  const tournament = state.tournaments.find((item) => item.id === id);
  const totalCost = tournament ? formatTournamentAmountText(Number(tournament.buyIn || 0) + Number(tournament.fee || 0), "cash") : "сумма из API";
  const confirmed = window.confirm(action === "cancel"
    ? `Отменить регистрацию и вернуть ${totalCost}?`
    : `Подтвердить регистрацию в cash-турнир? Будет списано ${totalCost} (buy-in + fee).`);
  if (!confirmed) return;
  pendingTournamentRequests.add(id);
  button.disabled = true;
  if (tournamentStatus) {
    tournamentStatus.textContent = action === "cancel" ? "Отправляем отмену..." : "Отправляем регистрацию...";
  }
  const endpoint = action === "cancel" ? "cancel" : "register";
  try {
    const data = await api(`/api/tournaments/${id}/${endpoint}`, {
      method: "POST",
      idempotencyKey: requestKey(`tournament-${endpoint}-${id}`)
    });
    state.tournaments = (data.tournaments || []).filter((tournament) => (tournament.currency || "USDT") === "USDT");
    state.tournamentHistory = data.profile?.tournamentHistory || state.tournamentHistory || [];
    if (data.profile) {
      state.user.balance = Number(data.profile.balance || state.user?.balance || 0);
      state.user.cashBalanceMicros = Number(data.profile.cashBalanceMicros || state.user?.cashBalanceMicros || 0);
      renderProfile(data.profile);
    }
    if (data.cashier) renderCashier(data.cashier);
    renderModeBalance();
    renderHomeCta();
    renderTournaments();
    if (state.selectedTournamentId === id) {
      await refreshOpenTournamentDetails(id);
    }
    if (tournamentStatus) {
      tournamentStatus.textContent = action === "cancel"
        ? "Регистрация отменена, buy-in и fee возвращены."
        : "Регистрация подтверждена: buy-in + fee списаны.";
    }
    haptic("success");
  } catch (error) {
    if (error.status === 409) {
      if (tournamentStatus) tournamentStatus.textContent = error.message;
      await loadTournaments();
      if (state.selectedTournamentId === id) {
        await refreshOpenTournamentDetails(id).catch(() => {});
      }
      haptic("warning");
      return;
    }
    throw error;
  } finally {
    pendingTournamentRequests.delete(id);
    renderTournaments();
    syncTournamentDetailAction();
  }
}

async function onTournamentDetailAction() {
  if (!tournamentDetailAction) return;
  await handleTournamentActionButton(tournamentDetailAction);
}

function closeTournamentDetails() {
  window.clearInterval(tournamentCountdownTimer);
  state.selectedTournamentId = "";
  state.selectedTournamentDetails = null;
  document.body.classList.remove("cashier-sheet-open", "tournament-sheet-open");
  if (tournamentDetailBackdrop) tournamentDetailBackdrop.hidden = true;
  if (tournamentDetailSheet) {
    tournamentDetailSheet.hidden = true;
    tournamentDetailSheet.classList.remove("sheet-visible", "sheet-open");
    tournamentDetailSheet.style.removeProperty("--sheet-drag-y");
  }
  if (tournamentDetailHome?.sheetParent) {
    tournamentDetailHome.sheetParent.insertBefore(tournamentDetailSheet, tournamentDetailHome.sheetNextSibling);
  }
  if (tournamentDetailHome?.backdropParent) {
    tournamentDetailHome.backdropParent.insertBefore(tournamentDetailBackdrop, tournamentDetailHome.backdropNextSibling);
  }
  updateTelegramBackButton();
}

function onTournamentDetailTabSelect(event) {
  const button = event.target.closest("[data-tournament-detail-tab]");
  if (!button) return;
  const tab = button.dataset.tournamentDetailTab;
  tournamentDetailSheet.querySelectorAll("[data-tournament-detail-tab]").forEach((item) => {
    item.classList.toggle("active", item.dataset.tournamentDetailTab === tab);
  });
  tournamentDetailSheet.querySelectorAll("[data-tournament-detail-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tournamentDetailPanel === tab);
  });
}

function updateTournamentCountdown(tournament) {
  if (!tournamentDetailCountdown || !tournamentDetailStart) return;
  tournamentDetailStart.textContent = formatDateTime(tournament.startsAt) || "Старт по набору";
  const target = new Date(tournament.startsAt || "").getTime();
  if (!Number.isFinite(target)) {
    tournamentDetailCountdown.textContent = "По набору";
    return;
  }
  const remaining = Math.max(0, target - Date.now());
  if (!remaining || ["running", "final_table", "finished"].includes(tournament.status)) {
    tournamentDetailCountdown.textContent = "Турнир начался";
    return;
  }
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  tournamentDetailCountdown.textContent = `${days ? `${days}д ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function syncTournamentDetailAction() {
  if (!tournamentDetailAction || !state.selectedTournamentDetails) return;
  const tournament = state.selectedTournamentDetails;
  const action = tournamentActionProps(tournament);
  tournamentDetailAction.dataset.tournamentAction = action.action;
  tournamentDetailAction.dataset.tournamentId = tournament.id;
  if (action.tableId) {
    tournamentDetailAction.dataset.tableId = action.tableId;
  } else {
    delete tournamentDetailAction.dataset.tableId;
  }
  tournamentDetailAction.disabled = action.disabled || pendingTournamentRequests.has(tournament.id);
  tournamentDetailAction.textContent = action.text;
}

function renderTournamentDetails(tournament) {
  if (!tournamentDetailSheet || !tournamentDetailGrid || !tournamentDetailStructure || !tournamentDetailSummary || !tournamentDetailPayout) return;
  const badge = tournamentBadge(tournament);
  const infoRows = [
    ["Тип", tournamentTypeLabel(tournament.type)],
    ["Статус", tournamentStatusLabel(tournament.status)],
    ["Late reg", tournament.lateRegEndsAt ? formatDateTime(tournament.lateRegEndsAt) : "нет"],
    ["Стек", formatNumber(tournament.startingStack || 0)],
    ["Стол", `${formatNumber(tournament.maxPlayersPerTable || 0)} max`],
    ["Re-entry", Number(tournament.reEntryLimit || 0) > 0 ? String(tournament.reEntryLimit) : "нет"],
    ["Add-on", tournament.addOnAllowed ? "есть" : "нет"]
  ];
  const playerNote = tournamentPlayerNote(tournament);
  const description = /play[\s_-]*chips?|фишк/i.test(String(tournament.description || ""))
    ? "Cash-турнир с регистрацией в USDT."
    : tournament.description || "Cash-турнир с регистрацией в USDT.";
  tournamentDetailTitle.textContent = tournament.title || "Турнир";
  tournamentDetailBadge.dataset.state = badge.state;
  tournamentDetailBadge.textContent = badge.text;
  tournamentDetailSubtitle.textContent = `${tournamentTypeLabel(tournament.type)} · ${formatTournamentStartLabel(tournament)}`;
  tournamentDetailDescription.textContent = description;
  tournamentDetailSummary.innerHTML = `
    <div><span>Стоимость</span><strong>${escapeHtml(formatTournamentAmountText(tournament.totalCost ?? tournament.buyIn, "cash"))}</strong></div>
    <div><span>Игроки</span><strong>${escapeHtml(`${tournament.participants}/${tournament.maxPlayers}`)}</strong></div>
    <div><span>Призовой фонд</span><strong>${escapeHtml(formatTournamentAmountText(tournament.prizePool, "cash"))}</strong></div>
  `;
  tournamentDetailGrid.innerHTML = infoRows.map(([label, value]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
  const payoutRows = Array.isArray(tournament.payoutPreview) && tournament.payoutPreview.length
    ? tournament.payoutPreview.map((entry) => ({
      place: entry.place,
      percent: entry.percent,
      amount: formatTournamentAmountText(entry.amount, "cash")
    }))
    : (tournament.payoutStructure || []).map((entry, index) => ({
      place: index + 1,
      percent: typeof entry === "object" ? entry.percent : entry,
      amount: ""
    }));
  tournamentDetailPayout.innerHTML = payoutRows.length
    ? `<div class="tournament-payout-list">${payoutRows.map((entry) => `
        <div><b>#${escapeHtml(String(entry.place))}</b><span>${escapeHtml(String(entry.percent || 0))}%</span>${entry.amount ? `<strong>${escapeHtml(entry.amount)}</strong>` : ""}</div>
      `).join("")}</div>`
    : `<p class="empty">Призовые места появятся после формирования фонда.</p>`;
  const blindLevels = Array.isArray(tournament.blindStructure) ? tournament.blindStructure : [];
  tournamentDetailStructure.innerHTML = blindLevels.length
    ? `<div class="tournament-blinds-table">
        <div class="tournament-blinds-head"><span>Ур.</span><span>SB / BB</span><span>Ante</span><span>Время</span></div>
        ${blindLevels.map((level) => `<div>
          <b>${escapeHtml(String(level.level || "—"))}</b>
          <strong>${escapeHtml(`${formatNumber(level.smallBlind || 0)} / ${formatNumber(level.bigBlind || 0)}`)}</strong>
          <span>${escapeHtml(formatNumber(level.ante || 0))}</span>
          <span>${escapeHtml(`${Math.max(1, Math.round(Number(level.durationSeconds || 0) / 60))} мин`)}</span>
        </div>`).join("")}
      </div>`
    : `<p class="empty">Структура блайндов пока не опубликована.</p>`;
  if (tournamentDetailNote) {
    tournamentDetailNote.hidden = !playerNote;
    tournamentDetailNote.textContent = playerNote || "";
  }
  window.clearInterval(tournamentCountdownTimer);
  updateTournamentCountdown(tournament);
  tournamentCountdownTimer = window.setInterval(() => updateTournamentCountdown(tournament), 1000);
  syncTournamentDetailAction();
}

async function refreshOpenTournamentDetails(id = state.selectedTournamentId) {
  if (!id) return;
  const data = await api(`/api/tournaments/${id}`);
  state.selectedTournamentId = id;
  state.selectedTournamentDetails = data.tournament;
  processTournamentEvents([data.tournament]);
  renderTournamentDetails(data.tournament);
}

async function openTournamentDetails(id) {
  if (!id || !tournamentDetailBackdrop || !tournamentDetailSheet) return;
  if (tournamentDetailTitle) tournamentDetailTitle.textContent = "Загрузка…";
  if (tournamentDetailDescription) tournamentDetailDescription.textContent = "Подтягиваем детали турнира.";
  if (tournamentDetailGrid) tournamentDetailGrid.innerHTML = "";
  if (tournamentDetailSummary) tournamentDetailSummary.innerHTML = `<div></div><div></div><div></div>`;
  if (tournamentDetailPayout) tournamentDetailPayout.innerHTML = `<p class="empty">Загружаем данные турнира…</p>`;
  if (tournamentDetailCountdown) tournamentDetailCountdown.textContent = "--:--:--";
  if (tournamentDetailStart) tournamentDetailStart.textContent = "Загрузка времени старта";
  if (tournamentDetailStructure) tournamentDetailStructure.innerHTML = "";
  if (tournamentDetailNote) tournamentDetailNote.hidden = true;
  tournamentDetailSheet.querySelectorAll("[data-tournament-detail-tab]").forEach((item) => {
    item.classList.toggle("active", item.dataset.tournamentDetailTab === "payout");
  });
  tournamentDetailSheet.querySelectorAll("[data-tournament-detail-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tournamentDetailPanel === "payout");
  });
  document.body.append(tournamentDetailBackdrop, tournamentDetailSheet);
  tournamentDetailBackdrop.hidden = false;
  tournamentDetailSheet.hidden = false;
  tournamentDetailSheet.classList.remove("sheet-visible");
  tournamentDetailSheet.classList.add("sheet-open");
  document.body.classList.add("cashier-sheet-open", "tournament-sheet-open");
  window.requestAnimationFrame(() => tournamentDetailSheet.classList.add("sheet-visible"));
  updateTelegramBackButton();
  try {
    await refreshOpenTournamentDetails(id);
  } catch (error) {
    closeTournamentDetails();
    if (tournamentStatus) tournamentStatus.textContent = "Не удалось открыть детали турнира.";
    throw error;
  }
}

async function openTournamentTable(tableId) {
  if (!tableId) return;
  state.currentTableId = tableId;
  currentTable.hidden = false;
  enterGameMode();
  await loadCurrentTable();
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
      meta.append(` · бай-ин ${formatUsdtDisplay(table.minBuyIn || table.bigBlind * 50)}-${formatUsdtDisplay(table.maxBuyIn || table.bigBlind * 250)} USDT`);
      meta.append(` · ${table.seats.length}/${table.maxPlayers} игроков${table.isPrivate ? " · приватный" : ""}`);
    } else {
      meta.textContent = `${formatTableLimit(table)} · ${table.seats.length}/${table.maxPlayers} игроков${table.isPrivate ? " · приватный" : ""}`;
    }
    const button = node.querySelector('[data-action="join"]');
    const isViewerSeated = Boolean(table.viewer?.isSeated);
    button.textContent = isViewerSeated ? "За стол" : isFull ? "Заполнен" : "Войти";
    button.disabled = isFull && !isViewerSeated;
    button.addEventListener("click", () => joinTable(table.id));
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
    if (table.viewer?.isSeated) {
      state.currentTableId = table.id;
      enterGameMode();
      renderCurrentTable(table);
      syncTableEventCursor(table);
      startTableEventStream(table.id);
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
    syncTableEventCursor(data.table);
    await ensurePlayerFairnessSeed(data.table);
    startTableEventStream(data.table.id);
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
    syncTableEventCursor(data.table);
    await ensurePlayerFairnessSeed(data.table);
    startTableEventStream(data.table.id);
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
    syncTableEventCursor(data.table);
    await auth();
    await loadCashier();
  }
}

function buyInAmountValue() {
  const minAmount = Number(buyInAmount.dataset.min || 10000);
  const maxAmount = Number(buyInAmount.dataset.max || minAmount);
  const cashMode = buyInAmount.dataset.cashMode === "true";
  const value = cashMode
    ? parseUsdtToMicros(buyInAmount.value)
    : Number(String(buyInAmount.value || "").replace(/\s/g, ""));
  return clampAmount(value, minAmount, maxAmount);
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
  const cashMode = buyInAmount.dataset.cashMode === "true";
  buyInAmount.value = cashMode ? formatUsdtInput(safeAmount) : String(safeAmount);
  buyInSlider.value = String(safeAmount);
  renderMoneyValue(buyInDebit, safeAmount, cashMode);
  renderMoneyValue(buyInStackPreview, safeAmount, cashMode);
}

async function loadCurrentTable() {
  const data = await api(`/api/tables/${state.currentTableId}`);
  renderCurrentTable(data.table);
  syncTableEventCursor(data.table);
  await ensurePlayerFairnessSeed(data.table);
  startTableEventStream(state.currentTableId);
}

async function ensurePlayerFairnessSeed(table) {
  if (!table?.id || !state.user?.id || !table.viewer?.isSeated) return;
  if (!["waiting", "starting", "showdown"].includes(table.status)) return;

  const viewerSeat = (table.seats || []).find((seat) => seat.userId === state.user.id);
  if (!viewerSeat) return;

  const syncKey = `${table.id}:${table.status}:${viewerSeat.fairnessSeedSource}:${viewerSeat.fairnessSeedHash || "missing"}`;
  if (fairnessSeedSyncing || fairnessSeedSyncedTables.has(syncKey)) return;

  fairnessSeedSyncing = true;
  fairnessSeedSyncedTables.add(syncKey);
  try {
    const seed = getLocalFairnessSeed();
    let data;
    if (table.status === "starting" && table.fairness?.phase === "commit_reveal" && viewerSeat.fairnessSeedSource === "player-commit-pending") {
      data = await api(`/api/tables/${table.id}/fairness-reveal`, { method: "POST", body: { seed } });
    } else if (["waiting", "showdown", "starting"].includes(table.status) && !["player-commit-pending", "player-commit-reveal"].includes(viewerSeat.fairnessSeedSource)) {
      data = await api(`/api/tables/${table.id}/fairness-commit`, {
        method: "POST",
        body: { seedHash: await sha256Hex(seed) }
      });
    } else {
      return;
    }
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

async function leaveCurrentTable() {
  if (!state.currentTableId) return;
  const table = state.currentTable;
  const stack = Number(table?.viewer?.stack || 0);
  const amountText = table ? formatTableAmount(table, stack) : "";
  const confirmed = await showConfirm(`Покинуть стол?${amountText ? `\nСтек ${amountText} вернётся на баланс.` : ""}`);
  if (!confirmed) return;

  const tableId = state.currentTableId;
  await api(`/api/tables/${tableId}/leave`, {
    method: "POST",
    idempotencyKey: requestKey(`table-leave-${tableId}`)
  });
  closeMenu();
  state.currentTableId = "";
  resetTableEventCursor(tableId);
  stopTableEventStream();
  state.currentTable = null;
  currentTable.hidden = true;
  lobby.hidden = false;
  document.body.classList.remove("in-game");
  closeDrawer();
  selectLobbyTab("home");
  await auth();
  await loadCashier();
  await loadTables();
  resetScroll();
  updateTelegramBackButton();
}

async function sitAtTable() {
  if (!state.currentTableId) return;
  if (!state.currentTable?.viewer?.isSeated) {
    await joinTable(state.currentTableId);
    return;
  }
  const data = await api(`/api/tables/${state.currentTableId}/join`, { method: "POST" });
  closeMenu();
  renderCurrentTable(data.table);
}

async function returnToSeat() {
  const viewerSeat = (state.currentTable?.seats || []).find((seat) => String(seat.userId) === String(state.user?.id));
  if (state.currentTable?.viewer?.sittingOutReason === "rebuy") {
    await buyIn();
    return;
  }
  if (state.currentTable?.viewer?.sittingOut || viewerSeat?.sitOutNextHand) {
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
  state.currentTableId = "";
  stopTableEventStream();
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

async function backToLobbyFromTable() {
  if (state.currentTable?.viewer?.isSeated) {
    const confirmed = await showConfirm("Вернуться в лобби?\nВы останетесь за столом.");
    if (!confirmed) return;
  }
  await goToLobby();
}

function startTableEventStream(tableId) {
  if (!tableId || tableEventStreamId === tableId || !state.token) return;
  window.clearTimeout(tableEventReconnectTimer);
  const resumeSameTable = tableEventLastId.startsWith(`${tableId}:`);
  stopTableEventStream({ preserveLastEventId: resumeSameTable });
  tableEventStreamId = tableId;
  tableEventAbortController = new AbortController();
  currentTable.classList.remove("is-reconnecting");
  consumeTableEventStream(tableId, tableEventAbortController.signal).catch((error) => {
    if (error.name !== "AbortError") console.error("Table event stream:", error);
    if (tableEventStreamId === tableId) {
      tableEventStreamId = "";
      tableEventReconnectTimer = window.setTimeout(() => {
        if (tableEventEverConnected && state.currentTableId === tableId) currentTable.classList.add("is-reconnecting");
        if (state.currentTableId === tableId) loadCurrentTable().catch(console.error);
      }, 2500);
    }
  });
}

function stopTableEventStream({ preserveLastEventId = false } = {}) {
  window.clearTimeout(tableEventReconnectTimer);
  tableEventAbortController?.abort();
  tableEventAbortController = null;
  tableEventStreamId = "";
  tableEventEverConnected = false;
  if (!preserveLastEventId) tableEventLastId = "";
}

function syncTableEventCursor(table) {
  if (!table?.id) return;
  const lastSequence = Math.max(0, ...(table.events || []).map((event) => Number(event.sequence || 0)));
  tableEventLastSequence.set(table.id, lastSequence);
  if (lastSequence > 0) tableEventLastId = `${table.id}:${lastSequence}`;
  else if (tableEventLastId.startsWith(`${table.id}:`)) tableEventLastId = "";
}

function resetTableEventCursor(tableId) {
  if (!tableId) return;
  tableEventLastSequence.delete(tableId);
  for (let index = tableEventQueue.length - 1; index >= 0; index -= 1) {
    if (tableEventQueue[index]?.tableId === tableId) tableEventQueue.splice(index, 1);
  }
  if (tableEventLastId.startsWith(`${tableId}:`)) tableEventLastId = "";
}

async function consumeTableEventStream(tableId, signal) {
  const headers = { authorization: `Bearer ${state.token}` };
  if (tableEventLastId) headers["Last-Event-ID"] = tableEventLastId;
  const response = await fetch(`/api/tables/${tableId}/events`, { headers, signal });
  if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);
  tableEventEverConnected = true;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const event = parseSseEvent(chunk);
      if (!event?.id) continue;
      tableEventLastId = event.id;
      enqueueTableEvents(tableId, [event]);
      scheduleTableSnapshotRefresh(tableId);
    }
  }
  if (!signal.aborted) throw new Error("SSE closed");
}

function parseSseEvent(chunk) {
  const lines = String(chunk || "").split("\n");
  const id = lines.find((line) => line.startsWith("id:"))?.replace(/^id:\s*/, "") || "";
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("\n");
  if (!data) return id ? { id } : null;
  try {
    return { ...JSON.parse(data), id };
  } catch {
    return id ? { id } : null;
  }
}

function enqueueTableEvents(tableId, events) {
  const normalized = (events || [])
    .filter((event) => event && Number(event.sequence || 0) > Number(tableEventLastSequence.get(tableId) || 0))
    .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
  if (!normalized.length) return;
  tableEventQueue.push(...normalized.map((event) => ({ tableId, event })));
  processTableEventQueue();
}

async function processTableEventQueue() {
  if (tableEventProcessing) return;
  tableEventProcessing = true;
  try {
    while (tableEventQueue.length) {
      const { tableId, event } = tableEventQueue.shift();
      if (state.currentTableId !== tableId) continue;
      const sequence = Number(event.sequence || 0);
      if (!sequence || sequence <= Number(tableEventLastSequence.get(tableId) || 0)) continue;
      tableEventLastSequence.set(tableId, sequence);
      tableEventLastId = event.id || `${tableId}:${sequence}`;
      playTableEvent(event);
      await tableEventSleep(tableEventDelay(event.type));
    }
  } finally {
    tableEventProcessing = false;
  }
}

function scheduleTableSnapshotRefresh(tableId) {
  if (tableEventRefreshQueued || state.currentTableId !== tableId) return;
  tableEventRefreshQueued = true;
  window.setTimeout(async () => {
    try {
      if (state.currentTableId === tableId) await loadCurrentTable();
    } finally {
      tableEventRefreshQueued = false;
    }
  }, 120);
}

function playTableEvent(event) {
  const payload = event.payload || {};
  const table = state.currentTable || {};
  const text = tableEventText(event, table);
  currentTable.dataset.realtimeEvent = event.type || "";
  currentTable.classList.toggle("is-all-in-runout", event.type === "all_in_runout_start" || event.type === "runout_card_revealed");
  currentTable.classList.toggle("is-showdown", event.type === "showdown_reveal");
  currentTable.classList.toggle("is-pot-push", event.type === "pot_push" || event.type === "odd_chip_award");
  if (["seat_disconnected", "seat_return"].includes(event.type)) currentTable.classList.add("presence-pulse");
  if (text) showTableEventToast(text);

  if (event.type === "street_reveal" || event.type === "runout_card_revealed" || event.type === "showdown_reveal" || event.type === "pot_push") {
    showStreetEventOverlay(event, text);
  }
  if (event.type === "tournament_table_move" && String(payload.userId) === String(state.user?.id) && payload.toTableId) {
    const openNow = window.confirm("Вас пересадили за новый турнирный стол. Открыть?");
    if (openNow) runAction(() => openTournamentTable(payload.toTableId));
  }
}

function tableEventText(event, table) {
  const payload = event.payload || {};
  const seat = (table.seats || []).find((item) => String(item.userId) === String(payload.userId));
  const name = seat?.name || payload.name || "Игрок";
  const amount = payload.amount ? formatTableAmount(table, payload.amount) : "";
  const labels = {
    hand_start: "Новая раздача",
    blind_posted: `${name}: ${payload.blind === "small" ? "малый" : "большой"} блайнд ${amount}`,
    ante_posted: `${name}: ante ${amount}`,
    hole_cards_dealt: "Карты розданы",
    action_prompt: String(payload.userId) === String(state.user?.id) ? "Ваш ход" : `${name} думает`,
    check: `${name}: чек${payload.automatic ? " · авто" : ""}`,
    call: `${name}: колл ${amount}${payload.automatic ? " · авто" : ""}`,
    bet: `${name}: ставка ${amount}`,
    raise: `${name}: рейз ${payload.to ? formatTableAmount(table, payload.to) : amount}`,
    fold: `${name}: фолд${payload.automatic ? " · авто" : ""}`,
    street_reveal: `${streetName(payload.street)} ${Array.isArray(payload.cards) ? payload.cards.join(" ") : ""}`.trim(),
    all_in_runout_start: "All-in runout",
    runout_card_revealed: `Runout: ${payload.card || ""}`.trim(),
    showdown_reveal: "Шоудаун: открываем карты",
    pot_push: `Банк отправлен победителю${amount ? ` · ${amount}` : ""}`,
    odd_chip_award: `Odd chip: ${name}`,
    seat_sit_out: `${name}: sit out`,
    seat_return: `${name}: вернулся`,
    seat_disconnected: `${name}: reconnect`,
    seat_busted: `${name}: выбыл`,
    tournament_level_up: "Новый уровень блайндов",
    tournament_table_move: "Пересадка за новый стол",
    final_table_started: "Финальный стол",
    payout_complete: "Выплаты завершены"
  };
  return labels[event.type] || "";
}

function showTableEventToast(text) {
  if (!text) return;
  lastToastText = text;
  actionToast.hidden = false;
  actionToast.textContent = text;
  actionToast.classList.remove("show");
  void actionToast.offsetWidth;
  actionToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    actionToast.classList.remove("show");
    window.setTimeout(() => { actionToast.hidden = true; }, 220);
  }, 1150);
}

function showStreetEventOverlay(event, text) {
  if (!streetOverlay) return;
  const title = event.type === "pot_push" ? "Банк"
    : event.type === "showdown_reveal" ? "Шоудаун"
    : event.type === "runout_card_revealed" ? "Runout"
    : streetName(event.payload?.street) || "Стол";
  streetOverlay.querySelector("strong").textContent = title;
  streetOverlay.querySelector("span").textContent = text || "";
  streetOverlay.hidden = false;
  streetOverlay.classList.remove("show");
  void streetOverlay.offsetWidth;
  streetOverlay.classList.add("show");
  clearTimeout(streetOverlayTimer);
  streetOverlayTimer = window.setTimeout(() => {
    streetOverlay.classList.remove("show");
    window.setTimeout(() => { streetOverlay.hidden = true; }, 260);
  }, 900);
}

function tableEventDelay(type) {
  if (["street_reveal", "runout_card_revealed", "showdown_reveal", "pot_push"].includes(type)) return 180;
  if (["hand_start", "hole_cards_dealt", "all_in_runout_start"].includes(type)) return 140;
  return 80;
}

function streetName(street) {
  return { flop: "Флоп", turn: "Терн", river: "Ривер", runout: "Runout" }[street] || "";
}

function tableEventSleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function showConfirm(message) {
  return new Promise((resolve) => {
    if (tg?.showConfirm) {
      try {
        tg.showConfirm(message, (confirmed) => resolve(Boolean(confirmed)));
        return;
      } catch {
        resolve(window.confirm(message));
        return;
      }
    }
    resolve(window.confirm(message));
  });
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
  currentTable.dataset.tableStatus = table.status || "";
  currentTable.classList.remove("is-reconnecting");
  currentTable.classList.toggle("viewer-disconnected", Boolean(table.viewer?.connected === false));
  currentTable.classList.toggle("viewer-busted", table.viewer?.status === "busted" || table.viewer?.busted === true);
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
  const viewerSeat = (table.seats || []).find((seat) => seat.userId === state.user?.id);
  const viewerHand = evaluateVisibleHand([...(viewerSeat?.cards || []), ...(table.communityCards || [])]);
  renderViewerHandBadge(viewerHand, table);
  maybeHapticForViewerTurn(table);
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
  const winningSeatIds = winningSeatIdSet(table);
  const boardHighlightCards = highlightedBoardCards(table, viewerHand, winningSeatIds);
  const nextCommunityKey = table.communityCards.join("|");
  const animateCommunity = nextCommunityKey !== communityCardsKey;
  communityCardsKey = nextCommunityKey;
  communityCards.replaceChildren(...renderCommunityCards(table.communityCards, {
    animate: animateCommunity,
    highlightCards: boardHighlightCards
  }));
  const shouldPayWinners = maybeAnimatePotToWinners(table, winningSeatIds);
  seats.replaceChildren(
    ...table.seats.map((seat, index) => {
      const node = document.createElement("article");
      node.dataset.userId = seat.userId;
      const seatCardKey = `${table.handNumber}:${seat.userId}:${seat.cards.join("|")}`;
      const previousCardKey = previousSeatCardKeys.get(seat.userId) || "";
      const shouldAnimateCards = Boolean(seat.cards.length && seatCardKey !== previousCardKey);
      const seatHand = evaluateVisibleHand([...(seat.cards || []), ...(table.communityCards || [])]);
      const highlightCards = seat.userId === state.user?.id || winningSeatIds.has(seat.userId)
        ? seatHand.cards
        : [];
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
        seat.connected === false ? "disconnected" : "",
        seat.reconnectDeadline ? "reconnecting" : "",
        seat.busted ? "busted" : "",
        seat.folded ? "folded" : "",
        becameFolded ? "fold-out" : "",
        seat.userId === state.user?.id ? "viewer-seat" : "",
        seat.isAllIn ? "all-in" : "",
        shouldAnimateBet ? "bet-pop" : "",
        winningSeatIds.has(seat.userId) ? "winner" : "",
        winningSeatIds.has(seat.userId) && shouldPayWinners ? "winner-paid" : "",
        seat.userId === state.user?.id && viewerHand.rank >= 1 ? `viewer-made-hand hand-rank-${viewerHand.rank}` : ""
      ].filter(Boolean).join(" ");
      node.innerHTML = `
        <div class="seat-avatar"></div>
        <div class="seat-cards"></div>
        <div class="seat-action-label"></div>
        <div class="bet-spot">
          <div class="chip-stack" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <span class="bet-amount"></span>
        </div>
        <div class="seat-plate">
          <div class="seat-name"></div>
          <div class="seat-timer"><span></span></div>
          <div class="seat-meta"></div>
          <div class="seat-hand-label"></div>
        </div>
      `;
      const badges = [
        index === table.dealerIndex ? "D" : "",
        index === table.smallBlindIndex ? "SB" : "",
        index === table.bigBlindIndex ? "BB" : "",
        seat.isAllIn ? "All-in" : "",
        seat.sitOutNextHand ? "Away next" : "",
        seat.sittingOut ? sittingOutLabel(seat) : "",
        seat.connected === false ? "Reconnect" : "",
        seat.busted ? "Busted" : ""
      ].filter(Boolean);
      renderAvatar(node.querySelector(".seat-avatar"), seat);
      node.querySelector(".seat-name").textContent = seat.name;
      renderTableValue(node.querySelector(".seat-meta"), table, seat.stack);
      const actionLabel = lastSeatActionLabel(table, seat);
      const actionLabelNode = node.querySelector(".seat-action-label");
      actionLabelNode.textContent = actionLabel;
      actionLabelNode.hidden = !actionLabel;
      const handLabel = node.querySelector(".seat-hand-label");
      if (seat.userId === state.user?.id && viewerHand.label && viewerHand.rank >= 1) {
        handLabel.textContent = viewerHand.label;
      } else if (winningSeatIds.has(seat.userId) && seatHand.label) {
        handLabel.textContent = seatHand.label;
      } else {
        handLabel.hidden = true;
      }
      node.querySelector(".seat-cards").replaceChildren(...renderCards(seat.cards, {
        animate: shouldAnimateCards,
        highlightCards
      }));
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
  const viewerSeat = (table.seats || []).find((seat) => String(seat.userId) === String(state.user?.id));
  const sitOutNextHand = Boolean(viewerSeat?.sitOutNextHand);
  const tableIsFull = table.seats.length >= table.maxPlayers;
  const canSit = !isSeated && !tableIsFull;
  sitButton.hidden = true;
  observerBanner.hidden = isSeated && !isSittingOut && !sitOutNextHand;
  observerSitButton.hidden = !canSit && !isSittingOut;
  if (sitOutNextHand && !isSittingOut) {
    observerBanner.querySelector("strong").textContent = "Отойдёте со следующей раздачи";
    observerHint.textContent = "Текущая раздача доигрывается по правилам. После неё вы будете в sit out.";
    observerSitButton.textContent = "Вернуться";
    observerSitButton.hidden = false;
  } else if (isSittingOut) {
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
  sitOutButton.hidden = !isSeated || isSittingOut || sitOutNextHand;
  quickSitOutButton.hidden = !isSeated || isSittingOut || sitOutNextHand;
  buyInButton.disabled = !table.viewer?.canBuyIn;
  quickBuyInButton.disabled = !table.viewer?.canBuyIn;
  quickBuyInButton.hidden = !isSeated;
}

function lastSeatActionLabel(table, seat) {
  const name = String(seat?.name || "");
  if (!name || !Array.isArray(table?.actionLog)) return "";
  const activeHandStatuses = new Set(["preflop", "flop", "turn", "river", "runout", "showdown"]);
  if (!activeHandStatuses.has(table?.status) || !seat?.cards?.length) return "";
  const currentHand = Number(table.handNumber || 0);
  const last = table.actionLog
    .slice()
    .reverse()
    .find((item) => {
      if (Number(item.handNumber || 0) !== currentHand) return false;
      return String(item.text || "").startsWith(`${name}:`);
    });
  if (!last) return "";
  return compactActionLabel(last.text);
}

function compactActionLabel(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("auto-fold")) return "Фолд";
  if (value.includes("fold")) return "Фолд";
  if (value.includes("all-in")) return "All-in";
  if (value.includes("raise")) return "Рейз";
  if (value.includes("bet")) return "Ставка";
  if (value.includes("call")) return "Колл";
  if (value.includes("check")) return "Чек";
  return "";
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
  if (!state.currentTableId && currentTable.hidden) {
    openLobbyMenu();
    return;
  }
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

function openLobbyMenu() {
  if (!lobbyMenuSheet || !lobbyMenuBackdrop) return;
  haptic("light");
  closeCashierSheet({ silent: true });
  lobbyMenuButton?.classList.add("active", "nav-pressed");
  window.setTimeout(() => lobbyMenuButton?.classList.remove("nav-pressed"), 360);
  updateBottomNavIndicator("__menu");
  lobbyMenuBackdrop.hidden = false;
  lobbyMenuSheet.hidden = false;
  lobbyMenuSheet.classList.add("sheet-open");
  lobbyMenuSheet.style.setProperty("--sheet-drag-y", "0px");
  document.body.classList.add("lobby-menu-open");
  window.requestAnimationFrame(() => lobbyMenuSheet.classList.add("sheet-visible"));
  updateTelegramBackButton();
}

function closeLobbyMenu(options = {}) {
  if (!lobbyMenuSheet || !lobbyMenuBackdrop || lobbyMenuSheet.hidden) return;
  lobbyMenuSheet.classList.remove("sheet-visible");
  document.body.classList.remove("lobby-menu-open");
  const finish = () => {
    lobbyMenuSheet.hidden = true;
    lobbyMenuBackdrop.hidden = true;
    lobbyMenuSheet.classList.remove("sheet-open");
    lobbyMenuSheet.style.removeProperty("--sheet-drag-y");
    lobbyMenuButton?.classList.remove("active");
    updateBottomNavIndicator();
    if (!options.silent) updateTelegramBackButton();
  };
  if (options.silent) finish();
  else window.setTimeout(finish, 180);
}

function onLobbyMenuAction(event) {
  const button = event.target.closest("[data-menu-action]");
  if (!button) return;

  const action = button.dataset.menuAction;
  closeLobbyMenu({ silent: true });
  if (action === "profile") {
    selectLobbyTab("profile");
  } else if (action === "cashier") {
    runAction(() => openCashierSection("deposit"));
  } else if (action === "details") {
    runAction(() => openCashierSection("history"));
  } else if (action === "support") {
    showStatus("Поддержку подключим отдельным разделом");
    updateTelegramBackButton();
  } else if (action === "affiliate") {
    selectLobbyTab("affiliate");
    updateTelegramBackButton();
  }
}

async function inviteToTable() {
  if (!state.currentTableId) return;

  const table = state.currentTable;
  const blindText = table ? formatTableLimit(table) : "";
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

function renderPokerHandsGuide() {
  if (!pokerHandsGuide) return;
  const hands = [
    ["Роял-флеш", "A K Q J 10 одной масти", "Самая сильная комбинация."],
    ["Стрит-флеш", "5 карт подряд одной масти", "Например 9-8-7-6-5 пики."],
    ["Каре", "4 карты одного ранга", "Например четыре дамы."],
    ["Фулл-хаус", "Тройка + пара", "Например K-K-K и 7-7."],
    ["Флеш", "5 карт одной масти", "Порядок карт не важен."],
    ["Стрит", "5 карт подряд", "Туз может быть A-K-Q-J-10 или A-2-3-4-5."],
    ["Сет / тройка", "3 карты одного ранга", "Например три девятки."],
    ["Две пары", "2 пары разных рангов", "Например A-A и 8-8."],
    ["Пара", "2 карты одного ранга", "Например J-J."],
    ["Старшая карта", "Когда комбинации нет", "Побеждает самая высокая карта."]
  ];
  pokerHandsGuide.replaceChildren(...hands.map(([title, example, text], index) => {
    const row = document.createElement("div");
    row.className = "poker-hand-row";
    row.innerHTML = "<b></b><div><strong></strong><span></span><small></small></div>";
    row.querySelector("b").textContent = String(index + 1);
    row.querySelector("strong").textContent = title;
    row.querySelector("span").textContent = example;
    row.querySelector("small").textContent = text;
    return row;
  }));
}

function renderViewerHandBadge(hand, table) {
  if (!viewerHandBadge) return;
  const active = Boolean(table.viewer?.isSeated && hand && hand.cards.length >= 2 && ["preflop", "flop", "turn", "river", "runout", "showdown"].includes(table.status));
  viewerHandBadge.hidden = !active;
  currentTable.classList.toggle("viewer-made-hand-active", active && hand.rank >= 1);
  if (!active) return;
  viewerHandBadge.dataset.rank = String(hand.rank || 0);
  viewerHandBadge.querySelector("strong").textContent = hand.label || "Старшая карта";
}

function maybeHapticForViewerTurn(table) {
  const key = table.viewer?.canAct
    ? `${table.id}:${table.handNumber}:${table.activeSeatIndex}:${table.status}`
    : "";
  if (!key || key === viewerActionHapticKey) return;
  viewerActionHapticKey = key;
  haptic("medium");
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
  const text = visibleTableMessage(table) || "";
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
  const message = visibleTableMessage(table);
  if (table.status === "showdown" && message) {
    return { title: "Шоудаун", subtitle: message, duration: 980 };
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
  const cashMode = state.currentTable?.gameMode === "cash";
  row.querySelector("span").textContent = mainPot
    ? `${mainPot.winners.join(", ")} +${cashMode ? formatUsdtDisplay(mainPot.amount) : formatChips(mainPot.amount)}`
    : "Без банка";
  row.querySelector(".hand-history-board").replaceChildren(...renderCards(hand.board || []));
  row.querySelector(".hand-history-pots").replaceChildren(...(hand.pots || []).map((potItem) => {
    const item = document.createElement("div");
    item.textContent = `${potItem.label}: ${cashMode ? formatUsdtDisplay(potItem.amount) : formatChips(potItem.amount)} · ${potItem.winners.join(", ")}`;
    return item;
  }));
  row.querySelector(".hand-history-players").replaceChildren(...(hand.seats || []).map((seat) => {
    const item = document.createElement("div");
    item.className = "hand-history-player";
    item.innerHTML = "<span></span><div></div><strong></strong>";
    item.querySelector("span").textContent = seat.name;
    item.querySelector("div").replaceChildren(...renderCards(seat.cards || []));
    item.querySelector("strong").textContent = `${seat.profit >= 0 ? "+" : ""}${cashMode ? formatUsdtDisplay(seat.profit) : formatChips(seat.profit)}`;
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
    ["Раздача", `#${table.handNumber || 0}`],
    ["Fairness", fairnessProofLabel(table)]
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
  statsTable.replaceChildren(
    headerRow(["Игроки", "Бай-ин", "Выигрыш"]),
    ...table.seats.map((seat) => {
      const initialStack = Number(seat.handStartStack ?? seat.stack + seat.totalBet);
      const profit = seat.stack - initialStack;
      const row = document.createElement("div");
      row.className = "stats-row";
      row.innerHTML = `<span></span><span></span><strong></strong>`;
      row.children[0].textContent = seat.name;
      row.children[1].textContent = formatTableAmount(table, initialStack);
      row.children[2].textContent = `${profit >= 0 ? "+" : ""}${formatTableAmount(table, profit)}`;
      row.children[2].className = profit >= 0 ? "positive" : "negative";
      return row;
    })
  );
}

function fairnessProofLabel(table) {
  const fairness = table?.fairness || {};
  if (fairness.serverSeed || fairness.revealedServerSeed) return "seed раскрыт";
  if (fairness.serverSeedHash || fairness.serverCommit) return "server commit";
  if (fairness.phase === "commit_reveal") return "ожидаем reveal";
  if (fairness.phase) return fairness.phase;
  return "commit/reveal";
}

function winningSeatIdSet(table) {
  const winnerNames = new Set();
  const lastHand = (table.handHistory || [])[0];
  if (table.status === "showdown" && lastHand?.handNumber === table.handNumber) {
    for (const potItem of lastHand.pots || []) {
      for (const winner of potItem.winners || []) winnerNames.add(winner);
    }
  }
  if (!winnerNames.size && table.status === "showdown") {
    for (const seat of table.seats || []) {
      if (table.message?.includes(`${seat.name} забирает`)) winnerNames.add(seat.name);
    }
  }
  return new Set((table.seats || [])
    .filter((seat) => winnerNames.has(seat.name))
    .map((seat) => seat.userId));
}

function highlightedBoardCards(table, viewerHand, winnerIds) {
  const boardCards = new Set(table.communityCards || []);
  const highlighted = new Set();
  const collect = (cards = []) => {
    for (const card of cards) {
      if (boardCards.has(card)) highlighted.add(card);
    }
  };
  if (viewerHand?.rank >= 1) collect(viewerHand.cards);
  for (const seat of table.seats || []) {
    if (!winnerIds.has(seat.userId)) continue;
    const seatHand = evaluateVisibleHand([...(seat.cards || []), ...(table.communityCards || [])]);
    collect(seatHand.cards);
  }
  return [...highlighted];
}

function maybeAnimatePotToWinners(table, winnerIds) {
  if (table.status !== "showdown" || !winnerIds.size) return false;
  const key = `${table.id}:${table.handNumber}:${[...winnerIds].sort().join("|")}:${table.pot}`;
  if (key === showdownPayoutKey) return false;
  showdownPayoutKey = key;
  window.requestAnimationFrame(() => animatePotToWinners(winnerIds));
  return true;
}

function animatePotToWinners(winnerIds) {
  const board = document.querySelector(".board");
  if (!board || !potChips) return;
  const boardRect = board.getBoundingClientRect();
  const potRect = potChips.getBoundingClientRect();
  const fromX = potRect.left + potRect.width / 2 - boardRect.left;
  const fromY = potRect.top + potRect.height / 2 - boardRect.top;
  const winners = [...board.querySelectorAll(".seat.winner")].filter((seat) => winnerIds.has(seat.dataset.userId));
  winners.forEach((seat, index) => {
    const rect = seat.getBoundingClientRect();
    const toX = rect.left + rect.width / 2 - boardRect.left;
    const toY = rect.top + rect.height / 2 - boardRect.top;
    const stack = document.createElement("div");
    stack.className = "chip-stack chip-payout";
    stack.dataset.chipTheme = "gold";
    stack.innerHTML = "<i></i><i></i><i></i><i></i><i></i>";
    stack.style.setProperty("--from-x", `${fromX}px`);
    stack.style.setProperty("--from-y", `${fromY}px`);
    stack.style.setProperty("--to-x", `${toX}px`);
    stack.style.setProperty("--to-y", `${toY}px`);
    stack.style.setProperty("--delay", `${index * 120}ms`);
    board.append(stack);
    window.setTimeout(() => stack.remove(), 1050 + index * 120);
  });
  restartAnimation(potChips, "payout-pop");
}

function evaluateVisibleHand(cards) {
  const visible = (cards || []).filter((card) => card && card !== "hidden");
  if (visible.length < 2) return { rank: 0, label: "Старшая карта", cards: visible };
  if (visible.length < 5) return evaluatePartialHand(visible);

  let best = null;
  for (const combo of combinations(visible, 5)) {
    const evaluated = evaluateFiveCards(combo);
    if (!best || compareHandScore(evaluated.score, best.score) > 0) best = evaluated;
  }
  return best || { rank: 0, label: "Старшая карта", cards: visible.slice(0, 5), score: [0] };
}

function evaluatePartialHand(cards) {
  const counts = rankCounts(cards);
  const pairs = [...counts.values()].filter((count) => count >= 2).length;
  const trips = [...counts.values()].some((count) => count >= 3);
  if (trips) return { rank: 3, label: "Сет", cards, score: [3] };
  if (pairs >= 2) return { rank: 2, label: "Две пары", cards, score: [2] };
  if (pairs === 1) return { rank: 1, label: "Пара", cards, score: [1] };
  return { rank: 0, label: "Старшая карта", cards, score: [0] };
}

function evaluateFiveCards(cards) {
  const values = cards.map(cardRankValue).sort((a, b) => b - a);
  const suits = cards.map((card) => card[1]);
  const flush = suits.every((suit) => suit === suits[0]);
  const straightHigh = straightHighValue(values);
  const counts = rankCounts(cards);
  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((left, right) => right.count - left.count || right.rank - left.rank);

  if (flush && straightHigh === 14) return handResult(9, "Роял-флеш", cards, [9, 14]);
  if (flush && straightHigh) return handResult(8, "Стрит-флеш", cards, [8, straightHigh]);
  if (groups[0].count === 4) return handResult(7, "Каре", cards, [7, groups[0].rank, ...values.filter((value) => value !== groups[0].rank)]);
  if (groups[0].count === 3 && groups[1]?.count === 2) return handResult(6, "Фулл-хаус", cards, [6, groups[0].rank, groups[1].rank]);
  if (flush) return handResult(5, "Флеш", cards, [5, ...values]);
  if (straightHigh) return handResult(4, "Стрит", cards, [4, straightHigh]);
  if (groups[0].count === 3) return handResult(3, "Сет", cards, [3, groups[0].rank, ...values.filter((value) => value !== groups[0].rank)]);
  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const pairRanks = groups.filter((group) => group.count === 2).map((group) => group.rank).sort((a, b) => b - a);
    return handResult(2, "Две пары", cards, [2, ...pairRanks, ...values.filter((value) => !pairRanks.includes(value))]);
  }
  if (groups[0].count === 2) return handResult(1, "Пара", cards, [1, groups[0].rank, ...values.filter((value) => value !== groups[0].rank)]);
  return handResult(0, `Старшая карта ${rankName(values[0])}`, cards, [0, ...values]);
}

function handResult(rank, label, cards, score) {
  return { rank, label, cards, score };
}

function rankCounts(cards) {
  const counts = new Map();
  for (const card of cards) {
    const value = cardRankValue(card);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function cardRankValue(card) {
  return { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 }[card[0]] || 0;
}

function straightHighValue(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const run = unique.slice(index, index + 5);
    if (run.every((value, offset) => offset === 0 || run[offset - 1] - value === 1)) return run[0] === 1 ? 5 : run[0];
  }
  return 0;
}

function compareHandScore(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = Number(left[index] || 0) - Number(right[index] || 0);
    if (diff) return diff;
  }
  return 0;
}

function combinations(items, size) {
  const result = [];
  const walk = (start, picked) => {
    if (picked.length === size) {
      result.push([...picked]);
      return;
    }
    for (let index = start; index <= items.length - (size - picked.length); index += 1) {
      picked.push(items[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return result;
}

function rankName(value) {
  return { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "10" }[value] || String(value);
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

function formatUsdtDisplay(value) {
  const amount = Number(value || 0);
  return `${amount < 0 ? "-" : ""}${formatUsdt(Math.abs(amount))}`;
}

function formatUsdtInput(value) {
  return formatUsdt(value).replace(/,/g, "");
}

function parseUsdtToMicros(value) {
  const normalized = String(value || "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const [wholeRaw = "0", fractionRaw = ""] = normalized.split(".");
  const whole = Number(wholeRaw || 0);
  const fraction = Number((fractionRaw + "000000").slice(0, 6));
  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) return 0;
  return whole * 1_000_000 + fraction;
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })}%`;
}

function formatModeAmount(value, cashMode) {
  return cashMode ? `${formatUsdtDisplay(value)} USDT` : `${formatChips(value)} фишек`;
}

function formatGameAmount(value) {
  return formatModeAmount(value, state.gameMode === "cash");
}

function formatGameLimit(smallBlind, bigBlind, cashMode = state.gameMode === "cash") {
  return cashMode
    ? `${formatUsdtDisplay(smallBlind)}/${formatUsdtDisplay(bigBlind)} USDT`
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

function createTetherMark(className = "") {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.classList.add("tether-mark");
  if (className) svg.classList.add(className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-label", "USDT");
  svg.innerHTML = '<circle cx="12" cy="12" r="12"/><path d="M13.55 10.18V8.56h3.8V6H6.65v2.56h3.8v1.62C7.36 10.34 5 10.96 5 11.71c0 .75 2.36 1.37 5.45 1.53V18h3.1v-4.76c3.09-.16 5.45-.78 5.45-1.53 0-.75-2.36-1.37-5.45-1.53Zm0 2.07v-.01c-.49.03-1 .04-1.55.04s-1.06-.01-1.55-.04v.01c-2.21-.12-3.87-.51-3.87-.98 0-.39 1.18-.73 2.91-.9v.86c.78.07 1.63.11 2.51.11.88 0 1.73-.04 2.51-.11v-.86c1.73.17 2.91.51 2.91.9 0 .47-1.66.86-3.87.98Z"/>';
  return svg;
}

function renderMoneyValue(node, value, cashMode, { append = false } = {}) {
  if (!node) return;
  const contents = cashMode
    ? [formatUsdtDisplay(value), " ", createTetherMark()]
    : [`${formatChips(value)} фишек`];
  if (append) node.append(...contents);
  else node.replaceChildren(...contents);
}

function renderLimitValue(node, smallBlind, bigBlind, cashMode, { append = false } = {}) {
  if (!node) return;
  const contents = cashMode
    ? [`${formatUsdt(smallBlind)}/${formatUsdt(bigBlind)}`]
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
    ? [formatUsdtDisplay(value), " ", createTetherMark()]
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
    created: "создан",
    registration_open: "регистрация",
    late_registration: "late reg",
    final_table: "финальный стол",
    cancelled: "отменён",
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
  const image = node.querySelector("img");
  if (image) image.remove();
  const fallback = () => {
    node.style.backgroundImage = "";
    node.classList.remove("has-photo");
    node.replaceChildren(initials(user.name));
  };
  if (user.photoUrl) {
    const nextImage = document.createElement("img");
    nextImage.alt = "";
    nextImage.decoding = "async";
    nextImage.referrerPolicy = "no-referrer";
    nextImage.addEventListener("error", fallback, { once: true });
    nextImage.addEventListener("load", () => {
      node.replaceChildren(nextImage);
      node.classList.add("has-photo");
    }, { once: true });
    nextImage.src = user.photoUrl;
    return;
  }
  fallback();
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
  updateTelegramBackButton();
}

function closeAmountPanel() {
  pendingBetAction = "";
  bettingActions.classList.remove("amount-open");
  updateTelegramBackButton();
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
  if (currentTable.classList.contains("is-reconnecting")) return "Восстанавливаем соединение…";
  if (table.viewer?.connected === false) return "Соединение потеряно · окно reconnect активно";
  if (table.viewer?.status === "busted" || table.viewer?.busted === true) return "Вы выбыли";
  if (table.viewer?.sittingOut) return "Sit out · нажмите «Вернуться»";
  if (table.viewer?.canAct) return "Ваш ход";
  const fallback = {
    waiting: "Ожидание игроков",
    starting: "Раздача начинается",
    preflop: "Префлоп",
    flop: "Флоп",
    turn: "Терн",
    river: "Ривер",
    runout: "All-in",
    showdown: "Шоудаун"
  }[table.status] || table.status;

  const base = visibleTableMessage(table) || fallback;
  if (!table.actionDeadline || table.activeSeatIndex < 0) return base;

  const secondsLeft = Math.max(0, Math.ceil((table.actionDeadline - table.now) / 1000));
  return `${base} · ${secondsLeft} сек`;
}

function visibleTableMessage(table) {
  const message = String(table.message || "");
  if (!message) return "";
  if (/fairness\s*seed|fair\s*hash/i.test(message)) return "";
  if (/ходит$/i.test(message.trim())) return "";
  return message;
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

  const highlightSet = new Set(options.highlightCards || []);
  return cards.map((card, index) => {
    const node = document.createElement("span");
    node.className = [
      "card",
      card === "hidden" ? "hidden" : "",
      card !== "hidden" && isRed(card) ? "red" : "",
      highlightSet.has(card) ? "best-card" : "",
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
  const highlightSet = new Set(options.highlightCards || []);
  return Array.from({ length: 5 }, (_, index) => {
    const slot = document.createElement("span");
    const card = cards[index];
    slot.className = `board-card-slot${card ? " filled" : ""}`;
    slot.setAttribute("aria-hidden", card ? "false" : "true");
    if (card) {
      slot.replaceChildren(...renderCards([card], {
        animate: options.animate,
        highlightCards: highlightSet.has(card) ? [card] : []
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
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function claimDailyPlayBonus() {
  if (state.gameMode !== "play" || pendingDailyPlayClaim) return;
  pendingDailyPlayClaim = true;
  renderHomeWalletSide(state.homeStats || {});
  try {
    const data = await api("/api/play/daily-claim", {
      method: "POST",
      idempotencyKey: requestKey("daily-play-claim")
    });
    if (data.dailyPlayClaim) setDailyPlayClaim(data.dailyPlayClaim);
    if (data.profile) {
      state.user = {
        ...state.user,
        balance: Number(data.profile.balance || state.user?.balance || 0),
        cashBalanceMicros: Number(data.profile.cashBalanceMicros || state.user?.cashBalanceMicros || 0)
      };
      renderProfile(data.profile);
    }
    if (data.progression) {
      state.progression = data.progression;
      renderProgression(data.progression);
    }
    renderModeBalance();
    renderHomeCta();
    showStatus("10 000 игровых фишек начислены");
  } catch (error) {
    if (error.status === 409 && error.data?.dailyPlayClaim) {
      setDailyPlayClaim(error.data.dailyPlayClaim);
      renderHomeWalletSide(state.homeStats || {});
      renderHomeCta();
    }
    throw error;
  } finally {
    pendingDailyPlayClaim = false;
    renderHomeWalletSide(state.homeStats || {});
  }
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
