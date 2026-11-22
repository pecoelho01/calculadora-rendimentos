"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { useWorkspaceNavigation } from "./use-workspace-navigation";
import { scrollToTop, type PortfolioSection } from "./workspace-routes";

const mobileSections: {
  section: PortfolioSection;
  icon: IconName;
  text: string;
}[] = [
  { section: "overview", icon: "overview", text: "Visão geral" },
  { section: "positions", icon: "positions", text: "Posições" },
  { section: "transactions", icon: "transactions", text: "Transações" },
];

export function MobileNavigation() {
  const { view, sectionHref } = useWorkspaceNavigation();
  const isAccountView = view === "account";

  return (
    <nav
      className="mobile-navigation no-print"
      aria-label="Navegação móvel"
    >
      {mobileSections.map((item) => (
        <Link
          key={item.section}
          href={sectionHref(item.section)}
          onClick={scrollToTop}
          aria-current={view === item.section ? "page" : undefined}
        >
          <Icon name={item.icon} />
          <span>{item.text}</span>
        </Link>
      ))}
      <Link
        href="/definicoes"
        aria-current={isAccountView ? "page" : undefined}
      >
        <Icon name="shield" />
        <span>Conta</span>
      </Link>
    </nav>
  );
}
