import type { ReactNode } from "react";
import { AccountDashboard } from "@/components/account-dashboard";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AccountDashboard>{children}</AccountDashboard>;
}
