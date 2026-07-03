// collect.js — Node-only helper that gathers the files auditRepo() needs from a
// repository on disk: the GitHub Actions workflows and any Spectral rulesets.
// Kept separate from audit.js so the pure scorer stays browser-safe (no fs).

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const WORKFLOW_RE = /\.ya?ml$/i;
const RULESET_NAME_RE = /(^|\/)\.spectral\.(ya?ml|json|js)$/i;

// Where owned rulesets tend to live (the paper's "owned ruleset home" signal).
const RULESET_DIRS = ['.config/spectral', 'tools/spectral', 'rulesets', 'ruleset', '.spectral'];
const RULESET_IN_DIR_RE = /\.(ya?ml|json|js)$/i;

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function readInto(files, absPath, repoRoot, kind) {
  try {
    const content = await readFile(absPath, 'utf8');
    files.push({ name: relative(repoRoot, absPath).split(sep).join('/'), content, kind });
  } catch { /* unreadable — skip */ }
}

/**
 * Collect workflow + ruleset files from a repo path into the shape auditRepo wants.
 * @param {string} repoRoot  absolute path to the repository
 * @returns {Promise<Array<{name:string, content:string, kind:string}>>}
 */
export async function collectFiles(repoRoot) {
  const files = [];

  // 1) .github/workflows/*.y{a}ml
  const wfDir = join(repoRoot, '.github', 'workflows');
  if (await exists(wfDir)) {
    let entries = [];
    try { entries = await readdir(wfDir, { withFileTypes: true }); } catch { entries = []; }
    for (const e of entries) {
      if (e.isFile() && WORKFLOW_RE.test(e.name)) {
        await readInto(files, join(wfDir, e.name), repoRoot, 'workflow');
      }
    }
  }

  // 2) root-level .spectral.{yaml,yml,json,js}
  for (const base of ['.spectral.yaml', '.spectral.yml', '.spectral.json', '.spectral.js']) {
    const p = join(repoRoot, base);
    if (await exists(p)) await readInto(files, p, repoRoot, 'ruleset');
  }

  // 3) dedicated ruleset dirs
  for (const dir of RULESET_DIRS) {
    const abs = join(repoRoot, dir);
    if (!(await exists(abs))) continue;
    let entries = [];
    try { entries = await readdir(abs, { withFileTypes: true }); } catch { entries = []; }
    for (const e of entries) {
      if (e.isFile() && RULESET_IN_DIR_RE.test(e.name)) {
        await readInto(files, join(abs, e.name), repoRoot, 'ruleset');
      }
    }
  }

  return files;
}

export default collectFiles;
export { RULESET_NAME_RE };
