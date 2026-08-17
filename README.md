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

## What this is not (yet)

- **No deck upload yet** — paste text; pdf/pptx parsing is on the roadmap.
- **No voice mode yet** — text first; a voice grilling mode is planned.
- **No session history yet** — each grilling stands alone (the retry button covers the practice loop for now).

## License

MIT
