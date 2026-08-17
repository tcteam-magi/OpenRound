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
function buildSystemPrompt(personaMd, priorWeaknesses) {
  const history = priorWeaknesses && priorWeaknesses.length
    ? `

FOUNDER HISTORY
You have grilled this founder before. Last time, their weakest answers were:
${priorWeaknesses.map((w) => `- ${w.question} — ${w.why_it_hurt}`).join("\n")}
Weave at least one question that re-tests whether they have fixed the weakest
of these into Round 2 or Round 3, in your own words. If they have clearly
improved on a past weakness, say so in the report — in character, briefly.`
    : "";
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
  meeting.${history}`;
}

// -------------------------------------------------------------- providers
// All provider calls go through the local server (server.mjs), which holds
// the API keys in its environment. The schema travels with the request so
// the server stays a pass-through.
const DEFAULT_MODELS = { anthropic: "claude-opus-5", openai: "gpt-5" };
let serverConfig = { providers: {}, tts: false };

async function loadConfig() {
  try {
    serverConfig = await (await fetch("/api/config")).json();
  } catch {
    serverConfig = { providers: {}, tts: false };
  }
  const available = Object.keys(DEFAULT_MODELS).filter((p) => serverConfig.providers[p]);
  for (const opt of els.provider.options) opt.disabled = !serverConfig.providers[opt.value];
  if (!available.length) {
    els.keyStatus.innerHTML = `<span class="error-inline">No API keys found. Stop the server, run <code>export ANTHROPIC_API_KEY=...</code> (or <code>OPENAI_API_KEY=...</code>), then <code>node server.mjs</code> again.</span>`;
    return;
  }
  if (!serverConfig.providers[els.provider.value]) {
    els.provider.value = available[0];
    els.model.value = DEFAULT_MODELS[available[0]];
  }
  const found = [serverConfig.providers.anthropic && "Claude", serverConfig.providers.openai && "OpenAI"].filter(Boolean).join(" and ");
  els.keyStatus.textContent = serverConfig.tts
    ? `Keys found in your shell env: ${found}. Spoken questions use OpenAI audio.`
    : `Keys found in your shell env: ${found}. Spoken questions fall back to the browser voice; set OPENAI_API_KEY for the real one.`;
}

async function callProvider({ model, system, messages }) {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: els.provider.value,
      model,
      system,
      messages,
      schema: TURN_SCHEMA,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Server error (${resp.status})`);
  return data.turn;
}


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
  provider: $("provider"), model: $("model"), keyStatus: $("key-status"),
  stages: $("stages"), pitch: $("pitch"), start: $("start"),
  setupError: $("setup-error"),
  panelSession: $("panel-session"), transcript: $("transcript"),
  answerBox: $("answer-box"), answer: $("answer"), send: $("send"),
  sessionError: $("session-error"),
  panelReport: $("panel-report"), report: $("report"),
  retry: $("retry"), restart: $("restart"),
  deck: $("deck"), deckStatus: $("deck-status"),
  voiceToggle: $("voice-toggle"), mic: $("mic"),
  panelHistory: $("panel-history"), history: $("history"), clearHistory: $("clear-history"),
};

// ------------------------------------------------------------------ setup
function restorePrefs() {
  localStorage.removeItem("pg.key"); // keys no longer touch the browser
  const p = localStorage.getItem("pg.provider");
  if (p && p in DEFAULT_MODELS) els.provider.value = p;
  els.model.value = localStorage.getItem("pg.model") || DEFAULT_MODELS[els.provider.value];
}

els.provider.addEventListener("change", () => {
  els.model.value = DEFAULT_MODELS[els.provider.value];
  savePrefs();
});
els.model.addEventListener("change", savePrefs);
function savePrefs() {
  localStorage.setItem("pg.provider", els.provider.value);
  localStorage.setItem("pg.model", els.model.value);
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
  saveSessionToHistory(report, total);
}

// ---------------------------------------------------------------- session
async function investorTurn() {
  state.busy = true;
  els.send.disabled = true;
  els.start.disabled = true;
  els.sessionError.innerHTML = "";
  addThinking();
  try {
    const turn = await callProvider({
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
      speak([turn.commentary, turn.report.verdict]);
    } else {
      addInvestorTurn(turn);
      els.answerBox.hidden = false;
      els.mic.hidden = !SpeechRec;
      els.answer.value = "";
      els.answer.focus();
      speak([turn.commentary, ...turn.questions.map((q, i) => `Question ${i + 1}. ${q}`)]);
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
  if (!serverConfig.providers[els.provider.value]) {
    problems.push(`an ${els.provider.value === "openai" ? "OPENAI" : "ANTHROPIC"}_API_KEY in the server's environment`);
  }
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
  const lastSameStage = loadHistory().filter((h) => h.stage === state.stage.id).pop();
  state.system = buildSystemPrompt(state.personaMd, lastSameStage?.report?.weaknesses);
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

// ------------------------------------------------------------ deck upload
async function handleDeckFile(file) {
  if (!file) return;
  els.setupError.innerHTML = "";
  els.deckStatus.textContent = `Parsing ${file.name}…`;
  try {
    const text = await OpenRoundParse.parseFile(file);
    if (!text.trim()) {
      throw new Error("No extractable text — scanned PDF or image-only deck? Paste your text instead.");
    }
    const existing = els.pitch.value.trim();
    els.pitch.value = existing ? `${existing}\n\n${text}` : text;
    els.deckStatus.textContent = `${file.name} → ${text.length.toLocaleString()} characters extracted. Review below, edit freely, then enter the room.`;
  } catch (e) {
    els.deckStatus.textContent = "";
    els.setupError.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  } finally {
    els.deck.value = "";
  }
}

els.deck.addEventListener("change", () => handleDeckFile(els.deck.files[0]));
els.pitch.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.pitch.classList.add("dropping");
});
els.pitch.addEventListener("dragleave", () => els.pitch.classList.remove("dropping"));
els.pitch.addEventListener("drop", (e) => {
  e.preventDefault();
  els.pitch.classList.remove("dropping");
  handleDeckFile(e.dataTransfer.files[0]);
});

// ------------------------------------------------------------------- voice
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const voice = { on: false, rec: null, listening: false };

let currentAudio = null;
function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

async function speak(parts) {
  if (!voice.on) return;
  stopSpeaking();
  const text = parts.filter(Boolean).join(" ... ");
  if (serverConfig.tts) {
    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        currentAudio = new Audio(URL.createObjectURL(await resp.blob()));
        currentAudio.play();
        return;
      }
    } catch {
      // fall through to the browser voice
    }
  }
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.02;
    speechSynthesis.speak(u);
  }
}

els.voiceToggle.addEventListener("click", () => {
  voice.on = !voice.on;
  els.voiceToggle.textContent = voice.on ? "Voice: on" : "Voice: off";
  els.voiceToggle.classList.toggle("on", voice.on);
  if (!voice.on) stopSpeaking();
});

function stopListening() {
  voice.listening = false;
  els.mic.textContent = "\u{1F3A4} Speak";
  els.mic.classList.remove("recording");
  if (voice.rec) voice.rec.stop();
}

els.mic.addEventListener("click", () => {
  if (!SpeechRec) return;
  if (voice.listening) return stopListening();
  stopSpeaking(); // barge-in: the founder talking shuts the investor up
  voice.rec = new SpeechRec();
  voice.rec.lang = "en-US";
  voice.rec.continuous = true;
  voice.rec.interimResults = false;
  voice.rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        const t = e.results[i][0].transcript.trim();
        if (t) els.answer.value = (els.answer.value.trim() + " " + t).trim();
      }
    }
  };
  voice.rec.onend = () => { if (voice.listening) stopListening(); };
  voice.rec.onerror = () => stopListening();
  voice.listening = true;
  els.mic.textContent = "⏹ Stop";
  els.mic.classList.add("recording");
  voice.rec.start();
});

// ----------------------------------------------------------------- history
const HISTORY_KEY = "pg.history";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSessionToHistory(report, total) {
  const h = loadHistory();
  h.push({
    ts: Date.now(),
    stage: state.stage.id,
    stageName: state.stage.name,
    who: state.stage.who,
    total: Math.round(total),
    report,
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-30)));
  renderHistory();
}

function renderHistory() {
  const h = loadHistory();
  els.panelHistory.hidden = h.length === 0;
  if (!h.length) return;
  els.history.innerHTML = "";
  const prevByStage = {};
  const rows = h.map((s) => {
    const delta = prevByStage[s.stage] === undefined ? null : s.total - prevByStage[s.stage];
    prevByStage[s.stage] = s.total;
    return { s, delta };
  });
  for (const { s, delta } of rows.reverse()) {
    const d = new Date(s.ts);
    const when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const deltaHtml = delta === null ? "" :
      `<span class="delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} vs last ${esc(s.stageName)}</span>`;
    const weak = (s.report.weaknesses || [])
      .map((w) => `<li><strong>${esc(w.question)}</strong><br/><span class="why">${esc(w.why_it_hurt)}</span></li>`)
      .join("");
    const entry = document.createElement("details");
    entry.className = "hist-entry";
    entry.innerHTML = `
      <summary>
        <span class="hist-date">${when}</span>
        <span class="hist-stage">${esc(s.stageName)}</span>
        <span class="hist-score">${s.total}/100</span>
        ${deltaHtml}
      </summary>
      <div class="hist-body">
        <p class="verdict-line">“${esc(s.report.verdict)}”</p>
        ${weak ? `<ul>${weak}</ul>` : ""}
      </div>`;
    els.history.appendChild(entry);
  }
}

els.clearHistory.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

// ------------------------------------------------------------------- boot
restorePrefs();
renderStages();
renderHistory();
loadConfig();
