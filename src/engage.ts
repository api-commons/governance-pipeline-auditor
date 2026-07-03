// Weave API Evangelist governance services into the app. Every action routes to
// info@apievangelist.com over a mailto link, with the current context pre-filled
// — so engagement works even in a forked or fully local copy, with no backend.
// Governance Pipeline Auditor is free, open tooling; API Evangelist sells the
// expert services around it, and this is the always-present front door.
const EMAIL = 'info@apievangelist.com';
const APP = 'Governance Pipeline Auditor';
const SERVICES_URL = 'https://apievangelist.com/services/';

interface Service {
  title: string;
  blurb: string;
  cta: string;
  subject: string;
  url: string; // API Evangelist service detail page
  body: (ctx: string) => string;
}

// People arrive here holding a low pipeline score — so pipelines, rules, and
// reviews lead.
const SERVICES: Service[] = [
  {
    title: 'Pipelines',
    blurb: 'Stand up the CI/CD pipelines that make governance a real gate — Spectral at PR time, pinned and path-filtered, with a report published on every run.',
    cta: 'Fix my pipeline',
    url: `${SERVICES_URL}governance/pipelines/`,
    subject: 'API governance pipeline engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe audited our Spectral CI setup and want help closing the gaps — PR-time gating, pinned tooling, and a report on every run.\n\n${ctx}\n\nWhat does an engagement look like?\n\nThanks,`,
  },
  {
    title: 'Rules',
    blurb: 'Encode your organization’s standards as portable, owned, machine-readable Spectral rules — not the tool’s defaults — that you can run in CI, the editor, and the browser.',
    cta: 'Talk rulesets',
    url: `${SERVICES_URL}governance/rules/`,
    subject: 'Custom ruleset engagement',
    body: (ctx) => `Hi API Evangelist,\n\nOur pipeline runs defaults; we’d like a custom, owned ruleset that encodes our API standards.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Reviews',
    blurb: 'Formal reviews of your API artifacts and of the policies, rules, and pipelines that govern them — against best practices, OWASP, and your own standards.',
    cta: 'Request a review',
    url: `${SERVICES_URL}governance/reviews/`,
    subject: 'API governance review request',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like a governance review of our pipelines and the rules around them.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Policies',
    blurb: 'Turn the reasons behind each rule into written, owned policy so a red build has provenance a developer can question — not a cryptic code.',
    cta: 'Ground the rules',
    url: `${SERVICES_URL}governance/policies/`,
    subject: 'API governance policy engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe want the policy and provenance behind our governance rules written down and owned.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Skills',
    blurb: 'Define and iterate on the agent skills that let humans and machines operate your governance the same way.',
    cta: 'Build skills',
    url: `${SERVICES_URL}governance/skills/`,
    subject: 'Agent skills engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like help defining and governing agent skills for our operations.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Standards',
    blurb: 'Identify and develop the standards required to keep every aspect of your API operations interoperable.',
    cta: 'Develop standards',
    url: `${SERVICES_URL}discovery/standards/`,
    subject: 'API standards engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like help identifying and developing the standards our API operations need.\n\n${ctx}\n\nThanks,`,
  },
];

function mailto(s: Service, ctx: string): string {
  const body = `${s.body(ctx)}\n\n— sent from ${APP} (auditor.apicommons.org)`;
  return `mailto:${EMAIL}?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(body)}`;
}

// context: () => a short, plain-text summary of what the user is looking at, woven
// into the email so the engagement starts with real detail.
export function initEngage(context: () => string): void {
  const btn = document.getElementById('engage-ae');
  if (!btn) return;

  const modal = document.createElement('div');
  modal.className = 'modal engage-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card engage-card">
      <div class="modal-head">
        <span id="modal-title">Work with API Evangelist</span>
        <button type="button" class="engage-close" aria-label="Close">×</button>
      </div>
      <div class="engage-body">
        <p class="engage-intro">Governance Pipeline Auditor is open and free to run yourself. When you want experts in the loop,
          <a href="https://apievangelist.com" target="_blank" rel="noopener">API Evangelist</a> offers governance
          services — every option below opens an email to
          <a id="engage-email" href="mailto:${EMAIL}">${EMAIL}</a> with your current context filled in.</p>
        <div class="engage-services"></div>
        <p class="engage-foot"><a href="${SERVICES_URL}" target="_blank" rel="noopener">See all governance services →</a></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const listEl = modal.querySelector('.engage-services') as HTMLElement;
  const emailEl = modal.querySelector('#engage-email') as HTMLAnchorElement;
  const close = () => { modal.hidden = true; };

  function render(): void {
    const ctx = context();
    listEl.innerHTML = SERVICES.map((s, i) => `
      <div class="engage-service">
        <div class="engage-service-text"><strong>${s.title}</strong><span>${s.blurb}</span>
          <a class="engage-details" href="${s.url}" target="_blank" rel="noopener">details ↗</a></div>
        <a class="engage-cta" href="${mailto(s, ctx)}" data-i="${i}">${s.cta}</a>
      </div>`).join('');
    emailEl.href = mailto(SERVICES[0], ctx);
  }

  btn.addEventListener('click', () => { render(); modal.hidden = false; });
  modal.querySelector('.engage-close')!.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
