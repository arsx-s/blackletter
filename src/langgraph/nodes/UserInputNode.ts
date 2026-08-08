import type { GraphState } from "../types";
import { log } from "../logger";

export async function UserInputNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "UserInputNode: validating input");

  const raw = state.userPrompt;
  if (!raw || raw.trim().length === 0) {
    return { error: "Prompt is empty. Enter a topic or question to learn about." };
  }

  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length > 10000) {
    return { error: `Prompt is ${normalized.length} characters. Maximum is 10,000.` };
  }

  for (const f of state.uploadedDocuments) {
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const supportedMime = /^text\/|^application\/pdf$|^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$|^application\/octet-stream$/;
    const supportedExt = /\.(txt|md|pdf|docx)$/i;
    if (f.size > MAX_FILE_SIZE) {
      return { error: `"${f.name}" (${(f.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit.` };
    }
    const ok = supportedMime.test(f.type) || supportedExt.test(f.name);
    if (!ok) {
      return { error: `"${f.name}" is not supported. Use .txt, .md, .pdf, or .docx.` };
    }
  }

  log("NODE", "UserInputNode: OK — " + normalized.slice(0, 50));
  return { userPrompt: normalized };
}
