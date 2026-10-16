/**
 * The global stop, in the status bar.
 *
 * It lives here, and not inside Developer Mode, because a control that keeps
 * working when everything else is misbehaving has to be reachable without
 * navigating: one press stops all work, and the release is a second, separate
 * press. There is no confirmation on the way in — stopping is the safe
 * direction — and no automatic release anywhere.
 */

import { useEffect, useSyncExternalStore } from "react";
import { OctagonX } from "lucide-react";
import { emergencyStop, loadStop, releaseEmergencyStop, stopState, subscribeStop } from "../../control";
import { cn } from "../../lib/utils";

export function StopControl() {
  const stop = useSyncExternalStore(subscribeStop, stopState, stopState);

  useEffect(() => {
    void loadStop();
  }, []);

  if (!stop.engaged) {
    return (
      <button
        type="button"
        onClick={() => emergencyStop({ reason: "the operator stopped all work from the status bar" })}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm font-sans text-2xs text-muted hover:text-bone hover:bg-bone/5 transition-colors"
        title="Stop all work now: no tool call, no task step, and everything running is aborted. You release it from the same button."
      >
        <OctagonX size={11} /> Stop all work
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-sm font-sans text-2xs text-accent bg-accent/10")}
        title={`Stopped: ${stop.reason}. No tool call or task step will run until this is released.`}
      >
        <OctagonX size={11} /> Stopped
      </span>
      <button
        type="button"
        onClick={() => releaseEmergencyStop()}
        className="px-2 py-0.5 rounded-sm font-sans text-2xs text-muted hover:text-bone hover:bg-bone/5 transition-colors"
        title="Release the stop. Tasks stay paused and grants stay revoked; resume them where their evidence is."
      >
        Release
      </button>
    </span>
  );
}
