# OpenRound

> Everyone is a founder. Everyone has to pitch. Almost nobody gets grilled before it counts.

The night before demo day, encouragement is cheap. What you actually need is a hostile Q&A. OpenRound is an open-source web app where an AI investor persona grills your pitch, presses your weak answers, and scores you against the rubric that stage of investor really uses.

It runs on your machine. Your API keys stay in your shell environment, requests go from localhost straight to the model provider, and nothing sits in between.

## Pick your stage

A pre-seed angel, a seed VC, and a Series A partner grill different things. You don't have to pick: the app opens on a host who places you from your blurb. The doors below are still there when you'd rather choose yourself.

| Stage | Persona | Grills you on | Doesn't care about |
|---|---|---|---|
| Pre-seed | Angel | Founder-market fit, size of the vision, the core hypothesis | Numbers (you barely have any) |
| Seed | Seed VC | What your traction means, ICP clarity, GTM hypothesis, why now | Polished unit economics |
| Series A | Metrics partner | ARR growth, retention curves, burn multiple, the scale story | Vision speeches (numbers replace them) |

## How a meeting works

1. Meet Mr. Knows-Everybody. The door opens on the house super-connector, who wants to hear how it's going before he wants anything else. Talk to him, paste your blurb, attach your deck. Once he's placed you, he floats a name: "you should meet her. Want the intro?" Say yes and he texts ahead, shows you the exact note he sent, and walks you up. He intros everyone, so the note gets you the meeting and nothing else; the investor's bar doesn't move. In a hurry, "Skip the small talk" goes straight to the three doors, and grilling history makes him nosy about how your last meeting went.
2. The investor speaks first: "So: what are you raising?" If you came up with his note, they have skimmed it; they still make you pitch live, in your own words. Your first answer is your pitch. Type it, dictate it, or attach a deck (pdf, pptx, docx, txt, md); your browser parses the file locally and it never leaves your machine. From a pptx it pulls slide text plus the parts most extractors skip: speaker notes (where the real pitch usually lives), chart labels, SmartArt text, and image alt text. It cannot read text baked into images; there is no OCR, so paste the words for image-only slides.
3. Get grilled through three rounds: clarifying questions, then attacks on your weakest rubric lines, then follow-ups on the red flags you exposed. The investor grades every answer against the persona's pass bar (0 to 10: answered, partial, dodged). A dodged answer doesn't buy you the next round; it gets re-pressed once, harder, and dodges cap the related rubric score in the report.
4. Read the report: rubric scores, the answers that hurt you most, and a verdict.
5. Earn the intro. Score 60 or better and the investor walks you upstairs: a warm introduction to the next stage's investor, carrying your pitch and everything you fumbled (a warm intro raises the bar, it doesn't lower it). Pass Series A and it goes to the partnership on Monday. Miss the bar and there is no intro today: retry your weakest answers, or come back through the same door.

## Run it

You need Node 18 or newer, plus an API key for Claude or OpenAI.

```bash
git clone https://github.com/tcteam-magi/OpenRound.git
cd OpenRound

export ANTHROPIC_API_KEY=sk-ant-...   # for Claude
export OPENAI_API_KEY=sk-...          # for OpenAI, and for spoken questions

node server.mjs
# OpenRound → http://127.0.0.1:3131
```

The server binds to 127.0.0.1 only, so nothing is reachable from outside your machine. It reads your keys once at startup and signs provider requests itself. The page in your browser never sees a key, and stores nothing beyond your provider and model preference.

## Voice

Turn on Voice in the grilling room and the investor asks questions out loud. With `OPENAI_API_KEY` set, the audio comes from OpenAI's speech model. Without it, the app falls back to your browser's built-in voice, which works but sounds robotic. The Speak button dictates your answers through the Web Speech API; Chrome handles this best, and the button hides itself where the API is missing.

## Session history

Every report is saved to your browser's localStorage (the last thirty). A "Past grillings" panel tracks your scores per stage over time. When you face the same stage again, the investor remembers your weakest answers from last time and re-tests at least one of them. Get grilled, fix it, come back, prove it.

## Use it as a library

The web app is one consumer of a small SDK; your code can be another. Models are addressed aisuite-style, as one `"provider:model"` string:

```js
import { GrillingSession } from "openround"; // or "./index.mjs" from a clone

const session = new GrillingSession({
  model: "anthropic:claude-opus-5", // or "openai:gpt-5"
  stage: "seed",                    // pre-seed | seed | series-a
});

let turn = await session.start(pitchText);
while (turn.phase === "questions") {
  console.log(turn.questions);
  turn = await session.answer(myAnswer);
}
console.log(turn.report); // scores, weaknesses, verdict
```

The key resolves from an `apiKey` option or from the provider's environment variable. `session.retryWeakest()` re-runs the weaknesses from the last report, and a `personaMarkdown` option swaps in your own investor. Try it in the terminal:

```bash
node examples/sdk-quickstart.mjs anthropic:claude-opus-5 series-a
```

### Adding a provider

One file. Drop `providers/yourprovider.mjs` exporting `name`, `label`, `defaultModel`, `envKey`, and `chat({apiKey, model, system, messages, schema})` (return the parsed turn object), then register it in `providers/index.mjs`. The SDK, the server, and the web UI's provider dropdown all pick it up from the registry.

## Personas are an open format

Each investor is one markdown file in [`personas/`](personas/): identity, rubric weights, red flags, question style, pass bar. The format is documented in [`PERSONA_FORMAT.md`](PERSONA_FORMAT.md). If the investors in your region or sector ask differently, write that persona and open a PR. Personas are archetypes built from public knowledge about how each stage evaluates; no real investor is imitated.

## Not here yet

History doesn't sync between browsers. And there is no hosted version, on purpose: the point is that your keys and your pitch stay on your machine.

## Acknowledgements

The pptx and docx parsing approach (which OOXML parts to read, how to keep the text faithful) comes from [genoffice](https://github.com/genspark-ai/genoffice)'s `file-parse` package (Apache-2.0), rebuilt for the browser on DOMParser. The answer-grading gate adapts the clarity-scoring and threshold-gate idea from [ouroboros](https://github.com/Q00/ouroboros)'s interview protocol (MIT). The design direction (the monochrome editorial type stack and the pre-delivery UX checklist) follows [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT).

## License

MIT
