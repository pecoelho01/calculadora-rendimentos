import type { Geography } from "./types";
import { countryCode } from "./geography-countries";

const origin = "https://www.justetf.com";
const isinPattern = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
// Yahoo exchange suffixes must match the provider's actual listing, never domicile.
const exchanges: Record<string, string> = {
  DE: "xetr",
  AS: "xams",
  L: "xlon",
  PA: "xpar",
  MI: "xmil",
  SW: "xswx",
};

function field(html: string, testId: string) {
  return html
    .match(new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`))?.[1]
    .trim();
}

function profileMatches(html: string, ticker: string, isin: string) {
  if (!isinPattern.test(isin)) return false;
  const [symbol, suffix, extra] = ticker.split(".");
  const exchange = exchanges[suffix];
  if (extra || !exchange) return false;
  const listings = [
    ...html.matchAll(
      new RegExp(
        `data-testid="etf-trade-data-panel_row-${exchange}_ticker"[^>]*>([^<]*)<`,
        "g",
      ),
    ),
  ];
  if (!listings.some((match) => match[1].trim() === symbol)) return false;
  // Also confirm the page identity; a redirect must not classify a different ETF.
  if (!html.includes(`isin=${isin}`)) return false;
  return true;
}

export function parseGeography(
  html: string,
  ticker: string,
  isin: string,
): Geography | null {
  if (!profileMatches(html, ticker, isin)) return null;
  const table = html.match(
    /data-testid="etf-holdings_countries_table"[^>]*>([\s\S]*?)<\/table>/,
  )?.[1];
  const date = field(html, "tl_etf-holdings_reference-date")?.match(
    /^As of (\d{2})\/(\d{2})\/(\d{4})$/,
  );
  if (!table || !date) return null;
  const asOf = `${date[3]}-${date[2]}-${date[1]}`;
  const parsedDate = new Date(asOf + "T00:00:00Z");
  if (
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== asOf ||
    asOf > new Date().toISOString().slice(0, 10)
  )
    return null;
  const allocations: Geography["allocations"] = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const country = countryCode(
      field(row[1], "tl_etf-holdings_countries_value_name") ?? "",
    );
    const raw = field(row[1], "tl_etf-holdings_countries_value_percentage");
    if (!raw || !/^\d+(?:\.\d+)?%$/.test(raw)) return null;
    const weight = Number(raw.slice(0, -1)) / 100;
    if (
      !country ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 1 ||
      allocations.some((a) => a.country === country)
    )
      return null;
    allocations.push({ country, weight });
  }
  const sum = allocations.reduce((n, a) => n + a.weight, 0);
  if (!allocations.length || sum <= 0 || sum > 1.001) return null;
  // Published percentages can exceed 100% by rounding only; cap that tiny excess.
  if (sum > 1)
    allocations.forEach((a) => {
      a.weight /= sum;
    });
  return {
    allocations,
    asOf,
    source: `${origin}/en/etf-profile.html?isin=${isin}`,
  };
}

/** Public ETF data only. The fetcher is injectable for deterministic contract tests. */
export async function loadGeography(
  ticker: string,
  fetcher: typeof fetch = fetch,
  issuer?: (isin: string) => Promise<Geography | null>,
): Promise<Geography | null> {
  const [symbol, suffix, extra] = ticker.split(".");
  if (extra || !exchanges[suffix] || !/^[A-Z0-9-]{1,20}$/.test(symbol))
    return null;
  const signal = AbortSignal.timeout(10_000);
  async function request(path: string, init: RequestInit = {}) {
    const url = new URL(path, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/en/"))
      throw new Error("Fonte inválida");
    const response = await fetcher(url, {
      ...init,
      signal,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Fonte indisponível");
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error("Resposta demasiado grande");
    return {
      body,
      cookies: response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
    };
  }
  try {
    const search = await request(
      `/en/search.html?query=${encodeURIComponent(symbol)}`,
    );
    const config = (key: string): string => {
      const raw = search.body.match(
        new RegExp(`"${key}":("(?:[^"\\\\]|\\\\.)*")`),
      )?.[1];
      if (!raw) throw new Error("Pesquisa indisponível");
      return JSON.parse(raw);
    };
    const result = await request(config("fetchCallbackUrl"), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: search.cookies,
      },
      body: new URLSearchParams({
        draw: "1",
        start: "0",
        length: "2",
        etfsParams: config("etfsParams"),
        universeType: "private",
        defaultCurrency: "EUR",
        lang: "en",
        country: "DE",
      }),
    });
    const json: unknown = JSON.parse(result.body);
    if (
      !json ||
      typeof json !== "object" ||
      !("data" in json) ||
      !Array.isArray(json.data) ||
      json.data.length !== 1 ||
      !("recordsFiltered" in json) ||
      json.recordsFiltered !== 1
    )
      return null;
    const candidate: unknown = json.data[0];
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !("isin" in candidate) ||
      typeof candidate.isin !== "string" ||
      !isinPattern.test(candidate.isin)
    )
      return null;
    const profile = await request(
      `/en/etf-profile.html?isin=${candidate.isin}`,
    );
    if (!profileMatches(profile.body, ticker, candidate.isin)) return null;
    const published = parseGeography(profile.body, ticker, candidate.isin);
    const direct = issuer
      ? await issuer(candidate.isin).catch(() => null)
      : null;
    return direct ?? published;
  } catch {
    return null;
  }
}
