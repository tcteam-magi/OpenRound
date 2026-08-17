/* Anthropic provider. Pure fetch; the API key comes in as an argument so
   this module works anywhere and never reads the environment itself. */

export const name = "anthropic";
export const label = "Anthropic (Claude)";
export const defaultModel = "claude-opus-5";
export const envKey = "ANTHROPIC_API_KEY";

export async function chat({ apiKey, model, system, messages, schema }) {
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
        "x-api-key": apiKey,
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
