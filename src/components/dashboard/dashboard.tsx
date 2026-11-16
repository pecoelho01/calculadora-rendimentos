"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Portfolio, Order } from "@/lib/types";
import { calculatePortfolio } from "@/lib/portfolio/portfolio";
import { validateOrder, validatePortfolio } from "@/lib/validation";
import { parseCsvDraft, exportCsv, type CsvDraftOrder } from "@/lib/csv/csv";
import { CsvImportReview } from "../csv/csv-import-review";
import { decodeStorage, encodeStorage } from "@/lib/storage";
import { demoOrders } from "@/lib/portfolio/demo";
import { PerformanceChart } from "../charts/performance-chart";
import { TransactionsTable } from "../tables/transactions-table";
import { PositionsTable } from "../tables/positions-table";
import { AllocationDonut } from "../charts/allocation-donut";
import { GeographicChart } from "../charts/geographic-chart";
import { useGeography } from "../charts/use-geography";
import { Icon } from "../shared/icon";
import { ThemeControl } from "../shared/theme-control";
import { WorkspaceShell } from "./workspace-shell";
import type { AccountIdentity } from "../account/account-gateway";
import { AccountSettings } from "./account-settings";
import { PortfolioNotes } from "./portfolio-notes";
import { PortfolioDialogs, type PortfolioModal } from "./portfolio-dialogs";
import { useMarketData } from "./use-market-data";
import { usePortfolios } from "./use-portfolios";

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const formatPercent = (value: number | null) =>
  value === null
    ? "—"
    : `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;
type Tab = "overview" | "positions" | "transactions" | "notes";
const primaryNavigation = [
  { key: "overview", icon: "overview", text: "Visão geral" },
  { key: "positions", icon: "positions", text: "Posições" },
  { key: "transactions", icon: "transactions", text: "Transações" },
] as const;
const tabDetails: Record<Tab, { title: string; description: string }> = {
  overview: {
    title: "Visão geral",
    description: "O essencial da tua carteira, apresentado com clareza.",
  },
  positions: {
    title: "Posições",
    description: "As tuas posições e o seu desempenho.",
  },
  transactions: {
    title: "Transações",
    description: "O histórico de compras e vendas da tua carteira.",
  },
  notes: {
    title: "Conhece os teus números",
    description:
      "Compreende os cálculos e a forma como tratamos os teus dados.",
  },
};
const saveStatusLabels = {
  saving: "A guardar…",
  error: "Erro ao guardar ou carregar",
  saved: "Guardado na conta",
};

const EMPTY_ORDERS: Order[] = [];

function PortfolioNavigationRow({
  portfolio,
  selected,
  disabled,
  onSelect,
  onRename,
}: {
  portfolio: Portfolio;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
}) {
  function handleContextMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    onRename(portfolio.id);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const requestsRename =
      event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!requestsRename) return;
    event.preventDefault();
    onRename(portfolio.id);
  }

  return (
    <div className={`portfolio-row ${selected ? "selected" : ""}`}>
      <button
        onClick={() => onSelect(portfolio.id)}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        className={`portfolio-link ${selected ? "selected" : ""}`}
        aria-current={selected ? "true" : undefined}
        title="Botão direito para renomear"
      >
        <i className="portfolio-dot" />
        <span className="portfolio-identity">
          <span className="portfolio-name">{portfolio.name}</span>
          <small>{portfolio.currency}</small>
        </span>
      </button>
      <button
        className="portfolio-rename icon-button"
        aria-label={`Renomear carteira ${portfolio.name}`}
        disabled={disabled}
        onClick={() => onRename(portfolio.id)}
      >
        <Icon name="edit" />
      </button>
    </div>
  );
}

export function Dashboard({
  identity = null,
  accountControls,
  sidebarAccountControls,
  accountFeedback,
  accountPage = false,
  children,
}: {
  identity?: AccountIdentity | null;
  accountControls?: React.ReactNode;
  sidebarAccountControls?: React.ReactNode;
  accountFeedback?: React.ReactNode;
  accountPage?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const {
    portfolios,
    portfolio,
    ready,
    storageBroken,
    message,
    saveState,
    hasAccountSnapshot,
    selectPortfolio: selectStoredPortfolio,
    notify,
    persist,
    updatePortfolio,
    reloadAccount: reloadPortfolios,
    migrateLocal,
    recoverStorage,
    removePortfolio,
    isWritePending,
  } = usePortfolios(identity);
  const [tab, setTab] = useState<Tab>("overview");
  function navigateToTab(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (accountPage) router.push("/");
  }
  const [allocationView, setAllocationView] = useState<"assets" | "geography">(
    "assets",
  );
  const [modal, setModal] = useState<PortfolioModal>(null);
  const [csvReview, setCsvReview] = useState<{
    portfolio: Portfolio;
    filename: string;
    drafts: CsvDraftOrder[];
  } | null>(null);
  const csvReadRequest = useRef(0);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [searches, setSearches] = useState<Record<Tab, string>>({
    overview: "",
    positions: "",
    transactions: "",
    notes: "",
  });
  const search = searches[tab];
  const pageDetails = tabDetails[tab];
  const navigationLabel =
    primaryNavigation.find((item) => item.key === tab)?.text ??
    "Notas explicativas";
  const breadcrumbLabel = accountPage ? "Definições da conta" : navigationLabel;
  const [refresh, setRefresh] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      // Invalidate file reads that finish after this workspace has unmounted.
      csvReadRequest.current += 1;
    };
  }, []);

  const orders = portfolio?.orders ?? EMPTY_ORDERS;
  const {
    market,
    loading,
    error: marketError,
  } = useMarketData({
    portfolioId: portfolio?.id,
    orders,
    refresh,
  });
  const currency = portfolio?.currency ?? "EUR";
  const summary = useMemo(
    () => calculatePortfolio(orders, market, currency),
    [orders, market, currency],
  );
  const openTickers = summary.positions
    .filter((position) => position.shares > 0)
    .map((position) => position.ticker)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
  const geography = useGeography(
    openTickers,
    ready && tab === "overview",
    refresh,
  );
  const geographicMarket = Object.fromEntries(
    Object.entries(market).map(([ticker, asset]) => [
      ticker,
      { ...asset, geography: geography.data[ticker] ?? null },
    ]),
  );
  const money = (value: number | null) =>
    value === null
      ? "—"
      : value.toLocaleString("pt-PT", {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        });

  async function reloadAccount() {
    if (!(await reloadPortfolios())) return;
    setModal(null);
    setSearches({ overview: "", positions: "", transactions: "", notes: "" });
  }

  function openModal(value: PortfolioModal) {
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
      if (await updatePortfolio({ ...portfolio, orders: [...orders, order] }))
        setModal(null);
      else
        setFormError(
          "Não foi possível guardar. Fecha este diálogo e consulta o aviso na página antes de repetir a operação.",
        );
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
    const target = portfolios.find((portfolio) => portfolio.id === renameId);
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
      if (
        await persist(
          portfolios.map((portfolio) =>
            portfolio.id === target.id ? renamed : portfolio,
          ),
        )
      ) {
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
      else
        setFormError(
          "Não foi possível guardar. Fecha este diálogo e consulta o aviso na página antes de repetir a operação.",
        );
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function importFile(file: File | undefined, backup = false) {
    if (!file || (!backup && !portfolio) || isWritePending()) return;
    const destination = portfolio;
    const request = ++csvReadRequest.current;
    try {
      if (file.size > (backup ? 10_000_000 : 2_000_000))
        throw new Error(`O ficheiro excede ${backup ? 10 : 2} MB.`);
      const text = await file.text();
      if (request !== csvReadRequest.current) return;
      if (backup) {
        const next = decodeStorage(text);
        if (
          window.confirm(
            "Substituir todas as carteiras pelas da cópia de segurança?",
          )
        )
          await persist(next, next[0].id);
      } else {
        const drafts = parseCsvDraft(text);
        if (destination) {
          setModal(null);
          setCsvReview({ portfolio: destination, filename: file.name, drafts });
        }
      }
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function confirmCsvImport(imported: Order[]) {
    if (!csvReview) return;
    const destination = portfolios.find(
      (portfolio) => portfolio.id === csvReview.portfolio.id,
    );
    if (
      !destination ||
      JSON.stringify(destination) !== JSON.stringify(csvReview.portfolio)
    ) {
      throw new Error(
        "A carteira de destino foi alterada. Cancela esta revisão e importa o ficheiro novamente para rever os dados atualizados.",
      );
    }
    const next = validatePortfolio({
      ...destination,
      orders: [...destination.orders, ...imported],
    });
    if (
      !(await persist(
        portfolios.map((portfolio) =>
          portfolio.id === next.id ? next : portfolio,
        ),
        next.id,
      ))
    ) {
      throw new Error(
        "Não foi possível guardar a importação. As edições foram mantidas. Cancela a revisão e consulta o aviso na página antes de tentar novamente.",
      );
    }
    setCsvReview(null);
    notify(
      `${imported.length} ${imported.length === 1 ? "transação importada" : "transações importadas"}. Confirma a moeda dos ativos antes de analisar os totais.`,
    );
  }

  async function deleteOrder(id: string) {
    if (!portfolio || !window.confirm("Remover esta transação?")) return;
    try {
      await updatePortfolio({
        ...portfolio,
        orders: orders.filter((order) => order.id !== id),
      });
    } catch (e) {
      notify(`Não foi possível remover: ${(e as Error).message}`);
    }
  }

  function loadDemo() {
    if (portfolios.length >= 30) {
      notify("Máximo de 30 carteiras.");
      return;
    }
    const demoPortfolio: Portfolio = {
      id: crypto.randomUUID(),
      name: "Carteira de exemplo",
      currency: "USD",
      orders: demoOrders(),
    };
    void persist([...portfolios, demoPortfolio], demoPortfolio.id);
  }

  function closeDataMenuOnEscape(
    event: React.KeyboardEvent<HTMLDetailsElement>,
  ) {
    if (event.key !== "Escape") return;
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }

  function closeDataMenuOnAction(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, a")) {
      event.currentTarget.closest("details")?.removeAttribute("open");
    }
  }

  function selectPortfolio(id: string) {
    selectStoredPortfolio(id);
    if (accountPage) router.push("/");
    setSearches({ overview: "", positions: "", transactions: "", notes: "" });
  }

  function chooseCsvFile() {
    setModal(null);
    fileRef.current?.click();
  }

  function importDroppedCsv(file: File | undefined) {
    setModal(null);
    void importFile(file);
  }

  function importCsvFile(event: React.ChangeEvent<HTMLInputElement>) {
    void importFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function restoreBackupFile(event: React.ChangeEvent<HTMLInputElement>) {
    void importFile(event.target.files?.[0], true);
    event.target.value = "";
  }

  if (!ready && !accountPage)
    return (
      <main
        className="boot"
        aria-busy="true"
      >
        {accountControls}A abrir a tua carteira…
      </main>
    );
  if (storageBroken !== null && !accountPage)
    return (
      <main className="boot">
        {accountControls ?? (
          <Link
            className="button secondary"
            href="/conta"
          >
            Aceder à conta
          </Link>
        )}
        <h1>Recuperar carteiras</h1>
        <p role="alert">{message}</p>
        <button
          onClick={() =>
            download(storageBroken, "carteiras-recuperacao.txt", "text/plain")
          }
        >
          Exportar dados originais
        </button>
        <button onClick={() => void recoverStorage()}>
          Repor armazenamento
        </button>
      </main>
    );
  const dataMenu = (
    <details
      className="data-actions"
      onKeyDown={closeDataMenuOnEscape}
    >
      <summary className="button secondary">
        <span className="visually-hidden">Dados e exportação</span>
        <span aria-hidden="true">•••</span>
      </summary>
      <div
        className="data-actions-panel"
        onClick={closeDataMenuOnAction}
      >
        <span className="action-group-label">Carteira atual</span>
        <button
          className="mobile-menu-action"
          disabled={loading || !orders.length}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <Icon name="refresh" /> Atualizar preços
        </button>
        <button
          disabled={!portfolio || saveState === "saving"}
          onClick={() => openModal("import")}
        >
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
        <a
          href="/modelo_site_ativos.csv"
          download
        >
          <Icon name="download" /> Modelo de importação CSV
        </a>
        <button
          className="delete-button"
          disabled={!portfolio}
          onClick={removePortfolio}
        >
          Eliminar carteira
        </button>
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
  );
  return (
    <WorkspaceShell
      portfolioName={portfolio?.name ?? "As tuas carteiras"}
      currency={portfolio?.currency}
      mobileNavigation={
        <nav
          className="mobile-navigation no-print"
          aria-label="Navegação móvel"
        >
          {primaryNavigation.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={
                !accountPage && tab === item.key ? "page" : undefined
              }
              onClick={() => {
                navigateToTab(item.key);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
            >
              <Icon name={item.icon} />
              <span>{item.text}</span>
            </button>
          ))}
          <Link
            href="/conta"
            aria-current={accountPage ? "page" : undefined}
          >
            <Icon name="shield" />
            <span>Conta</span>
          </Link>
        </nav>
      }
      sidebar={
        <>
          <span className="workspace-label">ESPAÇO PESSOAL</span>
          <nav aria-label="Navegação principal">
            {(
              [
                ...primaryNavigation,
                { key: "notes", icon: "info", text: "Notas explicativas" },
              ] as const
            ).map((n) => (
              <button
                key={n.key}
                className={`nav-item ${n.key !== "notes" ? "sidebar-primary-link" : ""} ${!accountPage && tab === n.key ? "active" : ""}`}
                aria-label={n.text}
                title={n.text}
                aria-current={
                  !accountPage && tab === n.key ? "page" : undefined
                }
                onClick={() => navigateToTab(n.key)}
              >
                <Icon name={n.icon} />
                <span className="nav-label">{n.text}</span>
                {n.key === "positions" ? (
                  <small aria-hidden="true">
                    {
                      summary.positions.filter(
                        (position) => position.shares > 0,
                      ).length
                    }
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
            {portfolios.map((item) => (
              <PortfolioNavigationRow
                key={item.id}
                portfolio={item}
                selected={portfolio?.id === item.id}
                disabled={!ready || storageBroken !== null}
                onSelect={selectPortfolio}
                onRename={startRename}
              />
            ))}
          </div>
          <div className="sidebar-bottom">
            <div className="local-badge">
              <Icon name="shield" />
              <div>
                <strong>{identity ? "Modo conta" : "Modo local"}</strong>
              </div>
            </div>
            <Link
              className={`nav-item ${accountPage ? "active" : ""}`}
              href="/conta"
              aria-current={accountPage ? "page" : undefined}
            >
              <Icon name="shield" />
              <span className="nav-label">Definições da conta</span>
            </Link>
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
      <div className={`main-area view-${accountPage ? "account" : tab}`}>
        <header className="topbar no-print">
          <div className="breadcrumb">
            Espaço pessoal <span>/</span> <strong>{breadcrumbLabel}</strong>
          </div>
          <div className="topbar-right">
            <span className="market-source">
              <Icon name="shield" />
              Mercado via Yahoo Finance
            </span>
            {!accountPage ? (
              <>
                {dataMenu}
                <ThemeControl />
              </>
            ) : null}
          </div>
        </header>
        <main className="content">
          {accountPage ? (
            <AccountSettings
              accountControls={accountControls}
              accountFeedback={accountFeedback}
              isAccountMode={identity !== null}
              message={message}
              saveState={saveState}
              canMigrate={hasAccountSnapshot && saveState !== "saving"}
              hasPortfolios={portfolios.length > 0}
              storageBroken={storageBroken !== null}
              onDismissMessage={() => notify("")}
              onReloadAccount={reloadAccount}
              onMigrateLocal={migrateLocal}
              onExportBackup={() =>
                download(
                  encodeStorage(portfolios),
                  "carteiras.json",
                  "application/json",
                )
              }
            >
              {children}
            </AccountSettings>
          ) : (
            <>
              {accountFeedback}
              {identity ? (
                <div
                  className={`account-storage account-storage-${saveState} no-print`}
                  aria-busy={saveState === "saving"}
                >
                  <span aria-live="polite">{saveStatusLabels[saveState]}</span>
                  <button
                    className="button secondary"
                    disabled={saveState === "saving"}
                    onClick={() => void reloadAccount()}
                  >
                    Recarregar dados da conta
                  </button>
                  <button
                    className="button secondary"
                    disabled={saveState === "saving" || !hasAccountSnapshot}
                    onClick={() => void migrateLocal()}
                  >
                    Copiar carteiras locais para a conta
                  </button>
                </div>
              ) : null}
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {tab === "notes"
                      ? "CENTRO DE AJUDA"
                      : "OS TEUS INVESTIMENTOS"}
                  </span>
                  <h1
                    aria-label={tab === "overview" ? "Visão Geral" : undefined}
                  >
                    {pageDetails.title}
                  </h1>
                  <p>{pageDetails.description}</p>
                </div>
                <div className="heading-actions no-print">
                  <button
                    className="button secondary import-csv-action"
                    disabled={!portfolio || saveState === "saving"}
                    onClick={() => openModal("import")}
                  >
                    <Icon name="upload" /> Importar CSV
                  </button>

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
                onChange={importCsvFile}
              />
              <input
                ref={backupRef}
                type="file"
                accept=".json,application/json"
                className="visually-hidden"
                aria-label="Restaurar cópia de segurança"
                onChange={restoreBackupFile}
              />
              {identity && hasAccountSnapshot && !portfolios.length ? (
                <div className="notice account-empty-notice">
                  <span>A tua conta ainda não tem carteiras.</span>
                  <button
                    className="button secondary"
                    onClick={() => openModal("portfolio")}
                  >
                    Criar a primeira carteira
                  </button>
                </div>
              ) : null}
              {message ? (
                <div
                  className="notice"
                  role="status"
                >
                  {message}
                  <button
                    aria-label="Fechar aviso"
                    onClick={() => notify("")}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ) : null}
              {marketError ? (
                <div
                  className="notice"
                  role="alert"
                >
                  {marketError}
                </div>
              ) : null}
              {orders.length &&
              !loading &&
              (summary.value === null ||
                Object.values(market).some((a) => a.error)) ? (
                <div className="notice">
                  Algumas cotações estão em falta ou noutra moeda. Os totais que
                  dependem delas aparecem como «—». A carteira usa {currency},
                  sem conversão cambial.
                </div>
              ) : null}
              {tab === "notes" ? (
                <PortfolioNotes isAccountMode={identity !== null} />
              ) : (
                <>
                  <div
                    className={`portfolio-toolbar ${tab !== "overview" ? "portfolio-toolbar-list" : ""}`}
                  >
                    <div className="portfolio-context">
                      <label className="portfolio-selector no-print">
                        <Icon name="wallet" />
                        <span
                          className="portfolio-selection-label"
                          aria-hidden="true"
                        >
                          <strong>
                            {portfolio?.name ?? "As tuas carteiras"}
                          </strong>
                          <span> · {currency}</span>
                        </span>
                        <Icon name="chevron" />
                        <select
                          aria-label="Selecionar carteira"
                          value={portfolio?.id ?? ""}
                          disabled={!ready || !portfolios.length}
                          onChange={(event) =>
                            selectPortfolio(event.target.value)
                          }
                        >
                          {!portfolios.length ? (
                            <option value="">As tuas carteiras</option>
                          ) : (
                            portfolios.map((item) => (
                              <option
                                key={item.id}
                                value={item.id}
                              >
                                {item.name} · {item.currency}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      <span className="portfolio-print-context">
                        <strong>
                          {portfolio?.name ?? "As tuas carteiras"}
                        </strong>
                        <span className="currency-tag">Moeda: {currency}</span>
                      </span>
                    </div>
                    <button
                      className="text-button refresh-prices no-print"
                      aria-label={
                        loading ? "A obter cotações…" : "Atualizar preços"
                      }
                      disabled={loading || !orders.length}
                      onClick={() => setRefresh((n) => n + 1)}
                    >
                      <Icon name="refresh" />
                      <span className="refresh-label">
                        {loading ? "A obter cotações…" : "Atualizar preços"}
                      </span>
                    </button>
                  </div>
                  {tab === "positions" ? (
                    <div
                      className="summary-strip"
                      aria-label="Resumo das posições"
                    >
                      <Metric
                        label="Valor atual"
                        value={money(summary.value)}
                      />
                      <Metric
                        label="Posições abertas"
                        value={`${summary.positions.filter((position) => position.shares > 0).length} ativos`}
                      />
                      <Metric
                        label="Ganho não realizado"
                        value={money(summary.unrealized)}
                        trend={summary.unrealized}
                      />
                    </div>
                  ) : tab === "transactions" ? (
                    <div
                      className="summary-strip"
                      aria-label="Resumo das transações"
                    >
                      <Metric
                        label="Total de transações"
                        value={`${orders.length} operações`}
                      />
                      <Metric
                        label="Compras"
                        value={String(
                          orders.filter((order) => order.type === "buy").length,
                        )}
                      />
                      <Metric
                        label="Vendas"
                        value={String(
                          orders.filter((order) => order.type === "sell")
                            .length,
                        )}
                      />
                    </div>
                  ) : null}
                  {tab === "overview" ? (
                    <div className="metrics">
                      <Metric
                        label="Valor da carteira"
                        value={money(summary.value)}
                        featured
                        detail="Posições abertas · valor de mercado"
                      />
                      <Metric
                        label="Rentabilidade total"
                        value={formatPercent(summary.roi)}
                        detail={`${money(summary.gain)} de ganho total`}
                        trend={summary.gain}
                      />
                      <Metric
                        label="Ganho realizado"
                        value={money(summary.realized)}
                        detail="Em unidades vendidas"
                        trend={summary.realized}
                      />
                      <Metric
                        label="Compras acumuladas"
                        value={money(summary.invested)}
                        detail="Valor de todas as compras"
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
                      <section
                        className="panel allocation-card"
                        aria-label="Distribuição da carteira"
                      >
                        <div className="panel-heading">
                          <div>
                            <h2>A tua distribuição</h2>
                            <p className="panel-subtitle">
                              Por valor de mercado
                            </p>
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
                        </div>
                        <div className="allocation-content">
                          <div
                            className="allocation asset-allocation"
                            hidden={allocationView !== "assets"}
                          >
                            {summary.value !== null && summary.value > 0 ? (
                              <AllocationDonut
                                slices={summary.positions
                                  .filter((position) => position.shares > 0)
                                  .map((position, index) => ({
                                    id: position.ticker,
                                    label: position.ticker,
                                    percent:
                                      ((position.value ?? 0) / summary.value!) *
                                      100,
                                    color: colors[index % colors.length],
                                  }))}
                                label="Alocação da carteira por valor de mercado"
                                centerLabel="Ativos"
                                centerValue={String(
                                  summary.positions.filter(
                                    (position) => position.shares > 0,
                                  ).length,
                                )}
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
                          <div
                            className="geographic-view"
                            hidden={allocationView !== "geography"}
                          >
                            <GeographicChart
                              positions={summary.positions}
                              market={geographicMarket}
                              loading={loading || geography.loading}
                            />
                          </div>
                        </div>
                        <div className="allocation-footer">
                          <span>
                            {
                              summary.positions.filter(
                                (position) => position.shares > 0,
                              ).length
                            }
                            {" ativos na carteira"}
                          </span>
                          <button
                            className="text-button"
                            onClick={() => navigateToTab("positions")}
                          >
                            Ver posições <span aria-hidden="true">→</span>
                          </button>
                        </div>
                      </section>
                    </div>
                  ) : null}
                  <section
                    className={`panel holdings ${tab !== "overview" ? "holdings-list" : ""}`}
                  >
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
                            onChange={(e) =>
                              setSearches((current) => ({
                                ...current,
                                [tab]: e.target.value,
                              }))
                            }
                          />
                        </label>
                        {tab === "overview" ? (
                          <button
                            className="text-button overview-all"
                            onClick={() => navigateToTab("positions")}
                          >
                            Ver todas <span aria-hidden="true">→</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
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
                            onClick={() =>
                              openModal(portfolio ? "order" : "portfolio")
                            }
                          >
                            <Icon name="plus" />{" "}
                            {portfolio
                              ? "Adicionar transação"
                              : "Criar carteira"}
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
                            onClearSearch={() =>
                              setSearches((current) => ({
                                ...current,
                                [tab]: "",
                              }))
                            }
                            onDelete={deleteOrder}
                          />
                        ) : (
                          <PositionsTable
                            compact={tab === "overview"}
                            key={portfolio?.id}
                            positions={summary.positions}
                            market={market}
                            currency={currency}
                            loading={loading}
                            search={search}
                            onClearSearch={() =>
                              setSearches((current) => ({
                                ...current,
                                [tab]: "",
                              }))
                            }
                          />
                        )}
                      </div>
                    )}
                    <div className="table-footer">
                      <span>
                        Valores em {currency} · Cotações sujeitas a atraso
                        {tab === "transactions" ? (
                          <span className="transaction-gain-note">
                            Compras: ganho total do lote (realizado + não
                            realizado), % sobre o custo original. Vendas: ganho
                            realizado, % sobre o custo vendido. Os ganhos das
                            vendas já estão incluídos nas compras; não somar as
                            duas vistas.
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </section>
                  <div className="bottom-actions no-print">
                    <span>
                      <Icon name="download" /> Exporta uma cópia regularmente.
                    </span>
                    <button
                      className="bottom-delete"
                      onClick={removePortfolio}
                    >
                      Eliminar carteira
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {!accountPage ? (
        <button
          className="mobile-trade-action no-print"
          aria-label="Nova transação"
          title="Nova transação"
          disabled={!portfolio || saveState === "saving"}
          onClick={() => openModal("order")}
        >
          <Icon name="plus" />
        </button>
      ) : null}
      {csvReview ? (
        <CsvImportReview
          key={csvReview.drafts[0].id}
          portfolio={csvReview.portfolio}
          filename={csvReview.filename}
          drafts={csvReview.drafts}
          onClose={() => setCsvReview(null)}
          onConfirm={confirmCsvImport}
        />
      ) : null}
      <PortfolioDialogs
        modal={modal}
        portfolioName={portfolio?.name}
        renamePortfolioName={
          portfolios.find((item) => item.id === renameId)?.name
        }
        orders={orders}
        currency={currency}
        formError={formError}
        saving={saveState === "saving"}
        onClose={() => setModal(null)}
        onRenamePortfolio={renamePortfolio}
        onAddPortfolio={addPortfolio}
        onAddOrder={addOrder}
        onChooseCsv={chooseCsvFile}
        onImportCsv={importDroppedCsv}
      />
    </WorkspaceShell>
  );
}
const colors = [
  "#0f9272",
  "#5979d9",
  "#9c8bdc",
  "#e9a968",
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
