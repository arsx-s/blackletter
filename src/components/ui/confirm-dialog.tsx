import { useId } from "react";
import { AlertCircle } from "lucide-react";
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
  const titleId = useId();

  return (
    <Modal isOpen={isOpen} onClose={onClose} labelledBy={titleId} className="max-w-sm">
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent-hover/20 bg-accent-hover/10">
            <AlertCircle size={15} className="text-accent-hover" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p id={titleId} className="font-display text-lg font-semibold text-bone">{title}</p>
            <p className="mt-1.5 font-sans text-sm leading-relaxed text-muted">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
