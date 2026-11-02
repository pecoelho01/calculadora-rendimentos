import type { Geography } from "./types";
import { countryCode } from "./geography-countries";
import { publicText } from "./public-data";

export const ukCatalogUrl =
  "https://www.ishares.com/varnish-api/blk-product-screener-server/api/v1/product-screener/product-data?country=gb&language=en&siteName=ishares-uk&userType=individual";
export const usCatalogUrl =
  "https://www.ishares.com/us/products/etf-investments";
export type IssuerRequest = { isin: string } | { ticker: string };

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(value.replace(/\r$/, "").trim());
      value = "";
      if (char === "\n") {
        rows.push(row);
        row = [];
      }
    } else value += char;
  }
  if (quoted) throw new Error("CSV incompleto");
  if (value || row.length) {
    row.push(value.trim());
    rows.push(row);
  }
  return rows;
}
const number = (value: string) => {
  const clean = value.replaceAll(",", "");
  return /^-?\d+(?:\.\d+)?$/.test(clean) ? Number(clean) : NaN;
};
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function date(value: string) {
  const match = value.match(
    /^(?:(\d{1,2})\/([A-Za-z]{3})\/(\d{4})|([A-Za-z]{3}) (\d{1,2}), (\d{4}))$/,
  );
  if (!match) return null;
  const day = match[1] ?? match[5],
    month = months.indexOf(match[2] ?? match[4]) + 1,
    year = match[3] ?? match[6];
  const iso = `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(iso + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === iso &&
    iso <= new Date().toISOString().slice(0, 10)
    ? iso
    : null;
}

/** Market values share the fund reporting currency, not each security's trading currency.
 * Cross-check every published weight against that common denominator before using it.
 * This avoids accumulating rounding errors across thousands of 0.00% positions. */
export function parseIsharesHoldings(
  text: string,
  source: string,
): Geography | null {
  try {
    const rows = csvRows(text.replace(/^\uFEFF/, ""));
    const asOf = date(
      rows.find((r) => r[0] === "Fund Holdings as of")?.[1] ?? "",
    );
    const start = rows.findIndex(
      (r) => r[0] === "Ticker" && r.includes("Asset Class"),
    );
    if (!asOf || start < 0) return null;
    const headers = rows[start];
    const col = (name: string) => headers.indexOf(name);
    const weightColumn =
      col("Weight (%)") >= 0 ? col("Weight (%)") : col("Market Weight");
    if (
      weightColumn < 0 ||
      ["Location", "Market Value", "Asset Class"].some((key) => col(key) < 0)
    )
      return null;
    const positions: {
      value: number;
      weight: number | null;
      country?: string;
      kind: string;
      derivativeNotional: number;
    }[] = [];
    for (const row of rows.slice(start + 1)) {
      if (row.every((cell) => !cell)) continue;
      if (row.length !== headers.length) return null;
      const value = number(row[col("Market Value")]);
      const raw = row[weightColumn];
      const weight = raw === "-" ? null : number(raw) / 100;
      const kind = row[col("Asset Class")];
      if (
        !Number.isFinite(value) ||
        (weight !== null && (!Number.isFinite(weight) || weight < 0)) ||
        (value < 0 && kind !== "Cash")
      )
        return null;
      // Swaps/collateral cannot be presented as the economic exposure of a synthetic ETF.
      if (/swap/i.test(kind) || /swap/i.test(row[col("Name")] ?? ""))
        return null;
      const nested =
        /\b(ETF|UCITS|ISHARES)\b/i.test(row[col("Name")] ?? "") ||
        /FUND|ETF|WARRANT/i.test(row[col("Type")] ?? "");
      const derivative = /future|option|forward|derivative|\bfx\b|cfd/i.test(
        kind,
      );
      const derivativeNotional = derivative
        ? Math.abs(number(row[col("Notional Value")] ?? ""))
        : 0;
      if (!Number.isFinite(derivativeNotional)) return null;
      positions.push({
        value,
        weight,
        kind,
        derivativeNotional,
        country: nested ? undefined : countryCode(row[col("Location")]),
      });
    }
    const total = positions.reduce((n, p) => n + p.value, 0);
    if (
      !positions.length ||
      !Number.isFinite(total) ||
      total <= 0 ||
      !positions.some((p) => (p.weight ?? 0) > 0)
    )
      return null;
    // A truncated file or values in mixed currencies fail this test. Allow 0.01 pp
    // for a published two-decimal weight; never renormalize a top-holdings subset.
    if (
      positions.some(
        (p) =>
          p.weight !== null && Math.abs(p.value / total - p.weight) > 0.000101,
      )
    )
      return null;
    const values = new Map<string, number>();
    for (const p of positions) {
      if (
        p.value <= 0 ||
        !p.country ||
        !["Equity", "Fixed Income"].includes(p.kind)
      )
        continue;
      values.set(p.country, (values.get(p.country) ?? 0) + p.value / total);
    }
    const allocations = [...values].map(([country, weight]) => ({
      country,
      weight,
    }));
    const covered = allocations.reduce((n, a) => n + a.weight, 0);
    if (!allocations.length || covered > 1 + 1e-10) return null;
    // Derivatives may equitize the unclassified cash balance of a physical fund.
    // Reject material synthetic exposure backed by otherwise classifiable collateral.
    const derivativeExposure =
      positions.reduce((n, p) => n + p.derivativeNotional, 0) / total;
    if (derivativeExposure > Math.max(0, 1 - covered) + 0.0001) return null;
    if (covered > 1)
      allocations.forEach((a) => {
        a.weight /= covered;
      });
    return {
      allocations,
      asOf,
      source,
      sourceName: "iShares",
      method: "holdings",
      holdingsCount: positions.length,
    };
  } catch {
    return null;
  }
}

function catalogProducts(text: string) {
  const json: unknown = JSON.parse(text);
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const products: {
    isin: string;
    productView: string[];
    productPageUrl: string;
  }[] = [];
  for (const candidate of Object.values(json)) {
    const row: unknown = candidate;
    if (
      !row ||
      typeof row !== "object" ||
      !("isin" in row) ||
      typeof row.isin !== "string" ||
      !("productView" in row) ||
      !Array.isArray(row.productView) ||
      !row.productView.includes("etf") ||
      !("productPageUrl" in row) ||
      typeof row.productPageUrl !== "string"
    )
      continue;
    products.push({
      isin: row.isin,
      productView: ["etf"],
      productPageUrl: row.productPageUrl,
    });
  }
  return products;
}

export function compactIsharesCatalog(region: "uk" | "us", text: string) {
  const compact =
    region === "uk"
      ? JSON.stringify(
          Object.fromEntries(
            catalogProducts(text).map((row, index) => [index, row]),
          ),
        )
      : [
          ...text.matchAll(
            /<a\b[^>]*href="(\/us\/products\/\d+\/[a-z0-9-]+)"[^>]*>([A-Z0-9]+)<\/a>/g,
          ),
        ]
          .map((m) => `<a href="${m[1]}">${m[2]}</a>`)
          .join("\n");
  if (compact === "{}" || !compact) throw new Error("Catálogo inválido");
  return compact;
}

export function isharesProductPath(
  request: IssuerRequest,
  catalog: string,
): string | null {
  if ("isin" in request) {
    const matches = catalogProducts(catalog).filter(
      (row) => row.isin === request.isin,
    );
    if (matches.length !== 1) return null;
    const path: string = matches[0].productPageUrl;
    return /^\/uk\/individual\/en\/products\/\d+\/[a-z0-9-]+$/.test(path)
      ? path
      : null;
  }
  if (!/^[A-Z0-9]{1,10}$/.test(request.ticker)) return null;
  const matches = [
    ...catalog.matchAll(
      /<a\b[^>]*href="(\/us\/products\/\d+\/[a-z0-9-]+)"[^>]*>([A-Z0-9]+)<\/a>/g,
    ),
  ].filter((m) => m[2] === request.ticker);
  const paths = [...new Set(matches.map((m) => m[1]))];
  return paths.length === 1 ? paths[0] : null;
}

export async function loadIsharesGeography(
  request: IssuerRequest,
  fetcher: typeof fetch = fetch,
  catalogLoader?: (region: "uk" | "us") => Promise<string>,
): Promise<Geography | null> {
  const signal = AbortSignal.timeout(10_000);
  const region = "isin" in request ? "uk" : "us";
  try {
    const catalog = catalogLoader
      ? await catalogLoader(region)
      : await publicText(
          new URL(region === "uk" ? ukCatalogUrl : usCatalogUrl),
          fetcher,
          signal,
          8_000_000,
        );
    const path = isharesProductPath(request, catalog);
    if (!path || signal.aborted) return null;
    const url = new URL(`https://www.ishares.com${path}/latest-holdings.csv`);
    return parseIsharesHoldings(
      await publicText(url, fetcher, signal, 8_000_000),
      url.href,
    );
  } catch {
    return null;
  }
}
