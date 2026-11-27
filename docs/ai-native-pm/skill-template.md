# Skill template: fat skills, thin harness

Track 01 Practice, Exercise 4. About 45 minutes. Chapters 6 and 7.

The principle: fat skills, thin harness. The skill file carries the judgment (when to fire, what counts as good, what to do at the edges). The harness stays thin: it runs the skill, passes it tools, and gets out of the way. If the harness starts deciding things the skill should decide, the harness is too fat.

## The exercise

1. Pick one real workflow you ran by hand this week.
2. Write it as one skill using the template below.
3. Run it on a thin harness. Sketch the harness in the [Harness Designer](../harness-101/harness-designer.html): agent and environment, tools, context, guardrails, verify, export. Keep the harness to those six stages and put every judgment call in the skill file.
4. Compose it with a second skill on the same workflow: skill one produces, skill two checks (or skill one gathers, skill two writes). Run both through the same thin harness.
5. Write down where the two skills hand off: what skill one must produce for skill two to start, and what happens when it does not.

## The template

Copy everything below the line into a file named after your skill, for example `refund-triage.md`.

---

# Skill: [name the workflow in plain words]

## Triggers

One line of guidance: list the exact situations where this skill fires, and the situations where it must not fire.

- Fires when:
- Does not fire when:

## Edge cases

One line of guidance: name the three ways this workflow most often breaks, and what the skill does in each case instead of guessing.

1.
2.
3.

## Quality gates

One line of guidance: list the checks the output must pass before it ships, each check phrased so a stranger can run it without asking you a question.

- [ ] Gate 1:
- [ ] Gate 2:
- [ ] Gate 3:

## Handoff

One line of guidance: state what this skill hands to the next skill (or the human), in what format, and what happens if that input is missing.

- Hands off:
- Format:
- If missing:

---

## What to submit

- Your skill file, written from the template.
- A note on the harness run: what the harness did, and one judgment call you kept in the skill instead of the harness.
- The handoff note from step 5: what skill one hands to skill two, and what happens when it does not arrive.

## The bar

- One skill written from the template, with triggers, edge cases, and quality gates all filled in.
- Run once on a thin harness, with the harness kept to its six stages.
- Composed with a second skill on one workflow, with the handoff written down.
