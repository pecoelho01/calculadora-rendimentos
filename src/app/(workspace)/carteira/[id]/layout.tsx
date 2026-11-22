import type { ReactNode } from "react";
import { PortfolioWorkspace } from "./_components/portfolio-workspace";

export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return <PortfolioWorkspace>{children}</PortfolioWorkspace>;
}
