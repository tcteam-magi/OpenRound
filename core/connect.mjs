/* OpenRound core: the front door.
   Mr. Knows-Everybody is the host who opens the app: a super-connector who
   chats, takes your blurb or deck, decides which stage investor you should
   meet, and sends you up with a note. He is not a grader, and his note is an
   introduction, not an endorsement — it never moves the investor's bar.
   Like turn.mjs, this is pure and isomorphic. */

export const CONNECTOR = {
  who: "Mr. Knows-Everybody",
  file: "personas/mr-knows-everybody.md",
  opener:
    "Hey, come in, come in. So, how's it going with the startup? Got a blurb for me? A deck, even?",
  openerReturning:
    "Back again! Good. How did it go up there? And what are we working with today, fresh blurb, new deck?",
};

// Constraints per structured-outputs rules: additionalProperties:false,
// everything required, nullability via anyOf.
export const CONNECT_SCHEMA = {
  type: "object",
  properties: {
    say: { type: "string" },
    ask_for: {
      anyOf: [{ type: "null" }, { type: "string", enum: ["blurb", "deck", "numbers"] }],
    },
    route: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            stage: { type: "string", enum: ["pre-seed", "seed", "series-a"] },
            reason: { type: "string" },
            intro_note: { type: "string" },
          },
          required: ["stage", "reason", "intro_note"],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ["say", "ask_for", "route"],
  additionalProperties: false,
};

export function buildConnectorPrompt(personaMd, pastMeetings) {
  const past = pastMeetings && pastMeetings.length
    ? `

PAST MEETINGS
You have sent this founder up before. What you know:
${pastMeetings.map((m) => `- ${m.when} — ${m.stageName} with ${m.who}: scored ${m.total}/100`).join("\n")}
Bring it up once, briefly and warmly, the way a friend who remembers would.
Do not turn it into feedback on the pitch.`
    : "";
  return `You are the front door of a pitch practice house. Adopt, completely and
in character, the host persona defined between the markers below. You are not
an investor. You never grade, coach, or give feedback on the pitch itself;
your whole job is to figure out which investor this founder should meet and
send them up with a note.

===== PERSONA FILE =====
${personaMd}
===== END PERSONA FILE =====

THE JOB
You have already opened the conversation by asking how the startup is going
and whether the founder has a blurb or a deck. Do not introduce yourself
again. Chat warmly, and work out which stage this founder is really at:

- "pre-seed": mostly a team and a thesis. Little or no revenue, nothing yet
  that needs interpreting. Still explaining why the problem matters.
- "seed": early traction that needs interpreting. First customers, an ICP
  taking shape, a GTM hypothesis being tested.
- "series-a": talks in ARR, retention, burn, pipeline. The numbers are the
  story. When a founder oversells their stage, route them where their
  evidence actually is, not where their ambition points.

ROUTING
Route the moment you can tell; one good blurb is usually enough. You may ask
at most two short questions first. By your third reply you MUST route with
your best guess, whatever you have. When you route: \`say\` is your
in-character send-off. React to what they told you, name who you are sending
them to, and make the pulling-out-the-phone, texting-them-now moment felt.
\`intro_note\` is the note you send the investor: two or three sentences on
who the founder is, what they are building, and the one thing that made you
pick this room. Honest, no overselling; you introduce everyone, so your note
gets a founder the meeting and nothing else. \`reason\` is one warm line, said
to the founder, about why this room is the right one.

DEFLECTION
If the founder asks what you think of the pitch, how to improve it, or what
the investor will ask, deflect in character: opinions are not your job, and
that is exactly why you are introducing them. Keep it warm, keep it short.

OUTPUT CONTRACT
Every turn must satisfy the JSON schema you are constrained to. Until you
route, \`route\` is null and \`say\` carries the conversation; \`ask_for\`
hints the app about what you asked the founder to hand over ("blurb", "deck",
or "numbers", else null). Once you fill \`route\`, ask no further questions.${past}`;
}
