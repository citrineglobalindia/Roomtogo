import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://room2go:room2go@localhost:5432/room2go_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Requires `npm run build` first. Recreates and seeds the isolated e2e database.
    command: `npx tsx scripts/e2e-prepare.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      APP_ENV: "development",
      DEMO_MODE: "true",
      DATABASE_URL: E2E_DB,
      PUBLIC_BASE_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-better-auth-secret-0123456789abcdefghijklmn",
      APP_SECRET: "e2e-app-secret-0123456789abcdefghijklmnopqrstuv",
      PAYMENT_PROVIDER: "demo",
      EMAIL_PROVIDER: "demo",
      STORAGE_PROVIDER: "local",
      LOCAL_STORAGE_DIR: "./storage-e2e",
      CRON_SECRET: "e2e-cron",
      SETUP_TOKEN: "e2e-setup-token",
    },
  },
});
