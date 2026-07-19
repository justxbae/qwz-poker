import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateLaunchReadiness } from "../server/launch-readiness.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = evaluateLaunchReadiness(process.env);

for (const file of ["public/terms.html", "public/privacy.html"]) {
  try {
    const content = await readFile(path.join(rootDir, file), "utf8");
    if (/уточняется|будет дополнено|placeholder|todo/i.test(content)) {
      result.warnings.push({ code: `legal.${file}`, message: `${file}: остался незаполненный юридический текст.` });
    }
  } catch {
    result.errors.push({ code: `legal.${file}`, message: `${file} отсутствует.` });
  }
}

result.ok = result.errors.length === 0;
console.log(`Weez launch preflight: ${result.ok ? "PASS" : "FAIL"}`);
for (const item of result.errors) console.error(`ERROR [${item.code}] ${item.message}`);
for (const item of result.warnings) console.warn(`WARN  [${item.code}] ${item.message}`);
console.log(`${result.errors.length} errors, ${result.warnings.length} warnings`);
process.exitCode = result.ok ? 0 : 1;
