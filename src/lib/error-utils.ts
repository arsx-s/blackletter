export function getReadableError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error !== null && typeof error === "object") {
    const obj = error as Record<string, unknown>;

    if (typeof obj.message === "string") {
      return obj.message;
    }

    if (typeof obj.error === "string") {
      return obj.error;
    }

    if (typeof obj.details === "string") {
      return obj.details;
    }

    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

export function logError(prefix: string, error: unknown, context?: string): void {
  const label = context ? `${prefix} [${context}]` : prefix;
  console.error(`${label}:`, error);

  if (error !== null && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    if (obj.stack && typeof obj.stack === "string") {
      console.error(`${label} stack:`, obj.stack);
    }
  }
}
