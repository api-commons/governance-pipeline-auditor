// audit.js — the shared, pure pipeline scorer.
//
// This module is used by BOTH the Node CLI (bin/cli.js) and the browser demo
// (src/site.ts, via Vite) so the exact same score comes out of a CI run and the
// hosted live demo. It is plain ESM JavaScript with ZERO dependencies and no
// Node/browser-only globals, so it runs unchanged in either environment.
//
//   auditRepo(files, options?) -> { score, maxScore, maturity, signals,
//                                   punchlist, antiPatterns, meta }
//
// where `files` is an array of { name, content, kind? } — the workflow YAML and
// any Spectral ruleset(s) discovered in a repository. It scores the pipeline
// against the 8-point maturity rubric from the API Evangelist paper
// "The State of Spectral in API Pipelines" (Appendix A) and returns a
// prioritized punch-list of concrete fixes.

// ---- the 8-signal rubric (source of truth) ----------------------------------
// Each signal is worth one point. `priority` orders the punch-list (1 = do
// first); it is NOT the display order. `docs` is the "why / how" reference we
// attach to every fix so a red result is a teachable moment, not a dead end.
export const SIGNALS = [
  {
    id: 'gates-pr',
    label: 'Gates the PR',
    question: 'Does governance fire before the merge, not after?',
    priority: 2,
    docs: 'https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#pull_request',
    fix: {
      title: 'Gate the pull request',
      why: 'Linting after the merge reports a decision instead of informing it — the finding becomes a ticket, not a gate.',
      how: 'Add `pull_request:` to the workflow `on:` triggers so Spectral runs before code merges.',
    },
  },
  {
    id: 'custom-ruleset',
    label: 'Custom ruleset',
    question: "Are the rules the organization's, not the tool's defaults?",
    priority: 1,
    docs: 'https://docs.stoplight.io/docs/spectral/e5b9616d6d50c-rulesets',
    fix: {
      title: 'Write a ruleset you own',
      why: "Running Spectral's defaults is leaving the settings where you found them — it encodes no decision about what a good API means here.",
      how: 'Add a `.spectral.yaml` (or a `--ruleset` path) with rules your organization actually wrote and can explain.',
    },
  },
  {
    id: 'owned-home',
    label: 'Owned ruleset home',
    question: 'Do the rules live in a dedicated dir or a shared/remote source?',
    priority: 4,
    docs: 'https://docs.stoplight.io/docs/spectral/e5b9616d6d50c-rulesets',
    fix: {
      title: 'Give the ruleset an owned home',
      why: 'A ruleset copied into each repo drifts and rots; one governed, versioned, provenanced source is the clearest signal of real governance in the corpus.',
      how: 'Keep rules in a dedicated dir (e.g. `.config/spectral/`, `tools/spectral/`) or `extends` a shared/remote ruleset URL.',
    },
  },
  {
    id: 'pinned-tooling',
    label: 'Pinned tooling',
    question: 'Is the enforcing tool pinned to a chosen version?',
    priority: 6,
    docs: 'https://docs.github.com/actions/security-guides/security-hardening-for-github-actions',
    fix: {
      title: 'Pin the enforcing tool',
      why: 'A governance tool on `@latest` can change behavior between one Tuesday and the next with no commit and no changelog — the thing enforcing your rules is itself ungoverned.',
      how: 'Pin `stoplightio/spectral-action` to a full 40-character commit SHA (or pin the CLI to an exact version).',
    },
  },
  {
    id: 'security-layer',
    label: 'Security layer',
    question: 'Are OWASP/security rules present, not just style?',
    priority: 5,
    docs: 'https://github.com/stoplightio/spectral-owasp-ruleset',
    fix: {
      title: 'Add a security layer',
      why: 'Style-and-structure rules miss the class of problems that actually hurt consumers; security deserves to be a first-class governance concern.',
      how: 'Extend the OWASP API Security ruleset (`@stoplight/spectral-owasp-ruleset`) or run a dedicated security job.',
    },
  },
  {
    id: 'real-gate',
    label: 'Real gate',
    question: 'Does it fail the build on error rather than only annotate?',
    priority: 3,
    docs: 'https://docs.stoplight.io/docs/spectral/9ffab9f5b68be-spectral-cli',
    fix: {
      title: 'Give the gate teeth',
      why: '`continue-on-error: true` makes the step decorative — it runs, produces findings, and never fails the build regardless of what it finds.',
      how: 'Remove `continue-on-error: true` and set `--fail-severity error` so real violations fail the build.',
    },
  },
  {
    id: 'path-filtered',
    label: 'Path-filtered',
    question: 'Does it run only when the spec/ruleset changes?',
    priority: 8,
    docs: 'https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions#onpushpull_requestpaths',
    fix: {
      title: 'Scope triggers to what changed',
      why: 'Path filters keep governance both intentional and efficient — it fires when the spec or ruleset actually changes, not on every push.',
      how: 'Add `paths:` to the trigger, scoped to your spec and ruleset files.',
    },
  },
  {
    id: 'machine-report',
    label: 'Machine-readable report',
    question: 'Does it emit SARIF / a readable report / PR comment?',
    priority: 7,
    docs: 'https://reporter.apicommons.org',
    fix: {
      title: 'Emit a report a human will read',
      why: 'JSON in a log is not a report; a shared HTML report or SARIF turns a wall of red into something a team will open and trend over time.',
      how: 'Upload SARIF to the security tab, post a PR comment, write the job summary, or pipe findings through @api-common/spectral-reporter.',
    },
  },
];

const SIGNAL_BY_ID = new Map(SIGNALS.map((s) => [s.id, s]));

// Maturity bands, matched to the distribution in the paper (ceiling was 6/8;
// nobody reached 7 or 8 in a census of 1,005 real pipelines).
export const MATURITY = [
  { min: 8, level: 'blueprint', label: 'Blueprint', blurb: 'The pipeline nobody in the 1,005-repo corpus fully built — every mechanical signal is present.' },
  { min: 6, level: 'strong', label: 'Strong', blurb: 'Top of the real-world corpus. The mechanics are largely there; the gaps are usually ownership and reporting.' },
  { min: 4, level: 'developing', label: 'Developing', blurb: 'Ahead of most. A handful of deliberate additions would take this to the top band.' },
  { min: 2, level: 'thin', label: 'Thin', blurb: 'The center of gravity of the corpus — a green check with little behind it.' },
  { min: 0, level: 'nominal', label: 'Nominal', blurb: 'Spectral is on, but almost nothing about the pipeline is a decision anyone made on purpose.' },
];

export function maturityFor(score) {
  return MATURITY.find((m) => score >= m.min) || MATURITY[MATURITY.length - 1];
}

// ---- text helpers ------------------------------------------------------------
function grep(text, re) {
  if (!text) return null;
  const r = new RegExp(re.source, re.flags.replace('g', ''));
  const m = r.exec(text);
  if (!m) return null;
  const idx = m.index;
  const start = text.lastIndexOf('\n', idx - 1) + 1;
  let end = text.indexOf('\n', idx);
  if (end < 0) end = text.length;
  return text.slice(start, end).trim();
}

function has(text, re) {
  return !!text && re.test(text);
}

function inferKind(f) {
  if (f.kind) return f.kind;
  const n = (f.name || '').toLowerCase();
  if (/\.github\/workflows\//.test(n) || (/\bon\s*:/.test(f.content || '') && /\bjobs\s*:/.test(f.content || ''))) {
    // A ruleset can be misclassified as a workflow only if it also has jobs:.
    if (/\.spectral\.|spectral[.\-].*ruleset|ruleset.*\.(ya?ml|json|js)$|\.config\/spectral|tools\/spectral/.test(n) && !/\bjobs\s*:/.test(f.content || '')) {
      return 'ruleset';
    }
    return 'workflow';
  }
  if (/\.spectral\.(ya?ml|json|js)$|\.config\/spectral|tools\/spectral|ruleset/.test(n)) return 'ruleset';
  if (/\bextends\s*:|\brules\s*:/.test(f.content || '')) return 'ruleset';
  return 'unknown';
}

const RUNS_SPECTRAL = /stoplightio\/spectral-action|@stoplight\/spectral|spectral[\s_-]?lint|spectral_ruleset|@api-common\/spectral-reporter/i;

/**
 * Score a repository's Spectral CI setup against the 8-point maturity rubric.
 * @param {Array<{name:string, content:string, kind?:string}>} files
 * @param {Object} [options]
 */
export function auditRepo(files, options = {}) {
  const list = Array.isArray(files) ? files.filter((f) => f && typeof f.content === 'string') : [];
  const classified = list.map((f) => ({ ...f, kind: inferKind(f) }));

  const workflows = classified.filter((f) => f.kind === 'workflow');
  const rulesets = classified.filter((f) => f.kind === 'ruleset');

  // Only workflows that actually invoke Spectral count toward the score.
  const spectralWorkflows = workflows.filter((f) => RUNS_SPECTRAL.test(f.content));
  const wf = spectralWorkflows.map((f) => f.content).join('\n---\n');
  const rs = rulesets.map((f) => f.content).join('\n---\n');
  const allNames = classified.map((f) => f.name || '').join('\n');
  const rulesetNames = rulesets.map((f) => f.name || '').join('\n');

  const spectralFound = spectralWorkflows.length > 0 || rulesets.length > 0;

  // ---- evaluate each signal -------------------------------------------------
  const evals = {};

  // A remote/shared ruleset (extends URL, or a curl/wget of a ruleset) is BOTH a
  // custom ruleset and an owned home — a national/shared ruleset like Italy's
  // api-oas-checker is the strongest governance decision a team can make, not a
  // weaker one. Detect it once and credit it in both signals.
  const remoteRuleset = (has(rs, /extends\s*:/i) && grep(rs, /https?:\/\/\S+/i))
    || grep(wf, /extends\s*:\s*\n?\s*-?\s*['"]?https?:\/\//i)
    || grep(wf, /(curl|wget)[^\n]*(spectral|ruleset)/i)
    || grep(wf, /(curl|wget)[^\n]*https?:\/\/[^\n]*\.(ya?ml|json|js)\b/i);

  // (1) Gates the PR — trigger includes pull_request.
  evals['gates-pr'] = (() => {
    const ev = grep(wf, /\bpull_request\b/);
    return { pass: !!ev, evidence: ev };
  })();

  // (2) Custom ruleset — an explicit ruleset reference, a ruleset file present,
  // or a remote/shared ruleset (which is a deliberate choice, not the defaults).
  evals['custom-ruleset'] = (() => {
    const refRe = /--ruleset|spectral_ruleset\s*:|(^|\s)-r\s+\S*spectral|\bruleset\s*:\s*\S/im;
    const evRef = grep(wf, refRe);
    if (rulesets.length) {
      return { pass: true, evidence: `ruleset file: ${rulesets[0].name || '(unnamed)'}` };
    }
    if (evRef) return { pass: true, evidence: evRef };
    if (remoteRuleset) return { pass: true, evidence: `remote/shared ruleset: ${remoteRuleset}` };
    return { pass: false, evidence: null };
  })();

  // (3) Owned ruleset home — dedicated dir, or a remote/shared extends URL.
  evals['owned-home'] = (() => {
    const dirEv = grep(allNames, /\.config\/spectral|tools\/spectral|rulesets?\//i)
      || grep(wf, /\.config\/spectral|tools\/spectral|rulesets?\//i);
    if (dirEv) return { pass: true, evidence: dirEv };
    return { pass: !!remoteRuleset, evidence: remoteRuleset };
  })();

  // (4) Pinned tooling — spectral-action pinned by 40-char SHA (or CLI exact version).
  evals['pinned-tooling'] = (() => {
    const actionM = /stoplightio\/spectral-action@([^\s'"]+)/i.exec(wf);
    if (actionM) {
      const ref = actionM[1];
      if (/^[0-9a-f]{40}$/i.test(ref)) return { pass: true, evidence: `stoplightio/spectral-action@${ref}` };
    }
    const cliM = /@stoplight\/spectral-cli@(\d+\.\d+\.\d+)\b/i.exec(wf);
    if (cliM) return { pass: true, evidence: `@stoplight/spectral-cli@${cliM[1]} (exact version)` };
    return { pass: false, evidence: actionM ? `stoplightio/spectral-action@${actionM[1]} (floating)` : null };
  })();

  // (5) Security layer — OWASP/security rules referenced.
  evals['security-layer'] = (() => {
    const ev = grep(wf, /owasp|spectral-owasp|security/i) || grep(rs, /owasp|spectral-owasp|security/i);
    return { pass: !!ev, evidence: ev };
  })();

  // (6) Real gate — NOT continue-on-error:true on the governance step.
  evals['real-gate'] = (() => {
    const toothless = grep(wf, /continue-on-error\s*:\s*true/i);
    if (toothless) return { pass: false, evidence: toothless };
    const failSev = grep(wf, /fail[-_]severity/i);
    return { pass: true, evidence: failSev || 'no continue-on-error:true on the governance step' };
  })();

  // (7) Path-filtered — trigger scoped with paths:.
  evals['path-filtered'] = (() => {
    const ev = grep(wf, /^\s*paths\s*:/im);
    return { pass: !!ev, evidence: ev };
  })();

  // (8) Machine-readable report — SARIF / PR comment / summary / reporter.
  evals['machine-report'] = (() => {
    const ev = grep(wf, /sarif|reviewdog|add-pr-comment|pull-request-comment|github_step_summary|step[_-]?summary|create-comment|spectral-reporter/i);
    return { pass: !!ev, evidence: ev };
  })();

  // ---- assemble ordered signal results --------------------------------------
  const signals = SIGNALS.map((s) => ({
    id: s.id,
    label: s.label,
    question: s.question,
    docs: s.docs,
    pass: !!(evals[s.id] && evals[s.id].pass),
    evidence: (evals[s.id] && evals[s.id].evidence) || null,
  }));

  const score = signals.filter((s) => s.pass).length;

  // ---- punch-list (failed signals, prioritized) -----------------------------
  const punchlist = signals
    .filter((s) => !s.pass)
    .map((s) => {
      const meta = SIGNAL_BY_ID.get(s.id);
      return {
        signal: s.id,
        priority: meta.priority,
        title: meta.fix.title,
        why: meta.fix.why,
        how: meta.fix.how,
        docs: meta.docs,
      };
    })
    .sort((a, b) => a.priority - b.priority);

  // ---- named anti-patterns from the paper -----------------------------------
  const antiPatterns = [];
  if (spectralFound && !evals['custom-ruleset'].pass) {
    antiPatterns.push({ id: 'default-ruleset', label: 'Just turning it on — default/implicit ruleset', evidence: null });
  }
  const floating = grep(wf, /stoplightio\/spectral-action@(latest|v?\d+)(\s|$)/i);
  if (floating) antiPatterns.push({ id: 'floating-pin', label: '`@latest` / floating governance — the enforcer can change under you', evidence: floating });
  if (has(wf, /\bpush\b/) && !evals['gates-pr'].pass) {
    antiPatterns.push({ id: 'lint-after-merge', label: 'Linting after the merge — runs on push, not the pull request', evidence: grep(wf, /\bpush\s*:/i) });
  }
  const toothless = grep(wf, /continue-on-error\s*:\s*true/i);
  if (toothless) antiPatterns.push({ id: 'toothless', label: 'Toothless linting — `continue-on-error` makes the gate decorative', evidence: toothless });
  if (rulesets.length && !has(rs, /documentationUrl/i)) {
    antiPatterns.push({ id: 'no-docs-link', label: 'Silent enforcement — rules carry no `documentationUrl` to explain a red build', evidence: null });
  }

  const m = maturityFor(spectralFound ? score : 0);

  return {
    score: spectralFound ? score : 0,
    maxScore: SIGNALS.length,
    maturity: { level: m.level, label: m.label, blurb: m.blurb },
    signals,
    punchlist: spectralFound ? punchlist : SIGNALS.map((s) => ({
      signal: s.id, priority: s.priority, title: s.fix.title, why: s.fix.why, how: s.fix.how, docs: s.docs,
    })).sort((a, b) => a.priority - b.priority),
    antiPatterns,
    meta: {
      spectralFound,
      workflowCount: workflows.length,
      spectralWorkflowCount: spectralWorkflows.length,
      rulesetCount: rulesets.length,
      generatedAt: options.generatedAt || new Date().toISOString(),
    },
  };
}

export default auditRepo;
