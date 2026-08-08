import type { PipelineContext, PipelineInput } from "./types";

export interface UserInputResult {
  normalizedQuery: string;
  input: PipelineInput;
}

export async function executeUserInput(ctx: PipelineContext): Promise<UserInputResult> {
  const input = ctx.input;
  const raw = input.prompt;

  if (!raw || raw.trim().length === 0) {
    throw { code: "EMPTY_PROMPT", message: "Prompt is empty. Enter a topic or question to learn about." };
  }

  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length > 10000) {
    throw { code: "PROMPT_TOO_LONG", message: `Prompt is ${normalized.length} characters. Maximum is 10,000.` };
  }

  if (input.files && input.files.length > 0) {
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const supportedMime = /^text\/|^application\/pdf$|^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$|^application\/octet-stream$/;
    const supportedExt = /\.(txt|md|pdf|docx)$/i;
    for (const f of input.files) {
      if (f.size > MAX_FILE_SIZE) {
        throw { code: "FILE_TOO_LARGE", message: `"${f.name}" (${(f.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit.` };
      }
      const ok = supportedMime.test(f.type) || supportedExt.test(f.name);
      if (!ok) {
        throw { code: "UNSUPPORTED_FILE", message: `"${f.name}" is not supported. Use .txt, .md, .pdf, or .docx.` };
      }
    }
  }

  return {
    normalizedQuery: normalized,
    input,
  };
}
