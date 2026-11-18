'use strict';

// Fact memory: what past Runs actually proved, and what a reviewer already
// refuted. `learn` clusters prose findings into lessons; facts are the other
// half — commands that exited 0 against a diff hash, and findings a human or
// the Judge marked INVALID. A fact is reusable only while the files it touched
// are unchanged, so an outdated fact can never be quoted as current truth.

const fs = require('fs');
const path = require('path');
const { atomicWriteJson, runsDir } = require('./run-state.js');
const { listRunHistory } = require('./run-history.js');
const { readJsonOptional } = require('./fsutil.js');
const { estimateTokens, redactSecrets } = require('./safe-context.js');

const FACTS_FILE = path.join('.ai-engineering-loop', 'facts.json');
const FACTS_BUDGET_SHARE = 0.1;
const MAX_CONTEXT_FACTS = 3;
const MAX_COMMAND_CHARS = 200;
const MAX_REFUTED_CHARS = 200;
const NON_FACT_SOURCES = new Set(['impact-map']);

function factsPath(rootDir) {
  return path.join(rootDir, FACTS_FILE);
}

function readRegularJson(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 256 * 1024) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Paths the Run touched, parsed from the Run's own diff.patch. The patch is
// already persisted by `gate maker`, so no extra capture step is needed.
function diffPaths(runDir) {
  let patch;
  try {
    patch = fs.readFileSync(path.join(runDir, 'diff.patch'), 'utf8');
  } catch {
    return [];
  }
  const paths = new Set();
  for (const match of patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)) paths.add(match[2].trim());
  return [...paths].filter((file) => file && !file.split('/').includes('..')).sort();
}

function clean(value, max) {
  return redactSecrets(String(value ?? '').replace(/\s+/g, ' ').trim()).text.slice(0, max);
}

function verifiedFrom(rootDir, run, runDir) {
  const bundle = readRegularJson(path.join(runDir, 'verification.json'));
  if (!bundle || !Array.isArray(bundle.commands) || !bundle.diffHash) return [];
  const files = diffPaths(runDir);
  return bundle.commands
    .filter((record) => record && record.exitCode === 0 && record.timeoutStatus === 'COMPLETED')
    .map((record) => ({
      kind: 'verified',
      command: clean(record.command, MAX_COMMAND_CHARS),
      layer: /^L[123]$/.test(String(record.layer)) ? record.layer : null,
      runId: run.runId,
      gitRevision: bundle.gitRevision || null,
      diffHash: bundle.diffHash,
      recordedAt: record.endTime || run.createdAt || '',
      files
    }));
}

function refutedFrom(run, runDir) {
  const ledger = readRegularJson(path.join(runDir, 'findings.json'));
  if (!ledger || !Array.isArray(ledger.findings)) return [];
  return ledger.findings
    .filter((finding) => finding && finding.validity === 'INVALID' && !NON_FACT_SOURCES.has(finding.source))
    .map((finding) => ({
      kind: 'refuted',
      claim: clean(finding.failureScenario, MAX_REFUTED_CHARS),
      reason: clean(finding.evidence || finding.reproduction || 'marked INVALID by review', MAX_REFUTED_CHARS),
      location: clean(finding.location, MAX_COMMAND_CHARS),
      runId: run.runId,
      recordedAt: run.createdAt || ''
    }))
    .filter((fact) => fact.claim);
}

// Deterministic: Runs oldest first, then command/id, so the bytes only change
// when a fact changes. Nothing here calls a model or reads a timestamp of its own.
function collectFacts(rootDir) {
  const runs = [...listRunHistory(rootDir).runs].reverse();
  const verified = new Map();
  const refuted = new Map();
  for (const run of runs) {
    const runDir = path.join(runsDir(rootDir), run.runId);
    for (const fact of verifiedFrom(rootDir, run, runDir)) {
      const key = `${fact.command}|${fact.diffHash}`;
      const previous = verified.get(key);
      if (!previous || String(fact.recordedAt) > String(previous.recordedAt)) verified.set(key, fact);
    }
    for (const fact of refutedFrom(run, runDir)) {
      const key = `${fact.claim}|${fact.location}`;
      if (!refuted.has(key)) refuted.set(key, fact);
    }
  }
  const byCommand = (left, right) => left.command.localeCompare(right.command) || left.runId.localeCompare(right.runId);
  const byClaim = (left, right) => left.claim.localeCompare(right.claim) || left.runId.localeCompare(right.runId);
  return {
    schemaVersion: 1,
    generator: 'ael-facts-v1',
    sourceRuns: runs.length,
    latestRunId: runs.length ? runs[runs.length - 1].runId : null,
    verified: [...verified.values()].sort(byCommand),
    refuted: [...refuted.values()].sort(byClaim)
  };
}

function writeFacts(rootDir, document) {
  atomicWriteJson(factsPath(rootDir), document);
  return { path: FACTS_FILE.split(path.sep).join('/'), verified: document.verified.length, refuted: document.refuted.length };
}

// A fact outlives its Run only while every file it touched is still there and
// untouched since the Run was recorded. mtime is a cheap proxy: a file edited
// after the Run cannot still be covered by that Run's proof.
function staleReasons(rootDir, fact, runCreatedAt) {
  const reasons = [];
  const cut = Date.parse(fact.recordedAt || runCreatedAt || '');
  for (const file of fact.files || []) {
    const absolute = path.join(rootDir, file);
    let stat;
    try {
      stat = fs.lstatSync(absolute);
    } catch {
      reasons.push(`files-removed: ${file}`);
      continue;
    }
    if (!stat.isFile()) continue;
    if (Number.isFinite(cut) && stat.mtimeMs > cut + 1000) reasons.push(`modified-after-run: ${file}`);
  }
  return reasons;
}

function loadFacts(rootDir) {
  const document = readJsonOptional(factsPath(rootDir));
  return document?.schemaVersion === 1 ? document : null;
}

// `ael recall "<query>"`: facts that match the query, current ones first.
function recall(rootDir, query, { limit = 10, includeStale = false } = {}) {
  const document = loadFacts(rootDir) || collectFacts(rootDir);
  const needle = String(query || '').trim().toLowerCase();
  const matches = (value) => !needle || String(value || '').toLowerCase().includes(needle);
  const live = [];
  const stale = [];
  for (const fact of document.verified) {
    if (!matches(fact.command) && !(fact.files || []).some(matches)) continue;
    const reasons = staleReasons(rootDir, fact);
    const entry = { ...fact, stale: reasons.length > 0, staleReasons: reasons };
    (reasons.length ? stale : live).push(entry);
  }
  const refuted = document.refuted.filter((fact) => matches(fact.claim) || matches(fact.location) || matches(fact.reason));
  return {
    query: String(query || ''),
    sourceRuns: document.sourceRuns,
    verified: live.slice(0, limit),
    stale: includeStale ? stale.slice(0, limit) : [],
    staleCount: stale.length,
    refuted: refuted.slice(0, limit)
  };
}

// Top-K current facts for a context pack, kept inside `budgetTokens`.
function selectFacts(rootDir, { files = [], budgetTokens = 0, limit = MAX_CONTEXT_FACTS } = {}) {
  const budget = Math.max(0, Math.floor(budgetTokens));
  const document = loadFacts(rootDir);
  if (!document || !budget) return { facts: [], estimatedTokens: 0 };
  const wanted = new Set(files.map((file) => String(file).replace(/\\/g, '/')));
  const ranked = document.verified
    .filter((fact) => !wanted.size || fact.files.some((file) => wanted.has(file)))
    .filter((fact) => staleReasons(rootDir, fact).length === 0)
    .sort((left, right) => right.files.length - left.files.length || left.command.localeCompare(right.command));
  const selected = [];
  let tokens = 0;
  for (const fact of ranked) {
    if (selected.length >= limit) break;
    const item = {
      command: fact.command,
      layer: fact.layer,
      runId: fact.runId,
      diffHash: String(fact.diffHash).slice(0, 12),
      files: fact.files.slice(0, 5)
    };
    const cost = estimateTokens(JSON.stringify(item));
    if (tokens + cost > budget) continue;
    selected.push(item);
    tokens += cost;
  }
  return { facts: selected, estimatedTokens: tokens };
}

module.exports = {
  FACTS_FILE,
  FACTS_BUDGET_SHARE,
  MAX_CONTEXT_FACTS,
  collectFacts,
  writeFacts,
  loadFacts,
  recall,
  selectFacts,
  staleReasons
};
