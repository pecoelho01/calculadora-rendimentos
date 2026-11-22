"use client";

import { usePortfoliosContext } from "./portfolios-provider";

const saveStatusLabels = {
  saving: "A guardar…",
  error: "Erro ao guardar ou carregar",
  saved: "Guardado na conta",
};

/** Save status and account data actions; only shown in account mode. */
export function AccountStorageBar() {
  const {
    identity,
    saveState,
    hasAccountSnapshot,
    reloadAccount,
    migrateLocal,
  } = usePortfoliosContext();

  if (!identity) return null;

  const saving = saveState === "saving";

  return (
    <div
      className={`account-storage account-storage-${saveState} no-print`}
      aria-busy={saving}
    >
      <span aria-live="polite">{saveStatusLabels[saveState]}</span>
      <button
        className="button secondary"
        disabled={saving}
        onClick={() => void reloadAccount()}
      >
        Recarregar dados da conta
      </button>
      <button
        className="button secondary"
        disabled={saving || !hasAccountSnapshot}
        onClick={() => void migrateLocal()}
      >
        Copiar carteiras locais para a conta
      </button>
    </div>
  );
}
