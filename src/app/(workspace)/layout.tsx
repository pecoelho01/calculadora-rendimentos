import type { ReactNode } from "react";
import { AccountDashboard } from "@/components/account/account-dashboard";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AccountDashboard>{children}</AccountDashboard>;
}
