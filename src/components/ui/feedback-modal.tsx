import { Modal } from "./modal";
import { Button } from "./button";
import { MessageSquare } from "lucide-react";
import { openExternalUrl } from "../../lib/electron";

const GOOGLE_FORM_LINK = "https://forms.gle/Q8TRDE5oLJrhf3eG8";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const handleFeedback = () => {
    openExternalUrl(GOOGLE_FORM_LINK);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-8">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
          <MessageSquare size={22} className="text-accent" />
        </div>
        <h2 className="font-display text-2xl font-black tracking-tight text-bone mb-6">
          We'd Love Your Feedback
        </h2>
        <div className="space-y-4 mb-8">
          <p className="font-sans text-sm text-muted leading-relaxed">
            BlackLetter is currently in active development.
          </p>
          <p className="font-sans text-sm text-muted leading-relaxed">
            Your feedback helps improve the platform and directly influences future updates.
          </p>
          <p className="font-sans text-sm text-muted leading-relaxed">
            Thank you for taking a few minutes to help make BlackLetter better.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleFeedback} className="flex-1">
            Leave Feedback
          </Button>
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
