import assert from "node:assert/strict";
import test from "node:test";
import { setupPressFeedback, setupViewport, createOverlayManager } from "../public/ui-runtime.js";

function surface() {
  const handlers = new Map();
  return {
    addEventListener(name, fn) { handlers.set(name, fn); },
    emit(name, event = {}) { handlers.get(name)?.(event); }
  };
}

function element() {
  const attributes = new Set();
  const classes = new Set();
  return {
    ...surface(), disabled: false, hidden: false, isConnected: true, attributes, dataset: {}, inert: false,
    style: { removeProperty() {}, setProperty() {} }, querySelector() { return null; },
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle(name, force) { if (force) classes.add(name); else classes.delete(name); } },
    setAttribute: name => attributes.add(name), removeAttribute: name => attributes.delete(name),
    closest() { return this; }, matches() { return this.disabled; }, contains(other) { return this === other; },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 50 }),
    setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {},
    getClientRects: () => [1], focus() { globalThis.document.activeElement = this; }
  };
}

function environment() {
  const win = surface();
  const frames = [];
  const timers = new Map();
  let timerId = 0;
  Object.assign(win, {
    scrollY: 200, scrollTo(options) { this.scrollY = options.top; }, cancelAnimationFrame() {},
    innerHeight: 844, requestAnimationFrame: fn => frames.push(fn),
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id), matchMedia: () => ({ matches: false })
  });
  const root = surface();
  const values = new Map();
  root.documentElement = { style: { setProperty: (key, value) => values.set(key, value) } };
  root.activeElement = element();
  const app = element();
  root.querySelector = () => app;
  root.body = { style: { position: "", top: "", left: "", right: "", width: "" }, classList: element().classList, append() {}, insertBefore() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: token => token.endsWith("popover") ? "180ms" : "320ms" });
  globalThis.window = win;
  globalThis.document = root;
  return { win, root, values, frames, timers };
}

test("Telegram viewport ignores unstable swipe heights and combines system and content insets", () => {
  const { win, values } = environment();
  const tg = { ...surface(), viewportStableHeight: 800, safeAreaInset: { top: 44, bottom: 34 }, contentSafeAreaInset: { top: 56, bottom: 0 } };
  tg.onEvent = tg.addEventListener;
  setupViewport(tg);
  assert.equal(values.get("--app-height"), "800px");
  assert.equal(values.get("--app-safe-top"), "calc(max(env(safe-area-inset-top, 0px), 44px) + 56px)");
  assert.equal(values.get("--app-safe-bottom"), "calc(max(env(safe-area-inset-bottom, 0px), 34px) + 0px)");
  tg.viewportStableHeight = 650;
  tg.emit("viewportChanged", { isStateStable: false });
  assert.equal(values.get("--app-height"), "800px");
  tg.emit("viewportChanged", { isStateStable: true });
  assert.equal(values.get("--app-height"), "650px");
  tg.viewportStableHeight = 0;
  win.innerHeight = 932;
  win.emit("resize");
  assert.equal(values.get("--app-height"), "932px");
});

test("a drag from coordinate zero or a scroll cancels activation, while a fresh tap works", () => {
  const { root } = environment();
  setupPressFeedback(root);
  const button = element();
  const down = { target: button, isPrimary: true, button: 0, pointerId: 1, clientX: 0, clientY: 0 };
  const click = () => {
    let cancelled = false;
    root.emit("click", { target: button, detail: 1, preventDefault() { cancelled = true; }, stopImmediatePropagation() {} });
    return cancelled;
  };
  root.emit("pointerdown", down);
  assert.ok(button.attributes.has("data-ui-pressed"));
  root.emit("pointermove", { ...down, clientY: 20 });
  root.emit("pointerup");
  assert.ok(!button.attributes.has("data-ui-pressed"));
  assert.ok(click());
  root.emit("pointerdown", down);
  root.emit("scroll");
  root.emit("pointerup");
  assert.ok(click());
  root.emit("pointerdown", down);
  root.emit("pointerup");
  assert.equal(click(), false);
});

test("disabled controls have no press feedback", () => {
  const { root } = environment();
  setupPressFeedback(root);
  const button = element();
  button.disabled = true;
  root.emit("pointerdown", { target: button, isPrimary: true, button: 0 });
  assert.equal(button.attributes.has("data-ui-pressed"), false);
});

function flushTimers(timers) {
  const callbacks = [...timers.values()];
  timers.clear();
  callbacks.forEach(fn => fn());
}

test("a sheet closed before its opening frame cannot reappear; focus and scroll are restored", () => {
  const { root, win, frames, timers } = environment();
  const manager = createOverlayManager();
  const sheet = element(), backdrop = element(), focus = root.activeElement;
  let closes = 0;
  manager.register("sheet", { element: sheet, backdrop, onClose: () => closes++ });
  manager.show("sheet");
  assert.equal(root.querySelector().inert, true);
  assert.equal(root.body.style.position, "fixed");
  manager.close();
  frames.forEach(fn => fn());
  assert.equal(sheet.dataset.overlayState, "closing");
  assert.equal(sheet.classList.contains("sheet-visible"), false);
  flushTimers(timers);
  assert.equal(sheet.hidden, true);
  assert.equal(backdrop.hidden, true);
  assert.equal(closes, 1);
  assert.equal(root.querySelector().inert, false);
  assert.equal(root.body.style.position, "");
  assert.equal(win.scrollY, 200);
  assert.equal(root.activeElement, focus);
});

test("reopen cancels an old dismissal, and switching overlays closes exactly the old one", () => {
  const { root, frames, timers } = environment();
  const trigger = root.activeElement;
  const manager = createOverlayManager();
  const first = element(), second = element();
  let closes = 0;
  manager.register("first", { element: first, onClose: () => closes++ });
  manager.register("second", { element: second });
  manager.show("first");frames.shift()();
  manager.close("first");
  manager.close("first");
  assert.equal(timers.size, 1);
  manager.show("first");frames.shift()();
  assert.equal(timers.size, 0);
  assert.equal(closes, 0);
  manager.show("second");
  assert.equal(closes, 1);
  assert.equal(first.hidden, true);
  assert.equal(second.hidden, false);
  assert.equal(manager.isOpen("first"), false);
  assert.equal(manager.isOpen("second"), true);
  frames.shift()();
  manager.close("second", { immediate: true });
  assert.equal(root.activeElement, trigger);
});

test("reduced motion closes sheets and popovers immediately through the same controller", () => {
  const { win, frames, timers } = environment();
  const manager = createOverlayManager();
  win.matchMedia = () => ({ matches: true });
  for (const kind of ["sheet", "popover"]) {
    const panel = element();
    manager.register(kind, { element: panel, kind });
    manager.show(kind);
    manager.close();
    frames.forEach(fn => fn());
    assert.equal(panel.hidden, true);
    assert.equal(panel.dataset.overlayState, "closed");
    assert.equal(timers.size, 0);
  }
});

test("cancelled and short sheet drags stay open; completed drags use normal dismissal", () => {
  const { frames, timers } = environment();
  const manager = createOverlayManager();
  const sheet = element(), handle = element();
  sheet.querySelector = () => handle;
  manager.register("sheet", { element: sheet });
  manager.show("sheet");frames.shift()();
  const down = { isPrimary: true, button: 0, pointerId: 1, clientY: 0 };
  handle.emit("pointerdown", down);
  handle.emit("pointermove", { ...down, clientY: 100 });
  handle.emit("pointercancel", { ...down, type: "pointercancel" });
  handle.emit("click", { preventDefault() {} });
  assert.equal(sheet.dataset.overlayState, "open");
  handle.emit("pointerdown", down);
  handle.emit("pointermove", { ...down, clientY: 20 });
  handle.emit("pointerup", { ...down, type: "pointerup" });
  handle.emit("click", { preventDefault() {} });
  assert.equal(sheet.dataset.overlayState, "open");
  handle.emit("pointerdown", down);
  handle.emit("pointermove", { ...down, clientY: 100 });
  handle.emit("pointerup", { ...down, type: "pointerup" });
  assert.equal(sheet.dataset.overlayState, "closing");
  flushTimers(timers);
  assert.equal(sheet.hidden, true);
});


test("Escape closes the overlay before dispatching to an underlying amount editor", () => {
  const { root, timers } = environment();
  let underlying = 0;
  const manager = createOverlayManager({ onUnhandledEscape: () => underlying++ });
  manager.register("info", { element: element(), kind: "popover" });
  manager.show("info");
  root.emit("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(underlying, 0);
  flushTimers(timers);
  root.emit("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(underlying, 1);
});
