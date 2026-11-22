"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Portfolio } from "@/lib/types";
import type { PortfolioSection } from "@/app/(workspace)/_components/workspace-routes";
import type { usePortfolioValuation } from "./use-portfolio-valuation";

/** What the overview, positions and transactions pages need from the layout. */
export type PortfolioViewContextValue = ReturnType<
  typeof usePortfolioValuation
> & {
  portfolio: Portfolio;
  section: PortfolioSection;
  search: string;
  setSearch: (value: string) => void;
  clearSearch: () => void;
};

const PortfolioViewContext = createContext<PortfolioViewContextValue | null>(
  null,
);

export function PortfolioViewProvider({
  value,
  children,
}: {
  value: PortfolioViewContextValue;
  children: ReactNode;
}) {
  return (
    <PortfolioViewContext.Provider value={value}>
      {children}
    </PortfolioViewContext.Provider>
  );
}

export function usePortfolioView(): PortfolioViewContextValue {
  const context = useContext(PortfolioViewContext);
  if (!context) {
    throw new Error(
      "usePortfolioView tem de ser usado dentro de PortfolioViewProvider.",
    );
  }
  return context;
}
