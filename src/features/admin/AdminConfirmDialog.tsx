import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

type AdminConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm
}: AdminConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);

  useEffect(() => {
    onCancelRef.current = onCancel;
    busyRef.current = busy;
  }, [busy, onCancel]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById("root");
    const rootWasInert = appRoot?.hasAttribute("inert") ?? false;
    const previousBodyOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    appRoot?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) onCancelRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || []);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (!rootWasInert) appRoot?.removeAttribute("inert");
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="admin-confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="admin-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
      >
        <span className="admin-confirm-icon" aria-hidden="true">
          <AlertTriangle size={20} />
        </span>
        <div className="admin-confirm-copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <div className="admin-confirm-actions">
          <button ref={cancelRef} type="button" className="secondary-action" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button type="button" className="primary-action danger-action" onClick={onConfirm} disabled={busy}>
            {busy ? "处理中" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AdminConfirmDialog;
