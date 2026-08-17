# OpenRound

> **Everyone is a founder. Everyone has to pitch. Almost nobody gets grilled before it counts.**

The night before demo day, what a founder needs is not encouragement — it's a hostile Q&A. `OpenRound` is an open-source web app where an AI investor persona grills your pitch the way a real one would, then scores you against the rubric that stage of investor actually uses.

**Stage-native, not generic.** A pre-seed angel, a seed VC, and a Series A partner are not the same person with different moods — they grill entirely different things:

| Stage | Persona | Grills you on | Doesn't care about |
|---|---|---|---|
| **Pre-seed** | Angel | Founder-market fit, size of the vision, the core hypothesis | Numbers (you barely have any) |
| **Seed** | Seed VC | What your traction *means*, ICP clarity, GTM hypothesis, why now | Polished unit economics |
| **Series A** | Metrics partner | ARR growth, retention curves, burn multiple, the scale story | Vision speeches (numbers replace them) |

## How a session works

1. **Pick your stage** — that decides who walks into the room.
2. **Paste your pitch** — script, notes, or a deck summary.
3. **Get grilled** — three rounds: clarifying questions, then core-rubric attacks, then red-flag follow-ups. Weak answers get pressed.
4. **Get the report** — rubric scores, your weakest answers, and a verdict. Then hit **"Retry my weakest answers"** and face them again.

## Quickstart

No build step, no backend. Serve the folder statically:

```bash
npx serve .        # or: python3 -m http.server
```

Open the page, paste your API key (Claude or OpenAI — **BYOK**, stored only in your browser's localStorage, sent only to the provider you chose), pick a stage, and pitch.

## Personas are an open format

Each investor lives in a plain markdown file under [`personas/`](personas/) — identity, rubric weights, red flags, question style, pass bar. The format is documented in [`PERSONA_FORMAT.md`](PERSONA_FORMAT.md).

Think your region's or sector's investors ask differently? **Write that persona and open a PR.** No real investors are impersonated — personas are archetypes built from public knowledge about how each stage evaluates.

## Beyond the basics

- **Deck upload** — drop a `.pdf`, `.pptx`, `.docx`, `.txt`, or `.md` on the pitch box (or use the upload button). It's parsed **in your browser** — pdf.js and JSZip are lazy-loaded from a CDN, and the file itself never leaves the page. The extracted text lands in the pitch box for you to review and edit before entering the room. Scanned or image-only decks won't extract; paste text for those.
- **Voice mode** — toggle **Voice** in the grilling room and the investor asks their questions out loud (browser speech synthesis). The **Speak** button dictates your answer via the Web Speech API — works best in Chrome, and hides itself where unsupported. No extra keys, no audio leaves your machine except to your browser's own speech service.
- **Session history** — every report is saved to this browser's localStorage (last 30). The **Past grillings** panel tracks your scores per stage over time, and when you face the same stage again, **the investor remembers your weakest answers and re-tests at least one**. That's the practice loop: get grilled, fix it, come back, prove it.

## What this is not (yet)

- **No cloud sync** — history lives in one browser's localStorage.
- **No nuanced voice** — browser TTS is what it is; a provider-quality voice mode is planned.

## Acknowledgements

The client-side pptx/docx parsing approach (which OOXML parts are the source of truth, text-fidelity rules) adapts [genoffice](https://github.com/genspark-ai/genoffice)'s `file-parse` package (Apache-2.0), reimplemented for the browser on DOMParser.

## License

MIT
