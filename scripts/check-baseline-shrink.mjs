#!/usr/bin/env node
/**
 * Baseline-ratchet enforcer.
 *
 * Compares the current PHPStan baseline entry count against the previous
 * release tag's baseline. Fails the release if the count grew.
 *
 * Usage: node scripts/check-baseline-shrink.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BASELINE = "mission-metrics-wp-plugin/phpstan-baseline.neon";

function countEntries(content) {
  // Each entry under `ignoreErrors` is a `-` list item.
  const m = content.match(/^\s*-\s/gm);
  return m ? m.length : 0;
}

if (!fs.existsSync(BASELINE)) {
  console.log("No baseline file present — nothing to ratchet.");
  process.exit(0);
}

const current = countEntries(fs.readFileSync(BASELINE, "utf8"));

let previous = current;
try {
  const prevTag = execSync("git describe --tags --abbrev=0 HEAD^ 2>/dev/null", {
    encoding: "utf8",
  }).trim();
  if (prevTag) {
    const prevContent = execSync(`git show ${prevTag}:${BASELINE}`, { encoding: "utf8" });
    previous = countEntries(prevContent);
  }
} catch {
  console.log("No previous tag to compare against — accepting current baseline.");
  process.exit(0);
}

console.log(`PHPStan baseline entries — previous: ${previous}, current: ${current}`);

if (current > previous) {
  console.error(
    `::error::Baseline grew by ${current - previous} entries. New legacy violations are not permitted; fix them or do not add them.`,
  );
  process.exit(1);
}

console.log("✔ Baseline did not grow.");
