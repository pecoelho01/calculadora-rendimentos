import { NextRequest, NextResponse } from "next/server";
import { getGeography } from "@/lib/geography";
import { MAX_TICKERS, tickerPattern } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = [...new Set(raw.split(",").filter(Boolean))];
  if (
    !tickers.length ||
    tickers.length > MAX_TICKERS ||
    !tickers.every((ticker) => tickerPattern.test(ticker))
  ) {
    return NextResponse.json(
      { error: "Pedido inválido: indicar entre 1 e 20 tickers." },
      { status: 400 },
    );
  }
  const entries = await Promise.all(
    tickers.map(
      async (ticker) => [ticker, await getGeography(ticker)] as const,
    ),
  );
  return NextResponse.json(
    { geographies: Object.fromEntries(entries) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
