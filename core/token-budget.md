# Token Budget and Compression

Three external tools shrink what a model reads and writes. Each is optional, each has one job, and none of them may touch evidence.

| Tool | Job | Where it fits |
|---|---|---|
| [rtk](https://github.com/rtk-ai/rtk) | Compress command **output** (test runs, diffs, logs, builds) before it enters the conversation | Exploration, failing-test triage, reading a long build log |
| [caveman](https://github.com/juliusbrussee/caveman) | Shorter **answers** and smaller tool payloads; code and commands stay verbatim | Chat replies, status updates, finding wording |
| [ponytail](https://github.com/dietrichgebert/ponytail) | Fewer lines written: delete before adding, no unrequested abstraction | Design and Maker decisions, not output |

They are external binaries or skills. AEL does not depend on them, does not install them, and never bundles them: `package.json` keeps zero runtime dependencies.

## The one rule that overrides all three

**Evidence is raw.** Token compression applies to what a model *reads while working*, never to what a gate *checks afterwards*.

| Artifact | Compression allowed? |
|---|---|
| `verification.json` `stdout` | **Never.** It is the recorded command output; `verify` captures it directly. |
| `diff.patch` and its sha256 | **Never.** Gates bind to that hash. |
| `claimed-vs-reality.md` Reality cells | **Never.** A Reality cell quoting a compressor marker is rejected (`COMPRESSED_MARKER` in `lib/claimed-vs-reality.js`). |
| Finding `evidence` quotes in the ledger | Quote the raw lines the diff shows, not a summary of them. |
| Context packs, exploration output, chat replies | Yes, this is what the tools are for. |

If a compressed view is all you have, re-run the command through `verify` (or paste the raw tail from `rtk recall`) before it becomes a Reality cell. A gate that accepted a summary would let a model's own compression stand in for the command's real output.

## Reported savings do not change a verdict

Compression ratios (`rtk gain`, caveman benchmarks) are claims about cost, not about correctness. Never use a savings number as evidence that a change works, and never cite one in `claimed-vs-reality.md`, the Finding Ledger, or the verdict.

## Reading a project without reading every file

Before opening files one by one, use the cheapest structural view that answers the question:

1. `ael graph query "<question>"` — the repository graph, when it has been built.
2. `docs software-baseline --section "<domain>"` — the traps that domain produces.
3. `ael specialist <domain> --prompt` — a read-only consultant for one domain.
4. Targeted `read`/`grep` on the paths the previous steps named.

A graph edge is evidence only when it is tagged `EXTRACTED`. `INFERRED` edges are hypotheses and appear as `[INFERENCE]` in any finding.
