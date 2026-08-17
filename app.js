/* OpenRound web app (a module): the meeting.
   Two scenes. The lobby is where you pick a door; the room is where an
   investor speaks first, grades every answer, and, if you clear their bar,
   walks you upstairs to the next one. The turn schema, system prompt,
   stages (with the meeting script), and provider registry live in core/
   and providers/, shared with the SDK. */

import { TURN_SCHEMA, buildSystemPrompt } from "./core/turn.mjs";
import { CONNECT_SCHEMA, CONNECTOR, buildConnectorPrompt } from "./core/connect.mjs";
import { STAGES } from "./core/stages.mjs";
import { providers, DEFAULT_MODELS } from "./providers/index.mjs";

const INTRO_BAR = 60; // weighted score needed to earn the intro upstairs

// -------------------------------------------------------------- providers
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
  const found = Object.values(providers).filter((p) => serverConfig.providers[p.name]).map((p) => p.label).join(" and ");
  els.keyStatus.textContent = serverConfig.tts
    ? `Keys found in your shell env: ${found}. The investor speaks with OpenAI audio when voice is on.`
    : `Keys found in your shell env: ${found}. Voice falls back to the browser's own speech; set OPENAI_API_KEY for the real one.`;
}

async function callProvider({ model, system, messages, schema = TURN_SCHEMA }) {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: els.provider.value, model, system, messages, schema }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Server error (${resp.status})`);
  return data.turn;
}

// ------------------------------------------------------------------ state
const state = {
  mode: null,         // "connect" (the host) | "grill" (an investor)
  stage: null,        // current STAGES entry (grill mode)
  who: "",            // display name of whoever is across the table
  chain: null,        // {kind:"warm",fromWho,weaknesses,pitch} | {kind:"note",fromWho,note,pitch}
  system: null,
  messages: [],
  started: false,     // first send is the pitch (grill mode)
  pitchText: "",
  founderInputs: [],  // everything the founder told the host; longest one becomes the pitch
  lastReport: null,
  busy: false,
};

// --------------------------------------------------------------- elements
const $ = (id) => document.getElementById(id);
const els = {
  lobby: $("scene-lobby"), room: $("scene-room"),
  stages: $("stages"), keyStatus: $("key-status"), meetHost: $("meet-host"),
  history: $("history"), panelHistory: $("panel-history"), clearHistory: $("clear-history"),
  openSettings: $("open-settings"), settings: $("settings"), closeSettings: $("close-settings"),
  provider: $("provider"), model: $("model"),
  leave: $("leave"), roomName: $("room-name"), roomTag: $("room-tag"),
  voiceToggle: $("voice-toggle"),
  transcript: $("transcript"), sessionError: $("session-error"),
  deck: $("deck"), deckStatus: $("deck-status"), attach: $("attach"),
  answer: $("answer"), mic: $("mic"), send: $("send"),
};

function esc(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

function showError(msg) {
  els.sessionError.innerHTML = `<div class="error">${esc(msg)}</div>`;
  // The error slot lives in the room scene; if the lobby is up, surface it
  // there too instead of failing silently.
  if (els.room.hidden) els.keyStatus.innerHTML = `<span class="error-inline">${esc(msg)}</span>`;
}

// ------------------------------------------------------------------ prefs
function restorePrefs() {
  localStorage.removeItem("pg.key"); // keys never touch the browser
  const p = localStorage.getItem("pg.provider");
  if (p && p in DEFAULT_MODELS) els.provider.value = p;
  els.model.value = localStorage.getItem("pg.model") || DEFAULT_MODELS[els.provider.value];
}
function savePrefs() {
  localStorage.setItem("pg.provider", els.provider.value);
  localStorage.setItem("pg.model", els.model.value);
}
els.provider.addEventListener("change", () => {
  els.model.value = DEFAULT_MODELS[els.provider.value];
  savePrefs();
});
els.model.addEventListener("change", savePrefs);

function renderProviderOptions() {
  els.provider.innerHTML = "";
  for (const p of Object.values(providers)) {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = p.label;
    els.provider.appendChild(opt);
  }
}

els.openSettings.addEventListener("click", () => { els.settings.hidden = false; });
els.closeSettings.addEventListener("click", () => { els.settings.hidden = true; });
els.settings.addEventListener("click", (e) => { if (e.target === els.settings) els.settings.hidden = true; });

// ------------------------------------------------------------------ lobby
function renderDoors() {
  els.stages.innerHTML = "";
  for (const s of STAGES) {
    const btn = document.createElement("button");
    btn.className = "door";
    btn.setAttribute("role", "listitem");
    btn.innerHTML = `
      <span class="door-stage">${esc(s.name)}</span>
      <span class="door-who">${esc(s.who)}</span>
      <span class="door-desc">${esc(s.desc)}</span>
      <span class="door-enter">Enter the room →</span>`;
    btn.addEventListener("click", () => enterRoom(s, null));
    els.stages.appendChild(btn);
  }
}

// ------------------------------------------------------------------- room
async function fetchPersona(file) {
  const resp = await fetch(file);
  if (!resp.ok) throw new Error();
  return resp.text();
}

async function enterRoom(stage, chain) {
  stopSpeaking();
  state.mode = "grill";
  state.stage = stage;
  state.who = stage.who;
  state.chain = chain;
  state.messages = [];
  state.started = false;
  state.lastReport = null;
  state.pitchText = chain ? chain.pitch : "";
  els.sessionError.innerHTML = "";
  els.deckStatus.textContent = "";

  let personaMd;
  try {
    personaMd = await fetchPersona(stage.file);
  } catch {
    showError("Couldn't load the persona file. Serve this folder with node server.mjs; opening index.html directly via file:// blocks it.");
    return;
  }

  const warm = chain?.kind === "warm";
  const noted = chain?.kind === "note";
  const priorWeaknesses = warm
    ? chain.weaknesses
    : loadHistory().filter((h) => h.stage === stage.id).pop()?.report?.weaknesses;
  const warmIntro = warm
    ? `${chain.fromWho} put this founder through a full grilling, vouched for them, and made this introduction personally.`
    : null;
  state.system = buildSystemPrompt(personaMd, priorWeaknesses, warmIntro, noted ? chain.note : null);

  // set the scene
  els.roomName.textContent = stage.who;
  els.roomTag.hidden = !chain;
  if (chain) els.roomTag.textContent = warm ? `intro from ${chain.fromWho}` : `sent up by ${chain.fromWho}`;
  els.leave.textContent = "← Leave";
  els.lobby.hidden = true;
  els.room.hidden = false;
  els.transcript.innerHTML = "";
  els.mic.hidden = !SpeechRec;

  // the investor speaks first
  const opener = warm ? stage.introOpener : noted ? stage.notedOpener : stage.opener;
  addOpenerTurn(opener);
  speak([opener]);

  els.answer.disabled = false;
  els.answer.value = chain ? chain.pitch : "";
  els.answer.placeholder = "Your pitch. Paste it, attach a deck, or just talk…";
  autogrow();
  els.answer.focus({ preventScroll: true });
  els.deckStatus.textContent = warm
    ? "Same pitch, pre-filled. Tighten it if you learned something downstairs, then send."
    : noted
      ? "His note went up ahead of you. What you told him is pre-filled; shape it into the pitch, then send."
      : "";
}

// The front door: Mr. Knows-Everybody hears you out, then routes you.
async function enterConnector() {
  stopSpeaking();
  state.mode = "connect";
  state.stage = null;
  state.who = CONNECTOR.who;
  state.chain = null;
  state.messages = [];
  state.started = false;
  state.founderInputs = [];
  state.lastReport = null;
  els.sessionError.innerHTML = "";
  els.deckStatus.textContent = "";

  let personaMd;
  try {
    personaMd = await fetchPersona(CONNECTOR.file);
  } catch {
    showError("Couldn't load the host persona. Serve this folder with node server.mjs; opening index.html directly via file:// blocks it.");
    return;
  }

  const past = loadHistory().slice(-3).map((h) => ({
    when: Number.isFinite(h.ts) ? new Date(h.ts).toISOString().slice(0, 10) : "a while back",
    stageName: h.stageName,
    who: h.who,
    total: h.total,
  }));
  state.system = buildConnectorPrompt(personaMd, past);

  els.roomName.textContent = CONNECTOR.who;
  els.roomTag.hidden = true;
  els.leave.textContent = "Skip the small talk";
  els.lobby.hidden = true;
  els.room.hidden = false;
  els.transcript.innerHTML = "";
  els.mic.hidden = !SpeechRec;

  const opener = past.length ? CONNECTOR.openerReturning : CONNECTOR.opener;
  addOpenerTurn(opener);
  speak([opener]);

  els.answer.disabled = false;
  els.answer.value = "";
  els.answer.placeholder = "Tell him how it's going, paste your blurb, or attach the deck…";
  autogrow();
  els.answer.focus({ preventScroll: true });
}

function leaveRoom() {
  stopSpeaking();
  if (voice.listening) stopListening();
  els.room.hidden = true;
  els.lobby.hidden = false;
  renderHistory();
  window.scrollTo({ top: 0 });
}
els.leave.addEventListener("click", leaveRoom);

// -------------------------------------------------------------- rendering
// The transcript pane is the only scroller in the room; the window never moves.
const SMOOTH = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
function scrollTranscript(el) {
  els.transcript.scrollTo({
    top: el ? el.offsetTop - 12 : els.transcript.scrollHeight,
    behavior: SMOOTH,
  });
}

function addOpenerTurn(text) {
  const div = document.createElement("div");
  div.className = "turn investor";
  div.innerHTML = `<div class="who">${esc(state.who)}</div>
    <div class="bubble"><div class="opener">“${esc(text)}”</div></div>`;
  els.transcript.appendChild(div);
}

// The host talks in plain dialogue: no rounds, no grades, no lists.
function addConnectorTurn(text) {
  const div = document.createElement("div");
  div.className = "turn investor";
  div.innerHTML = `<div class="who">${esc(state.who)}</div>
    <div class="bubble">“${esc(text)}”</div>`;
  els.transcript.appendChild(div);
  scrollTranscript(div);
}

function addFounderTurn(text) {
  const div = document.createElement("div");
  div.className = "turn founder";
  div.innerHTML = `<div class="who">You</div><div class="bubble">${esc(text)}</div>`;
  els.transcript.appendChild(div);
  scrollTranscript();
}

function addInvestorTurn(turn) {
  const marker = document.createElement("div");
  marker.className = "round-marker";
  marker.textContent = turn.round_label;
  els.transcript.appendChild(marker);

  const div = document.createElement("div");
  div.className = "turn investor";
  const qs = turn.questions.map((q) => `<li>${esc(q)}</li>`).join("");
  const grades = (turn.answer_grades || [])
    .map((g, i) => `<span class="grade ${esc(g.verdict)}" title="${esc(g.question)} — ${esc(g.note)}">Q${i + 1} ${g.score}/10 ${esc(g.verdict)}</span>`)
    .join("");
  div.innerHTML = `<div class="who">${esc(state.who)}</div>
    <div class="bubble">
      ${grades ? `<div class="grades">${grades}</div>` : ""}
      <div class="commentary">${esc(turn.commentary)}</div>
      ${qs ? `<ol>${qs}</ol>` : ""}
    </div>`;
  els.transcript.appendChild(div);
  scrollTranscript(marker); // long replies read from the top, not the bottom
}

function addThinking() {
  const div = document.createElement("div");
  div.className = "thinking";
  div.id = "thinking";
  div.textContent = state.mode === "connect"
    ? `${state.who} is thinking who you should meet`
    : `${state.who} is weighing you`;
  els.transcript.appendChild(div);
  scrollTranscript();
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
  const card = document.createElement("div");
  card.className = "turn";
  card.innerHTML = `
    <div class="report">
      <h3>Weighted score: ${Math.round(total)} / 100</h3>
      ${rows}
      <div class="weaknesses"><h4>Where you lost the room</h4><ul>${weak}</ul></div>
      <div class="verdict"><h4>Verdict</h4><p>“${esc(report.verdict)}”</p></div>
    </div>`;
  els.transcript.appendChild(card);
  saveSessionToHistory(report, total);
  renderMoment(report, total);
  scrollTranscript(card);
}

// The moment after the verdict: an intro upstairs, a close, or the door.
function renderMoment(report, total) {
  const passed = Math.round(total) >= INTRO_BAR;
  const nextStage = state.stage.next ? STAGES.find((s) => s.id === state.stage.next) : null;

  const div = document.createElement("div");
  div.className = "turn moment";
  const line = passed
    ? state.stage.introLine
    : "No intro today. Fix what you just heard, then come back through the same door.";
  div.innerHTML = `<div class="who" style="text-align:center">${esc(state.stage.who)}</div>
    <div class="moment-line ${passed ? "pass" : "fail"}">“${esc(line)}”</div>
    <div class="moment-actions"></div>`;
  const actions = div.querySelector(".moment-actions");

  const mkBtn = (label, cls, fn) => {
    const b = document.createElement("button");
    b.className = cls;
    b.textContent = label;
    b.addEventListener("click", fn);
    actions.appendChild(b);
  };

  if (passed && nextStage) {
    mkBtn(`Take the intro → ${nextStage.who}`, "primary-btn", () => {
      div.remove();
      enterRoom(nextStage, { kind: "warm", fromWho: state.stage.who, weaknesses: report.weaknesses, pitch: state.pitchText });
    });
    mkBtn("Retry my weakest answers", "mono-btn", () => retryWeakest(div));
  } else if (passed) {
    mkBtn("Back to the lobby", "primary-btn", leaveRoom);
    mkBtn("Retry my weakest answers", "mono-btn", () => retryWeakest(div));
  } else {
    mkBtn("Retry my weakest answers", "primary-btn", () => retryWeakest(div));
    mkBtn("Leave", "mono-btn", leaveRoom);
  }

  els.transcript.appendChild(div);
  speak([line]);
}

async function retryWeakest(momentDiv) {
  if (state.busy || !state.lastReport) return;
  momentDiv.remove();
  const targets = state.lastReport.weaknesses.map((w) => `- ${w.question}`).join("\n");
  const msg = `I want to retry my weakest answers. Grill me again on exactly these:\n${targets}`;
  state.messages.push({ role: "user", content: msg });
  addFounderTurn(msg);
  await investorTurn();
}

// The founder said yes: he texted ahead, and you get to read what he sent.
function renderRouteMoment(route) {
  const stage = STAGES.find((s) => s.id === route.stage) || STAGES[0];
  const pitch = state.founderInputs.reduce((a, b) => (b.length > a.length ? b : a), "");
  const div = document.createElement("div");
  div.className = "turn moment";
  div.innerHTML = `<div class="note-card"><span class="note-label">→ ${esc(stage.who)} · sent just now</span>${esc(route.intro_note)}</div>
    <div class="moment-actions"></div>`;
  const go = document.createElement("button");
  go.className = "primary-btn";
  go.textContent = `Go on up → ${stage.who}`;
  go.addEventListener("click", () => {
    enterRoom(stage, { kind: "note", fromWho: CONNECTOR.who, note: route.intro_note, pitch });
  });
  div.querySelector(".moment-actions").appendChild(go);
  els.transcript.appendChild(div);
  els.answer.disabled = true;
  els.answer.placeholder = "He's already texted ahead. Go on up.";
  scrollTranscript(div);
}

async function sendToConnector(text) {
  state.founderInputs.push(text);
  state.messages.push({ role: "user", content: text });
  addFounderTurn(text);
  state.busy = true;
  els.send.disabled = true;
  els.sessionError.innerHTML = "";
  addThinking();
  try {
    const turn = await callProvider({
      model: els.model.value.trim(),
      system: state.system,
      messages: state.messages,
      schema: CONNECT_SCHEMA,
    });
    state.messages.push({ role: "assistant", content: JSON.stringify(turn) });
    removeThinking();
    addConnectorTurn(turn.say);
    speak([turn.say]);
    if (turn.route) {
      renderRouteMoment(turn.route);
    } else {
      els.answer.placeholder = turn.beat === "offer"
        ? "Your call. Take the intro, ask about them, or keep talking…"
        : "Answer him, paste your blurb, or attach the deck…";
      els.answer.focus({ preventScroll: true });
    }
  } catch (e) {
    removeThinking();
    showError(e.message);
  } finally {
    state.busy = false;
    els.send.disabled = false;
  }
}

// ---------------------------------------------------------------- session
async function investorTurn() {
  state.busy = true;
  els.send.disabled = true;
  els.sessionError.innerHTML = "";
  addThinking();
  try {
    const turn = await callProvider({
      model: els.model.value.trim(),
      system: state.system,
      messages: state.messages,
    });
    state.messages.push({ role: "assistant", content: JSON.stringify(turn) });
    removeThinking();
    if (turn.phase === "report" && turn.report) {
      addInvestorTurn({ ...turn, questions: [] });
      renderReport(turn.report);
      speak([turn.commentary, turn.report.verdict]);
    } else {
      addInvestorTurn(turn);
      els.answer.placeholder = "Answer the room…";
      els.answer.focus({ preventScroll: true });
      speak([turn.commentary, ...turn.questions.map((q, i) => `Question ${i + 1}. ${q}`)]);
    }
  } catch (e) {
    removeThinking();
    showError(e.message);
  } finally {
    state.busy = false;
    els.send.disabled = false;
  }
}

async function sendAnswer() {
  const text = els.answer.value.trim();
  if (!text || state.busy || els.room.hidden) return;
  if (!serverConfig.providers[els.provider.value]) {
    showError(`No key for ${els.provider.value} in the server's environment. Export it and restart the server.`);
    return;
  }
  els.answer.value = "";
  autogrow();
  els.deckStatus.textContent = "";
  if (state.mode === "connect") return sendToConnector(text);
  if (!state.started) {
    state.started = true;
    state.pitchText = text;
    state.messages = [{ role: "user", content: `MY PITCH:\n\n${text}` }];
  } else {
    state.messages.push({ role: "user", content: text });
  }
  addFounderTurn(text);
  await investorTurn();
}

els.send.addEventListener("click", sendAnswer);
els.answer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendAnswer();
  }
});
function autogrow() {
  // Resizing the composer shrinks the transcript pane; keep it pinned to the
  // bottom if the reader was already there, so typing never shifts the view.
  const t = els.transcript;
  const pinned = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
  els.answer.style.height = "auto";
  els.answer.style.height = `${Math.min(els.answer.scrollHeight, 192)}px`;
  if (pinned) t.scrollTop = t.scrollHeight;
}
els.answer.addEventListener("input", autogrow);

// ------------------------------------------------------------ deck upload
async function handleDeckFile(file) {
  if (!file) return;
  els.sessionError.innerHTML = "";
  els.deckStatus.textContent = `Parsing ${file.name}…`;
  try {
    const text = await OpenRoundParse.parseFile(file);
    if (!text.trim()) {
      throw new Error("No extractable text. Scanned or image-only deck? Paste the words instead.");
    }
    const existing = els.answer.value.trim();
    els.answer.value = existing ? `${existing}\n\n${text}` : text;
    autogrow();
    els.deckStatus.textContent = `${file.name}: ${text.length.toLocaleString()} characters extracted into your answer. Edit freely, then send.`;
  } catch (e) {
    els.deckStatus.textContent = "";
    showError(e.message);
  } finally {
    els.deck.value = "";
  }
}
els.attach.addEventListener("click", () => els.deck.click());
els.deck.addEventListener("change", () => handleDeckFile(els.deck.files[0]));
const composerEl = document.querySelector(".composer");
composerEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  composerEl.classList.add("dropping");
});
composerEl.addEventListener("dragleave", () => composerEl.classList.remove("dropping"));
composerEl.addEventListener("drop", (e) => {
  e.preventDefault();
  composerEl.classList.remove("dropping");
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
  els.voiceToggle.textContent = voice.on ? "Voice on" : "Voice off";
  els.voiceToggle.setAttribute("aria-pressed", String(voice.on));
  els.voiceToggle.classList.toggle("on", voice.on);
  if (!voice.on) stopSpeaking();
});

function stopListening() {
  voice.listening = false;
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
        if (t) {
          els.answer.value = (els.answer.value.trim() + " " + t).trim();
          autogrow();
        }
      }
    }
  };
  voice.rec.onend = () => { if (voice.listening) stopListening(); };
  voice.rec.onerror = () => stopListening();
  voice.listening = true;
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
els.meetHost.addEventListener("click", () => enterConnector());

renderProviderOptions();
restorePrefs();
renderDoors();
renderHistory();
loadConfig()
  .then(() => {
    // With a key in the env, the front door opens on Mr. Knows-Everybody.
    // Without one, the lobby stays up to show the key instructions.
    if (Object.keys(DEFAULT_MODELS).some((p) => serverConfig.providers[p])) return enterConnector();
  })
  .catch((e) => showError(`Couldn't open the front door: ${e.message}`));
