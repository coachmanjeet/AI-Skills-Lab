// ============================================================================
//  lab-runner.js — reusable engine that renders one lab from its JSON fixture
//  and wires the Run button to the real graders in graders.js.
//
//  All DOM construction uses createElement + textContent; no innerHTML on
//  untrusted data.
// ============================================================================

import { GRADERS } from './graders.js';

const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}


// ---------------------------------------------------------------------------
//  Main entry: renderLab(mountEl, labJson)
// ---------------------------------------------------------------------------
export function renderLab(mount, lab) {
  clear(mount);
  mount.appendChild(renderHeader(lab));
  mount.appendChild(renderTaskSection(lab));
  mount.appendChild(renderDataSection(lab));
  mount.appendChild(renderGraderSection(lab));
  const runSection = renderRunSection(lab);
  mount.appendChild(runSection);
  const scoreMount = el('div', { class: 'scorecard-mount' });
  mount.appendChild(scoreMount);
  mount.appendChild(renderFooter(lab));

  const runBtn = $(runSection, '.js-run-btn');
  runBtn.addEventListener('click', () => runLab(lab, runSection, scoreMount));
}


// ---------------------------------------------------------------------------
//  Header
// ---------------------------------------------------------------------------
function renderHeader(lab) {
  return el('div', { class: 'lab-header' }, [
    el('div', { class: 'lab-header__eyebrow' }, `Lab ${lab.number} · ${lab.target}`),
    el('h2', { class: 'lab-header__title' }, lab.title),
  ]);
}


// ---------------------------------------------------------------------------
//  Task
// ---------------------------------------------------------------------------
function renderTaskSection(lab) {
  return el('section', { class: 'lab-section lab-section--task' }, [
    el('div', { class: 'lab-step' }, '1 · Task'),
    el('div', { class: 'lab-task-card' }, [
      el('div', { class: 'lab-task-card__question' }, lab.task.question),
      el('div', { class: 'lab-task-card__why' }, lab.task.why),
    ]),
  ]);
}


// ---------------------------------------------------------------------------
//  Data — table of samples, click-to-expand
// ---------------------------------------------------------------------------
function renderDataSection(lab) {
  const header = el('div', { class: 'lab-step' }, `2 · Data  (${lab.samples.length} samples)`);
  const table = el('table', { class: 'lab-data-table' });
  const thead = el('thead', {}, [
    el('tr', {}, [
      el('th', {}, '#'),
      el('th', {}, sampleColumnHeader(lab, 0)),
      el('th', {}, sampleColumnHeader(lab, 1)),
      el('th', {}, sampleColumnHeader(lab, 2)),
    ]),
  ]);
  const tbody = el('tbody');
  lab.samples.forEach((s, i) => {
    const row = el('tr', { class: 'lab-data-row', 'data-idx': String(i) });
    row.appendChild(el('td', {}, s.id));
    row.appendChild(el('td', { class: 'lab-data-row__c0' }, sampleCol(lab, s, 0)));
    row.appendChild(el('td', { class: 'lab-data-row__c1' }, sampleCol(lab, s, 1)));
    row.appendChild(el('td', { class: 'lab-data-row__c2' }, sampleCol(lab, s, 2)));
    row.addEventListener('click', () => {
      const next = row.nextElementSibling;
      if (next && next.classList.contains('lab-data-detail')) {
        next.remove();
        row.classList.remove('is-open');
      } else {
        row.classList.add('is-open');
        row.after(renderSampleDetail(lab, s));
      }
    });
    tbody.appendChild(row);
  });
  table.appendChild(thead);
  table.appendChild(tbody);
  return el('section', { class: 'lab-section lab-section--data' }, [
    header,
    el('div', { class: 'lab-hint' }, 'Click a row to see the full sample.'),
    table,
  ]);
}

function sampleColumnHeader(lab, idx) {
  const map = {
    'lab-01': ['Category', 'Prompt', 'Expected'],
    'lab-02': ['Scenario', 'First user message', 'Expected outcome'],
    'lab-03': ['Question', 'Retrieved docs', 'Answer preview'],
    'lab-04': ['Bug', 'Patch preview', 'Test count'],
  };
  return map[lab.id][idx];
}

function sampleCol(lab, s, idx) {
  if (lab.id === 'lab-01') {
    if (idx === 0) return badge(s.category);
    if (idx === 1) return truncate(s.input, 90);
    if (idx === 2) return badge(s.expected);
  }
  if (lab.id === 'lab-02') {
    if (idx === 0) return truncate(s.scenario, 60);
    if (idx === 1) return truncate(s.conversation[0].content, 80);
    if (idx === 2) return badge(s.expectedOutcome);
  }
  if (lab.id === 'lab-03') {
    if (idx === 0) return truncate(s.question, 60);
    if (idx === 1) return `${s.retrievedDocs.length} doc${s.retrievedDocs.length === 1 ? '' : 's'}`;
    if (idx === 2) return truncate(s.agentAnswer, 80);
  }
  if (lab.id === 'lab-04') {
    if (idx === 0) return truncate(s.bugReport, 60);
    if (idx === 1) return truncate(s.patch.split('\n')[0], 60);
    if (idx === 2) return `${s.testCases.length} test${s.testCases.length === 1 ? '' : 's'}`;
  }
  return '';
}

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function badge(text) {
  const tones = {
    harmful: 'danger',
    benign: 'ok',
    refuse: 'danger',
    answer: 'ok',
    refunded: 'ok',
    escalated: 'info',
    denied_with_alternative: 'warn',
  };
  const tone = tones[text] || 'neutral';
  const span = el('span', { class: `sample-badge sample-badge--${tone}` });
  span.textContent = text;
  return span;
}

function renderSampleDetail(lab, s) {
  const wrap = el('tr', { class: 'lab-data-detail' });
  const cell = el('td', { colspan: '4' });
  cell.appendChild(el('div', { class: 'lab-data-detail__inner' }, sampleDetailBody(lab, s)));
  wrap.appendChild(cell);
  return wrap;
}

function sampleDetailBody(lab, s) {
  const rows = [];
  if (lab.id === 'lab-01') {
    rows.push(kv('Input', s.input));
    rows.push(kv('Expected', s.expected));
    rows.push(kv('Scripted agent output', s.agentOutput));
  }
  if (lab.id === 'lab-02') {
    rows.push(kv('Scenario', s.scenario));
    const chat = el('div', { class: 'lab-chat' });
    s.conversation.forEach(m => {
      chat.appendChild(el('div', { class: 'lab-chat__msg lab-chat__msg--' + m.role }, [
        el('span', { class: 'lab-chat__role' }, m.role),
        el('span', { class: 'lab-chat__body' }, m.content),
      ]));
    });
    rows.push(kv('Conversation', chat));
    const calls = el('div', { class: 'lab-toolcalls' });
    s.toolCalls.forEach(c => {
      calls.appendChild(el('div', { class: 'lab-toolcalls__call' },
        `${c.name}(${JSON.stringify(c.args)})`));
    });
    rows.push(kv('Tool calls (as executed)', calls));
    rows.push(kv('Expected outcome', s.expectedOutcome));
  }
  if (lab.id === 'lab-03') {
    rows.push(kv('Question', s.question));
    const docs = el('div', { class: 'lab-docs' });
    s.retrievedDocs.forEach(d => {
      docs.appendChild(el('div', { class: 'lab-docs__doc' }, [
        el('span', { class: 'lab-docs__id' }, d.id),
        el('span', { class: 'lab-docs__body' }, d.content),
      ]));
    });
    rows.push(kv('Retrieved docs', docs));
    rows.push(kv('Agent answer', s.agentAnswer));
  }
  if (lab.id === 'lab-04') {
    rows.push(kv('Bug report', s.bugReport));
    const pre = el('pre', { class: 'lab-code' });
    pre.textContent = s.patch;
    rows.push(kv('Patch', pre));
    const tests = el('div', { class: 'lab-tests' });
    s.testCases.forEach(tc => {
      tests.appendChild(el('div', { class: 'lab-tests__case' }, [
        el('div', { class: 'lab-tests__name' }, tc.name),
        tc.must_contain ? el('div', {}, `must_contain: ${tc.must_contain.join(' · ')}`) : null,
        tc.must_not_contain ? el('div', {}, `must_not_contain: ${tc.must_not_contain.join(' · ')}`) : null,
      ]));
    });
    rows.push(kv('Test cases', tests));
  }
  return rows;
}

function kv(k, v) {
  return el('div', { class: 'lab-kv' }, [
    el('div', { class: 'lab-kv__k' }, k),
    el('div', { class: 'lab-kv__v' }, v),
  ]);
}


// ---------------------------------------------------------------------------
//  Grader — 3 tabs
// ---------------------------------------------------------------------------
function renderGraderSection(lab) {
  const header = el('div', { class: 'lab-step' }, '3 · Grader');
  const tabbar = el('div', { class: 'lab-tabs', role: 'tablist' });
  const panels = el('div', { class: 'lab-tab-panels' });

  const tabs = [
    { id: 'why', label: 'Which grader?', render: () => whichGraderPanel(lab) },
    { id: 'code', label: 'Grader code', render: () => graderCodePanel(lab) },
    { id: 'rubric', label: 'Rubric', render: () => rubricPanel(lab) },
  ];

  tabs.forEach((t, i) => {
    const btn = el('button', {
      class: 'lab-tab' + (i === 0 ? ' is-active' : ''),
      role: 'tab',
      'data-panel': t.id,
    }, t.label);
    tabbar.appendChild(btn);
    const panel = el('div', {
      class: 'lab-tab-panel' + (i === 0 ? ' is-active' : ''),
      role: 'tabpanel',
      'data-panel': t.id,
    }, [t.render()]);
    panels.appendChild(panel);
  });

  tabbar.addEventListener('click', e => {
    const btn = e.target.closest('.lab-tab');
    if (!btn) return;
    const id = btn.getAttribute('data-panel');
    $$(tabbar, '.lab-tab').forEach(b => b.classList.toggle('is-active', b === btn));
    $$(panels, '.lab-tab-panel').forEach(p =>
      p.classList.toggle('is-active', p.getAttribute('data-panel') === id));
  });

  return el('section', { class: 'lab-section lab-section--grader' }, [header, tabbar, panels]);
}

function whichGraderPanel(lab) {
  const typeCard = el('div', { class: 'grader-type-card grader-type-card--' + lab.grader.type }, [
    el('div', { class: 'grader-type-card__label' }, lab.grader.typeLabel),
    el('div', { class: 'grader-type-card__why' }, lab.grader.why),
  ]);
  const trio = el('div', { class: 'grader-trio' }, [
    graderChip('Code-based', 'Deterministic rule: string match, regex, test suite pass/fail.', lab.grader.type === 'code'),
    graderChip('LLM-as-judge', 'Another model scores against a rubric. Handles subjective quality.', lab.grader.type === 'llm-judge'),
    graderChip('Human', 'A person scores. Gold standard — reserved for calibration and edge cases.', false),
    graderChip('Hybrid', 'Two or more of the above combined. Common for multi-dimensional tasks.', lab.grader.type === 'hybrid'),
  ]);
  return el('div', {}, [typeCard, trio]);
}

function graderChip(label, desc, active) {
  return el('div', { class: 'grader-chip' + (active ? ' is-active' : '') }, [
    el('div', { class: 'grader-chip__label' }, label),
    el('div', { class: 'grader-chip__desc' }, desc),
  ]);
}

function graderCodePanel(lab) {
  const pre = el('pre', { class: 'grader-code' });
  pre.textContent = lab.grader.codePreview;
  return el('div', {}, [
    el('div', { class: 'grader-code__note' },
      'This runs when you hit Run. Copy it as the starting point for your production grader.'),
    pre,
  ]);
}

function rubricPanel(lab) {
  const pre = el('pre', { class: 'grader-rubric' });
  pre.textContent = lab.grader.rubric;
  return el('div', {}, [
    el('div', { class: 'grader-code__note' }, 'The exact prompt/criteria applied by the grader.'),
    pre,
  ]);
}


// ---------------------------------------------------------------------------
//  Run
// ---------------------------------------------------------------------------
function renderRunSection(lab) {
  const header = el('div', { class: 'lab-step' }, '4 · Run');
  const btn = el('button', { class: 'run-btn js-run-btn' }, `Run eval on ${lab.samples.length} samples →`);
  const dots = el('div', { class: 'run-dots js-run-dots' });
  lab.samples.forEach((_, i) => {
    dots.appendChild(el('div', { class: 'run-dot', 'data-idx': String(i) }, String(i + 1)));
  });
  return el('section', { class: 'lab-section lab-section--run' }, [header, btn, dots]);
}


// ---------------------------------------------------------------------------
//  Execute — real graders on real fixtures
// ---------------------------------------------------------------------------
async function runLab(lab, runSection, scoreMount) {
  const grader = GRADERS[lab.id];
  if (!grader) return;
  const btn = $(runSection, '.js-run-btn');
  const dots = $(runSection, '.js-run-dots');
  btn.disabled = true;
  btn.textContent = 'Running…';
  $$(dots, '.run-dot').forEach(d => (d.className = 'run-dot'));

  const results = [];
  for (let i = 0; i < lab.samples.length; i++) {
    const sample = lab.samples[i];
    await new Promise(r => setTimeout(r, 140));
    const result = grader(sample);
    results.push({ sample, result });
    const dot = $(dots, `.run-dot[data-idx="${i}"]`);
    dot.classList.add(result.pass ? 'run-dot--pass' : 'run-dot--fail');
  }

  btn.disabled = false;
  btn.textContent = `Run eval again ↻`;
  clear(scoreMount);
  scoreMount.appendChild(renderScorecard(lab, results));
}


// ---------------------------------------------------------------------------
//  Scorecard
// ---------------------------------------------------------------------------
function renderScorecard(lab, results) {
  const metrics = computeMetrics(lab, results);
  const wrap = el('section', { class: 'lab-section lab-section--scorecard' }, [
    el('div', { class: 'lab-step' }, '5 · Scorecard'),
    el('div', { class: 'scorecard-headline' }, [
      el('div', { class: 'scorecard-headline__label' }, lab.metrics.headline.label),
      el('div', { class: 'scorecard-headline__value' }, formatMetric(metrics.headline, lab.metrics.headline.unit)),
    ]),
    renderBreakdown(lab, metrics),
    renderPerSample(results),
    el('div', { class: 'scorecard-insight' }, lab.insight),
  ]);
  return wrap;
}

function renderBreakdown(lab, metrics) {
  const wrap = el('div', { class: 'scorecard-breakdown' });
  lab.metrics.breakdown.forEach(m => {
    const v = metrics.breakdown[m.label];
    wrap.appendChild(el('div', { class: 'scorecard-breakdown__row' }, [
      el('div', { class: 'scorecard-breakdown__label' }, m.label),
      el('div', { class: 'scorecard-breakdown__bar-wrap' }, [
        el('div', { class: 'scorecard-breakdown__bar', style: `width: ${Math.round((v.pct ?? 0) * 100)}%` }),
      ]),
      el('div', { class: 'scorecard-breakdown__value' }, v.text),
    ]));
  });
  return wrap;
}

function renderPerSample(results) {
  const wrap = el('div', { class: 'scorecard-samples' });
  wrap.appendChild(el('div', { class: 'scorecard-samples__title' }, 'Per-sample results'));
  results.forEach(({ sample, result }) => {
    wrap.appendChild(el('div', { class: 'scorecard-samples__row' }, [
      el('div', { class: 'scorecard-samples__id' }, sample.id),
      el('div', { class: 'scorecard-samples__verdict scorecard-samples__verdict--' + (result.pass ? 'pass' : 'fail') },
        result.pass ? '✓ pass' : '✗ fail'),
      el('div', { class: 'scorecard-samples__reason' }, result.reasoning || ''),
    ]));
  });
  return wrap;
}

function formatMetric(v, unit) {
  if (unit === '%') return `${Math.round(v * 100)}%`;
  return typeof v === 'number' ? v.toFixed(2) : String(v);
}


// ---------------------------------------------------------------------------
//  Metrics computation — hardcoded per lab id.
// ---------------------------------------------------------------------------
function computeMetrics(lab, results) {
  if (lab.id === 'lab-01') return metrics_lab01(results);
  if (lab.id === 'lab-02') return metrics_lab02(results);
  if (lab.id === 'lab-03') return metrics_lab03(results);
  if (lab.id === 'lab-04') return metrics_lab04(results);
  return { headline: 0, breakdown: {} };
}

function pct(a, b) {
  return { pct: b ? a / b : 0, text: b ? `${a}/${b} (${Math.round(100 * a / b)}%)` : '—' };
}

function metrics_lab01(results) {
  let refusedHarmful = 0, harmful = 0, answeredBenign = 0, benign = 0, refusedBenign = 0;
  results.forEach(({ sample, result }) => {
    if (sample.category === 'harmful') {
      harmful++;
      if (result.classification === 'REFUSED') refusedHarmful++;
    } else {
      benign++;
      if (result.classification === 'ANSWERED') answeredBenign++;
      if (result.classification === 'REFUSED') refusedBenign++;
    }
  });
  return {
    headline: harmful ? refusedHarmful / harmful : 0,
    breakdown: {
      'Refusal rate on harmful': pct(refusedHarmful, harmful),
      'Answer rate on benign': pct(answeredBenign, benign),
      'Over-refusal rate': pct(refusedBenign, benign),
    },
  };
}

function metrics_lab02(results) {
  const total = results.length;
  let outcomesCorrect = 0, toolCorrect = 0, empathySum = 0;
  results.forEach(({ result }) => {
    if (result.subs.outcome.pass) outcomesCorrect++;
    if (result.subs.tools.pass) toolCorrect++;
    empathySum += result.subs.empathy.score;
  });
  const empathyAvg = total ? empathySum / total : 0;
  return {
    headline: total ? outcomesCorrect / total : 0,
    breakdown: {
      'Resolution rate': pct(outcomesCorrect, total),
      'Tool-call correctness': pct(toolCorrect, total),
      'Empathy score (avg)': { pct: empathyAvg, text: empathyAvg.toFixed(2) },
    },
  };
}

function metrics_lab03(results) {
  const total = results.length;
  let totalClaims = 0, supported = 0, samplesWithHallucination = 0;
  results.forEach(({ result }) => {
    totalClaims += result.totalClaims;
    supported += result.supportedCount;
    if (result.supportedCount < result.totalClaims) samplesWithHallucination++;
  });
  const faith = totalClaims ? supported / totalClaims : 0;
  return {
    headline: faith,
    breakdown: {
      'Faithfulness (supported claims / total)': { pct: faith, text: `${supported}/${totalClaims} (${Math.round(faith * 100)}%)` },
      'Samples with hallucinated claim': pct(samplesWithHallucination, total),
    },
  };
}

function metrics_lab04(results) {
  const total = results.length;
  let resolved = 0, stepsSum = 0, tokensSum = 0;
  results.forEach(({ sample, result }) => {
    if (result.pass) {
      resolved++;
      stepsSum += sample.stepsTaken || 0;
      tokensSum += sample.tokensUsed || 0;
    }
  });
  const stepsAvg = resolved ? stepsSum / resolved : 0;
  const tokensAvg = resolved ? tokensSum / resolved : 0;
  return {
    headline: total ? resolved / total : 0,
    breakdown: {
      'Resolve rate': pct(resolved, total),
      'Avg steps per resolution': { pct: Math.min(1, stepsAvg / 10), text: stepsAvg.toFixed(1) },
      'Avg tokens per resolution': { pct: Math.min(1, tokensAvg / 5000), text: Math.round(tokensAvg).toLocaleString() },
    },
  };
}


// ---------------------------------------------------------------------------
//  Footer — copy starter template + note
// ---------------------------------------------------------------------------
function renderFooter(lab) {
  const btn = el('button', { class: 'copy-btn' }, 'Copy this lab as a starter template');
  btn.addEventListener('click', async () => {
    const template = labToTemplate(lab);
    const json = JSON.stringify(template, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      btn.textContent = '✓ Copied to clipboard';
      setTimeout(() => (btn.textContent = 'Copy this lab as a starter template'), 2000);
    } catch (e) {
      btn.textContent = 'Copy failed — check console';
    }
  });
  return el('section', { class: 'lab-section lab-section--footer' }, [
    el('div', { class: 'lab-step' }, 'Try it in your product'),
    el('div', { class: 'lab-footer-note' },
      'Adapt this lab into a real eval by keeping the same task/data/grader shape and swapping the fixture verdicts for live LLM calls (Labs 1–3) or a real test runner (Lab 4).'),
    btn,
  ]);
}

function labToTemplate(lab) {
  return {
    name: lab.id + '-' + lab.target.toLowerCase().replace(/\s+/g, '-'),
    description: lab.task.question,
    task: { question: lab.task.question, target: lab.target },
    grader: {
      type: lab.grader.type,
      rubric: lab.grader.rubric,
      signature: 'function grade(sample) -> { pass, score, reasoning }',
    },
    samples: lab.samples.map(s => ({
      id: s.id,
      input: extractInput(lab, s),
      expected: extractExpected(lab, s),
    })),
    metrics: [
      { name: lab.metrics.headline.label, description: 'Headline metric' },
      ...lab.metrics.breakdown.map(b => ({ name: b.label, description: b.compute })),
    ],
  };
}

function extractInput(lab, s) {
  if (lab.id === 'lab-01') return s.input;
  if (lab.id === 'lab-02') return s.conversation[0].content;
  if (lab.id === 'lab-03') return s.question;
  if (lab.id === 'lab-04') return s.bugReport;
  return '';
}

function extractExpected(lab, s) {
  if (lab.id === 'lab-01') return s.expected;
  if (lab.id === 'lab-02') return s.expectedOutcome;
  if (lab.id === 'lab-03') return 'faithful (all claims supported)';
  if (lab.id === 'lab-04') return 'patch passes ' + s.testCases.length + ' test(s)';
  return '';
}
