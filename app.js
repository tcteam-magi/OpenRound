/* OpenRound v0 — static, BYOK, no backend.
   The persona markdown IS the product: it's injected wholesale into the
   system prompt, and every turn comes back through one JSON schema so the
   UI never has to parse investor prose. */

"use strict";

// ---------------------------------------------------------------- stages
const STAGES = [
  {
    id: "pre-seed",
    name: "Pre-seed",
    who: "The Angel",
    desc: "Founder-market fit, size of vision, your core hypothesis. Numbers barely matter yet — your clarity does.",
    file: "personas/pre-seed-angel.md",
  },
  {
    id: "seed",
    name: "Seed",
    who: "The Seed VC",
    desc: "What your traction means, ICP clarity, GTM hypothesis, why now. Every claim needs a denominator.",
    file: "personas/seed-vc.md",
  },
  {
    id: "series-a",
    name: "Series A",
    who: "The Metrics Partner",
    desc: "ARR quality, retention cohorts, burn multiple, a sales machine that works without you. The story is the numbers.",
    file: "personas/series-a-partner.md",
  },
];

// ------------------------------------------------------- structured output
// Constraints per structured-outputs rules: additionalProperties:false,
// everything required, nullability via anyOf.
const REPORT_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string" },
          weight: { type: "integer" },
          score: { type: "integer" },
          comment: { type: "string" },
        },
        required: ["criterion", "weight", "score", "comment"],
        additionalProperties: false,
      },
    },
    weaknesses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          your_answer_gist: { type: "string" },
          why_it_hurt: { type: "string" },
        },
        required: ["question", "your_answer_gist", "why_it_hurt"],
        additionalProperties: false,
      },
    },
    verdict: { type: "string" },
  },
  required: ["scores", "weaknesses", "verdict"],
  additionalProperties: false,
};

const TURN_SCHEMA = {
  type: "object",
  properties: {
    phase: { type: "string", enum: ["questions", "report"] },
    round_label: { type: "string" },
    commentary: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    report: { anyOf: [{ type: "null" }, REPORT_SCHEMA] },
  },
  required: ["phase", "round_label", "commentary", "questions", "report"],
  additionalProperties: false,
};

// ------------------------------------------------------------ system prompt
function buildSystemPrompt(personaMd) {
  return `You are conducting a live pitch-grilling session. Adopt, completely and
in character, the investor persona defined between the markers below. The
persona file is your identity, your evaluation rubric, your red flags, your
question style, and your pass bar. Never break character, never mention that
you are an AI, and never soften a finding to be nice — the founder is here
precisely because real feedback is hard to get.

===== PERSONA FILE =====
${personaMd}
===== END PERSONA FILE =====

SESSION PROTOCOL
The founder has submitted their pitch as the first user message. Run exactly
this sequence, one assistant turn per round, waiting for the founder's answers
between rounds:

- Round 1 — "Clarifying" (phase: questions): 2 questions. Curious tone; map the
  pitch onto your rubric and probe what's ambiguous.
- Round 2 — "The rubric" (phase: questions): 3 questions. Your hardest attacks,
  aimed at the rubric lines where the pitch (and the Round 1 answers) are
  weakest. Apply your question style.
- Round 3 — "Red flags" (phase: questions): 2 questions. Press the weakest
  answers so far and any red flags you detected. Per your pass bar, an answer
  that was fog gets re-pressed here.
- After the founder answers Round 3 (phase: report): deliver the report.

RETRY MODE
If the founder later asks to retry their weakest answers, run one extra round
("Retry", phase: questions) of up to 3 questions targeting exactly those
weaknesses, then issue a fresh report that scores the retried areas on the new
answers and says plainly what improved and what did not.

OUTPUT CONTRACT
Every turn must satisfy the JSON schema you are constrained to:
- phase "questions": fill round_label and questions; report must be null.
  commentary is 1-3 sentences of in-character reaction to what you just heard.
- phase "report": questions must be an empty array. Scores: one entry per
  rubric criterion, weight copied from the rubric, score 0-10 where 10 means
  the answer fully met your pass bar. Weaknesses: the 2-3 answers that hurt
  the founder most, quoted by gist, with why_it_hurt in your voice. Verdict:
  2-4 sentences, in character, ending with whether you would take the next
  meeting.`;
}

// -------------------------------------------------------------- providers
async function callAnthropic({ key, model, system, messages }) {
  const body = {
    model,
    max_tokens: 16000,
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { format: { type: "json_schema", schema: TURN_SCHEMA } },
  };
  const doFetch = (payload, beta) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        ...(beta ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      },
      body: JSON.stringify(payload),
    });

  let resp = await doFetch(body, true);
  if (resp.status === 400) {
    // Fallbacks are beta; if this org/route rejects them, retry without.
    const { fallbacks, ...withoutFallbacks } = body;
    resp = await doFetch(withoutFallbacks, false);
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error (${resp.status})`);
  }
  const data = await resp.json();
  if (data.stop_reason === "refusal") {
    throw new Error("The model declined this request (safety refusal). Rephrase your pitch content and try again.");
  }
  const text = data.content.find((b) => b.type === "text");
  if (!text) throw new Error("Empty response from model.");
  return JSON.parse(text.text);
}

async function callOpenAI({ key, model, system, messages }) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      response_format: {
        type: "json_schema",
        json_schema: { name: "grilling_turn", strict: true, schema: TURN_SCHEMA },
      },
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error (${resp.status})`);
  }
  const data = await resp.json();
  return JSON.parse(data.choices[0].message.content);
}

const PROVIDERS = {
  anthropic: { call: callAnthropic, defaultModel: "claude-opus-5" },
  openai: { call: callOpenAI, defaultModel: "gpt-5" },
};

// ------------------------------------------------------------------ state
const state = {
  personaMd: null,
  stage: null,
  system: null,
  messages: [], // provider-agnostic {role, content:string}
  lastReport: null,
  busy: false,
};

// --------------------------------------------------------------- elements
const $ = (id) => document.getElementById(id);
const els = {
  provider: $("provider"), model: $("model"), apikey: $("apikey"),
  stages: $("stages"), pitch: $("pitch"), start: $("start"),
  setupError: $("setup-error"),
  panelSession: $("panel-session"), transcript: $("transcript"),
  answerBox: $("answer-box"), answer: $("answer"), send: $("send"),
  sessionError: $("session-error"),
  panelReport: $("panel-report"), report: $("report"),
  retry: $("retry"), restart: $("restart"),
};

// ------------------------------------------------------------------ setup
function restorePrefs() {
  const p = localStorage.getItem("pg.provider");
  if (p && PROVIDERS[p]) els.provider.value = p;
  els.model.value = localStorage.getItem("pg.model") || PROVIDERS[els.provider.value].defaultModel;
  els.apikey.value = localStorage.getItem("pg.key") || "";
}

els.provider.addEventListener("change", () => {
  els.model.value = PROVIDERS[els.provider.value].defaultModel;
  savePrefs();
});
[els.model, els.apikey].forEach((el) => el.addEventListener("change", savePrefs));
function savePrefs() {
  localStorage.setItem("pg.provider", els.provider.value);
  localStorage.setItem("pg.model", els.model.value);
  localStorage.setItem("pg.key", els.apikey.value);
}

function renderStages() {
  els.stages.innerHTML = "";
  for (const s of STAGES) {
    const btn = document.createElement("button");
    btn.className = "stage-card";
    btn.innerHTML = `<div class="stage-name">${s.name}</div><div class="stage-who">${s.who}</div><div class="stage-desc">${s.desc}</div>`;
    btn.addEventListener("click", () => {
      state.stage = s;
      document.querySelectorAll(".stage-card").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
    els.stages.appendChild(btn);
  }
}

// -------------------------------------------------------------- rendering
function esc(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

function addFounderTurn(text) {
  const div = document.createElement("div");
  div.className = "turn founder";
  div.innerHTML = `<div class="who">You</div><div class="bubble">${esc(text)}</div>`;
  els.transcript.appendChild(div);
}

function addInvestorTurn(turn) {
  const marker = document.createElement("div");
  marker.className = "round-marker";
  marker.textContent = turn.round_label;
  els.transcript.appendChild(marker);

  const div = document.createElement("div");
  div.className = "turn investor";
  const qs = turn.questions.map((q) => `<li>${esc(q)}</li>`).join("");
  div.innerHTML = `<div class="who">${esc(state.stage.who)}</div>
    <div class="bubble">
      <div class="commentary">${esc(turn.commentary)}</div>
      ${qs ? `<ol>${qs}</ol>` : ""}
    </div>`;
  els.transcript.appendChild(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
}

function addThinking() {
  const div = document.createElement("div");
  div.className = "thinking";
  div.id = "thinking";
  div.textContent = `${state.stage.who} is thinking`;
  els.transcript.appendChild(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
}
function removeThinking() {
  const t = $("thinking");
  if (t) t.remove();
}

function renderReport(report) {
  state.lastReport = report;
  const total = report.scores.reduce((a, s) => a + (s.score / 10) * s.weight, 0);
  const rows = report.scores
    .map(
      (s) => `
    <div class="score-row">
      <div class="crit">${esc(s.criterion)} <span style="color:var(--paper-dim)">(${s.weight})</span></div>
      <div class="bar"><i class="${s.score >= 7 ? "good" : ""}" style="width:${s.score * 10}%"></i></div>
      <div class="num">${s.score}/10</div>
    </div>
    <div class="score-comment">${esc(s.comment)}</div>`
    )
    .join("");
  const weak = report.weaknesses
    .map(
      (w) => `<li><strong>${esc(w.question)}</strong><br/>
        <span class="why">You said: "${esc(w.your_answer_gist)}" — ${esc(w.why_it_hurt)}</span></li>`
    )
    .join("");
  els.report.innerHTML = `
    <div class="report">
      <h3>Weighted score: ${Math.round(total)} / 100</h3>
      ${rows}
      <div class="weaknesses"><h4>Where you lost the room</h4><ul>${weak}</ul></div>
      <div class="verdict"><h4>Verdict</h4><p>"${esc(report.verdict)}"</p></div>
    </div>`;
  els.panelReport.hidden = false;
  els.retry.hidden = report.weaknesses.length === 0;
  els.panelReport.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------- session
async function investorTurn() {
  const provider = PROVIDERS[els.provider.value];
  state.busy = true;
  els.send.disabled = true;
  els.start.disabled = true;
  els.sessionError.innerHTML = "";
  addThinking();
  try {
    const turn = await provider.call({
      key: els.apikey.value.trim(),
      model: els.model.value.trim(),
      system: state.system,
      messages: state.messages,
    });
    // Keep the assistant's structured turn in history so it remembers itself.
    state.messages.push({ role: "assistant", content: JSON.stringify(turn) });
    removeThinking();
    if (turn.phase === "report" && turn.report) {
      addInvestorTurn({ ...turn, questions: [] });
      els.answerBox.hidden = true;
      renderReport(turn.report);
    } else {
      addInvestorTurn(turn);
      els.answerBox.hidden = false;
      els.answer.value = "";
      els.answer.focus();
    }
  } catch (e) {
    removeThinking();
    els.sessionError.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  } finally {
    state.busy = false;
    els.send.disabled = false;
    els.start.disabled = false;
  }
}

els.start.addEventListener("click", async () => {
  els.setupError.innerHTML = "";
  const problems = [];
  if (!els.apikey.value.trim()) problems.push("an API key");
  if (!state.stage) problems.push("a stage");
  if (!els.pitch.value.trim()) problems.push("your pitch");
  if (problems.length) {
    els.setupError.innerHTML = `<div class="error">Missing: ${problems.join(", ")}.</div>`;
    return;
  }
  savePrefs();
  try {
    const resp = await fetch(state.stage.file);
    if (!resp.ok) throw new Error();
    state.personaMd = await resp.text();
  } catch {
    els.setupError.innerHTML = `<div class="error">Couldn't load the persona file. Serve this folder over HTTP (e.g. <code>npx serve</code>) — opening index.html directly via file:// blocks it.</div>`;
    return;
  }
  state.system = buildSystemPrompt(state.personaMd);
  state.messages = [{ role: "user", content: `MY PITCH:\n\n${els.pitch.value.trim()}` }];
  els.transcript.innerHTML = "";
  els.panelSession.hidden = false;
  els.panelReport.hidden = true;
  addFounderTurn(els.pitch.value.trim());
  els.panelSession.scrollIntoView({ behavior: "smooth", block: "start" });
  await investorTurn();
});

els.send.addEventListener("click", async () => {
  const text = els.answer.value.trim();
  if (!text || state.busy) return;
  state.messages.push({ role: "user", content: text });
  addFounderTurn(text);
  els.answerBox.hidden = true;
  await investorTurn();
});

els.retry.addEventListener("click", async () => {
  if (state.busy || !state.lastReport) return;
  const targets = state.lastReport.weaknesses.map((w) => `- ${w.question}`).join("\n");
  const msg = `I want to retry my weakest answers. Grill me again on exactly these:\n${targets}`;
  state.messages.push({ role: "user", content: msg });
  addFounderTurn(msg);
  els.panelReport.hidden = true;
  await investorTurn();
});

els.restart.addEventListener("click", () => {
  state.messages = [];
  state.lastReport = null;
  els.transcript.innerHTML = "";
  els.panelSession.hidden = true;
  els.panelReport.hidden = true;
  els.answerBox.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ------------------------------------------------------------------- boot
restorePrefs();
renderStages();
