"use client";

import { usePathname } from "next/navigation";
import { usePortfoliosContext } from "./portfolios-provider";
import {
  PORTFOLIOS_PATH,
  portfolioPath,
  useRoutePortfolioId,
  workspaceViewFromPathname,
  type PortfolioSection,
} from "./workspace-routes";

/**
 * Navigation state shared by the sidebar and the mobile navigation: the
 * current view, the portfolio being shown and the links to each section.
 */
export function useWorkspaceNavigation() {
  const pathname = usePathname();
  const routePortfolioId = useRoutePortfolioId();
  const {
    portfolios,
    portfolio: selectedPortfolio,
    sectionSearches,
    lastPortfolioSection,
  } = usePortfoliosContext();

  const view = workspaceViewFromPathname(pathname);
  const routePortfolio = portfolios.find(
    (item) => item.id === routePortfolioId,
  );
  const currentPortfolio = routePortfolio ?? selectedPortfolio;

  function sectionHref(section: PortfolioSection): string {
    if (!currentPortfolio) return PORTFOLIOS_PATH;

    return portfolioPath(
      currentPortfolio.id,
      section,
      sectionSearches[section],
    );
  }

  /** Keeps the current section when switching portfolio from the sidebar. */
  function portfolioHref(portfolioId: string): string {
    const section =
      view === "positions" || view === "transactions" ? view : "overview";

    return portfolioPath(portfolioId, section);
  }

  /** Returns from other pages to the portfolio section that was last open. */
  function returnToPortfolioHref(): string {
    return sectionHref(lastPortfolioSection);
  }

  return {
    view,
    currentPortfolio,
    sectionHref,
    portfolioHref,
    returnToPortfolioHref,
  };
}
