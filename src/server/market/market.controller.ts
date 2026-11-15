import type { createMarketService } from "./market.service";

export function createMarketHandler(
  loadMarket: ReturnType<typeof createMarketService>,
) {
  return async function GET(request: Request) {
    const query = new URL(request.url).searchParams;
    const tickers = query.get("tickers") ?? "";
    const start = query.get("start") ?? "";
    const result = await loadMarket(tickers, start);
    if (!result)
      return Response.json(
        { error: "Pedido inválido: até 20 tickers e data ISO desde 2000." },
        { status: 400 },
      );
    // Only public provider data is cached; the combined response is private.
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  };
}
