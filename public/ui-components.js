// The registry is the only compatibility mapping from old screen hooks to primitives.
// New markup can use ui-* classes directly; dynamic server-rendered content is normalized here.
const components = [
  [".footer-lobby, .cashier-methods", "ui-group"],
  [".footer-lobby-row, .profile-detail-row, .side-menu > button:not(.ui-popover__close)", "ui-row"],
  [".footer-lobby-icon, .profile-detail-icon", "ui-row__icon"],
  [".footer-lobby-main, .profile-detail-main", "ui-row__text"],
  [".footer-lobby-value", "ui-row__value"],
  [".footer-lobby-chevron, .profile-detail-chevron", "ui-row__chevron"],
  [".lobby-card:not([data-cashier-sheet]), .home-wallet, .profile-hero, .profile-dashboard, .affiliate-hero, .affiliate-card", "ui-card"],
  [".cashier-calculator, .withdraw-balance-card, .withdraw-fee-preview, .withdraw-rake-progress, .buyin-summary, .buyin-info-card, .doc-sheet-row, .info-list, .stats-table, .drawer-log", "ui-surface"],
  [".cashier-sheet-grabber, .buyin-sheet-grabber", "ui-sheet__handle"],
  [".buyin-head, .lobby-menu-head, .tournament-detail-head", "ui-sheet__header"],
  [".profile-main h2, .affiliate-hero h2", "ui-title ui-title--screen"],
  [".affiliate-card > strong, .section-title h2, .cashier-amount-title, .buyin-title, #docSheetTitle, #tournamentDetailTitle, #cashierWithdrawTitle", "ui-title"],
  [".cashier-sticky-footer, .tournament-detail-footer, .affiliate-actions", "ui-actions"],
  [".cashier-pay-button, .buyin-submit, #tournamentDetailAction, #continueGameButton, #createTableForm > button, #observerSitButton, #confirmBetButton", "ui-button ui-button--primary"],
  [".secondary-pill, .secondary, #buyInMinButton, #buyInMaxButton", "ui-button ui-button--secondary"],
  ["#buyInMinButton, #buyInMaxButton", "ui-button--stacked"],
  [".cashier-amount-field:has(> small) input", "ui-input--money"],
  ['#menuButton, .game-toolbar [data-panel-tab="info"], #sitOutInfoButton', "ui-button ui-button--icon"],
  ["#dailyPlayClaimButton", "ui-button ui-button--primary ui-button--compact"],
  [".cashier-presets button, .limit-pills button, .bet-presets button", "ui-button ui-button--secondary ui-button--compact"],
  [".home-wallet-actions button", "ui-button ui-button--secondary"],
  [".betting-actions .main-action, .pre-actions button, .show-muck-actions button", "ui-button ui-button--secondary"],
  [".cashier-amount-field input, .buyin-amount-grid input, #createTableForm input, #createTableForm select", "ui-input"],
  ["input[type='range']", "ui-range"],
  [".buyin-row, .buyin-info-card > div, .withdraw-fee-row, .info-row", "ui-data-row"],
  ["#createTableForm label", "ui-field"],
  [".create-grid", "ui-form-grid"],
  [".affiliate-hero, .affiliate-card, .affiliate-grid", "ui-stack"],
  ["#actionAmount", "ui-input"],
  ["[data-poker-action]", "ui-button--compact"],
  ["#confirmBetButton", "ui-button--stacked"],
  [".quick-bets button", "ui-button ui-button--secondary ui-button--compact"],
  ["#quickSitOutButton", "ui-button ui-button--icon"],
  [".cashier-withdraw-form, .doc-sheet-body, .tournament-detail-body", "ui-stack"],
  [".product-mode-segment, .tournament-detail-tabs, .drawer-tabs", "ui-segment"],
];

export function mountUIComponents(root = document) {
  if (document.documentElement.classList.contains("admin-mode")) return;
  for (const [selector, classes] of components) {
    const elements = [...(root.querySelectorAll?.(selector) || [])];
    if (root.matches?.(selector)) elements.unshift(root);
    for (const element of elements) element.classList.add(...classes.split(" "));
  }
  if (root.matches?.(".side-menu > .ui-row")) root.classList.add("ui-row--plain");
  const buttons = [...(root.querySelectorAll?.("button") || [])];
  if (root.matches?.("button")) buttons.push(root);
  for (const button of buttons) {
    if (button.matches(".ui-row, .promo-banner, .rating-rules-card, .close-button, .cashier-sheet-close, .buyin-close")
      || button.closest(".bottom-nav, .ui-segment, .game-toolbar, .table-list")) continue;
    if (!button.classList.contains("ui-button")) button.classList.add("ui-button", button.matches(".danger") ? "ui-button--danger" : button.matches(".secondary, .secondary-pill") ? "ui-button--secondary" : "ui-button--primary");
  }
  for (const row of root.querySelectorAll?.(".side-menu > .ui-row") || []) row.classList.add("ui-row--plain");
  const segments = [...(root.querySelectorAll?.(".ui-segment") || [])];
  if (root.matches?.(".ui-segment")) segments.push(root);
  for (const segment of segments) mountSegment(segment);
}

const segments = new WeakSet();
function mountSegment(segment) {
  if (segments.has(segment)) return;
  segments.add(segment);
  const expanding = segment.classList.contains("ui-segment--expanding");
  if (!expanding) {
    const pill = document.createElement("span");
    pill.className = "ui-segment__pill";
    pill.setAttribute("aria-hidden", "true");
    segment.prepend(pill);
  }
  const update = () => {
    const buttons = [...segment.querySelectorAll("button")];
    const active = buttons.find(button => button.classList.contains("active")) || buttons[0];
    for (const button of buttons) button.setAttribute("aria-pressed", String(button === active));
    if (!active || expanding) return;
    // offset metrics ignore an in-flight sheet transform/animation.
    segment.style.setProperty("--selection-x", `${active.offsetLeft}px`);
    segment.style.setProperty("--selection-width", `${active.offsetWidth}px`);
  };
  new MutationObserver(update).observe(segment, { attributes: true, subtree: true, attributeFilter: ["class"] });
  new ResizeObserver(update).observe(segment);
  update();
}

export function setupUIComponents() {
  mountUIComponents();
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === 1) mountUIComponents(node);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
