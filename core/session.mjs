/* GrillingSession: OpenRound as a library.

   import { GrillingSession } from "openround";

   const session = new GrillingSession({
     model: "anthropic:claude-opus-5",   // "provider:model", aisuite-style
     stage: "seed",                      // pre-seed | seed | series-a
   });
   let turn = await session.start(pitchText);
   while (turn.phase === "questions") {
     turn = await session.answer(yourAnswer);
   }
   console.log(turn.report);

   The API key resolves from the `apiKey` option first, then from the
   provider's environment variable (ANTHROPIC_API_KEY / OPENAI_API_KEY). */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TURN_SCHEMA, buildSystemPrompt } from "./turn.mjs";
import { getStage, STAGES } from "./stages.mjs";
import { resolveModel } from "../providers/index.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export class GrillingSession {
  /**
   * @param {object} opts
   * @param {string} opts.model  "provider:model", e.g. "anthropic:claude-opus-5".
   * @param {string} [opts.stage]  Stage id; default "seed". Ignored when personaMarkdown is given.
   * @param {string} [opts.personaMarkdown]  A custom persona file's contents.
   * @param {string} [opts.apiKey]  Falls back to the provider's env var.
   * @param {Array}  [opts.priorWeaknesses]  Weaknesses from a past report; the
   *   investor will re-test at least one.
   */
  constructor({ model, stage = "seed", personaMarkdown, apiKey, priorWeaknesses } = {}) {
    const { provider, model: modelId } = resolveModel(model || "anthropic");
    this.provider = provider;
    this.model = modelId;
    this.stage = personaMarkdown ? null : getStage(stage);
    this.personaMarkdown = personaMarkdown || null;
    this.priorWeaknesses = priorWeaknesses || null;
    this.apiKey = apiKey || process.env[provider.envKey] || "";
    this.messages = [];
    this.lastTurn = null;
    this.report = null;
  }

  async start(pitch) {
    if (!pitch || !pitch.trim()) throw new Error("start(pitch) needs your pitch text.");
    if (this.messages.length) throw new Error("This session already started. Make a new GrillingSession.");
    if (!this.apiKey) {
      throw new Error(`No API key: pass apiKey or set ${this.provider.envKey}.`);
    }
    if (!this.personaMarkdown) {
      this.personaMarkdown = await readFile(join(ROOT, this.stage.file), "utf-8");
    }
    this.system = buildSystemPrompt(this.personaMarkdown, this.priorWeaknesses);
    this.messages.push({ role: "user", content: `MY PITCH:\n\n${pitch.trim()}` });
    return this.#turn();
  }

  async answer(text) {
    if (!this.messages.length) throw new Error("Call start(pitch) first.");
    if (!text || !text.trim()) throw new Error("answer(text) needs an answer.");
    this.messages.push({ role: "user", content: text.trim() });
    return this.#turn();
  }

  // Re-face the weaknesses from the last report.
  async retryWeakest() {
    if (!this.report) throw new Error("No report yet; finish the rounds first.");
    const targets = this.report.weaknesses.map((w) => `- ${w.question}`).join("\n");
    return this.answer(`I want to retry my weakest answers. Grill me again on exactly these:\n${targets}`);
  }

  async #turn() {
    const turn = await this.provider.chat({
      apiKey: this.apiKey,
      model: this.model,
      system: this.system,
      messages: this.messages,
      schema: TURN_SCHEMA,
    });
    this.messages.push({ role: "assistant", content: JSON.stringify(turn) });
    this.lastTurn = turn;
    if (turn.phase === "report" && turn.report) this.report = turn.report;
    return turn;
  }
}

export { STAGES };
