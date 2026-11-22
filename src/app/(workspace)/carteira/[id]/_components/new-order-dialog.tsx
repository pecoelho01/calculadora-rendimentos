"use client";

import type { FormEvent } from "react";
import type { Portfolio } from "@/lib/types";
import { Dialog } from "@/components/dialog";
import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";
import { OrderForm } from "./order-form";

export function NewOrderDialog({ portfolio }: { portfolio: Portfolio }) {
  const { modal, formError, saveState, closeModal, addOrder } =
    usePortfoliosContext();

  if (modal !== "order") return null;

  const orders = portfolio.orders;
  const currency = portfolio.currency;
  const saving = saveState === "saving";

  async function onAddOrder(event: FormEvent<HTMLFormElement>) {
    await addOrder(event, portfolio);
  }

  return (
    <Dialog
      title="Nova transação"
      eyebrow="INVESTIMENTOS"
      className="trade-dialog"
      onClose={closeModal}
    >
      <OrderForm
        orders={orders}
        currency={currency}
        onSubmit={onAddOrder}
        onClose={closeModal}
        error={formError}
        saving={saving}
      />
    </Dialog>
  );
}
