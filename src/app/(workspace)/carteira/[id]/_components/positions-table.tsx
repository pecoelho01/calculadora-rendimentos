import { useMemo, useState, type KeyboardEvent } from "react";
import {
  calculatePositionPeriodReturns,
  performancePeriods,
  type PerformancePeriod,
  type Position,
  type PositionPeriodReturn,
} from "@/lib/portfolio/portfolio";
import type { Currency, MarketData, Order } from "@/lib/types";
import { Icon } from "@/components/icon";
import { useTableSort } from "@/components/sortable-table/use-table-sort";
import { SortableColumnHeading } from "@/components/sortable-table/sortable-column-heading";
import { usePositionsPeriodPreference } from "@/components/positions-period/use-positions-period-preference";

type Filter = "open" | "closed" | "all";
type Sort = "value" | "return" | "asset";
const filterNames = { open: "Abertas", closed: "Fechadas", all: "Todas" };
const sortNames = {
  value: "Valor atual",
  return: "Rentabilidade",
  asset: "Ativo",
};
const positionFilterIcon = (
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
);

function gainClass(value: number | null) {
  if (value === null || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

function displayedReturn(
  position: Position,
  periodReturns: Map<string, PositionPeriodReturn> | null,
): PositionPeriodReturn {
  if (position.shares === 0) {
    return { gain: position.realized, percent: position.realizedPercent };
  }
  if (periodReturns === null) {
    return { gain: position.unrealized, percent: position.unrealizedPercent };
  }
  return periodReturns.get(position.ticker) ?? { gain: null, percent: null };
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

function money(currency: Currency, value: number | null, signed = false) {
  return value === null
    ? "—"
    : value.toLocaleString("pt-PT", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
        signDisplay: signed ? "exceptZero" : "auto",
      });
}
const percent = (value: number | null) =>
  value === null
    ? "—"
    : `${value.toLocaleString("pt-PT", { maximumFractionDigits: 2, signDisplay: "exceptZero" })}%`;
const quantity = (value: number) =>
  value.toLocaleString("pt-PT", { maximumFractionDigits: 8 });

function PositionDetails({
  position,
  currency,
  quoteStatus,
  fullDate,
}: {
  position: Position;
  currency: Currency;
  quoteStatus: string;
  fullDate?: string;
}) {
  const closed = position.shares === 0;
  return (
    <details
      className="position-details"
      onKeyDown={closeDetailsOnEscape}
    >
      <summary aria-label={`Ver detalhes de ${position.ticker}`}>
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
          <dd>{closed ? "—" : money(currency, position.average)}</dd>
        </div>
        <div className="position-additional-detail">
          <dt>Cotação</dt>
          <dd>
            {money(currency, position.price)}
            <small>{quoteStatus}</small>
          </dd>
        </div>
        <div>
          <dt>Ganho realizado</dt>
          <dd className={gainClass(position.realized)}>
            {money(currency, position.realized, true)}{" "}
            <span>{percent(position.realizedPercent)}</span>
          </dd>
        </div>
        <div>
          <dt>Data da cotação</dt>
          <dd>{fullDate ? `${fullDate} (Lisboa)` : "Indisponível"}</dd>
        </div>
      </dl>
    </details>
  );
}

function validQuoteDate(asOf: string | null | undefined) {
  const date = asOf ? new Date(asOf) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function PositionsToolbar({
  compact,
  period,
  onPeriodChange,
  filter,
  counts,
  onFilterChange,
  sort,
  onSortChange,
  direction,
  onToggleDirection,
}: {
  compact: boolean;
  period: PerformancePeriod;
  onPeriodChange: (period: PerformancePeriod) => void;
  filter: Filter;
  counts: Record<Filter, number>;
  onFilterChange: (filter: Filter) => void;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  direction: "asc" | "desc";
  onToggleDirection: () => void;
}) {
  return (
    <div className="positions-toolbar no-print">
      {!compact ? (
        <div
          className="segments position-period"
          role="group"
          aria-label="Período da rentabilidade"
        >
          {performancePeriods.map((performancePeriod) => (
            <button
              key={performancePeriod}
              type="button"
              aria-pressed={period === performancePeriod}
              onClick={() => onPeriodChange(performancePeriod)}
            >
              {performancePeriod}
            </button>
          ))}
        </div>
      ) : null}
      <details
        className="list-filter-menu"
        onKeyDown={closeDetailsOnEscape}
      >
        <summary aria-label="Filtrar posições">{positionFilterIcon}</summary>
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
                onClick={() => onFilterChange(key)}
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
                onChange={(event) => onSortChange(event.target.value as Sort)}
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
              onClick={onToggleDirection}
              aria-label={`Ordenação ${direction === "asc" ? "ascendente" : "descendente"}. Inverter ordem`}
            >
              <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

function usePositionPeriodReturns({
  orders,
  market,
  currency,
  compact,
}: {
  orders: Order[];
  market: MarketData;
  currency: Currency;
  compact: boolean;
}) {
  const preferredPeriod = usePositionsPeriodPreference();
  const [selectedPeriod, setSelectedPeriod] =
    useState<PerformancePeriod | null>(null);
  // A escolha nos botões vale só para esta vista; sem escolha, segue a
  // preferência das Definições, tal como o gráfico.
  const period = selectedPeriod ?? preferredPeriod;
  const endDate = new Date().toISOString().slice(0, 10);
  const periodReturns = useMemo(
    () =>
      compact || period === "Máximo"
        ? null
        : calculatePositionPeriodReturns({
            orders,
            market,
            currency,
            period,
            end: endDate,
          }),
    [orders, market, currency, compact, period, endDate],
  );

  return { period, setPeriod: setSelectedPeriod, periodReturns };
}

function positionColumnHeadings(filter: Filter, period: PerformancePeriod) {
  const periodSuffix =
    period !== "Máximo" && filter !== "closed" ? ` (${period})` : "";
  const gainHeading =
    filter === "closed"
      ? "Ganho realizado"
      : `${filter === "open" ? "Ganho não realizado" : "Ganho"}${periodSuffix}`;
  const returnHeading = periodSuffix
    ? `Rentabilidade${periodSuffix}`
    : "Rentabilidade";

  return { returnHeading, gainHeading };
}

function PositionsEmptyState({
  message,
  search,
  filter,
  onClearSearch,
  onShowAll,
}: {
  message: string;
  search: string;
  filter: Filter;
  onClearSearch: () => void;
  onShowAll: () => void;
}) {
  return (
    <div className="position-empty no-results">
      <Icon name="positions" />
      <p>{message}</p>
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
          onClick={onShowAll}
        >
          Ver todas as posições
        </button>
      ) : null}
    </div>
  );
}

function PositionGainCell({
  closed,
  gain,
  gainPercent,
  period,
  showRealizedNote,
}: {
  closed: boolean;
  gain: number | null;
  gainPercent: number | null;
  period: PerformancePeriod;
  showRealizedNote: boolean;
}) {
  const mobileLabel = closed
    ? "Rentabilidade realizada"
    : `Rentabilidade${period !== "Máximo" ? ` (${period})` : ""}`;

  return (
    <td
      className={`position-gain ${closed ? "position-gain-realized" : ""} ${gainClass(gain)}`}
    >
      <span className="position-mobile-label">{mobileLabel}</span>
      <strong className="gain-percent">{percent(gainPercent)}</strong>
      {showRealizedNote ? (
        <small className="position-period-note">Realizado</small>
      ) : null}
    </td>
  );
}

function PositionRow({
  position,
  returnValue,
  showRealizedNote,
  period,
  market,
  currency,
  loading,
}: {
  position: Position;
  returnValue: PositionPeriodReturn;
  showRealizedNote: boolean;
  period: PerformancePeriod;
  market: MarketData;
  currency: Currency;
  loading: boolean;
}) {
  const closed = position.shares === 0;
  const gain = returnValue.gain;
  const gainPercent = returnValue.percent;
  const asOf = market[position.ticker]?.asOf;
  const validDate = validQuoteDate(asOf);
  const fullDate = validDate?.toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
  });
  const quoteStatus = positionQuoteStatus(position, loading, validDate);
  const hasWideValues =
    Math.max(
      money(currency, position.value).length,
      money(currency, gain, true).length,
    ) > 18 || quantity(position.shares).length > 12;

  return (
    <tr
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
          {closed ? <span className="position-badge">Fechada</span> : null}
        </div>
      </td>
      <td className="position-holding">
        <span className="position-mobile-label">Unidades</span>
        <strong>{quantity(position.shares)}</strong>
      </td>
      <td className="position-quote">
        <span title={quoteStatus}>{money(currency, position.price)}</span>
        {position.issue ? (
          <small className="quote-issue">{position.issue}</small>
        ) : null}
      </td>
      <td className="position-value">
        <span className="position-mobile-label">Valor atual</span>
        <strong>{money(currency, position.value)}</strong>
        {position.issue && !closed ? (
          <small className="position-mobile-label">{position.issue}</small>
        ) : null}
      </td>
      <PositionGainCell
        closed={closed}
        gain={gain}
        gainPercent={gainPercent}
        period={period}
        showRealizedNote={showRealizedNote}
      />
      <td className={`position-profit ${gainClass(gain)}`}>
        <span className="position-mobile-label">Ganho</span>
        <strong>{money(currency, gain, true)}</strong>
      </td>
      <td className="position-actions">
        <PositionDetails
          position={position}
          currency={currency}
          quoteStatus={quoteStatus}
          fullDate={fullDate}
        />
      </td>
    </tr>
  );
}

export function PositionsTable({
  positions,
  orders,
  market,
  currency,
  loading,
  search,
  onClearSearch,
  compact = false,
}: {
  compact?: boolean;
  positions: Position[];
  orders: Order[];
  market: MarketData;
  currency: Currency;
  loading: boolean;
  search: string;
  onClearSearch: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const { period, setPeriod, periodReturns } = usePositionPeriodReturns({
    orders,
    market,
    currency,
    compact,
  });
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

  function comparePositions(leftPosition: Position, rightPosition: Position) {
    let comparison: number;
    if (sort === "asset") {
      comparison = leftPosition.ticker.localeCompare(
        rightPosition.ticker,
        "pt-PT",
      );
    } else {
      const leftValue =
        sort === "value"
          ? leftPosition.value
          : displayedReturn(leftPosition, periodReturns).percent;
      const rightValue =
        sort === "value"
          ? rightPosition.value
          : displayedReturn(rightPosition, periodReturns).percent;

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
  }
  const visiblePositions = filteredPositions.sort(comparePositions);
  const { returnHeading, gainHeading } = positionColumnHeadings(filter, period);
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
      <PositionsToolbar
        compact={compact}
        period={period}
        onPeriodChange={setPeriod}
        filter={filter}
        counts={counts}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={selectSort}
        direction={direction}
        onToggleDirection={toggleDirection}
      />
      <p
        className="position-context"
        aria-live="polite"
        aria-atomic="true"
      >
        {visiblePositions.length} de {counts[filter]}{" "}
        {counts[filter] === 1 ? "posição" : "posições"} · {filterNames[filter]}
        {search ? ` · Pesquisa: “${search}”` : ""}
        {!compact && period !== "Máximo" ? ` · Rentabilidade: ${period}` : ""}
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
              <SortableColumnHeading
                sortKey="asset"
                label="Ativo"
                sorting={sorting}
                className="position-sort"
              />
              <th scope="col">Unidades</th>
              <th scope="col">Cotação</th>
              <SortableColumnHeading
                sortKey="value"
                label="Valor atual"
                sorting={sorting}
                className="position-sort"
              />
              <SortableColumnHeading
                sortKey="return"
                label={returnHeading}
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
            {visiblePositions.map((position) => (
              <PositionRow
                key={position.ticker}
                position={position}
                returnValue={displayedReturn(position, periodReturns)}
                period={period}
                showRealizedNote={
                  filter === "all" &&
                  period !== "Máximo" &&
                  position.shares === 0
                }
                market={market}
                currency={currency}
                loading={loading}
              />
            ))}
          </tbody>
        </table>
      ) : (
        <PositionsEmptyState
          message={emptyMessage}
          search={search}
          filter={filter}
          onClearSearch={onClearSearch}
          onShowAll={() => setFilter("all")}
        />
      )}
    </div>
  );
}
