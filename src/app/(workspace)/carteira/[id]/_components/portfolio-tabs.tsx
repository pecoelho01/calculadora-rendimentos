"use client";

import Link from "next/link";
import { useWorkspaceNavigation } from "@/app/(workspace)/_components/use-workspace-navigation";
import {
  portfolioSections,
  scrollToTop,
  type PortfolioSection,
} from "@/app/(workspace)/_components/workspace-routes";
import { portfolioSectionDetails } from "./portfolio-header";

export function PortfolioTabs({ section }: { section: PortfolioSection }) {
  const { sectionHref } = useWorkspaceNavigation();

  return (
    <nav
      className="portfolio-tabs no-print"
      aria-label="Secções da carteira"
    >
      {portfolioSections.map((item) => (
        <Link
          key={item}
          href={sectionHref(item)}
          aria-current={section === item ? "page" : undefined}
          onClick={scrollToTop}
        >
          {portfolioSectionDetails[item].label}
        </Link>
      ))}
    </nav>
  );
}
