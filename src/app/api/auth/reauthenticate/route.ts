import "server-only";
import { createAuthHandler } from "@/server/auth/auth.controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createAuthHandler("reauthenticate");
export const POST = handle;
