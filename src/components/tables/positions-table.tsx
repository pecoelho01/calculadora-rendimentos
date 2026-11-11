import { useState, type KeyboardEvent } from "react";
import type { Position } from "@/lib/portfolio";
import type { Currency, MarketData } from "@/lib/types";
import { Icon } from "../shared/icon";
import { useTableSort } from "./use-table-sort";
import { SortableHeading } from "./sortable-heading";

type Filter = "open" | "closed" | "all";
type Sort = "value" | "return" | "asset";
const filterNames = { open: "Abertas", closed: "Fechadas", all: "Todas" };
const sortNames = {
  value: "Valor atual",
  return: "Rentabilidade",
  asset: "Ativo",
};

function gainClass(value: number | null) {
  if (value === null || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

function positionReturn(position: Position) {
  return position.shares === 0
    ? position.realizedPercent
    : position.unrealizedPercent;
}

function positionQuoteStatus(
  position: Position,
  loading: boolean,
  quoteDate: Date | null,
) {
  if (loading) return "A atualizar…";
  if (position.issue !== null && position.issue !== undefined)
    return position.issue;
  if (position.price === null) return "Sem cotação";
  if (!quoteDate) return "Data indisponível";

  const time = quoteDate.toLocaleTimeString("pt-PT", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Atualizado às ${time}`;
}

function closeDetailsOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape") return;

  event.preventDefault();
  event.currentTarget.open = false;
  event.currentTarget.querySelector("summary")?.focus();
}

export function PositionsTable({
  positions,
  market,
  currency,
  loading,
  search,
  onClearSearch,
  compact = false,
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
  const sorting = useTableSort<Sort>("value", {
    value: "desc",
    return: "desc",
    asset: "asc",
  });
  const { sort, direction, selectSort, toggleDirection } = sorting;
  const counts = {
    open: positions.filter((position) => position.shares > 0).length,
    closed: positions.filter((position) => position.shares === 0).length,
    all: positions.length,
  };
  const money = (value: number | null, signed = false) =>
    value === null
      ? "—"
      : value.toLocaleString("pt-PT", {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
          signDisplay: signed ? "exceptZero" : "auto",
        });
  const percent = (value: number | null) =>
    value === null
      ? "—"
      : `${value.toLocaleString("pt-PT", { maximumFractionDigits: 2, signDisplay: "exceptZero" })}%`;
  const quantity = (value: number) =>
    value.toLocaleString("pt-PT", { maximumFractionDigits: 8 });
  const normalizedSearch = search.toLowerCase();
  const filteredPositions = positions.filter((position) => {
    const matchesState =
      filter === "all" ||
      (filter === "open" ? position.shares > 0 : position.shares === 0);
    const matchesSearch = `${position.ticker} ${position.name}`
      .toLowerCase()
      .includes(normalizedSearch);

    return matchesState && matchesSearch;
  });
  const visiblePositions = filteredPositions.sort(
    (leftPosition, rightPosition) => {
      let comparison: number;
      if (sort === "asset") {
        comparison = leftPosition.ticker.localeCompare(
          rightPosition.ticker,
          "pt-PT",
        );
      } else {
        const leftValue =
          sort === "value" ? leftPosition.value : positionReturn(leftPosition);
        const rightValue =
          sort === "value"
            ? rightPosition.value
            : positionReturn(rightPosition);

        // Missing observations always follow known values, including a valid zero.
        if (leftValue === null) {
          return rightValue === null
            ? leftPosition.ticker.localeCompare(rightPosition.ticker)
            : 1;
        }
        if (rightValue === null) return -1;

        comparison = leftValue - rightValue;
      }

      const directedComparison = direction === "asc" ? comparison : -comparison;
      return (
        directedComparison ||
        leftPosition.ticker.localeCompare(rightPosition.ticker)
      );
    },
  );
  const gainHeading = {
    closed: "Ganho realizado",
    all: "Ganho",
    open: "Ganho não realizado",
  }[filter];
  const emptyMessage = search
    ? "Nenhuma posição corresponde à pesquisa."
    : {
        open: "Não tens posições abertas.",
        closed: "Não tens posições fechadas.",
        all: "Não existem posições para mostrar.",
      }[filter];

  return (
    <div
      className={`positions-view fidelity-positions ${compact ? "list-compact" : ""}`}
    >
      <div className="positions-toolbar no-print">
        <details
          className="list-filter-menu"
          onKeyDown={closeDetailsOnEscape}
        >
          <summary aria-label="Filtrar posições">
            <svg
              className="icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M4 5h16l-6 7v7l-4-2v-5z" />
            </svg>
          </summary>
          <div className="list-filter-content">
            <div
              className="position-filters"
              role="group"
              aria-label="Estado das posições"
            >
              {(["open", "closed", "all"] as const).map((key) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {filterNames[key]} <span>{counts[key]}</span>
                </button>
              ))}
            </div>
            <div className="position-order">
              <label>
                <span>Ordenar por</span>
                <select
                  aria-label="Ordenar posições por"
                  value={sort}
                  onChange={(event) => selectSort(event.target.value as Sort)}
                >
                  {(["value", "return", "asset"] as const).map((key) => (
                    <option
                      key={key}
                      value={key}
                    >
                      {sortNames[key]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="position-direction"
                onClick={toggleDirection}
                aria-label={`Ordenação ${direction === "asc" ? "ascendente" : "descendente"}. Inverter ordem`}
              >
                <span aria-hidden="true">
                  {direction === "asc" ? "↑" : "↓"}
                </span>
              </button>
            </div>
          </div>
        </details>
      </div>
      <p
        className="position-context"
        aria-live="polite"
        aria-atomic="true"
      >
        {visiblePositions.length} de {counts[filter]}{" "}
        {counts[filter] === 1 ? "posição" : "posições"} · {filterNames[filter]}
        {search ? ` · Pesquisa: “${search}”` : ""}
        <span className="position-print-order">
          {" "}
          · {sortNames[sort]} ·{" "}
          {direction === "asc" ? "Ascendente" : "Descendente"}
        </span>
      </p>
      {visiblePositions.length ? (
        <table
          className="positions-table"
          aria-label="Posições da carteira"
        >
          <thead>
            <tr>
              <SortableHeading
                sortKey="asset"
                label="Ativo"
                sorting={sorting}
                className="position-sort"
              />
              <th scope="col">Unidades</th>
              <th scope="col">Cotação</th>
              <SortableHeading
                sortKey="value"
                label="Valor atual"
                sorting={sorting}
                className="position-sort"
              />
              <SortableHeading
                sortKey="return"
                label="Rentabilidade"
                sorting={sorting}
                className="position-sort"
              />
              <th scope="col">{gainHeading}</th>
              <th scope="col">
                <span className="visually-hidden">Detalhes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiblePositions.map((position) => {
              const closed = position.shares === 0;
              const gain = closed ? position.realized : position.unrealized;
              const gainPercent = positionReturn(position);
              const asOf = market[position.ticker]?.asOf;
              const date = asOf ? new Date(asOf) : null;
              const validDate =
                date && Number.isFinite(date.getTime()) ? date : null;
              const fullDate = validDate?.toLocaleString("pt-PT", {
                timeZone: "Europe/Lisbon",
              });
              const quoteStatus = positionQuoteStatus(
                position,
                loading,
                validDate,
              );
              const hasWideValues =
                Math.max(
                  money(position.value).length,
                  money(gain, true).length,
                ) > 18 || quantity(position.shares).length > 12;

              return (
                <tr
                  key={position.ticker}
                  className={`${closed ? "position-closed" : ""} ${hasWideValues ? "position-wide-values" : ""}`}
                >
                  <td className="position-asset">
                    <div className="asset-cell">
                      <span
                        className="asset-monogram"
                        aria-hidden="true"
                      >
                        {position.ticker.charAt(0)}
                      </span>
                      <div className="position-identity">
                        <a
                          href={`https://finance.yahoo.com/quote/${encodeURIComponent(position.ticker)}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${position.ticker} no Yahoo Finance (abre num novo separador)`}
                        >
                          {position.ticker} <Icon name="external" />
                        </a>
                        <small>{position.name}</small>
                        <small className="position-mobile-units">
                          {quantity(position.shares)}{" "}
                          {position.shares === 1 ? "unidade" : "unidades"}
                        </small>
                      </div>
                      {closed ? (
                        <span className="position-badge">Fechada</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="position-holding">
                    <span className="position-mobile-label">Unidades</span>
                    <strong>{quantity(position.shares)}</strong>
                  </td>
                  <td className="position-quote">
                    <span title={quoteStatus}>{money(position.price)}</span>
                    {position.issue ? (
                      <small className="quote-issue">{position.issue}</small>
                    ) : null}
                  </td>
                  <td className="position-value">
                    <span className="position-mobile-label">Valor atual</span>
                    <strong>{money(position.value)}</strong>
                    {position.issue && !closed ? (
                      <small className="position-mobile-label">
                        {position.issue}
                      </small>
                    ) : null}
                  </td>
                  <td className={`position-gain ${gainClass(gain)}`}>
                    <span className="position-mobile-label">
                      {closed ? "Rentabilidade realizada" : "Rentabilidade"}
                    </span>
                    <strong className="gain-percent">
                      {percent(gainPercent)}
                    </strong>
                  </td>
                  <td className={`position-profit ${gainClass(gain)}`}>
                    <span className="position-mobile-label">Ganho</span>
                    <strong>{money(gain, true)}</strong>
                  </td>
                  <td className="position-actions">
                    {" "}
                    <details
                      className="position-details"
                      onKeyDown={closeDetailsOnEscape}
                    >
                      <summary
                        aria-label={`Ver detalhes de ${position.ticker}`}
                      >
                        <span
                          className="list-more"
                          aria-hidden="true"
                        >
                          ···
                        </span>
                        <Icon name="chevron" />
                      </summary>
                      <dl className="list-detail-panel">
                        <div className="position-additional-detail">
                          <dt>Quantidade</dt>
                          <dd>
                            {quantity(position.shares)}{" "}
                            {position.shares === 1 ? "unidade" : "unidades"}
                          </dd>
                        </div>
                        <div className="position-additional-detail">
                          <dt>Custo médio FIFO</dt>
                          <dd>{closed ? "—" : money(position.average)}</dd>
                        </div>
                        <div className="position-additional-detail">
                          <dt>Cotação</dt>
                          <dd>
                            {money(position.price)}
                            <small>{quoteStatus}</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Ganho realizado</dt>
                          <dd className={gainClass(position.realized)}>
                            {money(position.realized, true)}{" "}
                            <span>{percent(position.realizedPercent)}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Data da cotação</dt>
                          <dd>
                            {fullDate ? `${fullDate} (Lisboa)` : "Indisponível"}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="position-empty no-results">
          <Icon name="positions" />
          <p>{emptyMessage}</p>
          {search ? (
            <button
              className="text-button"
              onClick={onClearSearch}
            >
              Limpar pesquisa
            </button>
          ) : filter !== "all" ? (
            <button
              className="text-button"
              onClick={() => setFilter("all")}
            >
              Ver todas as posições
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
