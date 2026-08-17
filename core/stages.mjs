/* The three stage-native investors. `file` is relative to the repo root:
   the browser fetches it, the SDK reads it from disk. */

export const STAGES = [
  {
    id: "pre-seed",
    name: "Pre-seed",
    who: "The Angel",
    desc: "Founder-market fit, size of vision, your core hypothesis. Numbers barely matter yet; your clarity does.",
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

export function getStage(id) {
  const stage = STAGES.find((s) => s.id === id);
  if (!stage) {
    throw new Error(`Unknown stage "${id}". Available: ${STAGES.map((s) => s.id).join(", ")}`);
  }
  return stage;
}
