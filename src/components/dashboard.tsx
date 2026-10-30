"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Currency, MarketData, Portfolio, Order } from "@/lib/types";
import { calculateHistory, calculatePortfolio } from "@/lib/portfolio";
import {
  chronological,
  validateOrder,
  validateOrders,
  validatePortfolio,
} from "@/lib/validation";
import { parseCsv, exportCsv } from "@/lib/csv";
import { decodeStorage, encodeStorage, STORAGE_KEY } from "@/lib/storage";
import { demoOrders } from "@/lib/demo";
import { PerformanceChart } from "./performance-chart";
import { Dialog } from "./dialog";

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const pct = (n: number | null) =>
  n === null
    ? "—"
    : `${n >= 0 ? "+" : ""}${n.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;
const qty = (n: number) =>
  n.toLocaleString("pt-PT", { maximumFractionDigits: 8 });
const initialPortfolio = (): Portfolio => ({
  id: crypto.randomUUID(),
  name: "A minha carteira",
  currency: "EUR",
  orders: [],
});
type Tab = "overview" | "positions" | "transactions" | "notes";
type Modal = "order" | "portfolio" | null;
const EMPTY_ORDERS: Order[] = [];
const EMPTY_MARKET: MarketData = {};

export function Dashboard() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selected, setSelected] = useState("");
  const [ready, setReady] = useState(false);
  const [storageBroken, setStorageBroken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [marketResult, setMarketResult] = useState<{
    key: string;
    data: MarketData;
    error: string;
  }>({ key: "", data: {}, error: "" });
  const storageSnapshot = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      storageSnapshot.current = raw;
      const loaded = raw ? decodeStorage(raw) : [initialPortfolio()];
      // Synchronize React with browser storage after hydration; never overwrite damaged data.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPortfolios(loaded);
      setSelected(loaded[0].id);
    } catch {
      let original = "";
      try {
        original = localStorage.getItem(STORAGE_KEY) ?? "";
      } catch {
        /* Storage access can be disabled by the browser. */
      }
      setStorageBroken(original);
      setMessage(
        "Não foi possível ler o armazenamento. Exporta os dados originais antes de recuperar.",
      );
    }
    setReady(true);
  }, []);
  const portfolio = portfolios.find((p) => p.id === selected) ?? portfolios[0];
  const orders = portfolio?.orders ?? EMPTY_ORDERS;
  const tickers = [...new Set(orders.map((o) => o.ticker))].sort().join(",");
  const start = orders.length ? chronological(orders)[0].date : "";
  const requestKey = `${portfolio?.id}|${tickers}|${start}|${refresh}`;
  useEffect(() => {
    if (!tickers || !start) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    async function load() {
      try {
        const response = await fetch(
          `/api/market?${new URLSearchParams({ tickers, start })}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error("Não foi possível obter os dados de mercado.");
        const body = await response.json();
        setMarketResult({ key: requestKey, data: body.assets, error: "" });
      } catch {
        if (!controller.signal.aborted)
          setMarketResult({
            key: requestKey,
            data: {},
            error:
              "O Yahoo Finance está indisponível. As tuas transações continuam guardadas.",
          });
        else if (!cancelled)
          setMarketResult({
            key: requestKey,
            data: {},
            error: "O pedido demorou demasiado. Tenta atualizar os preços.",
          });
      } finally {
        clearTimeout(timeout);
      }
    }
    let cancelled = false;
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [tickers, start, requestKey]);
  const market =
    marketResult.key === requestKey ? marketResult.data : EMPTY_MARKET;
  const loading = !!tickers && marketResult.key !== requestKey;
  const currency = portfolio?.currency ?? "EUR";
  const summary = useMemo(
    () => calculatePortfolio(orders, market, currency),
    [orders, market, currency],
  );
  const history = useMemo(
    () => calculateHistory(orders, market, currency),
    [orders, market, currency],
  );
  const money = (n: number | null) =>
    n === null
      ? "—"
      : n.toLocaleString("pt-PT", {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        });
  const visiblePositions = summary.positions.filter((p) =>
    `${p.ticker} ${p.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const visibleOrders = chronological(orders)
    .reverse()
    .filter((o) =>
      `${o.ticker} ${o.name}`.toLowerCase().includes(search.toLowerCase()),
    );
  function persist(next: Portfolio[], id = selected) {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (storageBroken === null && current !== storageSnapshot.current) {
        if (current) {
          const latest = decodeStorage(current);
          setPortfolios(latest);
          setSelected(latest[0].id);
        }
        storageSnapshot.current = current;
        setMessage(
          "Os dados foram alterados noutro separador. Carregámos a versão mais recente; repete a operação.",
        );
        return false;
      }
      const encoded = encodeStorage(next);
      localStorage.setItem(STORAGE_KEY, encoded);
      storageSnapshot.current = encoded;
      setPortfolios(next);
      setSelected(id);
      setMessage("");
      return true;
    } catch {
      setMessage(
        "Não foi possível guardar neste navegador. Exporta uma cópia de segurança e verifica o espaço/permissões.",
      );
      return false;
    }
  }
  function update(next: Portfolio) {
    validateOrders(next.orders);
    return persist(portfolios.map((p) => (p.id === next.id ? next : p)));
  }
  function openModal(value: Modal) {
    setFormError("");
    setModal(value);
  }
  function addOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portfolio) return;
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget));
      const order = validateOrder(raw);
      if (update({ ...portfolio, orders: [...orders, order] })) setModal(null);
    } catch (e) {
      setFormError((e as Error).message);
    }
  }
  function addPortfolio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (portfolios.length >= 30) {
      setFormError("Máximo de 30 carteiras.");
      return;
    }
    try {
      const next = validatePortfolio({
        id: crypto.randomUUID(),
        name: String(values.get("name")).trim(),
        currency: values.get("currency"),
        orders: [],
      });
      if (persist([...portfolios, next], next.id)) setModal(null);
    } catch (e) {
      setFormError((e as Error).message);
    }
  }
  async function importFile(file: File | undefined, backup = false) {
    if (!file || !portfolio) return;
    try {
      if (file.size > (backup ? 10_000_000 : 2_000_000))
        throw new Error(`O ficheiro excede ${backup ? 10 : 2} MB.`);
      const text = await file.text();
      if (backup) {
        const next = decodeStorage(text);
        if (
          window.confirm(
            "Substituir todas as carteiras pelas da cópia de segurança?",
          )
        )
          persist(next, next[0].id);
      } else {
        const imported = parseCsv(text);
        if (update({ ...portfolio, orders: [...orders, ...imported] }))
          setMessage(
            `${imported.length} transações importadas. Confirma a moeda dos ativos antes de analisar os totais.`,
          );
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function deleteOrder(id: string) {
    if (!portfolio || !window.confirm("Remover esta transação?")) return;
    try {
      update({ ...portfolio, orders: orders.filter((o) => o.id !== id) });
    } catch (e) {
      setMessage(`Não foi possível remover: ${(e as Error).message}`);
    }
  }
  function removePortfolio() {
    if (
      !portfolio ||
      !window.confirm(
        `Eliminar a carteira «${portfolio.name}» e todas as suas transações?`,
      )
    )
      return;
    const next = portfolios.filter((p) => p.id !== portfolio.id);
    if (!next.length) next.push(initialPortfolio());
    persist(next, next[0].id);
  }
  function loadDemo() {
    if (portfolios.length >= 30) {
      setMessage("Máximo de 30 carteiras.");
      return;
    }
    const p: Portfolio = {
      id: crypto.randomUUID(),
      name: "Carteira de exemplo",
      currency: "USD",
      orders: demoOrders(),
    };
    persist([...portfolios, p], p.id);
  }

  if (!ready)
    return (
      <main className="boot" aria-busy="true">
        A abrir a tua carteira…
      </main>
    );
  if (storageBroken !== null)
    return (
      <main className="boot">
        <h1>Recuperar carteiras</h1>
        <p role="alert">{message}</p>
        <button
          onClick={() =>
            download(storageBroken, "carteiras-recuperacao.txt", "text/plain")
          }
        >
          Exportar dados originais
        </button>
        <button
          onClick={() => {
            if (
              window.confirm(
                "Repor o armazenamento? Guarda primeiro os dados originais.",
              )
            ) {
              const p = initialPortfolio();
              if (persist([p], p.id)) setStorageBroken(null);
            }
          }}
        >
          Repor armazenamento
        </button>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <Link className="brand" href="/" aria-label="Rendimentos, início">
          <span className="brand-mark">
            r<span>↗</span>
          </span>
          rendimentos<span className="brand-dot">.</span>
        </Link>
        <span className="workspace-label">O TEU ESPAÇO</span>
        <nav aria-label="Navegação principal">
          {(
            [
              { key: "overview", icon: "◫", text: "Visão geral" },
              { key: "positions", icon: "▦", text: "Posições" },
              { key: "transactions", icon: "⇄", text: "Transações" },
              { key: "notes", icon: "ⓘ", text: "Notas explicativas" },
            ] as const
          ).map((n) => (
            <button
              key={n.key}
              className={tab === n.key ? "nav-item active" : "nav-item"}
              onClick={() => setTab(n.key)}
            >
              <span aria-hidden="true">{n.icon}</span>
              {n.text}
              {n.key === "positions" ? (
                <small>
                  {summary.positions.filter((p) => p.shares > 0).length}
                </small>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-portfolios">
          <div className="side-heading">
            <span>AS TUAS CARTEIRAS</span>
            <button
              aria-label="Criar carteira"
              onClick={() => openModal("portfolio")}
            >
              +
            </button>
          </div>
          {portfolios.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected(p.id);
                setSearch("");
              }}
              className={`portfolio-link ${portfolio?.id === p.id ? "selected" : ""}`}
            >
              <i className="portfolio-dot" />
              {p.name}
              <small>{p.currency}</small>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span>◉</span>
            <div>
              <strong>Guardado neste navegador</strong>
              <small>Sem conta · os teus dados, contigo</small>
            </div>
          </div>
          <button
            className="backup-link"
            onClick={() =>
              download(
                encodeStorage(portfolios),
                "carteiras.json",
                "application/json",
              )
            }
          >
            ↧ Exportar cópia de segurança
          </button>
          <button
            className="backup-link"
            onClick={() => backupRef.current?.click()}
          >
            ↥ Restaurar cópia de segurança
          </button>
          <a
            href="https://github.com/pecoelho01"
            target="_blank"
            rel="noreferrer"
          >
            Feito por Pedro ↗
          </a>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar no-print">
          <div className="breadcrumb">
            Espaço pessoal <span>/</span> <strong>Portfólio</strong>
          </div>
          <div className="topbar-right">
            <span className="status-dot" />
            Dados via Yahoo Finance <span className="avatar">P</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">CADA INVESTIMENTO CONTA</div>
              <h1>
                {tab === "notes" ? "Conhece os teus números" : portfolio?.name}
              </h1>
              <p>
                A tua carteira, em perspetiva. Todas as decisões começam aqui.
              </p>
            </div>
            <div className="heading-actions no-print">
              <button
                className="button secondary"
                onClick={() => fileRef.current?.click()}
              >
                ↥ Importar CSV
              </button>
              <button
                className="button primary"
                onClick={() => openModal("order")}
              >
                + Nova transação
              </button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            aria-label="Importar ficheiro CSV"
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={backupRef}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            aria-label="Restaurar cópia de segurança"
            onChange={(e) => {
              void importFile(e.target.files?.[0], true);
              e.target.value = "";
            }}
          />
          {message ? (
            <div className="notice" role="status">
              {message}
              <button aria-label="Fechar aviso" onClick={() => setMessage("")}>
                ×
              </button>
            </div>
          ) : null}
          {marketResult.key === requestKey && marketResult.error ? (
            <div className="notice" role="alert">
              {marketResult.error}
            </div>
          ) : null}
          {orders.length &&
          !loading &&
          (summary.value === null ||
            Object.values(market).some((a) => a.error)) ? (
            <div className="notice">
              Algumas cotações estão em falta ou noutra moeda. Os totais que
              dependem delas aparecem como «—». A carteira usa {currency}, sem
              conversão cambial.
            </div>
          ) : null}
          {tab === "notes" ? (
            <section className="panel notes">
              <span className="eyebrow">TRANSPARÊNCIA PRIMEIRO</span>
              <h2>Como calculamos a rentabilidade</h2>
              <h3>Custo médio ponderado</h3>
              <p>
                Cada compra atualiza o custo médio das unidades abertas. As
                vendas mantêm esse custo e realizam o ganho: (preço de venda −
                custo médio) × quantidade vendida.
              </p>
              <h3>Ganho e ROI total</h3>
              <p>
                Ganho não realizado = (cotação − custo médio) × quantidade
                aberta. Ganho total = realizado + não realizado. ROI = ganho
                total ÷ valor de todas as compras × 100. Não é uma taxa
                anualizada nem uma rentabilidade ponderada pelo tempo.
              </p>
              <h3>Histórico e S&P 500</h3>
              <p>
                Reconstruímos a carteira até ao último dia de negociação de cada
                semana, usando apenas preços desse dia ou anteriores. O S&P 500
                é um índice de preços em USD, normalizado pelo primeiro fecho
                disponível desde a primeira transação. Não é uma simulação dos
                mesmos fluxos de caixa. Períodos filtrados mantêm a base
                original.
              </p>
              <h3>Moedas, preços e limites</h3>
              <p>
                Os preços das ordens devem estar na moeda da carteira. Cotações
                noutra moeda não são convertidas e impedem a valorização de
                posições abertas. Dividendos, impostos, comissões e ajustes
                automáticos de quantidades por splits não estão incluídos. O
                Yahoo pode ajustar retroativamente os preços históricos por
                splits; nesses ativos, adapta também as transações antes de
                interpretar a série.
              </p>
              <h3>Guardar e exportar</h3>
              <p>
                Os dados ficam apenas neste navegador. Não sincronizam com
                outros dispositivos. A limpeza dos dados do navegador remove as
                carteiras; exporta regularmente uma cópia JSON. O CSV contém
                apenas as transações da carteira selecionada. «Relatório PDF»
                abre a impressão do navegador: escolhe «Guardar como PDF».
              </p>
              <h3>Sobre o projeto</h3>
              <p>
                Criado por Pedro, estudante de Engenharia Informática, para
                acompanhar investimentos de forma simples. A integração Yahoo
                Finance é não oficial e pode sofrer atrasos ou interrupções.
              </p>
            </section>
          ) : (
            <>
              <div className="portfolio-toolbar">
                <div>
                  <span className="pill">CARTEIRA PESSOAL</span>
                  <span className="currency-tag">Moeda: {currency}</span>
                </div>
                <button
                  className="text-button no-print"
                  disabled={loading || !orders.length}
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  {loading ? "A obter cotações…" : "↻ Atualizar preços"}
                </button>
              </div>
              <div className="metrics">
                <Metric
                  label="Valor da carteira"
                  value={money(summary.value)}
                  detail={`${summary.positions.filter((p) => p.shares > 0).length} posições abertas`}
                  featured
                />
                <Metric
                  label="Ganho total"
                  value={money(summary.gain)}
                  detail={`${pct(summary.roi)} de rentabilidade`}
                  positive={summary.gain !== null && summary.gain >= 0}
                />
                <Metric
                  label="Ganho realizado"
                  value={money(summary.realized)}
                  detail="Resultado das tuas vendas"
                  positive={summary.realized >= 0}
                />
                <Metric
                  label="Total investido"
                  value={money(summary.invested)}
                  detail="Valor acumulado das compras"
                />
              </div>
              {tab === "overview" ? (
                <div className="charts-grid">
                  <PerformanceChart data={history} />
                  <section className="panel allocation">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">DISTRIBUIÇÃO</span>
                        <h2>Onde estás investido</h2>
                      </div>
                      <span className="subtle">{currency}</span>
                    </div>
                    {summary.value !== null && summary.value > 0 ? (
                      <>
                        <div
                          className="donut"
                          role="img"
                          aria-label="Alocação da carteira por valor de mercado"
                          style={{
                            background: `conic-gradient(${summary.positions
                              .filter((p) => (p.value ?? 0) > 0)
                              .map((p, i, a) => {
                                const previous =
                                  (a
                                    .slice(0, i)
                                    .reduce((n, v) => n + (v.value ?? 0), 0) /
                                    summary.value!) *
                                  100;
                                return `${colors[i % colors.length]} ${previous}% ${previous + ((p.value ?? 0) / summary.value!) * 100}%`;
                              })
                              .join(",")})`,
                          }}
                        >
                          <div>
                            <small>Ativos</small>
                            <strong>
                              {
                                summary.positions.filter((p) => p.shares > 0)
                                  .length
                              }
                            </strong>
                          </div>
                        </div>
                        <div className="allocation-list">
                          {summary.positions
                            .filter((p) => p.shares > 0)
                            .map((p, i) => (
                              <div key={p.ticker}>
                                <span>
                                  <i
                                    className="dot"
                                    style={{
                                      background: colors[i % colors.length],
                                    }}
                                  />
                                  {p.ticker}
                                </span>
                                <strong>
                                  {(
                                    ((p.value ?? 0) / summary.value!) *
                                    100
                                  ).toFixed(1)}
                                  %
                                </strong>
                              </div>
                            ))}
                        </div>
                      </>
                    ) : (
                      <div className="allocation-empty">
                        <div className="empty-ring" />
                        <p>
                          A distribuição dos teus ativos
                          <br />
                          vai aparecer aqui.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
              <section className="panel holdings">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">O TEU PORTFÓLIO</span>
                    <h2>
                      {tab === "transactions"
                        ? "Histórico de transações"
                        : "As tuas posições"}{" "}
                      <span className="count">
                        {tab === "transactions"
                          ? orders.length
                          : summary.positions.length}
                      </span>
                    </h2>
                  </div>
                  <div className="table-actions no-print">
                    <label className="search">
                      <span>⌕</span>
                      <input
                        aria-label="Pesquisar ativo"
                        placeholder="Pesquisar ativo…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <button
                      className="icon-button"
                      aria-label="Exportar transações CSV"
                      title="Exportar CSV"
                      onClick={() =>
                        download(
                          exportCsv(orders),
                          "transacoes.csv",
                          "text/csv",
                        )
                      }
                    >
                      ↧
                    </button>
                  </div>
                </div>
                {tab === "overview" ? (
                  <div className="table-tabs no-print">
                    <button
                      className="selected"
                      onClick={() => setTab("positions")}
                    >
                      Posições
                    </button>
                    <button onClick={() => setTab("transactions")}>
                      Transações
                    </button>
                  </div>
                ) : null}
                {!orders.length ? (
                  <div className="empty-state">
                    <div className="empty-illustration">
                      ▥<span>+</span>
                    </div>
                    <h3>Um novo capítulo para os teus investimentos</h3>
                    <p>
                      Adiciona a primeira transação ou importa um CSV.
                      <br />
                      Vamos dar forma à tua carteira.
                    </p>
                    <div>
                      <button
                        className="button primary no-print"
                        onClick={() => openModal("order")}
                      >
                        + Adicionar transação
                      </button>
                      <button
                        className="text-button no-print"
                        onClick={loadDemo}
                      >
                        Explorar uma carteira de exemplo ↗
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
                ) : (
                  <div className="table-scroll">
                    {tab === "transactions" ? (
                      <table>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Ativo</th>
                            <th>Operação</th>
                            <th>Quantidade</th>
                            <th>Preço ({currency})</th>
                            <th>Total ({currency})</th>
                            <th className="no-print">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleOrders.map((o) => (
                            <tr key={o.id}>
                              <td>{o.date}</td>
                              <td>
                                <strong>{o.ticker}</strong>
                                <small>{o.name}</small>
                              </td>
                              <td>
                                <span className={`order-badge ${o.type}`}>
                                  {o.type === "buy" ? "Compra" : "Venda"}
                                </span>
                              </td>
                              <td>{qty(o.shares)}</td>
                              <td>{money(o.pricebuy)}</td>
                              <td>{money(o.pricebuy * o.shares)}</td>
                              <td className="no-print">
                                <button
                                  className="delete-button"
                                  aria-label={`Remover ${o.ticker} de ${o.date}`}
                                  onClick={() => deleteOrder(o.id)}
                                >
                                  Remover
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>Ativo</th>
                            <th>Quantidade</th>
                            <th>Custo médio</th>
                            <th>Último preço</th>
                            <th>Valor de mercado</th>
                            <th>Ganho não realizado</th>
                            <th>Realizado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visiblePositions.map((p, i) => (
                            <tr key={p.ticker}>
                              <td>
                                <div className="asset-cell">
                                  <span
                                    className="asset-icon"
                                    style={{ color: colors[i % colors.length] }}
                                  >
                                    {p.ticker.slice(0, 1)}
                                  </span>
                                  <div>
                                    <a
                                      href={`https://finance.yahoo.com/quote/${encodeURIComponent(p.ticker)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {p.ticker} ↗
                                    </a>
                                    <small>
                                      {p.name}
                                      {p.shares === 0 ? " · Fechada" : ""}
                                    </small>
                                  </div>
                                </div>
                              </td>
                              <td>{qty(p.shares)}</td>
                              <td>{money(p.average)}</td>
                              <td>
                                {money(p.price)}
                                <small>
                                  {p.issue ??
                                    (market[p.ticker]?.asOf
                                      ? new Date(
                                          market[p.ticker].asOf!,
                                        ).toLocaleString("pt-PT", {
                                          timeZone: "Europe/Lisbon",
                                        })
                                      : "Sem cotação")}
                                </small>
                              </td>
                              <td>
                                <strong>{money(p.value)}</strong>
                              </td>
                              <td
                                className={
                                  p.unrealized !== null && p.unrealized >= 0
                                    ? "positive"
                                    : "negative"
                                }
                              >
                                {money(p.unrealized)}
                              </td>
                              <td
                                className={
                                  p.realized >= 0 ? "positive" : "negative"
                                }
                              >
                                {money(p.realized)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {(tab === "transactions" ? visibleOrders : visiblePositions)
                      .length === 0 ? (
                      <p className="no-results">Nenhum ativo encontrado.</p>
                    ) : null}
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    Valores em {currency} · Preços sujeitos a atraso · Cache de
                    5 minutos
                  </span>
                  <button
                    className="text-button no-print"
                    onClick={() => window.print()}
                  >
                    ↗ Relatório PDF
                  </button>
                </div>
              </section>
              <div className="bottom-actions no-print">
                <button
                  onClick={() =>
                    download(
                      encodeStorage(portfolios),
                      "carteiras.json",
                      "application/json",
                    )
                  }
                >
                  Exportar backup JSON
                </button>
                <button onClick={() => backupRef.current?.click()}>
                  Restaurar backup JSON
                </button>
                <a href="/modelo_site_ativos.csv" download>
                  ↓ Modelo de importação CSV
                </a>
                <button onClick={removePortfolio}>Eliminar carteira</button>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="mini-mark">↗</span> Um olhar mais claro sobre o
              teu futuro.
            </span>
            <span>rendimentos · Projeto pessoal</span>
          </footer>
        </main>
      </div>
      {modal === "order" ? (
        <Dialog title="Nova transação" onClose={() => setModal(null)}>
          <form onSubmit={addOrder}>
            <p className="form-note">
              Introduz o preço em {currency}. As ordens do mesmo dia seguem a
              ordem de registo.
            </p>
            <div className="form-grid">
              <label>
                Operação
                <select name="type">
                  <option value="buy">Compra</option>
                  <option value="sell">Venda</option>
                </select>
              </label>
              <label>
                Data
                <input
                  name="date"
                  type="date"
                  required
                  min="2000-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label>
                Ticker Yahoo
                <input
                  name="ticker"
                  required
                  placeholder="AAPL"
                  maxLength={25}
                />
              </label>
              <label>
                Nome do ativo
                <input name="name" placeholder="Apple" maxLength={100} />
              </label>
              <label>
                Quantidade
                <input
                  name="shares"
                  required
                  inputMode="decimal"
                  placeholder="10"
                />
              </label>
              <label>
                Preço por unidade ({currency})
                <input
                  name="pricebuy"
                  required
                  inputMode="decimal"
                  placeholder="150,00"
                />
              </label>
            </div>
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="button primary" type="submit">
                Guardar transação
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
      {modal === "portfolio" ? (
        <Dialog title="Criar carteira" onClose={() => setModal(null)}>
          <form onSubmit={addPortfolio}>
            <label>
              Nome da carteira
              <input
                name="name"
                required
                maxLength={60}
                placeholder="Investimentos a longo prazo"
              />
            </label>
            <label>
              Moeda
              <select name="currency" defaultValue="EUR">
                {(["EUR", "USD", "GBP"] as Currency[]).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p className="form-note">
              Usa uma carteira por moeda. Não fazemos conversão cambial
              automática.
            </p>
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="button primary">Criar carteira</button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
const colors = [
  "#7750e6",
  "#398cf2",
  "#27b5a0",
  "#efa749",
  "#d566a8",
  "#7e8b9f",
];
function Metric({
  label,
  value,
  detail,
  featured = false,
  positive = false,
}: {
  label: string;
  value: string;
  detail: string;
  featured?: boolean;
  positive?: boolean;
}) {
  return (
    <section className={`metric ${featured ? "featured" : ""}`}>
      <div className="metric-label">
        {label}
        <span>{featured ? "◫" : "↗"}</span>
      </div>
      <strong className={positive ? "positive" : ""}>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
