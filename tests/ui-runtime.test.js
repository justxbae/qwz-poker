import assert from "node:assert/strict";
import test from "node:test";
import { setupPressFeedback, setupViewport, revealSheet, dismissSheet } from "../public/ui-runtime.js";

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
    disabled: false, hidden: false, isConnected: true, attributes,
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) },
    setAttribute: name => attributes.add(name), removeAttribute: name => attributes.delete(name),
    closest() { return this; }, matches() { return this.disabled; }, contains(other) { return this === other; },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 50 }),
    getClientRects: () => [1], focus() { globalThis.document.activeElement = this; }
  };
}

function environment() {
  const win = surface();
  const frames = [];
  const timers = new Map();
  let timerId = 0;
  Object.assign(win, {
    innerHeight: 844, requestAnimationFrame: fn => frames.push(fn),
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id), matchMedia: () => ({ matches: false })
  });
  const root = surface();
  const values = new Map();
  root.documentElement = { style: { setProperty: (key, value) => values.set(key, value) } };
  root.activeElement = element();
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

test("reopening a sheet cancels its pending dismissal and reduced motion closes immediately", () => {
  const { win, frames, timers } = environment();
  const sheet = element();
  revealSheet(sheet);
  frames.shift()();
  assert.ok(sheet.classList.contains("sheet-visible"));
  let closed = false;
  dismissSheet(sheet, () => { closed = true; sheet.hidden = true; });
  assert.equal(timers.size, 1);
  revealSheet(sheet);
  assert.equal(timers.size, 0);
  assert.equal(closed, false);
  win.matchMedia = () => ({ matches: true });
  dismissSheet(sheet, () => { closed = true; sheet.hidden = true; });
  frames.forEach(fn => fn());
  assert.equal(closed, true);
  assert.equal(sheet.hidden, true);
  assert.equal(sheet.classList.contains("sheet-visible"), false);
});
