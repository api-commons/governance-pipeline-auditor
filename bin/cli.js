#!/usr/bin/env node
// @api-common/governance-pipeline-auditor — "lint your linting."
//
// Point it at a repo; it finds the GitHub Actions workflows that run Spectral
// (and any rulesets), scores the pipeline against the 8-point maturity rubric
// from the API Evangelist paper "The State of Spectral in API Pipelines," and
// prints a prioritized punch-list of concrete fixes.
//
// Usage:
//   governance-pipeline-auditor [repo-path]        # default: current directory
//   gpa .                                          # short alias
//
// Flags:
//   --json              print the full audit as JSON
//   --html <file>       write a self-contained HTML report
//   --summary <file>    append a GitHub-flavored Markdown summary (for CI)
//   --min-score <N>     exit non-zero if score < N (so it can gate a pipeline)
//   -h, --help          show help
//       --version       print version

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { auditRepo, SIGNALS } from '../src/audit.js';
import { collectFiles } from '../src/collect.js';
import { renderAudit } from '../src/report-html.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { path: null, json: false, html: null, summary: null, minScore: null, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--json': o.json = true; break;
      case '--html': o.html = argv[++i]; break;
      case '--summary': o.summary = argv[++i]; break;
      case '--min-score': o.minScore = Number(argv[++i]); break;
      case '-h': case '--help': o.help = true; break;
      case '--version': o.version = true; break;
      default:
        if (a && a.startsWith('-')) { console.error(`Unknown flag: ${a}`); process.exit(2); }
        else if (!o.path) o.path = a;
        else { console.error(`Unexpected argument: ${a}`); process.exit(2); }
    }
  }
  return o;
}

function help() {
  console.log(`governance-pipeline-auditor (gpa) — audit a repo's Spectral CI setup against an 8-point rubric

Usage:
  governance-pipeline-auditor [repo-path]     audit a repository (default: .)
  gpa .

Flags:
  --json              print the full audit as JSON
  --html <file>       write a self-contained HTML report
  --summary <file>    append a GitHub-flavored Markdown summary (for CI / $GITHUB_STEP_SUMMARY)
  --min-score <N>     exit non-zero if the score is below N (gate a pipeline)
  -h, --help          show this help
      --version       print version`);
}

async function pkgVersion() {
  try {
    const raw = await readFile(join(__dirname, '..', 'package.json'), 'utf8');
    return JSON.parse(raw).version || '0.0.0';
  } catch { return '0.0.0'; }
}

// ---- terminal rendering ------------------------------------------------------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

function printReport(audit) {
  const { score, maxScore, maturity, signals, punchlist, antiPatterns, meta } = audit;
  console.log('');
  console.log(c.bold('  API Governance Pipeline Audit'));
  if (!meta.spectralFound) {
    console.log('  ' + c.red('No Spectral governance pipeline detected in this repository.'));
  } else {
    console.log(c.dim(`  ${meta.spectralWorkflowCount} Spectral workflow(s) · ${meta.rulesetCount} ruleset(s)`));
  }
  console.log('');
  const scoreStr = `${score} / ${maxScore}`;
  const scoreColor = score >= 6 ? c.green : score >= 4 ? c.yellow : c.red;
  console.log(`  Maturity: ${scoreColor(c.bold(scoreStr))}  ${c.bold(maturity.label)}`);
  console.log(c.dim(`  ${maturity.blurb}`));
  console.log('');
  console.log(c.bold('  Signals'));
  for (const s of signals) {
    const mark = s.pass ? c.green('  PASS') : c.red('  FAIL');
    console.log(`${mark}  ${s.label}`);
    console.log(c.dim(`        ${s.question}`));
    if (s.evidence) console.log(c.dim(`        ↳ ${s.evidence}`));
  }
  if (antiPatterns.length) {
    console.log('');
    console.log(c.bold('  Anti-patterns'));
    for (const a of antiPatterns) {
      console.log('  ' + c.red('•') + ' ' + a.label + (a.evidence ? c.dim(`  (${a.evidence})`) : ''));
    }
  }
  console.log('');
  console.log(c.bold('  Punch-list (highest impact first)'));
  if (!punchlist.length) {
    console.log('  ' + c.green('✓ Nothing to fix — every mechanical signal is present.'));
  } else {
    punchlist.forEach((p, i) => {
      console.log(`  ${c.yellow(c.bold(String(i + 1) + '.'))} ${c.bold(p.title)}`);
      console.log(c.dim(`     why  ${p.why}`));
      console.log(`     ${c.bold('fix')}  ${p.how}`);
      console.log(c.dim(`     docs ${p.docs}`));
    });
  }
  console.log('');
}

// ---- markdown summary (for CI / $GITHUB_STEP_SUMMARY) ------------------------
function renderMarkdown(audit) {
  const { score, maxScore, maturity, signals, punchlist, antiPatterns } = audit;
  const emoji = score >= 6 ? '🟢' : score >= 4 ? '🟡' : '🔴';
  const lines = [];
  lines.push(`## ${emoji} API Governance Pipeline Audit — ${score} / ${maxScore} (${maturity.label})`);
  lines.push('');
  lines.push(`> ${maturity.blurb}`);
  lines.push('');
  lines.push('| Signal | Result | Evidence |');
  lines.push('| --- | :---: | --- |');
  for (const s of signals) {
    const ev = s.evidence ? '`' + String(s.evidence).replace(/\|/g, '\\|').slice(0, 80) + '`' : '—';
    lines.push(`| ${s.label} | ${s.pass ? '✅' : '❌'} | ${ev} |`);
  }
  lines.push('');
  if (antiPatterns.length) {
    lines.push('### Anti-patterns');
    for (const a of antiPatterns) lines.push(`- ⚠️ ${a.label}`);
    lines.push('');
  }
  lines.push('### Punch-list (highest impact first)');
  if (!punchlist.length) {
    lines.push('- ✅ Nothing to fix — every mechanical signal is present.');
  } else {
    punchlist.forEach((p, i) => {
      lines.push(`${i + 1}. **${p.title}** — ${p.why} _Fix:_ ${p.how} ([why](${p.docs}))`);
    });
  }
  lines.push('');
  lines.push('---');
  lines.push('Audited by [`@api-common/governance-pipeline-auditor`](https://auditor.apicommons.org). Governance help from [API Evangelist](https://apievangelist.com/services/).');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { help(); return; }
  if (o.version) { console.log(await pkgVersion()); return; }

  const repo = resolve(o.path || '.');
  const files = await collectFiles(repo);
  const audit = auditRepo(files, { generatedAt: new Date().toISOString() });

  if (o.json) {
    process.stdout.write(JSON.stringify(audit, null, 2) + '\n');
  } else {
    printReport(audit);
  }

  if (o.html) {
    const html = renderAudit(audit, { title: 'API Governance Pipeline Audit', generatedAt: audit.meta.generatedAt });
    await writeFile(resolve(o.html), html, 'utf8');
    console.error(`✓ Wrote HTML report to ${resolve(o.html)}`);
  }

  if (o.summary) {
    await appendFile(resolve(o.summary), renderMarkdown(audit), 'utf8');
    console.error(`✓ Appended Markdown summary to ${resolve(o.summary)}`);
  }

  if (o.minScore != null && !Number.isNaN(o.minScore) && audit.score < o.minScore) {
    console.error(`✗ Score ${audit.score} is below the required minimum of ${o.minScore}.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
