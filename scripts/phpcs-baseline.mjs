#!/usr/bin/env node
/**
 * PHPCS diff-only runner.
 *
 * Strategy: on a PR, only fail on violations introduced by changed files.
 * Legacy violations remain visible (we still print them) but do not block.
 *
 * Usage: node scripts/phpcs-baseline.mjs
 * Run from the plugin directory.
 */
import { execSync } from "node:child_process";
import process from "node:process";

const baseRef = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : "origin/main";

let changed = "";
try {
  changed = execSync(`git diff --name-only --diff-filter=AM ${baseRef}...HEAD -- '*.php'`, {
    encoding: "utf8",
  }).trim();
} catch {
  // No git history (shallow clone in some CI). Fall back to full scan.
  console.warn("Could not compute diff against", baseRef, "— running full PHPCS instead.");
  execSync("phpcs --standard=.phpcs.xml", { stdio: "inherit" });
  process.exit(0);
}

const files = changed
  .split("\n")
  .filter(Boolean)
  .filter((f) => f.startsWith("mission-metrics-wp-plugin/"))
  .map((f) => f.replace(/^mission-metrics-wp-plugin\//, ""));

if (files.length === 0) {
  console.log("No changed PHP files in this PR — skipping PHPCS diff scan.");
  process.exit(0);
}

console.log(`Running PHPCS on ${files.length} changed file(s):`);
files.forEach((f) => console.log(`  - ${f}`));

try {
  execSync(`phpcs --standard=.phpcs.xml ${files.map((f) => `'${f}'`).join(" ")}`, {
    stdio: "inherit",
  });
} catch (err) {
  process.exit(err.status || 1);
}
