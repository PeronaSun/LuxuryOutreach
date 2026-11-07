# Maison Lioré — Evaluation & Iteration

Baseline: **baseline-2026-11-06-e5856af7**. All production files and pre-existing outputs are preserved. This directory contains new evaluation artifacts only; no production prompt, generation code, dependency, or Git history was changed.

## Deliverables

1. [Current Generation Pipeline Audit](baselines/baseline-2026-11-06-e5856af7/pipeline-audit.md)
2. [Baseline Version Record](baselines/baseline-2026-11-06-e5856af7/baseline-version.md) and [machine-readable manifest](baselines/baseline-2026-11-06-e5856af7/baseline-version.json)
3. [18 proposed cases and controls](baselines/baseline-2026-11-06-e5856af7/cases.md) and [complete frozen requests](baselines/baseline-2026-11-06-e5856af7/cases.json)
4. [Reusable evaluation rubric](baselines/baseline-2026-11-06-e5856af7/rubric.md)
5. [Initial risks, observed defects and next steps](baselines/baseline-2026-11-06-e5856af7/risks-and-next-steps.md)
6. [Initial evidence report](baselines/baseline-2026-11-06-e5856af7/initial-evaluation-report.md), [methodology and 50-case expansion plan](methodology.md), and [work log](work-log.md)

## Run from the repository root

Use the existing supported Node runtime. The core evaluation runner uses Node built-ins and the frozen production modules; no new dependencies or running UI server are required.

```sh
# Factual completeness, resolution, prompt capture and version checks only.
# No generation; message slots remain null.
node evaluation/tools/run-baseline.mjs --mode validate

# Explicit deterministic template smoke run. Not an AI-quality benchmark.
node evaluation/tools/run-baseline.mjs --mode demo

# Live generation and production same-model audit.
# Configure OPENAI_API_KEY securely in .env first; keep it out of Git/artifacts.
node --env-file-if-exists=.env evaluation/tools/run-baseline.mjs --mode live

# Check frozen source, unchanged original files/outputs, and execution-state evidence.
node evaluation/tools/check-evidence.mjs
```

The default baseline ID is the one above. An explicit invocation is:

```sh
node evaluation/tools/run-baseline.mjs --baseline baseline-2026-11-06-e5856af7 --mode validate
```

The live runner explicitly sets `demo:false`, even if UI `.env` has `DEMO_MODE=true`, and records that override. Its model is the frozen configured identifier `gpt-4.1-mini`. An explicitly different `OPENAI_MODEL` is rejected rather than silently changing the baseline. Configure the key without changing that model; a different model requires a separately versioned comparison. A missing key causes exit code **2**, `CONFIGURATION_BLOCKED`, no provider calls, no attempts, and null messages. No templates are substituted. This missing-key path was actually checked.

With this set, at most **30 paid API requests** can occur in a successful live pass: 15 READY cases × one generation and one audit call. Some cases may stop before audit if output validation fails. This is a call bound, not a cost estimate. The runner is sequential and implements no retries. The configured model may be an alias, so actual provider-returned model metadata is captured when available.

## Output and execution semantics

Each invocation creates a unique, new `baselines/<id>/runs/<UTC-timestamp>-<mode>-<random-id>/` directory. Files are created exclusively; previous runs are not overwritten. Do **not** use the old `npm run evaluate` scripts for evidence preservation: those write to fixed existing filenames.

| File | Contents |
| --- | --- |
| `run-start.json` | Source/case/tool hashes, mode, configured model, configuration preflight and start time |
| `records.jsonl` | Append-only per-case records; preserves completed cases if a later operation stops |
| `records.json` | Full inputs, resolved profiles/history/purchase/event, actual prompt and fingerprints, three message slots, output validation and execution status |
| `provider-traces/` | Actual request bodies and provider response/metadata for live attempts; no Authorization headers or saved API keys |
| `summary.json`, `run-report.md` | Counts by stage and configuration/generation failures; not a subjective quality score |
| `human-review.csv` | UTF-8 BOM, 54 candidate slots, complete inputs, actual message text when available, empty rubric/reviewer cells |

`NOT_EXECUTED` and `NOT_EXECUTED_INPUT_REJECTED` have no generated messages. `DEMO_GENERATED` means the template function actually returned three texts, not that an LLM ran. `LIVE_GENERATED_RELEASED` means actual live messages were returned and passed the application's release filter. `LIVE_GENERATED_WITHHELD` preserves actual raw parts/drafts separately when the model generated them but production checks refused release. `ATTEMPTED_NO_COMPLETE_OUTPUT` is a request failure/refusal/incomplete response, not usable prose. Source definitions stay NOT_EXECUTED; run records are authoritative for execution.

All runs currently have **zero live generations**. The separate demo run has 15 template generations and 45 actual template messages. Human quality scores are blank. See the evidence report for actual run links and known defects.

## Review and future iteration

Make a **new copy** of a run's `human-review.csv` for annotations; retain raw run artifacts. Apply the rubric, cite source facts, and keep template and live populations separate. Baseline behavior matching is not desired-business correctness: B18 is an intentional discrepancy.

Future runner invocations import `snapshot/server/...`, not the current working generation module. Therefore subsequent application edits do not silently replace this baseline. Each run checks the frozen source and case hashes. `check-evidence.mjs` additionally requires the current production tree and old outputs to remain identical during this audit phase; after an intentional future iteration it can correctly report current-tree drift even though baseline execution remains frozen.

To capture a future implementation version, first choose a new commit/working tree and ID, then use `capture-baseline.mjs --id <new-id>`; do not reuse this directory. Author/freeze a separate case-set version before running it. The current cases are held fixed for the first comparison. See the methodology for an explicit 18→50 plan and denominator rules.
