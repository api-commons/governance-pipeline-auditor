// report-html.js — the shared, pure HTML renderer for an audit result.
//
// Used by BOTH the Node CLI (bin/cli.js, via --html) and the browser demo
// (src/site.ts) so the report a team downloads is byte-for-byte what CI would
// attach. Plain ESM, ZERO dependencies, no Node/browser-only globals. Output is
// one self-contained HTML file (inline CSS + JS, no external/CDN requests) —
// the same discipline as @api-common/spectral-reporter, whose visual language
// this deliberately mirrors (dark, #ffc107 accent, stat tiles).

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {Object} audit  result of auditRepo()
 * @param {Object} [options]
 * @param {string} [options.title]
 * @param {string} [options.generatedAt] ISO timestamp (stamped by caller at render time)
 * @returns {string} a complete standalone HTML document
 */
export function renderAudit(audit, options = {}) {
  const opts = {
    title: 'API Governance Pipeline Audit',
    generatedAt: (audit && audit.meta && audit.meta.generatedAt) || new Date().toISOString(),
    ...options,
  };

  const score = audit.score || 0;
  const max = audit.maxScore || 8;
  const pct = Math.round((score / max) * 100);
  const maturity = audit.maturity || { label: '', blurb: '' };
  const signals = audit.signals || [];
  const punchlist = audit.punchlist || [];
  const antiPatterns = audit.antiPatterns || [];
  const meta = audit.meta || {};

  const generated = (() => {
    try {
      return new Date(opts.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return String(opts.generatedAt); }
  })();

  // Score dial color: red < 4, amber 4-5, green 6+.
  const dialColor = score >= 6 ? '#2da44e' : score >= 4 ? '#e3b341' : '#f14c4c';

  const banner = !meta.spectralFound
    ? `<div class="banner fail"><span class="banner-badge">NO PIPELINE</span><span class="banner-text">No Spectral governance pipeline was detected in this repository. The whole punch-list below applies.</span></div>`
    : score >= 6
      ? `<div class="banner pass"><span class="banner-badge">${maturity.label.toUpperCase()}</span><span class="banner-text">${esc(maturity.blurb)}</span></div>`
      : `<div class="banner warn"><span class="banner-badge">${maturity.label.toUpperCase()}</span><span class="banner-text">${esc(maturity.blurb)}</span></div>`;

  const signalTiles = signals.map((s) => `
      <div class="sig sig-${s.pass ? 'pass' : 'fail'}">
        <div class="sig-top">
          <span class="sig-mark" aria-hidden="true">${s.pass ? '✓' : '✕'}</span>
          <span class="sig-label">${esc(s.label)}</span>
          <span class="sig-verdict">${s.pass ? 'PASS' : 'FAIL'}</span>
        </div>
        <p class="sig-q">${esc(s.question)}</p>
        ${s.evidence ? `<code class="sig-ev" title="${esc(s.evidence)}">${esc(s.evidence)}</code>` : `<span class="sig-ev empty">— no evidence found —</span>`}
        <a class="sig-doc" href="${esc(s.docs)}" target="_blank" rel="noopener">docs ↗</a>
      </div>`).join('');

  const punchRows = punchlist.length
    ? punchlist.map((p, i) => `
      <li class="punch">
        <span class="punch-n">${i + 1}</span>
        <div class="punch-body">
          <div class="punch-title">${esc(p.title)}</div>
          <p class="punch-why">${esc(p.why)}</p>
          <p class="punch-how"><b>Fix:</b> ${esc(p.how)}</p>
          <a class="punch-doc" href="${esc(p.docs)}" target="_blank" rel="noopener">Why this matters ↗</a>
        </div>
      </li>`).join('')
    : `<li class="punch none">Nothing to fix — every mechanical signal in the rubric is present. Now go make sure a human wrote the rules on purpose.</li>`;

  const antiRows = antiPatterns.length
    ? `<section class="anti">
        <h2>Anti-patterns detected</h2>
        <ul>${antiPatterns.map((a) => `<li><span class="anti-dot" aria-hidden="true"></span><span>${esc(a.label)}${a.evidence ? ` <code>${esc(a.evidence)}</code>` : ''}</span></li>`).join('')}</ul>
      </section>`
    : '';

  const css = reportCss();

  return `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="@api-common/governance-pipeline-auditor">
<title>${esc(opts.title)}</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <div>
        <h1>${esc(opts.title)}</h1>
        <p class="head-meta">Generated ${esc(generated)} · ${meta.spectralWorkflowCount || 0} Spectral workflow${meta.spectralWorkflowCount === 1 ? '' : 's'} · ${meta.rulesetCount || 0} ruleset${meta.rulesetCount === 1 ? '' : 's'}</p>
      </div>
      <div class="dial" style="--dial:${pct}%;--dial-color:${dialColor}">
        <div class="dial-inner"><span class="dial-score">${score}</span><span class="dial-max">/ ${max}</span></div>
      </div>
    </div>
    ${banner}
  </header>

  <section class="signals" aria-label="Rubric signals">
    ${signalTiles}
  </section>

  ${antiRows}

  <section class="punchlist">
    <h2>Prioritized punch-list</h2>
    <p class="punch-lede">Do these in order — highest governance impact first. Each carries the why and a docs link, so a red result is a teachable moment.</p>
    <ol class="punches">${punchRows}</ol>
  </section>

  <footer class="foot">
    <span>Audited by <a href="https://auditor.apicommons.org" target="_blank" rel="noopener">@api-common/governance-pipeline-auditor</a>, an <a href="https://apicommons.org/tools/" target="_blank" rel="noopener">API Commons</a> tool.</span>
    <span>Rubric from the API Evangelist paper <a href="https://apievangelist.com" target="_blank" rel="noopener">“The State of Spectral in API Pipelines.”</a> Governance help from <a href="https://apievangelist.com/services/" target="_blank" rel="noopener">API Evangelist</a>.</span>
  </footer>
</div>
</body>
</html>`;
}

function reportCss() {
  return `
:root{
  --bg:#1e1e1e;--panel:#252526;--line:#3a3a3a;--fg:#e6e6e6;--muted:#9aa0a6;
  --accent:#ffc107;--info:#3794ff;--error:#f14c4c;--warn:#e3b341;--ok:#2da44e;
  --code:#2b2b2b;--shadow:0 1px 3px rgba(0,0,0,.5);
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.55}
a{color:var(--info);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:.82em}
.wrap{max-width:1000px;margin:0 auto;padding:1.5rem 1.25rem 3rem}
h1{margin:0;font-size:1.5rem;letter-spacing:-.01em}
h2{font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 .7rem}

.head{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1.25rem 1.35rem;box-shadow:var(--shadow);margin-bottom:1.25rem}
.head-top{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}
.head-meta{margin:.35rem 0 0;color:var(--muted);font-size:.9rem}
.dial{width:104px;height:104px;border-radius:50%;flex:0 0 auto;
  background:conic-gradient(var(--dial-color) var(--dial),#333 0);display:flex;align-items:center;justify-content:center}
.dial-inner{width:82px;height:82px;border-radius:50%;background:var(--panel);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0}
.dial-score{font-size:2rem;font-weight:800;line-height:1;color:var(--fg)}
.dial-max{font-size:.72rem;color:var(--muted)}

.banner{display:flex;align-items:center;gap:.75rem;border-radius:9px;padding:.7rem .9rem;margin-top:1.1rem;border:1px solid transparent}
.banner-badge{font-weight:800;letter-spacing:.06em;font-size:.72rem;padding:3px 9px;border-radius:5px;color:#1e1e1e;white-space:nowrap}
.banner.pass{background:rgba(45,164,78,.12);border-color:rgba(45,164,78,.4)} .banner.pass .banner-badge{background:var(--ok);color:#fff}
.banner.warn{background:rgba(227,179,65,.12);border-color:rgba(227,179,65,.4)} .banner.warn .banner-badge{background:var(--warn)}
.banner.fail{background:rgba(241,76,76,.12);border-color:rgba(241,76,76,.4)} .banner.fail .banner-badge{background:var(--error);color:#fff}
.banner-text{font-size:.92rem}

.signals{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem;margin-bottom:1.25rem}
.sig{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.75rem .8rem;display:flex;flex-direction:column;gap:.35rem;min-width:0}
.sig-top{display:flex;align-items:center;gap:.45rem}
.sig-mark{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:800;flex:0 0 auto}
.sig-pass .sig-mark{background:var(--ok);color:#fff} .sig-fail .sig-mark{background:var(--error);color:#fff}
.sig-label{font-weight:700;font-size:.86rem;flex:1;min-width:0}
.sig-verdict{font-size:.62rem;font-weight:800;letter-spacing:.06em;color:var(--muted)}
.sig-pass{border-color:rgba(45,164,78,.45)} .sig-fail{border-color:rgba(241,76,76,.4)}
.sig-q{margin:0;font-size:.78rem;color:var(--muted);line-height:1.4}
.sig-ev{background:var(--code);border-radius:5px;padding:3px 7px;color:#cfd3d6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.sig-ev.empty{color:var(--muted);background:transparent;padding:3px 0;font-size:.75rem}
.sig-doc{font-size:.74rem;align-self:flex-start}

.anti{background:var(--panel);border:1px solid rgba(241,76,76,.35);border-radius:12px;padding:1rem 1.15rem;box-shadow:var(--shadow);margin-bottom:1.25rem}
.anti ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:.5rem}
.anti li{display:flex;gap:.6rem;align-items:baseline;font-size:.9rem}
.anti-dot{width:8px;height:8px;border-radius:50%;background:var(--error);flex:0 0 auto;position:relative;top:1px}
.anti code{background:var(--code);border-radius:4px;padding:1px 5px;color:#cfd3d6}

.punchlist{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1.15rem 1.25rem;box-shadow:var(--shadow)}
.punch-lede{margin:0 0 1rem;color:var(--muted);font-size:.88rem}
.punches{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.8rem}
.punch{display:flex;gap:.85rem;align-items:flex-start;border:1px solid var(--line);border-radius:9px;padding:.8rem .9rem;background:var(--bg)}
.punch-n{width:26px;height:26px;border-radius:50%;background:var(--accent);color:#1e1e1e;font-weight:800;font-size:.85rem;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}
.punch-body{min-width:0}
.punch-title{font-weight:700;font-size:.98rem}
.punch-why{margin:.25rem 0;color:#c8c8c8;font-size:.88rem}
.punch-how{margin:.25rem 0;font-size:.88rem}
.punch-how b{color:var(--accent)}
.punch-doc{font-size:.8rem}
.punch.none{color:var(--ok);font-size:.92rem;border-color:rgba(45,164,78,.4)}

.foot{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem;display:flex;flex-direction:column;gap:.25rem}

@media(max-width:860px){.signals{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.signals{grid-template-columns:1fr}}
`;
}

export default renderAudit;
