"use client";

import { useMemo, useRef, useState } from "react";
import { csvDuplicateKey, type CsvDraftOrder } from "@/lib/csv";
import type { Order, Portfolio } from "@/lib/types";
import { validateOrder, validateOrders } from "@/lib/validation";
import { Dialog } from "./dialog";

const PAGE_SIZE = 25;
type ReviewRow = CsvDraftOrder & { include: boolean };

export function CsvImportReview({ portfolio, filename, drafts, onClose, onConfirm }: {
  portfolio: Portfolio;
  filename: string;
  drafts: CsvDraftOrder[];
  onClose: () => void;
  onConfirm: (orders: Order[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<ReviewRow[]>(() => drafts.map((row) => ({ ...row, include: true })));
  const [page, setPage] = useState(0);
  const [duplicatesAccepted, setDuplicatesAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const submitting = useRef(false);
  const review = useMemo(() => {
    const errors = new Map<string, string>();
    const orders: Order[] = [];
    for (const row of rows) {
      if (!row.include) continue;
      try { orders.push(validateOrder(row)); }
      catch (error) { errors.set(row.id, (error as Error).message); }
    }
    const existing = new Set(portfolio.orders.map(csvDuplicateKey));
    const counts = new Map<string, number>();
    for (const order of orders) {
      const key = csvDuplicateKey(order);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const duplicates = new Map<string, string>();
    for (const order of orders) {
      const key = csvDuplicateKey(order);
      const inPortfolio = existing.has(key);
      const inFile = counts.get(key)! > 1;
      if (inPortfolio || inFile) duplicates.set(order.id,
        inPortfolio && inFile ? "Já existe na carteira e repete-se no ficheiro." :
          inPortfolio ? "Já existe na carteira." : "Repete-se no ficheiro.");
    }
    let error = "";
    if (!orders.length && !errors.size) error = "Seleciona pelo menos uma transação para importar.";
    else if (errors.size) error = `Corrige os campos de ${errors.size} ${errors.size === 1 ? "transação inválida" : "transações inválidas"} ou desmarca essas linhas.`;
    else {
      try { validateOrders([...portfolio.orders, ...orders]); }
      catch (cause) { error = (cause as Error).message; }
    }
    return { orders, errors, duplicates, error };
  }, [rows, portfolio]);

  function edit(id: string, field: keyof ReviewRow, value: string | boolean) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setDuplicatesAccepted(false);
    setSaveError("");
  }
  const first = page * PAGE_SIZE;
  const last = Math.min(first + PAGE_SIZE, rows.length);
  const blocked = Boolean(review.error) || (review.duplicates.size > 0 && !duplicatesAccepted);
  const fields = [
    { key: "date", label: "Data", type: "date" },
    { key: "ticker", label: "Ticker", type: "text" },
    { key: "name", label: "Nome", type: "text" },
    { key: "shares", label: "Quantidade", type: "text" },
    { key: "pricebuy", label: `Preço (${portfolio.currency})`, type: "text" },
  ] as const;

  return (
    <Dialog title="Rever importação CSV" className="csv-review-dialog no-print" closeDisabled={saving} onClose={onClose}>
      <form noValidate onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current || blocked) return;
        submitting.current = true;
        setSaving(true);
        setSaveError("");
        try { await onConfirm(review.orders); }
        catch (error) { setSaveError((error as Error).message); }
        finally { submitting.current = false; setSaving(false); }
      }}>
        <fieldset disabled={saving} className="csv-review-fields">
          <div className="csv-review-destination">
            <span>Carteira de destino <strong>{portfolio.name} · {portfolio.currency}</strong></span>
            <span className="csv-review-filename">{filename}</span>
          </div>
          <p className="import-help">Edita os campos ou desmarca as linhas que não queres importar. Os preços devem estar em {portfolio.currency}. As transações do mesmo dia mantêm a ordem do ficheiro.</p>
          <p className="csv-review-count" role="status">Selecionadas: {rows.filter((row) => row.include).length} de {rows.length} · Nada é guardado até confirmares.</p>
          {review.duplicates.size ? <div className="csv-review-warning" role="status">
            {review.duplicates.size} {review.duplicates.size === 1 ? "possível duplicado" : "possíveis duplicados"}. Comparamos data, ticker, operação, quantidade e preço. Não removemos linhas automaticamente.
          </div> : null}
          <p className="csv-review-scroll-hint">Desliza a tabela para editar os restantes campos.</p>
          <div className="csv-review-scroll" role="region" aria-label="Tabela editável de transações CSV" tabIndex={0}>
            <table className="csv-review-table">
              <caption className="visually-hidden">Transações a acrescentar a {portfolio.name}, em {portfolio.currency}</caption>
              <thead><tr><th scope="col">Incluir</th><th scope="col">Linha</th><th scope="col">Operação</th>{fields.map((field) => <th scope="col" key={field.key}>{field.label}</th>)}<th scope="col">Revisão</th></tr></thead>
              <tbody>{rows.slice(first, last).map((row, offset) => {
                const line = first + offset + 2;
                const error = review.errors.get(row.id);
                const duplicate = review.duplicates.get(row.id);
                const noteId = `csv-review-note-${row.id}`;
                return <tr key={row.id} className={row.include ? undefined : "csv-review-excluded"} aria-invalid={error ? true : undefined} aria-describedby={error ? noteId : undefined}>
                  <td><input type="checkbox" checked={row.include} aria-label={`Incluir linha ${line}`} onChange={(event) => edit(row.id, "include", event.target.checked)} /></td>
                  <th scope="row">{line}</th>
                  <td><select aria-label={`Operação da linha ${line}`} value={row.type} disabled={!row.include} aria-describedby={error ? noteId : undefined} onChange={(event) => edit(row.id, "type", event.target.value)}>
                    {!["buy", "sell"].includes(row.type) ? <option value={row.type}>{row.type || "Escolher"}</option> : null}
                    <option value="buy">Compra</option><option value="sell">Venda</option>
                  </select></td>
                  {fields.map((field) => <td key={field.key}><input
                    aria-label={`${field.label} da linha ${line}`}
                    aria-describedby={error || duplicate ? noteId : undefined}
                    type={field.type}
                    inputMode={field.key === "shares" || field.key === "pricebuy" ? "decimal" : undefined}
                    min={field.key === "date" ? "2000-01-01" : undefined}
                    max={field.key === "date" ? new Date().toISOString().slice(0, 10) : undefined}
                    maxLength={field.key === "ticker" ? 25 : field.key === "name" ? 100 : undefined}
                    value={row[field.key]}
                    disabled={!row.include}
                    onChange={(event) => edit(row.id, field.key, event.target.value)}
                  /></td>)}
                  <td id={noteId} className={error ? "csv-review-row-error" : duplicate ? "csv-review-row-warning" : "csv-review-row-status"}>{!row.include ? "Não importar" : error || (duplicate ? `Possível duplicado: ${duplicate}` : "Válida")}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="csv-review-pagination">
            <span>Transações {first + 1}–{last} de {rows.length}</span>
            {rows.length > PAGE_SIZE ? <div><button type="button" className="button secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Anterior</button><button type="button" className="button secondary" disabled={last === rows.length} onClick={() => setPage((value) => value + 1)}>Seguinte</button></div> : null}
          </div>
          {review.error ? <div className="form-error" role="alert">{review.error}{review.errors.size ? <button className="text-button" type="button" onClick={() => {
            const index = rows.findIndex((row) => review.errors.has(row.id));
            setPage(Math.floor(index / PAGE_SIZE));
          }}>Ver primeiro erro</button> : null}</div> : null}
          {review.duplicates.size ? <label className="csv-review-accept"><input type="checkbox" checked={duplicatesAccepted} onChange={(event) => setDuplicatesAccepted(event.target.checked)} />Confirmo que pretendo importar os possíveis duplicados selecionados.</label> : null}
          {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="button primary" disabled={blocked}>{saving ? "A importar…" : "Confirmar importação"}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
