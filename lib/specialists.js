'use strict';

// Domain specialists. The 16 domains live in core/software-baseline.md: its
// "Specialist domains" table is the id registry and its `## N. Title` headings
// are the readable sections. A specialist reads one section, reports findings
// with a harness layer, and never edits or votes.

const { readDoc } = require('./docs.js');

const BASELINE_DOC = 'software-baseline';
const DOMAIN_HEADING = /^##\s+(\d{1,2})\.\s+(.+?)\s*$/gm;
const DOMAIN_ROW = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(\d{1,2})\s+(.+?)\s*\|/gm;
const RESERVED_AGENTS = Object.freeze(['devil-advocate', 'judge']);

function specialistError(message, code = 'SPECIALIST_FAILED', { why = null, fix = null } = {}) {
  const error = new Error(message);
  error.code = code;
  error.why = why;
  error.fix = fix;
  return error;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Domain ids come from the table, titles from the headings, so a section can be
// read by number+title while a spawn prompt still gets a short id.
function listDomains(root) {
  const text = readDoc(BASELINE_DOC, { root }).text;
  const titles = new Map();
  for (const match of text.matchAll(DOMAIN_HEADING)) titles.set(Number(match[1]), match[2]);
  const domains = [];
  for (const match of text.matchAll(DOMAIN_ROW)) {
    const index = Number(match[2]);
    const title = titles.get(index) || match[3];
    domains.push({ id: match[1], index, title, section: `${index}. ${title}` });
  }
  return domains;
}

// Accepts the id, the section number, or a case-insensitive title substring.
function resolveDomain(root, name) {
  const needle = normalize(name);
  if (!needle) return null;
  const domains = listDomains(root);
  return domains.find((domain) => normalize(domain.id) === needle)
    || domains.find((domain) => String(domain.index) === String(name).trim())
    || domains.find((domain) => normalize(domain.title).includes(needle))
    || null;
}

function requireDomain(root, name) {
  const domain = resolveDomain(root, name);
  if (domain) return domain;
  throw specialistError(`Unknown specialist domain "${name}".`, 'UNKNOWN_DOMAIN', {
    why: 'Only the domains in core/software-baseline.md are dispatch targets; an invented domain has no section to apply.',
    fix: `Use one of: ${listDomains(root).map((item) => item.id).join(', ')}. Run \`npx ai-engineering-loop specialist --json\` for the list.`
  });
}

function domainSection(root, domain) {
  return readDoc(BASELINE_DOC, { root, section: domain.section }).text;
}

// A specialist never receives the whole baseline: one section, its id, and the
// paths it may read.
function spawnPrompt(root, name, { files = [], diff = null, goal = null } = {}) {
  const domain = requireDomain(root, name);
  const scope = [...new Set(files.map(String))];
  return {
    domain,
    text: domainSection(root, domain),
    prompt: [
      `You are the ${domain.title} specialist (domain: ${domain.id}).`,
      `Apply only this section: npx ai-engineering-loop docs software-baseline --section "${domain.section}".`,
      diff ? `Diff: ${diff}` : 'Diff: read the path the parent gave you.',
      goal ? `Goal Contract: ${goal}` : null,
      scope.length ? `Files in scope (read no others): ${scope.join(', ')}` : null,
      'Read-only. Every finding needs a quoted observation and a layer (L1 static, L2 tests, L3 end-to-end). What you could not observe is UNKNOWNS, never a finding.',
      'Never return PASS, ITERATE, or ESCALATE; only the Judge decides.'
    ].filter(Boolean).join('\n')
  };
}

// A specialist must never stand in for the Devil's Advocate or the Judge: its
// output schema and its scope are both narrower.
function assertDispatchable(root, name) {
  const normalized = normalize(name);
  if (RESERVED_AGENTS.includes(normalized)) {
    throw specialistError(`${normalized} is a reviewer agent, not a specialist.`, 'RESERVED_AGENT', {
      why: 'The Devil\'s Advocate and the Judge own the review gates; a specialist report cannot fill either.',
      fix: `Spawn \`${normalized}\` as a fresh sibling; use a specialist only to brief the Maker or the Devil's Advocate.`
    });
  }
  return requireDomain(root, name);
}

module.exports = {
  BASELINE_DOC,
  RESERVED_AGENTS,
  listDomains,
  resolveDomain,
  requireDomain,
  domainSection,
  spawnPrompt,
  assertDispatchable,
  specialistError
};
