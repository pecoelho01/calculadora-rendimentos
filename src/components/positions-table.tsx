import { useState } from "react";
import type { Position } from "@/lib/portfolio";
import type { Currency, MarketData } from "@/lib/types";
import { Icon } from "./icon";

type Filter = "open" | "closed" | "all";
type Sort = "value" | "return" | "asset";
const filterNames = { open: "Abertas", closed: "Fechadas", all: "Todas" };
const sortNames = { value: "Valor atual", return: "Rentabilidade", asset: "Ativo" };

function gainClass(value: number | null) {
  return value === null || value === 0 ? "" : value > 0 ? "positive" : "negative";
}

export function PositionsTable({
  positions, market, currency, loading, search, onClearSearch, compact = false,
}: {
  compact?: boolean;
  positions: Position[];
  market: MarketData;
  currency: Currency;
  loading: boolean;
  search: string;
  onClearSearch: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const [sort, setSort] = useState<Sort>("value");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const counts = {
    open: positions.filter((p) => p.shares > 0).length,
    closed: positions.filter((p) => p.shares === 0).length,
    all: positions.length,
  };
  const money = (value: number | null, signed = false) => value === null ? "—" :
    value.toLocaleString("pt-PT", {
      style: "currency", currency, maximumFractionDigits: 2,
      signDisplay: signed ? "exceptZero" : "auto",
    });
  const percent = (value: number | null) => value === null ? "—" :
    `${value.toLocaleString("pt-PT", { maximumFractionDigits: 2, signDisplay: "exceptZero" })}%`;
  const quantity = (value: number) => value.toLocaleString("pt-PT", { maximumFractionDigits: 8 });
  const resultPercent = (p: Position) => p.shares === 0 ? p.realizedPercent : p.unrealizedPercent;
  const visible = positions.filter((p) =>
    (filter === "all" || (filter === "open" ? p.shares > 0 : p.shares === 0)) &&
    `${p.ticker} ${p.name}`.toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => {
    let comparison: number;
    if (sort === "asset") comparison = a.ticker.localeCompare(b.ticker, "pt-PT");
    else {
      const left = sort === "value" ? a.value : resultPercent(a);
      const right = sort === "value" ? b.value : resultPercent(b);
      // Missing observations always follow known values, including a valid zero.
      if (left === null) return right === null ? a.ticker.localeCompare(b.ticker) : 1;
      if (right === null) return -1;
      comparison = left - right;
    }
    return (direction === "asc" ? comparison : -comparison) || a.ticker.localeCompare(b.ticker);
  });
  function changeSort(next: Sort) {
    if (sort === next) setDirection(direction === "asc" ? "desc" : "asc");
    else {
      setSort(next);
      setDirection(next === "asset" ? "asc" : "desc");
    }
  }
  function sortHeading(key: Sort, label: string) {
    return (
      <th scope="col" aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"}>
        <button className="position-sort" onClick={() => changeSort(key)}>
          {label} <span aria-hidden="true">{sort === key ? direction === "asc" ? "↑" : "↓" : "↕"}</span>
        </button>
      </th>
    );
  }
  return (
    <div className={`positions-view fidelity-positions ${compact ? "list-compact" : ""}`}>
      <div className="positions-toolbar no-print">
        <details className="list-filter-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label="Filtrar posições"><svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 5h16l-6 7v7l-4-2v-5z" /></svg></summary><div className="list-filter-content">
        <div className="position-filters" role="group" aria-label="Estado das posições">
          {(["open", "closed", "all"] as const).map((key) => (
            <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {filterNames[key]} <span>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="position-order">
          <label>
            <span>Ordenar por</span>
            <select aria-label="Ordenar posições por" value={sort} onChange={(event) => {
              const next = event.target.value as Sort;
              setSort(next);
              setDirection(next === "asset" ? "asc" : "desc");
            }}>
              {(["value", "return", "asset"] as const).map((key) => <option key={key} value={key}>{sortNames[key]}</option>)}
            </select>
          </label>
          <button className="position-direction" onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
            aria-label={`Ordenação ${direction === "asc" ? "ascendente" : "descendente"}. Inverter ordem`}>
            <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
          </button>
        </div>
        </div></details>
      </div>
      <p className="position-context" aria-live="polite" aria-atomic="true">
        {visible.length} de {counts[filter]} {counts[filter] === 1 ? "posição" : "posições"} · {filterNames[filter]}
        {search ? ` · Pesquisa: “${search}”` : ""}
        <span className="position-print-order"> · {sortNames[sort]} · {direction === "asc" ? "Ascendente" : "Descendente"}</span>
      </p>
      {visible.length ? (
        <table className="positions-table" aria-label="Posições da carteira">
          <thead><tr>
            {sortHeading("asset", "Ativo")}
            <th scope="col">Unidades</th>
            <th scope="col">Cotação</th>
            {sortHeading("value", "Valor atual")}
            {sortHeading("return", "Rentabilidade")}
            <th scope="col">{filter === "closed" ? "Ganho realizado" : filter === "all" ? "Ganho" : "Ganho não realizado"}</th>
            <th scope="col"><span className="visually-hidden">Detalhes</span></th>
          </tr></thead>
          <tbody>{visible.map((p) => {
            const closed = p.shares === 0;
            const gain = closed ? p.realized : p.unrealized;
            const gainPercent = resultPercent(p);
            const asOf = market[p.ticker]?.asOf;
            const date = asOf ? new Date(asOf) : null;
            const validDate = date && Number.isFinite(date.getTime()) ? date : null;
            const fullDate = validDate?.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
            const quoteStatus = loading ? "A atualizar…" : p.issue ?? (p.price === null ? "Sem cotação" : validDate ?
              `Atualizado às ${validDate.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" })}` : "Data indisponível");
            return (
              <tr key={p.ticker} className={`${closed ? "position-closed" : ""} ${Math.max(money(p.value).length, money(gain, true).length) > 18 || quantity(p.shares).length > 12 ? "position-wide-values" : ""}`}>
                <td className="position-asset">
                  <div className="asset-cell">
                    <span className="asset-monogram" aria-hidden="true">{p.ticker.charAt(0)}</span>
                    <div className="position-identity">
                      <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(p.ticker)}`} target="_blank" rel="noreferrer"
                        aria-label={`${p.ticker} no Yahoo Finance (abre num novo separador)`}>
                        {p.ticker} <Icon name="external" />
                      </a>
                      <small>{p.name}</small>
                      <small className="position-mobile-units">{quantity(p.shares)} {p.shares === 1 ? "unidade" : "unidades"}</small>
                    </div>
                    {closed ? <span className="position-badge">Fechada</span> : null}
                  </div>

                </td>
                <td className="position-holding"><span className="position-mobile-label">Unidades</span><strong>{quantity(p.shares)}</strong></td>
                <td className="position-quote"><span title={quoteStatus}>{money(p.price)}</span>{p.issue ? <small className="quote-issue">{p.issue}</small> : null}</td>
                <td className="position-value"><span className="position-mobile-label">Valor atual</span><strong>{money(p.value)}</strong>
                  {p.issue && !closed ? <small className="position-mobile-label">{p.issue}</small> : null}
                </td>
                <td className={`position-gain ${gainClass(gain)}`}>
                  <span className="position-mobile-label">{closed ? "Rentabilidade realizada" : "Rentabilidade"}</span>
                  <strong className="gain-percent">{percent(gainPercent)}</strong>
                </td>
                <td className={`position-profit ${gainClass(gain)}`}><span className="position-mobile-label">Ganho</span><strong>{money(gain, true)}</strong></td>
                <td className="position-actions">                  <details className="position-details" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
                    <summary aria-label={`Ver detalhes de ${p.ticker}`}><span className="list-more" aria-hidden="true">···</span><Icon name="chevron" /></summary>
                    <dl className="list-detail-panel">
                      <div className="position-additional-detail"><dt>Quantidade</dt><dd>{quantity(p.shares)} {p.shares === 1 ? "unidade" : "unidades"}</dd></div>
                      <div className="position-additional-detail"><dt>Custo médio FIFO</dt><dd>{closed ? "—" : money(p.average)}</dd></div>
                      <div className="position-additional-detail"><dt>Cotação</dt><dd>{money(p.price)}<small>{quoteStatus}</small></dd></div>
                      <div><dt>Ganho realizado</dt><dd className={gainClass(p.realized)}>{money(p.realized, true)} <span>{percent(p.realizedPercent)}</span></dd></div>
                      <div><dt>Data da cotação</dt><dd>{fullDate ? `${fullDate} (Lisboa)` : "Indisponível"}</dd></div>
                    </dl>
                  </details></td>
              </tr>
            );
          })}</tbody>
        </table>
      ) : (
        <div className="position-empty no-results">
          <Icon name="positions" />
          <p>{search ? "Nenhuma posição corresponde à pesquisa." : filter === "open" ? "Não tens posições abertas." : filter === "closed" ? "Não tens posições fechadas." : "Não existem posições para mostrar."}</p>
          {search ? <button className="text-button" onClick={onClearSearch}>Limpar pesquisa</button> : filter !== "all" ?
            <button className="text-button" onClick={() => setFilter("all")}>Ver todas as posições</button> : null}
        </div>
      )}
    </div>
  );
}
