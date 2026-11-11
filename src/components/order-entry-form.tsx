"use client";

import { useState, type FormEventHandler } from "react";
import { calculatePortfolio } from "@/lib/portfolio";
import { validateOrder } from "@/lib/validation";
import type { Currency, Order } from "@/lib/types";
import { OrderAssetFields } from "./order-asset-fields";

export function OrderEntryForm({ orders, currency, onSubmit, onClose, error, saving }: {
  orders: Order[];
  currency: Currency;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
  error: string;
  saving: boolean;
}) {
  const [operation, setOperation] = useState("buy");
  const [draft, setDraft] = useState({ pricebuy: "", shares: "" });
  const today = new Date().toISOString().slice(0, 10);
  let total: number | null = null;
  try {
    // Preview the acquisition amount through the same pure accounting function.
    // The side of the submitted order is still validated by the existing handler.
    const preview = validateOrder({ ...draft, date: today, ticker: "PREVIEW", type: "buy" });
    total = calculatePortfolio([preview], {}, currency).invested;
  } catch { /* Incomplete or invalid input has no monetary preview. */ }
  const formattedTotal = total === null ? "—" : total.toLocaleString("pt-PT", { style: "currency", currency });

  return <form className="trade-form" onSubmit={onSubmit}>
    <p className="dialog-intro">Regista uma compra ou venda na carteira selecionada.</p>
    <fieldset className="choice-segments operation-choice"><legend className="visually-hidden">Operação</legend>
      {[["buy", "↘ Compra"], ["sell", "↗ Venda"]].map(([value, label]) => <label key={value}>
        <input type="radio" name="type" value={value} checked={operation === value} onChange={() => setOperation(value)} aria-label={value === "buy" ? "Compra" : "Venda"} /><span>{label}</span>
      </label>)}
    </fieldset>
    <div className="form-grid trade-fields">
      <label>Data<input name="date" type="date" required min="2000-01-01" max={today} defaultValue={today} /></label>
      <OrderAssetFields orders={orders} />
      <label>Quantidade<input name="shares" required inputMode="decimal" placeholder="0,00" value={draft.shares} onChange={(event) => setDraft((current) => ({ ...current, shares: event.target.value }))} /></label>
      <label>Preço por unidade ({currency})<input name="pricebuy" required inputMode="decimal" placeholder="0,00" value={draft.pricebuy} onChange={(event) => setDraft((current) => ({ ...current, pricebuy: event.target.value }))} /></label>
    </div>
    <div className="trade-total"><span>Valor total da operação</span><output aria-live="polite">{formattedTotal}</output></div>
    <p className="trade-footnote">Valores em {currency}. As ordens do mesmo dia seguem a ordem de registo.</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>Guardar transação <span aria-hidden="true">→</span></button></div>
  </form>;
}
