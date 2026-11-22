"use client";

import { usePathname } from "next/navigation";

export type PortfolioSection = "overview" | "positions" | "transactions";

export type WorkspaceView = PortfolioSection | "notes" | "account";

/** Opens the last portfolio, or the empty state when there is none. */
export const PORTFOLIOS_PATH = "/carteira";
export const SETTINGS_PATH = "/definicoes";
export const NOTES_PATH = "/notas";
/** Query parameter that keeps a link opened before choosing a storage mode. */
export const RETURN_PARAM = "voltar";

export const portfolioSections: PortfolioSection[] = [
  "overview",
  "positions",
  "transactions",
];

const sectionSegments: Record<PortfolioSection, string> = {
  overview: "/geral",
  positions: "/posicoes",
  transactions: "/transacoes",
};

function searchQuery(search: string | undefined): string {
  if (!search) return "";

  return `?q=${encodeURIComponent(search)}`;
}

/** Builds a portfolio URL; only the internal id and the search text are exposed. */
export function portfolioPath(
  portfolioId: string,
  section: PortfolioSection = "overview",
  search?: string,
): string {
  const encodedId = encodeURIComponent(portfolioId);

  return `${PORTFOLIOS_PATH}/${encodedId}${sectionSegments[section]}${searchQuery(search)}`;
}

export function portfolioSectionFromSegment(
  segment: string | null,
): PortfolioSection {
  // "geral" and a missing segment both mean the overview.
  if (segment === "posicoes") return "positions";
  if (segment === "transacoes") return "transactions";

  return "overview";
}

/** Maps the current pathname to the view used for navigation state and CSS. */
export function workspaceViewFromPathname(pathname: string): WorkspaceView {
  if (pathname === SETTINGS_PATH) return "account";
  if (pathname === NOTES_PATH) return "notes";
  if (!pathname.startsWith(`${PORTFOLIOS_PATH}/`)) return "overview";

  const sectionSegment = pathname.split("/")[3] ?? null;

  return portfolioSectionFromSegment(sectionSegment);
}

/**
 * Returns the portfolio id from the current URL, if any. The pathname keeps
 * the segment percent-encoded, so it is decoded exactly once; `useParams` is
 * not used because its value is not consistently decoded.
 */
export function useRoutePortfolioId(): string | undefined {
  const pathname = usePathname();
  const encodedId = pathname.match(/^\/carteira\/([^/]+)/)?.[1];
  if (!encodedId) return undefined;

  try {
    return decodeURIComponent(encodedId);
  } catch {
    // A malformed segment is treated as an unknown portfolio.
    return encodedId;
  }
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "instant" });
}

// Browsers drop tabs and line breaks from URLs, so "/\t/site" becomes "//site".
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Accepts only pages of this site other than the entry page, so the return
 * link can neither leave the site nor bring the visitor back to `/`.
 */
export function safeReturnPath(
  value: string | null,
  origin: string,
): URL | null {
  if (!value) return null;

  const looksInternal = value.startsWith("/") && !value.startsWith("//");
  const hasUnsafeCharacters =
    value.includes("\\") || CONTROL_CHARACTERS.test(value);
  if (!looksInternal || hasUnsafeCharacters) return null;

  const destination = new URL(value, origin);
  const isSameSite = destination.origin === origin;
  const isEntryPage = destination.pathname === "/";
  if (!isSameSite || isEntryPage) return null;

  return destination;
}
