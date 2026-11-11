"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { CsvDraftOrder } from "@/lib/csv";
import { reviewCsvOrders, type CsvReviewRow } from "@/lib/csv-review";
import type { Order, Portfolio } from "@/lib/types";
import { Dialog } from "./dialog";

const PAGE_SIZE = 25;
const fieldMaxLengths: Partial<Record<keyof CsvReviewRow, number>> = {
  ticker: 25,
  name: 100,
};

export function CsvImportReview({
  portfolio,
  filename,
  drafts,
  onClose,
  onConfirm,
}: {
  portfolio: Portfolio;
  filename: string;
  drafts: CsvDraftOrder[];
  onClose: () => void;
  onConfirm: (orders: Order[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<CsvReviewRow[]>(() =>
    drafts.map((row) => ({ ...row, include: true })),
  );
  const [page, setPage] = useState(0);
  const [duplicatesAccepted, setDuplicatesAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const submitting = useRef(false);
  const review = useMemo(
    () => reviewCsvOrders(rows, portfolio.orders),
    [rows, portfolio],
  );

  function edit(
    id: string,
    field: keyof CsvReviewRow,
    value: string | boolean,
  ) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
    setDuplicatesAccepted(false);
    setSaveError("");
  }
  const first = page * PAGE_SIZE;
  const last = Math.min(first + PAGE_SIZE, rows.length);
  const hasUnconfirmedDuplicates =
    review.duplicates.size > 0 && !duplicatesAccepted;
  const blocked = Boolean(review.error) || hasUnconfirmedDuplicates;
  const visibleRows = rows.slice(first, last);
  const selectedCount = rows.filter((row) => row.include).length;

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || blocked) return;

    submitting.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await onConfirm(review.orders);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function showFirstError() {
    const firstInvalidIndex = rows.findIndex((row) =>
      review.errors.has(row.id),
    );
    setPage(Math.floor(firstInvalidIndex / PAGE_SIZE));
  }

  const fields = [
    { key: "date", label: "Data", type: "date" },
    { key: "ticker", label: "Ticker", type: "text" },
    { key: "name", label: "Nome", type: "text" },
    { key: "shares", label: "Quantidade", type: "text" },
    { key: "pricebuy", label: `Preço (${portfolio.currency})`, type: "text" },
  ] as const;

  return (
    <Dialog
      title="Rever importação CSV"
      className="csv-review-dialog no-print"
      closeDisabled={saving}
      onClose={onClose}
    >
      <form
        noValidate
        onSubmit={submitImport}
      >
        <fieldset
          disabled={saving}
          className="csv-review-fields"
        >
          <div
            className="import-stepper"
            aria-label="Etapas da importação"
          >
            <span>
              <b>1</b> Ficheiro escolhido
            </span>
            <span aria-current="step">
              <b>2</b> Rever dados
            </span>
            <span>
              <b>3</b> Confirmar
            </span>
          </div>
          <div className="csv-review-stats">
            <div>
              <strong>{rows.length}</strong>
              <span>Linhas encontradas</span>
            </div>
            <div>
              <strong>{review.orders.length}</strong>
              <span>Linhas válidas selecionadas</span>
            </div>
            <div>
              <strong>{review.duplicates.size}</strong>
              <span>Possíveis duplicados</span>
            </div>
          </div>
          <div className="csv-review-destination">
            <span>
              Carteira de destino{" "}
              <strong>
                {portfolio.name} · {portfolio.currency}
              </strong>
            </span>
            <span className="csv-review-filename">{filename}</span>
          </div>
          <p className="import-help">
            Edita os campos ou desmarca as linhas que não queres importar. Os
            preços devem estar em {portfolio.currency}. As transações do mesmo
            dia mantêm a ordem do ficheiro.
          </p>
          <p
            className="csv-review-count"
            role="status"
          >
            Selecionadas: {selectedCount} de {rows.length} · Nada é guardado até
            confirmares.
          </p>
          {review.duplicates.size ? (
            <div
              className="csv-review-warning"
              role="status"
            >
              {review.duplicates.size}{" "}
              {review.duplicates.size === 1
                ? "possível duplicado"
                : "possíveis duplicados"}
              . Comparamos data, ticker, operação, quantidade e preço. Não
              removemos linhas automaticamente.
            </div>
          ) : null}
          <p className="csv-review-scroll-hint">
            Desliza a tabela para editar os restantes campos.
          </p>
          <div
            className="csv-review-scroll"
            role="region"
            aria-label="Tabela editável de transações CSV"
            tabIndex={0}
          >
            <table className="csv-review-table">
              <caption className="visually-hidden">
                Transações a acrescentar a {portfolio.name}, em{" "}
                {portfolio.currency}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Incluir</th>
                  <th scope="col">Linha</th>
                  <th scope="col">Operação</th>
                  {fields.map((field) => (
                    <th
                      scope="col"
                      key={field.key}
                    >
                      {field.label}
                    </th>
                  ))}
                  <th scope="col">Revisão</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, offset) => {
                  const line = first + offset + 2;
                  const error = review.errors.get(row.id);
                  const duplicate = review.duplicates.get(row.id);
                  const noteId = `csv-review-note-${row.id}`;
                  let statusClass = "csv-review-row-status";
                  if (error) statusClass = "csv-review-row-error";
                  else if (duplicate) statusClass = "csv-review-row-warning";

                  let statusText = "Válida";
                  if (!row.include) statusText = "Não importar";
                  else if (error) statusText = error;
                  else if (duplicate)
                    statusText = `Possível duplicado: ${duplicate}`;

                  return (
                    <tr
                      key={row.id}
                      className={
                        row.include ? undefined : "csv-review-excluded"
                      }
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? noteId : undefined}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={row.include}
                          aria-label={`Incluir linha ${line}`}
                          onChange={(event) =>
                            edit(row.id, "include", event.target.checked)
                          }
                        />
                      </td>
                      <th scope="row">{line}</th>
                      <td>
                        <select
                          aria-label={`Operação da linha ${line}`}
                          value={row.type}
                          disabled={!row.include}
                          aria-describedby={error ? noteId : undefined}
                          onChange={(event) =>
                            edit(row.id, "type", event.target.value)
                          }
                        >
                          {!["buy", "sell"].includes(row.type) ? (
                            <option value={row.type}>
                              {row.type || "Escolher"}
                            </option>
                          ) : null}
                          <option value="buy">Compra</option>
                          <option value="sell">Venda</option>
                        </select>
                      </td>
                      {fields.map((field) => (
                        <td key={field.key}>
                          <input
                            aria-label={`${field.label} da linha ${line}`}
                            aria-describedby={
                              error || duplicate ? noteId : undefined
                            }
                            type={field.type}
                            inputMode={
                              field.key === "shares" || field.key === "pricebuy"
                                ? "decimal"
                                : undefined
                            }
                            min={
                              field.key === "date" ? "2000-01-01" : undefined
                            }
                            max={
                              field.key === "date"
                                ? new Date().toISOString().slice(0, 10)
                                : undefined
                            }
                            maxLength={fieldMaxLengths[field.key]}
                            value={row[field.key]}
                            disabled={!row.include}
                            onChange={(event) =>
                              edit(row.id, field.key, event.target.value)
                            }
                          />
                        </td>
                      ))}
                      <td
                        id={noteId}
                        className={statusClass}
                      >
                        {statusText}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="csv-review-pagination">
            <span>
              Transações {first + 1}–{last} de {rows.length}
            </span>
            {rows.length > PAGE_SIZE ? (
              <div>
                <button
                  type="button"
                  className="button secondary"
                  disabled={page === 0}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={last === rows.length}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Seguinte
                </button>
              </div>
            ) : null}
          </div>
          {review.error ? (
            <div
              className="form-error"
              role="alert"
            >
              {review.error}
              {review.errors.size ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={showFirstError}
                >
                  Ver primeiro erro
                </button>
              ) : null}
            </div>
          ) : null}
          {review.duplicates.size ? (
            <label className="csv-review-accept">
              <input
                type="checkbox"
                checked={duplicatesAccepted}
                onChange={(event) =>
                  setDuplicatesAccepted(event.target.checked)
                }
              />
              Confirmo que pretendo importar os possíveis duplicados
              selecionados.
            </label>
          ) : null}
          {saveError ? (
            <p
              className="form-error"
              role="alert"
            >
              {saveError}
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
              disabled={blocked}
            >
              {saving ? "A importar…" : "Confirmar importação"}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
