import { useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Landing } from "./components/landing/Landing";
import { OperatingSystem } from "./components/app/OperatingSystem";
import { ToastContainer } from "./components/ui/toast";
import { WorkspaceProvider } from "./stores/use-workspace";

export function App() {
  const [entered, setEntered] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const appState = useMemo(() => ({ entered, setEntered }), [entered]);

  if (!ready) return null;

  return (
    <main className="min-h-screen relative overflow-hidden">
      <ToastContainer />
      <WorkspaceProvider>
        <AnimatePresence mode="wait">
          {!appState.entered ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Landing onEnter={() => setEntered(true)} />
            </motion.div>
          ) : (
            <motion.div
              key="os"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <OperatingSystem onExit={() => setEntered(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </WorkspaceProvider>
    </main>
  );
}
