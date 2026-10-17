import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as current from "../server/poker-engine.js";
import { scenarios } from "../tests/fixtures/holdem-scenarios.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineRef = process.argv[2] || "4f6f42495e216a42a6a345276abfbf54d1663e2a";
const temporary = await mkdtemp(path.join(os.tmpdir(), "weez-engine-comparison-"));
try {
  let source = execFileSync("git", ["show", `${baselineRef}:server/poker-engine.js`], { cwd: root, encoding: "utf8" });
  for (const dependency of ["economy", "poker-evaluator"]) {
    source = source.replace(`"./${dependency}.js"`, JSON.stringify(pathToFileURL(path.join(root, "server", `${dependency}.js`)).href));
  }
  const baselinePath = path.join(temporary, "baseline.mjs");
  await writeFile(baselinePath, source);
  const baseline = await import(pathToFileURL(baselinePath));
  const results = scenarios.map((scenario) => {
    const evaluate = (engine) => {
      try { scenario.run(engine); return { passed: true }; }
      catch (error) { return { passed: false, reason: error.message }; }
    };
    return { id: scenario.id, name: scenario.name, category: scenario.category, before: evaluate(baseline), after: evaluate(current) };
  });
  const report = {
    baselineRef,
    kernelRef: "d61417489da92a9535cd84c3a23c69f975e7056f",
    comparedAt: new Date().toISOString(),
    scope: "Same Weez scenario suite; baseline hand engine versus betting adapter. Economy/evaluator are shared, not a comparison of two complete rooms.",
    total: results.length,
    beforePassed: results.filter((result) => result.before.passed).length,
    afterPassed: results.filter((result) => result.after.passed).length,
    regressions: results.filter((result) => result.before.passed && !result.after.passed).length,
    results
  };
  const out = path.join(root, "output/kernel");
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "comparison.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Before: ${report.beforePassed}/${report.total}; after: ${report.afterPassed}/${report.total}; regressions: ${report.regressions}`);
  for (const result of results.filter((row) => !row.before.passed || !row.after.passed)) {
    console.log(`${result.id}: ${result.before.passed ? "pass" : "fail"} -> ${result.after.passed ? "pass" : "fail"}`);
  }
  console.log(`Report: ${path.join(out, "comparison.json")}`);
  if (report.afterPassed !== report.total || report.regressions > 0) process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
