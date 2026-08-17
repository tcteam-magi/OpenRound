/* Anthropic provider. Pure fetch; the API key comes in as an argument so
   this module works anywhere and never reads the environment itself. */

export const name = "anthropic";
export const label = "Anthropic (Claude)";
export const defaultModel = "claude-opus-5";
export const envKey = "ANTHROPIC_API_KEY";

export async function chat({ apiKey, model, system, messages, schema }) {
  // OAuth tokens (sk-ant-oat...) authenticate with a Bearer header; API keys use x-api-key.
  // OAuth requests are also gated on the system prompt starting with the Claude Code
  // identity line, so prepend it as its own block when using an OAuth token.
  const isOauth = apiKey.startsWith("sk-ant-oat");
  const systemBlocks = [
    ...(isOauth ? [{ type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." }] : []),
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
  ];
  const body = {
    model,
    max_tokens: 16000,
    fallbacks: "default",
    system: systemBlocks,
    messages,
    output_config: { format: { type: "json_schema", schema } },
  };
  const doFetch = (payload, beta) => {
    const betas = [
      ...(isOauth ? ["oauth-2025-04-20"] : []),
      ...(beta ? ["server-side-fallback-2026-07-01"] : []),
    ];
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(isOauth ? { authorization: `Bearer ${apiKey}` } : { "x-api-key": apiKey }),
        "anthropic-version": "2023-06-01",
        ...(betas.length ? { "anthropic-beta": betas.join(",") } : {}),
      },
      body: JSON.stringify(payload),
    });
  };

  let resp = await doFetch(body, true);
  if (resp.status === 400) {
    // Server-side fallbacks are a beta; retry without them before giving up.
    const { fallbacks, ...withoutFallbacks } = body;
    resp = await doFetch(withoutFallbacks, false);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 429) {
      throw new Error(`Rate limited (429) on ${model}. Try another model, e.g. claude-haiku-4-5-20251001.`);
    }
    throw new Error(data.error?.message || `Anthropic API error (${resp.status})`);
  }
  if (data.stop_reason === "refusal") {
    throw new Error("The model declined this request (safety refusal). Rephrase your pitch content and try again.");
  }
  const text = (data.content || []).find((b) => b.type === "text");
  if (!text) throw new Error("Empty response from model.");
  return JSON.parse(text.text);
}
