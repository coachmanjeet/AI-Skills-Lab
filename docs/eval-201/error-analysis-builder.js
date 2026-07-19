// ============================================================================
//  error-analysis-builder.js — 5-stage flow for Exercise 3.
//
//  Stages: Sample → Trace → Layer → Root cause → Fix plan → Export.
//  State persists to localStorage.
//  All DOM via createElement + textContent — never innerHTML.
// ============================================================================

const EA_STORAGE_KEY = 'ai-evals-tutor:error-analysis:v1';

const LAYERS = [
  { id: 'prompt',   label: 'Prompt / instructions',   desc: 'Instruction too vague, missing constraint, contradictory example.' },
  { id: 'model',    label: 'Model / reasoning',       desc: 'Model chose wrong step, hallucinated, or ignored a rule it saw.' },
  { id: 'tool',     label: 'Tool / integration',      desc: 'Tool returned bad data, threw, timed out, or was skipped entirely.' },
  { id: 'data',     label: 'Data / grounding',        desc: 'Retrieved doc is wrong / stale / missing. Context window truncated.' },
  { id: 'harness',  label: 'Harness / orchestration', desc: 'Loop, handoff, or state passed wrong info between steps.' },
  { id: 'unknown',  label: 'Unknown — needs more traces', desc: 'One sample isn’t enough. Collect 3-5 similar traces first.' },
];

const CAUSE_PRESETS = [
  'Prompt missing constraint',
  'Model ignored explicit rule',
  'Tool called with wrong args',
  'Tool returned stale data',
  'Retrieval missed the right doc',
  'Retrieval returned wrong doc',
  'Handoff dropped context',
  'Loop terminated too early',
  'Loop never converged',
  'Output format broke downstream parser',
];

const FIX_KINDS = [
  { id: 'prompt',   label: 'Prompt change' },
  { id: 'tool',     label: 'Tool fix / new tool' },
  { id: 'data',     label: 'Data / retrieval fix' },
  { id: 'harness',  label: 'Harness / control-flow fix' },
  { id: 'model',    label: 'Model swap or tune' },
  { id: 'eval',     label: 'New eval to catch regressions' },
];

const STAGES = [
  { id: 'sample',    num: '01', label: 'Failing sample' },
  { id: 'trace',     num: '02', label: 'Trace' },
  { id: 'layer',     num: '03', label: 'Locate failure' },
  { id: 'cause',     num: '04', label: 'Root cause' },
  { id: 'fix',       num: '05', label: 'Fix plan' },
  { id: 'export',    num: '06', label: 'Export' },
];

const DEFAULT_STATE = {
  stageId: 'sample',
  sample: { id: '', input: '', expected: '', actual: '', severity: '' },
  trace: [],   // [{ id, actor, content }]  actor: user | agent | tool | flag
  layer: '',
  cause: { preset: '', detail: '' },
  fix: { kind: '', description: '', preventEvalName: '', owner: '', when: '' },
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
    const raw = localStorage.getItem(EA_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch { return structuredClone(DEFAULT_STATE); }
}

function save() {
  try {
    localStorage.setItem(EA_STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch (err) { console.warn('[error-analysis] save failed', err); }
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
  localStorage.removeItem(EA_STORAGE_KEY);
  render();
}

function currentIndex() { return STAGES.findIndex(s => s.id === state.stageId); }

function goto(stageId) {
  state.stageId = stageId; save(); render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function newTraceId() {
  let n = 1;
  const seen = new Set(state.trace.map(t => t.id));
  while (seen.has(`t${n}`)) n++;
  return `t${n}`;
}

function isStageComplete(stageId) {
  switch (stageId) {
    case 'sample':
      return state.sample.input.trim().length > 3
          && state.sample.expected.trim().length > 3
          && state.sample.actual.trim().length > 3
          && !!state.sample.severity;
    case 'trace':
      return state.trace.length >= 2 && state.trace.every(t => t.content.trim().length > 0);
    case 'layer':  return !!state.layer;
    case 'cause':  return (state.cause.preset || state.cause.detail.trim().length > 3);
    case 'fix':    return !!state.fix.kind && state.fix.description.trim().length > 5;
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

function renderSample() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 01 · Failing sample'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Describe the failing case.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'One concrete failure — not a class of failures. Real inputs, real observed output, real expected outcome.'));

  wrap.appendChild(fieldRow('Sample ID (any short label)', 'sample-id', 'input',
    { placeholder: 'e.g., ticket-4821-refund-fail', value: state.sample.id }, (v) => { state.sample.id = v; save(); }));
  wrap.appendChild(fieldRow('Input the agent received', 'sample-input', 'textarea',
    { placeholder: 'e.g., "Refund $80 to order A-123. Customer email lost@shop.com."', value: state.sample.input }, (v) => { state.sample.input = v; save(); renderStepper(); renderNav(); }));
  wrap.appendChild(fieldRow('Expected outcome', 'sample-expected', 'textarea',
    { placeholder: 'e.g., "Refund issued AND confirmation email sent to customer."', value: state.sample.expected }, (v) => { state.sample.expected = v; save(); renderStepper(); renderNav(); }));
  wrap.appendChild(fieldRow('Actual outcome', 'sample-actual', 'textarea',
    { placeholder: 'e.g., "Refund issued, but no email fired."', value: state.sample.actual }, (v) => { state.sample.actual = v; save(); renderStepper(); renderNav(); }));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Severity'),
    (() => {
      const row = el('div', { class: 'rb-scorer-choices' });
      ['P0 — customer-visible', 'P1 — silent bug', 'P2 — cosmetic'].forEach(label => {
        const btn = el('button', {
          class: `rb-scorer-btn ${state.sample.severity === label ? 'is-selected' : ''}`.trim(),
          type: 'button',
        }, label);
        btn.addEventListener('click', () => { state.sample.severity = label; save(); render(); });
        row.appendChild(btn);
      });
      return row;
    })(),
  ]));

  return wrap;
}

function fieldRow(label, id, tag, attrs, onInput) {
  const val = attrs.value || '';
  const fieldProps = { class: tag === 'textarea' ? 'rb-textarea' : 'rb-input', id };
  if (attrs.placeholder) fieldProps.placeholder = attrs.placeholder;
  const field = el(tag, {
    ...fieldProps,
    ...(tag === 'input' ? { type: 'text', value: val } : {}),
    oninput: (e) => onInput(e.target.value),
  }, tag === 'textarea' ? val : []);
  return el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label', for: id }, label),
    field,
  ]);
}

function renderTrace() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 02 · Trace'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Reconstruct what happened, step by step.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Add each step in the trace — user turn, agent turn, tool call, or a flag/observation. This is how you’ll read traces in Braintrust / LangSmith / Langfuse UIs.'));

  wrap.appendChild(el('div', { class: 'rb-counter' }, [
    document.createTextNode('Trace steps: '),
    el('strong', {}, `${state.trace.length} (min 2)`),
  ]));

  const list = el('div', { class: 'ea-trace' });
  state.trace.forEach((t, i) => {
    const card = el('div', { class: 'rb-trace-block' });
    card.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, t.id),
      el('span', { class: 'rb-trace-block__category' }, t.actor),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Actor'),
      (() => {
        const row = el('div', { class: 'rb-scorer-choices' });
        [
          { id: 'user',  label: 'User' },
          { id: 'agent', label: 'Agent' },
          { id: 'tool',  label: 'Tool' },
          { id: 'flag',  label: 'Flag / observation' },
        ].forEach(a => {
          const btn = el('button', {
            class: `rb-scorer-btn ${t.actor === a.id ? 'is-selected' : ''}`.trim(),
            type: 'button',
          }, a.label);
          btn.addEventListener('click', () => { t.actor = a.id; save(); render(); });
          row.appendChild(btn);
        });
        return row;
      })(),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Content'),
      el('textarea', {
        class: 'rb-textarea',
        placeholder: t.actor === 'tool' ? 'process_refund({order:"A-123", amount:80}) → { refund_id: "r45" }' :
                     t.actor === 'flag' ? 'e.g., "no send_email tool call detected"' :
                     'What was said or done at this step?',
        oninput: (e) => { t.content = e.target.value; save(); renderStepper(); renderNav(); },
      }, t.content),
    ]));

    const rm = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, 'Remove step');
    rm.addEventListener('click', () => {
      state.trace = state.trace.filter(x => x.id !== t.id);
      save(); render();
    });
    card.appendChild(rm);
    list.appendChild(card);
  });
  wrap.appendChild(list);

  const addBtn = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, '+ Add step');
  addBtn.addEventListener('click', () => {
    state.trace.push({ id: newTraceId(), actor: 'user', content: '' });
    save(); render();
  });
  wrap.appendChild(addBtn);
  return wrap;
}

function renderLayer() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 03 · Locate failure'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Which layer failed first?'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Attribute the failure to the earliest broken layer. Later layers often just amplify what an earlier one got wrong.'));

  const grid = el('div', { class: 'rb-feature-grid' });
  LAYERS.forEach(l => {
    const card = el('button', {
      class: `rb-feature-card ${state.layer === l.id ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, [
      el('div', { class: 'rb-feature-card__title' }, l.label),
      el('div', { class: 'rb-feature-card__desc' }, l.desc),
    ]);
    card.addEventListener('click', () => { state.layer = l.id; save(); render(); });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderCause() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 04 · Root cause'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Name the specific cause.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Pick from common causes, or write your own. This becomes the failure code you’ll track.'));

  const grid = el('div', { class: 'rb-feature-grid' });
  CAUSE_PRESETS.forEach(name => {
    const isSelected = state.cause.preset === name;
    const card = el('button', {
      class: `rb-feature-card ${isSelected ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, [el('div', { class: 'rb-feature-card__title' }, name)]);
    card.addEventListener('click', () => { state.cause.preset = name; save(); render(); });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Detail (evidence from the trace)'),
    el('textarea', {
      class: 'rb-textarea',
      placeholder: 'e.g., "Step 3 shows process_refund succeeded but send_email was never called; agent did not follow the ‘after refund, send confirmation’ rule."',
      oninput: (e) => { state.cause.detail = e.target.value; save(); renderStepper(); renderNav(); },
    }, state.cause.detail),
    el('div', { class: 'rb-help' }, 'Point to specific step numbers from Step 02 as evidence.'),
  ]));
  return wrap;
}

function renderFix() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 05 · Fix plan'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Propose a fix + prevention.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'The fix removes the bug. The eval keeps it from coming back. Both matter.'));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Fix kind'),
    (() => {
      const row = el('div', { class: 'rb-scorer-choices' });
      FIX_KINDS.forEach(f => {
        const btn = el('button', {
          class: `rb-scorer-btn ${state.fix.kind === f.id ? 'is-selected' : ''}`.trim(),
          type: 'button',
        }, f.label);
        btn.addEventListener('click', () => { state.fix.kind = f.id; save(); render(); });
        row.appendChild(btn);
      });
      return row;
    })(),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Fix description'),
    el('textarea', {
      class: 'rb-textarea',
      placeholder: 'e.g., "Add ‘after any refund, always call send_email with template=refund-confirm’ to the system prompt."',
      oninput: (e) => { state.fix.description = e.target.value; save(); renderStepper(); renderNav(); },
    }, state.fix.description),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'New / existing eval to catch regressions'),
    el('input', {
      class: 'rb-input', type: 'text',
      placeholder: 'e.g., refund-flow.email-fired.trace-code',
      value: state.fix.preventEvalName,
      oninput: (e) => { state.fix.preventEvalName = e.target.value; save(); },
    }),
    el('div', { class: 'rb-help' }, 'Name the eval (real or intended) that would’ve caught this. Use trace-code style: <flow>.<check>.'),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Owner'),
    el('input', {
      class: 'rb-input', type: 'text',
      placeholder: 'e.g., @renata',
      value: state.fix.owner,
      oninput: (e) => { state.fix.owner = e.target.value; save(); },
    }),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'By when'),
    el('input', {
      class: 'rb-input', type: 'text',
      placeholder: 'e.g., Sprint 24 / 2026-08-01',
      value: state.fix.when,
      oninput: (e) => { state.fix.when = e.target.value; save(); },
    }),
  ]));
  return wrap;
}

function renderExport() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 06 · Export'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Your error analysis report.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Ready for a bug ticket, an incident writeup, or a PRD attachment.'));

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
  actions.appendChild(makeDownloadButton('Download .json', jsonText, 'error-analysis.json', 'application/json'));
  actions.appendChild(makeDownloadButton('Download .md', mdText, 'error-analysis.md', 'text/markdown'));
  wrap.appendChild(actions);

  wrap.appendChild(el('div', { class: 'rb-done-card' }, [
    el('strong', {}, 'Nice work. '),
    document.createTextNode('One failure understood. Now file it, ship the fix, and wire the regression eval — take the eval name back to Exercise 2 (Rubric Builder) or Exercise 4 (CI scoring).'),
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
  const layerObj = LAYERS.find(l => l.id === state.layer);
  const fixKindObj = FIX_KINDS.find(f => f.id === state.fix.kind);
  return {
    sample: { ...state.sample },
    trace: state.trace.map((t, i) => ({ index: i + 1, id: t.id, actor: t.actor, content: t.content })),
    failureLayer: { id: state.layer, label: layerObj ? layerObj.label : '' },
    rootCause: { preset: state.cause.preset || '', detail: state.cause.detail || '' },
    fix: {
      kind: state.fix.kind,
      kindLabel: fixKindObj ? fixKindObj.label : '',
      description: state.fix.description,
      preventEvalName: state.fix.preventEvalName,
      owner: state.fix.owner,
      when: state.fix.when,
    },
  };
}

function specToMarkdown(spec) {
  const lines = [];
  lines.push(`# Error analysis — ${cell(spec.sample.id) || '(unnamed sample)'}`);
  lines.push(''); lines.push(`**Severity:** ${cell(spec.sample.severity)}`);
  lines.push(''); lines.push('## The failing sample');
  lines.push('');
  lines.push(`- **Input:** ${cell(spec.sample.input)}`);
  lines.push(`- **Expected:** ${cell(spec.sample.expected)}`);
  lines.push(`- **Actual:** ${cell(spec.sample.actual)}`);
  lines.push(''); lines.push('## Trace');
  lines.push(''); lines.push('| # | Actor | Content |');
  lines.push('| --- | --- | --- |');
  spec.trace.forEach(t => {
    lines.push(`| ${t.index} | ${cell(t.actor)} | ${cell(t.content)} |`);
  });
  lines.push(''); lines.push('## Failure layer');
  lines.push(''); lines.push(`- ${cell(spec.failureLayer.label)}`);
  lines.push(''); lines.push('## Root cause');
  lines.push('');
  if (spec.rootCause.preset) lines.push(`- **Type:** ${cell(spec.rootCause.preset)}`);
  if (spec.rootCause.detail) lines.push(`- **Detail:** ${cell(spec.rootCause.detail)}`);
  lines.push(''); lines.push('## Fix + prevention');
  lines.push('');
  lines.push(`- **Fix kind:** ${cell(spec.fix.kindLabel)}`);
  lines.push(`- **Fix:** ${cell(spec.fix.description)}`);
  if (spec.fix.preventEvalName) lines.push(`- **Regression eval:** \`${cell(spec.fix.preventEvalName)}\``);
  if (spec.fix.owner) lines.push(`- **Owner:** ${cell(spec.fix.owner)}`);
  if (spec.fix.when)  lines.push(`- **By:** ${cell(spec.fix.when)}`);
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
    case 'sample':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'One concrete failure'));
      mount.appendChild(el('p', {}, 'Not "sometimes refunds break" — the exact refund that broke, with real values. Vague inputs hide real bugs.'));
      break;
    case 'trace':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Actors matter'));
      mount.appendChild(el('p', {}, 'Tag every step by actor. Tool rows show what got called. Flag rows record observations like "no send_email fired" — invisible things that changed the outcome.'));
      break;
    case 'layer':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Earliest broken layer'));
      mount.appendChild(el('p', {}, 'If prompt was under-specified AND tool returned bad data AND retrieval was wrong, the first one to break is the true owner. Fix from the earliest layer.'));
      break;
    case 'cause':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Cause = failure code'));
      mount.appendChild(el('p', {}, 'This name reappears if the bug reappears. Keep it stable across incidents so you can count frequency.'));
      break;
    case 'fix':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Fix + eval, always'));
      mount.appendChild(el('p', {}, 'A patched prompt with no eval means the next model swap will silently break it again. Always pair the fix with the eval that catches it.'));
      break;
    case 'export':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Now ship it'));
      mount.appendChild(el('p', {}, 'File the ticket. Add the regression eval. Update the runbook.'));
      break;
  }
}

// ---------------------------------------------------------------------------
//  Nav + top-level render
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
    case 'sample': return 'Fill in input, expected, actual, and pick a severity.';
    case 'trace':  return `Add at least ${Math.max(0, 2 - state.trace.length)} more trace step${state.trace.length === 1 ? '' : 's'} with content.`;
    case 'layer':  return 'Pick a failure layer.';
    case 'cause':  return 'Pick a preset cause or describe the cause (3+ chars).';
    case 'fix':    return 'Pick a fix kind and describe the fix.';
    default: return '';
  }
}

function renderStage() {
  const mount = document.querySelector('[data-role="stage-mount"]');
  if (!mount) return;
  clear(mount);
  let fragment;
  switch (state.stageId) {
    case 'sample': fragment = renderSample(); break;
    case 'trace':  fragment = renderTrace();  break;
    case 'layer':  fragment = renderLayer();  break;
    case 'cause':  fragment = renderCause();  break;
    case 'fix':    fragment = renderFix();    break;
    case 'export': fragment = renderExport(); break;
    default:       fragment = renderSample();
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
    if (confirm('Start over? Your current error analysis will be cleared.')) reset();
  });
}

wireGlobal();
render();
