import type { VercelRequest, VercelResponse } from "@vercel/node";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT = 55000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  console.log(`[API/CHAT] +-- HANDLER STARTED --+`);

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { prompt, systemInstruction, model, temperature, maxTokens } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid prompt" });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.log(`[API/CHAT] FATAL: OPENROUTER_API_KEY not set`);
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ error: { code: "NO_KEY", message: "OpenRouter API key is not configured on the server." } })}\n\n`);
      res.end();
      return;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

const selectedModel = model || "openai/gpt-4o-mini";
    const requestBody: Record<string, unknown> = {
      model: selectedModel,
      messages,
      stream: true,
    };
    if (typeof temperature === "number") requestBody.temperature = temperature;
    if (typeof maxTokens === "number") requestBody.max_tokens = maxTokens;

    console.log(`[API/CHAT] model=${selectedModel}, messages=${messages.length}, prompt=${prompt.length}ch`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://blackletter.ai",
          "X-Title": "BlackLetter",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[API/CHAT] FETCH EXCEPTION: ${msg}`);
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ error: { code: "NETWORK", message: `Failed to reach OpenRouter: ${msg}` } })}\n\n`);
      res.end();
      return;
    }

    if (!response.ok) {
      let errorBody = "";
      try { errorBody = await response.text(); } catch { errorBody = "(no body)"; }
      console.log(`[API/CHAT] OpenRouter HTTP ${response.status}: ${errorBody.slice(0, 500)}`);

      let errorCode = "API_ERROR";
      if (response.status === 401) errorCode = "UNAUTHORIZED";
      else if (response.status === 402) errorCode = "INSUFFICIENT_CREDITS";
      else if (response.status === 403) errorCode = "FORBIDDEN";
      else if (response.status === 404) errorCode = "MODEL_NOT_FOUND";
      else if (response.status === 408) errorCode = "TIMEOUT";
      else if (response.status === 429) errorCode = "RATE_LIMITED";
      else if (response.status >= 500) errorCode = "SERVER";

      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ error: { code: errorCode, message: `OpenRouter (HTTP ${response.status}): ${errorBody.slice(0, 300)}` } })}\n\n`);
      res.end();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = response.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: { code: "SERVER", message: "No response body stream from OpenRouter." } })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalTokens = 0;
    let lineCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!trimmed.startsWith("data: ")) continue;

          res.write(trimmed + "\n\n");
          lineCount++;

          const data = trimmed.slice(6).trim();
          if (data && data !== "[DONE]") {
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                console.log(`[API/CHAT] OpenRouter SSE error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
              }
              const choices = parsed.choices;
              if (choices?.[0]?.delta?.content) {
                totalTokens += choices[0].delta.content.length;
              }
            } catch { }
          }
        }
      }
    } catch (streamErr) {
      const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      console.error(`[API/CHAT] STREAM EXCEPTION: ${msg}`);
      try { res.write(`data: ${JSON.stringify({ error: { code: "STREAM_ERROR", message: `Stream interrupted: ${msg}` } })}\n\n`); } catch { }
      try { res.end(); } catch { }
      return;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[API/CHAT] complete: ${totalTokens} chars in ${lineCount} lines, ${elapsed}ms`);
    res.end();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : "";
    console.error(`[API/CHAT] GLOBAL CATCH: ${message}`, stack);

    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
      return res.status(500).json({ success: false, error: message, stack });
    }

    try {
      res.write(`data: ${JSON.stringify({ error: { code: "SERVER", message } })}\n\n`);
      res.end();
    } catch { }
  }
}
