import "server-only";
import { unstable_cache } from "next/cache";
import { loadGeography } from "../../lib/geography-source";
import {
  loadIsharesGeography,
  compactIsharesCatalog,
  ukCatalogUrl,
  usCatalogUrl,
} from "../../lib/ishares-geography";
import { publicText } from "../../lib/public-data";

const cachedCatalog = unstable_cache(
  async (region: "uk" | "us") => {
    const text = await publicText(
      new URL(region === "uk" ? ukCatalogUrl : usCatalogUrl),
      fetch,
      AbortSignal.timeout(8_000),
      8_000_000,
    );
    // Cache only public identity fields, keeping entries below the cache size limit.
    return compactIsharesCatalog(region, text);
  },
  ["ishares-product-catalog-v1"],
  { revalidate: 86400 },
);
// Only public lookup work is shared, never portfolios or quantities.
const pendingCatalogs = new Map<"uk" | "us", Promise<string>>();
function catalog(region: "uk" | "us") {
  const existing = pendingCatalogs.get(region);
  if (existing) return existing;
  const task = cachedCatalog(region).finally(() =>
    pendingCatalogs.delete(region),
  );
  pendingCatalogs.set(region, task);
  return task;
}
const cachedGeography = unstable_cache(
  async (ticker: string) => {
    const data = ticker.includes(".")
      ? await loadGeography(ticker, fetch, (isin) =>
          loadIsharesGeography({ isin }, fetch, catalog),
        )
      : await loadIsharesGeography({ ticker }, fetch, catalog);
    if (!data) throw new Error("Composição geográfica indisponível");
    return data;
  },
  ["holdings-geography-v3"],
  { revalidate: 86400 },
);

// A short cache also covers unavailable tickers, avoiding repeated failed downloads.
const recentGeography = unstable_cache(
  async (ticker: string) => {
    try {
      return await cachedGeography(ticker);
    } catch {
      return null;
    }
  },
  ["geography-result-v1"],
  { revalidate: 300 },
);
const pendingGeographies = new Map<
  string,
  ReturnType<typeof recentGeography>
>();
export function getGeography(ticker: string) {
  if (!/^[A-Z0-9.-]{1,20}$/.test(ticker)) return Promise.resolve(null);
  const existing = pendingGeographies.get(ticker);
  if (existing) return existing;
  const task = recentGeography(ticker).finally(() =>
    pendingGeographies.delete(ticker),
  );
  pendingGeographies.set(ticker, task);
  return task;
}
