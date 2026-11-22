"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { readLastPortfolioIds, writeLastPortfolioId } from "@/lib/storage";
import { NoPortfoliosView } from "../_components/no-portfolios-view";
import { usePortfoliosContext } from "../_components/portfolios-provider";
import { portfolioPath } from "../_components/workspace-routes";

/**
 * `/carteira` opens the last portfolio used in this storage mode, or shows the
 * empty state when there is none. The redirect runs in the browser because
 * the portfolios only exist there.
 */
export default function PortfoliosPage() {
  const router = useRouter();
  const { portfolios, ready, storageBroken, identity } = usePortfoliosContext();
  const hasPortfolios = portfolios.length > 0;

  useEffect(() => {
    if (!ready || storageBroken !== null || !hasPortfolios) return;

    const storageMode = identity ? "account" : "local";
    const rememberedIds = readLastPortfolioIds();
    const lastId = rememberedIds?.[storageMode];
    const portfolio =
      portfolios.find((item) => item.id === lastId) ?? portfolios[0];

    writeLastPortfolioId(storageMode, portfolio.id);
    // Keeps query parameters such as auth callbacks for the next page.
    router.replace(`${portfolioPath(portfolio.id)}${window.location.search}`);
  }, [hasPortfolios, identity, portfolios, ready, router, storageBroken]);

  if (hasPortfolios) return null;

  return <NoPortfoliosView />;
}
