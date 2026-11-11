import { useState, type KeyboardEvent } from "react";
import type { OrderGain } from "@/lib/portfolio";
import type { Currency, Order } from "@/lib/types";
import { Icon } from "../shared/icon";
import { useTableSort } from "./use-table-sort";
import { SortableHeading } from "./sortable-heading";

type Filter = "all" | "buy" | "sell";
type Sort = "date" | "asset" | "total";
const filterNames = { all: "Todas", buy: "Compras", sell: "Vendas" };
const sortNames = { date: "Data", asset: "Ativo", total: "Total" };
const monthFormat = new Intl.DateTimeFormat("pt-PT", {
  month: "short",
  timeZone: "UTC",
});
const quantity = (value: number) =>
  value.toLocaleString("pt-PT", { maximumFractionDigits: 8 });

function closeDetailsOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape") return;

  event.preventDefault();
  event.currentTarget.open = false;
  event.currentTarget.querySelector("summary")?.focus();
}

export function TransactionsTable({
  orders,
  orderGains,
  currency,
  search,
  onClearSearch,
  onDelete,
  compact = false,
}: {
  compact?: boolean;
  orders: Order[];
  orderGains: Map<string, OrderGain>;
  currency: Currency;
  search: string;
  onClearSearch: () => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const sorting = useTableSort<Sort>("date", {
    date: "desc",
    asset: "asc",
    total: "desc",
  });
  const { sort, direction, selectSort, toggleDirection } = sorting;
  const counts = {
    all: orders.length,
    buy: orders.filter((order) => order.type === "buy").length,
    sell: orders.filter((order) => order.type === "sell").length,
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
  const normalizedSearch = search.toLowerCase();
  const orderRows = orders.map((order, registrationIndex) => ({
    order,
    registrationIndex,
    total: order.pricebuy * order.shares,
  }));
  const filteredOrders = orderRows.filter(({ order }) => {
    const matchesType = filter === "all" || order.type === filter;
    const matchesSearch = `${order.ticker} ${order.name}`
      .toLowerCase()
      .includes(normalizedSearch);

    return matchesType && matchesSearch;
  });
  const visibleOrders = filteredOrders.sort((left, right) => {
    let comparison: number;
    if (sort === "date") {
      comparison = left.order.date.localeCompare(right.order.date);
    } else if (sort === "asset") {
      comparison = left.order.ticker.localeCompare(right.order.ticker, "pt-PT");
    } else {
      comparison = left.total - right.total;
    }

    // Sorting changes presentation only. Same-day ties retain registration order.
    const directedComparison = direction === "asc" ? comparison : -comparison;
    const newestFirst = right.order.date.localeCompare(left.order.date);
    return (
      directedComparison ||
      newestFirst ||
      left.registrationIndex - right.registrationIndex
    );
  });
  const emptyFilterMessage =
    filter === "buy"
      ? "Não tens compras registadas."
      : "Não tens vendas registadas.";
  const emptyMessage = search
    ? "Nenhuma transação corresponde à pesquisa."
    : emptyFilterMessage;

  return (
    <div
      className={`transactions-view fidelity-transactions ${compact ? "list-compact" : ""}`}
    >
      <div className="transactions-toolbar no-print">
        <div
          className="transaction-filters"
          role="group"
          aria-label="Tipo de transação"
        >
          {(["all", "buy", "sell"] as const).map((key) => (
            <button
              key={key}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {filterNames[key]} <span>{counts[key]}</span>
            </button>
          ))}
        </div>
        <details
          className="list-filter-menu"
          onKeyDown={closeDetailsOnEscape}
        >
          <summary aria-label="Filtrar transações">
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
            <div className="transaction-order">
              <label>
                <span>Ordenar por</span>
                <select
                  aria-label="Ordenar transações por"
                  value={sort}
                  onChange={(event) => selectSort(event.target.value as Sort)}
                >
                  {(["date", "asset", "total"] as const).map((key) => (
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
                className="transaction-direction"
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
        className="transaction-context"
        aria-live="polite"
        aria-atomic="true"
      >
        {visibleOrders.length} de {counts[filter]}{" "}
        {counts[filter] === 1 ? "transação" : "transações"} ·{" "}
        {filterNames[filter]}
        {search ? ` · Pesquisa: “${search}”` : ""}
        <span className="transaction-print-order">
          {" "}
          · {sortNames[sort]} ·{" "}
          {direction === "asc" ? "Ascendente" : "Descendente"}
        </span>
      </p>
      {visibleOrders.length ? (
        <table
          className="transactions-table"
          aria-label="Transações da carteira"
        >
          <thead>
            <tr>
              <SortableHeading
                sortKey="date"
                label="Data"
                sorting={sorting}
                className="transaction-sort"
              />
              <SortableHeading
                sortKey="asset"
                label="Ativo"
                sorting={sorting}
                className="transaction-sort"
              />
              <th scope="col">Operação</th>
              <th scope="col">Unidades</th>
              <th scope="col">Preço/un.</th>
              <SortableHeading
                sortKey="total"
                label="Total"
                sorting={sorting}
                className="transaction-sort"
              />
              <th scope="col">Resultado</th>
              <th scope="col">
                <span className="visually-hidden">Detalhes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map(({ order, total }) => {
              const result = orderGains.get(order.id)!;
              const formattedTotal = money(total);
              const formattedGain = money(result.gain, true);
              let gainClass = "";
              if (result.gain !== null && result.gain !== 0) {
                gainClass = result.gain > 0 ? "positive" : "negative";
              }
              const remaining =
                result.shares === 0
                  ? "Lote fechado"
                  : `${quantity(result.shares)} em carteira`;
              const date = new Date(`${order.date}T00:00:00Z`);
              const formattedDate = `${date.getUTCDate()} ${monthFormat.format(date)} ${date.getUTCFullYear()}`;
              return (
                <tr
                  key={order.id}
                  className={
                    formattedTotal.length > 14
                      ? "transaction-wide-total"
                      : undefined
                  }
                >
                  <td className="transaction-date">
                    <time dateTime={order.date}>{formattedDate}</time>
                  </td>
                  <td className="transaction-asset">
                    <div className="transaction-identity">
                      <span
                        className="asset-monogram"
                        aria-hidden="true"
                      >
                        {order.ticker.charAt(0)}
                      </span>
                      <div>
                        <strong>{order.ticker}</strong>
                        <small className="transaction-name">{order.name}</small>
                        <small className="transaction-mobile-description">
                          {quantity(order.shares)} un. × {money(order.pricebuy)}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className="transaction-operation">
                    <span className={`order-badge ${order.type}`}>
                      {order.type === "buy" ? "Compra" : "Venda"}
                    </span>
                  </td>
                  <td className="transaction-units">
                    <span>{quantity(order.shares)}</span>
                  </td>
                  <td className="transaction-price">{money(order.pricebuy)}</td>
                  <td className="transaction-total">
                    <span className="transaction-mobile-label">Total</span>
                    <strong
                      className={
                        formattedTotal.length > 24
                          ? "transaction-long-amount"
                          : undefined
                      }
                    >
                      {formattedTotal}
                    </strong>
                  </td>
                  <td className="transaction-gain">
                    <span className="transaction-mobile-label">Ganho</span>
                    <span className={gainClass}>
                      <strong
                        className={
                          formattedGain.length > 24
                            ? "transaction-long-amount"
                            : undefined
                        }
                      >
                        {formattedGain}
                      </strong>
                      <span className="gain-percent">
                        {percent(result.percent)}
                      </span>
                    </span>
                    <small className="transaction-result-kind">
                      {order.type === "sell"
                        ? "Realizado"
                        : `Total da compra · ${remaining}`}
                    </small>
                  </td>
                  <td className="transaction-actions">
                    {" "}
                    <details
                      className="transaction-details"
                      onKeyDown={closeDetailsOnEscape}
                    >
                      <summary
                        aria-label={`Ver detalhes de ${order.ticker} de ${order.date}`}
                      >
                        <span
                          className="list-more"
                          aria-hidden="true"
                        >
                          ···
                        </span>
                        <Icon name="chevron" />
                      </summary>
                      <div className="list-detail-panel">
                        <dl className="transaction-mobile-detail">
                          <div>
                            <dt>Quantidade</dt>
                            <dd>
                              {quantity(order.shares)}{" "}
                              {order.shares === 1 ? "unidade" : "unidades"}
                            </dd>
                          </div>
                          <div>
                            <dt>Preço por unidade</dt>
                            <dd>{money(order.pricebuy)}</dd>
                          </div>
                        </dl>
                        <p className="transaction-detail-result">
                          <strong>{formattedGain}</strong> ·{" "}
                          {percent(result.percent)}
                          <br />
                          {order.type === "sell"
                            ? "Ganho realizado"
                            : `Ganho total da compra · ${remaining}`}
                        </p>
                        <p className="transaction-explanation">
                          {order.type === "buy"
                            ? "Ganho total do lote: inclui o ganho realizado e o não realizado, em percentagem do custo original da compra."
                            : "Ganho realizado nesta venda, em percentagem do custo das unidades vendidas."}
                        </p>
                        <button
                          className="delete-button no-print"
                          aria-label={`Remover ${order.ticker} de ${order.date}`}
                          onClick={() => onDelete(order.id)}
                        >
                          Remover transação
                        </button>
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="transaction-empty no-results">
          <Icon name="transactions" />
          <p>{emptyMessage}</p>
          {search ? (
            <button
              className="text-button"
              onClick={onClearSearch}
            >
              Limpar pesquisa
            </button>
          ) : (
            <button
              className="text-button"
              onClick={() => setFilter("all")}
            >
              Ver todas as transações
            </button>
          )}
        </div>
      )}
    </div>
  );
}
