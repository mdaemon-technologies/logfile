/**
 * Removes declaration files that no consumer can reach.
 *
 * Rollup bundles the runtime into a single file, but @rollup/plugin-typescript
 * hands declaration emit to tsc, which writes one .d.ts per source file. Only
 * the types that surface in the public API of index.d.ts are ever imported, so
 * the rest ship unreachable. TypeScript also elides the types of private
 * members, which is why a module held only in a private field - the buffer,
 * the file target - contributes nothing to the published surface.
 *
 * There is no tsconfig option for this: narrowing `include` to the entry point
 * does not help, because tsc emits declarations for every file in the
 * compilation and index.ts imports them all at value level.
 *
 * Reachability is computed rather than listed, so adding or removing a module
 * needs no change here.
 *
 * Usage:
 *   node scripts/prune-types.mjs            delete unreachable declarations
 *   node scripts/prune-types.mjs --check    fail if any are present
 */
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Overridable so the reachability logic can be tested against a fixture. */
const DIST = process.env.PRUNE_DIST ?? "dist";
const ENTRY = "index.d.ts";

/**
 * Matches every relative reference tsc can emit into a declaration:
 * `from "./x"`, a bare `import "./x"`, and the inline `import("./x").Type`
 * form it uses for an inferred cross-module type.
 *
 * Deliberately permissive. A false positive only keeps a file that could have
 * gone; a false negative deletes one that is needed and ships broken types,
 * so the bias is toward over-matching.
 */
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*["']\.\/([^"']+)["']/g;

/** Maps an import specifier to the declaration file it resolves to. */
const declarationFor = (specifier) =>
  `${specifier.replace(/\.(d\.ts|js|mjs|cjs|ts)$/, "")}.d.ts`;

/**
 * Walks imports from the entry declaration.
 *
 * @returns The set of declaration file names a consumer can reach
 */
const reachable = () => {
  const seen = new Set();
  const queue = [ENTRY];

  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);

    let source;
    try {
      source = readFileSync(join(DIST, name), "utf8");
    } catch {
      // A declaration that is imported but absent is the build's problem, not
      // this script's; tsc reports it far more clearly than we could.
      continue;
    }

    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      queue.push(declarationFor(match[1]));
    }
  }

  return seen;
};

const check = process.argv.includes("--check");

const present = readdirSync(DIST).filter(name => name.endsWith(".d.ts"));
if (!present.includes(ENTRY)) {
  console.error(`[prune-types] ${join(DIST, ENTRY)} is missing; build first.`);
  process.exit(1);
}

const keep = reachable();
const orphans = present.filter(name => !keep.has(name));

if (orphans.length === 0) {
  console.log(`[prune-types] ${present.length} declaration file(s), all reachable.`);
  process.exit(0);
}

if (check) {
  console.error(
    `[prune-types] ${orphans.length} unreachable declaration file(s) in ${DIST}: ` +
    `${orphans.join(", ")}. Run "npm run build" to prune them.`
  );
  process.exit(1);
}

for (const name of orphans) {
  rmSync(join(DIST, name));
}
console.log(`[prune-types] removed ${orphans.length} unreachable declaration file(s): ${orphans.join(", ")}`);
