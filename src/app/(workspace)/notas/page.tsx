"use client";

import { AccountStorageBar } from "../_components/account-storage-bar";
import { MessageNotice } from "../_components/message-notice";
import { usePortfoliosContext } from "../_components/portfolios-provider";
import { WorkspaceTopbar } from "../_components/workspace-topbar";
import { MethodologyNotes } from "./_components/methodology-notes";

export default function NotesPage() {
  const { identity, accountFeedback } = usePortfoliosContext();

  return (
    <>
      <WorkspaceTopbar label="Notas explicativas" />
      <main className="content">
        {accountFeedback}
        <AccountStorageBar />
        <div className="page-heading">
          <div>
            <span className="eyebrow">CENTRO DE AJUDA</span>
            <h1>Conhece os teus números</h1>
            <p>Compreende os cálculos e a forma como tratamos os teus dados.</p>
          </div>
        </div>
        <MessageNotice />
        <MethodologyNotes isAccountMode={identity !== null} />
      </main>
    </>
  );
}
