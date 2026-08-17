/* Provider registry, aisuite-style: models are addressed as
   "provider:model" (for example "anthropic:claude-opus-5"), and adding a
   provider means adding one file here and registering it below. A provider
   module exports: name, label, defaultModel, envKey, chat(), and
   optionally tts(). */

import * as anthropic from "./anthropic.mjs";
import * as openai from "./openai.mjs";

export const providers = { anthropic, openai };

export const DEFAULT_MODELS = Object.fromEntries(
  Object.values(providers).map((p) => [p.name, p.defaultModel])
);

export function getProvider(name) {
  const p = providers[name];
  if (!p) {
    throw new Error(`Unknown provider "${name}". Available: ${Object.keys(providers).join(", ")}`);
  }
  return p;
}

// "anthropic:claude-opus-5" → { provider, model }
// "anthropic" → that provider with its default model.
export function resolveModel(spec) {
  if (typeof spec !== "string" || !spec.trim()) {
    throw new Error(`Model must be a "provider:model" string, like "anthropic:claude-opus-5".`);
  }
  const i = spec.indexOf(":");
  const providerName = i === -1 ? spec : spec.slice(0, i);
  const provider = getProvider(providerName.trim());
  const model = i === -1 ? provider.defaultModel : spec.slice(i + 1).trim();
  if (!model) throw new Error(`Empty model in "${spec}".`);
  return { provider, model };
}
