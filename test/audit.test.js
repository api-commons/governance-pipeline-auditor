import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { auditRepo, SIGNALS, maturityFor } from '../src/audit.js';
import { collectFiles } from '../src/collect.js';
import { renderAudit } from '../src/report-html.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOOD = join(__dirname, '..', 'fixtures', 'good-repo');
const BAD = join(__dirname, '..', 'fixtures', 'bad-repo');

test('the good (blueprint) fixture scores a perfect 8/8', async () => {
  const files = await collectFiles(GOOD);
  const audit = auditRepo(files, { generatedAt: '2026-07-03T12:00:00Z' });
  assert.equal(audit.score, 8);
  assert.equal(audit.maxScore, 8);
  assert.equal(audit.maturity.label, 'Blueprint');
  // Every signal passes → empty punch-list.
  assert.equal(audit.punchlist.length, 0);
  assert.ok(audit.signals.every((s) => s.pass), 'all signals pass');
  // It found the workflow and the owned ruleset.
  assert.equal(audit.meta.spectralWorkflowCount, 1);
  assert.equal(audit.meta.rulesetCount, 1);
});

test('the bad (median) fixture scores 0/8 with a full punch-list', async () => {
  const files = await collectFiles(BAD);
  const audit = auditRepo(files, { generatedAt: '2026-07-03T12:00:00Z' });
  assert.equal(audit.score, 0);
  assert.equal(audit.maturity.label, 'Nominal');
  // All 8 signals fail → 8 punch-list items.
  assert.equal(audit.punchlist.length, 8);
  assert.ok(audit.signals.every((s) => !s.pass), 'all signals fail');
});

test('punch-list is ordered by priority (custom ruleset first)', async () => {
  const files = await collectFiles(BAD);
  const audit = auditRepo(files, {});
  const priorities = audit.punchlist.map((p) => p.priority);
  assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b), 'sorted ascending');
  assert.equal(audit.punchlist[0].signal, 'custom-ruleset', 'highest-impact fix leads');
  // Every punch-list item carries a why, a how, and a docs link.
  for (const p of audit.punchlist) {
    assert.ok(p.why && p.how && /^https?:\/\//.test(p.docs), `punch item ${p.signal} is complete`);
  }
});

test('the bad fixture flags the named anti-patterns from the paper', async () => {
  const files = await collectFiles(BAD);
  const audit = auditRepo(files, {});
  const ids = audit.antiPatterns.map((a) => a.id);
  assert.ok(ids.includes('default-ruleset'), 'default ruleset');
  assert.ok(ids.includes('floating-pin'), '@latest / floating pin');
  assert.ok(ids.includes('lint-after-merge'), 'push, not pull_request');
  assert.ok(ids.includes('toothless'), 'continue-on-error');
});

test('the good fixture has no anti-patterns', async () => {
  const files = await collectFiles(GOOD);
  const audit = auditRepo(files, {});
  assert.equal(audit.antiPatterns.length, 0);
});

test('a repo with no Spectral pipeline scores 0 and returns the full punch-list', () => {
  const audit = auditRepo([{ name: '.github/workflows/test.yml', content: 'name: test\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest', kind: 'workflow' }], {});
  assert.equal(audit.meta.spectralFound, false);
  assert.equal(audit.score, 0);
  assert.equal(audit.punchlist.length, SIGNALS.length);
});

test('is defensive about junk input', () => {
  assert.doesNotThrow(() => auditRepo(null, {}));
  assert.doesNotThrow(() => auditRepo([], {}));
  assert.doesNotThrow(() => auditRepo([{}], {}));
  assert.doesNotThrow(() => auditRepo([{ name: 'x', content: null }], {}));
});

test('renders a complete, self-contained HTML report', async () => {
  const files = await collectFiles(GOOD);
  const audit = auditRepo(files, { generatedAt: '2026-07-03T12:00:00Z' });
  const html = renderAudit(audit, { generatedAt: '2026-07-03T12:00:00Z' });
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<\/html>\s*$/i);
  assert.match(html, /8\s*<\/span>/); // score in the dial
  // Self-contained: no external stylesheet/script.
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/i);
  assert.doesNotMatch(html, /src=["']https?:/i);
});

test('maturityFor bands match the paper', () => {
  assert.equal(maturityFor(8).label, 'Blueprint');
  assert.equal(maturityFor(6).label, 'Strong');
  assert.equal(maturityFor(4).label, 'Developing');
  assert.equal(maturityFor(2).label, 'Thin');
  assert.equal(maturityFor(0).label, 'Nominal');
});

test('a remote/shared ruleset credits BOTH custom-ruleset and owned-home', () => {
  // The italia/api-oas-checker pattern: no local ruleset file — a workflow that
  // curls a national/shared ruleset and lints against it. This is a deliberate
  // governance decision, so both ownership signals must pass (regression: the
  // scorer used to credit owned-home but fail custom-ruleset on the same input).
  const wf = [
    'on:',
    '  pull_request:',
    'jobs:',
    '  lint:',
    '    steps:',
    '      - run: curl -sSfL https://raw.githubusercontent.com/italia/api-oas-checker/master/spectral.yml -o spectral.yml',
    '      - run: spectral lint -r spectral.yml openapi.yaml',
  ].join('\n');
  const audit = auditRepo([{ name: '.github/workflows/api-check.yml', content: wf, kind: 'workflow' }]);
  const byId = Object.fromEntries(audit.signals.map((s) => [s.id, s.pass]));
  assert.equal(byId['custom-ruleset'], true, 'remote ruleset counts as custom');
  assert.equal(byId['owned-home'], true, 'remote ruleset counts as an owned home');
});
