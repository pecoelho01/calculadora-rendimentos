import type { createMarketService } from "./market.service";
import { createServerTiming } from "../shared/http/server-timing";

export function createMarketHandler(
  loadMarket: ReturnType<typeof createMarketService>,
) {
  return async function GET(request: Request) {
    const timing = createServerTiming();
    const query = new URL(request.url).searchParams;
    const tickers = query.get("tickers") ?? "";
    const start = query.get("start") ?? "";
    const result = await timing.measure("service", () =>
      loadMarket(tickers, start),
    );
    if (!result)
      return timing.response(
        Response.json(
          { error: "Pedido inválido: até 20 tickers e data ISO desde 2000." },
          { status: 400 },
        ),
      );
    // Only public provider data is cached; the combined response is private.
    return timing.response(
      Response.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      }),
    );
  };
}
