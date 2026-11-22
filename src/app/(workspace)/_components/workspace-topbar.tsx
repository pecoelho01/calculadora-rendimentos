import type { ReactNode } from "react";
import { Icon } from "@/components/icon";

export function WorkspaceTopbar({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <header className="topbar no-print">
      <div className="breadcrumb">
        Espaço pessoal <span>/</span> <strong>{label}</strong>
      </div>
      <div className="topbar-right">
        <span className="market-source">
          <Icon name="shield" />
          Mercado via Yahoo Finance
        </span>
        {children}
      </div>
    </header>
  );
}
