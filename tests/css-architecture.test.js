import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  html: new URL("../public/index.html", import.meta.url),
  styles: new URL("../public/styles.css", import.meta.url),
  lobby: new URL("../public/lobby-qa.css", import.meta.url),
  telegram: new URL("../public/telegram-ui-kit-overrides.css", import.meta.url),
  canonical: new URL("../public/weez-design-system-v2.css", import.meta.url),
};

const legacyBudgets = {
  styles: { lines: 14_233, important: 1_074 },
  lobby: { lines: 1_944, important: 1_032 },
  telegram: { lines: 11_140, important: 5_906 },
};

async function source(name) {
  return readFile(files[name], "utf8");
}

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

test("canonical design system is the final stylesheet", async () => {
  const html = await source("html");
  const stylesheets = [...html.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"[^>]*>/g)].map((match) => match[1]);
  assert.equal(stylesheets.at(-1)?.split("?")[0], "/weez-design-system-v2.css");
});

test("legacy CSS cannot grow while components migrate to Design System 2.0", async () => {
  for (const [name, budget] of Object.entries(legacyBudgets)) {
    const css = await source(name);
    const lines = css.trimEnd().split("\n").length;
    const important = count(css, /!important\b/g);
    assert.ok(lines <= budget.lines, `${name} grew to ${lines} lines (budget ${budget.lines})`);
    assert.ok(important <= budget.important, `${name} grew to ${important} !important rules (budget ${budget.important})`);
  }

  const telegram = await source("telegram");
  assert.doesNotMatch(telegram, /In-game toolbar: use source SVGs/);
  assert.doesNotMatch(telegram, /Both game panels share one Telegram grouped-list component/);
});

test("canonical CSS exposes core tokens and accessibility guards", async () => {
  const css = await source("canonical");
  assert.ok(css.trimEnd().split("\n").length <= 1_300, "canonical CSS exceeded its migration budget");
  assert.ok(count(css, /!important\b/g) <= 700, "canonical CSS accumulated too many overrides");
  for (const token of [
    "--weez-bg",
    "--weez-section",
    "--weez-cell",
    "--weez-text",
    "--weez-secondary",
    "--weez-accent",
    "--weez-radius-section",
    "--weez-radius-row",
  ]) {
    assert.match(css, new RegExp(`${token.replaceAll("-", "\\-")}:`));
  }
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /body\.in-game \.side-menu/);
  assert.match(css, /body\.in-game \.info-drawer/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
});
