// ============================================================================
//  rubric-builder.js — 5-stage guided flow for authoring an eval rubric.
//
//  Stages: Feature → Dimensions → Trace codes → Preview → Export.
//  State persists to localStorage (key: RB_STORAGE_KEY).
//
//  Security: every user-authored string reaches the DOM via textContent or via
//  input `.value` — never innerHTML. This is enforced by the security hook.
// ============================================================================

const RB_STORAGE_KEY = 'ai-evals-tutor:rubric-builder:v1';

const FEATURE_PRESETS = [
  {
    id: 'refund-agent',
    title: 'Service refund agent',
    desc: 'Handles refund requests end-to-end — verifies identity, checks eligibility, issues refund.',
  },
  {
    id: 'rag-help',
    title: 'RAG help assistant',
    desc: 'Answers product questions grounded in docs. Must cite sources and stay on-topic.',
  },
  {
    id: 'coding-assist',
    title: 'Coding assistant',
    desc: 'Suggests patches for bug reports. Must produce runnable code and match style.',
  },
  {
    id: 'schedule-agent',
    title: 'Scheduling agent',
    desc: 'Books appointments across providers. Must call the right tool and confirm slot.',
  },
];

const DIMENSION_CATEGORIES = [
  {
    id: 'tone',
    title: 'Tone',
    example: '"Reads like the brand voice — warm, direct, no hedging."',
  },
  {
    id: 'factual',
    title: 'Factual correctness',
    example: '"Every claim is supported by a retrieved doc within 30 days old."',
  },
  {
    id: 'instruction',
    title: 'Instruction following',
    example: '"Output is JSON with fields id, status, reason — no extra keys."',
  },
  {
    id: 'task',
    title: 'Task completion',
    example: '"Refund was issued and confirmation sent in one turn."',
  },
];

const SCORER_OPTIONS = [
  { id: 'code', label: 'Code' },
  { id: 'llm-judge', label: 'LLM judge' },
  { id: 'human', label: 'Human' },
];

const STAGES = [
  { id: 'feature',   num: '01', label: 'Feature' },
  { id: 'dims',      num: '02', label: 'Dimensions' },
  { id: 'trace',     num: '03', label: 'Trace codes' },
  { id: 'preview',   num: '04', label: 'Preview' },
  { id: 'export',    num: '05', label: 'Export' },
];

const DEFAULT_STATE = {
  stageId: 'feature',
  feature: { presetId: null, name: '', desc: '' },
  dimensions: [],        // array of DIMENSION_CATEGORIES ids, max 2
  traceCodes: {},        // { [dimensionId]: { what, question, scorer } }
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
    const raw = localStorage.getItem(RB_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch (err) {
    console.warn('[rubric-builder] load failed', err);
    return structuredClone(DEFAULT_STATE);
  }
}

function save() {
  try {
    localStorage.setItem(RB_STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch (err) {
    console.warn('[rubric-builder] save failed', err);
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
  localStorage.removeItem(RB_STORAGE_KEY);
  render();
}

function featureTitle() {
  if (state.feature.presetId) {
    const p = FEATURE_PRESETS.find(x => x.id === state.feature.presetId);
    return p ? p.title : '';
  }
  return state.feature.name || '';
}

function selectedDimensionObjects() {
  return state.dimensions
    .map(id => DIMENSION_CATEGORIES.find(d => d.id === id))
    .filter(Boolean);
}

function isStageComplete(stageId) {
  switch (stageId) {
    case 'feature':
      if (state.feature.presetId) return true;
      return state.feature.name.trim().length > 2;
    case 'dims':
      return state.dimensions.length === 2;
    case 'trace': {
      if (state.dimensions.length !== 2) return false;
      return state.dimensions.every(dId => {
        const tc = state.traceCodes[dId];
        return tc && tc.what.trim() && tc.question.trim() && tc.scorer;
      });
    }
    case 'preview':
      return true;
    case 'export':
      return true;
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
//  Stepper (top-of-page)
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
//  Stage renderers — each returns a DocumentFragment for .rb-stage
// ---------------------------------------------------------------------------

function renderFeature() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 01 · Feature'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Pick the feature you’re evaluating.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Rubrics are per-feature, not per-product. Pick something specific enough that a trace code can pass or fail against a single response.'));

  const grid = el('div', { class: 'rb-feature-grid' });
  FEATURE_PRESETS.forEach(p => {
    const isSelected = state.feature.presetId === p.id;
    const card = el('button', {
      class: `rb-feature-card ${isSelected ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, [
      el('div', { class: 'rb-feature-card__title' }, p.title),
      el('div', { class: 'rb-feature-card__desc' }, p.desc),
    ]);
    card.addEventListener('click', () => {
      state.feature.presetId = p.id;
      state.feature.name = '';
      state.feature.desc = '';
      save();
      render();
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  wrap.appendChild(el('div', { class: 'rb-feature-custom' }, [
    el('label', { class: 'rb-label', for: 'rb-custom-name' }, 'Or describe your own feature'),
    el('input', {
      class: 'rb-input',
      id: 'rb-custom-name',
      type: 'text',
      placeholder: 'e.g., Provider onboarding assistant',
      value: state.feature.name,
      oninput: (e) => {
        state.feature.name = e.target.value;
        state.feature.presetId = null;
        save();
        renderStepper();
        renderNav();
      },
    }),
    el('div', { style: 'height:8px' }),
    el('textarea', {
      class: 'rb-textarea',
      placeholder: 'One sentence: what does it do, and for whom?',
      oninput: (e) => {
        state.feature.desc = e.target.value;
        state.feature.presetId = null;
        save();
      },
    }, state.feature.desc),
    el('div', { class: 'rb-help' }, 'Custom feature? Fill in a name (3+ chars) to enable Next.'),
  ]));

  return wrap;
}

function renderDims() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 02 · Dimensions'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Pick exactly two quality dimensions.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Two is the sweet spot for a first rubric — wide enough to see real regressions, narrow enough to actually maintain. Add more later once you’re running.'));

  wrap.appendChild(el('div', { class: 'rb-counter' }, [
    document.createTextNode('Selected: '),
    el('strong', {}, `${state.dimensions.length} / 2`),
  ]));

  const grid = el('div', { class: 'rb-dim-grid' });
  DIMENSION_CATEGORIES.forEach(d => {
    const isSelected = state.dimensions.includes(d.id);
    const atCap = state.dimensions.length >= 2 && !isSelected;
    const card = el('button', {
      class: `rb-dim-card ${isSelected ? 'is-selected' : ''} ${atCap ? 'is-disabled' : ''}`.trim(),
      type: 'button',
      disabled: atCap ? true : null,
    }, [
      el('div', { class: 'rb-dim-card__badge' }, 'Picked'),
      el('div', { class: 'rb-dim-card__title' }, d.title),
      el('div', { class: 'rb-dim-card__example' }, d.example),
    ]);
    card.addEventListener('click', () => {
      if (atCap) return;
      if (isSelected) {
        state.dimensions = state.dimensions.filter(x => x !== d.id);
        delete state.traceCodes[d.id];
      } else {
        state.dimensions.push(d.id);
      }
      save();
      render();
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderTrace() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 03 · Trace codes'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Write one binary trace code per dimension.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Each trace code has three parts: what you’re checking, a binary question (yes = pass), and a scorer. Keep questions narrow — one thing per code.'));

  const dims = selectedDimensionObjects();
  if (dims.length === 0) {
    wrap.appendChild(el('div', { class: 'rb-header-summary' },
      'Pick two dimensions first — Step 02.'));
    return wrap;
  }

  dims.forEach((d, i) => {
    const tc = state.traceCodes[d.id] || { what: '', question: '', scorer: '' };
    const block = el('div', { class: 'rb-trace-block' });

    block.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, d.title),
      el('span', { class: 'rb-trace-block__category' }, 'Dimension'),
    ]));

    block.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'What we check'),
      el('input', {
        class: 'rb-input',
        type: 'text',
        placeholder: 'e.g., Source freshness',
        value: tc.what,
        oninput: (e) => {
          updateTraceCode(d.id, 'what', e.target.value);
        },
      }),
      el('div', { class: 'rb-help' }, 'A short noun phrase. This is the column header a reviewer scans.'),
    ]));

    block.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Binary question'),
      el('textarea', {
        class: 'rb-textarea',
        placeholder: 'e.g., Was every cited doc dated within the last 30 days?',
        oninput: (e) => {
          updateTraceCode(d.id, 'question', e.target.value);
        },
      }, tc.question),
      el('div', { class: 'rb-help' }, 'Answerable with yes or no. If you’d hedge, split it into two codes.'),
    ]));

    block.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Scorer'),
      makeScorerChoices(d.id, tc.scorer),
      el('div', { class: 'rb-help' }, 'Cheapest that works: code for exact rules, LLM judge for subjective, human for calibration.'),
    ]));

    wrap.appendChild(block);
  });

  return wrap;
}

function makeScorerChoices(dimId, currentScorer) {
  const row = el('div', { class: 'rb-scorer-choices' });
  SCORER_OPTIONS.forEach(opt => {
    const btn = el('button', {
      class: `rb-scorer-btn ${currentScorer === opt.id ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, opt.label);
    btn.addEventListener('click', () => {
      updateTraceCode(dimId, 'scorer', opt.id);
      renderStage();
      renderNav();
      renderStepper();
    });
    row.appendChild(btn);
  });
  return row;
}

function updateTraceCode(dimId, field, value) {
  if (!state.traceCodes[dimId]) state.traceCodes[dimId] = { what: '', question: '', scorer: '' };
  state.traceCodes[dimId][field] = value;
  save();
  renderStepper();
  renderNav();
}

function renderPreview() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 04 · Preview'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'This is your rubric.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Read it as a reviewer would. If a question makes you hedge, go back to Step 03 and split it.'));

  const summary = el('div', { class: 'rb-header-summary' });
  summary.appendChild(el('strong', {}, 'Feature: '));
  summary.appendChild(document.createTextNode(featureTitle() || '(unnamed)'));
  if (state.feature.desc) {
    summary.appendChild(document.createElement('br'));
    summary.appendChild(document.createTextNode(state.feature.desc));
  }
  wrap.appendChild(summary);

  const preview = el('div', { class: 'rb-preview' });
  preview.appendChild(el('div', { class: 'rb-preview__head' }, [
    el('div', {}, 'What we check'),
    el('div', {}, 'Binary question'),
    el('div', {}, 'Scorer'),
  ]));

  const dims = selectedDimensionObjects();
  if (dims.length === 0) {
    preview.appendChild(el('div', { class: 'rb-preview__row' }, [
      el('div', { class: 'rb-preview__missing' }, 'No dimensions picked yet.'),
      el('div', {}, ''),
      el('div', {}, ''),
    ]));
  }

  dims.forEach(d => {
    const tc = state.traceCodes[d.id] || {};
    const scorerLabel = SCORER_OPTIONS.find(s => s.id === tc.scorer)?.label || '';
    const whatCell = el('div', { class: 'rb-preview__what' });
    whatCell.appendChild(el('strong', {}, tc.what || '(no label)'));
    whatCell.appendChild(el('span', { class: 'rb-preview__cat' }, d.title));

    preview.appendChild(el('div', { class: 'rb-preview__row' }, [
      whatCell,
      el('div', {}, tc.question || el('span', { class: 'rb-preview__missing' }, 'no question yet')),
      el('div', { class: 'rb-preview__scorer' }, scorerLabel || el('span', { class: 'rb-preview__missing' }, '—')),
    ]));
  });
  wrap.appendChild(preview);
  return wrap;
}

function renderExport() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 05 · Export'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Ship it.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Copy the JSON into a spec file or paste the Markdown into a PRD. Both formats are the same rubric — pick whichever your team reads.'));

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
  actions.appendChild(makeDownloadButton('Download .json', jsonText, 'rubric.json', 'application/json'));
  actions.appendChild(makeDownloadButton('Download .md', mdText, 'rubric.md', 'text/markdown'));
  wrap.appendChild(actions);

  wrap.appendChild(el('div', { class: 'rb-done-card' }, [
    el('strong', {}, 'Nice work. '),
    document.createTextNode('This rubric is small on purpose. Run it on 10–20 sessions from your product this week, then come back and add dimensions three and four once you know what’s catching.'),
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
      const original = label;
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = original; }, 1200);
    } catch (err) {
      console.warn('[rubric-builder] clipboard failed', err);
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
  const dims = selectedDimensionObjects();
  return {
    feature: {
      title: featureTitle(),
      description: state.feature.desc || '',
    },
    dimensions: dims.map(d => {
      const tc = state.traceCodes[d.id] || {};
      return {
        category: d.title,
        what: tc.what || '',
        binary_question: tc.question || '',
        scorer: SCORER_OPTIONS.find(s => s.id === tc.scorer)?.label || '',
      };
    }),
  };
}

function specToMarkdown(spec) {
  const lines = [];
  lines.push(`# Rubric — ${spec.feature.title || '(unnamed feature)'}`);
  if (spec.feature.description) {
    lines.push('');
    lines.push(spec.feature.description);
  }
  lines.push('');
  lines.push('## Trace codes');
  lines.push('');
  lines.push('| What we check | Category | Binary question | Scorer |');
  lines.push('| --- | --- | --- | --- |');
  spec.dimensions.forEach(d => {
    const cell = (s) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${cell(d.what)} | ${cell(d.category)} | ${cell(d.binary_question)} | ${cell(d.scorer)} |`);
  });
  lines.push('');
  lines.push('## How to run');
  lines.push('');
  lines.push('1. Sample 10–20 real sessions from this feature.');
  lines.push('2. For each session, answer every binary question yes or no.');
  lines.push('3. Track the pass rate per trace code week over week.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
//  Side panel — mirrors current stage with tips + example
// ---------------------------------------------------------------------------

function renderSide() {
  const mount = document.querySelector('[data-role="side-mount"]');
  if (!mount) return;
  clear(mount);

  const eyebrow = el('div', { class: 'rb-side__eyebrow' }, 'Example');
  mount.appendChild(eyebrow);

  switch (state.stageId) {
    case 'feature':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'One feature, not one product'));
      mount.appendChild(el('p', {}, 'A rubric that tries to score everything scores nothing. Pick a slice of behavior narrow enough that a single session either passes or fails.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' },
        '"Provider search returning results within 800 ms and matching specialty filter" — not "Search should be good."'));
      break;

    case 'dims': {
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'The four categories'));
      const list = el('ul', { class: 'rb-side__list' });
      DIMENSION_CATEGORIES.forEach(d => {
        list.appendChild(el('li', {}, [
          el('strong', {}, d.title + ' — '),
          document.createTextNode(d.example),
        ]));
      });
      mount.appendChild(list);
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Rule of thumb'),
        el('p', { style: 'margin:0' }, 'Two dimensions max on the first rubric. You can add more later.'),
      ]));
      break;
    }

    case 'trace':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'One question. Binary. Narrow.'));
      mount.appendChild(el('p', {}, 'A trace code is what a reviewer would circle on a rubric sheet. If your question has the word "and," it’s two codes.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' },
        '"Was every cited doc dated within the last 30 days?" — short, binary, narrow.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Pick a scorer'),
        el('p', { style: 'margin:0' },
          'Code: rule-based (regex, JSON schema, tool-call match). LLM judge: subjective (tone, groundedness). Human: calibration + edge cases.'),
      ]));
      break;

    case 'preview':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Read it as a reviewer'));
      mount.appendChild(el('p', {}, 'If any row makes you hedge — "well, kind of, depends on…" — the question isn’t binary enough. Go split it.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Sanity checks'),
        el('ul', { class: 'rb-side__list' }, [
          el('li', {}, 'Every "What we check" is a noun phrase.'),
          el('li', {}, 'Every question can be answered yes or no.'),
          el('li', {}, 'No question contains the word "and".'),
        ]),
      ]));
      break;

    case 'export':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Now run it'));
      mount.appendChild(el('p', {}, 'A rubric that never runs is a doc. Pick 10–20 sessions from this week and score them by hand or with a judge. Track week over week.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Where to go next'),
        el('p', { style: 'margin:0' },
          'Head back to Eval 201 · Apply for playbooks on running your rubric in prod — rhythms, instrumentation, case studies.'),
      ]));
      break;
  }
}

// ---------------------------------------------------------------------------
//  Nav (back / next)
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

  if (isLast) {
    next.textContent = 'Done';
  } else {
    next.textContent = 'Next →';
  }

  hint.textContent = '';
  if (!isLast && !complete) {
    hint.textContent = navHint(state.stageId);
  }
}

function navHint(stageId) {
  switch (stageId) {
    case 'feature': return 'Pick a preset or name a custom feature (3+ chars) to continue.';
    case 'dims':    return `Pick ${2 - state.dimensions.length} more dimension${state.dimensions.length === 1 ? '' : 's'} to continue.`;
    case 'trace':   return 'Every trace code needs a label, a binary question, and a scorer.';
    default:        return '';
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
    case 'feature': fragment = renderFeature(); break;
    case 'dims':    fragment = renderDims();    break;
    case 'trace':   fragment = renderTrace();   break;
    case 'preview': fragment = renderPreview(); break;
    case 'export':  fragment = renderExport();  break;
    default:        fragment = renderFeature();
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
    if (confirm('Start over? Your current rubric will be cleared.')) reset();
  });
}

wireGlobal();
render();
