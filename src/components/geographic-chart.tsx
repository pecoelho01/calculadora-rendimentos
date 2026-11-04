import { AllocationDonut } from "./allocation-donut";
import { CONTINENT_LABELS, type Continent } from "@/lib/continents";
import type { MarketData } from "@/lib/types";
import { geographicAllocation, type Position } from "@/lib/portfolio";

const colors: Record<Continent, string> = {
  NA: "#4d8dff",
  AS: "#8b6cef",
  EU: "#2bb9a0",
  AF: "#efad44",
  SA: "#e5759a",
  OC: "#63b5d6",
  AN: "#a5b65e",
  UNKNOWN: "#8793a5",
};
const percent = (value: number) =>
  `${value.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;

export function GeographicChart({
  positions,
  market,
  loading,
}: {
  positions: Position[];
  market: MarketData;
  loading: boolean;
}) {
  const data = geographicAllocation(positions, market);
  const allocations = data?.allocations ?? [];
  return (
    <section
      className="allocation geographic-allocation"
      aria-labelledby="geographic-title"
    >
      <div className="panel-heading">
        <h2 id="geographic-title">Distribuição por continente</h2>
      </div>
      {!loading && data && data.total > 0 ? (
        <>
          <AllocationDonut
            slices={allocations.map((allocation) => ({
              id: allocation.continent,
              label: CONTINENT_LABELS[allocation.continent],
              percent: allocation.percent,
              color: colors[allocation.continent],
            }))}
            label="Distribuição por continente ponderada pelo valor de mercado; percentagens na legenda"
            centerLabel="Cobertura"
            centerValue={percent(data.coverage)}
          />
          <div className="geography-note">
            {data.sources.length > 0 ? (
              <div className="geography-sources">
                <p>Fonte e datas da composição</p>
                <ul>
                  {data.sources.map((s) => (
                    <li key={s.ticker}>
                      <a
                        href={s.source}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {s.ticker} · {s.sourceName ?? "justETF"}
                      </a>{" "}
                      · {s.asOf.split("-").reverse().join("/")}
                      {s.method === "holdings" && s.holdingsCount
                        ? ` · ${s.holdingsCount} posições no ficheiro da gestora`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>Composição geográfica indisponível para estes ativos.</p>
            )}
          </div>
        </>
      ) : (
        <div className="allocation-empty">
          <div className="empty-ring" />
          <p>
            {loading
              ? "A obter a distribuição por continente…"
              : data === null
                ? "São necessárias cotações na moeda da carteira para calcular a distribuição."
                : "A distribuição por continente vai aparecer aqui quando existirem posições com valor de mercado."}
          </p>
        </div>
      )}
    </section>
  );
}
