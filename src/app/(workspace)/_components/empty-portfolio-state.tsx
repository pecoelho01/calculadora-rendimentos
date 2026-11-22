"use client";

import { Icon } from "@/components/icon";
import { usePortfoliosContext } from "./portfolios-provider";

type EmptyPortfolioStateProps = {
  /** Without a portfolio the first step is creating one. */
  hasPortfolio: boolean;
  emptyItems: "positions" | "transactions";
};

export function EmptyPortfolioState({
  hasPortfolio,
  emptyItems,
}: EmptyPortfolioStateProps) {
  const { openModal, loadDemo } = usePortfoliosContext();
  const title =
    emptyItems === "positions"
      ? "Ainda não tens posições"
      : "Ainda não tens transações";
  const description = hasPortfolio
    ? "Adiciona a primeira transação ou importa um CSV."
    : "Cria a primeira carteira para registar transações.";
  const primaryLabel = hasPortfolio ? "Adicionar transação" : "Criar carteira";

  function startFirstStep() {
    openModal(hasPortfolio ? "order" : "portfolio");
  }

  return (
    <div className="empty-state">
      <div className="empty-illustration">
        <Icon name="positions" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <div>
        <button
          className="button primary no-print"
          onClick={startFirstStep}
        >
          <Icon name="plus" /> {primaryLabel}
        </button>
        <button
          className="text-button no-print"
          onClick={() => void loadDemo()}
        >
          Explorar uma carteira de exemplo <Icon name="external" />
        </button>
      </div>
      <a
        className="template-link no-print"
        href="/modelo_site_ativos.csv"
        download
      >
        Descarregar modelo CSV
      </a>
    </div>
  );
}
