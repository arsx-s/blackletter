import { motion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import type { TimelineEvent } from "../../lib/research";

interface TimelineProps {
  events: TimelineEvent[];
}

export function Timeline({ events }: TimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <CalendarClock size={16} className="text-black/20 mx-auto mb-2" />
        <p className="font-sans text-2xs text-black/30">No timeline events detected</p>
        <p className="font-sans text-2xs text-black/20 mt-1">Dates appear here automatically during research</p>
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => parseInt(a.date) - parseInt(b.date));

  return (
    <div className="relative py-4 px-3">
      <div className="absolute left-[19px] top-0 bottom-0 w-px bg-black/10" />
      <div className="space-y-3">
        {sorted.map((event, i) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            className="relative pl-8"
          >
            <div className="absolute left-[14px] top-[6px] w-[11px] h-[11px] rounded-full border-2 border-black/30 bg-ink z-10" />
            <div className="p-2.5 rounded-lg bg-black/[0.03] border border-black/8 hover:bg-black/[0.06] transition-colors">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-mono text-2xs font-medium text-bone/60">{event.date}</span>
              </div>
              <p className="font-sans text-xs text-black/60 leading-relaxed line-clamp-2">
                {event.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
