# Final 50-case evaluation package

This additive package reuses production generation, validation, recovery and provider configuration. Existing `evaluation/baselines`, references, historical runs and reports are preserved. It does not turn previous negative input cases into fictional generation successes. No full 50-case live run has been performed for this package.

- [Performance/results/readiness report](../../docs/final-performance-evaluation-report-2026-11-07.md)
- [Rubric and human-review instructions](RUBRIC.md)
- [50 fictional inputs](cases.mjs), expanded with canonical client/product context in [the final preflight manifest](evidence/preflight/manifest.json)
- [Actual before/after and judge evidence](evidence/), [copy integrity manifest](evidence/copy-manifest.json)
- [Real four-case judge records](evidence/judge/records.jsonl), [12 real messages in CSV](evidence/judge/messages.csv), [blank human review](evidence/judge/human-review.json)
- [Final 50-case mock summary](evidence/preflight/mock-summary.json): fixture execution only, not a paid/model quality result
- [Work log](WORK_LOG.md), [verification record](evidence/verification.json)

## Case design

`final-50-v1` uses the frozen application clock `2026-11-07T04:00:00Z` (November in Shanghai) for reproducible birthday-month handling. Cases are entirely fictional, use stored fictional profiles, and reference catalog/verified demo event facts. Greeting preparation does not assert that a future festival is today. Each case generates Concise, Detailed and Elegant together, so a style comparison holds the complete input fixed.

| Scenario       |     Cases | Coverage                                                                                                 |
| -------------- | --------: | -------------------------------------------------------------------------------------------------------- |
| Greeting       | F-001–008 | Birthday month; Christmas/Spring Festival/other festivals; sparse profile; contextual versus empty notes |
| Recommendation | F-009–026 | All 15 SKUs; selected facts/stories; personal/wedding/gift comparisons; sparse/no-selection profile      |
| Care           | F-027–032 | Six exact selected purchase records; three fictional clients                                             |
| Reactivation   | F-033–038 | No selection, Motif, Line and SKU; historical-interest conflicts                                         |
| Event          | F-039–043 | Verified name/date/time/location; optional selection at different depths                                 |
| Price          | F-044–050 | Competitor comparison; no SKU; Motif/Line scope; high-value product; price-within-budget negation        |

Controlled occasion comparison: **F-010, F-024, F-025** keep client, JAS-B01 and notes constant and change only occasion. Each set's three variants supplies the controlled style comparison. Reference examples in the existing `evaluation/references/` remain separate and are not used as model outputs or test-case ground truth.

## Run safely without a model

From the repository root:

```sh
npm test
npm run build
node scripts/smoke.mjs
node scripts/final-evaluation.mjs --plan
node scripts/final-evaluation.mjs --mock
```

The smoke test opens a local HTTP port and uses demo fixtures. `--plan` expands all inputs, validates READY status and records versions/hashes without generation. `--mock` runs production orchestration with a fixture fetch implementation, creates 150 fixture messages, validates them and tests exports. It makes zero external API calls and leaves judge/human scores empty. These commands need no API key. Mock timing is not live latency.

Every invocation writes a unique timestamp/UUID directory in `runtime/final-evaluation/` using exclusive file creation. Existing outputs are not overwritten. `runtime/` is ignored by Git; preserve approved evidence with a new named copy directory and SHA-256 manifest before submission.

## Real run — only after explicit user approval

The reviewed proposal is 50 cases, 150 messages, nominal 150 API calls and a default maximum of 250. It uses `.env` through Node's environment-file loader; the backend reads `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` server-side. `.env` is ignored. Set the generation model to `deepseek-flash`; `DEEPSEEK_JUDGE_MODEL` optionally selects a separate judge and otherwise uses the generation model. Never echo environment files or keys.

**The following command is an execution recipe, not approval. Do not run it until the user approves this plan and budget.**

```sh
node --env-file-if-exists=.env scripts/final-evaluation.mjs --live --approve-paid-run --max-api-calls 250
```

The CLI blocks `--live` without the explicit approval flag and a reviewed budget of at least 100; approval itself comes from the user. It first runs generation/factual audit across the cases, then separately judges complete outputs. Failed generations remain failed, empty output is never labeled executed successfully, and a failed judge leaves the case unscored. Real calls use the existing four-call per-case recovery policy by default. No demo fallback is accepted in live mode.

The global ceiling applies to actual calls, including retries and repairs. If exhausted, later cases are recorded incomplete; no calls past the ceiling are sent. Check the manifest's `maximumConfiguredCalls` if recovery environment overrides differ from defaults. No provider concurrency is added. The fixed clock measures the chosen evaluation context, not the machine's future date.

## Resume offline grading without regenerating valid messages

After an approved live run, a saved result directory can be re-exported/regraded. The importer requires matching final-case normalized inputs and live provenance, and rejects fixture outputs. Existing judge results are reused unless `--rejudge` is explicitly supplied. It reads aggregate `records.json`, or recovers per-case generation/judge checkpoints after interruption. Generation is never invoked on this path.

The already-completed four-case sample can be re-exported with **zero additional calls**:

```sh
node --env-file-if-exists=.env scripts/final-evaluation.mjs --judge-existing evaluation/final-v1/evidence/judge --max-api-calls 0
```

For a previously approved 50-case directory, use `--approve-paid-run` with `--judge-existing YOUR_RUN_DIRECTORY` and a budget matching only its unscored complete cases (up to 50 calls), or zero if all are already scored. Large judge-only runs require the approval flag. Do not pass `--rejudge` to a resume operation intended to reuse existing scores. The default small-sample judge budget is four, preventing accidental full-scale paid grading.

Human review import uses the same saved source and adds `--human-review PATH_TO_COMPLETED_JSON`; it does not rewrite that source. For a fully scored source use `--max-api-calls 0`. For a previously approved 50-case source also retain `--approve-paid-run`. The configured key is currently required for the live-source import mode even when its call budget is zero; no API request is sent at zero budget.

## Outputs and interpretation

| File                                        | Purpose                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                             | Complete 50 inputs, resolved context, input status, Git/source/prompt/Brand Bible hashes, model and configuration, expected/max calls                 |
| `F-xxx-generation.json`, `F-xxx-judge.json` | Per-case checkpoints; generation/source status, all three messages, full input, context, versions, performance, validations and scores/errors         |
| `records.json`, `records.jsonl`             | Complete case-level evidence with actual generation and judgment status                                                                               |
| `messages.csv`                              | Exactly three slots per planned/executed case; empty slots for failed cases, full input/context, validation, model/prompt, quality scores and latency |
| `provider-traces.json`                      | Call stage, requested/returned model, HTTP status, token usage and timing; no keys/headers                                                            |
| `summary.json`, `report.md`                 | Completion, hard/soft results, overall and per-scenario metrics, latency and human calibration status                                                 |
| `human-review.json`, `.csv`                 | Blank review worksheets, never fabricated human ratings                                                                                               |
| `human-review-submitted.json`               | Exact supplied review annotations retained with the exported run                                                                                      |
| `defects.json`                              | Generation errors, hard violations, judge hard-review flags, failed soft sets and judge failures                                                      |

CSV has a UTF-8 BOM and quotes multiline Chinese messages correctly. JSONL retains nested validation and performance data. Count successful output only when there are exactly three validated candidates; three export slots do not imply three generated messages. Generation success rate uses all requested cases as denominator; soft pass rate uses scored cases and must always be shown alongside scored/total counts. Case-level scores do not average away hard failures.

Use `records.jsonl` for the challenge's 50 Test Cases, `manifest.json` and source hashes for Methodology, summaries plus human adjudications for Evaluation Report, and `defects.json` plus the report's Q/J/P items for Defects and Next Steps. Link the actual run IDs and distinguish planned, fixture-executed, live-executed and human-reviewed work in the Work Log.

## Interpretation limits

The four live optimized sets passed production factual audit and deterministic evaluation. Only one passed the proposed soft cutoff. Human calibration has not happened, and event/reactivation have not been measured live in this task. A same-family judge can be biased; its possible-hard concerns require human adjudication. The project thresholds are declared criteria, not a claim about the employer's rubric. Preserve the first run even if a later version improves it.
