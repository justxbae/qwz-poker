import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createCleanRelease(out = path.join(root, "release")) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  for (const entry of [
    "server", "public", "package.json", "package-lock.json", "render.yaml",
    "vendor/pokersolver/pokersolver.js",
    "vendor/pokersolver/package.json",
    "vendor/pokersolver/LICENSE.md", "vendor/poker-kernel"
  ]) {
    const destination = path.join(out, entry);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, entry), destination, {
      recursive: true,
      filter: (item) => ![".DS_Store", "node_modules"].includes(path.basename(item))
    });
  }

  await writeFile(path.join(out, "README_RELEASE.txt"), [
    "Weez Poker runtime export.",
    "",
    "Included: server/, public/, vendor runtimes, corresponding source and licenses, package files, render.yaml.",
    "Poker Kernel is AGPL-3.0-only; retain the source/license and resolve the deployment license before publishing.",
    "Excluded: docs/, tests/, design references, git metadata, local env files.",
    "",
    "Install: npm ci --omit=dev",
    "Start: npm start",
    "Configure environment variables before starting; render.yaml enables real-money mode.",
    "Real-money mode requires PostgreSQL, Redis and production secrets."
  ].join("\n") + "\n");

  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Clean release exported to ${await createCleanRelease()}`);
}
