export type AnimationToken = {
  duration: number;
  easing: string;
  property: string;
};

export type AnimationPreset =
  | "fade-in"
  | "fade-in-up"
  | "fade-in-down"
  | "slide-in-left"
  | "slide-in-right"
  | "scale-in"
  | "expand"
  | "collapse"
  | "pulse"
  | "shimmer";

export type LoadingState = {
  id: string;
  label: string;
  description: string;
  icon: string;
  duration: number;
};

export type EmptyState = {
  id: string;
  title: string;
  description: string;
  action: string;
  icon: string;
};

export type ErrorTemplate = {
  id: string;
  title: string;
  description: string;
  recovery: string;
  action: string;
};

export type ElevationLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type StudioColorRole =
  | "brand"
  | "accent"
  | "surface"
  | "text"
  | "border"
  | "learning"
  | "research"
  | "knowledge"
  | "success"
  | "warning"
  | "error"
  | "source"
  | "connection";
