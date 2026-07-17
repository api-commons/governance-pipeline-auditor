# Governance Pipeline Auditor

**Lint your linting.** `@api-common/governance-pipeline-auditor` scans a repo's
[Spectral](https://github.com/stoplightio/spectral) API-governance CI setup,
scores it against an **8-point maturity rubric**, and hands back a **prioritized
punch-list** of concrete fixes — each with a one-line *why* and a docs link.

It is the sequel to [Spectral Reporter](https://reporter.apicommons.org):
that reports on your **API**; this reports on your **pipeline**.

The rubric is lifted straight from the API Evangelist paper
*"The State of Spectral in API Pipelines,"* a census of **1,005 real public
pipelines** where the maturity ceiling was 6/8 and nobody reached 7 or 8.

- **Live demo:** https://auditor.apicommons.org
- **An [API Commons](https://apicommons.org/tools/) tool** — free and open under Apache-2.0.

---

## The 8-point rubric

One point per signal. It deliberately measures only the **mechanical** surface a
workflow file exposes — the automatable quarter of governance. It says nothing
about whether a human wrote the rules on purpose, which is the three-quarters no
file census can see.

| Signal | Question it answers |
| --- | --- |
| **Gates the PR** | Does governance fire before the merge, not after? |
| **Custom ruleset** | Are the rules the organization's, not the tool's defaults? |
| **Owned ruleset home** | Do the rules live in a dedicated dir or a shared/remote source? |
| **Pinned tooling** | Is the enforcing tool pinned to a chosen version (SHA)? |
| **Security layer** | Are OWASP/security rules present, not just style? |
| **Real gate** | Does it fail the build on error rather than only annotate? |
| **Path-filtered** | Does it run only when the spec/ruleset changes? |
| **Machine-readable report** | Does it emit SARIF / a readable report / PR comment? |

It also flags the named anti-patterns from the paper: the default ruleset,
`@latest` / floating pins, linting after the merge, toothless
`continue-on-error`, and rules with no `documentationUrl`.

### Maturity bands

`8` Blueprint · `6–7` Strong · `4–5` Developing · `2–3` Thin · `0–1` Nominal.

---

## CLI usage

```bash
# Run it now, no install — audit the current repo
npx @api-common/governance-pipeline-auditor .

# Short alias
npx @api-common/governance-pipeline-auditor . --json
gpa .

# Gate a pipeline: exit non-zero below the threshold
npx @api-common/governance-pipeline-auditor . --min-score 5

# Write a self-contained HTML report
npx @api-common/governance-pipeline-auditor . --html governance-audit.html
```

Point it at any repo path (default: the current directory). It finds
`.github/workflows/*.y{a}ml` that run Spectral and any `.spectral.*` rulesets
(including `.config/spectral/`, `tools/spectral/`, `rulesets/`), then prints the
score, per-signal PASS/FAIL with evidence, and the punch-list.

### Flags

| Flag | Effect |
| --- | --- |
| `--json` | Print the full audit as JSON. |
| `--html <file>` | Write a self-contained HTML report (styled like Spectral Reporter). |
| `--summary <file>` | Append a GitHub-flavored Markdown summary (for `$GITHUB_STEP_SUMMARY`). |
| `--min-score <N>` | Exit non-zero if the score is below N — so it can gate a pipeline. |
| `-h, --help` · `--version` | The usual. |

Install as a dev dependency instead of `npx`:

```bash
npm install --save-dev @api-common/governance-pipeline-auditor
```

---

## GitHub Action

A composite action wraps the CLI so a team gets the score in the job summary and
a hard gate on the score:

```yaml
- uses: api-commons/governance-pipeline-auditor@v1
  with:
    path: .
    min-score: 5            # fail the job below 5/8 (omit to never fail)
    html: governance-audit.html
- uses: actions/upload-artifact@v4
  with:
    name: governance-audit
    path: governance-audit.html
```

The action writes the maturity score, the signal table, and the punch-list to
`$GITHUB_STEP_SUMMARY`, and exits non-zero when the score is below `min-score`.

---

## The shared scorer

The scoring logic is a single pure, dependency-free function —
[`src/audit.js`](src/audit.js):

```js
import { auditRepo } from '@api-common/governance-pipeline-auditor';

const audit = auditRepo([
  { name: '.github/workflows/ci.yml', content: workflowYaml, kind: 'workflow' },
  { name: '.spectral.yaml', content: rulesetYaml, kind: 'ruleset' },
]);
// -> { score, maxScore, maturity, signals, punchlist, antiPatterns, meta }
```

It is imported verbatim by **all three** surfaces:

- **the CLI** (`bin/cli.js`) — after [`src/collect.js`](src/collect.js) reads the files off disk;
- **the GitHub Action** (`action.yml`) — via the CLI;
- **the browser demo** ([`src/site.ts`](src/site.ts)) — the paste-in live demo.

So the score you see in the browser is byte-for-byte what CI produces. The HTML
report is likewise a shared pure renderer ([`src/report-html.js`](src/report-html.js),
exported as `@api-common/governance-pipeline-auditor/report`).

---

## Development

```bash
npm install
npm test          # node:test — scores both fixtures, checks the punch-list
npm run dev       # the Vite demo site locally
npm run build     # build the site to dist/
```

Fixtures in [`fixtures/`](fixtures/) model the two ends of the corpus: a
`good-repo` that assembles the paper's blueprint (scores 8/8) and a `bad-repo`
that is the median row — default ruleset, `@latest`, no PR gate,
`continue-on-error` (scores 0/8).

---

## Part of API Commons

An open governance tool from **[API Commons](https://apicommons.org)** — a CLI, a GitHub Action, and a browser demo at [auditor.apicommons.org](https://auditor.apicommons.org), free and Apache-2.0. Browse the full set at **[apicommons.org/tools](https://apicommons.org/tools/)**.

**Related tools**
- [Governance Pipeline](https://github.com/api-commons/governance-pipeline) — the forkable, PR-gated pipeline this audits against
- [Spectral Reporter](https://reporter.apicommons.org) — Spectral JSON → self-contained HTML report
- [Governance Baseline](https://baseline.apicommons.org) — adopt governance on a legacy estate; fail only new violations
- [Governance Coverage](https://coverage.apicommons.org) — how much of your API your rules actually check
- [Governance Scorecard](https://scorecard.apicommons.org) — the longitudinal health trend of your governance
- [API Validator](https://validator.apicommons.org) — lint OpenAPI/AsyncAPI/Arazzo/JSON Schema in your browser

---

## About

A project of [API Evangelist](https://apievangelist.com), maintained openly
under [API Commons](https://apicommons.org). The tools are free and open; API
Evangelist offers expert [governance services](https://apievangelist.com/services/)
— pipelines, rulesets, reviews, and policy — when you want experts in the loop.

Licensed under [Apache-2.0](LICENSE).

**Governance guidance** — the human *why* behind this tool: [Pipeline Maturity](https://guidance.apievangelist.com/store/pipeline-maturity/) at guidance.apievangelist.com.
