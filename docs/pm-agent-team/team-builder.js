// ============================================================================
//  team-builder.js — 5-stage guided flow for authoring a PM agent team.
//
//  Stages: Lead → Specialists → Org chart → Workflow → Export.
//  State persists to localStorage (key: TB_STORAGE_KEY).
//
//  Security: every user-authored string reaches the DOM via textContent or via
//  input `.value` — never innerHTML.
// ============================================================================

const TB_STORAGE_KEY = 'ai-evals-tutor:pm-agent-team:v1';

const TONE_OPTIONS = [
  { id: 'direct',        label: 'Direct',        blurb: 'Terse, decisive, action-oriented.' },
  { id: 'coach',         label: 'Coach',         blurb: 'Explains reasoning, offers alternatives.' },
  { id: 'collaborative', label: 'Collaborative', blurb: 'Asks clarifying questions, surfaces tradeoffs.' },
];

const SPECIALIST_PRESETS = [
  {
    id: 'design',
    role: 'Design',
    mission: 'Turn intent into wireframes, flows, and exportable design specs.',
    tools: 'Figma, image gen, component libraries, style tokens',
    guardrails: 'Match existing design system. Ship low-fi first, hi-fi on ask.',
  },
  {
    id: 'engineer',
    role: 'Engineer',
    mission: 'Scaffold working prototype code from a mock, wire data + state, ship preview builds.',
    tools: 'Code repo, LLM coding tools, sandbox runtime, package installers',
    guardrails: 'Prototype quality (readable, not perfect). Flag risks, do not silently pick.',
  },
  {
    id: 'qa',
    role: 'QA',
    mission: 'Generate test cases, run evals against agent output, report failures with repro.',
    tools: 'Test runners, eval harness, browser automation',
    guardrails: 'Cover happy path + 2 edges + 1 adversarial before signing off.',
  },
  {
    id: 'deploy',
    role: 'Deploy',
    mission: 'Cut branches, push preview builds to a URL, handle rollbacks + config.',
    tools: 'git, CI/CD, cloud console, feature flags',
    guardrails: 'Preview only. Prod deploys require explicit human approval.',
  },
  {
    id: 'research',
    role: 'Research',
    mission: 'Scan competitors, read interviews and tickets, surface docs, write tight briefs.',
    tools: 'Web search, transcript reader, doc search, CRM',
    guardrails: 'Cite sources. Flag inference vs. direct quote.',
  },
  {
    id: 'growth',
    role: 'Growth',
    mission: 'Propose experiment designs, define success metrics, sanity-check funnels.',
    tools: 'Analytics tool, experiment platform, SQL runner',
    guardrails: 'Statistical significance before conclusions. No dark patterns.',
  },
  {
    id: 'data',
    role: 'Data',
    mission: 'Pull the numbers, build the charts, name the top three insights per slice.',
    tools: 'SQL, notebook runtime, dashboard tool',
    guardrails: 'Always show sample size + time window. Flag confounds.',
  },
];

const WORKFLOW_PRESETS = [
  {
    id: 'new-feature',
    title: 'New feature exploration',
    desc: 'Go from a rough idea to a working prototype in an afternoon.',
    steps: [
      { agent: 'Research', action: 'Scan 3 competitors + surface top pain point from support tickets' },
      { agent: 'Lead PM',  action: 'Turn findings into a one-paragraph brief with success criteria' },
      { agent: 'Design',   action: 'Draft 3 rough mocks (low-fi, no branding)' },
      { agent: 'Engineer', action: 'Prototype the top mock — working, not polished' },
      { agent: 'QA',       action: 'Write 5 test cases against the prototype' },
      { agent: 'Deploy',   action: 'Push preview to a URL for PM review' },
    ],
  },
  {
    id: 'bug-triage',
    title: 'Bug triage',
    desc: 'Turn a fresh bug report into a diagnosis + reproduction + fix proposal.',
    steps: [
      { agent: 'Research', action: 'Pull related tickets + past incident notes' },
      { agent: 'QA',       action: 'Reproduce the bug and write minimal repro steps' },
      { agent: 'Engineer', action: 'Locate root cause + propose a patch' },
      { agent: 'Lead PM',  action: 'Decide fix now vs. add to backlog, note impact' },
      { agent: 'Deploy',   action: 'Land patch on preview + open PR for engineers' },
    ],
  },
  {
    id: 'launch-prep',
    title: 'Launch prep',
    desc: 'From "we’re going to ship this" to "we shipped it" with all the pieces in place.',
    steps: [
      { agent: 'Research', action: 'Draft launch narrative + positioning notes' },
      { agent: 'Design',   action: 'Prepare marketing screenshots + in-app moments' },
      { agent: 'QA',       action: 'Run full regression + smoke on prod-like env' },
      { agent: 'Growth',   action: 'Define success metrics + set up dashboards' },
      { agent: 'Lead PM',  action: 'Write launch doc + roll-out plan for engineers' },
      { agent: 'Deploy',   action: 'Stage the release + wire the feature flag' },
    ],
  },
];

const STAGES = [
  { id: 'lead',        num: '01', label: 'Lead PM Agent' },
  { id: 'specialists', num: '02', label: 'Specialists' },
  { id: 'orgchart',    num: '03', label: 'Org chart' },
  { id: 'workflow',    num: '04', label: 'Workflow' },
  { id: 'export',      num: '05', label: 'Export' },
];

const DEFAULT_STATE = {
  stageId: 'lead',
  lead: { name: 'My PM Agent', mission: '', tone: 'coach' },
  specialists: SPECIALIST_PRESETS.map(p => ({
    id: p.id,
    role: p.role,
    mission: p.mission,
    tools: p.tools,
    guardrails: p.guardrails,
    enabled: ['design', 'engineer', 'qa', 'deploy'].includes(p.id),
    custom: false,
  })),
  workflow: { presetId: null, steps: [] },
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
    const raw = localStorage.getItem(TB_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch (err) {
    console.warn('[team-builder] load failed', err);
    return structuredClone(DEFAULT_STATE);
  }
}

function save() {
  try {
    localStorage.setItem(TB_STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch (err) {
    console.warn('[team-builder] save failed', err);
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
  localStorage.removeItem(TB_STORAGE_KEY);
  render();
}

function enabledSpecialists() {
  return state.specialists.filter(s => s.enabled);
}

function isStageComplete(stageId) {
  switch (stageId) {
    case 'lead':
      return state.lead.name.trim().length >= 2 && state.lead.mission.trim().length > 0;
    case 'specialists':
      return enabledSpecialists().length >= 2;
    case 'orgchart':
      return true;
    case 'workflow': {
      if (!state.workflow.presetId) return false;
      if (!Array.isArray(state.workflow.steps) || state.workflow.steps.length === 0) return false;
      return state.workflow.steps.every(s => s.agent && s.agent.trim());
    }
    case 'export': return true;
    default: return false;
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
//  Stage 01 · Lead PM Agent
// ---------------------------------------------------------------------------

function renderLead() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 01 · Lead PM Agent'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Name your lead PM agent.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'This is the agent you’ll talk to. It reads your brief, splits the work, delegates to specialists, and surfaces decisions back to you.'));

  wrap.appendChild(el('div', { class: 'rb-feature-custom' }, [
    el('label', { class: 'rb-label', for: 'tb-lead-name' }, 'Agent name'),
    el('input', {
      class: 'rb-input',
      id: 'tb-lead-name',
      type: 'text',
      placeholder: 'e.g., Remy, Nova, My PM Agent',
      value: state.lead.name,
      oninput: (e) => {
        state.lead.name = e.target.value;
        save();
        renderStepper();
        renderNav();
      },
    }),
    el('div', { class: 'rb-help' }, 'Give it a memorable name — you’ll refer to it often.'),

    el('div', { style: 'height:14px' }),
    el('label', { class: 'rb-label', for: 'tb-lead-mission' }, 'Mission — one sentence'),
    el('textarea', {
      class: 'rb-textarea',
      id: 'tb-lead-mission',
      placeholder: 'e.g., Runs product exploration end-to-end for the payments team — briefs specialists, aggregates results, keeps me in the loop only on decisions.',
      oninput: (e) => {
        state.lead.mission = e.target.value;
        save();
        renderStepper();
        renderNav();
      },
    }, state.lead.mission),
    el('div', { class: 'rb-help' }, 'A clear mission is what keeps the lead from delegating to the wrong specialists. Rewrite it later if things drift.'),

    el('div', { style: 'height:14px' }),
    el('label', { class: 'rb-label' }, 'Tone'),
    makeToneChoices(),
    el('div', { class: 'rb-help' }, 'How the lead PM agent talks to you. Change any time.'),
  ]));

  return wrap;
}

function makeToneChoices() {
  const row = el('div', { class: 'rb-scorer-choices' });
  TONE_OPTIONS.forEach(opt => {
    const btn = el('button', {
      class: `rb-scorer-btn ${state.lead.tone === opt.id ? 'is-selected' : ''}`.trim(),
      type: 'button',
      title: opt.blurb,
    }, opt.label);
    btn.addEventListener('click', () => {
      state.lead.tone = opt.id;
      save();
      renderStage();
      renderStepper();
      renderNav();
    });
    row.appendChild(btn);
  });
  return row;
}

// ---------------------------------------------------------------------------
//  Stage 02 · Specialists
// ---------------------------------------------------------------------------

function renderSpecialists() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 02 · Specialists'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Pick the agents on your team.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Toggle presets on or off, then edit each agent’s mission, tools, and guardrails. Start with 3–4 — you can always add more later.'));

  wrap.appendChild(el('div', { class: 'rb-counter' }, [
    document.createTextNode('Enabled: '),
    el('strong', {}, `${enabledSpecialists().length} / ${state.specialists.length}`),
  ]));

  const grid = el('div', { class: 'rb-feature-grid' });
  state.specialists.forEach((sp) => {
    grid.appendChild(makeSpecialistCard(sp));
  });
  wrap.appendChild(grid);

  const addBtn = el('button', {
    class: 'rb-btn rb-btn--ghost',
    type: 'button',
    style: 'margin-top:16px',
  }, '+ Add custom specialist');
  addBtn.addEventListener('click', () => {
    const id = `custom-${Date.now()}`;
    state.specialists.push({
      id,
      role: 'Custom Agent',
      mission: '',
      tools: '',
      guardrails: '',
      enabled: true,
      custom: true,
    });
    save();
    renderStage();
    renderStepper();
    renderNav();
  });
  wrap.appendChild(addBtn);

  return wrap;
}

function makeSpecialistCard(sp) {
  const card = el('div', {
    class: `rb-feature-card ${sp.enabled ? 'is-selected' : ''}`.trim(),
    style: 'text-align:left;cursor:default',
  });

  const head = el('div', {
    style: 'display:flex;align-items:flex-start;gap:12px;margin-bottom:10px',
  });
  const toggle = el('button', {
    class: `rb-scorer-btn ${sp.enabled ? 'is-selected' : ''}`.trim(),
    type: 'button',
    style: 'flex-shrink:0',
  }, sp.enabled ? 'On' : 'Off');
  toggle.addEventListener('click', () => {
    sp.enabled = !sp.enabled;
    save();
    renderStage();
    renderStepper();
    renderNav();
  });
  head.appendChild(toggle);

  const titleWrap = el('div', { style: 'flex:1' });
  if (sp.custom) {
    titleWrap.appendChild(el('input', {
      class: 'rb-input',
      type: 'text',
      value: sp.role,
      placeholder: 'Custom agent role',
      style: 'font-weight:700',
      oninput: (e) => { sp.role = e.target.value; save(); },
    }));
  } else {
    titleWrap.appendChild(el('div', { class: 'rb-feature-card__title' }, sp.role));
  }
  head.appendChild(titleWrap);

  if (sp.custom) {
    const removeBtn = el('button', {
      class: 'rb-btn rb-btn--ghost',
      type: 'button',
      style: 'flex-shrink:0;font-size:12px;padding:4px 10px',
    }, 'Remove');
    removeBtn.addEventListener('click', () => {
      state.specialists = state.specialists.filter(x => x.id !== sp.id);
      save();
      renderStage();
      renderStepper();
      renderNav();
    });
    head.appendChild(removeBtn);
  }
  card.appendChild(head);

  card.appendChild(el('div', { class: 'rb-label' }, 'Mission'));
  card.appendChild(el('textarea', {
    class: 'rb-textarea',
    placeholder: 'One sentence — what does this agent do?',
    oninput: (e) => { sp.mission = e.target.value; save(); },
  }, sp.mission));

  card.appendChild(el('div', { class: 'rb-label', style: 'margin-top:8px' }, 'Tools'));
  card.appendChild(el('input', {
    class: 'rb-input',
    type: 'text',
    placeholder: 'e.g., Figma, image gen',
    value: sp.tools,
    oninput: (e) => { sp.tools = e.target.value; save(); },
  }));

  card.appendChild(el('div', { class: 'rb-label', style: 'margin-top:8px' }, 'Guardrails'));
  card.appendChild(el('input', {
    class: 'rb-input',
    type: 'text',
    placeholder: 'e.g., Match existing design system',
    value: sp.guardrails,
    oninput: (e) => { sp.guardrails = e.target.value; save(); },
  }));

  return card;
}

// ---------------------------------------------------------------------------
//  Stage 03 · Org chart
// ---------------------------------------------------------------------------

function renderOrgChart() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 03 · Org chart'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Confirm the reporting lines.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'This is what your team looks like. Everyone reports to the lead. You work with the lead — not the specialists.'));

  const summary = el('div', { class: 'rb-header-summary' });
  summary.appendChild(el('strong', {}, 'Lead: '));
  summary.appendChild(document.createTextNode(state.lead.name));
  summary.appendChild(document.createElement('br'));
  summary.appendChild(document.createTextNode(state.lead.mission || '(no mission set)'));
  wrap.appendChild(summary);

  const leadRow = el('div', {
    class: 'mas-diagram',
    style: 'justify-content:center;margin-top:20px',
    'aria-label': 'Lead PM agent',
  });
  leadRow.appendChild(el('div', { class: 'mas-node mas-node--pm-lead' }, [
    el('div', { class: 'mas-node__label' }, state.lead.name || 'Lead PM Agent'),
    el('div', { class: 'mas-node__meta' }, 'leads the build'),
  ]));
  wrap.appendChild(leadRow);

  const specs = enabledSpecialists();
  if (specs.length === 0) {
    wrap.appendChild(el('div', { class: 'rb-help', style: 'margin-top:20px;text-align:center' },
      'No specialists enabled yet. Go back to Step 02 to pick some.'));
  } else {
    const specRow = el('div', {
      class: 'mas-diagram',
      style: 'flex-wrap:wrap;justify-content:center;gap:14px;margin-top:14px',
      'aria-label': 'Specialist agents',
    });
    specs.forEach(sp => {
      const shortMission = (sp.mission || '').split('.')[0].slice(0, 60);
      specRow.appendChild(el('div', { class: 'mas-node mas-node--pm' }, [
        el('div', { class: 'mas-node__label' }, sp.role || 'Custom'),
        el('div', { class: 'mas-node__meta' }, shortMission || 'no mission yet'),
      ]));
    });
    wrap.appendChild(specRow);
  }

  wrap.appendChild(el('p', { class: 'section-note', style: 'margin-top:22px' },
    'This shape is the whole idea. One agent runs the project. The rest do the work. You work with the PM agent — not the implementers.'));

  return wrap;
}

// ---------------------------------------------------------------------------
//  Stage 04 · Workflow
// ---------------------------------------------------------------------------

function renderWorkflow() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 04 · Workflow'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Pick a starter workflow.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'A workflow is a canned sequence — which agent does what, in what order. Pick one to seed your team’s first loop, then edit the actions to fit.'));

  const grid = el('div', { class: 'rb-feature-grid' });
  WORKFLOW_PRESETS.forEach(p => {
    const isSelected = state.workflow.presetId === p.id;
    const card = el('button', {
      class: `rb-feature-card ${isSelected ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, [
      el('div', { class: 'rb-feature-card__title' }, p.title),
      el('div', { class: 'rb-feature-card__desc' }, p.desc),
    ]);
    card.addEventListener('click', () => {
      state.workflow.presetId = p.id;
      state.workflow.steps = p.steps.map(s => ({ ...s }));
      save();
      renderStage();
      renderStepper();
      renderNav();
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  if (state.workflow.presetId && Array.isArray(state.workflow.steps) && state.workflow.steps.length > 0) {
    wrap.appendChild(el('div', { class: 'rb-label', style: 'margin-top:22px' }, 'Steps (editable)'));
    state.workflow.steps.forEach((step, i) => {
      const block = el('div', { class: 'rb-trace-block' });
      block.appendChild(el('div', { class: 'rb-trace-block__head' }, [
        el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
        el('span', { class: 'rb-trace-block__label' }, step.agent),
        el('span', { class: 'rb-trace-block__category' }, 'Agent'),
      ]));
      block.appendChild(el('div', { class: 'rb-trace-block__field' }, [
        el('label', { class: 'rb-label' }, 'Action'),
        el('textarea', {
          class: 'rb-textarea',
          oninput: (e) => {
            step.action = e.target.value;
            save();
            renderStepper();
            renderNav();
          },
        }, step.action),
      ]));
      wrap.appendChild(block);
    });
  }

  return wrap;
}

// ---------------------------------------------------------------------------
//  Stage 05 · Export
// ---------------------------------------------------------------------------

function renderExport() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 05 · Export'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Your team, ready to paste.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Copy the JSON into your PM tool of choice (MindStudio, Claude Projects, ChatGPT Team, etc.) or drop the Markdown into a PRD. Same team, two formats.'));

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
  actions.appendChild(makeDownloadButton('Download .json', jsonText, 'pm-agent-team.json', 'application/json'));
  actions.appendChild(makeDownloadButton('Download .md', mdText, 'pm-agent-team.md', 'text/markdown'));
  wrap.appendChild(actions);

  wrap.appendChild(el('div', { class: 'rb-done-card' }, [
    el('strong', {}, 'Nice team. '),
    document.createTextNode('Now run the loop: brief the lead, review what comes back, iterate 3–5 times, hand the winning prototype to real engineers to ship.'),
  ]));

  return wrap;
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
      console.warn('[team-builder] clipboard failed', err);
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
  const toneLabel = TONE_OPTIONS.find(t => t.id === state.lead.tone)?.label || '';
  const preset = WORKFLOW_PRESETS.find(w => w.id === state.workflow.presetId);
  return {
    team: {
      lead: {
        name: state.lead.name,
        mission: state.lead.mission,
        tone: toneLabel,
      },
      specialists: enabledSpecialists().map(sp => ({
        role: sp.role,
        mission: sp.mission,
        tools: sp.tools,
        guardrails: sp.guardrails,
      })),
    },
    workflow: {
      preset: preset ? preset.title : '',
      steps: state.workflow.steps.map(s => ({ agent: s.agent, action: s.action })),
    },
    version: 'pm-agent-team.v1',
  };
}

function specToMarkdown(spec) {
  const lines = [];
  lines.push(`# My PM Agent Team — ${spec.team.lead.name || '(unnamed)'}`);
  lines.push('');
  lines.push('## Lead');
  lines.push('');
  lines.push(`- **Name:** ${spec.team.lead.name || ''}`);
  lines.push(`- **Mission:** ${spec.team.lead.mission || ''}`);
  lines.push(`- **Tone:** ${spec.team.lead.tone || ''}`);
  lines.push('');
  lines.push('## Specialists');
  lines.push('');
  if (spec.team.specialists.length === 0) {
    lines.push('_None enabled._');
  } else {
    lines.push('| Role | Mission | Tools | Guardrails |');
    lines.push('| --- | --- | --- | --- |');
    const cell = (s) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    spec.team.specialists.forEach(sp => {
      lines.push(`| ${cell(sp.role)} | ${cell(sp.mission)} | ${cell(sp.tools)} | ${cell(sp.guardrails)} |`);
    });
  }
  lines.push('');
  lines.push(`## Workflow — ${spec.workflow.preset || '(none picked)'}`);
  lines.push('');
  if (spec.workflow.steps.length === 0) {
    lines.push('_No steps set._');
  } else {
    spec.workflow.steps.forEach((s, i) => {
      lines.push(`${i + 1}. **${s.agent}** — ${s.action}`);
    });
  }
  lines.push('');
  lines.push('## How to use this');
  lines.push('');
  lines.push('1. **Brief** the lead in one paragraph with success criteria in plain English.');
  lines.push('2. **Delegate** — let the lead split the work and dispatch specialists.');
  lines.push('3. **Review** what came back. Talk to the lead, not the specialists.');
  lines.push('4. **Iterate** by steering the lead. Do this 3–5 times.');
  lines.push('5. **Ship** — when you like it, hand it to real engineers to productionize.');
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
    case 'lead':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'The lead is the whole game'));
      mount.appendChild(el('p', {}, 'A vague mission means the lead delegates to the wrong specialists. Be specific: what does this team do, and who does it serve?'));
      mount.appendChild(el('div', { class: 'rb-side__quote' },
        '"Explores payment-team feature ideas end-to-end — briefs specialists, aggregates, keeps me on decisions only." Not: "Helps with product stuff."'));
      break;

    case 'specialists':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Start with 3–4'));
      mount.appendChild(el('p', {}, 'Every extra agent is coordination overhead. If you don’t have work for a role today, leave it off. Add later when the bottleneck surfaces.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Common starter sets'),
        el('ul', { class: 'rb-side__list' }, [
          el('li', {}, [el('strong', {}, 'Explorer: '), document.createTextNode('Research + Design + Engineer')]),
          el('li', {}, [el('strong', {}, 'Shipper: '), document.createTextNode('Engineer + QA + Deploy')]),
          el('li', {}, [el('strong', {}, 'Full stack: '), document.createTextNode('Research + Design + Engineer + QA')]),
        ]),
      ]));
      break;

    case 'orgchart':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'You work with the PM, not the implementers'),);
      mount.appendChild(el('p', {}, 'When something feels off, talk to the lead — not the specialist. Corrections at the top propagate down. That’s the whole reason the lead exists.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' },
        '"The design feels heavy" → talk to the PM agent, not the Design agent. Let the PM decide whether to reprompt Design, swap the request, or ask you a clarifying question.'));
      break;

    case 'workflow':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Workflow = seed, not law'));
      mount.appendChild(el('p', {}, 'Pick the closest preset, then edit. The lead will bend the sequence anyway once real work hits — the workflow just gives it a shape to start from.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Rule of thumb'),
        el('p', { style: 'margin:0' }, 'Every step should have one agent, one action, one output. If a step has "and" in it, split it.'),
      ]));
      break;

    case 'export':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Where this spec goes'));
      mount.appendChild(el('p', {}, 'The JSON is what most PM-agent platforms (MindStudio, Claude Projects, etc.) will read. The Markdown is what your team and stakeholders will read. Ship both.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Next'),
        el('p', { style: 'margin:0' }, 'Run one loop end-to-end this week. Bring the winner + spec to engineers when it’s time to ship.'),
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
    case 'lead':        return 'Fill in a name (2+ chars) and a one-sentence mission to continue.';
    case 'specialists': return `Enable ${Math.max(0, 2 - enabledSpecialists().length)} more specialist${enabledSpecialists().length === 1 ? '' : 's'} to continue.`;
    case 'workflow':    return 'Pick a starter workflow to continue.';
    default:            return '';
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
    case 'lead':        fragment = renderLead();        break;
    case 'specialists': fragment = renderSpecialists(); break;
    case 'orgchart':    fragment = renderOrgChart();    break;
    case 'workflow':    fragment = renderWorkflow();    break;
    case 'export':      fragment = renderExport();      break;
    default:            fragment = renderLead();
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
    if (confirm('Start over? Your current team will be cleared.')) reset();
  });
}

wireGlobal();
render();
