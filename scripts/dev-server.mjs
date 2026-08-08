import http from "node:http";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT = 55000;
const PORT = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch (e) {
        reject(new Error("Invalid JSON body: " + e.message));
      }
    });
    req.on("error", reject);
  });
}

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function writeSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function handleChat(req, res) {
  console.log(`[DEV-SERVER] +-- /api/chat --+`);

  const body = await readBody(req);
  const { prompt, systemInstruction, model, temperature, maxTokens } = body;

  if (!prompt || typeof prompt !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing or invalid prompt" }));
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log(`[DEV-SERVER] OPENROUTER_API_KEY not set`);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ error: { code: "NO_KEY", message: "OpenRouter API key not configured. Set OPENROUTER_API_KEY in your environment." } })}\n\n`);
    res.end();
    return;
  }

  const selectedModel = model || "openai/gpt-4o-mini";
  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: prompt });

  console.log(`[DEV-SERVER] model=${selectedModel}, prompt=${prompt.length}ch`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://blackletter.ai",
        "X-Title": "BlackLetter",
      },
      body: JSON.stringify({ model: selectedModel, messages, stream: true, ...(typeof temperature === "number" ? { temperature } : {}), ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}) }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`[DEV-SERVER] OpenRouter HTTP ${response.status}`);

    if (!response.ok) {
      let errorBody = "";
      try { errorBody = await response.text(); } catch { errorBody = "(no body)"; }

      let errorCode = "API_ERROR";
      if (response.status === 401) errorCode = "UNAUTHORIZED";
      else if (response.status === 402) errorCode = "INSUFFICIENT_CREDITS";
      else if (response.status === 403) errorCode = "FORBIDDEN";
      else if (response.status === 404) errorCode = "MODEL_NOT_FOUND";
      else if (response.status === 429) errorCode = "RATE_LIMITED";
      else if (response.status >= 500) errorCode = "SERVER";

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ error: { code: errorCode, message: `OpenRouter (HTTP ${response.status}): ${errorBody.slice(0, 300)}` } })}\n\n`);
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const reader = response.body.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: { code: "SERVER", message: "No response stream." } })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

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
      }
    }

    console.log(`[DEV-SERVER] stream complete`);
    res.end();
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DEV-SERVER] error: ${msg}`);

    if (!res.headersSent) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
    }
    try {
      res.write(`data: ${JSON.stringify({ error: { code: "SERVER", message } })}\n\n`);
      res.end();
    } catch { }
  }
}

const server = http.createServer((req, res) => {
  console.log(`[DEV-SERVER] ${req.method} ${req.url}`);
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    handleChat(req, res).catch((err) => {
      console.error(`[DEV-SERVER] UNHANDLED: ${err.message}`, err.stack);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, () => {
  console.log(`[DEV-SERVER] listening on http://localhost:${PORT}`);
  console.log(`[DEV-SERVER] Vite -> /api/* -> http://localhost:${PORT}`);
});
