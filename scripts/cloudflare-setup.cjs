#!/usr/bin/env node
/**
 * Build setup for Cloudflare Workers Git integration.
 * In Cloudflare CI (CF_PAGES or CLOUDFLARE_API_TOKEN present):
 *   1. Ensure D1 database exists
 *   2. Build web frontend
 *   3. Apply D1 migrations
 * Locally: skip.
 */
const { execSync } = require("node:child_process");

const hasCloudflareAuth = !!(
  process.env.CLOUDFLARE_API_TOKEN ||
  process.env.CF_PAGES === "1"
);

if (!hasCloudflareAuth) {
  console.log("[cloudflare-setup] Local environment, skipping build setup.");
  process.exit(0);
}

console.log("[cloudflare-setup] Cloudflare CI detected, running full setup...");

execSync("node scripts/ensure-d1.cjs", { stdio: "inherit" });
execSync("npm run build", { stdio: "inherit" });
execSync("npx wrangler d1 migrations apply ternssh --remote", { stdio: "inherit" });

console.log("[cloudflare-setup] Done.");
