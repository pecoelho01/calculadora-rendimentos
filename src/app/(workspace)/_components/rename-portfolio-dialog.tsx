"use client";

import { Dialog } from "@/components/dialog";
import { usePortfoliosContext } from "./portfolios-provider";

export function RenamePortfolioDialog() {
  const {
    modal,
    renameId,
    portfolios,
    formError,
    saveState,
    closeModal,
    renamePortfolio,
  } = usePortfoliosContext();

  if (modal !== "rename") return null;

  const renamePortfolioName = portfolios.find(
    (item) => item.id === renameId,
  )?.name;
  const saving = saveState === "saving";

  return (
    <Dialog
      title="Renomear carteira"
      onClose={closeModal}
    >
      <form onSubmit={renamePortfolio}>
        <label>
          Nome da carteira
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={renamePortfolioName}
          />
        </label>
        {formError ? (
          <p
            className="form-error"
            role="alert"
          >
            {formError}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={closeModal}
          >
            Cancelar
          </button>
          <button
            className="button primary"
            disabled={saving}
            type="submit"
          >
            Guardar nome
          </button>
        </div>
      </form>
    </Dialog>
  );
}
