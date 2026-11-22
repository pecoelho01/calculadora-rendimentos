import type { calculatePortfolio } from "@/lib/portfolio/portfolio";
import { AllocationDonut } from "./allocation-donut";

type PortfolioSummary = ReturnType<typeof calculatePortfolio>;

const sliceColors = [
  "#0f9272",
  "#5979d9",
  "#9c8bdc",
  "#e9a968",
  "#d566a8",
  "#7e8b9f",
];

/** Share of each open position in the portfolio market value. */
export function AllocationByAssetChart({
  summary,
}: {
  summary: PortfolioSummary;
}) {
  const openPositions = summary.positions.filter(
    (position) => position.shares > 0,
  );
  const hasMarketValue = summary.value !== null && summary.value > 0;

  if (!hasMarketValue) {
    return (
      <div className="allocation-empty">
        <div className="empty-ring" />
        <p>
          A distribuição dos teus ativos
          <br />
          vai aparecer aqui.
        </p>
      </div>
    );
  }

  const slices = openPositions.map((position, index) => ({
    id: position.ticker,
    label: position.ticker,
    percent: ((position.value ?? 0) / (summary.value ?? 1)) * 100,
    color: sliceColors[index % sliceColors.length],
  }));

  return (
    <AllocationDonut
      slices={slices}
      label="Alocação da carteira por valor de mercado"
      centerLabel="Ativos"
      centerValue={String(openPositions.length)}
    />
  );
}
