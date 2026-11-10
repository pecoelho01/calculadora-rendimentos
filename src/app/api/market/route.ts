import { createMarketHandler } from "@/server/market/market.controller";
import { createMarketService } from "@/server/market/market.service";
import { getAsset } from "@/server/market/yahoo.adapter";

export const runtime = "nodejs";
export const maxDuration = 60;
export function GET(request: Request) {
  return createMarketHandler(createMarketService(getAsset))(request);
}
