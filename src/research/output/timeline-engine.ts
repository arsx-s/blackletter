import type { TimelineEvent, TimelineEventType, ResearchProject } from "../types";

let idCounter = 0;

function genId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class TimelineEngine {
  addEvent(
    project: ResearchProject,
    type: TimelineEventType,
    title: string,
    description: string,
    metadata?: {
      documentIds?: string[];
      messageIds?: string[];
      insightIds?: string[];
      milestone?: boolean;
    },
  ): TimelineEvent {
    const event: TimelineEvent = {
      id: genId("tl"),
      type,
      title,
      description,
      timestamp: Date.now(),
      linkedDocumentIds: metadata?.documentIds ?? [],
      linkedMessageIds: metadata?.messageIds ?? [],
      linkedInsightIds: metadata?.insightIds ?? [],
      milestone: metadata?.milestone ?? false,
    };

    project.timeline.push(event);
    project.updatedAt = Date.now();
    return event;
  }

  getTimeline(project: ResearchProject, options?: {
    types?: TimelineEventType[];
    milestonesOnly?: boolean;
    limit?: number;
    since?: number;
  }): TimelineEvent[] {
    let events = [...project.timeline];

    if (options?.types && options.types.length > 0) {
      events = events.filter((e) => options.types!.includes(e.type));
    }

    if (options?.milestonesOnly) {
      events = events.filter((e) => e.milestone);
    }

    if (options?.since) {
      events = events.filter((e) => e.timestamp >= options.since!);
    }

    events.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit && options.limit > 0) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  getMilestones(project: ResearchProject): TimelineEvent[] {
    return this.getTimeline(project, { milestonesOnly: true });
  }

  getTimelineByDate(project: ResearchProject): Map<string, TimelineEvent[]> {
    const grouped = new Map<string, TimelineEvent[]>();
    const sorted = [...project.timeline].sort((a, b) => a.timestamp - b.timestamp);

    for (const event of sorted) {
      const date = new Date(event.timestamp).toISOString().split("T")[0];
      const arr = grouped.get(date) ?? [];
      arr.push(event);
      grouped.set(date, arr);
    }

    return grouped;
  }

  summarizeTimeline(project: ResearchProject): string {
    const total = project.timeline.length;
    const milestones = project.timeline.filter((e) => e.milestone).length;
    const documentEvents = project.timeline.filter((e) => e.type === "document-added").length;
    const insightEvents = project.timeline.filter((e) => e.type === "insight-generated").length;
    const questionEvents = project.timeline.filter((e) => e.type === "question-identified").length;
    const reportEvents = project.timeline.filter((e) => e.type === "report-generated").length;

    const parts: string[] = [
      `**Research Timeline Summary**`,
      `Total events: ${total}`,
      `Milestones: ${milestones}`,
      `Documents added: ${documentEvents}`,
      `Insights generated: ${insightEvents}`,
      `Questions identified: ${questionEvents}`,
      `Reports generated: ${reportEvents}`,
    ];

    if (total > 0) {
      const start = new Date(project.timeline[0].timestamp);
      const end = new Date(project.timeline[project.timeline.length - 1].timestamp);
      parts.push(`Period: ${start.toLocaleDateString()} — ${end.toLocaleDateString()}`);
    }

    return parts.join("\n");
  }
}
