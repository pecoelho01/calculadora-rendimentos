import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { themeScript } from "@/lib/theme";
import "./globals.css";
import "./fidelity.css";
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
    <html lang="pt-PT" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
