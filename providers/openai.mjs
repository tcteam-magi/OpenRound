/* OpenAI provider: chat plus speech synthesis for voice mode.
   Pure fetch; the API key comes in as an argument. */

export const name = "openai";
export const label = "OpenAI";
export const defaultModel = "gpt-5";
export const envKey = "OPENAI_API_KEY";

export async function chat({ apiKey, model, system, messages, schema }) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
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

// Returns an ArrayBuffer of mp3 audio.
export async function tts({ apiKey, text }) {
  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
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
    throw new Error(err.error?.message || `OpenAI TTS error (${resp.status})`);
  }
  return resp.arrayBuffer();
}
