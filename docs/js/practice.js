// ============================================================================
//  practice.js — the Practice tab. A 6-stage authoring flow that walks a PM
//  through Target → Task → Data → Grader → Run → Export, ending in a
//  downloadable spec (JSON + Markdown) they can paste into a PRD.
//
//  Reuses graders from graders.js for the Run stage.
//  All DOM built with createElement + textContent (no innerHTML on data).
// ============================================================================

import {
  codeExactMatch,
  toolCallVerifier,
  claimSupported,
  codeTestRunner,
} from './graders.js';

const STORAGE_KEY = 'ai-evals-tutor:practice:v1';

const STAGES = [
  { key: 'start',   label: 'Start' },
  { key: 'target',  label: 'Target' },
  { key: 'task',    label: 'Task' },
  { key: 'data',    label: 'Data' },
  { key: 'grader',  label: 'Grader' },
  { key: 'run',     label: 'Run' },
  { key: 'export',  label: 'Export' },
];

const DEFAULT_COLUMNS_BY_TARGET = {
  'Model': [
    { key: 'input',    label: 'Input prompt' },
    { key: 'expected', label: 'Expected (refuse/answer)' },
    { key: 'category', label: 'Category (harmful/benign)' },
  ],
  'Agent': [
    { key: 'scenario',           label: 'Scenario' },
    { key: 'first_user_message', label: 'First user message' },
    { key: 'expected_outcome',   label: 'Expected outcome' },
  ],
  'AI System': [
    { key: 'input',            label: 'Input' },
    { key: 'expected_outcome', label: 'Expected outcome' },
    { key: 'notes',            label: 'Notes' },
  ],
};

// Reader-friendly labels for column keys that examples use but that aren't
// in DEFAULT_COLUMNS_BY_TARGET. Falls back to title-casing the key.
const COLUMN_LABEL_OVERRIDES = {
  question:           'Question',
  retrieved_docs:     'Retrieved docs',
  bug_report:         'Bug report',
  must_contain:       'Must contain',
  must_not_contain:   'Must not contain',
  expected_outcome:   'Expected outcome',
  first_user_message: 'First user message',
};
function labelForKey(key) {
  if (COLUMN_LABEL_OVERRIDES[key]) return COLUMN_LABEL_OVERRIDES[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function columnsFromKeys(keys) {
  return keys.map(k => ({ key: k, label: labelForKey(k) }));
}

const CODE_GRADERS = [
  {
    id: 'exactMatch',
    label: 'exactMatch',
    when: 'The output must equal a known string (or one of a small set). Simplest possible grader.',
    configFields: [{ key: 'expected', label: 'Expected output (per row uses its "expected_outcome" column)', placeholder: 'Leave blank to use each row\'s expected column' }],
  },
  {
    id: 'regex',
    label: 'regex',
    when: 'Output must match a regular expression (e.g., "refused|declined|can\'t help").',
    configFields: [{ key: 'pattern', label: 'Regex pattern', placeholder: 'e.g., ^(REFUSED|DECLINED)' }],
  },
  {
    id: 'containsAll',
    label: 'containsAll',
    when: 'Output must contain every listed substring. Great for coding patches — like Lab 4.',
    configFields: [{ key: 'substrings', label: 'Required substrings (one per line)', placeholder: 'if not given\nhmac.compare_digest', textarea: true }],
  },
  {
    id: 'toolCallSequence',
    label: 'toolCallSequence',
    help: 'Output must mention each tool name in order (e.g., "verify_identity", "process_refund"). Simple text check — a real harness would inspect actual tool traces.',
    when: 'Verifies tool calls appear in the expected order in the transcript.',
    configFields: [{ key: 'calls', label: 'Required tool call names in order (one per line)', placeholder: 'verify_identity\nlookup_order\nprocess_refund', textarea: true }],
  },
];


// ---------------------------------------------------------------------------
//  State — one blob, persisted to localStorage on every change
// ---------------------------------------------------------------------------
function newState() {
  return {
    version: 1,
    stage: 0,
    source: null,        // 'blank' | 'example'
    exampleKey: null,    // 'model' | 'conversational' | 'rag' | 'coding'
    target: null,        // 'Model' | 'Agent' | 'AI System'
    task: '',
    data: { columns: [], rows: [] },
    grader: { type: null, codeGrader: null, codeConfig: {}, rubric: '' },
    runs: [],
  };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) { /* quota / privacy mode — non-fatal */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1) return parsed;
  } catch (_) { /* corrupt storage — start fresh */ }
  return null;
}

function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}


// ---------------------------------------------------------------------------
//  Tiny DOM helper (createElement + textContent, no innerHTML)
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
    n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return n;
}
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }


// ---------------------------------------------------------------------------
//  Public entry
// ---------------------------------------------------------------------------
export async function mountPractice(root, examplesDoc) {
  const examples = examplesDoc.examples;
  const state = loadState() || newState();
  const ctx = { root, state, examples, resumed: !!loadState() };

  clear(root);
  root.appendChild(renderShell(ctx));
  renderStage(ctx);
}


// ---------------------------------------------------------------------------
//  Shell — stepper + main pane + side reference panel
// ---------------------------------------------------------------------------
function renderShell(ctx) {
  const shell = el('div', { class: 'practice-shell' });

  // Resume banner (only shown on first render if we loaded from storage)
  if (ctx.resumed) {
    const banner = el('div', { class: 'practice-banner' }, [
      el('span', {}, 'You have an in-progress practice eval saved. '),
      el('button', { class: 'practice-banner__link', onclick: () => banner.remove() }, 'Continue'),
      el('span', {}, ' or '),
      el('button', {
        class: 'practice-banner__link practice-banner__link--danger',
        onclick: () => {
          clearState();
          ctx.state = newState();
          ctx.resumed = false;
          clear(ctx.root);
          ctx.root.appendChild(renderShell(ctx));
          renderStage(ctx);
        },
      }, 'start over'),
      el('span', {}, '.'),
    ]);
    shell.appendChild(banner);
  }

  // Stepper
  const stepper = el('div', { class: 'practice-stepper js-practice-stepper' });
  STAGES.forEach((s, i) => {
    const item = el('button', {
      class: 'practice-stepper__step',
      'data-stage': String(i),
      onclick: () => { if (i <= ctx.state.stage) { ctx.state.stage = i; saveState(ctx.state); renderStage(ctx); } },
    }, [
      el('span', { class: 'practice-stepper__dot' }, String(i)),
      el('span', { class: 'practice-stepper__label' }, s.label),
    ]);
    stepper.appendChild(item);
  });
  shell.appendChild(stepper);

  // Body — main + side panel
  const body = el('div', { class: 'practice-body' }, [
    el('div', { class: 'practice-main js-practice-main' }),
    el('aside', { class: 'practice-side js-practice-side' }),
  ]);
  shell.appendChild(body);
  return shell;
}


// ---------------------------------------------------------------------------
//  Stage dispatch
// ---------------------------------------------------------------------------
function renderStage(ctx) {
  updateStepper(ctx);
  const main = ctx.root.querySelector('.js-practice-main');
  const side = ctx.root.querySelector('.js-practice-side');
  clear(main); clear(side);
  const stage = STAGES[ctx.state.stage].key;
  const render = STAGE_RENDERERS[stage];
  main.appendChild(render(ctx));
  side.appendChild(renderSidePanel(ctx));
}

function updateStepper(ctx) {
  const stepper = ctx.root.querySelector('.js-practice-stepper');
  if (!stepper) return;
  Array.from(stepper.querySelectorAll('.practice-stepper__step')).forEach((step, i) => {
    step.classList.toggle('is-active', i === ctx.state.stage);
    step.classList.toggle('is-done', i < ctx.state.stage);
    step.classList.toggle('is-locked', i > ctx.state.stage);
  });
}


// ---------------------------------------------------------------------------
//  Navigation footer (Back / Next)
// ---------------------------------------------------------------------------
function navFooter(ctx, opts = {}) {
  const canBack = ctx.state.stage > 0;
  const canNext = opts.canNext !== false;
  const nextLabel = opts.nextLabel || 'Next →';
  const backBtn = el('button', {
    class: 'practice-nav-btn practice-nav-btn--back' + (canBack ? '' : ' is-disabled'),
    onclick: () => { if (canBack) { ctx.state.stage--; saveState(ctx.state); renderStage(ctx); } },
  }, '← Back');
  // Read current disabled state from the DOM at click time so a later
  // `is-disabled` toggle (e.g. from rerenderTable) is respected.
  const nextBtn = el('button', {
    class: 'practice-nav-btn practice-nav-btn--next' + (canNext ? '' : ' is-disabled'),
    onclick: (e) => {
      if (e.currentTarget.classList.contains('is-disabled')) return;
      if (opts.onNext) opts.onNext();
      if (ctx.state.stage < STAGES.length - 1) ctx.state.stage++;
      saveState(ctx.state);
      renderStage(ctx);
    },
  }, nextLabel);
  const hint = opts.hint ? el('div', { class: 'practice-nav-hint' }, opts.hint) : null;
  return el('div', { class: 'practice-nav' }, [backBtn, hint, nextBtn]);
}


// ---------------------------------------------------------------------------
//  Stage 0 — Start (blank vs example)
// ---------------------------------------------------------------------------
function stageStart(ctx) {
  const section = el('section', { class: 'practice-stage' }, [
    el('h2', { class: 'practice-stage__title' }, 'Start your first eval'),
    el('p', { class: 'practice-stage__lede' }, 'This flow walks you through the same recipe you saw in Eval 101 — but this time you\'re the one building it. Six short stages; you can go back anytime.'),
  ]);

  const grid = el('div', { class: 'practice-start-grid' });

  // Blank card
  const blankCard = el('button', {
    class: 'practice-start-card',
    onclick: () => {
      ctx.state.source = 'blank';
      ctx.state.exampleKey = null;
      ctx.state.stage = 1;
      saveState(ctx.state);
      renderStage(ctx);
    },
  }, [
    el('div', { class: 'practice-start-card__label' }, 'Start blank →'),
    el('div', { class: 'practice-start-card__body' }, 'Empty template. You\'ll write the task, samples, grader, and outputs from scratch. Best if you already have a specific eval in mind.'),
  ]);
  grid.appendChild(blankCard);

  // Example picker
  const exampleCard = el('div', { class: 'practice-start-card practice-start-card--example' }, [
    el('div', { class: 'practice-start-card__label' }, 'Start from an example →'),
    el('div', { class: 'practice-start-card__body' }, 'Pre-fills every stage with one of the labs so you can see the shape end-to-end. You can edit anything.'),
  ]);
  const picker = el('div', { class: 'practice-example-picker' });
  Object.entries(ctx.examples).forEach(([key, ex]) => {
    picker.appendChild(el('button', {
      class: 'practice-example-btn',
      onclick: () => seedFromExample(ctx, key),
    }, [
      el('div', { class: 'practice-example-btn__label' }, ex.label),
      el('div', { class: 'practice-example-btn__hint' }, ex.hint),
    ]));
  });
  exampleCard.appendChild(picker);
  grid.appendChild(exampleCard);

  section.appendChild(grid);
  return section;
}

function buildCodeConfigFromExample(ex) {
  const g = ex.grader || {};
  if (g.codeGrader === 'containsAll' && ex.samples[0]?.must_contain) {
    return { substrings: ex.samples[0].must_contain.split(/\s*\/\s*/).join('\n') };
  }
  if (g.codeGrader === 'toolCallSequence' && Array.isArray(g.requiredCalls)) {
    return { calls: g.requiredCalls.join('\n') };
  }
  if (g.codeGrader === 'regex' && g.pattern) return { pattern: g.pattern };
  if (g.codeGrader === 'exactMatch' && g.expected) return { expected: g.expected };
  return {};
}

function seedFromExample(ctx, key) {
  const ex = ctx.examples[key];
  if (!ex) return;
  ctx.state.source = 'example';
  ctx.state.exampleKey = key;
  ctx.state.target = ex.target;
  ctx.state.task = ex.task.question;
  // Use the example's own dataColumns if present, otherwise fall back to target defaults.
  const cols = (ex.dataColumns && ex.dataColumns.length)
    ? ex.dataColumns.slice()
    : DEFAULT_COLUMNS_BY_TARGET[ex.target].map(c => c.key);
  ctx.state.data = {
    columns: cols,
    rows: ex.samples.map(s => {
      const row = { id: s.id };
      cols.forEach(c => { row[c] = s[c] != null ? String(s[c]) : ''; });
      return row;
    }),
  };
  ctx.state.grader = {
    type: ex.grader.type,
    codeGrader: ex.grader.codeGrader || null,
    codeConfig: buildCodeConfigFromExample(ex),
    rubric: ex.grader.rubric || '',
  };
  ctx.state.runs = [];
  ctx.state.stage = 1;
  saveState(ctx.state);
  renderStage(ctx);
}


// ---------------------------------------------------------------------------
//  Stage 1 — Target
// ---------------------------------------------------------------------------
function stageTarget(ctx) {
  const section = el('section', { class: 'practice-stage' }, [
    el('h2', { class: 'practice-stage__title' }, 'Stage 1 · What are you evaluating?'),
    el('p', { class: 'practice-stage__lede' }, 'The target sets everything downstream — which sample fields you\'ll fill in, which graders are worth reaching for, and how you\'ll measure success.'),
  ]);

  const options = [
    { value: 'Model',     label: 'Model',     hint: 'The raw LLM. Grader usually cares about a single response to a single prompt.' },
    { value: 'Agent',     label: 'Agent',     hint: 'LLM + tools + memory. Grader also cares about tool calls, multi-turn flow, and outcome.' },
    { value: 'AI System', label: 'AI System', hint: 'Multiple agents, a full product flow, or LLM + retrieval. Grader spans several components — often hybrid.' },
  ];

  const group = el('div', { class: 'practice-radio-group' });
  options.forEach(opt => {
    const card = el('button', {
      class: 'practice-radio' + (ctx.state.target === opt.value ? ' is-active' : ''),
      onclick: () => {
        const prev = ctx.state.target;
        ctx.state.target = opt.value;
        // Rebuild columns from the target defaults ONLY when they're not
        // already set (blank flow) or when the target changed on a blank flow.
        const shouldReset = ctx.state.source === 'blank' && (prev !== opt.value || !ctx.state.data.columns.length);
        if (ctx.state.data.columns.length === 0 || shouldReset) {
          ctx.state.data.columns = DEFAULT_COLUMNS_BY_TARGET[opt.value].map(c => c.key);
          ctx.state.data.rows = ctx.state.data.rows.length ? ctx.state.data.rows : [emptyRow(ctx.state.data.columns)];
        }
        saveState(ctx.state);
        renderStage(ctx);
      },
    }, [
      el('div', { class: 'practice-radio__label' }, opt.label),
      el('div', { class: 'practice-radio__hint' }, opt.hint),
    ]);
    group.appendChild(card);
  });

  section.appendChild(group);
  section.appendChild(navFooter(ctx, {
    canNext: !!ctx.state.target,
    hint: ctx.state.target ? null : 'Pick a target to continue.',
  }));
  return section;
}


// ---------------------------------------------------------------------------
//  Stage 2 — Task
// ---------------------------------------------------------------------------
function stageTask(ctx) {
  const section = el('section', { class: 'practice-stage' }, [
    el('h2', { class: 'practice-stage__title' }, 'Stage 2 · Write the task in one sentence'),
    el('p', { class: 'practice-stage__lede' }, 'Frame the task as a yes/no question you could measure. Good: "Does the refund agent verify identity before issuing a refund?" Weak: "The agent should be helpful and safe."'),
  ]);

  const textarea = el('textarea', {
    class: 'practice-textarea',
    rows: '3',
    placeholder: 'Does the model / agent / AI system ... ?',
    oninput: (e) => { ctx.state.task = e.target.value; saveState(ctx.state); updateNavState(); },
  });
  textarea.value = ctx.state.task || '';
  section.appendChild(textarea);

  // Advice card
  section.appendChild(el('details', { class: 'practice-tip' }, [
    el('summary', {}, 'Why this framing matters →'),
    el('div', { class: 'practice-tip__body' },
      'A task written as a testable question forces you to decide what "success" looks like before you write any data. If you can\'t tell whether a single output "passes" the task, your grader won\'t know either.'),
  ]));

  const nav = navFooter(ctx, {
    canNext: !!ctx.state.task && ctx.state.task.trim().length >= 10,
    hint: ctx.state.task && ctx.state.task.trim().length < 10 ? 'A one-sentence task usually needs 10+ characters.' : null,
  });
  section.appendChild(nav);

  function updateNavState() {
    const canNext = ctx.state.task && ctx.state.task.trim().length >= 10;
    const nextBtn = nav.querySelector('.practice-nav-btn--next');
    if (nextBtn) nextBtn.classList.toggle('is-disabled', !canNext);
    const hint = nav.querySelector('.practice-nav-hint');
    if (hint) hint.remove();
  }

  return section;
}


// ---------------------------------------------------------------------------
//  Stage 3 — Data (editable table)
// ---------------------------------------------------------------------------
function stageData(ctx) {
  const section = el('section', { class: 'practice-stage' }, [
    el('h2', { class: 'practice-stage__title' }, 'Stage 3 · Build your sample set'),
    el('p', { class: 'practice-stage__lede' }, 'A few carefully chosen samples beat hundreds of random ones. Aim for 3–8 rows covering the golden path, one edge case, and one adversarial case.'),
  ]);

  // Prefer whatever columns the state already has (seeded from example or previous edit);
  // fall back to the target defaults for blank flows.
  if (!ctx.state.data.columns.length) {
    ctx.state.data.columns = (DEFAULT_COLUMNS_BY_TARGET[ctx.state.target] || []).map(c => c.key);
  }
  const cols = columnsFromKeys(ctx.state.data.columns);

  const tableWrap = el('div', { class: 'practice-table-wrap' });
  const table = el('table', { class: 'practice-table' });
  const thead = el('thead', {}, [
    el('tr', {}, [
      el('th', {}, '#'),
      ...cols.map(c => el('th', {}, c.label)),
      el('th', { class: 'practice-table__actions-h' }, ''),
    ]),
  ]);
  table.appendChild(thead);
  const tbody = el('tbody');

  const rerenderTable = () => {
    clear(tbody);
    ctx.state.data.rows.forEach((row, idx) => {
      tbody.appendChild(renderDataRow(ctx, row, idx, cols, rerenderTable));
    });
    saveState(ctx.state);
    const canNext = ctx.state.data.rows.length >= 3 && ctx.state.data.rows.every(r => cols.every(c => (r[c.key] || '').trim().length > 0));
    const nextBtn = section.querySelector('.practice-nav-btn--next');
    if (nextBtn) nextBtn.classList.toggle('is-disabled', !canNext);
    const hintEl = section.querySelector('.practice-nav-hint');
    if (hintEl) {
      if (canNext) hintEl.remove();
      else hintEl.textContent = ctx.state.data.rows.length < 3
        ? `${ctx.state.data.rows.length}/3 rows — add at least ${3 - ctx.state.data.rows.length} more.`
        : 'Fill every cell before moving on.';
    } else if (!canNext) {
      const nav = section.querySelector('.practice-nav');
      if (nav && !nav.querySelector('.practice-nav-hint')) {
        const h = el('div', { class: 'practice-nav-hint' }, ctx.state.data.rows.length < 3
          ? `${ctx.state.data.rows.length}/3 rows — add at least ${3 - ctx.state.data.rows.length} more.`
          : 'Fill every cell before moving on.');
        nav.insertBefore(h, nav.querySelector('.practice-nav-btn--next'));
      }
    }
  };

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);

  section.appendChild(el('div', { class: 'practice-table-actions' }, [
    el('button', {
      class: 'practice-btn practice-btn--secondary',
      onclick: () => {
        ctx.state.data.rows.push(emptyRow(ctx.state.data.columns));
        rerenderTable();
      },
    }, '+ Add row'),
    ctx.state.source === 'example' && ctx.state.exampleKey ? el('button', {
      class: 'practice-btn practice-btn--secondary',
      onclick: () => {
        const ex = ctx.examples[ctx.state.exampleKey];
        ctx.state.data.rows = ex.samples.map(s => {
          const row = { id: s.id };
          ctx.state.data.columns.forEach(c => { row[c] = s[c] != null ? String(s[c]) : ''; });
          return row;
        });
        rerenderTable();
      },
    }, '↺ Reload rows from example') : null,
  ].filter(Boolean)));

  section.appendChild(navFooter(ctx, {
    canNext: false, // rerenderTable will set this correctly
  }));
  rerenderTable();
  return section;
}

function emptyRow(columns) {
  const row = { id: 's' + Math.floor(1000 + Math.random() * 9000) };
  columns.forEach(c => { row[c] = ''; });
  return row;
}

function renderDataRow(ctx, row, idx, cols, rerender) {
  const tr = el('tr');
  tr.appendChild(el('td', { class: 'practice-table__idx' }, String(idx + 1)));
  cols.forEach(c => {
    const cell = el('td');
    const ta = el('textarea', {
      class: 'practice-cell',
      rows: '2',
      oninput: (e) => { row[c.key] = e.target.value; saveState(ctx.state); },
      onblur: () => rerender(),
    });
    ta.value = row[c.key] || '';
    cell.appendChild(ta);
    tr.appendChild(cell);
  });
  tr.appendChild(el('td', { class: 'practice-table__actions' }, [
    el('button', {
      class: 'practice-icon-btn',
      title: 'Delete row',
      onclick: () => {
        ctx.state.data.rows.splice(idx, 1);
        rerender();
      },
    }, '✕'),
  ]));
  return tr;
}


// ---------------------------------------------------------------------------
//  Stage 4 — Grader
// ---------------------------------------------------------------------------
function stageGrader(ctx) {
  const section = el('section', { class: 'practice-stage' }, [
    el('h2', { class: 'practice-stage__title' }, 'Stage 4 · Pick a grader'),
    el('p', { class: 'practice-stage__lede' }, 'Cheapest grader that works, first. Code if the answer is objective. LLM-judge if it\'s subjective (tone, faithfulness, quality). Hybrid if both matter.'),
  ]);

  const types = [
    { id: 'code',      label: 'Code-based',    hint: 'Deterministic rules — string match, regex, test suite. Cheap, fast, no API keys.' },
    { id: 'llm-judge', label: 'LLM as judge',  hint: 'Another model scores against a rubric. Handles subjective quality.' },
    { id: 'hybrid',    label: 'Hybrid',        hint: 'Code + LLM judge combined. One score per aspect, then composed.' },
  ];

  const cards = el('div', { class: 'practice-grader-cards' });
  types.forEach(t => {
    const card = el('button', {
      class: 'practice-grader-card' + (ctx.state.grader.type === t.id ? ' is-active' : ''),
      onclick: () => {
        ctx.state.grader.type = t.id;
        if (t.id === 'code' && !ctx.state.grader.codeGrader) ctx.state.grader.codeGrader = 'exactMatch';
        saveState(ctx.state);
        renderStage(ctx);
      },
    }, [
      el('div', { class: 'practice-grader-card__label' }, t.label),
      el('div', { class: 'practice-grader-card__hint' }, t.hint),
    ]);
    cards.appendChild(card);
  });
  section.appendChild(cards);

  // Config panel
  const config = el('div', { class: 'practice-grader-config' });
  if (ctx.state.grader.type === 'code' || ctx.state.grader.type === 'hybrid') {
    config.appendChild(renderCodeGraderConfig(ctx));
  }
  if (ctx.state.grader.type === 'llm-judge' || ctx.state.grader.type === 'hybrid') {
    config.appendChild(renderRubricConfig(ctx));
  }
  section.appendChild(config);

  section.appendChild(navFooter(ctx, {
    canNext: isGraderValid(ctx.state.grader),
    hint: !isGraderValid(ctx.state.grader) ? 'Configure the grader before continuing.' : null,
  }));
  return section;
}

function isGraderValid(g) {
  if (!g.type) return false;
  if (g.type === 'code') return !!g.codeGrader;
  if (g.type === 'llm-judge') return !!g.rubric && g.rubric.trim().length >= 10;
  if (g.type === 'hybrid') return !!g.codeGrader && !!g.rubric && g.rubric.trim().length >= 10;
  return false;
}

function renderCodeGraderConfig(ctx) {
  const wrap = el('div', { class: 'practice-grader-config__block' }, [
    el('div', { class: 'practice-grader-config__title' }, 'Code grader'),
  ]);
  const select = el('select', {
    class: 'practice-select',
    onchange: (e) => {
      ctx.state.grader.codeGrader = e.target.value;
      ctx.state.grader.codeConfig = {};
      saveState(ctx.state);
      renderStage(ctx);
    },
  }, CODE_GRADERS.map(g => el('option', { value: g.id, ...(ctx.state.grader.codeGrader === g.id ? { selected: true } : {}) }, g.label)));
  wrap.appendChild(select);

  const active = CODE_GRADERS.find(g => g.id === ctx.state.grader.codeGrader) || CODE_GRADERS[0];
  wrap.appendChild(el('div', { class: 'practice-grader-config__when' }, active.when));

  active.configFields.forEach(f => {
    const label = el('label', { class: 'practice-field' }, [
      el('span', { class: 'practice-field__label' }, f.label),
      f.textarea
        ? (() => {
            const ta = el('textarea', {
              class: 'practice-textarea',
              rows: '4',
              placeholder: f.placeholder || '',
              oninput: (e) => { ctx.state.grader.codeConfig[f.key] = e.target.value; saveState(ctx.state); },
            });
            ta.value = ctx.state.grader.codeConfig[f.key] || '';
            return ta;
          })()
        : (() => {
            const inp = el('input', {
              class: 'practice-input',
              type: 'text',
              placeholder: f.placeholder || '',
              oninput: (e) => { ctx.state.grader.codeConfig[f.key] = e.target.value; saveState(ctx.state); },
            });
            inp.value = ctx.state.grader.codeConfig[f.key] || '';
            return inp;
          })(),
    ]);
    wrap.appendChild(label);
  });

  return wrap;
}

function renderRubricConfig(ctx) {
  const wrap = el('div', { class: 'practice-grader-config__block' }, [
    el('div', { class: 'practice-grader-config__title' }, 'LLM-judge rubric'),
    el('div', { class: 'practice-grader-config__when' }, 'The prompt an LLM judge would follow. In Run, you\'ll play the judge — click Pass/Fail/Partial per row.'),
  ]);
  const ta = el('textarea', {
    class: 'practice-textarea practice-textarea--tall',
    rows: '8',
    placeholder: 'You are grading whether... Score / classify the response as ...',
    oninput: (e) => { ctx.state.grader.rubric = e.target.value; saveState(ctx.state); },
  });
  ta.value = ctx.state.grader.rubric || '';
  wrap.appendChild(ta);
  return wrap;
}


// ---------------------------------------------------------------------------
//  Stage 5 — Run
// ---------------------------------------------------------------------------
function stageRun(ctx) {
  const section = el('section', { class: 'practice-stage' }, [
    el('h2', { class: 'practice-stage__title' }, 'Stage 5 · Run the eval'),
    el('p', { class: 'practice-stage__lede' }, 'Paste what your real agent produced for each sample. Code graders run automatically. For LLM-judge, click Pass / Fail / Partial the way a judge would.'),
  ]);

  // Ensure runs array has an entry per row
  ensureRuns(ctx);

  // Optional "fill from example outputs" button
  if (ctx.state.source === 'example' && ctx.state.exampleKey) {
    section.appendChild(el('button', {
      class: 'practice-btn practice-btn--secondary practice-fill-btn',
      onclick: () => {
        const ex = ctx.examples[ctx.state.exampleKey];
        ex.samples.forEach((s, i) => {
          const run = ctx.state.runs[i];
          if (run) run.agentOutput = s.agentOutput || '';
        });
        saveState(ctx.state);
        renderStage(ctx);
      },
    }, '↺ Fill from example outputs'));
  }

  const runsWrap = el('div', { class: 'practice-runs' });
  ctx.state.data.rows.forEach((row, i) => {
    runsWrap.appendChild(renderRunRow(ctx, row, i));
  });
  section.appendChild(runsWrap);

  // Scorecard
  const scoreMount = el('div', { class: 'practice-scorecard-mount' });
  section.appendChild(scoreMount);
  renderPracticeScorecard(ctx, scoreMount);

  section.appendChild(navFooter(ctx, {
    canNext: allRowsGraded(ctx),
    hint: allRowsGraded(ctx) ? null : 'Grade every row to see the scorecard and continue.',
    nextLabel: 'Export spec →',
  }));
  return section;
}

function ensureRuns(ctx) {
  const need = ctx.state.data.rows.length;
  while (ctx.state.runs.length < need) ctx.state.runs.push({ agentOutput: '', judgeVerdict: null, judgeReasoning: '' });
  ctx.state.runs.length = need;
}

function renderRunRow(ctx, row, i) {
  const run = ctx.state.runs[i];
  const wrap = el('div', { class: 'practice-run-row' });
  wrap.appendChild(el('div', { class: 'practice-run-row__label' }, `#${i + 1} · ${row.id || 's' + (i + 1)}`));
  wrap.appendChild(el('div', { class: 'practice-run-row__input' }, summarizeRow(ctx, row)));

  const ta = el('textarea', {
    class: 'practice-textarea',
    rows: '4',
    placeholder: 'Paste the agent\'s output for this sample here…',
    oninput: (e) => {
      run.agentOutput = e.target.value;
      saveState(ctx.state);
      updateVerdictUI(ctx, wrap, row, i);
    },
  });
  ta.value = run.agentOutput || '';
  wrap.appendChild(ta);

  const verdictBox = el('div', { class: 'practice-run-row__verdict' });
  wrap.appendChild(verdictBox);
  updateVerdictUI(ctx, wrap, row, i);

  return wrap;
}

function summarizeRow(ctx, row) {
  const cols = columnsFromKeys(ctx.state.data.columns || []);
  const parts = cols.map(c => `${c.label}: ${truncate(row[c.key] || '', 90)}`);
  return parts.join(' · ');
}
function truncate(s, n) { return s.length <= n ? s : s.slice(0, n - 1) + '…'; }

function updateVerdictUI(ctx, rowEl, row, i) {
  const box = rowEl.querySelector('.practice-run-row__verdict');
  clear(box);
  const run = ctx.state.runs[i];
  const g = ctx.state.grader;
  if (!g.type) { box.appendChild(el('div', { class: 'practice-hint' }, 'Pick a grader first.')); return; }

  // Code verdict — auto-computed
  let codeResult = null;
  if ((g.type === 'code' || g.type === 'hybrid') && run.agentOutput) {
    codeResult = runCodeGrader(g, row, run.agentOutput);
    run.codeVerdict = codeResult.pass ? 'pass' : 'fail';
    run.codeReasoning = codeResult.reasoning;
    box.appendChild(el('div', { class: 'practice-verdict practice-verdict--' + (codeResult.pass ? 'pass' : 'fail') }, [
      el('span', { class: 'practice-verdict__label' }, `code: ${codeResult.pass ? '✓ pass' : '✗ fail'}`),
      el('span', { class: 'practice-verdict__reason' }, codeResult.reasoning || ''),
    ]));
  } else if (g.type === 'code' || g.type === 'hybrid') {
    run.codeVerdict = null;
    box.appendChild(el('div', { class: 'practice-hint' }, 'Paste output above — code grader runs live.'));
  }

  // LLM-judge — manual buttons
  if (g.type === 'llm-judge' || g.type === 'hybrid') {
    const btnRow = el('div', { class: 'practice-judge-btns' });
    ['pass', 'fail', 'partial'].forEach(v => {
      btnRow.appendChild(el('button', {
        class: 'practice-judge-btn practice-judge-btn--' + v + (run.judgeVerdict === v ? ' is-active' : ''),
        onclick: () => {
          run.judgeVerdict = v;
          saveState(ctx.state);
          updateVerdictUI(ctx, rowEl, row, i);
          renderPracticeScorecard(ctx, ctx.root.querySelector('.practice-scorecard-mount'));
          refreshNextBtn(ctx);
        },
      }, v));
    });
    box.appendChild(el('div', { class: 'practice-judge-label' }, 'Your judge verdict:'));
    box.appendChild(btnRow);
    const reasoning = el('textarea', {
      class: 'practice-textarea practice-textarea--sm',
      rows: '2',
      placeholder: 'Optional: one-line reasoning',
      oninput: (e) => { run.judgeReasoning = e.target.value; saveState(ctx.state); },
    });
    reasoning.value = run.judgeReasoning || '';
    box.appendChild(reasoning);
  }

  saveState(ctx.state);
  renderPracticeScorecard(ctx, ctx.root.querySelector('.practice-scorecard-mount'));
  refreshNextBtn(ctx);
}

function refreshNextBtn(ctx) {
  const nextBtn = ctx.root.querySelector('.practice-main .practice-nav-btn--next');
  if (!nextBtn) return;
  const canNext = allRowsGraded(ctx);
  nextBtn.classList.toggle('is-disabled', !canNext);
  const hint = ctx.root.querySelector('.practice-main .practice-nav-hint');
  if (canNext) { if (hint) hint.remove(); }
  else if (!hint) {
    const nav = ctx.root.querySelector('.practice-main .practice-nav');
    if (nav) nav.insertBefore(el('div', { class: 'practice-nav-hint' }, 'Grade every row to see the scorecard and continue.'), nextBtn);
  }
}

function allRowsGraded(ctx) {
  const g = ctx.state.grader;
  if (!ctx.state.runs.length) return false;
  return ctx.state.runs.every(r => {
    if (!r.agentOutput) return false;
    if (g.type === 'code')      return r.codeVerdict != null;
    if (g.type === 'llm-judge') return r.judgeVerdict != null;
    if (g.type === 'hybrid')    return r.codeVerdict != null && r.judgeVerdict != null;
    return false;
  });
}

function runCodeGrader(grader, row, output) {
  const cfg = grader.codeConfig || {};
  if (grader.codeGrader === 'exactMatch') {
    const expected = cfg.expected || row.expected_outcome || row.expected || '';
    const r = codeExactMatch(output.trim(), (expected || '').trim());
    return { pass: r.pass, reasoning: r.reasoning };
  }
  if (grader.codeGrader === 'regex') {
    const pattern = cfg.pattern || '';
    if (!pattern) return { pass: false, reasoning: 'No regex pattern set.' };
    try {
      const re = new RegExp(pattern, 'm');
      const pass = re.test(output);
      return { pass, reasoning: pass ? `Matched /${pattern}/` : `No match for /${pattern}/` };
    } catch (e) {
      return { pass: false, reasoning: 'Invalid regex: ' + e.message };
    }
  }
  if (grader.codeGrader === 'containsAll') {
    // Prefer per-row must_contain (Lab 4 pattern) when the row has one; otherwise use global config.
    const rowSubs = (row && row.must_contain)
      ? String(row.must_contain).split(/\s*\/\s*|\n/).map(s => s.trim()).filter(Boolean)
      : [];
    const cfgSubs = (cfg.substrings || '').split(/\n/).map(s => s.trim()).filter(Boolean);
    const subs = rowSubs.length ? rowSubs : cfgSubs;
    if (!subs.length) return { pass: false, reasoning: 'No substrings set.' };
    const missing = subs.filter(s => !output.includes(s));
    return { pass: missing.length === 0, reasoning: missing.length === 0 ? `All ${subs.length} substrings present.` : `Missing: ${missing.join(', ')}` };
  }
  if (grader.codeGrader === 'toolCallSequence') {
    const calls = (cfg.calls || '').split(/\n/).map(s => s.trim()).filter(Boolean);
    if (!calls.length) return { pass: false, reasoning: 'No required calls set.' };
    let cursor = 0;
    const misses = [];
    calls.forEach(name => {
      const at = output.indexOf(name, cursor);
      if (at === -1) misses.push(name);
      else cursor = at + name.length;
    });
    return { pass: misses.length === 0, reasoning: misses.length === 0 ? `All ${calls.length} calls in order.` : `Missing/out-of-order: ${misses.join(', ')}` };
  }
  return { pass: false, reasoning: 'Unknown code grader.' };
}


// ---------------------------------------------------------------------------
//  Practice scorecard
// ---------------------------------------------------------------------------
function renderPracticeScorecard(ctx, mount) {
  if (!mount) return;
  clear(mount);
  const runs = ctx.state.runs;
  if (!runs.length) return;
  const graded = runs.filter(r => r.codeVerdict != null || r.judgeVerdict != null);
  if (!graded.length) return;

  const g = ctx.state.grader;
  const total = runs.length;
  let passCount = 0;
  const rows = runs.map((r, i) => {
    const codePass = r.codeVerdict === 'pass';
    const judgePass = r.judgeVerdict === 'pass';
    const judgePartial = r.judgeVerdict === 'partial';
    let pass = false;
    if (g.type === 'code')      pass = codePass;
    if (g.type === 'llm-judge') pass = judgePass;
    if (g.type === 'hybrid')    pass = codePass && (judgePass || judgePartial);
    if (pass) passCount++;
    return { id: ctx.state.data.rows[i]?.id || `s${i + 1}`, pass, codeVerdict: r.codeVerdict, judgeVerdict: r.judgeVerdict };
  });

  const pct = total ? Math.round(100 * passCount / total) : 0;

  const card = el('div', { class: 'practice-scorecard' }, [
    el('div', { class: 'practice-scorecard__headline' }, [
      el('div', { class: 'practice-scorecard__label' }, 'Pass rate'),
      el('div', { class: 'practice-scorecard__value' }, `${pct}%`),
      el('div', { class: 'practice-scorecard__sub' }, `${passCount}/${total} samples pass`),
    ]),
  ]);
  const rowsWrap = el('div', { class: 'practice-scorecard__rows' });
  rows.forEach(r => {
    rowsWrap.appendChild(el('div', { class: 'practice-scorecard__row' }, [
      el('span', { class: 'practice-scorecard__id' }, r.id),
      el('span', { class: 'practice-scorecard__verdict practice-scorecard__verdict--' + (r.pass ? 'pass' : 'fail') }, r.pass ? '✓ pass' : '✗ fail'),
      r.codeVerdict ? el('span', { class: 'practice-scorecard__tag' }, `code: ${r.codeVerdict}`) : null,
      r.judgeVerdict ? el('span', { class: 'practice-scorecard__tag' }, `judge: ${r.judgeVerdict}`) : null,
    ]));
  });
  card.appendChild(rowsWrap);
  mount.appendChild(card);
}


// ---------------------------------------------------------------------------
//  Stage 6 — Export
// ---------------------------------------------------------------------------
function stageExport(ctx) {
  const section = el('section', { class: 'practice-stage' }, [
    el('h2', { class: 'practice-stage__title' }, 'Stage 6 · Your eval spec'),
    el('p', { class: 'practice-stage__lede' }, 'Two formats, same content. JSON for tooling and hand-off. Markdown to paste directly into a PRD section.'),
  ]);

  const spec = computeSpec(ctx);
  const json = JSON.stringify(spec, null, 2);
  const md = toMarkdown(spec);
  const prdSnippet = toPrdSnippet(spec);

  const grid = el('div', { class: 'practice-export-grid' });
  grid.appendChild(renderExportPane('JSON', json, 'js-export-json'));
  grid.appendChild(renderExportPane('Markdown (paste into PRD)', md, 'js-export-md'));
  section.appendChild(grid);

  const actions = el('div', { class: 'practice-export-actions' }, [
    el('button', { class: 'practice-btn', onclick: () => copyToClipboard(json, 'JSON copied') }, 'Copy JSON'),
    el('button', { class: 'practice-btn', onclick: () => copyToClipboard(md, 'Markdown copied') }, 'Copy Markdown'),
    el('button', { class: 'practice-btn practice-btn--primary', onclick: () => downloadPair(spec, md) }, 'Download both →'),
    el('button', { class: 'practice-btn practice-btn--secondary', onclick: () => copyToClipboard(prdSnippet, 'PRD snippet copied') }, 'Copy PRD snippet'),
  ]);
  section.appendChild(actions);

  section.appendChild(el('div', { class: 'practice-export-note' },
    'PRD snippet is a shorter block (task + grader + sample count) suitable for embedding inline in a Product Requirements Doc — the full spec is what engineering will use to wire it up.'));

  const bottomNav = el('div', { class: 'practice-nav practice-nav--last' }, [
    el('button', {
      class: 'practice-nav-btn practice-nav-btn--back',
      onclick: () => { ctx.state.stage--; saveState(ctx.state); renderStage(ctx); },
    }, '← Back to Run'),
    el('button', {
      class: 'practice-nav-btn practice-nav-btn--danger',
      onclick: () => {
        if (confirm('Clear the current practice eval and start over?')) {
          clearState();
          ctx.state = newState();
          renderStage(ctx);
        }
      },
    }, 'Start over →'),
  ]);
  section.appendChild(bottomNav);
  return section;
}

function renderExportPane(title, text, marker) {
  const pane = el('div', { class: 'practice-export-pane ' + marker });
  pane.appendChild(el('div', { class: 'practice-export-pane__title' }, title));
  const pre = el('pre', { class: 'practice-export-pre' });
  pre.textContent = text;
  pane.appendChild(pre);
  return pane;
}

function copyToClipboard(text, msg) {
  navigator.clipboard.writeText(text).then(() => {
    flash(msg);
  }).catch(() => flash('Copy failed'));
}

function flash(msg) {
  const bubble = el('div', { class: 'practice-flash' }, msg);
  document.body.appendChild(bubble);
  setTimeout(() => bubble.classList.add('is-in'), 10);
  setTimeout(() => { bubble.classList.remove('is-in'); setTimeout(() => bubble.remove(), 300); }, 1400);
}

function downloadPair(spec, md) {
  // No ZIP dep — download two files sequentially instead.
  downloadBlob(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), 'my-eval-spec.json');
  setTimeout(() => downloadBlob(new Blob([md], { type: 'text/markdown' }), 'my-eval-spec.md'), 150);
}

function downloadBlob(blob, filename) {
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
//  Spec builders
// ---------------------------------------------------------------------------
function computeSpec(ctx) {
  const cols = columnsFromKeys(ctx.state.data.columns || []);
  const runs = ctx.state.runs;
  const passCount = runs.reduce((n, r, i) => {
    const g = ctx.state.grader;
    let pass = false;
    if (g.type === 'code')      pass = r.codeVerdict === 'pass';
    if (g.type === 'llm-judge') pass = r.judgeVerdict === 'pass';
    if (g.type === 'hybrid')    pass = r.codeVerdict === 'pass' && (r.judgeVerdict === 'pass' || r.judgeVerdict === 'partial');
    return n + (pass ? 1 : 0);
  }, 0);
  return {
    name: 'my-first-eval',
    target: ctx.state.target,
    task: { question: ctx.state.task },
    dataColumns: cols.map(c => ({ key: c.key, label: c.label })),
    samples: ctx.state.data.rows.map(r => {
      const s = { id: r.id };
      cols.forEach(c => { s[c.key] = r[c.key] || ''; });
      return s;
    }),
    grader: {
      type: ctx.state.grader.type,
      codeGrader: ctx.state.grader.codeGrader || null,
      codeConfig: ctx.state.grader.codeConfig || {},
      rubric: ctx.state.grader.rubric || null,
    },
    runs: ctx.state.runs.map((r, i) => ({
      sampleId: ctx.state.data.rows[i]?.id || `s${i + 1}`,
      agentOutput: r.agentOutput || '',
      codeVerdict: r.codeVerdict || null,
      judgeVerdict: r.judgeVerdict || null,
      judgeReasoning: r.judgeReasoning || '',
    })),
    metrics: {
      passRate: runs.length ? passCount / runs.length : 0,
      samples: runs.length,
    },
  };
}

function toMarkdown(spec) {
  const lines = [];
  lines.push(`# Eval spec — ${spec.name}`);
  lines.push('');
  lines.push('## Target');
  lines.push(spec.target || '(not set)');
  lines.push('');
  lines.push('## Task');
  lines.push(spec.task.question || '(not set)');
  lines.push('');
  lines.push(`## Data (${spec.samples.length} samples)`);
  lines.push('');
  lines.push('| # | ' + spec.dataColumns.map(c => c.label).join(' | ') + ' |');
  lines.push('|---|' + spec.dataColumns.map(() => '---').join('|') + '|');
  spec.samples.forEach((s, i) => {
    lines.push(`| ${i + 1} | ` + spec.dataColumns.map(c => escapeMd(s[c.key] || '')).join(' | ') + ' |');
  });
  lines.push('');
  lines.push('## Grader');
  lines.push('- **Type:** ' + spec.grader.type);
  if (spec.grader.codeGrader) lines.push('- **Code grader:** `' + spec.grader.codeGrader + '`');
  if (spec.grader.codeGrader && Object.keys(spec.grader.codeConfig || {}).length) {
    lines.push('- **Code config:**');
    Object.entries(spec.grader.codeConfig).forEach(([k, v]) => {
      lines.push('  - `' + k + '`: ' + JSON.stringify(v));
    });
  }
  if (spec.grader.rubric) {
    lines.push('- **Rubric prompt:**');
    lines.push('');
    lines.push('```');
    lines.push(spec.grader.rubric);
    lines.push('```');
  }
  lines.push('');
  lines.push('## Metrics');
  lines.push('- **Pass rate:** ' + Math.round(100 * spec.metrics.passRate) + `% (${Math.round(spec.metrics.passRate * spec.metrics.samples)}/${spec.metrics.samples})`);
  lines.push('');
  lines.push('## Sample transcripts');
  spec.runs.forEach((r, i) => {
    lines.push('');
    lines.push(`### Sample ${i + 1} — ${r.sampleId}`);
    if (r.agentOutput) {
      lines.push('```');
      lines.push(r.agentOutput);
      lines.push('```');
    }
    const verdictBits = [];
    if (r.codeVerdict)  verdictBits.push('code: ' + r.codeVerdict);
    if (r.judgeVerdict) verdictBits.push('judge: ' + r.judgeVerdict);
    if (verdictBits.length) lines.push('**Verdict:** ' + verdictBits.join(' · '));
    if (r.judgeReasoning) lines.push('**Reasoning:** ' + r.judgeReasoning);
  });
  return lines.join('\n');
}

function escapeMd(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function toPrdSnippet(spec) {
  const lines = [];
  lines.push('**Eval:** ' + spec.task.question);
  lines.push('- Target: ' + (spec.target || '(not set)'));
  lines.push('- Grader: ' + spec.grader.type + (spec.grader.codeGrader ? ' (' + spec.grader.codeGrader + ')' : ''));
  lines.push('- Samples: ' + spec.samples.length);
  lines.push('- Baseline pass rate: ' + Math.round(100 * spec.metrics.passRate) + '%');
  return lines.join('\n');
}


// ---------------------------------------------------------------------------
//  Side reference panel — shows the selected example's version of this stage
// ---------------------------------------------------------------------------
function renderSidePanel(ctx) {
  const panel = el('div', { class: 'practice-side__inner' });
  const key = ctx.state.exampleKey;
  const ex = key ? ctx.examples[key] : null;

  if (!ex) {
    // Blank flow — offer to show an example
    panel.appendChild(el('div', { class: 'practice-side__title' }, 'Reference'));
    panel.appendChild(el('div', { class: 'practice-side__body' },
      'Working blank. Click any example below to peek at how one lab handles this same stage — your work here is not affected.'));
    const btns = el('div', { class: 'practice-side__examples' });
    Object.entries(ctx.examples).forEach(([k, e]) => {
      btns.appendChild(el('button', {
        class: 'practice-side__example-btn',
        onclick: () => {
          ctx.state.exampleKey = k;   // preview only; do not overwrite user work
          saveState(ctx.state);
          renderStage(ctx);
        },
      }, e.label));
    });
    panel.appendChild(btns);
    return panel;
  }

  panel.appendChild(el('div', { class: 'practice-side__title' }, `Example: ${ex.label}`));
  panel.appendChild(el('div', { class: 'practice-side__hint' }, ex.hint));

  const stage = STAGES[ctx.state.stage].key;
  if (stage === 'target') {
    panel.appendChild(sideBlock('Target', ex.target));
  }
  if (stage === 'task') {
    panel.appendChild(sideBlock('Task', ex.task.question));
  }
  if (stage === 'data') {
    panel.appendChild(sideBlock('First sample', formatSample(ex.samples[0])));
    panel.appendChild(sideBlock('Sample count', String(ex.samples.length)));
  }
  if (stage === 'grader') {
    panel.appendChild(sideBlock('Grader type', ex.grader.type));
    if (ex.grader.rubric) panel.appendChild(sideBlockPre('Rubric', ex.grader.rubric));
  }
  if (stage === 'run') {
    panel.appendChild(sideBlock('Tip', 'Click "Fill from example outputs" to see a full run without pasting.'));
  }
  if (stage === 'export') {
    panel.appendChild(sideBlock('Reminder', 'Your exported spec matches the same shape as the "Copy this lab as a starter template" button under any Eval 101 lab — they interoperate.'));
  }

  // Switch example
  const switcher = el('div', { class: 'practice-side__switch' }, [
    el('div', { class: 'practice-side__switch-label' }, 'Switch example:'),
    ...Object.entries(ctx.examples).map(([k, e]) => el('button', {
      class: 'practice-side__example-btn' + (k === key ? ' is-active' : ''),
      onclick: () => { ctx.state.exampleKey = k; saveState(ctx.state); renderStage(ctx); },
    }, e.target)),
  ]);
  panel.appendChild(switcher);

  return panel;
}

function sideBlock(title, text) {
  return el('div', { class: 'practice-side__block' }, [
    el('div', { class: 'practice-side__block-title' }, title),
    el('div', { class: 'practice-side__block-body' }, text),
  ]);
}
function sideBlockPre(title, text) {
  const pre = el('pre', { class: 'practice-side__pre' });
  pre.textContent = text;
  return el('div', { class: 'practice-side__block' }, [
    el('div', { class: 'practice-side__block-title' }, title),
    pre,
  ]);
}

function formatSample(s) {
  if (!s) return '';
  const bits = [];
  Object.entries(s).forEach(([k, v]) => {
    if (k === 'id' || k === 'agentOutput') return;
    bits.push(`${k}: ${truncate(String(v), 120)}`);
  });
  return bits.join('\n');
}


// ---------------------------------------------------------------------------
//  Stage renderer registry
// ---------------------------------------------------------------------------
const STAGE_RENDERERS = {
  start:  stageStart,
  target: stageTarget,
  task:   stageTask,
  data:   stageData,
  grader: stageGrader,
  run:    stageRun,
  export: stageExport,
};
