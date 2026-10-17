import { readFileSync } from "node:fs";

// Explicit environment values, including an empty string, take precedence over .env.
export function loadEnv(filePath, env = process.env) {
  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (env[key] === undefined) env[key] = trimmed.slice(separator + 1).trim();
  }
}
