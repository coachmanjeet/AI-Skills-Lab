// ============================================================================
//  harness-designer.js — 6-stage guided flow for authoring an AI agent harness.
//
//  Stages: Agent → Tools → Context → Guardrails → Verify → Export.
//  State persists to localStorage (key: HD_STORAGE_KEY).
//
//  Security: every user-authored string reaches the DOM via textContent or
//  input .value — never innerHTML.
// ============================================================================

const HD_STORAGE_KEY = 'ai-evals-tutor:harness-101:v1';

const MODEL_OPTIONS = [
  { id: 'gpt-4o-mini',   label: 'GPT-4o-mini',   blurb: 'Fast, cheap. Good for the first pass.' },
  { id: 'claude-sonnet', label: 'Claude Sonnet', blurb: 'Strong on structured reasoning + tool use.' },
  { id: 'gemini-flash',  label: 'Gemini Flash',  blurb: 'Fast, long context, cheap on tokens.' },
  { id: 'gpt-oss',       label: 'GPT-OSS',       blurb: 'Self-hosted or free-tier. Weaker but yours.' },
  { id: 'other',         label: 'Other',         blurb: 'Bring-your-own model client.' },
];

const ENV_OPTIONS = [
  { id: 'browser', label: 'Browser', blurb: 'Playwright / headless Chromium. Web tasks, form-filling.' },
  { id: 'sandbox', label: 'Sandbox', blurb: 'Ephemeral filesystem + shell. Coding, file editing.' },
  { id: 'db',      label: 'Database', blurb: 'Read-only or read-write DB session.' },
  { id: 'crm',     label: 'CRM / SaaS', blurb: 'A logged-in API session against your product.' },
  { id: 'custom',  label: 'Custom',  blurb: 'Whatever else — API bundle, hardware, hybrid.' },
];

const TOOL_PRESETS = [
  { id: 'browser.navigate', name: 'browser.navigate', desc: 'Open a URL in the harness browser session.', kind: 'deterministic' },
  { id: 'browser.click',    name: 'browser.click',    desc: 'Click a selector on the current page.',      kind: 'deterministic' },
  { id: 'browser.getText',  name: 'browser.getText',  desc: 'Return the visible text of the current page.', kind: 'deterministic' },
  { id: 'fs.read',          name: 'fs.read',          desc: 'Read a file from the sandbox.',              kind: 'deterministic' },
  { id: 'fs.write',         name: 'fs.write',         desc: 'Write a file into the sandbox.',             kind: 'deterministic' },
  { id: 'bash.exec',        name: 'bash.exec',        desc: 'Run a shell command in the sandbox.',        kind: 'deterministic' },
  { id: 'db.query',         name: 'db.query',         desc: 'Run a SQL query against the harness DB.',    kind: 'deterministic' },
  { id: 'search.web',       name: 'search.web',       desc: 'Web search + fetch top N results.',          kind: 'llm-augmented' },
];

const CONTEXT_TACTICS = [
  { id: 'isolation', title: 'Isolation', desc: 'Keep subtasks in their own contexts. One agent’s noise never pollutes another’s.', placeholder: 'e.g., Each research subtask runs in its own sub-agent context; only the summary comes back.' },
  { id: 'reduction', title: 'Reduction', desc: 'Trim messages older than a threshold, or compress on overflow. Prevent context rot.', placeholder: 'e.g., After 20 messages, drop tool outputs older than the last 3 turns.' },
  { id: 'retrieval', title: 'Retrieval', desc: 'Inject fresh docs / search hits at the moment of need — not upfront in a giant blob.', placeholder: 'e.g., Before every tool call that touches customer data, fetch the top 3 records for that customer.' },
];

const GUARDRAIL_PRESETS = [
  { id: 'maxIterations', label: 'Max iterations',   defaultValue: 6,   unit: 'steps',  desc: 'Hard kill after N loop iterations. Catches runaways.' },
  { id: 'maxMessages',   label: 'Max messages',     defaultValue: 20,  unit: 'msgs',   desc: 'Cap the total conversation length before compression / kill.' },
  { id: 'maxCost',       label: 'Max cost',         defaultValue: 1.0, unit: 'USD',    desc: 'Kill if cumulative model spend exceeds threshold for one task.' },
  { id: 'maxLatency',    label: 'Max latency',      defaultValue: 60,  unit: 'sec',    desc: 'Kill if wall-clock runtime exceeds threshold.' },
  { id: 'forbidTools',   label: 'Forbid tools',     defaultValue: '',  unit: 'list',   desc: 'Explicitly deny some tools even if the model asks for them.' },
  { id: 'humanApproval', label: 'Require approval', defaultValue: '',  unit: 'actions', desc: 'Certain actions pause the loop and require a human OK.' },
];

const VERIFIER_PRESETS = [
  { id: 'contains',        label: 'contains',           desc: 'Answer must include a specific string or field.' },
  { id: 'exactMatch',      label: 'exactMatch',         desc: 'Answer must equal a known correct value.' },
  { id: 'structuredCheck', label: 'structuredCheck',    desc: 'Answer parses to a schema (JSON, table, etc.).' },
  { id: 'sideEffectCheck', label: 'sideEffectCheck',    desc: 'Confirm the intended change actually happened in the real system.' },
  { id: 'humanReview',     label: 'humanReview',        desc: 'Flag for a person to accept / reject before the loop ends.' },
];

const STAGES = [
  { id: 'agent',      num: '01', label: 'Agent & environment' },
  { id: 'tools',      num: '02', label: 'Tool registry' },
  { id: 'context',    num: '03', label: 'Context strategy' },
  { id: 'guardrails', num: '04', label: 'Guardrails' },
  { id: 'verify',     num: '05', label: 'Verify step' },
  { id: 'export',     num: '06', label: 'Export' },
];

const DEFAULT_STATE = {
  stageId: 'agent',
  agent: { name: 'My Agent', task: '', model: 'claude-sonnet', env: 'browser' },
  tools: TOOL_PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    desc: p.desc,
    kind: p.kind,
    enabled: ['browser.navigate', 'browser.click', 'browser.getText'].includes(p.id),
    custom: false,
  })),
  context: {
    isolation: { enabled: true,  detail: '' },
    reduction: { enabled: true,  detail: '' },
    retrieval: { enabled: false, detail: '' },
  },
  guardrails: {
    maxIterations: { enabled: true,  value: 6 },
    maxMessages:   { enabled: true,  value: 20 },
    maxCost:       { enabled: false, value: 1.0 },
    maxLatency:    { enabled: false, value: 60 },
    forbidTools:   { enabled: false, value: '' },
    humanApproval: { enabled: false, value: '' },
  },
  verify: {
    prompt: '',
    checks: {
      contains:        { enabled: false, criterion: '' },
      exactMatch:      { enabled: false, criterion: '' },
      structuredCheck: { enabled: true,  criterion: '' },
      sideEffectCheck: { enabled: true,  criterion: '' },
      humanReview:     { enabled: false, criterion: '' },
    },
  },
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

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function load() {
  try {
    const raw = localStorage.getItem(HD_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_STATE), parsed);
  } catch (err) {
    console.warn('[harness-designer] load failed', err);
    return structuredClone(DEFAULT_STATE);
  }
}

function deepMerge(target, src) {
  if (typeof src !== 'object' || src === null) return src;
  if (Array.isArray(src)) return src;
  const out = { ...target };
  for (const key of Object.keys(src)) {
    if (typeof src[key] === 'object' && src[key] !== null && !Array.isArray(src[key]) && typeof target[key] === 'object') {
      out[key] = deepMerge(target[key], src[key]);
    } else {
      out[key] = src[key];
    }
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(HD_STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch (err) {
    console.warn('[harness-designer] save failed', err);
  }
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
  localStorage.removeItem(HD_STORAGE_KEY);
  render();
}

function enabledTools() { return state.tools.filter(t => t.enabled); }
function enabledContextTactics() { return CONTEXT_TACTICS.filter(t => state.context[t.id]?.enabled); }
function enabledGuardrails() { return GUARDRAIL_PRESETS.filter(g => state.guardrails[g.id]?.enabled); }
function enabledVerifiers() { return VERIFIER_PRESETS.filter(v => state.verify.checks[v.id]?.enabled); }

function isStageComplete(stageId) {
  switch (stageId) {
    case 'agent':
      return state.agent.name.trim().length >= 2 && state.agent.task.trim().length > 0;
    case 'tools':
      return enabledTools().length >= 1;
    case 'context':
      return enabledContextTactics().length >= 1;
    case 'guardrails':
      return enabledGuardrails().length >= 1;
    case 'verify':
      return state.verify.prompt.trim().length > 0 && enabledVerifiers().length >= 1;
    case 'export':
      return true;
    default:
      return false;
  }
}

function currentIndex() {
  return STAGES.findIndex(s => s.id === state.stageId);
}

function goto(stageId) {
  state.stageId = stageId;
  save();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
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
      type: 'button',
      role: 'tab',
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
//  Stage 01 · Agent & environment
// ---------------------------------------------------------------------------

function renderAgent() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 01 · Agent & environment'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Name the agent. Name the environment.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'The harness begins with one clear job. Give the agent a name, a one-line task, the model you’ll rent to power it, and the environment the harness owns and cleans up around every run.'));

  wrap.appendChild(el('div', { class: 'rb-feature-custom' }, [
    el('label', { class: 'rb-label', for: 'hd-agent-name' }, 'Agent name'),
    el('input', {
      class: 'rb-input',
      id: 'hd-agent-name',
      type: 'text',
      placeholder: 'e.g., Ticket Triager, Refund Runner, Onboarding Buddy',
      value: state.agent.name,
      oninput: (e) => {
        state.agent.name = e.target.value;
        save(); renderStepper(); renderNav();
      },
    }),
    el('div', { class: 'rb-help' }, 'One agent, one job. Naming forces you to pick.'),

    el('div', { style: 'height:14px' }),
    el('label', { class: 'rb-label', for: 'hd-agent-task' }, 'Task — one sentence'),
    el('textarea', {
      class: 'rb-textarea',
      id: 'hd-agent-task',
      placeholder: 'e.g., Given a customer refund request, verify eligibility against policy and post the refund with the reason logged.',
      oninput: (e) => {
        state.agent.task = e.target.value;
        save(); renderStepper(); renderNav();
      },
    }, state.agent.task),
    el('div', { class: 'rb-help' }, 'Concrete beats grand. Bounded beats vague.'),

    el('div', { style: 'height:14px' }),
    el('label', { class: 'rb-label' }, 'Rented model'),
    makeModelChoices(),
    el('div', { class: 'rb-help' }, 'The model is a swappable dependency. You can change your mind next week.'),

    el('div', { style: 'height:14px' }),
    el('label', { class: 'rb-label' }, 'Environment the harness owns'),
    makeEnvChoices(),
    el('div', { class: 'rb-help' }, 'The harness opens it, tools receive it, the harness closes it — always, even on error.'),
  ]));

  return wrap;
}

function makeModelChoices() {
  const row = el('div', { class: 'rb-scorer-choices' });
  MODEL_OPTIONS.forEach(opt => {
    const btn = el('button', {
      class: `rb-scorer-btn ${state.agent.model === opt.id ? 'is-selected' : ''}`.trim(),
      type: 'button',
      title: opt.blurb,
    }, opt.label);
    btn.addEventListener('click', () => {
      state.agent.model = opt.id;
      save(); renderStage(); renderStepper(); renderNav();
    });
    row.appendChild(btn);
  });
  return row;
}

function makeEnvChoices() {
  const row = el('div', { class: 'rb-scorer-choices' });
  ENV_OPTIONS.forEach(opt => {
    const btn = el('button', {
      class: `rb-scorer-btn ${state.agent.env === opt.id ? 'is-selected' : ''}`.trim(),
      type: 'button',
      title: opt.blurb,
    }, opt.label);
    btn.addEventListener('click', () => {
      state.agent.env = opt.id;
      save(); renderStage(); renderStepper(); renderNav();
    });
    row.appendChild(btn);
  });
  return row;
}

// ---------------------------------------------------------------------------
//  Stage 02 · Tool registry
// ---------------------------------------------------------------------------

function renderTools() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 02 · Tool registry'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Bound tools. Not globals.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Every tool is declared: name, purpose, and — critically — bound to the harness’s environment. Add tools → the agent has capabilities. Remove them → those capabilities are gone.'));

  wrap.appendChild(el('div', { class: 'rb-counter' }, [
    document.createTextNode('Enabled: '),
    el('strong', {}, `${enabledTools().length} / ${state.tools.length}`),
  ]));

  const grid = el('div');
  state.tools.forEach((tool) => {
    grid.appendChild(makeToolRow(tool));
  });
  wrap.appendChild(grid);

  const addBtn = el('button', {
    class: 'rb-btn rb-btn--ghost',
    type: 'button',
    style: 'margin-top:16px',
  }, '+ Add custom tool');
  addBtn.addEventListener('click', () => {
    state.tools.push({
      id: `custom-${state.tools.length}`,
      name: 'my.tool',
      desc: '',
      kind: 'deterministic',
      enabled: true,
      custom: true,
    });
    save(); renderStage(); renderStepper(); renderNav();
  });
  wrap.appendChild(addBtn);

  return wrap;
}

function makeToolRow(tool) {
  const row = el('div', { class: `hd-row ${tool.enabled ? 'is-on' : ''}`.trim() });

  const toggle = el('button', {
    class: `rb-scorer-btn ${tool.enabled ? 'is-selected' : ''}`.trim(),
    type: 'button',
  }, tool.enabled ? 'On' : 'Off');
  toggle.addEventListener('click', () => {
    tool.enabled = !tool.enabled;
    save(); renderStage(); renderStepper(); renderNav();
  });
  row.appendChild(el('div', { class: 'hd-row__toggle' }, toggle));

  const body = el('div', { class: 'hd-row__body' });
  if (tool.custom) {
    body.appendChild(el('input', {
      class: 'rb-input',
      type: 'text',
      value: tool.name,
      placeholder: 'my.tool',
      style: 'font-weight:700;font-family:"IBM Plex Mono",monospace',
      oninput: (e) => { tool.name = e.target.value; save(); },
    }));
    body.appendChild(el('div', { style: 'height:6px' }));
    body.appendChild(el('input', {
      class: 'rb-input',
      type: 'text',
      value: tool.desc,
      placeholder: 'What does this tool do?',
      oninput: (e) => { tool.desc = e.target.value; save(); },
    }));
  } else {
    body.appendChild(el('div', { class: 'hd-row__title', style: 'font-family:"IBM Plex Mono",monospace' }, tool.name));
    body.appendChild(el('div', { class: 'hd-row__desc' }, tool.desc));
  }

  const kindLabel = tool.kind === 'deterministic' ? 'Deterministic' : 'LLM-augmented';
  body.appendChild(el('div', { class: 'hd-row__suffix' }, `Kind: ${kindLabel} · bound to ${ENV_OPTIONS.find(e => e.id === state.agent.env)?.label || state.agent.env}`));
  row.appendChild(body);

  if (tool.custom) {
    const removeBtn = el('button', {
      class: 'rb-btn rb-btn--ghost',
      type: 'button',
      style: 'flex-shrink:0;font-size:12px;padding:4px 10px',
    }, 'Remove');
    removeBtn.addEventListener('click', () => {
      state.tools = state.tools.filter(t => t.id !== tool.id);
      save(); renderStage(); renderStepper(); renderNav();
    });
    row.appendChild(removeBtn);
  }

  return row;
}

// ---------------------------------------------------------------------------
//  Stage 03 · Context strategy
// ---------------------------------------------------------------------------

function renderContext() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 03 · Context strategy'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'How the harness manages what the model sees.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Pick one or more tactics. Isolation keeps subtasks separate. Reduction fights context rot. Retrieval brings fresh signal in at the moment of need.'));

  CONTEXT_TACTICS.forEach(t => {
    const st = state.context[t.id];
    const block = el('div', { class: `hd-checkbox-block ${st.enabled ? 'is-on' : ''}`.trim() });

    const mark = el('div', { class: 'hd-checkbox-block__mark' }, st.enabled ? '✓' : '');
    block.appendChild(mark);

    const body = el('div', { class: 'hd-checkbox-block__body' });
    body.appendChild(el('div', { class: 'hd-checkbox-block__title' }, t.title));
    body.appendChild(el('div', { class: 'hd-checkbox-block__desc' }, t.desc));
    body.appendChild(el('textarea', {
      class: 'rb-textarea',
      placeholder: t.placeholder,
      oninput: (e) => {
        st.detail = e.target.value;
        save();
      },
    }, st.detail));
    block.appendChild(body);

    block.addEventListener('click', (e) => {
      if (e.target.tagName === 'TEXTAREA') return;
      st.enabled = !st.enabled;
      save(); renderStage(); renderStepper(); renderNav();
    });

    wrap.appendChild(block);
  });

  return wrap;
}

// ---------------------------------------------------------------------------
//  Stage 04 · Guardrails
// ---------------------------------------------------------------------------

function renderGuardrails() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 04 · Guardrails'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Bounds the model cannot bypass.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Guardrails fire before each loop iteration. They catch structural failures — runaway loops, cost blowups, forbidden actions. They do not catch wrong answers. That’s next step.'));

  GUARDRAIL_PRESETS.forEach(g => {
    const st = state.guardrails[g.id];
    const row = el('div', { class: `hd-row ${st.enabled ? 'is-on' : ''}`.trim() });

    const toggle = el('button', {
      class: `rb-scorer-btn ${st.enabled ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, st.enabled ? 'On' : 'Off');
    toggle.addEventListener('click', () => {
      st.enabled = !st.enabled;
      save(); renderStage(); renderStepper(); renderNav();
    });
    row.appendChild(el('div', { class: 'hd-row__toggle' }, toggle));

    const body = el('div', { class: 'hd-row__body' });
    body.appendChild(el('div', { class: 'hd-row__title' }, g.label));
    body.appendChild(el('div', { class: 'hd-row__desc' }, g.desc));

    const field = el('div', { class: 'hd-row__field' });
    field.appendChild(el('span', { class: 'hd-row__prefix' }, `${g.unit === 'list' || g.unit === 'actions' ? 'Values' : 'Limit'}`));

    const isTextList = g.unit === 'list' || g.unit === 'actions';
    field.appendChild(el('input', {
      class: 'rb-input',
      type: isTextList ? 'text' : 'number',
      value: String(st.value ?? g.defaultValue),
      placeholder: isTextList ? 'comma-separated, e.g., fs.write, bash.exec' : String(g.defaultValue),
      oninput: (e) => {
        const raw = e.target.value;
        st.value = isTextList ? raw : (raw === '' ? '' : Number(raw));
        save();
      },
    }));
    if (!isTextList) field.appendChild(el('span', { class: 'hd-row__suffix' }, g.unit));

    body.appendChild(field);
    row.appendChild(body);
    wrap.appendChild(row);
  });

  return wrap;
}

// ---------------------------------------------------------------------------
//  Stage 05 · Verify
// ---------------------------------------------------------------------------

function renderVerify() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 05 · Verify step'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Did the agent actually do the job — or just say it did?'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Guardrails catch structural failures. Verify catches wrong answers. Runs after the loop exits, deterministically — not the model judging itself.'));

  wrap.appendChild(el('label', { class: 'rb-label' }, 'How will your harness know the answer is right, not just that it didn’t crash?'));
  wrap.appendChild(el('textarea', {
    class: 'rb-textarea',
    placeholder: 'e.g., For every refund action, confirm a matching entry appears in the ledger DB with status=posted before the loop returns success.',
    oninput: (e) => {
      state.verify.prompt = e.target.value;
      save(); renderStepper(); renderNav();
    },
  }, state.verify.prompt));

  wrap.appendChild(el('div', { class: 'rb-label', style: 'margin-top:18px' }, 'Verifier checks'));

  VERIFIER_PRESETS.forEach(v => {
    const st = state.verify.checks[v.id];
    const row = el('div', { class: `hd-row ${st.enabled ? 'is-on' : ''}`.trim() });

    const toggle = el('button', {
      class: `rb-scorer-btn ${st.enabled ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, st.enabled ? 'On' : 'Off');
    toggle.addEventListener('click', () => {
      st.enabled = !st.enabled;
      save(); renderStage(); renderStepper(); renderNav();
    });
    row.appendChild(el('div', { class: 'hd-row__toggle' }, toggle));

    const body = el('div', { class: 'hd-row__body' });
    body.appendChild(el('div', { class: 'hd-row__title', style: 'font-family:"IBM Plex Mono",monospace' }, v.label));
    body.appendChild(el('div', { class: 'hd-row__desc' }, v.desc));
    body.appendChild(el('input', {
      class: 'rb-input',
      type: 'text',
      value: st.criterion,
      placeholder: 'Short criterion — what to check for.',
      oninput: (e) => { st.criterion = e.target.value; save(); },
    }));
    row.appendChild(body);

    wrap.appendChild(row);
  });

  return wrap;
}

// ---------------------------------------------------------------------------
//  Stage 06 · Export
// ---------------------------------------------------------------------------

function renderExport() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 06 · Export'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Your harness spec. Two formats.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Preview below. Copy the JSON into your team’s repo, or drop the Markdown into a PRD or design doc. Same spec, two audiences.'));

  const spec = buildSpec();

  const preview = el('div', { class: 'hd-preview' });
  preview.appendChild(previewSection('Agent', [
    `${spec.agent.name} — ${spec.agent.task || '(no task)'}`,
    `Model: ${MODEL_OPTIONS.find(m => m.id === spec.agent.model)?.label || spec.agent.model} · Env: ${ENV_OPTIONS.find(e => e.id === spec.agent.env)?.label || spec.agent.env}`,
  ]));
  preview.appendChild(previewSectionList('Tools', spec.tools.map(t => `${t.name} — ${t.desc || '(no description)'} (${t.kind})`)));
  preview.appendChild(previewSectionList('Context tactics', spec.context.map(c => `${c.title}: ${c.detail || '(no detail)'}`)));
  preview.appendChild(previewSectionList('Guardrails', spec.guardrails.map(g => `${g.label} — ${g.value}${g.unit && g.unit !== 'list' && g.unit !== 'actions' ? ` ${g.unit}` : ''}`)));
  preview.appendChild(previewSection('Verify prompt', [spec.verify.prompt || '(no verify prompt set)']));
  preview.appendChild(previewSectionList('Verifier checks', spec.verify.checks.map(c => `${c.label} — ${c.criterion || '(no criterion)'}`)));
  wrap.appendChild(preview);

  const jsonText = JSON.stringify(spec, null, 2);
  const mdText = specToMarkdown(spec);

  const grid = el('div', { class: 'rb-export-grid' });
  grid.appendChild(makeExportCard('JSON', jsonText));
  grid.appendChild(makeExportCard('Markdown', mdText));
  wrap.appendChild(grid);

  const actions = el('div', { class: 'rb-export-actions' });
  actions.appendChild(makeCopyButton('Copy JSON', jsonText));
  actions.appendChild(makeCopyButton('Copy Markdown', mdText));
  actions.appendChild(makeDownloadButton('Download .json', jsonText, 'harness-spec.json', 'application/json'));
  actions.appendChild(makeDownloadButton('Download .md', mdText, 'harness-spec.md', 'text/markdown'));
  wrap.appendChild(actions);

  wrap.appendChild(el('div', { class: 'rb-done-card' }, [
    el('strong', {}, 'Ship it. '),
    document.createTextNode('Bring this spec to your next agent design review. When something fails in prod, come back and add the missing tool, guardrail, or verify — don’t just tweak the prompt.'),
  ]));

  return wrap;
}

function previewSection(label, lines) {
  const section = el('div', { class: 'hd-preview__section' });
  section.appendChild(el('div', { class: 'hd-preview__label' }, label));
  lines.forEach(line => {
    section.appendChild(el('div', { class: 'hd-preview__value' }, line));
  });
  return section;
}

function previewSectionList(label, items) {
  const section = el('div', { class: 'hd-preview__section' });
  section.appendChild(el('div', { class: 'hd-preview__label' }, label));
  if (items.length === 0) {
    section.appendChild(el('div', { class: 'hd-preview__value' }, '(none enabled)'));
    return section;
  }
  const ul = el('ul', { class: 'hd-preview__list' });
  items.forEach(item => ul.appendChild(el('li', {}, item)));
  section.appendChild(ul);
  return section;
}

function makeExportCard(title, text) {
  return el('div', { class: 'rb-export-card' }, [
    el('div', { class: 'rb-export-card__head' }, [
      el('div', { class: 'rb-export-card__title' }, title),
    ]),
    el('div', { class: 'rb-export-card__body' }, [
      el('pre', { class: 'rb-code' }, text),
    ]),
  ]);
}

function makeCopyButton(label, text) {
  const btn = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, label);
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = label; }, 1200);
    } catch (err) {
      console.warn('[harness-designer] clipboard failed', err);
      btn.textContent = 'Copy failed';
      setTimeout(() => { btn.textContent = label; }, 1500);
    }
  });
  return btn;
}

function makeDownloadButton(label, text, filename, mime) {
  const btn = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, label);
  btn.addEventListener('click', () => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return btn;
}

function buildSpec() {
  return {
    agent: {
      name: state.agent.name,
      task: state.agent.task,
      model: state.agent.model,
      env: state.agent.env,
    },
    tools: enabledTools().map(t => ({
      name: t.name,
      desc: t.desc,
      kind: t.kind,
    })),
    context: enabledContextTactics().map(t => ({
      id: t.id,
      title: t.title,
      detail: state.context[t.id].detail,
    })),
    guardrails: enabledGuardrails().map(g => ({
      id: g.id,
      label: g.label,
      value: state.guardrails[g.id].value,
      unit: g.unit,
    })),
    verify: {
      prompt: state.verify.prompt,
      checks: enabledVerifiers().map(v => ({
        id: v.id,
        label: v.label,
        criterion: state.verify.checks[v.id].criterion,
      })),
    },
    version: 'harness-101.v1',
  };
}

function specToMarkdown(spec) {
  const modelLabel = MODEL_OPTIONS.find(m => m.id === spec.agent.model)?.label || spec.agent.model;
  const envLabel = ENV_OPTIONS.find(e => e.id === spec.agent.env)?.label || spec.agent.env;
  const lines = [];
  lines.push(`# Harness Spec — ${spec.agent.name || '(unnamed)'}`);
  lines.push('');
  lines.push('## Agent');
  lines.push('');
  lines.push(`- **Name:** ${spec.agent.name || ''}`);
  lines.push(`- **Task:** ${spec.agent.task || ''}`);
  lines.push(`- **Rented model:** ${modelLabel}`);
  lines.push(`- **Environment:** ${envLabel}`);
  lines.push('');
  lines.push('## Tools');
  lines.push('');
  if (spec.tools.length === 0) {
    lines.push('_None enabled._');
  } else {
    spec.tools.forEach(t => lines.push(`- \`${t.name}\` — ${t.desc || ''} (${t.kind})`));
  }
  lines.push('');
  lines.push('## Context strategy');
  lines.push('');
  if (spec.context.length === 0) {
    lines.push('_None enabled._');
  } else {
    spec.context.forEach(c => lines.push(`- **${c.title}:** ${c.detail || '(no detail)'}`));
  }
  lines.push('');
  lines.push('## Guardrails');
  lines.push('');
  if (spec.guardrails.length === 0) {
    lines.push('_None enabled._');
  } else {
    spec.guardrails.forEach(g => {
      const unit = (g.unit === 'list' || g.unit === 'actions') ? '' : ` ${g.unit}`;
      lines.push(`- **${g.label}:** ${g.value}${unit}`);
    });
  }
  lines.push('');
  lines.push('## Verify');
  lines.push('');
  lines.push(`**Prompt:** ${spec.verify.prompt || '(none set)'}`);
  lines.push('');
  if (spec.verify.checks.length === 0) {
    lines.push('_No verifier checks enabled._');
  } else {
    spec.verify.checks.forEach(c => lines.push(`- \`${c.label}\` — ${c.criterion || '(no criterion)'}`));
  }
  lines.push('');
  lines.push('## How to use this');
  lines.push('');
  lines.push('1. **Review** with an engineer — does the tool registry match what the environment actually exposes?');
  lines.push('2. **Ship** the guardrails first — they’re the cheapest safety win.');
  lines.push('3. **Ship** the verify step second — it’s the one that catches the lies.');
  lines.push('4. **Iterate** — every failure in prod becomes a new guardrail, tool, or verify. Never a prompt tweak.');
  lines.push('');
  lines.push('---');
  lines.push('_From the AI PM Skills Lab · Track 06 · Harness_');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
//  Side panel
// ---------------------------------------------------------------------------

function renderSide() {
  const mount = document.querySelector('[data-role="side-mount"]');
  if (!mount) return;
  clear(mount);

  mount.appendChild(el('div', { class: 'rb-side__eyebrow' }, 'Guidance'));

  switch (state.stageId) {
    case 'agent':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'The harness owns the environment'));
      mount.appendChild(el('p', {}, 'Pick the smallest environment that could actually get the task done. If the answer is "browser + DB + shell" — that’s probably three agents, not one.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' },
        'A weaker model in a well-designed harness will beat a stronger model in a bad one. Choose the environment first, model second.'));
      break;

    case 'tools':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Fewer, sharper tools'));
      mount.appendChild(el('p', {}, 'Every extra tool is one more thing the model can pick wrong. Start with three. Add a tool only when you’ve seen the agent fail because it lacked the capability.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Rule of thumb'),
        el('p', { style: 'margin:0' }, 'Tools are bound to the environment (browser session, sandbox, DB conn). They receive the environment; they never open or close it. That’s the harness’s job.'),
      ]));
      break;

    case 'context':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'The three levers'));
      mount.appendChild(el('p', {}, 'Anthropic’s framing: isolation keeps agents from stepping on each other; reduction fights context rot; retrieval brings fresh signal in at the moment of need.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' },
        'Context rot is invisible until you graph it. Then it’s obvious. Log message count per turn on one agent this week.'));
      break;

    case 'guardrails':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Structural, not semantic'));
      mount.appendChild(el('p', {}, 'Guardrails catch runaway behavior — loops, cost, latency, forbidden tools. They do not decide whether the answer is correct. That’s the next step.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Common set'),
        el('ul', { class: 'rb-side__list' }, [
          el('li', {}, 'Max iterations: 6–10 covers most agent loops'),
          el('li', {}, 'Max cost: 3–10× the average successful run'),
          el('li', {}, 'Forbid write-tools until the read-only version works'),
        ]),
      ]));
      break;

    case 'verify':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'The under-taught component'));
      mount.appendChild(el('p', {}, 'Most agents in production today have guardrails but no verify. The loop exits without hitting a guardrail — and the "answer" is wrong. Verify catches that.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' },
        'If the agent says "I upvoted the post" but the harness never observed a click event, verify catches the lie. No verify = your logs will tell you it worked.'));
      break;

    case 'export':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Where this spec goes'));
      mount.appendChild(el('p', {}, 'The JSON is what an engineer reads to build. The Markdown is what a stakeholder or reviewer reads to trust. Ship both.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Next'),
        el('p', { style: 'margin:0' }, 'Book 30 min with one engineer. Walk them through the spec. Note the questions they ask — those are your next iteration.'),
      ]));
      break;
  }
}

// ---------------------------------------------------------------------------
//  Nav
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

  hint.textContent = '';
  if (!isLast && !complete) hint.textContent = navHint(state.stageId);
}

function navHint(stageId) {
  switch (stageId) {
    case 'agent':      return 'Fill in the agent name (2+ chars) and a one-sentence task to continue.';
    case 'tools':      return 'Enable at least one tool to continue.';
    case 'context':    return 'Enable at least one context tactic to continue.';
    case 'guardrails': return 'Enable at least one guardrail to continue.';
    case 'verify':     return 'Write your verify prompt and enable at least one verifier check to continue.';
    default:           return '';
  }
}

// ---------------------------------------------------------------------------
//  Top-level render
// ---------------------------------------------------------------------------

function renderStage() {
  const mount = document.querySelector('[data-role="stage-mount"]');
  if (!mount) return;
  clear(mount);
  let fragment;
  switch (state.stageId) {
    case 'agent':      fragment = renderAgent();      break;
    case 'tools':      fragment = renderTools();      break;
    case 'context':    fragment = renderContext();    break;
    case 'guardrails': fragment = renderGuardrails(); break;
    case 'verify':     fragment = renderVerify();     break;
    case 'export':     fragment = renderExport();     break;
    default:           fragment = renderAgent();
  }
  mount.appendChild(fragment);
}

function render() {
  renderStepper();
  renderStage();
  renderSide();
  renderNav();
}

// ---------------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------------

function wireGlobal() {
  document.querySelector('[data-role="back"]').addEventListener('click', () => {
    const idx = currentIndex();
    if (idx > 0) goto(STAGES[idx - 1].id);
  });
  document.querySelector('[data-role="next"]').addEventListener('click', () => {
    const idx = currentIndex();
    if (idx < STAGES.length - 1 && isStageComplete(state.stageId)) {
      goto(STAGES[idx + 1].id);
    }
  });
  document.querySelector('[data-role="reset"]').addEventListener('click', () => {
    if (confirm('Start over? Your harness spec will be cleared.')) reset();
  });
}

wireGlobal();
render();
