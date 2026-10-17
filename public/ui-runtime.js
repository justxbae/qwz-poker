// Shared input feedback: a drag/scroll cancels both the highlight and activation.
export function setupPressFeedback(root = document) {
  const selector = "button, a[href], .home-table-list .table-item[tabindex]";
  let press = null;
  let cancelled = null;
  const clear = () => {
    press?.element.removeAttribute("data-ui-pressed");
  };
  const cancel = () => {
    if (!press) return;
    clear();
    cancelled = press.element;
    press = null;
  };
  root.addEventListener("pointerdown", (event) => {
    clear();
    press = null;
    cancelled = null;
    if (!event.isPrimary || event.button !== 0) return;
    const element = event.target.closest(selector);
    if (!element || element.matches(":disabled, [aria-disabled='true']")) return;
    press = { element, x: event.clientX, y: event.clientY, id: event.pointerId };
    element.setAttribute("data-ui-pressed", "");
  }, { passive: true });
  root.addEventListener("pointermove", (event) => {
    if (!press || press.id !== event.pointerId) return;
    const rect = press.element.getBoundingClientRect();
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8
      || event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
  }, { passive: true });
  root.addEventListener("pointerup", () => { clear(); press = null; }, { passive: true });
  root.addEventListener("pointercancel", cancel, { passive: true });
  root.addEventListener("scroll", cancel, { passive: true, capture: true });
  window.addEventListener("blur", cancel);
  root.addEventListener("click", (event) => {
    const target = event.target.closest(selector);
    if (event.detail && target && (target === cancelled || cancelled?.contains(target))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    cancelled = null;
  }, true);
}

export function setupViewport(tg) {
  const style = document.documentElement.style;
  const update = () => {
    // Stable Telegram height must not follow every frame of a WebView swipe.
    const height = Number(tg?.viewportStableHeight) || window.innerHeight;
    style.setProperty("--app-height", `${Math.round(height)}px`);
    for (const edge of ["top", "right", "bottom", "left"]) {
      const system = Math.max(0, Number(tg?.safeAreaInset?.[edge]) || 0);
      const content = Math.max(0, Number(tg?.contentSafeAreaInset?.[edge]) || 0);
      // Telegram controls occupy extra space below the system status bar.
      style.setProperty(`--app-safe-${edge}`, `calc(max(env(safe-area-inset-${edge}, 0px), ${system}px) + ${content}px)`);
    }
  };
  tg?.onEvent?.("viewportChanged", (event) => { if (event?.isStateStable !== false) update(); });
  tg?.onEvent?.("safeAreaChanged", update);
  tg?.onEvent?.("contentSafeAreaChanged", update);
  window.addEventListener("resize", update);
  update();
}

const closingSheets = new WeakMap();
const sheetFocus = new WeakMap();
export function revealSheet(sheet) {
  window.clearTimeout(closingSheets.get(sheet));
  if (!sheetFocus.has(sheet)) sheetFocus.set(sheet, document.activeElement);
  sheet.style?.removeProperty("--sheet-drag-y");
  sheet.hidden = false;
  sheet.classList.add("sheet-open");
  window.requestAnimationFrame(() => {
    if (sheet.hidden) return;
    sheet.classList.add("sheet-visible");
    sheet.focus({ preventScroll: true });
  });
}

export function dismissSheet(sheet, finish, immediate = false) {
  window.clearTimeout(closingSheets.get(sheet));
  sheet.classList.remove("sheet-visible");
  const complete = () => {
    finish();
    const previous = sheetFocus.get(sheet);
    sheetFocus.delete(sheet);
    if (previous?.isConnected && previous.getClientRects().length) previous.focus({ preventScroll: true });
  };
  if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) complete();
  else closingSheets.set(sheet, window.setTimeout(complete, 320));
}

export function setupDialogFocus() {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .filter((dialog) => dialog.getClientRects().length && !dialog.hidden);
    const dialog = dialogs.at(-1);
    if (!dialog) return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter((control) => control.getClientRects().length);
    const first = controls[0] || dialog;
    const last = controls.at(-1) || dialog;
    if (!dialog.contains(document.activeElement) || document.activeElement === dialog
      || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  });
}
