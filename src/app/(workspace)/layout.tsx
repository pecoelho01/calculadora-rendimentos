import type { ReactNode } from "react";
import { PortfoliosProvider } from "./_components/portfolios-provider";
import { SessionGate } from "./_components/session/session-gate";
import { WorkspaceLayout } from "./_components/workspace-layout";

export default function WorkspaceRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SessionGate>
      <PortfoliosProvider>
        <WorkspaceLayout>{children}</WorkspaceLayout>
      </PortfoliosProvider>
    </SessionGate>
  );
}
