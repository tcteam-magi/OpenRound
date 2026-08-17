/* OpenRound local server. Node 18+, no dependencies.
   Serves the static app on 127.0.0.1 only and proxies provider calls so API
   keys stay in your shell environment. The browser never sees a key.

   Usage:
     export ANTHROPIC_API_KEY=sk-ant-...   # for Claude
     export OPENAI_API_KEY=sk-...          # for OpenAI, and for spoken questions
     node server.mjs                       # http://127.0.0.1:3131 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 3131;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function json(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function readBody(req, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
}

// ------------------------------------------------------------ chat proxying
// The turn schema lives in the browser (app.js) and arrives with the request,
// so the server stays a dumb, auditable pass-through plus auth.

async function chatAnthropic({ model, system, messages, schema }) {
  const body = {
    model,
    max_tokens: 16000,
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { format: { type: "json_schema", schema } },
  };
  const doFetch = (payload, beta) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        ...(beta ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      },
      body: JSON.stringify(payload),
    });

  let resp = await doFetch(body, true);
  if (resp.status === 400) {
    // Server-side fallbacks are a beta; retry without them before giving up.
    const { fallbacks, ...withoutFallbacks } = body;
    resp = await doFetch(withoutFallbacks, false);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error?.message || `Anthropic API error (${resp.status})`);
  }
  if (data.stop_reason === "refusal") {
    throw new Error("The model declined this request (safety refusal). Rephrase your pitch content and try again.");
  }
  const text = (data.content || []).find((b) => b.type === "text");
  if (!text) throw new Error("Empty response from model.");
  return JSON.parse(text.text);
}

async function chatOpenAI({ model, system, messages, schema }) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      response_format: {
        type: "json_schema",
        json_schema: { name: "grilling_turn", strict: true, schema },
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error?.message || `OpenAI API error (${resp.status})`);
  }
  return JSON.parse(data.choices[0].message.content);
}

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const { provider, model, system, messages, schema } = body;
    if (!provider || !model || !system || !Array.isArray(messages) || !schema) {
      return json(res, 400, { error: "Missing provider, model, system, messages, or schema." });
    }
    let turn;
    if (provider === "anthropic") {
      if (!ANTHROPIC_KEY) return json(res, 400, { error: "ANTHROPIC_API_KEY is not set. Export it and restart the server." });
      turn = await chatAnthropic(body);
    } else if (provider === "openai") {
      if (!OPENAI_KEY) return json(res, 400, { error: "OPENAI_API_KEY is not set. Export it and restart the server." });
      turn = await chatOpenAI(body);
    } else {
      return json(res, 400, { error: `Unknown provider: ${provider}` });
    }
    json(res, 200, { turn });
  } catch (e) {
    json(res, 502, { error: e.message });
  }
}

// ------------------------------------------------------------------- tts
async function handleTts(req, res) {
  if (!OPENAI_KEY) return json(res, 501, { error: "Spoken questions need OPENAI_API_KEY." });
  try {
    const { text } = await readBody(req);
    if (!text) return json(res, 400, { error: "Missing text." });
    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "onyx",
        input: text.slice(0, 4000),
        response_format: "mp3",
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return json(res, 502, { error: err.error?.message || `OpenAI TTS error (${resp.status})` });
    }
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(Buffer.from(await resp.arrayBuffer()));
  } catch (e) {
    json(res, 502, { error: e.message });
  }
}

// ---------------------------------------------------------------- static
async function handleStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (path === "" || path === ".") path = "index.html";
  if (path.includes("..")) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ------------------------------------------------------------------ server
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/config") {
    return json(res, 200, {
      providers: { anthropic: !!ANTHROPIC_KEY, openai: !!OPENAI_KEY },
      tts: !!OPENAI_KEY,
    });
  }
  if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);
  if (req.method === "POST" && req.url === "/api/tts") return handleTts(req, res);
  return handleStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  const have = [ANTHROPIC_KEY && "Claude", OPENAI_KEY && "OpenAI"].filter(Boolean).join(", ") || "none";
  console.log(`OpenRound → http://127.0.0.1:${PORT}`);
  console.log(`Keys found in env: ${have}`);
  if (!ANTHROPIC_KEY && !OPENAI_KEY) {
    console.log("Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY, then restart.");
  }
  if (!OPENAI_KEY) console.log("Spoken questions (TTS) need OPENAI_API_KEY; the browser voice is the fallback.");
});
