import type { createGeographyService } from "./geography.service";

export function createGeographyHandler(loadGeographies: ReturnType<typeof createGeographyService>) {
  return async function GET(request: Request) {
    const query = new URL(request.url).searchParams;
    const result = await loadGeographies(query.get("tickers") ?? "");
    if (!result) return Response.json(
      { error: "Pedido inválido: indicar entre 1 e 20 tickers." },
      { status: 400 },
    );
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  };
}
