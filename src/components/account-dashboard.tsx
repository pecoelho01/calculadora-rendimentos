"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AccountGateway } from "./account-gateway";
import { Dashboard } from "./dashboard";

export function AccountDashboard({ children }: { children: ReactNode }) {
  const accountPage = usePathname() === "/conta";
  return <AccountGateway>{(identity, controls, sidebarControls, feedback) => (
    <Dashboard key={identity?.userId ?? "local"} identity={identity} accountControls={controls}
      sidebarAccountControls={sidebarControls} accountFeedback={feedback} accountPage={accountPage}>
      {children}
    </Dashboard>
  )}</AccountGateway>;
}
