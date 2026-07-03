// The auditor.apicommons.org landing + live demo controller.
// It imports the SAME shared scorer + renderer the CLI uses, so the score and
// report shown here are identical to what runs in CI.
import { auditRepo } from './audit.js';
import { renderAudit } from './report-html.js';
import { initEngage } from './engage';
import goodWorkflow from '../fixtures/good-repo/.github/workflows/governance.yml?raw';
import goodRuleset from '../fixtures/good-repo/.config/spectral/ruleset.yaml?raw';
import badWorkflow from '../fixtures/bad-repo/.github/workflows/lint.yml?raw';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const workflow = $<HTMLTextAreaElement>('workflow');
const ruleset = $<HTMLTextAreaElement>('ruleset');
const status = $<HTMLElement>('demo-status');
const preview = $<HTMLIFrameElement>('preview');

let lastScore = 0;

function setStatus(msg: string, kind: 'ok' | 'err' | '' = '') {
  status.textContent = msg;
  status.className = 'demo-status ' + (kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : 'muted');
}

function currentFiles() {
  const files: Array<{ name: string; content: string; kind: string }> = [];
  const wf = workflow.value.trim();
  const rs = ruleset.value.trim();
  if (wf) files.push({ name: '.github/workflows/pasted.yml', content: wf, kind: 'workflow' });
  if (rs) files.push({ name: '.config/spectral/ruleset.yaml', content: rs, kind: 'ruleset' });
  return files;
}

function audit() {
  const files = currentFiles();
  if (!files.length) {
    setStatus('Paste a workflow YAML (and optional ruleset), or load a sample.', 'err');
    return;
  }
  const result = auditRepo(files, { generatedAt: new Date().toISOString() });
  lastScore = result.score;
  preview.srcdoc = renderAudit(result, { generatedAt: result.meta.generatedAt });
  const failed = result.punchlist.length;
  setStatus(`Scored ${result.score} / ${result.maxScore} — ${result.maturity.label}. ${failed} fix${failed === 1 ? '' : 'es'} in the punch-list.`, 'ok');
}

$<HTMLButtonElement>('audit').addEventListener('click', audit);
$<HTMLButtonElement>('load-good').addEventListener('click', () => {
  workflow.value = goodWorkflow;
  ruleset.value = goodRuleset;
  setStatus('Loaded the blueprint pipeline from the paper. Click “Audit pipeline”.', 'ok');
  audit();
});
$<HTMLButtonElement>('load-bad').addEventListener('click', () => {
  workflow.value = badWorkflow;
  ruleset.value = '';
  setStatus('Loaded the median (default, floating, ungated, toothless) pipeline. Click “Audit pipeline”.', 'ok');
  audit();
});

// Engagement front door — context reflects the current audit state.
initEngage(() => `Context: I audited a Spectral CI pipeline on auditor.apicommons.org and scored ${lastScore} / 8 on the governance maturity rubric.`);
$<HTMLButtonElement>('engage-inline')?.addEventListener('click', () => $<HTMLButtonElement>('engage-ae').click());

// Render an empty-state preview on load so the panel isn't blank.
preview.srcdoc = renderAudit(auditRepo([], { generatedAt: new Date().toISOString() }), { generatedAt: new Date().toISOString() });
