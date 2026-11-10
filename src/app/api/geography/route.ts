import { createGeographyHandler } from "@/server/geography/geography.controller";
import { createGeographyService } from "@/server/geography/geography.service";
import { getGeography } from "@/server/geography/geography.adapter";

export const runtime = "nodejs";
export const maxDuration = 30;
export function GET(request: Request) {
  return createGeographyHandler(createGeographyService(getGeography))(request);
}
