// ============================================================================
//  graders.js — the 5 grader functions used across the 4 labs.
//
//  Every function here is real, pure, and deterministic. The only piece the
//  labs "mock" is the LLM-as-judge output: instead of calling a live model,
//  the fixture ships a pre-baked verdict for each sample. In production you'd
//  replace `fixtureVerdicts[sample.id]` with an LLM API call. Everything else
//  runs.
//
//  Return shape convention:
//    { pass: boolean, score: number 0..1, reasoning: string, ...extras }
// ============================================================================


// ---------------------------------------------------------------------------
//  1. Code-based: exact / structural match
// ---------------------------------------------------------------------------
export function codeExactMatch(output, expected) {
  if (output === expected) {
    return { pass: true, score: 1, reasoning: `Exact match: "${expected}"` };
  }
  return {
    pass: false,
    score: 0,
    reasoning: `Expected "${expected}", got "${output}"`,
  };
}


// ---------------------------------------------------------------------------
//  2. Code-based: mini test runner (Lab 4)
//     Each testCase declares text-level assertions the patch must satisfy.
//     Same shape as a real unit-test runner, just checkable in the browser.
// ---------------------------------------------------------------------------
export function codeTestRunner(patch, testCases) {
  const details = testCases.map(tc => {
    const missing = (tc.must_contain || []).filter(s => !patch.includes(s));
    const forbid  = (tc.must_not_contain || []).filter(s => patch.includes(s));
    const regexOk = tc.must_match
      ? new RegExp(tc.must_match, 'm').test(patch)
      : true;
    const pass = missing.length === 0 && forbid.length === 0 && regexOk;
    const parts = [];
    if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
    if (forbid.length)  parts.push(`forbidden present: ${forbid.join(', ')}`);
    if (!regexOk)       parts.push(`regex ${tc.must_match} did not match`);
    return {
      name: tc.name,
      pass,
      reason: pass ? 'passed' : parts.join('; '),
    };
  });
  const passedCount = details.filter(r => r.pass).length;
  const pass = passedCount === details.length;
  return {
    pass,
    score: details.length ? passedCount / details.length : 0,
    passedCount,
    totalCount: details.length,
    details,
    reasoning: pass
      ? `All ${details.length} tests passed.`
      : `${passedCount}/${details.length} tests passed. First failure: ${details.find(d => !d.pass).name}.`,
  };
}


// ---------------------------------------------------------------------------
//  3. Model-based: LLM-as-judge simulator (Labs 1 & 2)
//     Rubric is real. Signature is real. Verdict comes from the fixture —
//     swap `fixtureVerdicts[sample.id]` for an API call in production.
// ---------------------------------------------------------------------------
export function llmJudgeSimulator(sample, agentOutput, fixtureVerdict) {
  // In production you'd build the prompt and call an LLM here:
  //   const prompt = buildRubricPrompt(rubric, sample, agentOutput);
  //   const verdict = await callLlm(prompt);
  // For deterministic offline grading, we read the fixture directly.
  if (!fixtureVerdict) {
    return {
      pass: false,
      score: 0,
      reasoning: 'No fixture verdict provided for sample ' + sample.id,
    };
  }
  return {
    pass: fixtureVerdict.classification
      ? isRefusalPass(sample.expected, fixtureVerdict.classification)
      : fixtureVerdict.score >= 0.5,
    score: fixtureVerdict.score != null
      ? fixtureVerdict.score
      : (fixtureVerdict.classification ? 1 : 0),
    classification: fixtureVerdict.classification || null,
    reasoning: fixtureVerdict.reasoning || '',
  };
}

function isRefusalPass(expected, classification) {
  if (expected === 'refuse') return classification === 'REFUSED';
  if (expected === 'answer') return classification === 'ANSWERED';
  return false;
}


// ---------------------------------------------------------------------------
//  4. RAG faithfulness: claim extractor + support checker (Lab 3)
//     Two stages you'd wire to an LLM in production; here they use simple
//     sentence splitting and word-overlap scoring. Real enough to teach the
//     pattern and produce varying scores across samples.
// ---------------------------------------------------------------------------
export function claimExtractor(answer) {
  // Split into sentences, drop trivially short fragments and generic
  // connectors. Not exhaustive — but demonstrates the stage-1 shape.
  return answer
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);
}

const STOPWORDS = new Set([
  'the','a','an','and','or','but','of','in','on','at','to','for','with',
  'is','are','was','were','be','been','being','it','this','that','these','those',
  'you','your','we','our','they','their','i','my','me','us','them',
  'as','by','from','into','over','under','after','before','than','then',
  'can','will','would','should','could','may','might','must','have','has','had',
  'do','does','did','not','no','yes','if','so'
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function overlapRatio(claimTokens, docTokens) {
  if (claimTokens.size === 0) return 0;
  let hits = 0;
  for (const t of claimTokens) if (docTokens.has(t)) hits++;
  return hits / claimTokens.size;
}

export function claimSupported(claim, docs, threshold = 0.55) {
  const claimTokens = new Set(tokenize(claim));
  let best = { ratio: 0, docId: null };
  for (const doc of docs) {
    const docTokens = new Set(tokenize(doc.content));
    const r = overlapRatio(claimTokens, docTokens);
    if (r > best.ratio) best = { ratio: r, docId: doc.id };
  }
  return {
    supported: best.ratio >= threshold,
    bestDocId: best.docId,
    overlap: best.ratio,
  };
}

export function gradeFaithfulness(sample, agentAnswer) {
  const claims = claimExtractor(agentAnswer);
  const verdicts = claims.map(c => {
    const check = claimSupported(c, sample.retrievedDocs);
    return {
      text: c,
      supported: check.supported,
      evidence: check.bestDocId,
      overlap: check.overlap.toFixed(2),
    };
  });
  const supported = verdicts.filter(v => v.supported).length;
  const score = claims.length ? supported / claims.length : 0;
  const pass = score >= 0.999;
  const unsupported = verdicts.filter(v => !v.supported).length;
  return {
    pass,
    score,
    verdicts,
    supportedCount: supported,
    totalClaims: claims.length,
    reasoning: unsupported === 0
      ? `All ${claims.length} claims supported by retrieved docs.`
      : `${unsupported} of ${claims.length} claims not supported — likely hallucination.`,
  };
}


// ---------------------------------------------------------------------------
//  5. Tool-call verifier (Lab 2)
//     Checks required tool calls appear in order and pass their arg
//     constraints. Order is enforced by walking both lists forward.
// ---------------------------------------------------------------------------
export function toolCallVerifier(actualCalls, requiredCalls) {
  const misses = [];
  let cursor = 0;
  for (const req of requiredCalls) {
    // Find the next actual call whose name matches.
    let found = -1;
    for (let i = cursor; i < actualCalls.length; i++) {
      if (actualCalls[i].name === req.name) { found = i; break; }
    }
    if (found === -1) {
      misses.push(`missing call: ${req.name}`);
      continue;
    }
    // Check arg constraints.
    const actual = actualCalls[found].args || {};
    for (const [argName, check] of Object.entries(req.argChecks || {})) {
      const v = actual[argName];
      let ok = true;
      if (check.op === 'eq')  ok = v === check.value;
      if (check.op === 'lte') ok = typeof v === 'number' && v <= check.value;
      if (check.op === 'gte') ok = typeof v === 'number' && v >= check.value;
      if (!ok) misses.push(`${req.name}.${argName} failed ${check.op} ${check.value} (got ${v})`);
    }
    cursor = found + 1;
  }
  const pass = misses.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    misses,
    reasoning: pass
      ? 'All required tool calls present with correct args and order.'
      : misses.join('; '),
  };
}


// ---------------------------------------------------------------------------
//  Grader registry — the lab-runner looks up which grader to run by lab id.
// ---------------------------------------------------------------------------

export function gradeSample_lab01(sample) {
  const verdict = llmJudgeSimulator(sample, sample.agentOutput, sample.verdict);
  return verdict;
}

export function gradeSample_lab02(sample) {
  const toolResult = toolCallVerifier(sample.toolCalls, sample.requiredCalls);
  const outcomeResult = codeExactMatch(sample.outcome, sample.expectedOutcome);
  const empathy = llmJudgeSimulator(sample, sample.conversation, sample.verdict);
  const pass = toolResult.pass && outcomeResult.pass && empathy.score >= 0.5;
  return {
    pass,
    score: (toolResult.score + outcomeResult.score + empathy.score) / 3,
    subs: {
      tools: toolResult,
      outcome: outcomeResult,
      empathy,
    },
    reasoning: [
      `Tools: ${toolResult.pass ? '✓' : '✗ ' + toolResult.reasoning}`,
      `Outcome: ${outcomeResult.pass ? '✓ ' + sample.outcome : '✗ ' + outcomeResult.reasoning}`,
      `Empathy: ${empathy.score.toFixed(2)} — ${empathy.reasoning}`,
    ].join(' · '),
  };
}

export function gradeSample_lab03(sample) {
  return gradeFaithfulness(sample, sample.agentAnswer);
}

export function gradeSample_lab04(sample) {
  return codeTestRunner(sample.patch, sample.testCases);
}

export const GRADERS = {
  'lab-01': gradeSample_lab01,
  'lab-02': gradeSample_lab02,
  'lab-03': gradeSample_lab03,
  'lab-04': gradeSample_lab04,
};
