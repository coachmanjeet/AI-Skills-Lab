// ============================================================================
//  ci-scoring-builder.js — 5-stage flow for Exercise 4.
//
//  Stages: Package → Triggers → Thresholds → Tiering → Export.
//  State persists to localStorage.
//  All DOM via createElement + textContent — never innerHTML.
// ============================================================================

const CI_STORAGE_KEY = 'ai-evals-tutor:ci-scoring:v1';

const TRIGGERS = [
  { id: 'pr',      label: 'On every PR',           desc: 'Fastest signal — ship-blocking only.' },
  { id: 'merge',   label: 'On merge to main',      desc: 'Extra confidence before ship.' },
  { id: 'nightly', label: 'Nightly',               desc: 'Broader coverage — slower, non-blocking.' },
  { id: 'weekly',  label: 'Weekly',                desc: 'Full/expensive suite (LLM-judge, red-team).' },
  { id: 'release', label: 'Release-gate (manual)', desc: 'Human sign-off before promoting to prod.' },
];

const TIERS = [
  { id: 'blocking',  label: 'Ship-blocking',  desc: 'Fails the build. Must pass on every PR.' },
  { id: 'nightly',   label: 'Nightly',        desc: 'Runs daily. Regression alarm; not build-fatal.' },
  { id: 'weekly',    label: 'Weekly',         desc: 'Slow / expensive. Trend + capability watch.' },
  { id: 'aspirational', label: 'Aspirational', desc: 'Watch only. Not tied to release gates.' },
];

const STAGES = [
  { id: 'package',   num: '01', label: 'Package' },
  { id: 'triggers',  num: '02', label: 'Triggers' },
  { id: 'thresholds', num: '03', label: 'Thresholds' },
  { id: 'tiering',   num: '04', label: 'Tiering' },
  { id: 'export',    num: '05', label: 'Export' },
];

const DEFAULT_STATE = {
  stageId: 'package',
  pkg: { name: '', ownerTeam: '', dashboardUrl: '' },
  evals: [],   // [{id, name, kind, sampleCount}]
  triggers: [], // trigger ids
  thresholds: { pass: 90, warn: 80, sampleFloor: 50, judgeAgreement: 85 },
  tiering: {}, // { evalId: tierId }
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
    const raw = localStorage.getItem(CI_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch { return structuredClone(DEFAULT_STATE); }
}

function save() {
  try {
    localStorage.setItem(CI_STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch (err) { console.warn('[ci-scoring] save failed', err); }
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
  localStorage.removeItem(CI_STORAGE_KEY);
  render();
}

function currentIndex() { return STAGES.findIndex(s => s.id === state.stageId); }

function goto(stageId) {
  state.stageId = stageId; save(); render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function newEvalId() {
  let n = 1;
  const seen = new Set(state.evals.map(e => e.id));
  while (seen.has(`e${n}`)) n++;
  return `e${n}`;
}

function isStageComplete(stageId) {
  switch (stageId) {
    case 'package':
      return state.pkg.name.trim().length > 2
          && state.evals.length >= 1
          && state.evals.every(e => e.name.trim().length > 0);
    case 'triggers':   return state.triggers.length >= 1;
    case 'thresholds': return true;
    case 'tiering':    return state.evals.length > 0 && state.evals.every(e => !!state.tiering[e.id]);
    case 'export':     return true;
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

function renderPackage() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 01 · Package'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Define your eval package.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'A package is a named bundle of evals that ships together. It has one owning team, one dashboard, and one set of thresholds.'));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Package name'),
    el('input', {
      class: 'rb-input', type: 'text',
      placeholder: 'e.g., refund-agent-evals',
      value: state.pkg.name,
      oninput: (e) => { state.pkg.name = e.target.value; save(); renderStepper(); renderNav(); },
    }),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Owning team'),
    el('input', {
      class: 'rb-input', type: 'text',
      placeholder: 'e.g., @refund-team',
      value: state.pkg.ownerTeam,
      oninput: (e) => { state.pkg.ownerTeam = e.target.value; save(); },
    }),
  ]));

  wrap.appendChild(el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label' }, 'Dashboard URL (optional)'),
    el('input', {
      class: 'rb-input', type: 'text',
      placeholder: 'e.g., https://braintrust.example.com/projects/refund-agent',
      value: state.pkg.dashboardUrl,
      oninput: (e) => { state.pkg.dashboardUrl = e.target.value; save(); },
    }),
  ]));

  wrap.appendChild(el('div', { class: 'rb-counter' }, [
    document.createTextNode('Evals in package: '),
    el('strong', {}, `${state.evals.length} (min 1)`),
  ]));

  const list = el('div', { class: 'ci-eval-list' });
  state.evals.forEach((e, i) => {
    const card = el('div', { class: 'rb-trace-block' });
    card.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, e.name || '(unnamed eval)'),
      el('span', { class: 'rb-trace-block__category' }, e.kind),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Eval name'),
      el('input', {
        class: 'rb-input', type: 'text',
        placeholder: 'e.g., refund-flow.email-fired.trace-code',
        value: e.name,
        oninput: (ev) => { e.name = ev.target.value; save(); renderStepper(); renderNav(); },
      }),
      el('div', { class: 'rb-help' }, 'Trace-code style: <flow>.<check>.<grader-kind>'),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Grader kind'),
      (() => {
        const row = el('div', { class: 'rb-scorer-choices' });
        [
          { id: 'code',   label: 'Code' },
          { id: 'judge',  label: 'LLM-judge' },
          { id: 'human',  label: 'Human' },
          { id: 'hybrid', label: 'Hybrid' },
        ].forEach(k => {
          const btn = el('button', {
            class: `rb-scorer-btn ${e.kind === k.id ? 'is-selected' : ''}`.trim(),
            type: 'button',
          }, k.label);
          btn.addEventListener('click', () => { e.kind = k.id; save(); render(); });
          row.appendChild(btn);
        });
        return row;
      })(),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Sample count'),
      el('input', {
        class: 'rb-input', type: 'number', min: '0',
        value: String(e.sampleCount),
        oninput: (ev) => { e.sampleCount = Number(ev.target.value) || 0; save(); },
      }),
    ]));

    const rm = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, 'Remove eval');
    rm.addEventListener('click', () => {
      state.evals = state.evals.filter(x => x.id !== e.id);
      delete state.tiering[e.id];
      save(); render();
    });
    card.appendChild(rm);
    list.appendChild(card);
  });
  wrap.appendChild(list);

  const addBtn = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, '+ Add eval');
  addBtn.addEventListener('click', () => {
    state.evals.push({ id: newEvalId(), name: '', kind: 'code', sampleCount: 50 });
    save(); render();
  });
  wrap.appendChild(addBtn);
  return wrap;
}

function renderTriggers() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 02 · Triggers'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'When should CI run this package?'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Pick every trigger that fits. You’ll assign specific evals to each trigger via tiers in Step 04.'));

  const grid = el('div', { class: 'rb-feature-grid' });
  TRIGGERS.forEach(t => {
    const isSelected = state.triggers.includes(t.id);
    const card = el('button', {
      class: `rb-feature-card ${isSelected ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, [
      el('div', { class: 'rb-feature-card__title' }, t.label),
      el('div', { class: 'rb-feature-card__desc' }, t.desc),
    ]);
    card.addEventListener('click', () => {
      if (isSelected) state.triggers = state.triggers.filter(x => x !== t.id);
      else state.triggers.push(t.id);
      save(); render();
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderThresholds() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 03 · Thresholds'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'What counts as pass / warn / fail?'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Set once per package. Individual evals inherit these unless overridden.'));

  wrap.appendChild(thresholdField('Pass threshold (%)', 'th-pass', 'pass',
    'Minimum score for a green build. Common: 90.'));
  wrap.appendChild(thresholdField('Warn threshold (%)', 'th-warn', 'warn',
    'Below pass but not failing. Team gets an alert. Common: 80.'));
  wrap.appendChild(thresholdField('Minimum samples per eval', 'th-floor', 'sampleFloor',
    'A "green" score on 5 samples doesn’t mean much. Common floor: 50.'));
  wrap.appendChild(thresholdField('Judge alignment TPR/TNR (%)', 'th-judge', 'judgeAgreement',
    'For LLM-judge graders: floor for judge/human agreement before you trust the score. Common: 85.'));

  return wrap;
}

function thresholdField(label, id, key, help) {
  return el('div', { class: 'rb-trace-block__field' }, [
    el('label', { class: 'rb-label', for: id }, label),
    el('input', {
      class: 'rb-input', id, type: 'number', min: '0', max: '100',
      value: String(state.thresholds[key]),
      oninput: (e) => { state.thresholds[key] = Number(e.target.value) || 0; save(); },
    }),
    el('div', { class: 'rb-help' }, help),
  ]);
}

function renderTiering() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 04 · Tiering'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Assign each eval to a tier.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Ship-blocking = fast, deterministic, high-signal. Slow / expensive / noisy → nightly or weekly. Aspirational → watch only.'));

  if (!state.evals.length) {
    wrap.appendChild(el('div', { class: 'rb-header-summary' }, 'Add evals in Step 01 first.'));
    return wrap;
  }

  state.evals.forEach((e, i) => {
    const card = el('div', { class: 'rb-trace-block' });
    card.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, e.name || '(unnamed eval)'),
      el('span', { class: 'rb-trace-block__category' }, e.kind),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Tier'),
      (() => {
        const row = el('div', { class: 'rb-scorer-choices' });
        TIERS.forEach(tier => {
          const btn = el('button', {
            class: `rb-scorer-btn ${state.tiering[e.id] === tier.id ? 'is-selected' : ''}`.trim(),
            type: 'button', title: tier.desc,
          }, tier.label);
          btn.addEventListener('click', () => { state.tiering[e.id] = tier.id; save(); render(); });
          row.appendChild(btn);
        });
        return row;
      })(),
    ]));

    const suggestion = suggestTier(e);
    if (suggestion) {
      card.appendChild(el('div', { class: 'rb-help' }, suggestion));
    }
    wrap.appendChild(card);
  });
  return wrap;
}

function suggestTier(e) {
  if (e.kind === 'code' && e.sampleCount >= 20) return 'Suggested: Ship-blocking — code graders are fast + deterministic.';
  if (e.kind === 'human') return 'Suggested: Weekly or Aspirational — humans don’t run per-PR.';
  if (e.kind === 'judge' && e.sampleCount >= 50) return 'Suggested: Nightly — LLM-judge cost adds up on every PR.';
  return '';
}

function renderExport() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 05 · Export'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Your CI package.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Two artifacts: a package spec (JSON) + a workflow YAML skeleton. Wire the YAML into GitHub Actions or your CI of choice.'));

  const spec = buildSpec();
  const jsonText = JSON.stringify(spec, null, 2);
  const yamlText = specToYaml(spec);
  const mdText = specToMarkdown(spec);

  const grid = el('div', { class: 'rb-export-grid' });
  grid.appendChild(makeExportCard('Package spec (JSON)', jsonText));
  grid.appendChild(makeExportCard('CI workflow (YAML)', yamlText));
  grid.appendChild(makeExportCard('Docs (Markdown)', mdText));
  wrap.appendChild(grid);

  const actions = el('div', { class: 'rb-export-actions' });
  actions.appendChild(makeCopyButton('Copy JSON', jsonText));
  actions.appendChild(makeCopyButton('Copy YAML', yamlText));
  actions.appendChild(makeCopyButton('Copy Markdown', mdText));
  actions.appendChild(makeDownloadButton('Download .json', jsonText, `${spec.package.name || 'eval-package'}.json`, 'application/json'));
  actions.appendChild(makeDownloadButton('Download .yml', yamlText, `${spec.package.name || 'eval-package'}.yml`, 'text/yaml'));
  actions.appendChild(makeDownloadButton('Download .md', mdText, `${spec.package.name || 'eval-package'}.md`, 'text/markdown'));
  wrap.appendChild(actions);

  wrap.appendChild(el('div', { class: 'rb-done-card' }, [
    el('strong', {}, 'Ship it. '),
    document.createTextNode('Land the YAML in .github/workflows/. Post the dashboard link in your team channel. Then keep the ship-blocking tier boring — every yellow build erodes trust in the whole package.'),
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
  const evalsWithTier = state.evals.map(e => ({
    id: e.id, name: e.name, grader: e.kind, sample_count: e.sampleCount, tier: state.tiering[e.id] || '',
  }));
  const byTier = {};
  TIERS.forEach(t => { byTier[t.id] = evalsWithTier.filter(e => e.tier === t.id).map(e => e.name); });
  return {
    package: { ...state.pkg },
    triggers: state.triggers.map(t => TRIGGERS.find(x => x.id === t)?.label || t),
    thresholds: { ...state.thresholds },
    evals: evalsWithTier,
    byTier,
  };
}

function specToYaml(spec) {
  const lines = [];
  lines.push(`name: ${spec.package.name || 'eval-package'}`);
  lines.push('on:');
  const t = spec.triggers.join(', ');
  if (state.triggers.includes('pr'))      lines.push('  pull_request: { branches: [main] }');
  if (state.triggers.includes('merge'))   lines.push('  push: { branches: [main] }');
  if (state.triggers.includes('nightly')) lines.push('  schedule: [{ cron: "0 4 * * *" }]');
  if (state.triggers.includes('weekly'))  lines.push('  schedule: [{ cron: "0 6 * * 1" }]');
  if (state.triggers.includes('release')) lines.push('  workflow_dispatch: {}');
  lines.push('jobs:');
  TIERS.forEach(tier => {
    const names = spec.byTier[tier.id] || [];
    if (!names.length) return;
    lines.push(`  ${tier.id}:`);
    lines.push(`    runs-on: ubuntu-latest`);
    lines.push(`    steps:`);
    lines.push(`      - uses: actions/checkout@v4`);
    lines.push(`      - name: Run ${tier.label} evals`);
    lines.push(`        run: |`);
    names.forEach(n => lines.push(`          eval-cli run ${n}`));
    lines.push(`        env:`);
    lines.push(`          PASS_THRESHOLD: ${spec.thresholds.pass}`);
    lines.push(`          WARN_THRESHOLD: ${spec.thresholds.warn}`);
    lines.push(`          SAMPLE_FLOOR: ${spec.thresholds.sampleFloor}`);
    if (spec.evals.some(e => e.grader === 'judge' && e.tier === tier.id)) {
      lines.push(`          JUDGE_AGREEMENT_MIN: ${spec.thresholds.judgeAgreement}`);
    }
    lines.push(`        continue-on-error: ${tier.id !== 'blocking'}`);
  });
  lines.push(`# Triggers selected: ${t || '(none)'}`);
  return lines.join('\n');
}

function specToMarkdown(spec) {
  const lines = [];
  lines.push(`# CI eval package — ${spec.package.name || '(unnamed)'}`);
  lines.push('');
  if (spec.package.ownerTeam)   lines.push(`**Owner:** ${cell(spec.package.ownerTeam)}`);
  if (spec.package.dashboardUrl) lines.push(`**Dashboard:** ${cell(spec.package.dashboardUrl)}`);
  lines.push(''); lines.push('## Triggers');
  lines.push(''); spec.triggers.forEach(t => lines.push(`- ${t}`));
  lines.push(''); lines.push('## Thresholds');
  lines.push('');
  lines.push(`- Pass: **${spec.thresholds.pass}%**`);
  lines.push(`- Warn: **${spec.thresholds.warn}%**`);
  lines.push(`- Min samples: **${spec.thresholds.sampleFloor}**`);
  lines.push(`- Judge alignment (TPR/TNR): **${spec.thresholds.judgeAgreement}%**`);
  lines.push(''); lines.push('## Tiered evals');
  TIERS.forEach(tier => {
    const evalsInTier = spec.evals.filter(e => e.tier === tier.id);
    if (!evalsInTier.length) return;
    lines.push(''); lines.push(`### ${tier.label}`);
    lines.push(''); lines.push('| Eval | Grader | Samples |');
    lines.push('| --- | --- | --- |');
    evalsInTier.forEach(e => {
      lines.push(`| \`${cell(e.name)}\` | ${cell(e.grader)} | ${e.sample_count} |`);
    });
  });
  return lines.join('\n');
}

function cell(s) { return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }

// ---------------------------------------------------------------------------
//  Side panel
// ---------------------------------------------------------------------------

function renderSide() {
  const mount = document.querySelector('[data-role="side-mount"]');
  if (!mount) return;
  clear(mount);
  mount.appendChild(el('div', { class: 'rb-side__eyebrow' }, 'Guide'));

  switch (state.stageId) {
    case 'package':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'One owning team, always'));
      mount.appendChild(el('p', {}, 'If two teams share a package, no one owns the failures. Pick the smallest team that can act on a red build.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' }, '"refund-agent-evals" → owned by @refund-team. Not "the-whole-agent-eval-package".'));
      break;
    case 'triggers':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Ship-blocking = fast + trusted'));
      mount.appendChild(el('p', {}, 'Every trigger you turn on must earn its cost. On every PR is expensive — reserve it for evals that pay for themselves.'));
      break;
    case 'thresholds':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Rules of thumb'),
      );
      mount.appendChild(el('p', {}, 'Pass 90 / Warn 80 for code graders. LLM-judge requires alignment ≥ 85% TPR & TNR — below that, don’t block on the number.'));
      break;
    case 'tiering':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Move noise out of blocking'));
      mount.appendChild(el('p', {}, 'A flappy blocking eval means the team learns to hit "rerun." Move noisy evals to nightly and fix them there.'));
      break;
    case 'export':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Wire it in'));
      mount.appendChild(el('p', {}, 'Land the YAML in .github/workflows/. Post the dashboard in your team channel. Keep ship-blocking boring.'));
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
    case 'package':    return 'Name the package (3+ chars) and add at least one named eval.';
    case 'triggers':   return 'Pick at least one CI trigger.';
    case 'tiering':    return 'Every eval needs a tier.';
    default: return '';
  }
}

function renderStage() {
  const mount = document.querySelector('[data-role="stage-mount"]');
  if (!mount) return;
  clear(mount);
  let fragment;
  switch (state.stageId) {
    case 'package':    fragment = renderPackage();    break;
    case 'triggers':   fragment = renderTriggers();   break;
    case 'thresholds': fragment = renderThresholds(); break;
    case 'tiering':    fragment = renderTiering();    break;
    case 'export':     fragment = renderExport();     break;
    default:           fragment = renderPackage();
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
    if (confirm('Start over? Your current CI package config will be cleared.')) reset();
  });
}

wireGlobal();
render();
