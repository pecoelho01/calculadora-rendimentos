import { useState } from "react";
import type { OrderGain } from "@/lib/portfolio";
import type { Currency, Order } from "@/lib/types";
import { Icon } from "./icon";

type Filter = "all" | "buy" | "sell";
type Sort = "date" | "asset" | "total";
const filterNames = { all: "Todas", buy: "Compras", sell: "Vendas" };
const sortNames = { date: "Data", asset: "Ativo", total: "Total" };
const monthFormat = new Intl.DateTimeFormat("pt-PT", { month: "short", timeZone: "UTC" });
const quantity = (value: number) => value.toLocaleString("pt-PT", { maximumFractionDigits: 8 });

export function TransactionsTable({
  orders, orderGains, currency, search, onClearSearch, onDelete,
}: {
  orders: Order[];
  orderGains: Map<string, OrderGain>;
  currency: Currency;
  search: string;
  onClearSearch: () => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("date");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const counts = {
    all: orders.length,
    buy: orders.filter((order) => order.type === "buy").length,
    sell: orders.filter((order) => order.type === "sell").length,
  };
  const money = (value: number | null, signed = false) => value === null ? "—" :
    value.toLocaleString("pt-PT", {
      style: "currency", currency, maximumFractionDigits: 2,
      signDisplay: signed ? "exceptZero" : "auto",
    });
  const percent = (value: number | null) => value === null ? "—" :
    `${value.toLocaleString("pt-PT", { maximumFractionDigits: 2, signDisplay: "exceptZero" })}%`;
  const visible = orders.map((order, index) => ({ order, index, total: order.pricebuy * order.shares })).filter(({ order }) =>
    (filter === "all" || order.type === filter) &&
    `${order.ticker} ${order.name}`.toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => {
    const comparison = sort === "date" ? a.order.date.localeCompare(b.order.date) :
      sort === "asset" ? a.order.ticker.localeCompare(b.order.ticker, "pt-PT") :
      a.total - b.total;
    // Sorting changes presentation only. Same-day ties retain registration order.
    return (direction === "asc" ? comparison : -comparison) ||
      b.order.date.localeCompare(a.order.date) || a.index - b.index;
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
        <button className="transaction-sort" onClick={() => changeSort(key)}>
          {label} <span aria-hidden="true">{sort === key ? direction === "asc" ? "↑" : "↓" : "↕"}</span>
        </button>
      </th>
    );
  }
  return (
    <div className="transactions-view">
      <div className="transactions-toolbar no-print">
        <div className="transaction-filters" role="group" aria-label="Tipo de transação">
          {(["all", "buy", "sell"] as const).map((key) => (
            <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {filterNames[key]} <span>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="transaction-order">
          <label><span>Ordenar por</span>
            <select aria-label="Ordenar transações por" value={sort} onChange={(event) => {
              const next = event.target.value as Sort;
              setSort(next);
              setDirection(next === "asset" ? "asc" : "desc");
            }}>
              {(["date", "asset", "total"] as const).map((key) => <option key={key} value={key}>{sortNames[key]}</option>)}
            </select>
          </label>
          <button className="transaction-direction" onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
            aria-label={`Ordenação ${direction === "asc" ? "ascendente" : "descendente"}. Inverter ordem`}>
            <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
          </button>
        </div>
      </div>
      <p className="transaction-context" aria-live="polite" aria-atomic="true">
        {visible.length} de {counts[filter]} {counts[filter] === 1 ? "transação" : "transações"} · {filterNames[filter]}
        {search ? ` · Pesquisa: “${search}”` : ""}
        <span className="transaction-print-order"> · {sortNames[sort]} · {direction === "asc" ? "Ascendente" : "Descendente"}</span>
      </p>
      {visible.length ? (
        <table className="transactions-table" aria-label="Transações da carteira">
          <thead><tr>
            {sortHeading("date", "Data")}
            {sortHeading("asset", "Ativo")}
            <th scope="col">Operação</th>
            <th scope="col">Transação</th>
            {sortHeading("total", "Total")}
            <th scope="col">Ganho</th>
          </tr></thead>
          <tbody>{visible.map(({ order, total }) => {
            const result = orderGains.get(order.id)!;
            const formattedTotal = money(total);
            const formattedGain = money(result.gain, true);
            const gainClass = result.gain === null || result.gain === 0 ? "" : result.gain > 0 ? "positive" : "negative";
            const remaining = result.shares === 0 ? "Lote fechado" : `${quantity(result.shares)} em carteira`;
            const date = new Date(`${order.date}T00:00:00Z`);
            const formattedDate = `${date.getUTCDate()} ${monthFormat.format(date)} ${date.getUTCFullYear()}`;
            return (
              <tr key={order.id} className={formattedTotal.length > 14 ? "transaction-wide-total" : undefined}>
                <td className="transaction-date"><time dateTime={order.date}>{formattedDate}</time></td>
                <td className="transaction-asset">
                  <div className="transaction-identity"><strong>{order.ticker}</strong><small>{order.name}</small></div>
                  <details className="transaction-details">
                    <summary aria-label={`Ver detalhes de ${order.ticker} de ${order.date}`}>Ver detalhes <Icon name="chevron" /></summary>
                    <dl className="transaction-mobile-detail">
                      <div><dt>Quantidade</dt><dd>{quantity(order.shares)} {order.shares === 1 ? "unidade" : "unidades"}</dd></div>
                      <div><dt>Preço por unidade</dt><dd>{money(order.pricebuy)}</dd></div>
                    </dl>
                    <p className="transaction-explanation">{order.type === "buy" ?
                      "Ganho total do lote: inclui o ganho realizado e o não realizado, em percentagem do custo original da compra." :
                      "Ganho realizado nesta venda, em percentagem do custo das unidades vendidas."}</p>
                    <button className="delete-button no-print" aria-label={`Remover ${order.ticker} de ${order.date}`}
                      onClick={() => onDelete(order.id)}>Remover transação</button>
                  </details>
                </td>
                <td className="transaction-operation"><span className={`order-badge ${order.type}`}>{order.type === "buy" ? "Compra" : "Venda"}</span></td>
                <td className="transaction-units"><span>{quantity(order.shares)} {order.shares === 1 ? "unidade" : "unidades"}</span><small>{money(order.pricebuy)} / unidade</small></td>
                <td className="transaction-total"><span className="transaction-mobile-label">Total</span><strong className={formattedTotal.length > 24 ? "transaction-long-amount" : undefined}>{formattedTotal}</strong></td>
                <td className="transaction-gain">
                  <span className="transaction-mobile-label">Ganho</span>
                  <span className={gainClass}><strong className={formattedGain.length > 24 ? "transaction-long-amount" : undefined}>{formattedGain}</strong><span className="gain-percent">{percent(result.percent)}</span></span>
                  <small>{order.type === "sell" ? "Realizado" : `Total da compra · ${remaining}`}</small>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      ) : (
        <div className="transaction-empty no-results">
          <Icon name="transactions" />
          <p>{search ? "Nenhuma transação corresponde à pesquisa." : filter === "buy" ? "Não tens compras registadas." : "Não tens vendas registadas."}</p>
          {search ? <button className="text-button" onClick={onClearSearch}>Limpar pesquisa</button> :
            <button className="text-button" onClick={() => setFilter("all")}>Ver todas as transações</button>}
        </div>
      )}
    </div>
  );
}
