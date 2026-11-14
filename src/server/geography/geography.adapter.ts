import "server-only";
import { unstable_cache } from "next/cache";
import { loadGeography } from "../../lib/geography-source";
import {
  loadIsharesGeography,
  compactIsharesCatalog,
  ukCatalogUrl,
  usCatalogUrl,
} from "../../lib/ishares-geography";
import type { Geography } from "../../lib/types";
import { publicText } from "../../lib/public-data";

async function fetchCatalog(region: "uk" | "us") {
  const catalogUrl = region === "uk" ? ukCatalogUrl : usCatalogUrl;
  const text = await publicText(
    new URL(catalogUrl),
    fetch,
    AbortSignal.timeout(8_000),
    8_000_000,
  );
  // Cache only public identity fields, keeping entries below the cache size limit.
  return compactIsharesCatalog(region, text);
}

const cachedCatalog = unstable_cache(
  fetchCatalog,
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
function loadIsharesByIsin(isin: string) {
  return loadIsharesGeography({ isin }, fetch, catalog);
}

async function fetchGeography(ticker: string) {
  let geography: Geography | null;
  if (ticker.includes(".")) {
    geography = await loadGeography(ticker, fetch, loadIsharesByIsin);
  } else {
    geography = await loadIsharesGeography({ ticker }, fetch, catalog);
  }
  if (!geography) throw new Error("Composição geográfica indisponível");
  return geography;
}

const cachedGeography = unstable_cache(
  fetchGeography,
  ["holdings-geography-v3"],
  { revalidate: 86400 },
);

async function fetchRecentGeography(ticker: string) {
  try {
    return await cachedGeography(ticker);
  } catch {
    return null;
  }
}

// A short cache also covers unavailable tickers, avoiding repeated failed downloads.
const recentGeography = unstable_cache(
  fetchRecentGeography,
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
