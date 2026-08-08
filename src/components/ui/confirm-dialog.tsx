import { Modal } from "./modal";
import { Button } from "./button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ isOpen, title, message, confirmLabel = "Confirm", onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-sm">
      <div className="p-6">
        <p className="font-display text-lg font-semibold text-bone mb-2">{title}</p>
        <p className="font-sans text-sm text-muted leading-relaxed mb-6">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => { onConfirm(); onClose(); }}
            className="bg-accent text-surface"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
