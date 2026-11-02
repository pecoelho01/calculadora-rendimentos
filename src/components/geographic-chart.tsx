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
      className="panel allocation geographic-allocation"
      aria-labelledby="geographic-title"
    >
      <div className="panel-heading">
        <h2 id="geographic-title">Distribuição por continente</h2>
      </div>
      {!loading && data && data.total > 0 ? (
        <>
          <div
            className="donut geography-donut"
            role="img"
            aria-label="Distribuição por continente ponderada pelo valor de mercado; percentagens na legenda"
          >
            <svg viewBox="0 0 160 160" aria-hidden="true">
              {allocations.map((a, i) => (
                <circle
                  key={a.continent}
                  cx="80"
                  cy="80"
                  r="71"
                  fill="none"
                  stroke={colors[a.continent]}
                  strokeWidth="18"
                  pathLength="100"
                  strokeDasharray={`${a.percent} ${100 - a.percent}`}
                  strokeDashoffset={
                    -allocations
                      .slice(0, i)
                      .reduce((n, item) => n + item.percent, 0)
                  }
                  transform="rotate(-90 80 80)"
                />
              ))}
            </svg>
            <div>
              <small>Cobertura</small>
              <strong>{percent(data.coverage)}</strong>
            </div>
          </div>
          <div className="allocation-list">
            {allocations.map((a) => (
              <div key={a.continent}>
                <span>
                  <i
                    className="dot"
                    style={{ background: colors[a.continent] }}
                  />
                  {CONTINENT_LABELS[a.continent]}
                </span>
                <strong>{percent(a.percent)}</strong>
              </div>
            ))}
          </div>
          <div className="geography-note">
            <p>
              Exposição dos ETFs por continente, ponderada pelo valor atual das
              posições. Parcelas sem continente identificado ficam sem
              classificação.
            </p>
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
