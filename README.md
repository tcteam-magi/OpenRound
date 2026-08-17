# OpenRound

> Everyone is a founder. Everyone has to pitch. Almost nobody gets grilled before it counts.

The night before demo day, encouragement is cheap. What you actually need is a hostile Q&A. OpenRound is an open-source web app where an AI investor persona grills your pitch, presses your weak answers, and scores you against the rubric that stage of investor really uses.

It runs on your machine. Your API keys stay in your shell environment, requests go from localhost straight to the model provider, and nothing sits in between.

## Pick your stage

A pre-seed angel, a seed VC, and a Series A partner grill different things:

| Stage | Persona | Grills you on | Doesn't care about |
|---|---|---|---|
| Pre-seed | Angel | Founder-market fit, size of the vision, the core hypothesis | Numbers (you barely have any) |
| Seed | Seed VC | What your traction means, ICP clarity, GTM hypothesis, why now | Polished unit economics |
| Series A | Metrics partner | ARR growth, retention curves, burn multiple, the scale story | Vision speeches (numbers replace them) |

## How a session works

1. Pick your stage. That decides who walks into the room.
2. Paste your pitch, or upload a deck (pdf, pptx, docx, txt, md). Your browser parses the file locally; it never leaves your machine. Scanned or image-only decks won't extract, so paste text for those.
3. Get grilled through three rounds: clarifying questions, then attacks on your weakest rubric lines, then follow-ups on the red flags you exposed. A foggy answer gets pressed again.
4. Read the report: rubric scores, the answers that hurt you most, and a verdict. Then hit "Retry my weakest answers" and face them again.

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

## Personas are an open format

Each investor is one markdown file in [`personas/`](personas/): identity, rubric weights, red flags, question style, pass bar. The format is documented in [`PERSONA_FORMAT.md`](PERSONA_FORMAT.md). If the investors in your region or sector ask differently, write that persona and open a PR. Personas are archetypes built from public knowledge about how each stage evaluates; no real investor is imitated.

## Not here yet

History doesn't sync between browsers. And there is no hosted version, on purpose: the point is that your keys and your pitch stay on your machine.

## Acknowledgements

The pptx and docx parsing approach (which OOXML parts to read, how to keep the text faithful) comes from [genoffice](https://github.com/genspark-ai/genoffice)'s `file-parse` package (Apache-2.0), rebuilt for the browser on DOMParser.

## License

MIT
