import { useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import Dialog from "./Dialog";

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={onCancel}
      role="alertdialog"
      canClose={!busy}
      initialFocusRef={cancelRef}
      className="ui-confirmation-dialog"
    >
      <div className="ui-dialog-header">
        <span className="ui-dialog-mark danger" aria-hidden="true">
          <AlertTriangle size={18} />
        </span>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
      </div>
      <div className="ui-dialog-actions">
        <button ref={cancelRef} type="button" className="ui-button secondary" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button type="button" className="ui-button danger" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

export default ConfirmationDialog;
