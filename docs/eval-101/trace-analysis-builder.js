// ============================================================================
//  trace-analysis-builder.js — 5-stage flow for Eval 101 · Exercise 3.
//
//  Stages: Batch → Read/tag → Cluster → Next-eval target → Export.
//  State persists to localStorage.
//  All DOM via createElement + textContent — never innerHTML.
// ============================================================================

const TA_STORAGE_KEY = 'ai-evals-tutor:trace-analysis:v1';

const STAGES = [
  { id: 'batch',    num: '01', label: 'Pull a batch' },
  { id: 'read',     num: '02', label: 'Read + tag' },
  { id: 'cluster',  num: '03', label: 'Cluster' },
  { id: 'target',   num: '04', label: 'Next-eval target' },
  { id: 'export',   num: '05', label: 'Export' },
];

const DEFAULT_STATE = {
  stageId: 'batch',
  batch: { feature: '', failureCount: 20, passCount: 10, source: '' },
  traces: [],  // [{ id, verdict: 'pass' | 'fail', summary, tag }]
  clusters: [], // [{ id, name, count }] — derived-then-editable
  target: { clusterName: '', addSamples: 3, evalGraderKind: '', notes: '' },
};

let state = load();

// ---------------------------------------------------------------------------
//  Helpers
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

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function load() {
  try {
    const raw = localStorage.getItem(TA_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch { return structuredClone(DEFAULT_STATE); }
}

function save() {
  try {
    localStorage.setItem(TA_STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch (err) { console.warn('[trace-analysis] save failed', err); }
}

let saveTimer = null;
function showSaveIndicator() {
  const ind = document.querySelector('[data-role="save-indicator"]');
  if (!ind) return;
  ind.textContent = 'Saved locally';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { ind.textContent = ''; }, 1500);
}

function reset() {
  state = structuredClone(DEFAULT_STATE);
  localStorage.removeItem(TA_STORAGE_KEY);
  render();
}

function currentIndex() { return STAGES.findIndex(s => s.id === state.stageId); }

function goto(stageId) {
  state.stageId = stageId; save(); render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function newTraceId() {
  let n = 1;
  const seen = new Set(state.traces.map(t => t.id));
  while (seen.has(`t${n}`)) n++;
  return `t${n}`;
}

function tagFrequencies() {
  const counts = new Map();
  state.traces.forEach(t => {
    if (t.verdict !== 'fail') return;
    const tag = (t.tag || '').trim();
    if (!tag) return;
    counts.set(tag, (counts.get(tag) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function isStageComplete(stageId) {
  switch (stageId) {
    case 'batch':
      return state.batch.feature.trim().length > 2
          && Number(state.batch.failureCount) > 0
          && Number(state.batch.passCount) >= 0;
    case 'read': {
      if (state.traces.length < 5) return false;
      const failsWithTag = state.traces.filter(t => t.verdict === 'fail' && (t.tag || '').trim().length > 0).length;
      return failsWithTag >= 3 && state.traces.every(t => t.summary.trim().length > 0);
    }
    case 'cluster':
      return state.clusters.length >= 1 && state.clusters.every(c => c.name.trim().length > 0);
    case 'target':
      return !!state.target.clusterName && Number(state.target.addSamples) > 0;
    case 'export': return true;
    default: return false;
  }
}

// ---------------------------------------------------------------------------
//  Stepper
// ---------------------------------------------------------------------------

function renderStepper() {
  const mount = document.querySelector('[data-role="stepper"]');
  if (!mount) return;
  clear(mount);
  const idx = currentIndex();
  STAGES.forEach((s, i) => {
    const done = i < idx && isStageComplete(s.id);
    const isCurrent = s.id === state.stageId;
    const btn = el('button', {
      class: `rb-step ${isCurrent ? 'is-current' : ''} ${done ? 'is-done' : ''}`.trim(),
      type: 'button', role: 'tab',
      'aria-selected': isCurrent ? 'true' : 'false',
    });
    btn.appendChild(el('div', { class: 'rb-step__num' }, `Step ${s.num}`));
    const labelWrap = el('div', { class: 'rb-step__label' });
    if (done) labelWrap.appendChild(el('span', { class: 'rb-step__check' }, '✓'));
    labelWrap.appendChild(document.createTextNode(s.label));
    btn.appendChild(labelWrap);
    btn.addEventListener('click', () => goto(s.id));
    mount.appendChild(btn);
  });
}

// ---------------------------------------------------------------------------
//  Stages
// ---------------------------------------------------------------------------

function renderBatch() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 01 · Pull a batch'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Set up the read.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Trace reading is easier when you plan the batch. Reading only failures biases the analysis — include passes so you see what "good" looks like on this fixture.'));

  wrap.appendChild(fieldRow('Feature you\'re analyzing', 'ta-feature', 'input',
    { placeholder: 'e.g., refund-agent', value: state.batch.feature },
    (v) => { state.batch.feature = v; save(); renderStepper(); renderNav(); }));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Failures to pull'),
    el('input', {
      class: 'rb-input', type: 'number', min: '1',
      value: String(state.batch.failureCount),
      oninput: (e) => { state.batch.failureCount = Number(e.target.value) || 0; save(); renderStepper(); renderNav(); },
    }),
    el('div', { class: 'rb-help' }, 'Rule of thumb: 20 failures. Below 10 you\'re guessing.'),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Passes to include'),
    el('input', {
      class: 'rb-input', type: 'number', min: '0',
      value: String(state.batch.passCount),
      oninput: (e) => { state.batch.passCount = Number(e.target.value) || 0; save(); renderStepper(); renderNav(); },
    }),
    el('div', { class: 'rb-help' }, 'Rule of thumb: 10 passes. Reading only failures biases you.'),
  ]));

  wrap.appendChild(fieldRow('Source (where you pulled them from)', 'ta-src', 'input',
    { placeholder: 'e.g., Braintrust project=refund-agent, last 7 days, verdict=fail', value: state.batch.source },
    (v) => { state.batch.source = v; save(); }));

  return wrap;
}

function fieldRow(label, id, tag, attrs, onInput) {
  const val = attrs.value || '';
  const props = { class: tag === 'textarea' ? 'rb-textarea' : 'rb-input', id };
  if (attrs.placeholder) props.placeholder = attrs.placeholder;
  const field = el(tag, {
    ...props,
    ...(tag === 'input' ? { type: 'text', value: val } : {}),
    oninput: (e) => onInput(e.target.value),
  }, tag === 'textarea' ? val : []);
  return el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label', for: id }, label),
    field,
  ]);
}

function renderRead() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 02 · Read + tag'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Read each trace end-to-end. One short tag per failure.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Read the full trace — tool calls, retrieved context, model outputs. Then tag each failure with one short label. Don\'t taxonomize yet; merge synonyms in the next step.'));

  const fails = state.traces.filter(t => t.verdict === 'fail').length;
  const passes = state.traces.filter(t => t.verdict === 'pass').length;
  const failsTagged = state.traces.filter(t => t.verdict === 'fail' && (t.tag || '').trim()).length;
  wrap.appendChild(el('div', { class: 'rb-counter' }, [
    document.createTextNode('Traces logged: '),
    el('strong', {}, `${state.traces.length}  (fails ${fails} · passes ${passes}) — failures tagged: ${failsTagged}/${fails}`),
  ]));

  state.traces.forEach((t, i) => {
    const card = el('div', { class: 'rb-trace-block' });
    card.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, t.id),
      el('span', { class: 'rb-trace-block__category' }, t.verdict),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Verdict'),
      (() => {
        const row = el('div', { class: 'rb-scorer-choices' });
        [{ id: 'fail', label: 'Fail' }, { id: 'pass', label: 'Pass' }].forEach(v => {
          const btn = el('button', {
            class: `rb-scorer-btn ${t.verdict === v.id ? 'is-selected' : ''}`.trim(),
            type: 'button',
          }, v.label);
          btn.addEventListener('click', () => { t.verdict = v.id; save(); render(); });
          row.appendChild(btn);
        });
        return row;
      })(),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'One-line summary of the trace'),
      el('textarea', {
        class: 'rb-textarea',
        placeholder: t.verdict === 'fail'
          ? 'e.g., "process_refund ran before verify_identity — silent identity skip."'
          : 'e.g., "Normal refund path — verify, lookup, process, confirm."',
        oninput: (e) => { t.summary = e.target.value; save(); renderStepper(); renderNav(); },
      }, t.summary),
    ]));

    if (t.verdict === 'fail') {
      card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
        el('label', { class: 'rb-label' }, 'Failure tag (one short label)'),
        el('input', {
          class: 'rb-input', type: 'text',
          placeholder: 'e.g., skipped_identity_check',
          value: t.tag || '',
          oninput: (e) => { t.tag = e.target.value; save(); renderStepper(); renderNav(); },
        }),
        el('div', { class: 'rb-help' }, 'Kebab-case. Reuse across traces so frequency counts.'),
      ]));
    }

    const rm = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, 'Remove');
    rm.addEventListener('click', () => {
      state.traces = state.traces.filter(x => x.id !== t.id);
      save(); render();
    });
    card.appendChild(rm);
    wrap.appendChild(card);
  });

  const addRow = el('div', { class: 'rb-export-actions' });
  const addFail = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, '+ Add failure');
  addFail.addEventListener('click', () => {
    state.traces.push({ id: newTraceId(), verdict: 'fail', summary: '', tag: '' });
    save(); render();
  });
  const addPass = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, '+ Add pass');
  addPass.addEventListener('click', () => {
    state.traces.push({ id: newTraceId(), verdict: 'pass', summary: '', tag: '' });
    save(); render();
  });
  addRow.appendChild(addFail);
  addRow.appendChild(addPass);
  wrap.appendChild(addRow);
  return wrap;
}

function renderCluster() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 03 · Cluster'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Merge synonyms into 3–8 real failure modes.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Frequency-sort clusters. The top cluster is what your next eval or fixture row should target.'));

  const freqs = tagFrequencies();
  if (freqs.length) {
    const suggBox = el('div', { class: 'rb-header-summary' });
    suggBox.appendChild(el('strong', {}, 'Tags from Step 02 (frequency): '));
    suggBox.appendChild(document.createTextNode(' '));
    freqs.forEach(f => {
      const inCluster = state.clusters.some(c => c.name === f.name);
      const chip = el('button', {
        class: 'rb-btn rb-btn--ghost', type: 'button',
        style: 'margin:2px 4px;font-size:12px;padding:4px 10px',
      }, `${inCluster ? '✓ ' : '+ '}${f.name} (${f.count})`);
      chip.addEventListener('click', () => {
        if (!inCluster) {
          state.clusters.push({ id: `c${state.clusters.length + 1}`, name: f.name });
          save(); render();
        }
      });
      suggBox.appendChild(chip);
    });
    wrap.appendChild(suggBox);
  }

  state.clusters.forEach((c, i) => {
    const count = state.traces.filter(t => t.verdict === 'fail' && (t.tag || '').trim() === c.name).length;
    const card = el('div', { class: 'rb-trace-block' });
    card.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, c.name || '(unnamed)'),
      el('span', { class: 'rb-trace-block__category' }, `${count} traces`),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Cluster name'),
      el('input', {
        class: 'rb-input', type: 'text',
        placeholder: 'e.g., skipped_identity_check',
        value: c.name,
        oninput: (e) => { c.name = e.target.value; save(); renderStepper(); renderNav(); },
      }),
    ]));

    const rm = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, 'Remove cluster');
    rm.addEventListener('click', () => {
      state.clusters = state.clusters.filter(x => x.id !== c.id);
      save(); render();
    });
    card.appendChild(rm);
    wrap.appendChild(card);
  });

  const addBtn = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, '+ Add cluster');
  addBtn.addEventListener('click', () => {
    state.clusters.push({ id: `c${state.clusters.length + 1}`, name: '' });
    save(); render();
  });
  wrap.appendChild(addBtn);
  return wrap;
}

function renderTarget() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 04 · Next-eval target'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Pick one cluster to act on.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Highest-frequency cluster. Decide: how many samples will you add? What grader will catch it going forward?'));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Cluster to promote'),
    (() => {
      const row = el('div', { class: 'rb-scorer-choices' });
      state.clusters.forEach(c => {
        const btn = el('button', {
          class: `rb-scorer-btn ${state.target.clusterName === c.name ? 'is-selected' : ''}`.trim(),
          type: 'button',
        }, c.name || '(unnamed)');
        btn.addEventListener('click', () => { state.target.clusterName = c.name; save(); render(); });
        row.appendChild(btn);
      });
      return row;
    })(),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'How many fixture rows to add for this cluster'),
    el('input', {
      class: 'rb-input', type: 'number', min: '1',
      value: String(state.target.addSamples),
      oninput: (e) => { state.target.addSamples = Number(e.target.value) || 0; save(); renderStepper(); renderNav(); },
    }),
    el('div', { class: 'rb-help' }, 'Rule of thumb: 3–5. Enough to see if the fix worked; not so many the fixture bloats.'),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'What grader will catch this next time?'),
    (() => {
      const row = el('div', { class: 'rb-scorer-choices' });
      [
        { id: 'code',   label: 'Code (deterministic)' },
        { id: 'judge',  label: 'LLM-judge' },
        { id: 'human',  label: 'Human review' },
        { id: 'hybrid', label: 'Hybrid' },
      ].forEach(k => {
        const btn = el('button', {
          class: `rb-scorer-btn ${state.target.evalGraderKind === k.id ? 'is-selected' : ''}`.trim(),
          type: 'button',
        }, k.label);
        btn.addEventListener('click', () => { state.target.evalGraderKind = k.id; save(); render(); });
        row.appendChild(btn);
      });
      return row;
    })(),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Notes (owner / eta / dependencies — optional)'),
    el('textarea', {
      class: 'rb-textarea',
      placeholder: 'e.g., "@renata to add 3 fixture rows + code grader by Sprint 24."',
      oninput: (e) => { state.target.notes = e.target.value; save(); },
    }, state.target.notes),
  ]));
  return wrap;
}

function renderExport() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 05 · Export'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Your trace analysis report.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Paste into a triage doc, a retro, or a PRD attachment. The next-eval target is the actionable output.'));

  const spec = buildSpec();
  const jsonText = JSON.stringify(spec, null, 2);
  const mdText = specToMarkdown(spec);

  const grid = el('div', { class: 'rb-export-grid' });
  grid.appendChild(makeExportCard('JSON', jsonText));
  grid.appendChild(makeExportCard('Markdown', mdText));
  wrap.appendChild(grid);

  const actions = el('div', { class: 'rb-export-actions' });
  actions.appendChild(makeCopyButton('Copy JSON', jsonText));
  actions.appendChild(makeCopyButton('Copy Markdown', mdText));
  actions.appendChild(makeDownloadButton('Download .json', jsonText, 'trace-analysis.json', 'application/json'));
  actions.appendChild(makeDownloadButton('Download .md', mdText, 'trace-analysis.md', 'text/markdown'));
  wrap.appendChild(actions);

  wrap.appendChild(el('div', { class: 'rb-done-card' }, [
    el('strong', {}, 'Nice work. '),
    document.createTextNode('Take the target cluster to Exercise 2 to add fixture rows, and to Exercise 4 to wire a grader that catches it going forward.'),
  ]));
  return wrap;
}

function makeExportCard(title, text) {
  return el('div', { class: 'rb-export-card' }, [
    el('div', { class: 'rb-export-card__head' }, [el('div', { class: 'rb-export-card__title' }, title)]),
    el('div', { class: 'rb-export-card__body' }, [el('pre', { class: 'rb-code' }, text)]),
  ]);
}

function makeCopyButton(label, text) {
  const btn = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, label);
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = label; }, 1200);
    } catch { btn.textContent = 'Copy failed'; setTimeout(() => { btn.textContent = label; }, 1500); }
  });
  return btn;
}

function makeDownloadButton(label, text, filename, mime) {
  const btn = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, label);
  btn.addEventListener('click', () => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return btn;
}

function buildSpec() {
  const clustersOut = state.clusters.map(c => ({
    name: c.name,
    count: state.traces.filter(t => t.verdict === 'fail' && (t.tag || '').trim() === c.name).length,
  })).sort((a, b) => b.count - a.count);
  return {
    feature: state.batch.feature,
    batch: {
      failure_count_pulled: state.batch.failureCount,
      pass_count_included: state.batch.passCount,
      source: state.batch.source,
    },
    traces: state.traces.map(t => ({ id: t.id, verdict: t.verdict, summary: t.summary, tag: t.tag || '' })),
    clusters: clustersOut,
    next_target: {
      cluster: state.target.clusterName,
      fixture_rows_to_add: state.target.addSamples,
      grader_kind: state.target.evalGraderKind,
      notes: state.target.notes,
    },
  };
}

function specToMarkdown(spec) {
  const lines = [];
  lines.push(`# Trace analysis — ${cell(spec.feature) || '(unnamed feature)'}`);
  lines.push('');
  lines.push(`**Batch:** pulled ${spec.batch.failure_count_pulled} failures + ${spec.batch.pass_count_included} passes.`);
  if (spec.batch.source) lines.push(`**Source:** ${cell(spec.batch.source)}`);
  lines.push(''); lines.push(`## Clusters by frequency`);
  lines.push(''); lines.push('| Cluster | Count |');
  lines.push('| --- | --- |');
  spec.clusters.forEach(c => { lines.push(`| ${cell(c.name)} | ${c.count} |`); });
  lines.push(''); lines.push('## Next eval target');
  lines.push('');
  lines.push(`- **Cluster:** ${cell(spec.next_target.cluster)}`);
  lines.push(`- **Fixture rows to add:** ${spec.next_target.fixture_rows_to_add}`);
  if (spec.next_target.grader_kind) lines.push(`- **Grader kind:** ${cell(spec.next_target.grader_kind)}`);
  if (spec.next_target.notes) lines.push(`- **Notes:** ${cell(spec.next_target.notes)}`);
  lines.push(''); lines.push(`## Traces read (${spec.traces.length})`);
  lines.push(''); lines.push('| # | ID | Verdict | Tag | Summary |');
  lines.push('| --- | --- | --- | --- | --- |');
  spec.traces.forEach((t, i) => {
    lines.push(`| ${i + 1} | ${cell(t.id)} | ${cell(t.verdict)} | ${cell(t.tag)} | ${cell(t.summary)} |`);
  });
  return lines.join('\n');
}

function cell(s) { return (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }

// ---------------------------------------------------------------------------
//  Side panel
// ---------------------------------------------------------------------------

function renderSide() {
  const mount = document.querySelector('[data-role="side-mount"]');
  if (!mount) return;
  clear(mount);
  mount.appendChild(el('div', { class: 'rb-side__eyebrow' }, 'Guide'));

  switch (state.stageId) {
    case 'batch':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Include passes'));
      mount.appendChild(el('p', {}, 'Reading only failures biases you. Passes calibrate what "good" looks like on THIS fixture, not what you imagine it looks like.'));
      break;
    case 'read':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Read the whole trace'));
      mount.appendChild(el('p', {}, 'Not just the final answer. Failures often happen upstream — a wrong tool call, a stale retrieval, a missing verify step. The whole trace tells you which layer to fix.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' }, 'One short tag per failure. Freeform now — merge synonyms next.'));
      break;
    case 'cluster':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Merge, don\'t taxonomize'));
      mount.appendChild(el('p', {}, 'Two tags that mean the same thing (identity_skip vs skipped_identity_check) collapse to one cluster. Rename in Step 02 and the count goes up.'));
      break;
    case 'target':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'One cluster at a time'));
      mount.appendChild(el('p', {}, 'Pick the top cluster by frequency. 3–5 new fixture rows. One grader. Ship the fix. Read traces again next month.'));
      break;
    case 'export':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Monthly cadence'));
      mount.appendChild(el('p', {}, 'This exercise, done monthly, moves eval quality more than any grader tuning. Set a recurring calendar block.'));
      break;
  }
}

// ---------------------------------------------------------------------------
//  Nav + render
// ---------------------------------------------------------------------------

function renderNav() {
  const back = document.querySelector('[data-role="back"]');
  const next = document.querySelector('[data-role="next"]');
  const hint = document.querySelector('[data-role="nav-hint"]');
  if (!back || !next || !hint) return;
  const idx = currentIndex();
  back.disabled = idx <= 0;
  const isLast = idx >= STAGES.length - 1;
  const complete = isStageComplete(state.stageId);
  next.disabled = isLast || !complete;
  next.textContent = isLast ? 'Done' : 'Next →';
  hint.textContent = (!isLast && !complete) ? navHint(state.stageId) : '';
}

function navHint(stageId) {
  switch (stageId) {
    case 'batch':   return 'Fill in the feature name and set failure / pass counts.';
    case 'read': {
      if (state.traces.length < 5) return `Add ${5 - state.traces.length} more trace${5 - state.traces.length === 1 ? '' : 's'} (need 5 minimum).`;
      const fails = state.traces.filter(t => t.verdict === 'fail' && (t.tag || '').trim()).length;
      if (fails < 3) return `Tag at least ${3 - fails} more failure${3 - fails === 1 ? '' : 's'}.`;
      return 'Every trace needs a summary.';
    }
    case 'cluster': return 'Add at least one named cluster to continue.';
    case 'target':  return 'Pick a cluster to promote and set the fixture rows to add.';
    default: return '';
  }
}

function renderStage() {
  const mount = document.querySelector('[data-role="stage-mount"]');
  if (!mount) return;
  clear(mount);
  let fragment;
  switch (state.stageId) {
    case 'batch':   fragment = renderBatch();   break;
    case 'read':    fragment = renderRead();    break;
    case 'cluster': fragment = renderCluster(); break;
    case 'target':  fragment = renderTarget();  break;
    case 'export':  fragment = renderExport();  break;
    default:        fragment = renderBatch();
  }
  mount.appendChild(fragment);
}

function render() {
  renderStepper(); renderStage(); renderSide(); renderNav();
}

function wireGlobal() {
  document.querySelector('[data-role="back"]').addEventListener('click', () => {
    const idx = currentIndex();
    if (idx > 0) goto(STAGES[idx - 1].id);
  });
  document.querySelector('[data-role="next"]').addEventListener('click', () => {
    const idx = currentIndex();
    if (idx < STAGES.length - 1 && isStageComplete(state.stageId)) goto(STAGES[idx + 1].id);
  });
  document.querySelector('[data-role="reset"]').addEventListener('click', () => {
    if (confirm('Start over? Your current trace analysis will be cleared.')) reset();
  });
}

wireGlobal();
render();
