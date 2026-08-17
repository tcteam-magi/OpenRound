/* OpenRound local server. Node 18+, no dependencies.
   Serves the static app on 127.0.0.1 only and proxies provider calls so API
   keys stay in your shell environment. The browser never sees a key.

   Provider logic lives in providers/ (one module per provider); this file
   just adds keys from the environment and passes requests through.

   Usage:
     export ANTHROPIC_API_KEY=sk-ant-...   # for Claude
     export OPENAI_API_KEY=sk-...          # for OpenAI, and for spoken questions
     node server.mjs                       # http://127.0.0.1:3131 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { providers } from "./providers/index.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 3131;

// name → key, read once at startup from each provider's declared env var.
const KEYS = Object.fromEntries(
  Object.values(providers).map((p) => [p.name, process.env[p.envKey] || ""])
);

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

// ------------------------------------------------------------------- api
function handleConfig(res) {
  const available = {};
  for (const p of Object.values(providers)) available[p.name] = !!KEYS[p.name];
  const ttsProvider = Object.values(providers).find((p) => p.tts && KEYS[p.name]);
  json(res, 200, { providers: available, tts: !!ttsProvider });
}

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const { provider: providerName, model, system, messages, schema } = body;
    if (!providerName || !model || !system || !Array.isArray(messages) || !schema) {
      return json(res, 400, { error: "Missing provider, model, system, messages, or schema." });
    }
    const provider = providers[providerName];
    if (!provider) return json(res, 400, { error: `Unknown provider: ${providerName}` });
    if (!KEYS[provider.name]) {
      return json(res, 400, { error: `${provider.envKey} is not set. Export it and restart the server.` });
    }
    const turn = await provider.chat({ apiKey: KEYS[provider.name], model, system, messages, schema });
    json(res, 200, { turn });
  } catch (e) {
    json(res, 502, { error: e.message });
  }
}

async function handleTts(req, res) {
  const provider = Object.values(providers).find((p) => p.tts && KEYS[p.name]);
  if (!provider) return json(res, 501, { error: "Spoken questions need OPENAI_API_KEY." });
  try {
    const { text } = await readBody(req);
    if (!text) return json(res, 400, { error: "Missing text." });
    const audio = await provider.tts({ apiKey: KEYS[provider.name], text });
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(Buffer.from(audio));
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
    res.writeHead(200, {
      "content-type": MIME[extname(path)] || "application/octet-stream",
      // Local serving straight from disk: never let the browser cache, so a
      // git pull shows up on a plain refresh instead of a stale app.js.
      "cache-control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ------------------------------------------------------------------ server
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/config") return handleConfig(res);
  if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);
  if (req.method === "POST" && req.url === "/api/tts") return handleTts(req, res);
  return handleStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  const have = Object.values(providers)
    .filter((p) => KEYS[p.name])
    .map((p) => p.label)
    .join(", ") || "none";
  console.log(`OpenRound → http://127.0.0.1:${PORT}`);
  console.log(`Keys found in env: ${have}`);
  if (have === "none") {
    const vars = Object.values(providers).map((p) => p.envKey).join(" and/or ");
    console.log(`Set ${vars}, then restart.`);
  }
  if (!KEYS.openai) console.log("Spoken questions (TTS) need OPENAI_API_KEY; the browser voice is the fallback.");
});
