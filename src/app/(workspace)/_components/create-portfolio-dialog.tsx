"use client";

import { Dialog } from "@/components/dialog";
import { usePortfoliosContext } from "./portfolios-provider";

export function CreatePortfolioDialog() {
  const { modal, formError, saveState, closeModal, addPortfolio } =
    usePortfoliosContext();

  if (modal !== "portfolio") return null;

  const saving = saveState === "saving";

  return (
    <Dialog
      title="Criar carteira"
      eyebrow="ORGANIZAÇÃO"
      onClose={closeModal}
    >
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
        <fieldset className="choice-segments currency-choice">
          <legend>Moeda</legend>
          {(
            [
              ["EUR", "€"],
              ["USD", "$"],
              ["GBP", "£"],
            ] as const
          ).map(([code, symbol]) => (
            <label key={code}>
              <input
                type="radio"
                name="currency"
                value={code}
                defaultChecked={code === "EUR"}
                aria-label={code}
              />
              <span>
                {symbol} {code}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="form-note">
          Usa uma carteira por moeda. Não fazemos conversão cambial automática.
        </p>
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
            type="submit"
            className="button primary"
            disabled={saving}
          >
            Criar carteira
          </button>
        </div>
      </form>
    </Dialog>
  );
}
