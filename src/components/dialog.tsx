"use client";
import { useLayoutEffect, useRef } from "react";
import { Icon } from "./icon";
export function Dialog({
  title,
  onClose,
  closeDisabled = false,
  className,
  children,
}: {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <dialog ref={ref} className={className} onCancel={(event) => {
      event.preventDefault();
      if (!closeDisabled) onClose();
    }} aria-labelledby="dialog-title">
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Fechar" disabled={closeDisabled} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
