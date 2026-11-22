import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { checkAccountSchema } from "./src/server/release/schema-contract";
const config: NextConfig = {
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
  async redirects() {
    return [
      // `/conta` was published before the routes were reorganised.
      { source: "/conta", destination: "/definicoes", permanent: false },
      // Short portfolio links open the overview section.
      {
        source: "/carteira/:id",
        destination: "/carteira/:id/geral",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
          },
        ],
      },
    ];
  },
};
export default async function configureNext(
  phase: string,
): Promise<NextConfig> {
  if (
    phase === PHASE_PRODUCTION_BUILD &&
    process.env.VERCEL_ENV === "production"
  ) {
    await checkAccountSchema(process.env);
  }
  return config;
}
