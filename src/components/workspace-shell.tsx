"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./icon";

const MIN_WIDTH = 224;
const MAX_WIDTH = 420;
const clampWidth = (width: number) =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));

export function WorkspaceShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(248);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className={`app-shell ${open ? "" : "sidebar-closed"} ${dragging ? "sidebar-dragging" : ""}`}
      style={{ "--sidebar-width": `${width}px` } as CSSProperties}
    >
      <aside id="workspace-sidebar" className="sidebar no-print" hidden={!open}>
        <div className="sidebar-header">
          <Link className="brand" href="/" aria-label="Rendimentos, início">
            <span className="brand-mark">
              <Icon name="trend" />
            </span>
            rendimentos<span className="brand-dot">.</span>
          </Link>
          <button
            ref={closeRef}
            className="sidebar-toggle icon-button"
            aria-label="Fechar sidebar"
            aria-expanded={open}
            aria-controls="workspace-sidebar"
            onClick={() => {
              setOpen(false);
              requestAnimationFrame(() => reopenRef.current?.focus());
            }}
          >
            <Icon name="panel" />
          </button>
        </div>
        <div className="sidebar-content">{sidebar}</div>
        <div
          className="sidebar-resizer"
          role="separator"
          tabIndex={0}
          aria-label="Largura da sidebar"
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={width}
          aria-valuetext={`${width} píxeis`}
          aria-controls="workspace-sidebar"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, width };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setWidth(
                clampWidth(drag.current.width + event.clientX - drag.current.x),
              );
          }}
          onPointerUp={(event) => {
            drag.current = null;
            setDragging(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            setWidth((current) =>
              event.key === "Home"
                ? MIN_WIDTH
                : event.key === "End"
                  ? MAX_WIDTH
                  : clampWidth(
                      current + (event.key === "ArrowLeft" ? -16 : 16),
                    ),
            );
          }}
        />
      </aside>
      <button
        ref={reopenRef}
        className="sidebar-reopen button secondary no-print"
        hidden={open}
        aria-label="Abrir sidebar"
        aria-expanded={open}
        aria-controls="workspace-sidebar"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => closeRef.current?.focus());
        }}
      >
        <Icon name="panel" /> Abrir sidebar
      </button>
      {children}
    </div>
  );
}
