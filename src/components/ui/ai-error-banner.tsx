import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle, Clock, Key, WifiOff, FileText, MessageSquare, RefreshCw, X,
} from "lucide-react";
import { Button } from "./button";
import type { AiError } from "../../services/ai";

interface AiErrorBannerProps {
  error: AiError;
  onRetry?: () => void;
  onDismiss?: () => void;
  onOpenSettings?: () => void;
}

interface ErrorConfig {
  icon: typeof AlertCircle;
  title: string;
}

const ERROR_CONFIG: Record<string, ErrorConfig> = {
  NO_KEY: { icon: Key, title: "No API Key" },
  INVALID_KEY: { icon: Key, title: "Invalid API Key" },
  RATE_LIMITED: { icon: Clock, title: "Rate Limit Reached" },
  TIMEOUT: { icon: AlertCircle, title: "Request Timed Out" },
  NETWORK: { icon: WifiOff, title: "Network Error" },
  SERVER: { icon: AlertCircle, title: "Server Error" },
  EMPTY: { icon: MessageSquare, title: "Empty Response" },
  MODEL_NOT_FOUND: { icon: AlertCircle, title: "Model Unavailable" },
  DOCUMENT_TOO_LARGE: { icon: FileText, title: "Document Too Large" },
  UNSUPPORTED_FILE_TYPE: { icon: FileText, title: "Unsupported File" },
  INTERRUPTED: { icon: AlertCircle, title: "Research Interrupted" },
};

const SHOW_RETRY = new Set([
  "RATE_LIMITED", "TIMEOUT", "NETWORK", "SERVER", "EMPTY",
]);

const SHOW_SETTINGS = new Set([
  "NO_KEY", "INVALID_KEY", "MODEL_NOT_FOUND",
]);

export function AiErrorBanner({ error, onRetry, onDismiss, onOpenSettings }: AiErrorBannerProps) {
  const config: ErrorConfig = ERROR_CONFIG[error.code] || ERROR_CONFIG.SERVER;
  const Icon = config.icon;

  const [countdown, setCountdown] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [retryEnabled, setRetryEnabled] = useState(true);

  useEffect(() => {
    if ((error.code === "RATE_LIMITED" || error.code === "SERVER")) {
      const retryAfter = error.retryAfter && error.retryAfter > 0 ? error.retryAfter : 15;
      setCountdown(retryAfter);
      setTotal(retryAfter);
      setRetryEnabled(false);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            setRetryEnabled(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
      setTotal(null);
      setRetryEnabled(true);
    }
  }, [error]);

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  const displayMessage = error.message || config.title;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="mx-4 mt-3 p-4 rounded-lg bg-red-500/8 border border-red-500/20">
        <div className="flex items-start gap-3">
          <Icon size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-sans text-xs font-semibold text-red-300 mb-1">
              {config.title}
            </p>
            <p className="font-sans text-xs text-red-300/70 leading-relaxed whitespace-pre-wrap break-words">
              {displayMessage}
            </p>

            {countdown !== null && total !== null && (
              <div className="flex items-center gap-2 mt-3">
                <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-red-500/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-400 transition-all duration-1000"
                    style={{ width: `${(countdown / total) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-2xs text-red-400/60 tabular-nums">
                  {countdown}s
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 mt-3">
              {SHOW_RETRY.has(error.code) && (
                <Button variant="danger" size="sm" onClick={handleRetry} disabled={!retryEnabled}>
                  <RefreshCw size={12} />
                  {retryEnabled ? "Try again" : `Wait ${countdown}s`}
                </Button>
              )}
              {SHOW_SETTINGS.has(error.code) && onOpenSettings && (
                <Button variant="danger" size="sm" onClick={onOpenSettings}>
                  Open Settings
                </Button>
              )}
            </div>
          </div>
          {onDismiss && (
            <button onClick={onDismiss} className="text-red-400/40 hover:text-red-300 transition-colors shrink-0">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}