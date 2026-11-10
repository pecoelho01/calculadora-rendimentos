import type { createMarketService } from "./market.service";

export function createMarketHandler(loadMarket: ReturnType<typeof createMarketService>) {
  return async function GET(request: Request) {
    const query = new URL(request.url).searchParams;
    const result = await loadMarket(query.get("tickers") ?? "", query.get("start") ?? "");
    if (!result) return Response.json(
      { error: "Pedido inválido: até 20 tickers e data ISO desde 2000." },
      { status: 400 },
    );
    // Only public provider data is cached; the combined response is private.
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  };
}
