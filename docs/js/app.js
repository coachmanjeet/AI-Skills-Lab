// ============================================================================
//  app.js — page bootstrap + hash router.
//
//  Routes:
//    #/                          → landing (tile grid)
//    #/<track>/<mode>            → track page with sub-tab active
//      track: eval-101 | eval-201 | obs-101 | obs-201 | harness-101 | harness-201
//      mode:  learn  | practice | test
//
//  Content:
//    - Eval 101 · Learn:    all four labs + wrap-up (real).
//    - Eval 101 · Practice: the 6-stage authoring flow (real).
//    - Everything else:     "Coming next" placeholder card.
//
//  All DOM built with createElement + textContent (no innerHTML on data).
// ============================================================================

import { renderLab } from './lab-runner.js';
import { mountPassK } from './passk.js';
import { mountPractice } from './practice.js';

const LAB_IDS = ['lab-01', 'lab-02', 'lab-03', 'lab-04'];

const TRACKS = {
  'eval-101':    { number: '01', title: 'Eval 101',          accent: '#3b82f6', modes: { learn: 'real', practice: 'real', apply: 'real' } },
  'eval-201':    { number: '02', title: 'Eval 201',          accent: '#34d399', modes: { learn: 'real', practice: 'real', apply: 'real' } },
  'obs-101':     { number: '03', title: 'Observability 101', accent: '#d29922', modes: { learn: 'stub', practice: 'stub', apply: 'stub' } },
  'obs-201':     { number: '04', title: 'Observability 201', accent: '#bc8cff', modes: { learn: 'stub', practice: 'stub', apply: 'stub' } },
  'harness-101': { number: '05', title: 'Harness 101',       accent: '#f85149', modes: { learn: 'stub', practice: 'stub', apply: 'stub' } },
  'harness-201': { number: '06', title: 'Harness 201',       accent: '#22d3ee', modes: { learn: 'stub', practice: 'stub', apply: 'stub' } },
  'pm-agent-team': { number: '07', title: 'My PM Agent Team', accent: '#dc2626', modes: { learn: 'real', practice: 'real', apply: 'stub' } },
};

const MODES = ['learn', 'practice', 'apply'];

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

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


// ---------------------------------------------------------------------------
//  Boot. Wire the router FIRST so tile clicks always work — even if a
//  downstream mount throws. Then load data + mount Eval 101 content.
// ---------------------------------------------------------------------------
async function main() {
  // Router wiring (synchronous, unconditional)
  window.addEventListener('hashchange', route);
  wireTabClicks();
  route();

  // Content mounts (async, tolerant of individual failures)
  let labs = [], glossary = null, antipatterns = null, template = null, practiceExamples = null;
  try {
    [labs, glossary, antipatterns, template, practiceExamples] = await Promise.all([
      Promise.all(LAB_IDS.map(id => fetchJson(`./data/${id === 'lab-01' ? 'lab-01-model-safety' : id === 'lab-02' ? 'lab-02-conversational' : id === 'lab-03' ? 'lab-03-rag-faithfulness' : 'lab-04-coding-agent'}.json`))),
      fetchJson('./data/glossary.json'),
      fetchJson('./data/antipatterns.json'),
      fetchJson('./data/starter-template.json'),
      fetchJson('./data/practice-examples.json'),
    ]);
  } catch (err) {
    console.error('Data load failed:', err);
    return;
  }

  try {
    labs.forEach(lab => {
      const mount = document.querySelector(`[data-lab="${lab.id}"]`);
      if (mount) renderLab(mount, lab);
    });
    const passkCard = document.getElementById('passk-card');
    if (passkCard) mountPassK(passkCard);
    if (antipatterns) mountAntipatterns(document.querySelector('.js-antipatterns-grid'), antipatterns);
    const dl = document.querySelector('.js-download-template');
    if (dl && template) dl.addEventListener('click', () => downloadJson('starter-template.json', template));
  } catch (err) {
    console.error('Learn mount failed:', err);
  }

  try {
    const practiceMount = document.querySelector('.js-practice-mount');
    if (practiceMount && practiceExamples) await mountPractice(practiceMount, practiceExamples);
  } catch (err) {
    console.error('Practice mount failed:', err);
  }
}


// ---------------------------------------------------------------------------
//  Router — hides everything, then shows the right view/panel.
// ---------------------------------------------------------------------------
function route() {
  const parsed = parseHash();
  console.log('[router]', window.location.hash, '→', parsed);
  const { view, track, mode } = parsed;
  const landing = document.querySelector('[data-view="landing"]');
  const trackView = document.querySelector('[data-view="track"]');
  if (!landing || !trackView) {
    console.error('[router] view containers missing', { landing: !!landing, trackView: !!trackView });
    return;
  }

  if (view === 'landing') {
    landing.hidden = false; landing.style.display = '';
    trackView.hidden = true; trackView.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }

  landing.hidden = true; landing.style.display = 'none';
  trackView.hidden = false; trackView.style.display = '';

  const meta = TRACKS[track] || TRACKS['eval-101'];
  const modeKey = MODES.includes(mode) ? mode : 'learn';

  // Update track header
  document.querySelector('.js-track-title').textContent = meta.title;
  document.querySelector('.js-track-title').style.color = meta.accent;

  // Update sub-tab state — active + upstream stages marked completed.
  const modeOrder = ['learn', 'practice', 'apply'];
  const activeIdx = modeOrder.indexOf(modeKey);
  document.querySelectorAll('.track-nav__tab').forEach(btn => {
    const isActive = btn.dataset.mode === modeKey;
    const btnIdx = modeOrder.indexOf(btn.dataset.mode);
    btn.classList.toggle('is-active', isActive);
    btn.classList.toggle('is-completed', btnIdx > -1 && btnIdx < activeIdx);
    btn.style.setProperty('--accent', meta.accent);
  });
  document.querySelectorAll('.track-nav__arrow').forEach(a => {
    a.style.setProperty('--accent', meta.accent);
  });

  // Show the right panel
  const panels = document.querySelectorAll('.js-track-panel');
  const stubMount = document.querySelector('.js-track-stub') || createStubMount();
  panels.forEach(p => { p.hidden = true; p.style.display = 'none'; });
  stubMount.hidden = true; stubMount.style.display = 'none';

  const kind = meta.modes[modeKey] || 'stub';
  if (kind === 'real') {
    const panel = document.querySelector(`.js-track-panel[data-track="${track}"][data-mode="${modeKey}"]`);
    if (panel) {
      panel.hidden = false; panel.style.display = '';
    } else {
      showStub(stubMount, meta, modeKey);
    }
  } else {
    showStub(stubMount, meta, modeKey);
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
}

function parseHash() {
  const h = (window.location.hash || '').replace(/^#/, '');
  if (!h || h === '/' || h === '') return { view: 'landing' };
  const parts = h.split('/').filter(Boolean);
  const track = parts[0];
  const mode = parts[1] || 'learn';
  if (!TRACKS[track]) return { view: 'landing' };
  return { view: 'track', track, mode };
}

function wireTabClicks() {
  document.querySelectorAll('.track-nav__tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const { track } = parseHash();
      const mode = btn.dataset.mode;
      window.location.hash = `#/${track || 'eval-101'}/${mode}`;
    });
  });
}


// ---------------------------------------------------------------------------
//  Coming-soon stub for tracks/modes that don't have real content yet.
// ---------------------------------------------------------------------------
function createStubMount() {
  const stub = el('div', { class: 'track-stub js-track-stub', hidden: true });
  document.querySelector('.track__main').appendChild(stub);
  return stub;
}

function showStub(mount, trackMeta, mode) {
  while (mount.firstChild) mount.removeChild(mount.firstChild);
  mount.hidden = false; mount.style.display = '';
  const modeLabel = mode === 'learn' ? 'Learn' : mode === 'practice' ? 'Practice' : 'Apply';
  const isEval101 = trackMeta.title === 'Eval 101';
  const lede = isEval101
    ? `${trackMeta.title} · ${modeLabel} isn't built yet — it's on the roadmap. In the meantime, jump into Learn or Practice to keep going.`
    : `${trackMeta.title} isn't built yet — it's on the roadmap. In the meantime, the Eval 101 track (Learn + Practice) is a good place to start.`;
  mount.appendChild(el('div', { class: 'chapter' }, [
    el('div', { class: 'chapter__eyebrow' }, `${trackMeta.title} · ${modeLabel}`),
    el('h2', { class: 'chapter__title' }, 'Not built yet.'),
    el('p', { class: 'chapter__lede' }, lede),
    el('a', { class: 'stub-back-link', href: '#/eval-101/learn' }, '→ Head to Eval 101 · Learn'),
  ]));
}


// ---------------------------------------------------------------------------
//  Anti-patterns — 4 cards
// ---------------------------------------------------------------------------
function mountAntipatterns(root, data) {
  if (!root) return;
  data.items.forEach(ap => {
    const card = el('div', { class: 'antipattern-card' }, [
      el('div', { class: 'antipattern-card__title' }, ap.title),
      el('div', { class: 'antipattern-card__line' }, [
        el('span', { class: 'antipattern-card__label' }, 'TELL'),
        document.createTextNode(ap.tell),
      ]),
      el('div', { class: 'antipattern-card__line' }, [
        el('span', { class: 'antipattern-card__label' }, 'FIX'),
        document.createTextNode(ap.fix),
      ]),
    ]);
    root.appendChild(card);
  });
}


function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


main().catch(err => {
  console.error('Boot failed:', err);
  const main = document.querySelector('main');
  if (main) {
    const banner = el('div', {
      style: 'padding:20px;background:#FEDED7;color:#BA0517;border-radius:8px;margin-bottom:16px;font-weight:600',
    }, `Failed to load: ${err.message}. Make sure you're serving this via server.py (not opening the file directly).`);
    main.prepend(banner);
  }
});
