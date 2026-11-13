"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Icon } from "../shared/icon";

const MIN_WIDTH = 224;
const MAX_WIDTH = 420;
const clampWidth = (width: number) =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));

const mobileQuery = "(max-width: 800px)";
function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getMobile = () => window.matchMedia(mobileQuery).matches;

export function WorkspaceShell({
  sidebar,
  mobileNavigation,
  portfolioName,
  currency,
  children,
}: {
  sidebar: ReactNode;
  mobileNavigation?: ReactNode;
  portfolioName: string;
  currency?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, () => false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  // Native dialog supplies focus containment, Escape and an inert background on mobile.
  useEffect(
    function synchronizeDrawerDisplay() {
      const drawer = drawerRef.current!;
      // Opening the desktop navigation during a resize must not steal focus from a form.
      const focused = document.activeElement;
      const restoreModalFocus =
        focused instanceof HTMLElement &&
        Boolean(focused.closest("dialog:modal"));
      drawer.close();
      if (!mobile) drawer.show();
      if (restoreModalFocus && focused.isConnected)
        focused.focus({ preventScroll: true });
      const beforePrint = () => drawer.close();
      const afterPrint = () => {
        if (!mobile) drawer.show();
      };
      window.addEventListener("beforeprint", beforePrint);
      window.addEventListener("afterprint", afterPrint);
      return () => {
        drawer.close();
        window.removeEventListener("beforeprint", beforePrint);
        window.removeEventListener("afterprint", afterPrint);
      };
    },
    [mobile],
  );

  function closeDrawer() {
    drawerRef.current?.close();
    menuRef.current?.focus();
  }
  const [width, setWidth] = useState(248);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);

  function handleDrawerBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (!mobile || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickedOutside =
      event.clientX > rect.right ||
      event.clientY > rect.bottom ||
      event.clientX < rect.left ||
      event.clientY < rect.top;
    if (clickedOutside) closeDrawer();
  }

  function toggleSidebar() {
    if (mobile) closeDrawer();
    else setOpen((current) => !current);
  }

  function closeDrawerBeforeRename(event: KeyboardEvent<HTMLDivElement>) {
    if (!mobile) return;
    const portfolioLink = (event.target as Element).closest(".portfolio-link");
    const renameShortcut =
      event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (portfolioLink && renameShortcut) closeDrawer();
  }

  function startSidebarResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
    setDragging(true);
  }

  function resizeSidebar(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const nextWidth = drag.current.width + event.clientX - drag.current.x;
    setWidth(clampWidth(nextWidth));
  }

  function clearSidebarDrag() {
    drag.current = null;
    setDragging(false);
  }

  function finishSidebarResize(event: PointerEvent<HTMLDivElement>) {
    clearSidebarDrag();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeSidebarWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setWidth(function widthForKey(current) {
      if (event.key === "Home") return MIN_WIDTH;
      if (event.key === "End") return MAX_WIDTH;
      const step = event.key === "ArrowLeft" ? -16 : 16;
      return clampWidth(current + step);
    });
  }

  return (
    <div
      className={`app-shell ${open ? "" : "sidebar-closed"} ${dragging ? "sidebar-dragging" : ""}`}
      style={{ "--sidebar-width": `${width}px` } as CSSProperties}
    >
      <header className="mobile-workspace-bar no-print">
        <button
          ref={menuRef}
          className="icon-button"
          aria-label="Abrir menu"
          aria-haspopup="dialog"
          aria-controls="workspace-drawer"
          onClick={() => drawerRef.current?.showModal()}
        >
          <Icon name="panel" />
        </button>
        <div className="mobile-workspace-title">
          <span>
            rendimentos<span className="brand-dot">.</span>
          </span>
          <strong>
            <span>{portfolioName}</span>{" "}
            {currency ? <small>{currency}</small> : null}
          </strong>
        </div>
      </header>
      <dialog
        ref={drawerRef}
        id="workspace-drawer"
        className="workspace-drawer no-print"
        role={mobile ? "dialog" : "presentation"}
        aria-label={mobile ? "Navegação e carteiras" : undefined}
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClick={handleDrawerBackdropClick}
      >
        <aside
          id="workspace-sidebar"
          className="sidebar"
        >
          <div className="sidebar-header">
            <Link
              className="brand"
              href="/"
              aria-label="Rendimentos, início"
            >
              <span className="brand-mark">
                <Icon name="trend" />
              </span>
              <span className="brand-name">
                rendimentos<span className="brand-dot">.</span>
              </span>
            </Link>
            <button
              className="sidebar-toggle icon-button"
              aria-label={
                mobile
                  ? "Fechar menu"
                  : open
                    ? "Fechar sidebar"
                    : "Abrir sidebar"
              }
              title={
                mobile
                  ? "Fechar menu"
                  : open
                    ? "Recolher navegação"
                    : "Expandir navegação"
              }
              aria-expanded={mobile || open}
              aria-controls="workspace-sidebar"
              onClick={toggleSidebar}
            >
              <Icon name={mobile ? "close" : "panel"} />
            </button>
          </div>
          <div
            className="sidebar-content"
            onContextMenuCapture={(event) => {
              if (
                mobile &&
                (event.target as Element).closest(".portfolio-link")
              )
                closeDrawer();
            }}
            onKeyDownCapture={closeDrawerBeforeRename}
            onClickCapture={(event) => {
              if (mobile && (event.target as Element).closest("button, a"))
                closeDrawer();
            }}
          >
            {sidebar}
          </div>
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
            onPointerDown={startSidebarResize}
            onPointerMove={resizeSidebar}
            onPointerUp={finishSidebarResize}
            onLostPointerCapture={clearSidebarDrag}
            onPointerCancel={clearSidebarDrag}
            onKeyDown={resizeSidebarWithKeyboard}
          />
        </aside>
      </dialog>
      {children}
      {mobileNavigation}
    </div>
  );
}
