# Build a PM Brain, then grade its retrieval

Track 01 Practice, Exercise 3. About 2 hours. Chapters 2, 4, and 7.

The lesson, stated plainly: structure is what makes memory compound, and retrieval you can measure beats retrieval you assume.

You will build a small three-layer brain from your own meetings, PRDs, and decisions using gbrain itself, then grade what it retrieves. You are the PM checking your own tool, not an engineer rebuilding a database. Do not rebuild gbrain. Install it, feed it your notes, and measure it.

## What you need

- Bun 1.4.4 or newer. Check with `bun --version`.
- A folder of your own notes: meeting notes, PRDs, and decisions. If you have no notes to use yet, run the worked example at the end of this lab first. It ships in this repo and needs nothing of yours.
- An agent client for setup (Claude Code is used below; Codex works the same way with `gbrain setup codex`).

## Step 1: Install gbrain

One command, then wire it to your agent:

```
bun install -g github:garrytan/gbrain#stable
gbrain setup claude-code
```

Two warnings. First, gbrain needs Bun 1.4.4 or newer, per gbrain's README. Second, the npm package named gbrain is unrelated and must not be installed. Never run `npm install -g gbrain`. Install only with the command above.

## Step 2: Point it at your own notes

gbrain reads folders of Markdown files. Give it three kinds of material, in one folder:

- A facts page (`facts.md`): numbers and statements agents may repeat. One line per fact. If a number changes, rewrite the line. The facts page is the compiled truth, rewritten when new evidence arrives.
- A decisions log (`decisions.md`): each decision with its date, its reason, and who made it. Append new decisions at the end. Never edit an old entry. The log is the append-only timeline.
- Call transcripts saved as `.md` files, one file per call. These are the raw material. The brain reads them, but you never rewrite them.

That is the three-layer shape: compiled facts on top, append-only timeline in the middle, raw transcripts as sidecars at the bottom. Typed links between pages connect them, so a decision can point at the call where it was made and the fact it changed.

Register the folder and sync:

```
gbrain sources add notes --path ~/notes --federated --force
gbrain sync --all
```

Rerun `gbrain sync --all` after every edit. In a folder that is a git repo, gbrain reads only committed files, so commit your edits before you sync.

## Step 3: Write 20 retrieval questions

Write 20 questions whose answers live in your own material. Rules for a good question:

- One fact per question. "What is the refund window?" is a question. "What did we decide about refunds and pricing?" is two questions.
- The answer must be findable in exactly one page. Write down which page holds it. That page is your expected answer.
- Mix the layers: at least 5 questions answered by facts, at least 5 by the decisions log, at least 5 by transcripts.
- Include 3 questions whose answer is "we never decided that" or "that is not in the notes." A brain that guesses on those is a brain you cannot trust.

Write the list before you measure anything. If you write questions after seeing results, you will only ask what it already answers.

## Step 4: Measure R@5 and P@5

Ask each of your 20 questions and record the top 5 retrieved pages for each one. Two scores:

- **R@5 (recall at 5)** is the share of questions where the page holding the expected answer appears in the top 5 retrieved pages. Count the questions where the expected page is in the top 5, divide by 20. A perfect run is 20 out of 20, or 1.0.
- **P@5 (precision at 5)** is the share of the top-5 retrieved pages that are relevant to the question. For each question, count how many of the top 5 pages are relevant, divide by 5. Your P@5 is the average of those 20 per-question scores. A page counts as relevant if a PM reading it would say it helps answer the question, even if it is not the expected page.

Score by hand, from the retrieved pages, not from the agent's final answer. The final answer can be right for the wrong reason. The retrieval is what you are grading. If you want the grading method behind this, eval-101 Learn covers golden sets and graders: https://coachmanjeet.github.io/AI-Skills-Lab/#/eval-101/learn

### Scoring sheet

Copy this table and fill in one row per question. The first 5 rows show the worked example run, so you can see what a filled row looks like. Rows 6 to 20 are yours.

| # | Question | Expected page | Answer in top 5? | Relevant pages in top 5 (of 5) |
|---|---|---|---|---|
| 1 | What share of fare-difference sessions end in a human handoff? | facts.md | yes/no | _ |
| 2 | Who decided the $40 nightly cap on factory runs, and when? | decisions.md | yes/no | _ |
| 3 | What is the full-refund window? | facts.md | yes/no | _ |
| 4 | Why do fare-difference sessions hand off, per the November 20 review call? | call-2026-11-20-trip-change-review.md | yes/no | _ |
| 5 | What is the scorecard bar before production traffic? | decisions.md | yes/no | _ |
| 6 | | | yes/no | _ |
| 7 | | | yes/no | _ |
| 8 | | | yes/no | _ |
| 9 | | | yes/no | _ |
| 10 | | | yes/no | _ |
| 11 | | | yes/no | _ |
| 12 | | | yes/no | _ |
| 13 | | | yes/no | _ |
| 14 | | | yes/no | _ |
| 15 | | | yes/no | _ |
| 16 | | | yes/no | _ |
| 17 | | | yes/no | _ |
| 18 | | | yes/no | _ |
| 19 | | | yes/no | _ |
| 20 | | | yes/no | _ |

R@5 = (count of "yes" in column 4) / 20. P@5 = (average of column 5) / 5.

## Step 5: Ablate the structure

Run the same 20 questions twice, with structure off and on, and record both scores.

- **Structure off:** run before you add any API key. gbrain starts keyless with keyword search until an API key is added, so this run is plain keyword search, no graph or links. Fill in the scoring sheet and write down your R@5 and P@5.
- **Structure on:** add your API key, run the same 20 questions again, and fill in a second copy of the scoring sheet. Same questions, same expected pages, nothing else changed.

Watch the score move. The gap between the two runs is what the structure bought: the typed links, the layered pages, and the retrieval that uses them. If the scores barely move, say so. A small gap is a finding, not a failure. It usually means your questions are all answerable by keyword, and your next 20 questions should lean on the links (decisions that cite calls, facts that changed).

For reference, gbrain's own September 2026 LongMemEval re-run reported 95.5% strict recall_all@5. That is their benchmark on their data, not a target for your 20 questions. Your target is the gap between your two runs, and whether you can explain it.

## Step 6: Write up

Two short paragraphs, plus one fix.

1. What the structure bought. Name the questions that moved between the two runs and say why. Did the graph help on decisions that cite calls? Did it hurt anywhere, by pulling in a related page that is not the answer?
2. One fix to the brain. Pick the single most useful fix the measurement exposed: a missing facts entry, a decision never logged, a transcript that should have been saved. Make the fix, sync, and re-run the questions it affects.

## Worked example

Run the lab end to end without your own notes. The example brain is in this repo at `docs/ai-native-pm/pm-brain-example/`. It is fictional: TripCo is a made-up travel company, and every number and decision in it is invented for this lab. Do not quote any of it as real.

- [facts.md](./pm-brain-example/facts.md): 5 facts about TripCo trip changes.
- [decisions.md](./pm-brain-example/decisions.md): 3 decisions, each with a date, a reason, and who made it.
- [call-2026-11-20-trip-change-review.md](./pm-brain-example/call-2026-11-20-trip-change-review.md): why fare-difference sessions hand off.
- [call-2026-11-24-pricing-sync.md](./pm-brain-example/call-2026-11-24-pricing-sync.md): the refund window, confirmed by finance.

Point gbrain at that folder, sync, and ask these 5 sample questions. They are the 5 filled rows in the scoring sheet above.

1. What share of fare-difference sessions end in a human handoff? Expected answer: 31%. Expected page: facts.md.
2. Who decided the $40 nightly cap on factory runs, and when? Expected answer: Priya, 2026-11-02. Expected page: decisions.md.
3. What is the full-refund window? Expected answer: within 24 hours of booking. Expected page: facts.md.
4. Why do fare-difference sessions hand off, per the November 20 review call? Expected answer: missing fare basis codes. The fare rules API returns no basis code for 1 in 5 multi-city legs. Expected page: call-2026-11-20-trip-change-review.md.
5. What is the scorecard bar before production traffic? Expected answer: all 20 cases passing. Expected page: decisions.md.

## What to submit

- Your facts page, decisions log, and transcript folder (or a note saying you ran the worked example instead).
- Your 20 questions with the expected page for each.
- Two filled scoring sheets: structure off and structure on, with R@5 and P@5 for each.
- Your write-up: what the structure bought, and the one fix you made.

## The bar

- 20 questions written, each with one expected page, before you measured anything.
- Both scores measured, by hand, from the retrieved pages.
- The ablation run: same 20 questions, structure off and on, both scores recorded.
- One brain fix named and made.

If you hit the bar, you have a brain you can trust a little further, and a measurement that tells you why. That is the whole lab.
