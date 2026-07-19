# AI Skills Lab

A hands-on curriculum for **AI evals** — for PMs and AI engineers who want to actually build, run, and ship evals rather than just read about them.

**Live site:** https://coachmanjeet.github.io/AI-Skills-Lab/

## What's in it

Two tracks are live:

- **Eval 101** — foundations + 4 hands-on labs (Model safety · Conversational · RAG · Coding agent) + wrap-up + Apply.
- **Eval 201** — advanced: multi-agent · voice · long-running · trust & governance · multi-modal · framework comparison · judge alignment · trace analysis method · release gates · maturity ladder · standards + monitoring playbook.

Each track has three tabs:

**Learn → Practice → Apply**

Every practice exercise is a **launchable builder** — a stepped authoring flow that saves to `localStorage` and exports JSON + Markdown. No installs, no accounts, nothing to configure.

### Eval 101 · Practice builders

| # | Builder | What you leave with |
|---|---------|--------------------|
| 1 | Test Data Builder | A 4-1-1 test set (4 golden path + 1 edge + 1 adversarial) |
| 2 | Golden Set Builder | A 10–30 sample versioned fixture ready to commit |
| 3 | Trace Analysis Builder | A triage report — 20 failures tagged, clustered, next eval target picked |
| 4 | Automated Scoring Builder | An end-to-end eval spec (target · task · data · grader · run · export) |

### Eval 201 · Practice builders

| # | Builder | What you leave with |
|---|---------|--------------------|
| 1 | Skill Annotation Builder | A skill-level annotation report — traces clustered, top code promoted |
| 2 | Rubric Builder | A rubric spec — dimensions × binary questions × scorer + judge scaffold |
| 3 | Error Analysis Builder | A per-failure analysis — trace, layer, cause, fix + regression eval |
| 4 | CI Scoring Builder | A tiered CI package spec + GitHub Actions YAML skeleton |

## Run it locally

Pure static site — no build step. Two ways:

```bash
# option 1 — with Python
python3 server.py                # http://localhost:4173/

# option 2 — anything that serves ./docs
cd docs && python3 -m http.server 4173
```

## Stack

Vanilla HTML / CSS / vanilla JS. SLDS v2.25.5 via unpkg CDN. No framework, no bundler, no server-side rendering. Every builder page is a self-contained ES module that reads/writes its own `localStorage` key and exports via `Blob` + object URL.

## Contributing

Open an issue for ideas or requests. The curriculum will keep expanding — Observability 101 / 201 and Harness 101 / 201 tracks are stubbed and coming next.

## License

MIT.
