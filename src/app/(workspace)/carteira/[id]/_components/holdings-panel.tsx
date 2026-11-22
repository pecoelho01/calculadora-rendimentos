"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { EmptyPortfolioState } from "@/app/(workspace)/_components/empty-portfolio-state";
import { scrollToTop } from "@/app/(workspace)/_components/workspace-routes";
import { usePortfolioView } from "./portfolio-view-context";

type HoldingsPanelProps = {
  title: string;
  count: number;
  /** Compact panel shown in the overview, with a link to the full list. */
  showAllHref?: string;
  emptyItems: "positions" | "transactions";
  footerNote?: ReactNode;
  children: ReactNode;
};

/** Searchable list panel shared by the positions and transactions tables. */
export function HoldingsPanel({
  title,
  count,
  showAllHref,
  emptyItems,
  footerNote,
  children,
}: HoldingsPanelProps) {
  const { portfolio, search, setSearch } = usePortfolioView();
  const isCompact = showAllHref !== undefined;
  const hasOrders = portfolio.orders.length > 0;

  return (
    <section className={`panel holdings ${isCompact ? "" : "holdings-list"}`}>
      <div className="panel-heading">
        <div>
          <h2>
            {title} <span className="count">{count}</span>
          </h2>
        </div>
        <div className="table-actions no-print">
          <label className="search">
            <Icon name="search" />
            <input
              aria-label="Pesquisar ativo"
              placeholder="Pesquisar ativo…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {showAllHref ? (
            <Link
              className="text-button overview-all"
              href={showAllHref}
              onClick={scrollToTop}
            >
              Ver todas <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      </div>
      {hasOrders ? (
        <div className="table-scroll">{children}</div>
      ) : (
        <EmptyPortfolioState
          hasPortfolio
          emptyItems={emptyItems}
        />
      )}
      <div className="table-footer">
        <span>
          Valores em {portfolio.currency} · Cotações sujeitas a atraso
          {footerNote}
        </span>
      </div>
    </section>
  );
}
