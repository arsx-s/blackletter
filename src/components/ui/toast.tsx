import { useSyncExternalStore, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const toasts: ToastItem[] = [];
let snapshot: ToastItem[] = [];
let listeners: Array<() => void> = [];
let toastId = 0;

function notify() {
  snapshot = [...toasts];
  listeners.forEach((l) => l());
}

export function toast(message: string, type: ToastType = "info") {
  const id = String(++toastId);
  toasts.push({ id, message, type });
  notify();
  setTimeout(() => {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx !== -1) { toasts.splice(idx, 1); notify(); }
  }, 4000);
}

function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

function getToasts() { return snapshot; }

const iconMap = {
  success: "✓",
  error: "✕",
  info: "i",
  warning: "!",
};

export function ToastContainer() {
  const currentToasts = useSyncExternalStore(subscribe, getToasts, getToasts);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {currentToasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-sm border shadow-premium",
              "backdrop-blur-xl",
              t.type === "success" && "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
              t.type === "error" && "bg-red-500/15 border-red-500/30 text-red-300",
              t.type === "info" && "bg-black/8 border-black/15 text-black/80",
              t.type === "warning" && "bg-amber-500/15 border-amber-500/30 text-amber-300",
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/20 text-xs font-bold">
              {iconMap[t.type]}
            </span>
            <p className="text-sm flex-1">{t.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}