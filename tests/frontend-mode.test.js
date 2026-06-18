import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const renderConfig = await readFile(new URL("../render.yaml", import.meta.url), "utf8");

test("lobby starts in Cash mode without changing tabs when mode changes", () => {
  assert.match(appSource, /gameMode:\s*"cash"/);
  assert.doesNotMatch(appSource, /selectLobbyTab\(state\.gameMode === "play"/);
  assert.match(htmlSource, /class="active" data-game-mode="cash"/);
  assert.doesNotMatch(htmlSource, /class="active" data-game-mode="play"/);
});

test("rating mode hides cash-only game formats", () => {
  assert.match(
    cssSource,
    /body\[data-game-mode="play"\]:not\(\.in-game\) \.play-format-grid\s*\{[^}]*display:\s*none\s*!important;/s
  );
});

test("Render starts the production server with real money enabled", () => {
  assert.match(renderConfig, /startCommand:\s*npm start/);
  assert.match(renderConfig, /key:\s*REAL_MONEY_ENABLED\s*\n\s*value:\s*"true"/);
});
