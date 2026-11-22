"use client";

import Link from "next/link";
import { useMemo } from "react";
import { calculatePortfolio } from "@/lib/portfolio/portfolio";
import type { Portfolio } from "@/lib/types";
import { Icon, type IconName } from "@/components/icon";
import { usePortfoliosContext } from "./portfolios-provider";
import { SidebarPortfolioLink } from "./sidebar-portfolio-link";
import { useWorkspaceNavigation } from "./use-workspace-navigation";
import { scrollToTop, type WorkspaceView } from "./workspace-routes";

type SidebarNavigationItem = {
  view: Exclude<WorkspaceView, "account">;
  icon: IconName;
  text: string;
};

const sidebarNavigation: SidebarNavigationItem[] = [
  { view: "overview", icon: "overview", text: "Visão geral" },
  { view: "positions", icon: "positions", text: "Posições" },
  { view: "transactions", icon: "transactions", text: "Transações" },
  { view: "notes", icon: "info", text: "Notas explicativas" },
];

export function WorkspaceSidebar() {
  const {
    portfolios,
    ready,
    storageBroken,
    identity,
    sidebarAccountControls,
    openModal,
    startRename,
    clearSectionSearches,
  } = usePortfoliosContext();
  const { view, currentPortfolio, sectionHref, portfolioHref } =
    useWorkspaceNavigation();
  const openPositionsCount = useOpenPositionsCount(currentPortfolio);
  const portfoliosLocked = !ready || storageBroken !== null;

  function hrefFor(item: SidebarNavigationItem): string {
    if (item.view === "notes") return "/notas";

    return sectionHref(item.view);
  }

  return (
    <>
      <span className="workspace-label">ESPAÇO PESSOAL</span>
      <nav aria-label="Navegação principal">
        {sidebarNavigation.map((item) => {
          const isActive = view === item.view;
          const primaryClass =
            item.view === "notes" ? "" : "sidebar-primary-link";

          return (
            <Link
              key={item.view}
              href={hrefFor(item)}
              className={`nav-item ${primaryClass} ${isActive ? "active" : ""}`}
              aria-label={item.text}
              title={item.text}
              onClick={scrollToTop}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span className="nav-label">{item.text}</span>
              {item.view === "positions" ? (
                <small aria-hidden="true">{openPositionsCount}</small>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-portfolios">
        <div className="side-heading">
          <span>CARTEIRAS</span>
          <button
            aria-label="Criar carteira"
            disabled={portfoliosLocked}
            onClick={() => openModal("portfolio")}
          >
            <Icon name="plus" />
          </button>
        </div>
        {portfolios.map((item) => (
          <SidebarPortfolioLink
            key={item.id}
            portfolio={item}
            href={portfolioHref(item.id)}
            selected={currentPortfolio?.id === item.id}
            disabled={portfoliosLocked}
            onSelect={clearSectionSearches}
            onRename={startRename}
          />
        ))}
      </div>
      <div className="sidebar-bottom">
        <div className="local-badge">
          <Icon name="shield" />
          <div>
            <strong>{identity ? "Modo conta" : "Modo local"}</strong>
          </div>
        </div>
        <Link
          className={`nav-item ${view === "account" ? "active" : ""}`}
          href="/definicoes"
          aria-current={view === "account" ? "page" : undefined}
        >
          <Icon name="shield" />
          <span className="nav-label">Definições da conta</span>
        </Link>
        {sidebarAccountControls}
        <a
          href="https://github.com/pecoelho01"
          target="_blank"
          rel="noreferrer"
        >
          Feito por Pedro <Icon name="external" />
        </a>
      </div>
    </>
  );
}

/** Counts open positions from the orders alone; market prices are not needed. */
function useOpenPositionsCount(portfolio: Portfolio | undefined): number {
  const orders = portfolio?.orders;
  const currency = portfolio?.currency ?? "EUR";

  return useMemo(() => {
    if (!orders) return 0;

    const summary = calculatePortfolio(orders, {}, currency);

    return summary.positions.filter((position) => position.shares > 0).length;
  }, [orders, currency]);
}
