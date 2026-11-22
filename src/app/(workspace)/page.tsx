"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  PORTFOLIOS_PATH,
  RETURN_PARAM,
  safeReturnPath,
} from "./_components/workspace-routes";

/**
 * `/` is the entry page. Until a storage mode is chosen, SessionGate shows the
 * welcome screen here (login, account creation or continuing without a
 * session). Once inside, visitors continue to the link they first opened or
 * to their portfolios. The redirect runs in the browser so `/` still answers
 * without an HTTP redirect, as the deployment smoke test expects.
 */
export default function EntryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(nextPathAfterEntry(window.location));
  }, [router]);

  return null;
}

/**
 * Chooses where to go after the entry page and keeps the other query
 * parameters, such as auth callback markers. Parameters already present in
 * the return link take precedence.
 */
function nextPathAfterEntry(location: Location): string {
  const params = new URLSearchParams(location.search);
  const returnUrl = safeReturnPath(params.get(RETURN_PARAM), location.origin);
  params.delete(RETURN_PARAM);

  const destination = returnUrl ?? new URL(PORTFOLIOS_PATH, location.origin);
  for (const [name, value] of params) {
    if (!destination.searchParams.has(name))
      destination.searchParams.append(name, value);
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
