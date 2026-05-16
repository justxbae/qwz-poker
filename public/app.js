const tg = window.Telegram?.WebApp;
const BOT_USERNAME = "qwzpokerbot";
const params = new URLSearchParams(window.location.search);
const DEV_MODE = params.has("dev1")
  || params.get("dev") === "1"
  || window.localStorage.getItem("qwzDevMode") === "1";
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}
window.scrollTo({ top: 0, left: 0 });
document.documentElement.classList.toggle("dev-mode", DEV_MODE);
const state = {
  token: "",
  user: null,
  currentTableId: "",
  currentTable: null,
  selectedSmallBlind: 25,
  tables: []
};

const profile = document.querySelector("#profile");
const lobbyAvatar = document.querySelector("#lobbyAvatar");
const lobbyName = document.querySelector("#lobbyName");
const lobbyUsername = document.querySelector("#lobbyUsername");
const lobbyBalance = document.querySelector("#lobbyBalance");
const lobbyTableStack = document.querySelector("#lobbyTableStack");
const lobbyActiveTables = document.querySelector("#lobbyActiveTables");
const homeActivityText = document.querySelector("#homeActivityText");
const cashierBalance = document.querySelector("#cashierBalance");
const cashierPrimaryButton = document.querySelector("#cashierPrimaryButton");
const cashierTableStack = document.querySelector("#cashierTableStack");
const cashierTotalBankroll = document.querySelector("#cashierTotalBankroll");
const cashierPackages = document.querySelector("#cashierPackages");
const cashierHistory = document.querySelector("#cashierHistory");
const cashierStatus = document.querySelector("#cashierStatus");
const profileAvatar = document.querySelector("#profileAvatar");
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
const closeBuyInOverlay = document.querySelector("#closeBuyInOverlay");
const buyInGameType = document.querySelector("#buyInGameType");
const buyInBalance = document.querySelector("#buyInBalance");
const buyInDebit = document.querySelector("#buyInDebit");
const buyInStackPreview = document.querySelector("#buyInStackPreview");
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

boot();

async function boot() {
  resetScroll();
  tg?.ready();
  tg?.expand();
  setupTelegramControls();

  await auth();
  await loadTables();
  await loadProfile();

  const startParam = tg?.initDataUnsafe?.start_param;
  if (startParam) await joinTable(startParam);

  createTableForm.addEventListener("submit", onCreateTable);
  refreshButton?.addEventListener("click", loadTables);
  profileRefreshButton.addEventListener("click", () => runAction(loadProfile));
  cashierPrimaryButton.addEventListener("click", () => {
    document.querySelector(".cashier-topup-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  cashierPackages.addEventListener("click", onCashierPackageClick);
  quickPlayButton.addEventListener("click", () => runAction(quickPlay));
  quickPrivateButton.addEventListener("click", () => runAction(quickCreatePrivateTable));
  continueGameButton.addEventListener("click", continueGame);
  limitPills.addEventListener("click", onLimitSelect);
  tableLimitPills.addEventListener("click", onLimitSelect);
  document.querySelectorAll("[data-lobby-tab]").forEach((button) => {
    button.addEventListener("click", () => selectLobbyTab(button.dataset.lobbyTab));
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
  lobbyName.textContent = data.user.name;
  lobbyUsername.textContent = data.user.username ? `@${data.user.username}` : `id ${data.user.id}`;
  lobbyBalance.textContent = data.user.balance.toLocaleString("ru-RU");
  cashierBalance.textContent = data.user.balance.toLocaleString("ru-RU");
  renderAvatar(lobbyAvatar, data.user);
  renderAvatar(profileAvatar, data.user);
  profileName.textContent = data.user.name;
  profileUsername.textContent = data.user.username ? `@${data.user.username}` : `id ${data.user.id}`;
  profileBalance.textContent = `${data.user.balance.toLocaleString("ru-RU")} chips`;
  profileChips.textContent = data.user.balance.toLocaleString("ru-RU");
}

function setupTelegramControls() {
  tg?.setHeaderColor?.("#0e1621");
  tg?.setBackgroundColor?.("#0e1621");
  tg?.BackButton?.onClick?.(() => {
    runAction(handleTelegramBack);
  });
}

async function handleTelegramBack() {
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
  cashierBalance.textContent = formatChips(cashier.balance);
  cashierTableStack.textContent = formatChips(cashier.tableStack || 0);
  cashierTotalBankroll.textContent = formatChips(cashier.totalBankroll || cashier.balance || 0);
  renderCashierPackages(cashier.packages || []);
  renderCashierHistory(cashier.transactions || []);
}

function renderCashierPackages(packages) {
  cashierPackages.replaceChildren();
  for (const pack of packages) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cashier-package";
    button.dataset.packageId = pack.id;

    const chips = document.createElement("strong");
    chips.textContent = `${formatChips(pack.chips)} chips`;
    const meta = document.createElement("span");
    meta.textContent = `${pack.stars} Stars · ${formatChips(pack.chipsPerStar)} chips/Star`;
    const badge = document.createElement("small");
    badge.textContent = "QWZ";

    button.append(chips, meta, badge);
    cashierPackages.append(button);
  }
}

function renderCashierHistory(transactions) {
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
    amount.textContent = `${transaction.type === "credit" ? "+" : "-"}${formatChips(transaction.amount)}`;

    row.append(main, amount);
    cashierHistory.append(row);
  }
}

function formatTransactionMeta(transaction) {
  const parts = [];
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

async function onCashierPackageClick(event) {
  const button = event.target.closest("[data-package-id]");
  if (!button) return;

  cashierPackages.querySelectorAll("button").forEach((item) => {
    item.disabled = true;
  });
  cashierStatus.textContent = "Открываем оплату Telegram Stars...";

  try {
    const data = await api("/api/cashier/stars-invoice", {
      method: "POST",
      body: { packageId: button.dataset.packageId }
    });
    await openStarsInvoice(data.invoiceLink);
  } finally {
    cashierPackages.querySelectorAll("button").forEach((item) => {
      item.disabled = false;
    });
  }
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
  profileBalance.textContent = `${formatChips(profileData.balance)} chips`;
  profileChips.textContent = formatChips(profileData.balance);
  profileTableStack.textContent = formatChips(profileData.tableStack);
  profileSavedStack.textContent = formatChips(profileData.savedStack);
  lobbyTableStack.textContent = formatChips(profileData.tableStack);
  lobbyActiveTables.textContent = String(profileData.activeTableCount || 0);
  homeActivityText.textContent = profileData.activeTableCount
    ? `${profileData.activeTableCount} ${plural(profileData.activeTableCount, "стол", "стола", "столов")} · ${formatChips(profileData.tableStack)} за столами`
    : "Выберите стол и начните игру.";
  profileHands.textContent = String(profileData.handsPlayed || 0);
  profileTables.textContent = String(profileData.activeTableCount || 0);
  profileStatus.textContent = profileData.activeTableCount ? "В игре" : "В лобби";
  profileSessionBadge.textContent = profileData.activeTableCount
    ? `${profileData.activeTableCount} ${plural(profileData.activeTableCount, "стол", "стола", "столов")}`
    : "нет";

  renderAvatar(profileAvatar, user);
  renderAvatar(lobbyAvatar, user);

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
    row.querySelector("span").textContent = `${table.name} · ${table.smallBlind}/${table.bigBlind}`;
    row.querySelector("strong").textContent = `${formatChips(table.stack)} · #${table.handNumber}`;
    row.addEventListener("click", () => {
      state.currentTableId = table.id;
      continueGame();
    });
    profileSessionList.append(row);
  }
}

async function onCreateTable(event) {
  event.preventDefault();
  const form = new FormData(createTableForm);
  const body = Object.fromEntries(form.entries());
  openBuyInOverlay({
    mode: "create",
    body,
    smallBlind: Number(body.smallBlind || state.selectedSmallBlind)
  });
}

async function quickPlay() {
  const table = state.tables.find((item) => (
    !item.isPrivate
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
    smallBlind: Number(table.smallBlind || state.selectedSmallBlind)
  });
}

async function quickCreatePrivateTable() {
  const smallBlind = Number(state.selectedSmallBlind || 25);
  openBuyInOverlay({
    mode: "create",
    smallBlind,
    body: {
      name: `QWZ private ${smallBlind}/${smallBlind * 2}`,
      maxPlayers: "6",
      smallBlind: String(smallBlind),
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
    tablesFilterStatus.textContent = `${state.selectedSmallBlind}/${state.selectedSmallBlind * 2}`;
  }
}

function selectLobbyTab(tab) {
  currentLobbyTab = tab;
  haptic("light");
  document.querySelectorAll("[data-lobby-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.lobbyTab === tab);
  });
  document.querySelectorAll("[data-lobby-view]").forEach((view) => {
    view.classList.toggle("active", view.dataset.lobbyView === tab);
  });
  if (tab === "profile") runAction(loadProfile);
  if (tab === "cashier") runAction(loadCashier);
  updateTelegramBackButton();
}

async function loadTables() {
  const data = await api("/api/tables");
  state.tables = data.tables;
  renderTables();
}

function renderTables() {
  syncLimitSelection();
  const selectedBlind = Number(state.selectedSmallBlind);
  const publicTables = state.tables.filter((table) => !table.isPrivate && Number(table.smallBlind) === selectedBlind);
  const privateTables = state.tables.filter((table) => table.isPrivate && Number(table.smallBlind) === selectedBlind);
  const availablePublicTables = publicTables.filter((table) => table.seats.length < table.maxPlayers);
  onlineStatus.textContent = `${availablePublicTables.length} ${plural(availablePublicTables.length, "стол", "стола", "столов")}`;
  publicTablesStatus.textContent = `${publicTables.length} ${plural(publicTables.length, "стол", "стола", "столов")}`;
  privateTablesStatus.textContent = `${privateTables.length} ${plural(privateTables.length, "стол", "стола", "столов")}`;
  renderContinueCard();
  renderTableList(publicTableList, publicTables, `На лимите ${selectedBlind}/${selectedBlind * 2} свободных общих столов пока нет.`);
  renderTableList(privateTableList, privateTables, `Приватных столов ${selectedBlind}/${selectedBlind * 2} пока нет. Создай игру для друзей.`);
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
    node.querySelector('[data-field="meta"]').textContent =
      `${table.smallBlind}/${table.bigBlind} · ${table.seats.length}/${table.maxPlayers} игроков${table.isPrivate ? " · приватный" : ""}`;
    const button = node.querySelector('[data-action="join"]');
    button.textContent = isFull ? "Заполнен" : "Войти";
    button.disabled = isFull;
    button.addEventListener("click", () => openBuyInOverlay({
      mode: "join",
      tableId: table.id,
      smallBlind: Number(table.smallBlind || state.selectedSmallBlind)
    }));
    container.append(node);
  }
}

function renderContinueCard() {
  const table = state.tables.find((item) => item.id === state.currentTableId);
  continueCard.hidden = !table;
  if (!table) return;
  continueMeta.textContent = `${table.seats.length}/${table.maxPlayers} · ${table.smallBlind}/${table.bigBlind}`;
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
      smallBlind: Number(table.smallBlind || state.selectedSmallBlind),
      balance: state.user?.balance
    });
    return;
  }
  await runAction(async () => {
    const data = await api(`/api/tables/${tableId}/join`, {
      method: "POST",
      body: { buyInAmount }
    });
    state.currentTableId = data.table.id;
    enterGameMode();
    renderCurrentTable(data.table);
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
  const smallBlind = Number(intent.smallBlind || state.selectedSmallBlind || 25);
  const bigBlind = smallBlind * 2;
  const balance = Number(intent.balance ?? state.user?.balance ?? 0);
  if (balance <= 0) {
    showError("Сначала пополните баланс в кассе");
    selectLobbyTab("cashier");
    return;
  }
  const minAmount = Math.min(balance, Number(intent.minAmount || Math.max(1000, Math.min(10000, bigBlind * 200))));
  const maxAmount = Math.max(minAmount, Math.min(balance, Number(intent.maxAmount || 40000)));
  const defaultAmount = clampAmount(Number(intent.defaultAmount || Math.min(20000, maxAmount)), minAmount, maxAmount);

  document.querySelector(".buyin-title").textContent = intent.mode === "rebuy" ? "Докупка стека" : "Вход за стол";
  buyInGameType.textContent = `БЛ Холдем ${smallBlind}/${bigBlind}`;
  buyInBalance.textContent = formatChips(balance);
  buyInAmount.dataset.min = String(minAmount);
  buyInAmount.dataset.max = String(maxAmount);
  buyInSlider.min = String(minAmount);
  buyInSlider.max = String(maxAmount);
  buyInSlider.step = String(Math.max(100, bigBlind));
  buyInMinButton.querySelector("span").textContent = formatChips(minAmount);
  buyInMaxButton.querySelector("span").textContent = formatChips(maxAmount);
  setBuyInAmount(defaultAmount);
  buyInOverlay.hidden = false;
  updateTelegramBackButton();
}

function hideBuyInOverlay() {
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
  buyInOverlay.hidden = true;
  pendingBuyIn = null;
  updateTelegramBackButton();

  if (intent.mode === "create") {
    const data = await api("/api/tables", {
      method: "POST",
      body: { ...intent.body, buyInAmount }
    });
    state.currentTableId = data.table.id;
    enterGameMode();
    renderCurrentTable(data.table);
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
  buyInDebit.textContent = formatChips(safeAmount);
  buyInStackPreview.textContent = formatChips(safeAmount);
}

async function loadCurrentTable() {
  const data = await api(`/api/tables/${state.currentTableId}`);
  renderCurrentTable(data.table);
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
    smallBlind: state.currentTable.smallBlind,
    balance,
    minAmount: Math.min(balance, state.currentTable.bigBlind),
    maxAmount: Math.min(balance, 40000),
    defaultAmount: Math.min(balance, 10000)
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
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
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
  blinds.textContent = `${table.smallBlind}/${table.bigBlind}`;
  tableDetails.textContent = `Texas NL · Блайнды ${table.smallBlind}/${table.bigBlind} · #${table.handNumber || 1}`;
  const shouldCollectBets = shouldAnimateBetCollection(table);
  if (shouldCollectBets) animateBetStacksToPot();
  pot.textContent = `Банк: ${formatChips(table.pot)}`;
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
  communityCards.replaceChildren(...renderCards(table.communityCards, { animate: animateCommunity }));
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
      node.querySelector(".seat-meta").textContent = formatChips(seat.stack);
      node.querySelector(".seat-cards").replaceChildren(...renderCards(seat.cards, { animate: shouldAnimateCards }));
      node.querySelector(".bet-amount").textContent = seat.bet ? formatChips(seat.bet) : "";
      node.dataset.badges = badges.join(" ");
      node.dataset.bet = seat.bet ? formatChips(seat.bet) : "";
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
  botCallButton.textContent = viewer.testBotToCall > 0 ? `Dev call ${formatChips(viewer.testBotToCall)}` : "Dev check";
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
  call.textContent = `Колл ${viewer.toCall}`;
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
  startTitle.textContent = `Блайнды ${table.smallBlind}/${table.bigBlind}`;
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
    ["Ставки стола", `${table.smallBlind}/${table.bigBlind}`],
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
  confirmBetButton.querySelector("span").textContent = formatChips(Number(actionAmount.value || 0));
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

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
