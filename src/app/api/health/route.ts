import { checkAccountSchema } from "@/server/release/schema-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const account = await checkAccountSchema(process.env);
    return Response.json(
      {
        status: "ok",
        account,
        revision: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      },
      { headers },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
