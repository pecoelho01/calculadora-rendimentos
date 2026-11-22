"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Portfolio, Order } from "@/lib/types";
import { validateOrder, validatePortfolio } from "@/lib/validation";
import { parseCsvDraft, exportCsv, type CsvDraftOrder } from "@/lib/csv/csv";
import { decodeStorage, encodeStorage } from "@/lib/storage";
import { demoOrders } from "@/lib/portfolio/demo";
import {
  createAssetCountryCache,
  type AssetCountryCache,
} from "@/app/(workspace)/carteira/[id]/_charts/use-asset-countries";
import { usePortfolioStorage } from "./use-portfolio-storage";
import {
  useWorkspaceSession,
  type WorkspaceSession,
} from "./session/session-gate";
import {
  portfolioPath,
  workspaceViewFromPathname,
  type PortfolioSection,
} from "./workspace-routes";

export type PortfolioModal = "order" | "portfolio" | "import" | "rename" | null;

type SectionSearches = Record<PortfolioSection, string>;

type CsvReview = {
  portfolio: Portfolio;
  filename: string;
  drafts: CsvDraftOrder[];
};

type PortfoliosContextValue = Omit<
  ReturnType<typeof usePortfolioStorage>,
  "reloadAccount"
> &
  WorkspaceSession & {
    sectionSearches: SectionSearches;
    rememberSectionSearch: (section: PortfolioSection, value: string) => void;
    clearSectionSearches: () => void;
    lastPortfolioSection: PortfolioSection;
    rememberPortfolioSection: (section: PortfolioSection) => void;
    allocationView: "assets" | "geography";
    setAllocationView: (view: "assets" | "geography") => void;
    refresh: number;
    requestRefresh: () => void;
    assetCountryCache: AssetCountryCache;
    modal: PortfolioModal;
    csvReview: CsvReview | null;
    renameId: string | null;
    formError: string;
    openModal: (value: PortfolioModal) => void;
    closeModal: () => void;
    startRename: (id: string) => void;
    importCsvFile: (file: File | undefined) => Promise<void>;
    restoreBackupFile: (file: File | undefined) => Promise<void>;
    confirmCsvImport: (imported: Order[]) => Promise<void>;
    cancelCsvReview: () => void;
    addOrder: (
      event: FormEvent<HTMLFormElement>,
      target: Portfolio | undefined,
    ) => Promise<void>;
    renamePortfolio: (event: FormEvent<HTMLFormElement>) => Promise<void>;
    addPortfolio: (event: FormEvent<HTMLFormElement>) => Promise<void>;
    deleteOrder: (target: Portfolio | undefined, id: string) => Promise<void>;
    loadDemo: () => void;
    reloadAccount: () => Promise<boolean>;
    exportBackup: () => void;
    exportOriginalStorage: () => void;
    exportTransactionsCsv: (orders: Order[]) => void;
  };

const PortfoliosContext = createContext<PortfoliosContextValue | null>(null);

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads the search typed in the current section from the URL on first load. */
function initialSectionSearches(pathname: string): SectionSearches {
  const searches: SectionSearches = {
    overview: "",
    positions: "",
    transactions: "",
  };
  if (typeof window === "undefined") return searches;

  const view = workspaceViewFromPathname(pathname);
  const search = new URLSearchParams(window.location.search).get("q") ?? "";
  if (view === "overview" || view === "positions" || view === "transactions")
    searches[view] = search;

  return searches;
}

function useSectionSearches() {
  const pathname = usePathname();
  const [sectionSearches, setSectionSearches] = useState<SectionSearches>(() =>
    initialSectionSearches(pathname),
  );
  // Lets "Voltar às carteiras" return to the section that was open.
  const [lastPortfolioSection, rememberPortfolioSection] =
    useState<PortfolioSection>("overview");

  function rememberSectionSearch(section: PortfolioSection, value: string) {
    setSectionSearches((current) => ({ ...current, [section]: value }));
  }

  function clearSectionSearches() {
    setSectionSearches({ overview: "", positions: "", transactions: "" });
  }

  return {
    sectionSearches,
    rememberSectionSearch,
    clearSectionSearches,
    lastPortfolioSection,
    rememberPortfolioSection,
  };
}

export function PortfoliosProvider({ children }: { children: ReactNode }) {
  const session = useWorkspaceSession();
  const portfoliosState = usePortfolioStorage(session.identity);
  const router = useRouter();
  const sectionSearchState = useSectionSearches();
  const [allocationView, setAllocationView] = useState<"assets" | "geography">(
    "assets",
  );
  const [refresh, setRefresh] = useState(0);
  const [assetCountryCache] = useState<AssetCountryCache>(
    createAssetCountryCache,
  );
  const {
    modal,
    renameId,
    formError,
    openModal,
    closeModal,
    startRename,
    setModal,
    setFormError,
  } = usePortfolioModalState(portfoliosState);
  const formActions = usePortfolioFormActions({
    portfolios: portfoliosState.portfolios,
    renameId,
    persist: portfoliosState.persist,
    setModal,
    setFormError,
    router,
  });
  const orderActions = usePortfolioOrderActions({
    updatePortfolio: portfoliosState.updatePortfolio,
    notify: portfoliosState.notify,
    setModal,
    setFormError,
  });
  const csvActions = usePortfolioCsvActions({
    portfoliosState,
    setModal,
    router,
  });
  const workspaceActions = usePortfolioWorkspaceActions({
    portfoliosState,
    setModal,
    clearSectionSearches: sectionSearchState.clearSectionSearches,
    router,
  });
  const exportActions = usePortfolioExportActions(portfoliosState);

  const value: PortfoliosContextValue = {
    ...portfoliosState,
    ...session,
    ...sectionSearchState,
    allocationView,
    setAllocationView,
    refresh,
    assetCountryCache,
    requestRefresh() {
      setRefresh((current) => current + 1);
    },
    modal,
    renameId,
    formError,
    openModal,
    closeModal,
    startRename,
    ...csvActions,
    ...formActions,
    ...orderActions,
    ...workspaceActions,
    ...exportActions,
  };

  return (
    <PortfoliosContext.Provider value={value}>
      {children}
    </PortfoliosContext.Provider>
  );
}

type PortfolioState = ReturnType<typeof usePortfolioStorage>;
type ModalState = {
  setModal: (modal: PortfolioModal) => void;
  setFormError: (message: string) => void;
};

function usePortfolioModalState(state: PortfolioState) {
  const [modal, setModal] = useState<PortfolioModal>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  function openModal(value: PortfolioModal) {
    if (!state.ready || state.storageBroken !== null) return;
    setFormError("");
    setModal(value);
  }

  function closeModal() {
    setModal(null);
  }

  function startRename(id: string) {
    setRenameId(id);
    openModal("rename");
  }

  return {
    modal,
    renameId,
    formError,
    setModal,
    setRenameId,
    setFormError,
    openModal,
    closeModal,
    startRename,
  };
}

function usePortfolioFormActions({
  portfolios,
  renameId,
  persist,
  setModal,
  setFormError,
  router,
}: {
  portfolios: Portfolio[];
  renameId: string | null;
  persist: PortfolioState["persist"];
  setModal: ModalState["setModal"];
  setFormError: ModalState["setFormError"];
  router: ReturnType<typeof useRouter>;
}) {
  async function renamePortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = portfolios.find((item) => item.id === renameId);
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
          portfolios.map((item) => (item.id === target.id ? renamed : item)),
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

  async function addPortfolio(event: FormEvent<HTMLFormElement>) {
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
      if (await persist([...portfolios, next], next.id)) {
        setModal(null);
        router.push(portfolioPath(next.id));
      } else
        setFormError(
          "Não foi possível guardar. Fecha este diálogo e consulta o aviso na página antes de repetir a operação.",
        );
    } catch (error) {
      setFormError((error as Error).message);
    }
  }

  return { renamePortfolio, addPortfolio };
}

function usePortfolioOrderActions({
  updatePortfolio,
  notify,
  setModal,
  setFormError,
}: {
  updatePortfolio: PortfolioState["updatePortfolio"];
  notify: PortfolioState["notify"];
} & ModalState) {
  async function addOrder(
    event: FormEvent<HTMLFormElement>,
    target: Portfolio | undefined,
  ) {
    event.preventDefault();
    if (!target) return;
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget));
      const order = validateOrder(raw);
      if (
        await updatePortfolio({ ...target, orders: [...target.orders, order] })
      )
        setModal(null);
      else
        setFormError(
          "Não foi possível guardar. Fecha este diálogo e consulta o aviso na página antes de repetir a operação.",
        );
    } catch (error) {
      setFormError((error as Error).message);
    }
  }

  async function deleteOrder(target: Portfolio | undefined, id: string) {
    if (!target || !window.confirm("Remover esta transação?")) return;
    try {
      await updatePortfolio({
        ...target,
        orders: target.orders.filter((order) => order.id !== id),
      });
    } catch (error) {
      notify(`Não foi possível remover: ${(error as Error).message}`);
    }
  }

  return { addOrder, deleteOrder };
}

function usePortfolioCsvActions({
  portfoliosState,
  setModal,
  router,
}: {
  portfoliosState: PortfolioState;
  setModal: ModalState["setModal"];
  router: ReturnType<typeof useRouter>;
}) {
  const { portfolio, portfolios, persist, isWritePending, notify } =
    portfoliosState;
  const [csvReview, setCsvReview] = useState<CsvReview | null>(null);
  const csvReadRequest = useRef(0);

  useEffect(() => {
    return () => {
      // Invalidate file reads that finish after this workspace has unmounted.
      csvReadRequest.current += 1;
    };
  }, []);

  async function readImportFile(file: File | undefined, backup: boolean) {
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
          if (await persist(next, next[0].id))
            router.push(portfolioPath(next[0].id));
        return;
      }
      const drafts = parseCsvDraft(text);
      if (destination) {
        setModal(null);
        setCsvReview({ portfolio: destination, filename: file.name, drafts });
      }
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function confirmCsvImport(imported: Order[]) {
    if (!csvReview) return;
    const destination = portfolios.find(
      (item) => item.id === csvReview.portfolio.id,
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
        portfolios.map((item) => (item.id === next.id ? next : item)),
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

  function cancelCsvReview() {
    setCsvReview(null);
  }

  return {
    csvReview,
    importCsvFile: (file: File | undefined) => readImportFile(file, false),
    restoreBackupFile: (file: File | undefined) => readImportFile(file, true),
    confirmCsvImport,
    cancelCsvReview,
  };
}

function usePortfolioWorkspaceActions({
  portfoliosState,
  setModal,
  clearSectionSearches,
  router,
}: {
  portfoliosState: PortfolioState;
  setModal: ModalState["setModal"];
  clearSectionSearches: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const { portfolios, persist, notify, reloadAccount } = portfoliosState;

  async function reloadWorkspaceAccount() {
    if (!(await reloadAccount())) return false;
    setModal(null);
    // Reloaded data may no longer match the previous searches.
    clearSectionSearches();
    window.history.replaceState(null, "", window.location.pathname);
    return true;
  }

  async function loadDemo() {
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
    if (await persist([...portfolios, demoPortfolio], demoPortfolio.id))
      router.push(portfolioPath(demoPortfolio.id));
  }

  return { reloadAccount: reloadWorkspaceAccount, loadDemo };
}

function usePortfolioExportActions(state: PortfolioState) {
  function exportBackup() {
    download(
      encodeStorage(state.portfolios),
      "carteiras.json",
      "application/json",
    );
  }

  function exportOriginalStorage() {
    if (state.storageBroken === null) return;
    download(state.storageBroken, "carteiras-recuperacao.txt", "text/plain");
  }

  function exportTransactionsCsv(orders: Order[]) {
    download(exportCsv(orders), "transacoes.csv", "text/csv");
  }

  return { exportBackup, exportOriginalStorage, exportTransactionsCsv };
}

export function usePortfoliosContext() {
  const context = useContext(PortfoliosContext);
  if (!context) {
    throw new Error(
      "usePortfoliosContext tem de ser usado dentro de PortfoliosProvider.",
    );
  }
  return context;
}
