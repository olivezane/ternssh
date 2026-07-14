#!/usr/bin/env node
/**
 * Ensures the D1 database exists on the Cloudflare account.
 * Idempotent: safe to run on every deploy.
 *
 * Modeled after nodewarden's scripts/ensure-kv.cjs.
 */
const { execSync } = require("node:child_process");

const DATABASE_NAME = "ternssh";

function wrangler(args) {
  return execSync(`npx wrangler ${args}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function main() {
  // Try to find an existing database by name
  try {
    const list = JSON.parse(wrangler("d1 list --json"));
    const existing = list.find((db) => db.name === DATABASE_NAME);
    if (existing) {
      console.log(
        `[ensure-d1] D1 database "${DATABASE_NAME}" already exists (${existing.uuid})`,
      );
      return;
    }
  } catch {
    console.log("[ensure-d1] Could not list D1 databases, will try to create...");
  }

  // Not found — create it
  try {
    console.log(`[ensure-d1] Creating D1 database "${DATABASE_NAME}"...`);
    const out = wrangler(`d1 create ${DATABASE_NAME}`);
    console.log(out);
    console.log("[ensure-d1] D1 database created successfully.");
  } catch (err) {
    const msg = err.stderr || err.message || String(err);
    if (msg.includes("already exists")) {
      console.log(
        `[ensure-d1] D1 database "${DATABASE_NAME}" already exists (race).`,
      );
      return;
    }
    throw err;
  }
}

main();
