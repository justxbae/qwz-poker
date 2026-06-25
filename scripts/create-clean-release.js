import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "release");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of ["server", "public", "package.json", "package-lock.json", "render.yaml"]) {
  const source = path.join(root, entry);
  if (!existsSync(source)) continue;
  await cp(source, path.join(out, entry), {
    recursive: true,
    filter: (item) => {
      const base = path.basename(item);
      return !base.startsWith(".DS_Store");
    }
  });
}

await writeFile(
  path.join(out, "README_RELEASE.txt"),
  [
    "QWZ Poker clean runtime export.",
    "",
    "Included: server/, public/, package files, render.yaml.",
    "Excluded: docs/, tests/, markdown specs, git metadata, local env files.",
    "",
    "Deploy with MINIMAL_LAUNCH=true for the test-launch UI."
  ].join("\n")
);

console.log(`Clean release exported to ${out}`);
