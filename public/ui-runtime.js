// Shared input feedback: a drag/scroll cancels both the highlight and activation.
export function setupPressFeedback(root = document) {
  const selector = "button, [role='button'], a[href], .home-table-list .table-item[tabindex]";
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

// Every sheet and anchored menu uses this lifecycle. Screens own content and callbacks only.
export function createOverlayManager({ onChange = () => {}, onUnhandledEscape = () => {} } = {}) {
  const entries = new Map();
  let active = null;
  let scrollY = 0;
  let savedBody = null;
  let savedInert = false;
  const app = document.querySelector("main.app");
  const duration = (kind) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    const value = getComputedStyle(document.documentElement).getPropertyValue(`--weez-motion-${kind}`);
    return Number.parseFloat(value) || (kind === "sheet" ? 320 : 180);
  };
  const lock = () => {
    if (savedBody) return;
    scrollY = window.scrollY;
    savedBody = ["position", "top", "left", "right", "width"].map(key => [key, document.body.style[key]]);
    Object.assign(document.body.style, { position: "fixed", top: `${-scrollY}px`, left: "0", right: "0", width: "100%" });
    savedInert = app?.inert || false;
    if (app) app.inert = true;
  };
  const unlock = () => {
    if (!savedBody) return;
    for (const [key, value] of savedBody) document.body.style[key] = value;
    savedBody = null;
    if (app) app.inert = savedInert;
    window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
  };
  const setPhase = (entry, phase) => {
    entry.phase = phase;
    entry.element.dataset.overlayState = phase;
    if (entry.backdrop) entry.backdrop.dataset.overlayState = phase;
    onChange();
  };
  const clear = entry => {
    window.clearTimeout(entry.timer);
    window.cancelAnimationFrame(entry.frame);
    entry.generation++;
  };
  const close = (id = active?.id, { immediate = false, restoreFocus = true } = {}) => {
    const entry = entries.get(id);
    if (!entry || entry.phase === "closed" || (entry.phase === "closing" && !immediate)) return;
    clear(entry);
    entry.element.classList.remove("sheet-visible");
    entry.element.inert = true;
    setPhase(entry, "closing");
    const complete = () => {
      entry.element.hidden = true;
      entry.element.inert = false;
      entry.element.classList.remove("sheet-open", "is-dragging");
      entry.element.style.removeProperty("--sheet-drag-y");
      if (entry.backdrop) entry.backdrop.hidden = true;
      for (const name of entry.bodyClasses) document.body.classList.remove(name);
      if (active === entry) { active = null; if (entry.modal) unlock(); }
      entry.onClose?.();
      setPhase(entry, "closed");
      if (restoreFocus && entry.focus?.isConnected && entry.focus.getClientRects().length) entry.focus.focus({ preventScroll: true });
    };
    const milliseconds = immediate ? 0 : duration(entry.kind);
    if (milliseconds) entry.timer = window.setTimeout(complete, milliseconds);
    else complete();
  };
  const show = id => {
    const entry = entries.get(id);
    if (!entry) throw new Error(`Unknown overlay: ${id}`);
    if (active === entry && ["opening", "open"].includes(entry.phase)) return;
    const previousFocus = active && active !== entry ? active.focus : null;
    if (active && active !== entry) close(active.id, { immediate: true, restoreFocus: false });
    clear(entry);
    if (entry.phase === "closed") entry.focus = previousFocus || document.activeElement;
    active = entry;
    if (entry.modal) lock();
    document.body.append(entry.element);
    entry.element.hidden = false;
    entry.element.inert = false;
    entry.element.scrollTop = 0;
    entry.element.style.removeProperty("--sheet-drag-y");
    entry.element.classList.add("sheet-open");
    if (entry.backdrop) { document.body.insertBefore(entry.backdrop, entry.element); entry.backdrop.hidden = false; }
    for (const name of entry.bodyClasses) document.body.classList.add(name);
    setPhase(entry, "opening");
    const generation = entry.generation;
    entry.frame = window.requestAnimationFrame(() => {
      if (generation !== entry.generation || active !== entry) return;
      entry.element.classList.add("sheet-visible");
      setPhase(entry, "open");
      entry.element.focus({ preventScroll: true });
    });
  };
  const register = (id, { element, backdrop = null, kind = "sheet", bodyClasses = [], onClose, label } = {}) => {
    if (!element || entries.has(id)) throw new Error(`Invalid overlay registration: ${id}`);
    const entry = { id, element, backdrop, kind, modal: kind === "sheet", bodyClasses, onClose, generation: 0, phase: "closed", timer: 0, frame: 0 };
    entries.set(id, entry);
    element.classList.add(kind === "sheet" ? "ui-sheet" : "ui-popover");
    element.tabIndex = -1;
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-modal", String(entry.modal));
    if (label) element.setAttribute("aria-label", label);
    element.hidden = true;
    element.dataset.overlayState = "closed";
    document.body.append(element);
    if (backdrop) {
      backdrop.classList.add("ui-backdrop");
      backdrop.hidden = true;
      backdrop.addEventListener("click", () => close(id));
    }
    if (kind === "sheet") {
      const handle = element.querySelector(".ui-sheet__handle");
      if (handle) {
        handle.setAttribute("role", "button"); handle.setAttribute("aria-label", "Закрыть панель"); handle.removeAttribute("aria-hidden"); handle.tabIndex = 0;
        let ignoreClick = false;
        handle.addEventListener("click", event => {
          if (ignoreClick) { ignoreClick = false; event.preventDefault(); return; }
          close(id);
        });
        handle.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); close(id); } });
        let gesture = null;
        handle.addEventListener("pointerdown", event => {
          if (!event.isPrimary || event.button !== 0) return;
          ignoreClick = false;
          gesture = { y: event.clientY, id: event.pointerId, distance: 0 };
          handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener("pointermove", event => {
          if (!gesture || gesture.id !== event.pointerId) return;
          gesture.distance = Math.max(0, event.clientY - gesture.y);
          element.classList.add("is-dragging");
          element.style.setProperty("--sheet-drag-y", `${gesture.distance}px`);
        });
        const finish = event => {
          if (!gesture || gesture.id !== event.pointerId) return;
          const distance = gesture.distance;
          ignoreClick = distance > 8 || event.type !== "pointerup";
          gesture = null;
          element.classList.remove("is-dragging");
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
          if (event.type === "pointerup" && distance > 58) close(id);
          else element.style.removeProperty("--sheet-drag-y");
        };
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", finish);
      }
      element.addEventListener("click", event => {
        if (!event.target.closest("input, textarea, select, button, a, [role='button']") && document.activeElement?.matches("input, textarea, select")) document.activeElement.blur();
      });
    }
  };
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (active) { event.preventDefault(); close(); }
    else onUnhandledEscape();
  });
  document.addEventListener("pointerdown", event => {
    if (active?.kind === "popover" && !active.element.contains(event.target)
      && !event.target.closest(".game-toolbar, #quickSitOutButton")) close();
  });
  const viewport = window.visualViewport;
  const keyboard = () => {
    const height = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    document.documentElement.style.setProperty("--keyboard-height", `${Math.round(height)}px`);
    document.body.classList.toggle("keyboard-open", height > 80);
  };
  viewport?.addEventListener("resize", keyboard);
  viewport?.addEventListener("scroll", keyboard);
  window.addEventListener("resize", keyboard);
  keyboard();
  return { register, show, close, closeTop: () => { if (!active) return false; close(); return true; }, isOpen: id => entries.get(id)?.phase !== "closed" && entries.has(id), hasOpen: () => Boolean(active) };
}
