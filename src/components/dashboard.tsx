"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Currency, MarketData, Portfolio, Order } from "@/lib/types";
import { calculatePortfolio } from "@/lib/portfolio";
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
import { TransactionsTable } from "./transactions-table";
import { PositionsTable } from "./positions-table";
import { AllocationDonut } from "./allocation-donut";
import { GeographicChart } from "./geographic-chart";
import { useGeography } from "./use-geography";
import { Dialog } from "./dialog";
import { OrderAssetFields } from "./order-asset-fields";
import { Icon } from "./icon";
import { ThemeControl } from "./theme-control";
import { WorkspaceShell } from "./workspace-shell";
import type { AccountIdentity } from "./account-gateway";
import { buildAccountChanges, validateAccountSnapshot, type AccountSnapshot } from "@/lib/account";

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
const initialPortfolio = (): Portfolio => ({
  id: crypto.randomUUID(),
  name: "A minha carteira",
  currency: "EUR",
  orders: [],
});
type Tab = "overview" | "positions" | "transactions" | "notes";
type Modal = "order" | "portfolio" | "import" | "rename" | null;
const EMPTY_ORDERS: Order[] = [];
const EMPTY_MARKET: MarketData = {};

export function Dashboard({ identity = null, accountControls, sidebarAccountControls, accountFeedback, accountPage = false, children }: {
  identity?: AccountIdentity | null;
  accountControls?: React.ReactNode;
  sidebarAccountControls?: React.ReactNode;
  accountFeedback?: React.ReactNode;
  accountPage?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [accountSnapshot, setAccountSnapshot] = useState<AccountSnapshot | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const [accountConflict, setAccountConflict] = useState(false);
  const writing = useRef(false);
  const mounted = useRef(true);
  const requests = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    requests.current = controller;
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  async function accountRequest(body?: unknown) {
    const response = await fetch("/api/account", {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${identity?.accessToken}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: requests.current?.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        throw new Error("Esta carteira foi alterada noutro dispositivo. Exporta uma cópia se necessário e recarrega os dados da conta antes de repetir a operação.");
      }
      if (response.status === 401) throw new Error("A sessão expirou. Inicia sessão novamente para guardar na conta.");
      if (response.status === 429) throw new Error("Demasiadas gravações. Aguarda um minuto e recarrega os dados da conta antes de tentar novamente.");
      if (response.status === 400) throw new Error("Dados inválidos ou limites da conta excedidos. Nenhuma alteração foi guardada. Verifica os dados e os limites documentados antes de repetir.");
      throw new Error("Não foi possível aceder às carteiras da conta. Tenta novamente. Os dados locais continuam disponíveis.");
    }
    return validateAccountSnapshot(await response.json());
  }
  function acceptAccount(snapshot: AccountSnapshot, id?: string) {
    setAccountSnapshot(snapshot);
    const loaded = snapshot.portfolios.map((p) => p.portfolio);
    setPortfolios(loaded);
    setSelected(loaded.some((p) => p.id === id) ? id! : loaded[0]?.id ?? "");
    setAccountConflict(false);
    setSaveState("saved");
  }
  async function reloadAccount() {
    if (writing.current) return;
    writing.current = true;
    setSaveState("saving");
    try {
      const snapshot = await accountRequest();
      if (!mounted.current) return;
      acceptAccount(snapshot, selected);
      setModal(null);
      setSearches({ overview: "", positions: "", transactions: "", notes: "" });
      setMessage("");
    } catch (error) {
      if (mounted.current) { setMessage((error as Error).message); setSaveState("error"); }
    } finally { writing.current = false; }
  }
  async function migrateLocal() {
    if (writing.current || !accountSnapshot) return;
    if (!window.confirm("Copiar as carteiras deste navegador para a conta? Serão acrescentadas sem substituir carteiras existentes. Os dados locais serão mantidos. Uma cópia idêntica já importada não será duplicada.")) return;
    writing.current = true;
    setSaveState("saving");
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("Não existem carteiras guardadas neste navegador.");
      const local = decodeStorage(raw);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encodeStorage(local)));
      const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      if (!mounted.current) return;
      const snapshot = await accountRequest({ changes: [], migration: { key, portfolios: local } });
      if (!mounted.current) return;
      acceptAccount(snapshot, selected);
      setMessage("Carteiras locais copiadas para a conta. Uma cópia idêntica já importada não foi duplicada; os dados do navegador foram mantidos.");
    } catch (error) {
      if (mounted.current) { setMessage((error as Error).message); setSaveState("error"); }
    } finally { writing.current = false; }
  }
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selected, setSelected] = useState("");
  const [ready, setReady] = useState(false);
  const [storageBroken, setStorageBroken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [allocationView, setAllocationView] = useState<"assets" | "geography">("assets");
  const [modal, setModal] = useState<Modal>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [searches, setSearches] = useState<Record<Tab, string>>({
    overview: "",
    positions: "",
    transactions: "",
    notes: "",
  });
  const search = searches[tab];
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
    if (identity) {
      let cancelled = false;
      accountRequest().then((snapshot) => {
        if (!cancelled) { acceptAccount(snapshot); setReady(true); }
      }).catch((error: Error) => {
        if (!cancelled) { setMessage(error.message); setSaveState("error"); setReady(true); }
      });
      return () => { cancelled = true; };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      storageSnapshot.current = raw;
      const loaded = raw ? decodeStorage(raw) : [initialPortfolio()];
      // Synchronize React with browser storage after hydration; never overwrite damaged data.
      setPortfolios(loaded);
      setSelected(loaded[0].id);
    } catch {
      let original = "";
      try {
        original = localStorage.getItem(STORAGE_KEY) ?? "";
      } catch {
        /* Storage access can be disabled by the browser. */
      }
      // Browser storage is read only after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageBroken(original);
      setMessage(
        "Não foi possível ler o armazenamento. Exporta os dados originais antes de recuperar.",
      );
    }
    setReady(true);
    // The parent remounts this workspace when its mode or user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const openPositionCount = summary.positions.filter((p) => p.shares > 0).length;
  const openTickers = summary.positions
    .filter((p) => p.shares > 0)
    .map((p) => p.ticker)
    .sort()
    .join(",");
  const geography = useGeography(openTickers, ready && tab === "overview", refresh);
  const geographicMarket = Object.fromEntries(
    Object.entries(market).map(([ticker, asset]) => [
      ticker,
      { ...asset, geography: geography.data[ticker] ?? null },
    ]),
  );
  const money = (n: number | null) =>
    n === null
      ? "—"
      : n.toLocaleString("pt-PT", {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        });
  async function persist(next: Portfolio[], id = selected, recoveryOriginal?: string): Promise<boolean> {
    if (!mounted.current || writing.current || !ready) return false;
    if (!identity && storageBroken !== null && recoveryOriginal !== storageBroken) {
      setMessage("Recupera o armazenamento local antes de alterar as carteiras.");
      return false;
    }
    if (identity) {
      if (!accountSnapshot || accountConflict) {
        setMessage("Recarrega os dados da conta antes de guardar.");
        return false;
      }
      writing.current = true;
      setSaveState("saving");
      try {
        const snapshot = await accountRequest({ changes: buildAccountChanges(accountSnapshot, next) });
        if (!mounted.current) return false;
        acceptAccount(snapshot, id);
        setMessage("");
        return true;
      } catch (error) {
        if (mounted.current) {
          setMessage((error as Error).message);
          setSaveState("error");
          setAccountConflict(true);
        }
        return false;
      } finally { writing.current = false; }
    }
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (recoveryOriginal !== undefined && current !== recoveryOriginal) {
        setMessage("O armazenamento foi alterado noutro separador. Recarrega a página e verifica os dados antes de repor.");
        return false;
      }
      if (current !== storageSnapshot.current) {
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
    if (!ready || storageBroken !== null) return;
    setFormError("");
    setModal(value);
  }
  async function addOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portfolio) return;
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget));
      const order = validateOrder(raw);
      if (await update({ ...portfolio, orders: [...orders, order] })) setModal(null);
      else setFormError("Não foi possível guardar. Fecha este diálogo e consulta o aviso na página antes de repetir a operação.");
    } catch (e) {
      setFormError((e as Error).message);
    }
  }
  function startRename(id: string) {
    setRenameId(id);
    openModal("rename");
  }
  async function renamePortfolio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = portfolios.find((p) => p.id === renameId);
    if (!target) {
      setFormError(
        "Esta carteira já não está disponível. Fecha este diálogo e escolhe outra carteira.",
      );
      return;
    }
    try {
      const name = String(new FormData(event.currentTarget).get("name")).trim();
      if (!name) {
        setFormError("Introduz um nome para a carteira.");
        return;
      }
      const renamed = validatePortfolio({ ...target, name });
      if (await persist(portfolios.map((p) => (p.id === target.id ? renamed : p)))) {
        setModal(null);
      } else {
        setFormError(
          "Não foi possível guardar o nome. Fecha este diálogo e consulta o aviso na página antes de tentar novamente.",
        );
      }
    } catch (error) {
      setFormError((error as Error).message);
    }
  }
  async function addPortfolio(event: React.FormEvent<HTMLFormElement>) {
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
      if (await persist([...portfolios, next], next.id)) setModal(null);
      else setFormError("Não foi possível guardar. Fecha este diálogo e consulta o aviso na página antes de repetir a operação.");
    } catch (e) {
      setFormError((e as Error).message);
    }
  }
  async function importFile(file: File | undefined, backup = false) {
    if (!file || (!backup && !portfolio)) return;
    try {
      if (file.size > (backup ? 10_000_000 : 2_000_000))
        throw new Error(`O ficheiro excede ${backup ? 10 : 2} MB.`);
      const text = await file.text();
      if (!mounted.current) return;
      if (backup) {
        const next = decodeStorage(text);
        if (
          window.confirm(
            "Substituir todas as carteiras pelas da cópia de segurança?",
          )
        )
          await persist(next, next[0].id);
      } else {
        const imported = parseCsv(text);
        if (portfolio && await update({ ...portfolio, orders: [...orders, ...imported] }))
          setMessage(
            `${imported.length} ${imported.length === 1 ? "transação importada" : "transações importadas"}. Confirma a moeda dos ativos antes de analisar os totais.`,
          );
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function deleteOrder(id: string) {
    if (!portfolio || !window.confirm("Remover esta transação?")) return;
    try {
      await update({ ...portfolio, orders: orders.filter((o) => o.id !== id) });
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
    if (!next.length && !identity) next.push(initialPortfolio());
    void persist(next, next[0]?.id ?? "");
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

  if (!ready && !accountPage)
    return (
      <main className="boot" aria-busy="true">
        {accountControls}
        A abrir a tua carteira…
      </main>
    );
  if (storageBroken !== null && !accountPage)
    return (
      <main className="boot">
        {accountControls ?? <Link className="button secondary" href="/conta">Aceder à conta</Link>}
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
          onClick={async () => {
            if (
              window.confirm(
                "Repor o armazenamento? Guarda primeiro os dados originais.",
              )
            ) {
              const p = initialPortfolio();
              if (await persist([p], p.id, storageBroken)) setStorageBroken(null);
            }
          }}
        >
          Repor armazenamento
        </button>
      </main>
    );
  return (
    <WorkspaceShell
      portfolioName={portfolio?.name ?? "As tuas carteiras"}
      currency={portfolio?.currency}
      sidebar={
        <>
          <span className="workspace-label">ESPAÇO PESSOAL</span>
          <nav aria-label="Navegação principal">
            {(
              [
                { key: "overview", icon: "overview", text: "Visão geral" },
                { key: "positions", icon: "positions", text: "Posições" },
                {
                  key: "transactions",
                  icon: "transactions",
                  text: "Transações",
                },
                { key: "notes", icon: "info", text: "Notas explicativas" },
              ] as const
            ).map((n) => (
              <button
                key={n.key}
                className={!accountPage && tab === n.key ? "nav-item active" : "nav-item"}
                aria-label={n.text}
                title={n.text}
                aria-current={!accountPage && tab === n.key ? "page" : undefined}
                onClick={() => { setTab(n.key); if (accountPage) router.push("/"); }}
              >
                <Icon name={n.icon} />
                <span className="nav-label">{n.text}</span>
                {n.key === "positions" ? (
                  <small aria-hidden="true">
                    {summary.positions.filter((p) => p.shares > 0).length}
                  </small>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="sidebar-portfolios">
            <div className="side-heading">
              <span>CARTEIRAS</span>
              <button
                aria-label="Criar carteira"
                disabled={!ready || storageBroken !== null}
                onClick={() => openModal("portfolio")}
              >
                <Icon name="plus" />
              </button>
            </div>
            {portfolios.map((p) => (
              <div
                className={`portfolio-row ${portfolio?.id === p.id ? "selected" : ""}`}
                key={p.id}
              >
                <button
                  onClick={() => {
                    setSelected(p.id);
                    if (accountPage) router.push("/");
                    setSearches({ overview: "", positions: "", transactions: "", notes: "" });
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    startRename(p.id);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "ContextMenu" ||
                      (event.shiftKey && event.key === "F10")
                    ) {
                      event.preventDefault();
                      startRename(p.id);
                    }
                  }}
                  className={`portfolio-link ${portfolio?.id === p.id ? "selected" : ""}`}
                  aria-current={portfolio?.id === p.id ? "true" : undefined}
                  title="Botão direito para renomear"
                >
                  <i className="portfolio-dot" />
                  <span className="portfolio-identity"><span className="portfolio-name">{p.name}</span><small>{p.currency}</small></span>
                </button>
                <button
                  className="portfolio-rename icon-button"
                  aria-label={`Renomear carteira ${p.name}`}
                  disabled={!ready || storageBroken !== null}
                  onClick={() => startRename(p.id)}
                >
                  <Icon name="edit" />
                </button>
              </div>
            ))}
          </div>
          <div className="sidebar-bottom">
            <div className="local-badge">
              <Icon name="shield" />
              <div>
                <strong>{identity ? "Modo conta" : "Modo local"}</strong>
              </div>
            </div>
            {sidebarAccountControls}
            <a
              href="https://github.com/pecoelho01"
              target="_blank"
              rel="noreferrer"
            >
              Feito por Pedro <Icon name="external" />
            </a>
          </div>
        </>
      }
    >
      <div className="main-area">
        <header className="topbar no-print">
          <div className="breadcrumb">
            Espaço pessoal <span>/</span> <strong>{accountPage ? "Definições da conta" : "As tuas carteiras"}</strong>
          </div>
          <div className="topbar-right">
            <span className="market-source">
              <Icon name="shield" />
              Mercado via Yahoo Finance
            </span>
            <ThemeControl />
          </div>
        </header>
        <main className="content">
          {accountPage ? <>
            {children}
            {accountControls ?? accountFeedback}
            {storageBroken !== null ? <div className="notice" role="alert">
              <span>Não foi possível ler o armazenamento local. Recupera os dados antes de alterar as carteiras.</span>
              <Link className="button secondary" href="/">Recuperar carteiras</Link>
            </div> : null}
          </> : <>
          {accountFeedback}
          {identity ? (
            <div className="account-storage no-print" aria-busy={saveState === "saving"}>
              <span aria-live="polite">{saveState === "saving" ? "A guardar…" : saveState === "error" ? "Erro ao guardar ou carregar" : "Guardado na conta"}</span>
              <button className="button secondary" disabled={saveState === "saving"} onClick={() => void reloadAccount()}>Recarregar dados da conta</button>
              <button className="button secondary" disabled={saveState === "saving" || !accountSnapshot} onClick={() => void migrateLocal()}>Copiar carteiras locais para a conta</button>
            </div>
          ) : null}
          <div className="page-heading">
            <div>
              <h1>
                {tab === "notes"
                  ? "Conhece os teus números"
                  : tab === "positions"
                    ? "Posições"
                    : tab === "transactions"
                      ? "Transações"
                      : "Visão Geral"}
              </h1>
            </div>
            <div className="heading-actions no-print">
              <details
                className="data-actions"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector("summary")?.focus();
                  }
                }}
              >
                <summary className="button secondary">
                  <Icon name="file" /> Dados e exportação{" "}
                  <Icon name="chevron" />
                </summary>
                <div
                  className="data-actions-panel"
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button, a")) {
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }
                  }}
                >
                  <span className="action-group-label">Carteira atual</span>
                  <button disabled={!portfolio || saveState === "saving"} onClick={() => openModal("import")}>
                    <Icon name="upload" /> Importar CSV
                  </button>
                  <button
                    onClick={() =>
                      download(exportCsv(orders), "transacoes.csv", "text/csv")
                    }
                  >
                    <Icon name="download" /> Exportar transações CSV
                  </button>
                  <button onClick={() => window.print()}>
                    <Icon name="file" /> Relatório PDF
                  </button>
                  <a href="/modelo_site_ativos.csv" download>
                    <Icon name="download" /> Modelo de importação CSV
                  </a>
                  <span className="action-group-label">Todas as carteiras</span>
                  <button
                    disabled={!portfolios.length}
                    onClick={() =>
                      download(
                        encodeStorage(portfolios),
                        "carteiras.json",
                        "application/json",
                      )
                    }
                  >
                    <Icon name="download" /> Exportar backup JSON
                  </button>
                  <button onClick={() => backupRef.current?.click()}>
                    <Icon name="upload" /> Restaurar cópia de segurança
                  </button>
                </div>
              </details>
              <button
                className="button primary"
                disabled={!portfolio || saveState === "saving"}
                onClick={() => openModal("order")}
              >
                <Icon name="plus" /> Nova transação
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
          {identity && accountSnapshot && !portfolios.length ? (
            <div className="notice account-empty-notice">
              <span>A tua conta ainda não tem carteiras.</span>
              <button className="button secondary" onClick={() => openModal("portfolio")}>Criar a primeira carteira</button>
            </div>
          ) : null}
          {message ? (
            <div className="notice" role="status">
              {message}
              <button aria-label="Fechar aviso" onClick={() => setMessage("")}>
                <Icon name="close" />
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
              <h2>Como calculamos a rentabilidade</h2>
              <h3>Custo de aquisição FIFO</h3>
              <p>
                Cada venda consome primeiro as unidades compradas há mais tempo.
                O ganho realizado é a receita da venda menos o custo desses
                lotes. O custo médio FIFO é a média dos lotes que continuam
                abertos. No mesmo dia, preservamos a ordem de registo das
                transações.
              </p>
              <h3>Ganho e ROI total</h3>
              <p>
                Ganho não realizado = valor das posições abertas − custo FIFO
                dos lotes restantes. Ganho total = realizado + não realizado.
                ROI = ganho total ÷ valor de todas as compras × 100. Não é uma
                taxa anualizada nem uma rentabilidade ponderada pelo tempo.
              </p>
              <h3>Rentabilidade das posições abertas</h3>
              <p>
                Ganho não realizado ÷ custo FIFO das posições abertas × 100. Sem
                posições abertas, a percentagem fica indisponível. O toggle do
                gráfico permite consultar esta métrica ou o ROI total. No
                histórico, consideramos as posições abertas em cada data; as
                vendas podem alterar a percentagem sem alterar as cotações.
              </p>
              <h3>Ganho por transação</h3>
              <p>
                Nas compras, mostramos o ganho total do lote: o realizado nas
                vendas mais o não realizado das unidades ainda em carteira,
                sobre o custo original da compra. Nas vendas, mostramos o ganho realizado
                sobre o custo FIFO das unidades vendidas. Os preços das transações
                devem ser superiores a zero. Os valores não incluem
                comissões nem impostos.
              </p>
              <h3>Histórico da carteira</h3>
              <p>
                Reconstruímos a carteira com fechos diários em 1D, 5D e 1M e
                semanais nos restantes períodos, usando apenas preços desse dia
                ou anteriores, nas datas disponíveis dos ativos da carteira.
                Não há dados intradiários. Em Máximo, a carteira mantém os
                custos originais. Em 1D, 5D, 1M, 6M, YTD e 1A, as posições iniciais usam o
                último fecho anterior ao início efetivo do intervalo. A rentabilidade
                total inclui as compras e vendas do período; nas posições
                abertas, só contam os lotes ainda detidos, desde o início do
                intervalo ou a aquisição. 1D abrange o dia atual e 5D os últimos
                cinco dias de calendário. YTD começa em 1 de janeiro. As compras
                entram integralmente na base, sem ponderação temporal.
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
                {identity ? "As carteiras deste modo são guardadas na tua conta e podem ser abertas noutros dispositivos. As carteiras locais permanecem separadas." : "Os dados ficam apenas neste navegador. Não sincronizam com outros dispositivos. A limpeza dos dados do navegador remove as carteiras."} Exporta regularmente uma cópia JSON. O CSV contém
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
                  <span className="currency-tag">Moeda: {currency}</span>
                </div>
                <button
                  className="text-button no-print"
                  disabled={loading || !orders.length}
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  <Icon name="refresh" />
                  {loading ? "A obter cotações…" : "Atualizar preços"}
                </button>
              </div>
              {tab === "overview" ? (
                <div className="metrics">
                  <Metric
                    label="Valor da carteira"
                    value={money(summary.value)}
                    detail={`${openPositionCount} ${openPositionCount === 1 ? "posição aberta" : "posições abertas"}`}
                    featured
                  />
                  <Metric
                    label="Ganho total"
                    value={money(summary.gain)}
                    detail={`${pct(summary.roi)} de ROI sobre todas as compras`}
                    trend={summary.gain}
                  />
                  <Metric
                    label="Ganho realizado"
                    value={money(summary.realized)}
                    trend={summary.realized}
                  />
                  <Metric
                    label="Compras acumuladas"
                    value={money(summary.invested)}
                  />
                </div>
              ) : null}
              {tab === "overview" ? (
                <div className="charts-grid">
                  <PerformanceChart
                    key={portfolio?.id ?? "empty"}
                    orders={orders}
                    market={market}
                    currency={currency}
                  />
                  <section className="panel allocation-card" aria-label="Distribuição da carteira">
                    <div className="panel-heading">
                      <div>
                        <h2>Onde estás a investir</h2>
                      </div>
                      <span className="subtle">{currency}</span>
                    </div>
                    <div
                      className="segments allocation-toggle no-print"
                      role="group"
                      aria-label="Tipo de distribuição"
                    >
                      <button
                        aria-pressed={allocationView === "assets"}
                        onClick={() => setAllocationView("assets")}
                      >
                        ETFs
                      </button>
                      <button
                        aria-pressed={allocationView === "geography"}
                        onClick={() => setAllocationView("geography")}
                      >
                        Geografia
                      </button>
                    </div>
                    <div className="allocation-content">
                      <div className="allocation asset-allocation" hidden={allocationView !== "assets"}>
                        {summary.value !== null && summary.value > 0 ? (
                          <AllocationDonut
                            slices={summary.positions.filter((position) => position.shares > 0).map((position, index) => ({
                              id: position.ticker,
                              label: position.ticker,
                              percent: ((position.value ?? 0) / summary.value!) * 100,
                              color: colors[index % colors.length],
                            }))}
                            label="Alocação da carteira por valor de mercado"
                            centerLabel="Ativos"
                            centerValue={String(summary.positions.filter((position) => position.shares > 0).length)}
                          />
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
                      </div>
                      <div className="geographic-view" hidden={allocationView !== "geography"}>
                        <GeographicChart
                          positions={summary.positions}
                          market={geographicMarket}
                          loading={loading || geography.loading}
                        />
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}
              <section className="panel holdings">
                <div className="panel-heading">
                  <div>
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
                      <Icon name="search" />
                      <input
                        aria-label="Pesquisar ativo"
                        placeholder="Pesquisar ativo…"
                        value={search}
                        onChange={(e) => setSearches((current) => ({
                          ...current,
                          [tab]: e.target.value,
                        }))}
                      />
                    </label>
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
                      <Icon name="positions" />
                    </div>
                    <h3>
                      {tab === "positions"
                        ? "Ainda não tens posições"
                        : "Ainda não tens transações"}
                    </h3>
                    <p>
                      {portfolio
                        ? "Adiciona a primeira transação ou importa um CSV."
                        : "Cria a primeira carteira para registar transações."}
                    </p>
                    <div>
                      <button
                        className="button primary no-print"
                        onClick={() => openModal(portfolio ? "order" : "portfolio")}
                      >
                        <Icon name="plus" /> {portfolio ? "Adicionar transação" : "Criar carteira"}
                      </button>
                      <button
                        className="text-button no-print"
                        onClick={loadDemo}
                      >
                        Explorar uma carteira de exemplo{" "}
                        <Icon name="external" />
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
                      <TransactionsTable
                        key={portfolio?.id}
                        orders={orders}
                        orderGains={summary.orderGains}
                        currency={currency}
                        search={search}
                        onClearSearch={() => setSearches((current) => ({ ...current, [tab]: "" }))}
                        onDelete={deleteOrder}
                      />
                    ) : (
                      <PositionsTable
                        key={portfolio?.id}
                        positions={summary.positions}
                        market={market}
                        currency={currency}
                        loading={loading}
                        search={search}
                        onClearSearch={() => setSearches((current) => ({ ...current, [tab]: "" }))}
                      />
                    )}
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    Valores em {currency} · Cotações sujeitas a atraso
                    {tab === "transactions" ? (
                      <span className="transaction-gain-note">
                        Compras: ganho total do lote (realizado + não realizado), % sobre o custo original.
                        Vendas: ganho realizado, % sobre o custo vendido.
                        Os ganhos das vendas já estão incluídos nas compras; não somar as duas vistas.
                      </span>
                    ) : null}
                  </span>
                </div>
              </section>
              <div className="bottom-actions no-print">
                <span>
                  <Icon name="download" /> Exporta uma cópia regularmente.
                </span>
                <button onClick={removePortfolio}>Eliminar carteira</button>
              </div>
            </>
          )}
          </>}
        </main>
      </div>
      {modal === "rename" ? (
        <Dialog title="Renomear carteira" onClose={() => setModal(null)}>
          <form onSubmit={renamePortfolio}>
            <label>
              Nome da carteira
              <input
                name="name"
                required
                maxLength={60}
                defaultValue={portfolios.find((p) => p.id === renameId)?.name}
              />
            </label>
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
              <button className="button primary" disabled={saveState === "saving"} type="submit">
                Guardar nome
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
      {modal === "import" ? (
        <Dialog title="Importar CSV" onClose={() => setModal(null)}>
          <p className="import-help">
            Prepara o teu ficheiro com uma transação por linha, como neste
            exemplo. Podes descarregar o modelo e substituir os dados pelos
            teus.
          </p>
          <pre className="csv-example" aria-label="Exemplo de CSV">
            <code>{`date,ticker,name,pricebuy,shares,type
2024-01-10,SXR8.DE,iShares Core S&P 500,60,5,buy
2024-11-01,SXR8.DE,iShares Core S&P 500,75,2,sell`}</code>
          </pre>
          <ul className="import-help">
            <li>
              <code>date</code>: data no formato AAAA-MM-DD.
            </li>
            <li>
              <code>ticker</code>: símbolo do ativo no Yahoo Finance.
            </li>
            <li>
              <code>pricebuy</code>: preço por unidade na moeda da carteira,
              também nas vendas.
            </li>
            <li>
              <code>shares</code>: quantidade positiva.
            </li>
            <li>
              <code>name</code> e <code>type</code> são opcionais. Usa{" "}
              <code>buy</code> para compras ou <code>sell</code> para vendas; se
              omitido, assume compra.
            </li>
          </ul>
          <p className="import-help">
            Separa as colunas por vírgulas ou ponto e vírgula. Usa ponto nos
            decimais ou coloca os valores com vírgula entre aspas. Máximo: 2 MB.
            As transações são acrescentadas à carteira selecionada; importar o
            mesmo ficheiro novamente duplica-as.
          </p>
          <div className="dialog-actions import-actions">
            <a
              className="button secondary"
              href="/modelo_site_ativos.csv"
              download
            >
              Descarregar modelo CSV
            </a>
            <button
              className="button primary"
              onClick={() => {
                setModal(null);
                fileRef.current?.click();
              }}
            >
              Escolher ficheiro CSV
            </button>
          </div>
        </Dialog>
      ) : null}
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
              <OrderAssetFields orders={orders} />
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
              <button className="button primary" disabled={saveState === "saving"} type="submit">
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
              <button className="button primary" disabled={saveState === "saving"}>Criar carteira</button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </WorkspaceShell>
  );
}
const colors = [
  "#2563eb",
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
  trend,
}: {
  label: string;
  value: string;
  detail?: string;
  featured?: boolean;
  trend?: number | null;
}) {
  return (
    <section className={`metric ${featured ? "featured" : ""}`}>
      <div className="metric-label">
        {label}
        <Icon name={featured ? "wallet" : "trend"} />
      </div>
      <strong
        className={trend == null ? "" : trend >= 0 ? "positive" : "negative"}
      >
        {value}
      </strong>
      {detail ? <small>{detail}</small> : null}
    </section>
  );
}
