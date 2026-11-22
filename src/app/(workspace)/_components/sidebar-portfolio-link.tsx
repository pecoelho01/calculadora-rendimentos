import type { MouseEvent, KeyboardEvent } from "react";
import Link from "next/link";
import type { Portfolio } from "@/lib/types";
import { Icon } from "@/components/icon";

type SidebarPortfolioLinkProps = {
  portfolio: Portfolio;
  href: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
};

export function SidebarPortfolioLink({
  portfolio,
  href,
  selected,
  disabled,
  onSelect,
  onRename,
}: SidebarPortfolioLinkProps) {
  function handleContextMenu(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    onRename(portfolio.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    const requestsRename =
      event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!requestsRename) return;
    event.preventDefault();
    onRename(portfolio.id);
  }

  return (
    <div className={`portfolio-row ${selected ? "selected" : ""}`}>
      <Link
        href={href}
        onClick={() => onSelect(portfolio.id)}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        className={`portfolio-link ${selected ? "selected" : ""}`}
        aria-current={selected ? "true" : undefined}
        title="Botão direito para renomear"
      >
        <i className="portfolio-dot" />
        <span className="portfolio-identity">
          <span className="portfolio-name">{portfolio.name}</span>
          <small>{portfolio.currency}</small>
        </span>
      </Link>
      <button
        className="portfolio-rename icon-button"
        aria-label={`Renomear carteira ${portfolio.name}`}
        disabled={disabled}
        onClick={() => onRename(portfolio.id)}
      >
        <Icon name="edit" />
      </button>
    </div>
  );
}
