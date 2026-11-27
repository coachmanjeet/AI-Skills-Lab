# Call notes: trip-change review, 2026-11-20 (fictional example)

TripCo is a fictional travel company. This transcript is made up for this lab.

Attendees: Priya (PM lead), Sam (eng lead).

Priya: The handoff rate on fare-difference sessions is still 31%. What is driving it?

Sam: Missing fare basis codes, mostly. The fare rules API returns no basis code for 1 in 5 multi-city legs, and the agent cannot explain a difference it cannot cite a rule for.

Priya: So the agent is doing the right thing by handing off?

Sam: Yes. The fix is not a better prompt. The fix is the API returning the code, or the agent flagging the gap earlier so the traveler is not left waiting.

Priya: Log it as a known gap. I will raise the API coverage with the fares team next week.
