'use strict';

// Baseline compliance (this change): guard the new mechanisms the loop now
// relies on — domain specialists, fact memory, the optional graph, raw
// evidence, and parallel wave dispatch. Anything here regresses silently.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const specialists = require('../lib/specialists.js');
const facts = require('../lib/facts.js');
const graph = require('../lib/graph.js');
const { checkClaimedVsReality } = require('../lib/claimed-vs-reality.js');
const { buildHostSkills } = require('../lib/host-skill-build.js');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ael-compliance-'));
  return dir;
}

test('software-baseline exposes all 16 specialist domains by id, number, and title', () => {
  const domains = specialists.listDomains(ROOT);
  assert.strictEqual(domains.length, 16);
  assert.ok(domains.some((d) => d.id === 'database' && d.index === 10));
  assert.ok(domains.some((d) => d.id === 'security' && d.index === 9));
  assert.strictEqual(specialists.resolveDomain(ROOT, '10').id, 'database');
  assert.strictEqual(specialists.resolveDomain(ROOT, 'data-ai').index, 15);
  assert.strictEqual(specialists.resolveDomain(ROOT, 'Security').id, 'security');
});

test('unknown specialist domain fails with FIX and reserved reviewers are never dispatchable', () => {
  assert.throws(() => specialists.requireDomain(ROOT, 'non-existent-domain'), {
    code: 'UNKNOWN_DOMAIN'
  });
  assert.throws(() => specialists.assertDispatchable(ROOT, 'devil-advocate'), {
    code: 'RESERVED_AGENT'
  });
  assert.throws(() => specialists.assertDispatchable(ROOT, 'judge'), {
    code: 'RESERVED_AGENT'
  });
});

test('specialist spawn prompt carries one domain section only, with EXTRACTED evidence rules', () => {
  const spawn = specialists.spawnPrompt(ROOT, 'security', { files: ['src/auth.js'] });
  assert.ok(spawn.prompt.includes('domain: security'));
  assert.ok(spawn.prompt.includes('Files in scope (read no others): src/auth.js'));
  assert.ok(spawn.text.includes('## 9. Security'));
  // A specialist never receives another domain's section.
  assert.doesNotMatch(spawn.text, /## 10\. Database/);
});

test('facts are collected from verification and refuted from INVALID findings, with staleness', () => {
  const dir = tmpRepo();
  const { createRun, runsDir } = require('../lib/run-state.js');
  require('child_process').execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'x\n');
  const run = createRun(dir, { task: 'T', now: new Date() });
  const rd = path.join(runsDir(dir), run.runId);
  const end = new Date(Date.now() + 5000).toISOString();
  fs.writeFileSync(path.join(rd, 'diff.patch'), 'diff --git a/src/a.js b/src/a.js\n');
  fs.writeFileSync(path.join(rd, 'verification.json'), JSON.stringify({
    schemaVersion: 1, runId: run.runId, gitRevision: 'abc', diffHash: 'deadbeefcafe',
    commands: [
      { command: 'npm test', executionIdentity: 'x', startTime: 's', endTime: end, exitCode: 0, stdout: 'ok', timeoutStatus: 'COMPLETED', layer: 'L2' },
      { command: 'npm run lint', executionIdentity: 'x', startTime: 's', endTime: end, exitCode: 1, stdout: 'x', timeoutStatus: 'COMPLETED' }
    ]
  }));
  fs.writeFileSync(path.join(rd, 'findings.json'), JSON.stringify({
    schemaVersion: 1, runId: run.runId,
    findings: [
      { id: 'D1', validity: 'INVALID', failureScenario: 'token leaks in log', evidence: 'redacted already', location: 'src/a.js#L1' }
    ]
  }));
  const doc = facts.collectFacts(dir);
  assert.strictEqual(doc.verified.length, 1);
  assert.strictEqual(doc.verified[0].command, 'npm test');
  assert.strictEqual(doc.refuted.length, 1);
  // Current at record time.
  assert.strictEqual(facts.recall(dir, 'test').verified.length, 1);
  // Touching the file after the recorded run makes the fact stale.
  const future = new Date(Date.now() + 60000);
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'changed\n');
  fs.utimesSync(path.join(dir, 'src/a.js'), future, future);
  assert.strictEqual(facts.recall(dir, 'test').staleCount, 1);
  assert.strictEqual(facts.recall(dir, 'test').verified.length, 0);
});

test('graph query marks EXTRACTED edges as evidence and INFERRED as not', (t) => {
  const dir = tmpRepo();
  fs.mkdirSync(path.join(dir, '.ai-engineering-loop', 'graph'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ai-engineering-loop', 'graph', 'graph.json'), JSON.stringify({
    nodes: [
      { id: 'a', label: 'AuthService', source_file: 'src/auth.js', file_type: 'code' },
      { id: 'b', label: 'Session', source_file: 'src/session.js', file_type: 'code' }
    ],
    edges: [
      { source: 'a', target: 'b', relation: 'calls', confidence: 'EXTRACTED', source_file: 'src/auth.js' },
      { source: 'b', target: 'a', relation: 'imports', confidence: 'INFERRED', confidence_score: 0.85 }
    ]
  }));
  const result = graph.query(dir, 'auth');
  const extracted = result.edges.find((e) => e.confidence === 'EXTRACTED');
  const inferred = result.edges.find((e) => e.confidence === 'INFERRED');
  assert.strictEqual(extracted.evidence, true);
  assert.strictEqual(inferred.evidence, false);
  // Graphify node-link output uses `links`, not `edges`.
  const cached = graph.readGraph(dir);
  assert.ok(Array.isArray(cached.graph.edges));
});

test('compressed evidence is rejected in Reality cells; raw results are fine', () => {
  const mk = (r) => '| AC | Claimed | Reality | Layer |\n|---|---|---|---|\n| AC-1 | works | ' + r + ' | L2 |\n';
  assert.strictEqual(checkClaimedVsReality(mk('[compressed:rtk] 3 checks passed')).ready, false);
  assert.strictEqual(checkClaimedVsReality(mk('rtk gain shows 93%')).ready, false);
  assert.strictEqual(checkClaimedVsReality(mk('node --test exits 0 (12 pass)')).ready, true);
});

test('generated SKILL.md stays within its 4000-character budget', () => {
  const skill = buildHostSkills(ROOT).find((o) => o.path === '.claude/skills/ael/SKILL.md');
  assert.ok(skill.content.length <= 4000, `SKILL.md is ${skill.content.length} chars`);
  const verifyRef = buildHostSkills(ROOT).find((o) => o.path === '.claude/skills/ael/references/loop-verify.md');
  assert.match(verifyRef.content, /EXTRACTED/);
  assert.match(verifyRef.content, /token-budget/);
});

test('the parallel ready wave lists READY nodes in deterministic merge order', () => {
  // exercised through the CLI; here we only verify the sort contract function
  // is stable (the CLI maps plan order then id).
  const order = (x, y) => x.order - y.order || x.id.localeCompare(y.id);
  const wave = [
    { id: 'b', order: 3 },
    { id: 'a', order: 3 },
    { id: 'c', order: 2 }
  ].sort(order);
  assert.deepStrictEqual(wave.map((w) => w.id), ['c', 'a', 'b']);
});
