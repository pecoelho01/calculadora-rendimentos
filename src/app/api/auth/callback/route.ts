import "server-only";
import { createAuthHandler } from "@/server/auth/auth.controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createAuthHandler("callback");
export const POST = handle;
