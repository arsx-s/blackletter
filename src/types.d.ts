/// <reference types="vite/client" />

declare module "reactflow" {
  import { ComponentType, CSSProperties, MouseEvent as ReactMouseEvent } from "react";

  export type Node<T = Record<string, unknown>> = {
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: T;
    selected?: boolean;
    dragging?: boolean;
    width?: number;
    height?: number;
    parentNode?: string;
    zIndex?: number;
  };

  export type Edge<T = Record<string, unknown>> = {
    id: string;
    source: string;
    target: string;
    type?: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    style?: CSSProperties;
    animated?: boolean;
    selected?: boolean;
    data?: T;
    markerEnd?: { type: string; color?: string; width?: number; height?: number };
    markerStart?: { type: string; color?: string; width?: number; height?: number };
  };

  export type NodeProps<T = Record<string, unknown>> = {
    id: string;
    type: string;
    data: T;
    selected: boolean;
    isConnectable: boolean;
    x: number;
    y: number;
    targetPosition: Position;
    sourcePosition: Position;
    dragging: boolean;
    zIndex: number;
  };

  export enum Position { Left = "left", Top = "top", Right = "right", Bottom = "bottom" }

  export const Handle: ComponentType<{
    type: "source" | "target";
    position: Position;
    id?: string;
    className?: string;
    isConnectable?: boolean;
    style?: CSSProperties;
  }>;

  export const MarkerType: { ArrowClosed: string; Arrow: string };
  export const Background: ComponentType<{ color?: string; gap?: number; size?: number; variant?: string }>;
  export const Controls: ComponentType<{ className?: string; showInteractive?: boolean; style?: CSSProperties }>;
  export const MiniMap: ComponentType<{ className?: string; style?: CSSProperties }>;
  export function useNodesState<T = Record<string, unknown>>(nodes: Node<T>[]): [Node<T>[], (changes: unknown) => void, (nodes: Node<T>[]) => void];
  export function useEdgesState<T = Record<string, unknown>>(edges: Edge<T>[]): [Edge<T>[], (changes: unknown) => void, (edges: Edge<T>[]) => void];
  export function useReactFlow(): { fitView: (opts?: { padding?: number }) => void; zoomTo: (level: number) => void; setCenter: (x: number, y: number, zoom?: number) => void; getNodes: () => Node<any>[]; getEdges: () => Edge<any>[]; };
  export type ReactFlowProps = {
    nodes: Node<any>[];
    edges: Edge<any>[];
    onNodesChange?: (changes: unknown) => void;
    onEdgesChange?: (changes: unknown) => void;
    onNodeClick?: (event: unknown, node: Node<any>) => void;
    onNodeMouseEnter?: (event: unknown, node: Node<any>) => void;
    onNodeMouseLeave?: (event: unknown, node: Node<any>) => void;
    nodeTypes?: Record<string, ComponentType<any>>;
    fitView?: boolean;
    className?: string;
    minZoom?: number;
    maxZoom?: number;
    nodesDraggable?: boolean;
    nodesConnectable?: boolean;
    elementsSelectable?: boolean;
    panOnScroll?: boolean;
    zoomOnDoubleClick?: boolean;
    attributionPosition?: string;
    defaultEdgeOptions?: { style?: CSSProperties; type?: string };
    children?: React.ReactNode;
  };
  export function ReactFlow(props: ReactFlowProps): JSX.Element;
  export function ReactFlowProvider({ children }: { children: React.ReactNode }): JSX.Element;
}

interface ElectronAPI {
  platform: string;
  openExternal: (url: string) => void;
  apiBase: string;
}

interface Window {
  electronAPI?: ElectronAPI;
}