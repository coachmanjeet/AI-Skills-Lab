# TripCo decisions log (fictional example)

TripCo is a fictional travel company. Every decision below is made up for this lab. Append new decisions at the end. Never edit an old entry.

## 2026-10-14: Auto-allow clean fare-difference explanations

- Decision: fare-difference explanations that touch no payment are auto-allowed to the traveler.
- Reason: the review queue was the bottleneck. Reviewers spent their time on clean cases while risky ones waited.
- Who: Priya, PM lead.

## 2026-11-02: Cap overnight factory runs at $40 per night

- Decision: every overnight factory run stops at $40 of spend.
- Reason: one run spent $61 on repeated retries of the same failing rebuild.
- Who: Priya, PM lead.

## 2026-11-18: Scorecard bar is all 20 cases passing

- Decision: no agent update touches production traffic until all 20 scorecard cases pass.
- Reason: two earlier releases shipped with known failing cases, and both produced traveler complaints.
- Who: Priya, PM lead, and Sam, eng lead.
