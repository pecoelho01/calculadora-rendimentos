import type { CSSProperties } from "react";

const paths = {
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5",
  moon: "M20.9 13.3A9 9 0 0 1 10.7 3.1a9 9 0 1 0 10.2 10.2",

  panel: "M3 4h18v16H3z M9 4v16 M5.5 8h1 M5.5 12h1",
  edit: "M14 5l5 5 M4 20l5-1L21 7l-5-5L4 14z",
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  positions: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  transactions: "M3 7h17l-4-4 M21 17H4l4 4",
  info: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  plus: "M12 5v14 M5 12h14",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5",
  download: "M12 3v13 M7 11l5 5 5-5 M4 16v5h16v-5",
  external: "M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M5.5 7a8 8 0 0 1 13-2L20 7 M4 17l1.5 2a8 8 0 0 0 13-2",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  wallet: "M3 6V4h15v4 M3 6v14h18V8H5a2 2 0 0 1-2-2 M21 12h-6v4h6",
  trend: "M3 17l6-6 4 4 8-11 M15 4h6v6",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  close: "M6 6l12 12 M18 6 6 18",
  chevron: "M6 9l6 6 6-6",
  file: "M14 2H4v20h16V8z M14 2v6h6 M8 13h8 M8 17h5",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  style,
}: {
  name: IconName;
  style?: CSSProperties;
}) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
