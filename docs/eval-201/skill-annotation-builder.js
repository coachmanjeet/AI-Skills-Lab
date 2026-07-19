// ============================================================================
//  skill-annotation-builder.js — 5-stage flow for Exercise 1.
//
//  Stages: Skill → Traces (add / annotate) → Codes (cluster) → Prioritize → Export.
//  State persists to localStorage.
//  All DOM via createElement + textContent — never innerHTML.
// ============================================================================

const SA_STORAGE_KEY = 'ai-evals-tutor:skill-annotation:v1';

const SKILL_PRESETS = [
  { id: 'process-refund',  title: 'process_refund',   desc: 'Issues a refund given order + amount. Tool call with typed args.' },
  { id: 'lookup-policy',   title: 'lookup_policy',    desc: 'RAG skill — retrieves policy passages and summarizes.' },
  { id: 'book-slot',       title: 'book_slot',        desc: 'Reserves a calendar slot across providers.' },
  { id: 'verify-identity', title: 'verify_identity',  desc: 'MCP — validates a caller against known identifiers.' },
];

const STAGES = [
  { id: 'skill',      num: '01', label: 'Skill' },
  { id: 'traces',     num: '02', label: 'Annotate traces' },
  { id: 'codes',      num: '03', label: 'Cluster into codes' },
  { id: 'prioritize', num: '04', label: 'Prioritize' },
  { id: 'export',     num: '05', label: 'Export' },
];

const DEFAULT_STATE = {
  stageId: 'skill',
  skill: { presetId: null, name: '', desc: '' },
  traces: [],       // [{ id, snippet, note, code }]
  codes: [],        // [{ id, name, priority }]  priority: 'now' | 'later' | 'skip'
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
    const raw = localStorage.getItem(SA_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch { return structuredClone(DEFAULT_STATE); }
}

function save() {
  try {
    localStorage.setItem(SA_STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch (err) { console.warn('[skill-annotation] save failed', err); }
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
  localStorage.removeItem(SA_STORAGE_KEY);
  render();
}

function skillTitle() {
  if (state.skill.presetId) {
    const p = SKILL_PRESETS.find(x => x.id === state.skill.presetId);
    return p ? p.title : '';
  }
  return state.skill.name || '';
}

function currentIndex() { return STAGES.findIndex(s => s.id === state.stageId); }

function goto(stageId) {
  state.stageId = stageId; save(); render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function newId() {
  let n = 1;
  const existing = new Set([...state.traces.map(t => t.id), ...state.codes.map(c => c.id)]);
  while (existing.has(`n${n}`)) n++;
  return `n${n}`;
}

function isStageComplete(stageId) {
  switch (stageId) {
    case 'skill':
      if (state.skill.presetId) return true;
      return state.skill.name.trim().length > 2;
    case 'traces':
      return state.traces.length >= 3 && state.traces.every(t => t.note.trim().length > 0);
    case 'codes':
      return state.codes.length >= 1 && state.codes.every(c => c.name.trim().length > 0);
    case 'prioritize':
      return state.codes.length >= 1 && state.codes.every(c => c.priority);
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
//  Stage renderers
// ---------------------------------------------------------------------------

function renderSkill() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 01 · Skill'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Pick the skill you’re annotating.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Every reusable skill / tool / MCP needs its own eval. Pick one skill you’d improve if you had one week — the top-called or top-complained-about one.'));

  const grid = el('div', { class: 'rb-feature-grid' });
  SKILL_PRESETS.forEach(p => {
    const isSelected = state.skill.presetId === p.id;
    const card = el('button', {
      class: `rb-feature-card ${isSelected ? 'is-selected' : ''}`.trim(),
      type: 'button',
    }, [
      el('div', { class: 'rb-feature-card__title' }, p.title),
      el('div', { class: 'rb-feature-card__desc' }, p.desc),
    ]);
    card.addEventListener('click', () => {
      state.skill.presetId = p.id;
      state.skill.name = ''; state.skill.desc = '';
      save(); render();
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  wrap.appendChild(el('div', { class: 'rb-feature-custom' }, [
    el('label', { class: 'rb-label', for: 'sa-custom-name' }, 'Or name your own skill'),
    el('input', {
      class: 'rb-input', id: 'sa-custom-name', type: 'text',
      placeholder: 'e.g., merge_patient_record',
      value: state.skill.name,
      oninput: (e) => {
        state.skill.name = e.target.value;
        state.skill.presetId = null;
        save(); renderStepper(); renderNav();
      },
    }),
    el('div', { style: 'height:8px' }),
    el('textarea', {
      class: 'rb-textarea',
      placeholder: 'One sentence: what does the skill do, and what does its input/output look like?',
      oninput: (e) => {
        state.skill.desc = e.target.value;
        state.skill.presetId = null;
        save();
      },
    }, state.skill.desc),
    el('div', { class: 'rb-help' }, 'Custom skill? Fill in a name (3+ chars) to enable Next.'),
  ]));
  return wrap;
}

function renderTraces() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 02 · Annotate traces'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Paste 3–20 real skill invocations.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'For each trace: paste the input + output (or a paraphrase), then note free-form what went right or wrong. This is exactly what the annotation loop looks like in a Braintrust / LangSmith / Langfuse UI.'));

  wrap.appendChild(el('div', { class: 'rb-counter' }, [
    document.createTextNode('Traces annotated: '),
    el('strong', {}, `${state.traces.filter(t => t.note.trim()).length} / ${state.traces.length}  (min 3)`),
  ]));

  const list = el('div', { class: 'sa-trace-list' });
  state.traces.forEach((t, i) => {
    const card = el('div', { class: 'rb-trace-block' });
    card.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, `Trace ${t.id}`),
      el('button', {
        class: 'rb-btn rb-btn--ghost', type: 'button',
        style: 'margin-left:auto;font-size:11px;padding:4px 10px',
      }, ['Remove']),
    ]));
    // Wire remove button (last child of head)
    card.querySelector('.rb-trace-block__head button').addEventListener('click', () => {
      state.traces = state.traces.filter(x => x.id !== t.id);
      save(); render();
    });

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Trace snippet (input → output)'),
      el('textarea', {
        class: 'rb-textarea',
        placeholder: 'e.g., input: {"order_id":"A123","amount":80} → output: refund_id=r45, but no email sent',
        oninput: (e) => { t.snippet = e.target.value; save(); },
      }, t.snippet),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'What went right or wrong?'),
      el('textarea', {
        class: 'rb-textarea',
        placeholder: 'Free-form. e.g., "refund succeeded but confirmation email was silently skipped"',
        oninput: (e) => { t.note = e.target.value; save(); renderStepper(); renderNav(); },
      }, t.note),
    ]));

    card.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Tentative code (optional at this stage)'),
      el('input', {
        class: 'rb-input', type: 'text',
        placeholder: 'e.g., silent-side-effect-skip',
        value: t.code || '',
        oninput: (e) => { t.code = e.target.value; save(); },
      }),
      el('div', { class: 'rb-help' }, 'A short name for the failure. You’ll cluster in the next step.'),
    ]));

    list.appendChild(card);
  });
  wrap.appendChild(list);

  const addBtn = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, '+ Add trace');
  addBtn.addEventListener('click', () => {
    state.traces.push({ id: newId(), snippet: '', note: '', code: '' });
    save(); render();
  });
  wrap.appendChild(addBtn);
  return wrap;
}

function renderCodes() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 03 · Cluster into codes'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Group similar failure notes into named codes.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Aim for 3–5 codes. Frequency-sort them. The top code by frequency is your first eval target.'));

  // Suggestions: unique non-empty t.code values
  const suggested = Array.from(new Set(
    state.traces.map(t => (t.code || '').trim()).filter(Boolean)
  )).filter(name => !state.codes.some(c => c.name === name));

  if (suggested.length) {
    const box = el('div', { class: 'rb-header-summary' });
    box.appendChild(el('strong', {}, 'Suggested from Step 02: '));
    box.appendChild(document.createTextNode(' '));
    suggested.forEach((name, i) => {
      const chip = el('button', {
        class: 'rb-btn rb-btn--ghost', type: 'button',
        style: 'margin:2px 4px;font-size:12px;padding:4px 10px',
      }, `+ ${name}`);
      chip.addEventListener('click', () => {
        state.codes.push({ id: newId(), name, priority: '' });
        save(); render();
      });
      box.appendChild(chip);
    });
    wrap.appendChild(box);
  }

  const list = el('div', { class: 'sa-code-list' });
  state.codes.forEach((c, i) => {
    const freq = state.traces.filter(t => (t.code || '').trim() === c.name).length;
    const row = el('div', { class: 'rb-trace-block' });
    row.appendChild(el('div', { class: 'rb-trace-block__head' }, [
      el('span', { class: 'rb-trace-block__num' }, String(i + 1)),
      el('span', { class: 'rb-trace-block__label' }, c.name || '(unnamed code)'),
      el('span', { class: 'rb-trace-block__category' }, `${freq}/${state.traces.length}`),
    ]));

    row.appendChild(el('div', { class: 'rb-trace-block__field' }, [
      el('label', { class: 'rb-label' }, 'Code name'),
      el('input', {
        class: 'rb-input', type: 'text',
        placeholder: 'e.g., stale-source-cited',
        value: c.name,
        oninput: (e) => { c.name = e.target.value; save(); renderStepper(); renderNav(); },
      }),
      el('div', { class: 'rb-help' }, 'Short kebab-case name. Reused across traces to count frequency.'),
    ]));

    const rmBtn = el('button', { class: 'rb-btn rb-btn--ghost', type: 'button' }, 'Remove code');
    rmBtn.addEventListener('click', () => {
      state.codes = state.codes.filter(x => x.id !== c.id);
      save(); render();
    });
    row.appendChild(rmBtn);

    list.appendChild(row);
  });
  wrap.appendChild(list);

  const addBtn = el('button', { class: 'rb-btn rb-btn--primary', type: 'button' }, '+ Add code');
  addBtn.addEventListener('click', () => {
    state.codes.push({ id: newId(), name: '', priority: '' });
    save(); render();
  });
  wrap.appendChild(addBtn);
  return wrap;
}

function renderPrioritize() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 04 · Prioritize'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Frequency → priority.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Highest-frequency codes go into "now" (build a trace-code eval this week). Rare codes go into "later" or "skip". Don’t build evals for 1/N codes until 5/N codes are covered.'));

  const priorities = [
    { id: 'now',   label: 'Now'   },
    { id: 'later', label: 'Later' },
    { id: 'skip',  label: 'Skip'  },
  ];

  state.codes
    .map((c, i) => ({ c, freq: state.traces.filter(t => (t.code || '').trim() === c.name).length, i }))
    .sort((a, b) => b.freq - a.freq)
    .forEach(({ c, freq, i }) => {
      const row = el('div', { class: 'rb-trace-block' });
      row.appendChild(el('div', { class: 'rb-trace-block__head' }, [
        el('span', { class: 'rb-trace-block__num' }, String(freq)),
        el('span', { class: 'rb-trace-block__label' }, c.name || '(unnamed code)'),
        el('span', { class: 'rb-trace-block__category' }, `${freq}/${state.traces.length} traces`),
      ]));

      row.appendChild(el('div', { class: 'rb-trace-block__field' }, [
        el('label', { class: 'rb-label' }, 'Priority'),
        (() => {
          const rowChoices = el('div', { class: 'rb-scorer-choices' });
          priorities.forEach(p => {
            const btn = el('button', {
              class: `rb-scorer-btn ${c.priority === p.id ? 'is-selected' : ''}`.trim(),
              type: 'button',
            }, p.label);
            btn.addEventListener('click', () => {
              c.priority = p.id; save(); render();
            });
            rowChoices.appendChild(btn);
          });
          return rowChoices;
        })(),
      ]));

      wrap.appendChild(row);
    });

  if (!state.codes.length) {
    wrap.appendChild(el('div', { class: 'rb-header-summary' }, 'Add codes in Step 03 first.'));
  }
  return wrap;
}

function renderExport() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el('div', { class: 'rb-stage__eyebrow' }, 'Step 05 · Export'));
  wrap.appendChild(el('h2', { class: 'rb-stage__title' }, 'Your annotation report.'));
  wrap.appendChild(el('p', { class: 'rb-stage__lede' },
    'Everything you annotated — traces, clustered codes, priorities — packaged for handoff to engineering or a design partner.'));

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
  actions.appendChild(makeDownloadButton('Download .json', jsonText, 'skill-annotation.json', 'application/json'));
  actions.appendChild(makeDownloadButton('Download .md', mdText, 'skill-annotation.md', 'text/markdown'));
  wrap.appendChild(actions);

  wrap.appendChild(el('div', { class: 'rb-done-card' }, [
    el('strong', {}, 'Nice work. '),
    document.createTextNode('Take the top "Now" code and draft a trace-code eval for it in Exercise 2 (Rubric Builder). Then wire it into CI in Exercise 4.'),
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
  const freqByCode = new Map();
  state.codes.forEach(c => freqByCode.set(c.name, 0));
  state.traces.forEach(t => {
    const code = (t.code || '').trim();
    if (code && freqByCode.has(code)) freqByCode.set(code, freqByCode.get(code) + 1);
  });
  return {
    skill: {
      title: skillTitle(),
      description: state.skill.desc || '',
    },
    traces: state.traces.map(t => ({
      id: t.id, snippet: t.snippet, note: t.note, code: t.code || '',
    })),
    codes: state.codes
      .map(c => ({ name: c.name, frequency: freqByCode.get(c.name) || 0, priority: c.priority || '' }))
      .sort((a, b) => b.frequency - a.frequency),
  };
}

function specToMarkdown(spec) {
  const lines = [];
  lines.push(`# Skill annotation — ${spec.skill.title || '(unnamed skill)'}`);
  if (spec.skill.description) { lines.push(''); lines.push(spec.skill.description); }
  lines.push(''); lines.push('## Clustered codes');
  lines.push(''); lines.push('| Code | Frequency | Priority |');
  lines.push('| --- | --- | --- |');
  spec.codes.forEach(c => {
    lines.push(`| ${cell(c.name)} | ${c.frequency}/${spec.traces.length} | ${cell(c.priority)} |`);
  });
  lines.push(''); lines.push('## Annotated traces');
  spec.traces.forEach((t, i) => {
    lines.push(''); lines.push(`### Trace ${i + 1} — ${cell(t.id)}`);
    if (t.snippet) { lines.push(''); lines.push('```'); lines.push(t.snippet); lines.push('```'); }
    if (t.note)    { lines.push(''); lines.push(`**Note:** ${cell(t.note)}`); }
    if (t.code)    { lines.push(''); lines.push(`**Code:** \`${cell(t.code)}\``); }
  });
  lines.push(''); lines.push('## Next actions');
  const topNow = spec.codes.filter(c => c.priority === 'now').slice(0, 3);
  if (topNow.length) {
    topNow.forEach(c => lines.push(`- Build a trace-code eval for **${cell(c.name)}** this week.`));
  } else {
    lines.push('- Prioritize the top-frequency codes in Step 04.');
  }
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
  mount.appendChild(el('div', { class: 'rb-side__eyebrow' }, 'Example'));

  switch (state.stageId) {
    case 'skill':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'One skill, not one product'));
      mount.appendChild(el('p', {}, 'Skill-level evals catch failures that end-to-end evals hide. Pick the top-called or top-complained-about skill.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' }, '"process_refund — issues a refund given order + amount." Not "the whole refund flow."'));
      break;
    case 'traces':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'How workshop teams annotate'));
      mount.appendChild(el('p', {}, 'Read each trace once. Note free-form what happened. Don’t force a code yet — the words that keep coming up become the codes in Step 03.'));
      mount.appendChild(el('div', { class: 'rb-side__block' }, [
        el('div', { class: 'rb-side__block-title' }, 'Rule of thumb'),
        el('p', { style: 'margin:0' }, '8–20 traces is usually enough to find the top codes. Frequency is the signal, not depth.'),
      ]));
      break;
    case 'codes':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Cluster, don’t taxonomize'));
      mount.appendChild(el('p', {}, 'Merge similar notes under one name. Aim for 3–5 total. Anything with 1 trace is probably a merge candidate.'));
      mount.appendChild(el('div', { class: 'rb-side__quote' }, '"Silent side-effect skip" caught 5/12 traces — that’s your first eval.'));
      break;
    case 'prioritize':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Frequency wins'));
      mount.appendChild(el('p', {}, 'Highest-frequency code goes to "Now." Everything else waits. Don’t build evals for 1/N codes until 5/N codes are covered.'));
      break;
    case 'export':
      mount.appendChild(el('h3', { class: 'rb-side__title' }, 'Now write a rubric'));
      mount.appendChild(el('p', {}, 'Take the top "Now" code back to Exercise 2 (Rubric Builder). Draft the binary question + judge prompt. Ship it in CI.'));
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
    case 'skill':      return 'Pick a preset or name a custom skill (3+ chars) to continue.';
    case 'traces':     return `Add at least ${Math.max(0, 3 - state.traces.length)} more trace${state.traces.length === 2 ? '' : 's'} with a note.`;
    case 'codes':      return 'Add at least one named code to continue.';
    case 'prioritize': return 'Every code needs a priority (Now / Later / Skip).';
    default: return '';
  }
}

function renderStage() {
  const mount = document.querySelector('[data-role="stage-mount"]');
  if (!mount) return;
  clear(mount);
  let fragment;
  switch (state.stageId) {
    case 'skill':      fragment = renderSkill();      break;
    case 'traces':     fragment = renderTraces();     break;
    case 'codes':      fragment = renderCodes();      break;
    case 'prioritize': fragment = renderPrioritize(); break;
    case 'export':     fragment = renderExport();     break;
    default:           fragment = renderSkill();
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
    if (confirm('Start over? Your current annotations will be cleared.')) reset();
  });
}

wireGlobal();
render();
