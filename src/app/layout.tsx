import type { Metadata } from "next";
import { themeScript } from "@/lib/theme";
import "./globals.css";
export const metadata: Metadata = {
  title: "Rendimentos · A tua carteira, em perspetiva",
  description:
    "Acompanha os teus investimentos, transações e rentabilidade num único lugar.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
