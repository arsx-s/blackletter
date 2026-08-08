const models = {
  research: "deepseek/deepseek-r1",
  learning: "anthropic/claude-sonnet-4",
  coding: "openai/gpt-4o-2024-11-20",
  fast: "google/gemini-2.5-flash",
  default: "openai/gpt-4o-mini",
} as const;

export type UseCase = keyof typeof models;

export function getModel(useCase?: string): string {
  if (useCase && useCase in models) {
    return models[useCase as UseCase];
  }
  return models.default;
}

export type ModelCategory = "fast" | "balanced" | "reasoning" | "coding" | "creative" | "research";

export interface ModelCategoryOption {
  id: ModelCategory;
  label: string;
  description: string;
  model: string;
}

export const MODEL_CATEGORIES: ModelCategoryOption[] = [
  { id: "fast", label: "Fast", description: "Snappy answers for everyday questions", model: "google/gemini-2.5-flash" },
  { id: "balanced", label: "Balanced", description: "A sensible default for most research", model: "openai/gpt-4o-mini" },
  { id: "reasoning", label: "Reasoning", description: "Deep step-by-step reasoning for hard problems", model: "deepseek/deepseek-r1" },
  { id: "creative", label: "Creative", description: "Expressive, thoughtful writing", model: "anthropic/claude-sonnet-4" },
  { id: "coding", label: "Coding", description: "Code, debugging, and technical work", model: "openai/gpt-4o-2024-11-20" },
  { id: "research", label: "Research", description: "Multi-source analysis with citations", model: "deepseek/deepseek-r1" },
];

export function categoryForModel(model?: string | null): ModelCategory {
  const id = MODEL_CATEGORIES.find((c) => c.model === model)?.id;
  return id ?? "balanced";
}

export function modelForCategory(category: ModelCategory): string {
  return MODEL_CATEGORIES.find((c) => c.id === category)?.model ?? models.default;
}

export interface ModelOption {
  id: string;
  label: string;
  useCase: UseCase;
}

export const MODEL_CATALOG: ModelOption[] = [
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", useCase: "research" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", useCase: "learning" },
  { id: "openai/gpt-4o-2024-11-20", label: "GPT-4o", useCase: "coding" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", useCase: "fast" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", useCase: "default" },
];

export default models;