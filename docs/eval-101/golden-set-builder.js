// ============================================================================
//  golden-set-builder.js — 5-stage flow for Eval 101 · Exercise 2.
//
//  Stages: Scope → Sources → Samples → Version → Export.
//  State persists to localStorage.
//  All DOM via createElement + textContent — never innerHTML.
// ============================================================================

const GS_STORAGE_KEY = 'ai-evals-tutor:golden-set:v1';

const STAGES = [
  { id: 'scope',    num: '01', label: 'Scope' },
  { id: 'sources',  num: '02', label: 'Sources' },
  { id: 'samples',  num: '03', label: 'Samples' },
  { id: 'version',  num: '04', label: 'Version' },
  { id: 'export',   num: '05', label: 'Export' },
];

const SOURCE_KINDS = [
  { id: 'prod',       label: 'Prod logs',       desc: 'Best signal. Needs redaction of PII before it hits git.' },
  { id: 'synthetic',  label: 'Synthetic',       desc: 'You generate them. Covers edges you can imagine but haven\'t seen.' },
  { id: 'incident',   label: 'Prior incidents', desc: 'Every historical prod bug becomes one permanent fixture row.' },
];

const DEFAULT_STATE = {
  stageId: 'scope',
  scope: { feature: '', userGoal: '', outOfScope: '' },
  sources: { prod: false, synthetic: false, incident: false, notes: '' },
  samples: [],  // [{ id, source, input, expected, why }]
  version: { name: 'v0.1.0', repoPath: 'evals/golden-set.json', reviewer: '', releaseTag: '' },
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
    const raw = localStorage.getItem(GS_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch { return structuredClone(DEFAULT_STATE); }
}

function save() {
  try {
    localStorage.setItem(GS_STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch (err) { console.warn('[golden-set] save failed', err); }
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
  localStorage.removeItem(GS_STORAGE_KEY);
  render();
}

function currentIndex() { return STAGES.findIndex(s => s.id === state.stageId); }

function goto(stageId) {
  state.stageId = stageId; save(); render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function newSampleId() {
  let n = 1;
  const seen = new Set(state.samples.map(s => s.id));
  while (seen.has(`s${n}`)) n++;
  return `s${n}`;
}

function isStageComplete(stageId) {
  switch (stageId) {
    case 'scope':
      return state.scope.feature.trim().length > 2 && state.scope.userGoal.trim().length > 3;
    case 'sources':
      return state.sources.prod || state.sources.synthetic || state.sources.incident;
    case 'samples':
      return state.samples.length >= 10
          && state.samples.every(s => s.input.trim().length > 0 && s.expected.trim().length > 0 && s.why.trim().length > 0);
    case 'version':
      return state.version.name.trim().length > 0 && state.version.repoPath.trim().length > 0;
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

function renderScope() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 01 · Scope'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Narrow the scope until you can actually finish.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'One feature. One user goal. Anything you can\'t describe in a sentence is out of scope.'));

  wrap.appendChild(fieldRow('Feature', 'gs-feature', 'input',
    { placeholder: 'e.g., refund-agent', value: state.scope.feature },
    (v) => { state.scope.feature = v; save(); renderStepper(); renderNav(); }));
  wrap.appendChild(fieldRow('User goal (one sentence)', 'gs-goal', 'textarea',
    { placeholder: 'e.g., "Return an item and receive a refund confirmation."', value: state.scope.userGoal },
    (v) => { state.scope.userGoal = v; save(); renderStepper(); renderNav(); }));
  wrap.appendChild(fieldRow('Explicitly out of scope (optional)', 'gs-oos', 'textarea',
    { placeholder: 'e.g., "Warranty claims, gift cards, subscription cancellation."', value: state.scope.outOfScope },
    (v) => { state.scope.outOfScope = v; save(); }));

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

function renderSources() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 02 · Sources'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Where will your samples come from?'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Pick at least one. A golden set that draws from all three is stronger than one that draws from only synthetic.'));

  const grid = el('div', { class: 'rb-feature-grid' });
  SOURCE_KINDS.forEach(s => {
    const isSel = !!state.sources[s.id];
    const card = el('button', {
      class: `rb-feature-card ${isSel ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, [
      el('div', { class: 'rb-feature-card__title' }, s.label),
      el('div', { class: 'rb-feature-card__desc' }, s.desc),
    ]);
    card.addEventListener('click', () => { state.sources[s.id] = !isSel; save(); render(); });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Notes (optional)'),
    el('textarea', {
      class: 'rb-textarea',
      placeholder: 'e.g., "Prod logs pulled from datadog; PII-scrubbed via redact-cli. Incidents from Q2 postmortem list."',
      oninput: (e) => { state.sources.notes = e.target.value; save(); },
    }, state.sources.notes),
  ]));
  return wrap;
}

function renderSamples() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 03 · Samples'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Add 10–30 samples.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Every row needs input + expected behavior + a reason. Rows without a reason drift into deletion the next time someone "cleans up."'));

  wrap.appendChild(el('div', { class: 'rb-counter' }, [
    document.createTextNode('Samples: '),
    el('strong', {}, `${state.samples.length} (min 10, target 15–30)`),
  ]));

  const enabledSources = SOURCE_KINDS.filter(s => state.sources[s.id]).map(s => s.id);
  if (!enabledSources.length) {
    wrap.appendChild(el('div', { class: 'rb-header-summary' }, 'Enable at least one source in Step 02 first.'));
    return wrap;
  }

  state.samples.forEach((s, i) => {
    const card = el('div', { class: 'rb-trace-block' });
    card.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, s.id),
      el('span', { class: 'rb-trace-block__category' }, s.source || 'unassigned'),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Source'),
      (() => {
        const row = el('div', { class: 'rb-scorer-choices' });
        enabledSources.forEach(id => {
          const label = SOURCE_KINDS.find(x => x.id === id).label;
          const btn = el('button', {
            class: `rb-scorer-btn ${s.source === id ? 'is-selected' : ''}`.trim(),
            type: 'button',
          }, label);
          btn.addEventListener('click', () => { s.source = id; save(); render(); });
          row.appendChild(btn);
        });
        return row;
      })(),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Input'),
      el('textarea', {
        class: 'rb-textarea',
        placeholder: 'What the user says / feeds the AI.',
        oninput: (e) => { s.input = e.target.value; save(); renderStepper(); renderNav(); },
      }, s.input),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Expected behavior'),
      el('textarea', {
        class: 'rb-textarea',
        placeholder: 'What the AI should do — behavior, not exact text.',
        oninput: (e) => { s.expected = e.target.value; save(); renderStepper(); renderNav(); },
      }, s.expected),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Why this row exists'),
      el('input', {
        class: 'rb-input', type: 'text',
        placeholder: 'e.g., "Regression from Q2 incident — refund without identity check."',
        value: s.why,
        oninput: (e) => { s.why = e.target.value; save(); renderStepper(); renderNav(); },
      }),
      el('div', { class: 'rb-help' }, 'If you can\'t explain why, the row doesn\'t belong.'),
    ]));

    const rm = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, 'Remove');
    rm.addEventListener('click', () => {
      state.samples = state.samples.filter(x => x.id !== s.id);
      save(); render();
    });
    card.appendChild(rm);
    wrap.appendChild(card);
  });

  const addBtn = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, '+ Add sample');
  addBtn.addEventListener('click', () => {
    state.samples.push({ id: newSampleId(), source: enabledSources[0] || '', input: '', expected: '', why: '' });
    save(); render();
  });
  wrap.appendChild(addBtn);
  return wrap;
}

function renderVersion() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 04 · Version'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Version it. Commit it. Review it in PRs.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Fixtures drift the same way code does. Same repo, same review rigor, same git blame.'));

  wrap.appendChild(fieldRow('Fixture version', 'gs-ver', 'input',
    { placeholder: 'e.g., v0.1.0', value: state.version.name },
    (v) => { state.version.name = v; save(); renderStepper(); renderNav(); }));
  wrap.appendChild(fieldRow('Repo path', 'gs-path', 'input',
    { placeholder: 'e.g., evals/golden-set.json', value: state.version.repoPath },
    (v) => { state.version.repoPath = v; save(); renderStepper(); renderNav(); }));
  wrap.appendChild(fieldRow('Reviewer (optional)', 'gs-rev', 'input',
    { placeholder: 'e.g., @jamie', value: state.version.reviewer },
    (v) => { state.version.reviewer = v; save(); }));
  wrap.appendChild(fieldRow('Release tag it ships with (optional)', 'gs-tag', 'input',
    { placeholder: 'e.g., 4.2.0', value: state.version.releaseTag },
    (v) => { state.version.releaseTag = v; save(); }));

  return wrap;
}

function renderExport() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 05 · Export'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Your golden set.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'JSON for the repo. Markdown for the PRD or PR description.'));

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
  actions.appendChild(makeDownloadButton('Download .json', jsonText, 'golden-set.json', 'application/json'));
  actions.appendChild(makeDownloadButton('Download .md', mdText, 'golden-set.md', 'text/markdown'));
  wrap.appendChild(actions);

  wrap.appendChild(el('div', { class: 'rb-done-card' }, [
    el('strong', {}, 'Nice work. '),
    document.createTextNode('Commit the JSON at the repo path above, open a PR, and get a reviewer. On the next incident, add one row and bump the version — that\'s how the fixture stays honest.'),
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
  const sources = SOURCE_KINDS.filter(s => state.sources[s.id]).map(s => s.label);
  return {
    feature: state.scope.feature,
    user_goal: state.scope.userGoal,
    out_of_scope: state.scope.outOfScope || null,
    sources,
    source_notes: state.sources.notes || null,
    version: { ...state.version },
    samples: state.samples.map((s, i) => ({
      id: s.id,
      index: i + 1,
      source: s.source,
      input: s.input,
      expected_behavior: s.expected,
      why: s.why,
    })),
  };
}

function specToMarkdown(spec) {
  const lines = [];
  lines.push(`# Golden set — ${spec.feature || '(unnamed feature)'} · ${spec.version.name}`);
  lines.push('');
  lines.push(`**User goal:** ${cell(spec.user_goal)}`);
  if (spec.out_of_scope) lines.push(`**Out of scope:** ${cell(spec.out_of_scope)}`);
  lines.push(`**Sources:** ${spec.sources.join(', ')}`);
  if (spec.source_notes) lines.push(`**Source notes:** ${cell(spec.source_notes)}`);
  lines.push(`**Repo:** \`${cell(spec.version.repoPath)}\``);
  if (spec.version.reviewer) lines.push(`**Reviewer:** ${cell(spec.version.reviewer)}`);
  if (spec.version.releaseTag) lines.push(`**Release:** ${cell(spec.version.releaseTag)}`);
  lines.push(''); lines.push(`## Samples (${spec.samples.length})`);
  lines.push(''); lines.push('| # | ID | Source | Input | Expected behavior | Why |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  spec.samples.forEach(s => {
    lines.push(`| ${s.index} | ${cell(s.id)} | ${cell(s.source)} | ${cell(s.input)} | ${cell(s.expected_behavior)} | ${cell(s.why)} |`);
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
    case 'scope':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'One feature at a time'));
      mount.appendChild(el('p', {}, 'A fixture that "covers everything" covers nothing well. Narrow scope, high sample density on that scope.'));
      break;
    case 'sources':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Three sources beat one'));
      mount.appendChild(el('p', {}, 'Prod logs = real distribution. Synthetic = imagined edges. Incidents = permanent memory of past failures.'));
      break;
    case 'samples':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Keep it small'));
      mount.appendChild(el('p', {}, '15–30 samples. Big fixtures encourage complacency ("we have 500 samples, we\'re covered"). Small fixtures force you to read every one.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' }, 'If you can\'t explain why a row exists, delete it.'));
      break;
    case 'version':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Same rigor as code'));
      mount.appendChild(el('p', {}, 'Git-versioned. PR-reviewed. Tagged on release. When a score moves, `git blame` tells you which sample changed.'));
      break;
    case 'export':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Ship it'));
      mount.appendChild(el('p', {}, 'Commit at the repo path. Get a reviewer. Bump the version any time you add or edit a row.'));
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
    case 'scope':   return 'Fill in the feature name and a one-sentence user goal.';
    case 'sources': return 'Pick at least one source (prod / synthetic / incident).';
    case 'samples': {
      const need = Math.max(0, 10 - state.samples.length);
      if (need > 0) return `Add ${need} more sample${need === 1 ? '' : 's'} (need 10 minimum).`;
      return 'Every sample needs input, expected behavior, and a reason.';
    }
    case 'version': return 'Fill in version name and repo path.';
    default: return '';
  }
}

function renderStage() {
  const mount = document.querySelector('[data-role="stage-mount"]');
  if (!mount) return;
  clear(mount);
  let fragment;
  switch (state.stageId) {
    case 'scope':   fragment = renderScope();   break;
    case 'sources': fragment = renderSources(); break;
    case 'samples': fragment = renderSamples(); break;
    case 'version': fragment = renderVersion(); break;
    case 'export':  fragment = renderExport();  break;
    default:        fragment = renderScope();
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
    if (confirm('Start over? Your current golden set will be cleared.')) reset();
  });
}

wireGlobal();
render();
