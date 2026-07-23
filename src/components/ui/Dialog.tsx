import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef
} from "react";
import { createPortal } from "react-dom";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hidden && element.getClientRects().length > 0
  );
}

export type DialogProps = {
  open: boolean;
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  role?: "dialog" | "alertdialog";
  canClose?: boolean;
  closeOnEscape?: boolean;
  closeOnScrim?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  variant?: "dialog" | "sheet" | "side";
  className?: string;
};

function Dialog({
  open,
  children,
  labelledBy,
  describedBy,
  onClose,
  role = "dialog",
  canClose = true,
  closeOnEscape = true,
  closeOnScrim = true,
  initialFocusRef,
  variant = "dialog",
  className = ""
}: DialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  const closeOnEscapeRef = useRef(closeOnEscape);

  useEffect(() => {
    onCloseRef.current = onClose;
    canCloseRef.current = canClose;
    closeOnEscapeRef.current = closeOnEscape;
  }, [canClose, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const restoreTarget = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const appRoot = document.getElementById("root");
    const rootWasInert = appRoot?.inert || false;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const suspendedScrollOwners = new Map<HTMLElement, string>();

    const suspendBackgroundScrollOwners = () => {
      appRoot?.querySelectorAll<HTMLElement>("[data-scroll-owner]").forEach((element) => {
        const owner = element.getAttribute("data-scroll-owner");
        if (owner === null) return;
        if (!suspendedScrollOwners.has(element)) suspendedScrollOwners.set(element, owner);
        element.removeAttribute("data-scroll-owner");
      });
    };

    if (appRoot) appRoot.inert = true;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    suspendBackgroundScrollOwners();

    const scrollOwnerObserver = appRoot
      ? new MutationObserver(suspendBackgroundScrollOwners)
      : null;
    scrollOwnerObserver?.observe(appRoot!, {
      attributes: true,
      attributeFilter: ["data-scroll-owner"],
      childList: true,
      subtree: true
    });

    const focusFrame = window.requestAnimationFrame(() => {
      const initialTarget =
        initialFocusRef?.current ||
        dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") ||
        focusableElements(dialog)[0] ||
        dialog;
      initialTarget.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (canCloseRef.current && closeOnEscapeRef.current) {
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      scrollOwnerObserver?.disconnect();
      suspendedScrollOwners.forEach((owner, element) => {
        if (element.isConnected && !element.hasAttribute("data-scroll-owner")) {
          element.setAttribute("data-scroll-owner", owner);
        }
      });
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      if (appRoot && !rootWasInert) appRoot.inert = false;
      if (restoreTarget?.isConnected) {
        window.requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
      }
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  return createPortal(
    <div className={`ui-dialog-layer ui-dialog-layer-${variant}`}>
      {canClose && closeOnScrim ? (
        <button
          type="button"
          className="ui-dialog-scrim"
          aria-label="关闭对话框"
          tabIndex={-1}
          onClick={() => onCloseRef.current()}
        />
      ) : (
        <div className="ui-dialog-scrim" aria-hidden="true" />
      )}
      <section
        ref={dialogRef}
        className={`ui-dialog ui-dialog-${variant} ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        data-scroll-owner="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body
  );
}

export default Dialog;
