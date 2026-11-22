"use client";

import { Icon } from "@/components/icon";
import { usePortfoliosContext } from "./portfolios-provider";

/** The dismissible workspace message (saves, imports, conflicts). */
export function MessageNotice() {
  const { message, notify } = usePortfoliosContext();

  if (!message) return null;

  return (
    <div
      className="notice"
      role="status"
    >
      {message}
      <button
        aria-label="Fechar aviso"
        onClick={() => notify("")}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
