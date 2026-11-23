import { test, expect } from "@playwright/test";
import { mockMarketAndGeography } from "../../../helpers/dashboard/dashboard-helpers";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test(
  "API rejeita datas e símbolos inválidos antes de consultar Yahoo",
  { tag: "@desktop-only" },
  async ({ request }) => {
    for (const url of [
      "/api/market?tickers=TEST&start=2024-13-01",
      "/api/market?tickers=https://evil.test&start=2024-01-01",
    ]) {
      const result = await request.get(url);
      expect(result.status()).toBe(400);
    }
  },
);
