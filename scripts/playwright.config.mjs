import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 20_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8787",
    headless: true
  },
  webServer: {
    command: "npx wrangler dev --local --config scripts/wrangler.e2e.jsonc --port 8787 --ip 127.0.0.1",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
