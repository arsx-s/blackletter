import type { TimelineEntry } from "../knowledge/types";

export type CanvasBlockType =
  | "chat"
  | "report"
  | "document"
  | "note"
  | "knowledge"
  | "sticky"
  | "diagram"
  | "timeline"
  | "code"
  | "summary"
  | "mindmap"
  | "table"
  | "image"
  | "pdf";

export interface CanvasBlockData {
  tabId?: string;
  documentId?: string;
  noteId?: string | null;
  text?: string;
  code?: string;
  language?: string;
  events?: TimelineEntry[];
  imageSrc?: string;
  columns?: number;
}

export interface CanvasBlock {
  id: string;
  workspaceId: string;
  type: CanvasBlockType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  pinned: boolean;
  color: string | null;
  createdAt: number;
  updatedAt: number;
  data: CanvasBlockData;
}

export interface CanvasEdge {
  id: string;
  workspaceId: string;
  fromBlockId: string;
  toBlockId: string;
  label: string;
  createdAt: number;
}

export interface CanvasSnapshot {
  id: string;
  workspaceId: string;
  at: number;
  label: string;
  blocks: CanvasBlock[];
  edges: CanvasEdge[];
}

export const CANVAS_BLOCK_DEFAULT_SIZE: Record<CanvasBlockType, { w: number; h: number }> = {
  chat: { w: 400, h: 380 },
  report: { w: 640, h: 560 },
  document: { w: 340, h: 400 },
  note: { w: 320, h: 280 },
  knowledge: { w: 520, h: 400 },
  sticky: { w: 220, h: 180 },
  diagram: { w: 480, h: 380 },
  timeline: { w: 460, h: 320 },
  code: { w: 420, h: 300 },
  summary: { w: 400, h: 320 },
  mindmap: { w: 480, h: 380 },
  table: { w: 440, h: 300 },
  image: { w: 360, h: 320 },
  pdf: { w: 380, h: 420 },
};

export const CANVAS_BLOCK_TYPES: CanvasBlockType[] = [
  "chat", "report", "document", "note", "knowledge", "sticky", "diagram", "timeline", "code", "summary", "mindmap", "table", "image", "pdf",
];

export function canvasEdgeId(fromBlockId: string, toBlockId: string): string {
  return `edge-${fromBlockId}-${toBlockId}`;
}
