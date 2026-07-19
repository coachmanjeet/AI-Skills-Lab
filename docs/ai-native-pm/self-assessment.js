// ============================================================================
//  self-assessment.js — AI-Native PM Self-Assessment (Track 01 · Practice)
//
//  Eight readiness areas, each scored 1 / 3 / 5. State persists to
//  localStorage. When ≥6 of 8 areas are scored, the summary panel unveils:
//    - full gap map (all 8 areas with scores)
//    - top 2 lowest gaps
//    - one weekly action per gap
//    - export as JSON + Markdown
//
//  Security: every user-authored string reaches the DOM via textContent.
// ============================================================================

const SA_STORAGE_KEY = 'ai-evals-tutor:ai-native-pm:v1';

const AREAS = [
  {
    id: 'problem-finding',
    num: '01',
    title: 'Problem finding',
    blurb: 'Spot the real bottleneck in a messy agent workflow — the thing others walk past.',
    rubric: {
      1: 'I wait for problems to be handed to me. When I encounter a messy agent workflow, I don\'t know where to start looking.',
      3: 'I can spot obvious drop-offs (like "agents fail on complex tickets") but I miss the more subtle bottlenecks buried in traces.',
      5: 'I routinely enter unfamiliar agent systems, read traces + metrics, and surface a specific high-leverage problem statement with user · context · measurable gap.',
    },
    action: 'One rep per day: pick a live agent workflow, read 20 traces, write one problem statement in the format `user · context · measurable gap · why agents`. Do it for a week.',
  },
  {
    id: 'problem-solving',
    num: '02',
    title: 'Problem solving (agent-first)',
    blurb: 'Design the end-to-end agentic solution — the graph, the metrics, the failure modes.',
    rubric: {
      1: 'When someone asks "how would you solve this with AI?" I say "we should use AI." I can\'t name the components or the failure modes.',
      3: 'I can describe a solution at a high level (planner + tools + eval) but I hand-wave the guardrails, fallbacks, and metrics.',
      5: 'I design the full agent graph: planner → workers → critic → HITL. I name the metrics, the guardrails, the fallbacks, and the plan for iteration in loops.',
    },
    action: 'Take one problem statement from Problem Finding. Sketch the full agent graph on paper: planner, tools, critic, HITL, metrics, guardrails. Get one engineer to poke holes.',
  },
  {
    id: 'eval-thinking',
    num: '03',
    title: 'Eval thinking',
    blurb: 'Turn subjective "does it feel good?" into measurable, repeatable eval sets.',
    rubric: {
      1: 'I judge agent output by eyeballing a few examples. I don\'t have golden datasets or repeatable tests.',
      3: 'I keep a small set of golden examples but I don\'t run them systematically. Regression happens and I notice after users complain.',
      5: 'I own a golden dataset, an eval harness, and a scorecard. I regression-check every prompt change. I write new evals before shipping new capabilities.',
    },
    action: 'Build one 20-example golden set for a live agent feature this week. Score it manually. Turn 5 of those examples into automated evals by end of next week.',
  },
  {
    id: 'observability',
    num: '04',
    title: 'Observability',
    blurb: 'MELT (metrics, events, logs, traces) for agents. Understand failure from data, not vibes.',
    rubric: {
      1: 'When an agent fails I ask an engineer. I can\'t read a trace on my own. I don\'t know what tool call went wrong.',
      3: 'I can read traces after someone points me at them. I understand the vocabulary (tool call, prompt, latency) but I don\'t proactively monitor.',
      5: 'I have a dashboard for the agent features I own. I proactively review traces, spot bad tool choices, loops, and hallucinations. I explain failures with data.',
    },
    action: 'Pick one agent feature. Ask eng for read access to traces. Read 30 real production traces this week and write a "what breaks and why" one-pager.',
  },
  {
    id: 'product-judgment',
    num: '05',
    title: 'Product judgment (taste)',
    blurb: 'Know when the agent output is "good enough to ship" vs. "technically works but wrong."',
    rubric: {
      1: 'If the demo runs, I say "ship it." I can\'t tell the difference between "works in the happy path" and "works in the real world."',
      3: 'I catch the biggest failure modes but I\'m inconsistent. Sometimes I ship things that break for users I hadn\'t thought about.',
      5: 'I have strong opinions about what "shippable" looks like for agents. I can predict edge cases before they hit prod. Colleagues ask me to sanity-check others\' work.',
    },
    action: 'Every day this week, review one shipped agent output against real user context. Write "would I actually ship this?" + why. Compare to your team\'s decisions after the fact.',
  },
  {
    id: 'speed-to-prototype',
    num: '06',
    title: 'Speed to prototype',
    blurb: 'Idea → working agent prototype in hours, not weeks. You build, not just brief.',
    rubric: {
      1: 'I write PRDs and wait for engineers. I\'ve never shipped anything with AI/agent tooling myself.',
      3: 'I\'ve prototyped 1-2 things with Cursor, Claude Code, or Agentforce. It took days, felt awkward, but it worked.',
      5: 'I default to building a prototype before writing a doc. I can go from idea to working demo in an afternoon using agentic coding tools.',
    },
    action: 'Ship one micro-demo per week for the next 4 weeks. Any agentic tool (Cursor, Claude Code, Agentforce, Replit Agent). Different problem each time. Show it in your team meeting.',
  },
  {
    id: 'trust-safety',
    num: '07',
    title: 'Trust & safety',
    blurb: 'Design agents that fail safely — guardrails, kill switches, permissions, fallbacks.',
    rubric: {
      1: 'I don\'t think about failure modes until they happen. I assume the model + prompt will work most of the time.',
      3: 'I add basic guardrails (input validation, refusal patterns) but I don\'t systematically design fallback paths or human-in-the-loop escalations.',
      5: 'Every agent I design has: input guardrails, output validators, a fallback path, an escalation criterion, and a kill switch. I think in terms of failure classes.',
    },
    action: 'Take one agent you\'re shipping. Write a "trust doc" this week: input guardrails · output validators · fallback · escalation · kill switch. Get eng and legal to sign off.',
  },
  {
    id: 'influence-adoption',
    num: '08',
    title: 'Influence & adoption',
    blurb: 'Turn micro-demos into cross-team momentum. Route around org drag with evidence.',
    rubric: {
      1: 'I mostly work heads-down on my team. When I hit an org blocker, I escalate to my manager or wait.',
      3: 'I share demos and docs in Slack/all-hands sometimes. Some cross-team folks know I\'m doing AI work but they don\'t route to me.',
      5: 'When my org asks "who\'s the AI PM?" people say my name. I\'m in cross-team channels. I get pulled into agent conversations by default.',
    },
    action: 'Post one visible artifact per week for 4 weeks in a cross-team channel (Slack, all-hands, brown bag). Micro-demo, trace incident writeup, or eval one-pager. Track who reacts.',
  },
];

const DEFAULT_STATE = {
  scores: {},
  createdAt: null,
  updatedAt: null,
};


// ---------------------------------------------------------------------------
//  State + storage
// ---------------------------------------------------------------------------

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(SA_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, scores: {} };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed, scores: parsed.scores || {} };
  } catch {
    return { ...DEFAULT_STATE, scores: {} };
  }
}

function save() {
  const now = new Date().toISOString();
  if (!state.createdAt) state.createdAt = now;
  state.updatedAt = now;
  try {
    localStorage.setItem(SA_STORAGE_KEY, JSON.stringify(state));
    flashSaved();
  } catch (err) {
    console.error('Save failed:', err);
  }
}

let saveTimer = null;
function flashSaved() {
  const indicator = document.querySelector('[data-role="save-indicator"]');
  if (!indicator) return;
  indicator.textContent = 'Saved';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { indicator.textContent = ''; }, 1200);
}


// ---------------------------------------------------------------------------
//  DOM helper — createElement + textContent only
// ---------------------------------------------------------------------------
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}


// ---------------------------------------------------------------------------
//  Render areas
// ---------------------------------------------------------------------------
function renderAreas() {
  const mount = document.querySelector('[data-role="areas-mount"]');
  if (!mount) return;
  while (mount.firstChild) mount.removeChild(mount.firstChild);

  AREAS.forEach(area => {
    const score = state.scores[area.id];
    const isScored = typeof score === 'number';

    const scoreBadge = el('div', { class: 'sa-area__score' }, isScored ? String(score) : '—');

    const header = el('div', { class: 'sa-area__header' }, [
      el('div', { class: 'sa-area__label' }, [
        el('div', { class: 'sa-area__num' }, `Area ${area.num}`),
        el('h3', { class: 'sa-area__title' }, area.title),
        el('p', { class: 'sa-area__blurb' }, area.blurb),
      ]),
      scoreBadge,
    ]);

    const rubric = el('div', { class: 'sa-rubric' }, [1, 3, 5].map(n => {
      const isActive = score === n;
      return el('button', {
        class: `sa-rubric__option${isActive ? ' is-active' : ''}`,
        type: 'button',
        onclick: () => selectScore(area.id, n),
      }, [
        el('div', { class: 'sa-rubric__row' }, [
          el('span', { class: `sa-rubric__score sa-rubric__score--${n}` }, String(n)),
        ]),
        el('div', { class: 'sa-rubric__body' }, area.rubric[n]),
      ]);
    }));

    const areaCard = el('div', { class: `sa-area${isScored ? ' is-scored' : ''}` }, [header, rubric]);
    mount.appendChild(areaCard);
  });
}

function selectScore(areaId, score) {
  state.scores[areaId] = score;
  save();
  renderAreas();
  renderSummary();
}


// ---------------------------------------------------------------------------
//  Summary + weekly plan
// ---------------------------------------------------------------------------
function renderSummary() {
  const mount = document.querySelector('[data-role="summary-mount"]');
  if (!mount) return;

  const scoredIds = AREAS.filter(a => typeof state.scores[a.id] === 'number');
  if (scoredIds.length < 6) {
    mount.hidden = true;
    while (mount.firstChild) mount.removeChild(mount.firstChild);
    return;
  }

  mount.hidden = false;
  while (mount.firstChild) mount.removeChild(mount.firstChild);

  const total = scoredIds.reduce((sum, a) => sum + state.scores[a.id], 0);
  const max = scoredIds.length * 5;
  const pct = Math.round((total / max) * 100);

  const sorted = [...scoredIds].sort((a, b) => state.scores[a.id] - state.scores[b.id]);
  const gaps = sorted.slice(0, 2);
  const gapIds = new Set(gaps.map(g => g.id));

  const gapmap = el('div', { class: 'sa-gapmap' }, AREAS.map(area => {
    const s = state.scores[area.id];
    const scored = typeof s === 'number';
    const isGap = gapIds.has(area.id);
    return el('div', {
      class: `sa-gapmap__cell${isGap ? ' sa-gapmap__cell--gap' : ''}`,
    }, [
      el('div', { class: 'sa-gapmap__label' }, area.title),
      el('div', { class: 'sa-gapmap__score' }, scored ? String(s) : '—'),
    ]);
  }));

  const plan = el('div', { class: 'sa-plan' }, [
    el('div', { class: 'sa-plan__title' }, 'Your 4-week plan · one action per gap'),
    el('div', { class: 'sa-plan__list' }, gaps.map(g => {
      return el('div', { class: 'sa-plan__item' }, [
        el('div', { class: 'sa-plan__area' }, `${g.title} · scored ${state.scores[g.id]}`),
        el('div', { class: 'sa-plan__action' }, g.action),
      ]);
    })),
  ]);

  const actions = el('div', { class: 'sa-summary__actions' }, [
    el('button', {
      class: 'sa-btn sa-btn--primary',
      type: 'button',
      onclick: exportMarkdown,
    }, 'Export as Markdown'),
    el('button', {
      class: 'sa-btn sa-btn--secondary',
      type: 'button',
      onclick: exportJson,
    }, 'Export as JSON'),
  ]);

  const remaining = 8 - scoredIds.length;
  const ledeText = remaining > 0
    ? `You've scored ${scoredIds.length}/8 areas · overall ${total}/${max} (${pct}%). Score the remaining ${remaining} to complete your gap map. Your two lowest areas below are your starting point — one small weekly action for each.`
    : `You've scored all 8 areas · overall ${total}/${max} (${pct}%). Your two lowest areas below are your starting point — one small weekly action for each. Re-score every Friday and watch the numbers move.`;

  mount.appendChild(el('div', { class: 'sa-summary__eyebrow' }, 'Your gap map'));
  mount.appendChild(el('h2', { class: 'sa-summary__title' }, 'Where to focus this month.'));
  mount.appendChild(el('p', { class: 'sa-summary__lede' }, ledeText));
  mount.appendChild(gapmap);
  mount.appendChild(plan);
  mount.appendChild(actions);
}


// ---------------------------------------------------------------------------
//  Export
// ---------------------------------------------------------------------------
function buildReport() {
  const scoredAreas = AREAS.filter(a => typeof state.scores[a.id] === 'number');
  const total = scoredAreas.reduce((sum, a) => sum + state.scores[a.id], 0);
  const max = scoredAreas.length * 5;
  const sorted = [...scoredAreas].sort((a, b) => state.scores[a.id] - state.scores[b.id]);
  const gaps = sorted.slice(0, 2);

  return {
    track: 'ai-native-pm',
    version: 1,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    overall: {
      scoredAreas: scoredAreas.length,
      totalAreas: AREAS.length,
      score: total,
      max,
      percentage: max > 0 ? Math.round((total / max) * 100) : 0,
    },
    areas: AREAS.map(a => ({
      id: a.id,
      title: a.title,
      score: state.scores[a.id] ?? null,
    })),
    weeklyPlan: gaps.map(g => ({
      area: g.title,
      score: state.scores[g.id],
      action: g.action,
    })),
  };
}

function exportJson() {
  const report = buildReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  triggerDownload('ai-native-pm-self-assessment.json', blob);
}

function exportMarkdown() {
  const report = buildReport();
  const lines = [];
  lines.push('# AI-Native PM · Self-Assessment');
  lines.push('');
  if (report.updatedAt) lines.push(`_Updated: ${report.updatedAt}_`);
  lines.push('');
  lines.push(`**Overall:** ${report.overall.score} / ${report.overall.max} (${report.overall.percentage}%) across ${report.overall.scoredAreas} of ${report.overall.totalAreas} areas.`);
  lines.push('');
  lines.push('## Gap map');
  lines.push('');
  lines.push('| Area | Score |');
  lines.push('|------|-------|');
  report.areas.forEach(a => {
    lines.push(`| ${a.title} | ${a.score ?? '—'} |`);
  });
  lines.push('');
  lines.push('## Weekly plan · lowest 2 areas');
  lines.push('');
  report.weeklyPlan.forEach((p, i) => {
    lines.push(`### ${i + 1}. ${p.area} · scored ${p.score}`);
    lines.push('');
    lines.push(p.action);
    lines.push('');
  });
  lines.push('---');
  lines.push('_From the AI PM Skills Lab · Track 01 · How to Become an AI-Native PM_');
  lines.push('');
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  triggerDownload('ai-native-pm-self-assessment.md', blob);
}

function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// ---------------------------------------------------------------------------
//  Reset
// ---------------------------------------------------------------------------
function resetAll() {
  if (!confirm('Clear all scores and start over? This cannot be undone.')) return;
  state = { ...DEFAULT_STATE, scores: {} };
  try { localStorage.removeItem(SA_STORAGE_KEY); } catch {}
  renderAreas();
  renderSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ---------------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------------
function boot() {
  const resetBtn = document.querySelector('[data-role="reset"]');
  if (resetBtn) resetBtn.addEventListener('click', resetAll);
  renderAreas();
  renderSummary();
}

boot();
