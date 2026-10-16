import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Landing } from "./components/landing/Landing";
import { OperatingSystem } from "./components/app/OperatingSystem";
import { ToastContainer } from "./components/ui/toast";
import { WorkspaceProvider } from "./stores/use-workspace";

/**
 * The design-system catalogue is a development/reference surface, not a product
 * route. It lives behind the `#design-system` hash so it stays reachable without
 * adding a fake destination to the app, and it is code-split so it never weighs
 * on the landing or OS bundles.
 */
const DesignSystemCatalogue = lazy(() =>
  import("./components/dev/DesignSystemCatalogue").then((m) => ({ default: m.DesignSystemCatalogue })),
);

const CATALOGUE_HASH = "#design-system";

export function App() {
  const [entered, setEntered] = useState(false);
  const [ready, setReady] = useState(false);
  const [showCatalogue, setShowCatalogue] = useState(
    () => typeof window !== "undefined" && window.location.hash === CATALOGUE_HASH,
  );

  useEffect(() => {
    setReady(true);
    const onHashChange = () => setShowCatalogue(window.location.hash === CATALOGUE_HASH);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const appState = useMemo(() => ({ entered, setEntered }), [entered]);

  if (!ready) return null;

  // Rendered outside the app's `overflow-hidden` shell so the catalogue page can scroll freely.
  if (showCatalogue) {
    return (
      <Suspense fallback={null}>
        <DesignSystemCatalogue />
      </Suspense>
    );
  }

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
