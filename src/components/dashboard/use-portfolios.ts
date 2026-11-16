"use client";

import { useEffect, useRef, useState } from "react";
import type { Portfolio } from "@/lib/types";
import { validateOrders } from "@/lib/validation";
import { decodeStorage, encodeStorage, STORAGE_KEY } from "@/lib/storage";
import {
  buildAccountChanges,
  validateAccountSnapshot,
  type AccountSnapshot,
} from "@/lib/account/account";
import type { AccountIdentity } from "../account/account-gateway";

export type PortfolioSaveState = "saving" | "saved" | "error";

const createInitialPortfolio = (): Portfolio => ({
  id: crypto.randomUUID(),
  name: "A minha carteira",
  currency: "EUR",
  orders: [],
});

export function usePortfolios(identity: AccountIdentity | null) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [ready, setReady] = useState(false);
  const [storageBroken, setStorageBroken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const storageSnapshotRef = useRef<string | null>(null);
  const [accountSnapshot, setAccountSnapshot] =
    useState<AccountSnapshot | null>(null);
  const [saveState, setSaveState] = useState<PortfolioSaveState>("saved");
  const [accountConflict, setAccountConflict] = useState(false);
  const writePendingRef = useRef(false);
  const mountedRef = useRef(true);
  const requestsRef = useRef<AbortController | null>(null);
  useEffect(function trackWorkspaceLifetime() {
    mountedRef.current = true;
    const controller = new AbortController();
    requestsRef.current = controller;

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, []);

  async function accountRequest(body?: unknown) {
    const response = await fetch("/api/account", {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${identity?.accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: requestsRef.current?.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        throw new Error(
          "Esta carteira foi alterada noutro dispositivo. Exporta uma cópia se necessário e recarrega os dados da conta antes de repetir a operação.",
        );
      }
      if (response.status === 401)
        throw new Error(
          "A sessão expirou. Inicia sessão novamente para guardar na conta.",
        );
      if (response.status === 429)
        throw new Error(
          "Demasiadas gravações. Aguarda um minuto e recarrega os dados da conta antes de tentar novamente.",
        );
      if (response.status === 400)
        throw new Error(
          "Dados inválidos ou limites da conta excedidos. Nenhuma alteração foi guardada. Verifica os dados e os limites documentados antes de repetir.",
        );
      throw new Error(
        "Não foi possível aceder às carteiras da conta. Tenta novamente. Os dados locais continuam disponíveis.",
      );
    }
    return validateAccountSnapshot(await response.json());
  }

  function acceptAccount(snapshot: AccountSnapshot, id?: string) {
    setAccountSnapshot(snapshot);
    const loaded = snapshot.portfolios.map((record) => record.portfolio);
    setPortfolios(loaded);
    setSelectedPortfolioId(
      loaded.find((portfolio) => portfolio.id === id)?.id ??
        loaded[0]?.id ??
        "",
    );
    setAccountConflict(false);
    setSaveState("saved");
  }

  async function reloadAccount() {
    if (writePendingRef.current) return false;
    writePendingRef.current = true;
    setSaveState("saving");
    try {
      const snapshot = await accountRequest();
      if (!mountedRef.current) return false;
      acceptAccount(snapshot, selectedPortfolioId);
      setMessage("");
      return true;
    } catch (error) {
      if (mountedRef.current) {
        setMessage((error as Error).message);
        setSaveState("error");
      }
      return false;
    } finally {
      writePendingRef.current = false;
    }
  }

  async function migrateLocal() {
    if (writePendingRef.current || !accountSnapshot) return;
    if (
      !window.confirm(
        "Copiar as carteiras deste navegador para a conta? Serão acrescentadas sem substituir carteiras existentes. Os dados locais serão mantidos. Uma cópia idêntica já importada não será duplicada.",
      )
    )
      return;
    writePendingRef.current = true;
    setSaveState("saving");
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw)
        throw new Error("Não existem carteiras guardadas neste navegador.");
      const localPortfolios = decodeStorage(raw);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(encodeStorage(localPortfolios)),
      );
      const migrationKey = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      if (!mountedRef.current) return;
      const snapshot = await accountRequest({
        changes: [],
        migration: { key: migrationKey, portfolios: localPortfolios },
      });
      if (!mountedRef.current) return;
      acceptAccount(snapshot, selectedPortfolioId);
      setMessage(
        "Carteiras locais copiadas para a conta. Uma cópia idêntica já importada não foi duplicada; os dados do navegador foram mantidos.",
      );
    } catch (error) {
      if (mountedRef.current) {
        setMessage((error as Error).message);
        setSaveState("error");
      }
    } finally {
      writePendingRef.current = false;
    }
  }

  useEffect(function loadWorkspace() {
    if (identity) {
      let cancelled = false;
      accountRequest()
        .then((snapshot) => {
          if (!cancelled) {
            acceptAccount(snapshot);
            setReady(true);
          }
        })
        .catch((error: Error) => {
          if (!cancelled) {
            setMessage(error.message);
            setSaveState("error");
            setReady(true);
          }
        });
      return () => {
        cancelled = true;
      };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      storageSnapshotRef.current = raw;
      const loaded = raw ? decodeStorage(raw) : [createInitialPortfolio()];
      // Hydration must read browser storage before showing the selected portfolio.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPortfolios(loaded);
      setSelectedPortfolioId(loaded[0].id);
    } catch {
      let original = "";
      try {
        original = localStorage.getItem(STORAGE_KEY) ?? "";
      } catch {
        /* Storage access can be disabled by the browser. */
      }
      // Browser storage is read only after hydration.
      setStorageBroken(original);
      setMessage(
        "Não foi possível ler o armazenamento. Exporta os dados originais antes de recuperar.",
      );
    }
    setReady(true);
    // The parent remounts this workspace when its mode or user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const portfolio =
    portfolios.find((item) => item.id === selectedPortfolioId) ?? portfolios[0];

  async function persist(
    next: Portfolio[],
    id = selectedPortfolioId,
    recoveryOriginal?: string,
  ): Promise<boolean> {
    if (!mountedRef.current || writePendingRef.current || !ready) return false;
    if (
      !identity &&
      storageBroken !== null &&
      recoveryOriginal !== storageBroken
    ) {
      setMessage(
        "Recupera o armazenamento local antes de alterar as carteiras.",
      );
      return false;
    }
    if (identity) {
      if (!accountSnapshot || accountConflict) {
        setMessage("Recarrega os dados da conta antes de guardar.");
        return false;
      }
      writePendingRef.current = true;
      setSaveState("saving");
      try {
        const snapshot = await accountRequest({
          changes: buildAccountChanges(accountSnapshot, next),
        });
        if (!mountedRef.current) return false;
        acceptAccount(snapshot, id);
        setMessage("");
        return true;
      } catch (error) {
        if (mountedRef.current) {
          setMessage((error as Error).message);
          setSaveState("error");
          setAccountConflict(true);
        }
        return false;
      } finally {
        writePendingRef.current = false;
      }
    }
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (recoveryOriginal !== undefined && current !== recoveryOriginal) {
        setMessage(
          "O armazenamento foi alterado noutro separador. Recarrega a página e verifica os dados antes de repor.",
        );
        return false;
      }
      if (current !== storageSnapshotRef.current) {
        if (current) {
          const latest = decodeStorage(current);
          setPortfolios(latest);
          setSelectedPortfolioId(latest[0].id);
        }
        storageSnapshotRef.current = current;
        setMessage(
          "Os dados foram alterados noutro separador. Carregámos a versão mais recente; repete a operação.",
        );
        return false;
      }
      const encoded = encodeStorage(next);
      localStorage.setItem(STORAGE_KEY, encoded);
      storageSnapshotRef.current = encoded;
      setPortfolios(next);
      setSelectedPortfolioId(id);
      setMessage("");
      return true;
    } catch {
      setMessage(
        "Não foi possível guardar neste navegador. Exporta uma cópia de segurança e verifica o espaço/permissões.",
      );
      return false;
    }
  }

  function updatePortfolio(next: Portfolio) {
    validateOrders(next.orders);
    return persist(
      portfolios.map((portfolio) =>
        portfolio.id === next.id ? next : portfolio,
      ),
    );
  }

  function removePortfolio() {
    if (
      !portfolio ||
      !window.confirm(
        `Eliminar a carteira «${portfolio.name}» e todas as suas transações?`,
      )
    )
      return;
    const next = portfolios.filter((item) => item.id !== portfolio.id);
    if (!next.length && !identity) next.push(createInitialPortfolio());
    void persist(next, next[0]?.id ?? "");
  }

  async function recoverStorage() {
    if (storageBroken === null) return;
    if (
      !window.confirm(
        "Repor o armazenamento? Guarda primeiro os dados originais.",
      )
    )
      return;

    const emptyPortfolio = createInitialPortfolio();
    const saved = await persist(
      [emptyPortfolio],
      emptyPortfolio.id,
      storageBroken,
    );
    if (saved) setStorageBroken(null);
  }

  function isWritePending() {
    return writePendingRef.current;
  }

  function notify(message: string) {
    setMessage(message);
  }

  return {
    portfolios,
    portfolio,
    ready,
    storageBroken,
    message,
    saveState,
    hasAccountSnapshot: accountSnapshot !== null,
    selectPortfolio: setSelectedPortfolioId,
    notify,
    persist,
    updatePortfolio,
    reloadAccount,
    migrateLocal,
    recoverStorage,
    removePortfolio,
    isWritePending,
  };
}
