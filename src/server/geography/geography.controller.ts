import type { createGeographyService } from "./geography.service";
import { createServerTiming } from "../shared/http/server-timing";

export function createGeographyHandler(
  loadGeographies: ReturnType<typeof createGeographyService>,
) {
  return async function GET(request: Request) {
    const timing = createServerTiming();
    const query = new URL(request.url).searchParams;
    const tickers = query.get("tickers") ?? "";
    const result = await timing.measure("service", () =>
      loadGeographies(tickers),
    );
    if (!result)
      return timing.response(
        Response.json(
          { error: "Pedido inválido: indicar entre 1 e 20 tickers." },
          { status: 400 },
        ),
      );
    return timing.response(
      Response.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      }),
    );
  };
}
