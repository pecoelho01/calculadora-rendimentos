import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { themeScript } from "@/lib/theme";
import { ApplySavedTheme } from "@/components/theme/apply-saved-theme";
import "./globals.css";
import "./fidelity.css";
import "./(workspace)/portfolio-lists.css";
export const viewport: Viewport = {
  viewportFit: "cover",
};
export const metadata: Metadata = {
  title: "Rendimentos · A tua carteira, em perspetiva",
  description:
    "Acompanha os teus investimentos, transações e rentabilidade num único lugar.",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Request-time headers opt the document into dynamic rendering for its nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-PT"
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>
        <ApplySavedTheme />
        {children}
        {process.env.VERCEL === "1" ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
