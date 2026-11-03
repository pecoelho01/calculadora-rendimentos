import "server-only";
import { createAccountHandler } from "@/lib/account-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createAccountHandler();
export const POST = createAccountHandler();
