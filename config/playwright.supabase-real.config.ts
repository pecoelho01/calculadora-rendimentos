import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PLAYWRIGHT_PORT inválido.");
}

const baseURL = `http://127.0.0.1:${port}`;
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR;
if (!outputDir) throw new Error("PLAYWRIGHT_OUTPUT_DIR é obrigatória.");

export default defineConfig({
  testDir: "../tests/e2e",
  testMatch: "**/supabase-real.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  outputDir,
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "supabase-real-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `env -u E2E_SUPABASE_USER_A_EMAIL -u E2E_SUPABASE_USER_A_PASSWORD -u E2E_SUPABASE_USER_B_EMAIL -u E2E_SUPABASE_USER_B_PASSWORD -u E2E_MAILPIT_URL npm start -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
