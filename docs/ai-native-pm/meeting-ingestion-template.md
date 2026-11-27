# Meeting-ingestion template: turn a meeting into a stakeholder update

Track 01 Practice, Exercise 5. About 45 minutes. Chapter 6.

The pattern: a meeting transcript goes in, a structured summary comes out, and the decisions and facts in that summary propagate to the stakeholder pages that agents read. The five-field brief is what makes the output reviewable. Without a definition of done, review is just impression.

## The exercise

1. Take one of your own recent meeting transcripts.
2. Write a five-field brief for it using the template below.
3. Run the brief with an agent.
4. Check the summary against the transcript, line by line: every claim in the summary must trace to something said in the meeting. Anything the agent added that nobody said gets cut.
5. Apply the entity updates: write the decisions and facts from the summary onto the stakeholder pages that should carry them.

If your team is sketched in [Team Builder](../pm-agent-team/team-builder.html), name the stakeholder pages there before you propagate anything.

## The five-field brief template

Copy everything below the line and fill in all five fields before you run it.

---

## Objective

One line of guidance: state the one decision or outcome this meeting must produce, in a sentence a stranger could act on.

Objective:

## Output format

One line of guidance: name the exact shape of the summary (sections, order, length) so the output is comparable run to run.

Output format:

## Tool and source guidance

One line of guidance: name the tools the agent may use and the sources it may cite, and the sources it must not invent from.

Tool and source guidance:

## Boundaries

One line of guidance: list what the agent must not do (no prices, no commitments, no external messages) and what it must flag instead of guessing.

Boundaries:

## Definition of done

One line of guidance: state the bar the summary must clear, phrased so a stranger can check it against the transcript without asking you a question.

Definition of done:

---

## Worked example (fictional)

TripCo is a fictional travel company. This meeting snippet is made up for this lab.

### The snippet

Priya: The handoff rate on fare-difference sessions is still 31%. Sam, what is driving it?

Sam: Missing fare basis codes. The fare rules API returns no basis code for 1 in 5 multi-city legs.

Priya: So the agent is doing the right thing by handing off. Log it as a known gap, and I will raise API coverage with the fares team.

### The structured summary

- Decision: treat the 31% fare-difference handoff rate as a known gap, not an agent failure. The agent hands off correctly when it cannot cite a rule.
- Cause: the fare rules API returns no basis code for 1 in 5 multi-city legs.
- Action: Priya raises API coverage with the fares team next week.
- Open item: none. No price was quoted, no ticket was reissued.

### The entity updates it would propagate

- Stakeholder page, Fares team: add the known gap (missing fare basis codes on 1 in 5 multi-city legs) and the owner (Priya) raising API coverage.
- Stakeholder page, TripCo trip-change agent: add the fact that a handoff on a missing fare basis code is correct behavior, not a failure.
- Decisions log: add the decision (handoff rate treated as a known gap), dated, with the reason and who made it.

## What to submit

- Your five-field brief, filled in.
- The summary your agent produced, with any invented claims cut and noted.
- The entity updates: which stakeholder pages changed, and what each one now says.

## The bar

- One real transcript run through a five-field brief you wrote.
- Every claim in the summary traced to the transcript.
- The updates propagated to named stakeholder pages, not left in the summary.
