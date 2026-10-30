import { NextRequest, NextResponse } from "next/server";
import { getAsset } from "@/lib/market";
import { MAX_TICKERS, tickerPattern, validDate } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("tickers") ?? "";
  const start = request.nextUrl.searchParams.get("start") ?? "";
  const tickers = [...new Set(raw.split(",").filter(Boolean))];
  if (
    !tickers.length ||
    tickers.length > MAX_TICKERS ||
    !tickers.every((t) => tickerPattern.test(t)) ||
    !validDate(start)
  ) {
    return NextResponse.json(
      { error: "Pedido inválido: até 20 tickers e data ISO desde 2000." },
      { status: 400 },
    );
  }
  const assets = await Promise.all(
    [...new Set([...tickers, "^GSPC"])].map(async (ticker) => {
      try {
        return [ticker, await getAsset(ticker, start)] as const;
      } catch {
        return [
          ticker,
          {
            price: null,
            previousClose: null,
            currency: null,
            name: ticker,
            asOf: null,
            history: [],
            error: "Dados indisponíveis. Tenta novamente mais tarde.",
          },
        ] as const;
      }
    }),
  );
  // The URL contains holdings; avoid caching the combined response in shared browsers/CDNs.
  return NextResponse.json(
    { assets: Object.fromEntries(assets) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
