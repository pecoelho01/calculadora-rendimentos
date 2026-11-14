import "server-only";
import { createAuthHandler } from "@/server/auth/auth.controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createAuthHandler("logout");
export const POST = handle;
