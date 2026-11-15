import type { FormEvent } from "react";
import type { Currency, Order } from "@/lib/types";
import { Dialog } from "../shared/dialog";
import { Icon } from "../shared/icon";
import { OrderEntryForm } from "../orders/order-entry-form";

export type PortfolioModal = "order" | "portfolio" | "import" | "rename" | null;

type PortfolioDialogsProps = {
  modal: PortfolioModal;
  portfolioName?: string;
  renamePortfolioName?: string;
  orders: Order[];
  currency: Currency;
  formError: string;
  saving: boolean;
  onClose: () => void;
  onRenamePortfolio: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAddPortfolio: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAddOrder: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onChooseCsv: () => void;
  onImportCsv: (file: File | undefined) => void;
};

export function PortfolioDialogs({
  modal,
  portfolioName,
  renamePortfolioName,
  orders,
  currency,
  formError,
  saving,
  onClose,
  onRenamePortfolio,
  onAddPortfolio,
  onAddOrder,
  onChooseCsv,
  onImportCsv,
}: PortfolioDialogsProps) {
  function dropCsvFile(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    onImportCsv(event.dataTransfer.files[0]);
  }

  return (
    <>
      {modal === "rename" ? (
        <Dialog
          title="Renomear carteira"
          onClose={onClose}
        >
          <form onSubmit={onRenamePortfolio}>
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
                onClick={onClose}
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
      ) : null}
      {modal === "import" ? (
        <Dialog
          title="Importar CSV"
          eyebrow="IMPORTAÇÃO DE DADOS"
          onClose={onClose}
        >
          <div
            className="import-stepper"
            aria-label="Etapas da importação"
          >
            <span aria-current="step">
              <b>1</b> Escolher ficheiro
            </span>
            <span>
              <b>2</b> Rever dados
            </span>
            <span>
              <b>3</b> Confirmar
            </span>
          </div>
          <button
            className="import-upload"
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropCsvFile}
            onClick={onChooseCsv}
          >
            <Icon name="upload" />
            <strong>Arrasta o ficheiro CSV para aqui</strong>
            <small>ou escolhe um ficheiro no teu dispositivo</small>
            <span className="button secondary">Escolher ficheiro</span>
          </button>
          <p className="import-summary">
            Até 2 MB. As transações são acrescentadas à carteira, após revisão.
          </p>
          <p className="import-destination">
            Carteira:{" "}
            <strong>
              {portfolioName} · {currency}
            </strong>
          </p>
          <details className="import-format-details">
            <summary>
              Consultar formato e exemplo CSV <Icon name="chevron" />
            </summary>
            <p className="import-help">
              Prepara o teu ficheiro com uma transação por linha, como neste
              exemplo. Podes descarregar o modelo e substituir os dados pelos
              teus. Antes de guardar, podes rever e editar as transações.
            </p>
            <pre
              className="csv-example"
              aria-label="Exemplo de CSV"
            >
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
                <code>buy</code> para compras ou <code>sell</code> para vendas;
                se omitido, assume compra.
              </li>
            </ul>
            <p className="import-help">
              Separa as colunas por vírgulas ou ponto e vírgula. Usa ponto nos
              decimais ou coloca os valores com vírgula entre aspas. Máximo: 2
              MB. As transações são acrescentadas à carteira selecionada;
              importar o mesmo ficheiro novamente duplica-as.
            </p>
          </details>
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
              onClick={onChooseCsv}
            >
              Escolher ficheiro CSV
            </button>
          </div>
        </Dialog>
      ) : null}
      {modal === "order" ? (
        <Dialog
          title="Nova transação"
          eyebrow="INVESTIMENTOS"
          className="trade-dialog"
          onClose={onClose}
        >
          <OrderEntryForm
            orders={orders}
            currency={currency}
            onSubmit={onAddOrder}
            onClose={onClose}
            error={formError}
            saving={saving}
          />
        </Dialog>
      ) : null}
      {modal === "portfolio" ? (
        <Dialog
          title="Criar carteira"
          eyebrow="ORGANIZAÇÃO"
          onClose={onClose}
        >
          <form onSubmit={onAddPortfolio}>
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
              Usa uma carteira por moeda. Não fazemos conversão cambial
              automática.
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
                onClick={onClose}
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
      ) : null}
    </>
  );
}
