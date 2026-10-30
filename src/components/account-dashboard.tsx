"use client";
import { AccountGateway } from "./account-gateway";
import { Dashboard } from "./dashboard";

export function AccountDashboard() {
  return <AccountGateway>{(identity, controls) => (
    <Dashboard key={identity?.userId ?? "local"} identity={identity} accountControls={controls} />
  )}</AccountGateway>;
}
