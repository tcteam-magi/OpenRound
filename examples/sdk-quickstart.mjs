/* OpenRound as a library: an interactive grilling in your terminal.

   export ANTHROPIC_API_KEY=sk-ant-...
   node examples/sdk-quickstart.mjs
   node examples/sdk-quickstart.mjs openai:gpt-5 series-a */

import readline from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";
import { GrillingSession } from "../index.mjs";

const model = argv[2] || "anthropic:claude-opus-5";
const stage = argv[3] || "seed";
const rl = readline.createInterface({ input: stdin, output: stdout });

console.log(`OpenRound SDK demo. Model: ${model}, stage: ${stage}.`);
console.log("Paste your pitch, then press Enter:\n");
const pitch = await rl.question("> ");

const session = new GrillingSession({ model, stage });

let turn;
try {
  turn = await session.start(pitch);
} catch (e) {
  console.error(`\n${e.message}`);
  exit(1);
}

while (turn.phase === "questions") {
  console.log(`\n[${turn.round_label}] ${turn.commentary}`);
  turn.questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  const answer = await rl.question("\nyour answer > ");
  turn = await session.answer(answer);
}

console.log(`\n${turn.commentary}\n`);
const total = turn.report.scores.reduce((a, s) => a + (s.score / 10) * s.weight, 0);
console.log(`Weighted score: ${Math.round(total)} / 100`);
for (const s of turn.report.scores) {
  console.log(`  ${s.criterion} (${s.weight}): ${s.score}/10 - ${s.comment}`);
}
console.log("\nWhere you lost the room:");
for (const w of turn.report.weaknesses) {
  console.log(`  - ${w.question}\n    ${w.why_it_hurt}`);
}
console.log(`\nVerdict: "${turn.report.verdict}"`);
rl.close();
