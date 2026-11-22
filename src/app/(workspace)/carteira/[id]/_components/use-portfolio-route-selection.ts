"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { writeLastPortfolioId } from "@/lib/storage";
import type { Portfolio } from "@/lib/types";
import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";
import {
  PORTFOLIOS_PATH,
  portfolioPath,
  type PortfolioSection,
} from "@/app/(workspace)/_components/workspace-routes";

const OTHER_TAB_CHANGE_MESSAGE = "Os dados foram alterados noutro separador.";

/**
 * Connects the portfolio in the URL to the stored selection: remembers the
 * last opened portfolio and recovers when the id stops existing.
 */
export function usePortfolioRouteSelection(
  routePortfolioId: string | undefined,
  section: PortfolioSection,
) {
  const router = useRouter();
  const {
    portfolios,
    ready,
    identity,
    message,
    notify,
    selectPortfolio,
    removePortfolio,
  } = usePortfoliosContext();
  const [expectedMissingId, setExpectedMissingId] = useState<string | null>(
    null,
  );
  const previousPortfolioIdsRef = useRef<string[]>([]);
  const lastWrittenPortfolioIdRef = useRef<string | null>(null);

  const portfolio = portfolios.find((item) => item.id === routePortfolioId);
  const storageMode = identity ? "account" : "local";

  useEffect(
    function syncRoutePortfolio() {
      if (!ready || !routePortfolioId) return;

      if (portfolio) {
        selectPortfolio(portfolio.id);
        if (lastWrittenPortfolioIdRef.current !== portfolio.id) {
          writeLastPortfolioId(storageMode, portfolio.id);
          lastWrittenPortfolioIdRef.current = portfolio.id;
        }
        previousPortfolioIdsRef.current = portfolios.map((item) => item.id);
        return;
      }

      const wasRemovedIntentionally = expectedMissingId === routePortfolioId;
      // A portfolio that disappeared while open (another tab, a sync) falls
      // back to the first one instead of warning about an invalid link.
      const disappearedWhileOpen =
        previousPortfolioIdsRef.current.includes(routePortfolioId) ||
        message.includes(OTHER_TAB_CHANGE_MESSAGE);
      const fallback = portfolios[0];
      previousPortfolioIdsRef.current = portfolios.map((item) => item.id);

      if (!wasRemovedIntentionally && disappearedWhileOpen && fallback) {
        selectPortfolio(fallback.id);
        writeLastPortfolioId(storageMode, fallback.id);
        router.replace(portfolioPath(fallback.id, section));
        return;
      }

      if (!wasRemovedIntentionally && !disappearedWhileOpen)
        notify("A carteira pedida não existe ou já não está disponível.");
      router.replace(PORTFOLIOS_PATH);
    },
    [
      expectedMissingId,
      message,
      notify,
      portfolio,
      portfolios,
      ready,
      routePortfolioId,
      router,
      section,
      selectPortfolio,
      storageMode,
    ],
  );

  async function removeRoutePortfolio(target: Portfolio) {
    setExpectedMissingId(target.id);
    const removed = await removePortfolio();
    if (removed) router.replace(PORTFOLIOS_PATH);
    else setExpectedMissingId(null);
  }

  return { portfolio, removeRoutePortfolio };
}
