/* The three stage-native investors. `file` is relative to the repo root:
   the browser fetches it, the SDK reads it from disk.

   The meeting script lives here too: `opener` is the investor's first line
   when you walk in cold, `introOpener` when you arrive warm-introduced,
   `introLine` is what they say when you pass (for the last stage it is the
   close, since there is nobody left to introduce you to), and `next` is the
   stage a pass walks you up to. */

export const STAGES = [
  {
    id: "pre-seed",
    name: "Pre-seed",
    who: "The Angel",
    desc: "Founder-market fit, size of vision, your core hypothesis. Numbers barely matter yet; your clarity does.",
    file: "personas/pre-seed-angel.md",
    opener: "Sit down, sit down. I read nothing, on purpose. So: what are you raising?",
    introOpener: "You come recommended, which mostly means my bar just went up. What are you raising?",
    introLine: "You held up better than most. There's a seed partner I trust who should hear this. I'm making the call. Tell her exactly what you told me.",
    next: "seed",
  },
  {
    id: "seed",
    name: "Seed",
    who: "The Seed VC",
    desc: "What your traction means, ICP clarity, GTM hypothesis, why now. Every claim needs a denominator.",
    file: "personas/seed-vc.md",
    opener: "You have the room for thirty minutes. What are you raising?",
    introOpener: "I got the call. He doesn't vouch lightly, so let's see it. What are you raising?",
    introLine: "This clears my bar. A partner upstairs leads our As. I'm walking you up. Bring the numbers in the shape she asks for.",
    next: "series-a",
  },
  {
    id: "series-a",
    name: "Series A",
    who: "The Metrics Partner",
    desc: "ARR quality, retention cohorts, burn multiple, a sales machine that works without you. The story is the numbers.",
    file: "personas/series-a-partner.md",
    opener: "I opened the spreadsheet before I opened your deck. Start where the numbers start: what are you raising?",
    introOpener: "She walked you up herself, which buys you exactly one thing: this meeting. What are you raising?",
    introLine: "I'll take this to the partnership on Monday. Don't make me regret it.",
    next: null,
  },
];

export function getStage(id) {
  const stage = STAGES.find((s) => s.id === id);
  if (!stage) {
    throw new Error(`Unknown stage "${id}". Available: ${STAGES.map((s) => s.id).join(", ")}`);
  }
  return stage;
}
