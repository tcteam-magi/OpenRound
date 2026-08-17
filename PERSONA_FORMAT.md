# Persona format

A persona is one markdown file in `personas/`. The app injects the whole file into the investor's system prompt, so everything you write is what the investor *knows and cares about*. The fixed section skeleton below keeps personas reviewable; the prose inside each section carries the expertise.

## Required sections

```markdown
# persona: <slug>

## Identity
Who this investor is, as an archetype — background, fund stage, what a meeting
with them feels like. Never a real, named investor.

## Stage
One of: pre-seed | seed | series-a (or your own, if you add a stage to the app).

## Rubric
The evaluation criteria WITH weights summing to 100. One line each:
`- <criterion> (<weight>) — what a strong answer demonstrates`

## Red flags
The signals this investor pounces on. Each red flag should name the *pattern*
("top-down TAM math") and *why it discredits the founder* at this stage.

## Question style
Tone, pacing, how hard they press, what a follow-up looks like when an answer
is weak. This is what makes two personas at the same stage feel different.

## Pass bar
What kind of answer lets the founder move on, and what kind triggers a dig.
Be concrete: "a number with a denominator" beats "a good answer".
```

## Quality bar for PRs

- **Archetypes only.** No real names, no imitations of identifiable investors.
- **Stage-true.** A pre-seed persona that asks for cohort retention tables is
  miscalibrated — the rubric must match what that stage can actually evidence.
- **Grounded.** Base rubrics and red flags on public sources (investor essays,
  published pitch teardowns), not vibes. Cite sources in the PR description.
- **Grillable.** Every rubric line should be something a question can attack.
  If you can't imagine the question, cut the line.
