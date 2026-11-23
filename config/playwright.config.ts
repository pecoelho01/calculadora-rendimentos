import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PLAYWRIGHT_PORT inválido.");
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "../tests/e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/supabase-real/**",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      // Os testes independentes de layout, navegação e toque já correm no desktop.
      grepInvert: /@desktop-only/,
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: `npm start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
