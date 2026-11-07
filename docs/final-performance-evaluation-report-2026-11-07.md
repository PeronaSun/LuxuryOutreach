# Final performance and evaluation preparation — November 7, 2026

The measured customer-facing median decreased from **4.205 s to 3.518 s (16.3%)**. Four matched live requests passed in each phase without repairs or retries. This is directional evidence from a small sample, not a statistically established speedup or reliability guarantee. The 50-case execution framework is prepared; **the full paid evaluation has not run**. A four-case offline judge sample passed the project-defined soft threshold in only **1/4 cases**; quality sign-off and human calibration remain pending.

## Measured pipeline and bottlenecks

Each live request normalizes its input, resolves the selected canonical scope and client context, builds a structured prompt, generates all three styles in one DeepSeek Responses call, parses and validates them, then runs the mandatory semantic factual audit. Only validated output reaches the frontend. Repairs are bounded and reuse the same canonical context. The factual audit depends on the generated candidates, so those two calls cannot safely run in parallel.

| Stage / metric                                       | Before: advisor-1.4.1 | After: advisor-1.5.0 |
| ---------------------------------------------------- | --------------------: | -------------------: |
| Local HTTP request median                            |           4,204.54 ms |          3,517.58 ms |
| Local HTTP request exploratory p95                   |           4,678.69 ms |          4,107.77 ms |
| Input normalization median                           |              0.041 ms |             0.027 ms |
| Canonical catalog/context resolution median          |              0.310 ms |             0.232 ms |
| Prompt/context assembly median                       |              0.044 ms |             0.051 ms |
| Generation API median                                |           2,547.23 ms |          2,480.30 ms |
| Mandatory factual audit API median                   |           1,639.11 ms |            976.84 ms |
| Candidate JSON parsing median, summed within request |              0.029 ms |             0.023 ms |
| Structured schema checking median                    |              0.076 ms |             0.070 ms |
| Local factual/output checking median                 |              2.302 ms |             1.820 ms |
| Provider calls across four requests                  |                     8 |                    8 |
| Requests requiring retry / repair                    |                 0 / 0 |                0 / 0 |
| Input tokens / cached subset                         |       46,840 / 21,376 |       27,527 / 5,760 |
| Output tokens                                        |                 1,382 |                  960 |
| Successful live requests / messages                  |                4 / 12 |               4 / 12 |
| Separate DOM commit median / exploratory p95         |      13.46 / 18.13 ms |     14.98 / 17.67 ms |

Stage medians are independently computed and do not sum to the total median. API timing includes obtaining/parsing the provider response envelope; candidate JSON and schema timings are reported separately. The HTTP measurement includes the real local backend route and persistence but excludes browser paint. DOM figures replay the saved real bracelet result four times per phase in JSDOM, measuring JSON-ready to three message-card DOM commits. They exclude development compilation and scripted waits and do not establish real-browser paint performance.

The remote generation and audit dominate. Local lookup, parsing and validation are far too small to justify a catalog redesign. No retry or repair occurred in these eight live requests, so their added production latency is **unmeasured**. Existing fault-injection tests cover recovery behavior, not real recovery speed. The nearest-rank p95 with n=4 is the maximum observation; it is not a reliable tail estimate. Cache hits, model output content and provider load differ between phases, and the two changes were not independently ablated.

## Changes justified by the measurements

- `server/brand-context.mjs` reads Brand Bible v1 once and caches exact relevant section excerpts. Core facts, generation tone, the full section 06 hard rules and the requested scenario are retained. Unrelated personas and other SKU tables are omitted. Selected Motif/Line stories and exact SKU facts remain in the canonical payload; tests cover all 15 products and all six scenarios. This is deterministic scoped retrieval, with no embeddings or vector database.
- The synchronous audit now focuses on hard factual, scope, scenario, context and safety constraints. Subjective naturalness, style and story-depth grading runs in a separate offline judge. The same hard rule identifiers, schema, severity mapping and mandatory audit remain active. No hard guardrail was removed.
- All three styles still use one generation call. Valid first responses do not trigger regeneration. Existing bounded transient retries and candidate repair remain unchanged: default four total provider calls, one transient retry, one output repair, 45-second per-call timeout, 2,400 maximum output tokens and temperature 0.2. Environment overrides are captured in evaluation manifests.
- Stage timing, token counts, requested/returned model IDs and call counts are captured without authorization headers or API keys. No UI files or dependencies changed.

Input tokens fell **41.2%**, output tokens **30.5%**, and exploratory p95 fell **12.2%**. Most observed latency reduction was in the factual audit. Reducing the call count or retry allowance is not justified by this sample.

Streaming was considered but not enabled. The app expects complete structured JSON, exactly three candidates, local validation and the subsequent factual audit. Displaying partial text would bypass that release boundary. Buffering an entire stream until auditing finishes offers no meaningful first-visible-message improvement; changing that contract before November 9 is unjustified.

## Version and evidence record

Starting Git commit: `d66c54b` (full hash in [comparison.json](../evaluation/final-v1/evidence/comparison.json)). The optimized working tree is uncommitted; it must not be described as that starting commit's exact implementation. Prompt version advanced from `advisor-1.4.1` to `advisor-1.5.0`. Profiles retain actual per-request prompt hashes, provider tokens, stages and requested/returned model IDs. The final plan records source-file hashes, complete prompt payload hashes, Git HEAD, dirty-tree status, generation settings, rubric/judge versions and package-lock hash.

Requested and returned model: **deepseek-flash** in all 20 provider calls performed for this task: eight before, eight after, four offline judge calls. All 20 received HTTP 200 with completed envelopes. No full 50-case live run occurred. Later dry runs and resume verification made zero additional provider calls.

Brand source: `docs/brand-bible-v1.txt`, version v1.0, SHA-256 `ce4be633ea9f8b85f012a59088a188592a257141e7e9efd62fffabcdf7f82669`. No Brand Bible, client/catalog data, `.env`, package manifest/lockfile, frozen baseline or existing evaluation output was overwritten. Integrity verification compares all 1,049 preexisting protected files to task-start hashes; results are in the final verification record.

Evidence is copied into the submission-friendly [final-v1/evidence](../evaluation/final-v1/evidence/) directory because `runtime/` is Git-ignored. [copy-manifest.json](../evaluation/final-v1/evidence/copy-manifest.json) maps copies to original files and SHA-256 hashes. Originals remain in place. These include real complete inputs, all before/after candidates, traces, validation outcomes, judge records in JSON/JSONL/CSV, blank human review sheets and run summaries. The earlier frozen evaluation package remains separate.

## Fifty-case readiness and rubric

See [the evaluation package and runbook](../evaluation/final-v1/README.md) and [explicit scoring anchors](../evaluation/final-v1/RUBRIC.md).

| Scenario                    | Valid fictional cases | Target messages |
| --------------------------- | --------------------: | --------------: |
| Birthday / festive greeting |                     8 |              24 |
| Recommendation              |                    18 |              54 |
| After-purchase care         |                     6 |              18 |
| Reactivation                |                     6 |              18 |
| Event invitation            |                     5 |              15 |
| Price objection             |                     7 |              21 |
| Total                       |                    50 |             150 |

All 50 inputs resolve READY. The zero-network mock execution exercised the real orchestration with fixture provider replies and exported 150 fixture messages; all passed deterministic evaluation. **This validates tooling and fixtures, not real model reliability or quality.** Negative/rejection tests remain in the unit suite rather than consuming valid generation slots. Every generation case supplies all three styles for a controlled within-case comparison. Occasion comparisons keep client/product/notes fixed; all 15 SKUs, sparse profiles, history/selection conflicts, exact product stories and difficult price objections are covered.

Hard failures block acceptance regardless of soft scores. Five candidate-level quality criteria use explicit 1–5 anchors: brand consistency 20%, naturalness 20%, personalization 20%, scenario relevance 25%, CTA quality 15%. Case score = 80% of mean weighted candidate score + 20% candidate-set differentiation. Proposed project thresholds: case ≥4.0, each candidate ≥3.5, brand/scenario each ≥3, differentiation ≥3. Final target: 50/50 completed factual passes, 150 messages, ≥45/50 soft passes, each scenario mean ≥3.8; median ≤8 s and p95 ≤15 s as performance targets. These are project-defined criteria, not employer requirements.

The separate real judge sample evaluated F-004, F-010, F-028 and F-044 without regenerating their outputs. Deterministic passes: **4/4**; additional judge hard concerns: **0**; soft passes: **1/4**. Scores respectively: 4.080, 3.973, 3.867, 3.973. All candidate sets received differentiation 4/5. None of these four-case rates can be generalized to all six scenarios. Human review is pending; a model judge is not a human reviewer.

## Measured defects and hypotheses

| ID   | Evidence / status                                                                                         | Action                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-01 | Three of four sample sets missed the declared 4.0 soft threshold; most low marks concerned CTA usefulness | Human review against scenario-specific CTA anchors before any further prompt tuning; preserve the low results                                              |
| J-01 | Judge wanted stronger interaction in greetings despite allowed warm noncommercial closings                | Calibrate; do not automatically strengthen commercial CTAs                                                                                                 |
| J-02 | F-028 judge penalized purchased white-gold necklace for not reflecting historical rose-gold preference    | Human adjudication: selected purchase is authoritative; never change material to satisfy this score                                                        |
| E-01 | Judge uses the same provider/model family as generation; no human ratings yet                             | Review six specified calibration cases, including all six scenarios, and reconcile discrepancies ≥2 points                                                 |
| P-01 | n=4 per phase, no recovery events, two scenarios absent from live profile                                 | Full approved evaluation must report all-case latency, failure latency, retries and per-scenario counts; avoid stable p95 claims for small scenario groups |
| E-02 | Valid live generation for the remaining final cases has not been performed                                | Execute only after approval; keep NOT_COMPLETED cases visible and exclude them from success claims                                                         |

Judge comments are hypotheses for human inspection, not established product defects. Thresholds were not lowered after observing these scores. No changes to customer-facing style/CTA instructions were made to chase judge scores.

## Tooling decision

**Keep the existing Node framework and the small final-v1 additions for this submission. Do not install Promptfoo or DeepEval.**

| Requirement                                                  | Current framework                                        | Incremental Promptfoo value                                  |
| ------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------ |
| End-to-end generation, retry/repair and factual release gate | Reuses production modules                                | Would need a custom pipeline adapter                         |
| Brand-specific catalog/scope/scenario assertions             | Existing local validators + mandatory live factual audit | Still needs these custom assertions                          |
| Anchored offline grading and set differentiation             | One versioned call per three-message set                 | General `llm-rubric` grading available                       |
| Human calibration, raw evidence and exports                  | Implemented as explicit files and score comparison       | A comparison interface could improve later reviewer workflow |
| CLI / repeatable comparisons / CI                            | Existing scripts, hashes, tests; file-based reports      | Established declarative configuration and comparison tooling |

Promptfoo documents CLI/configuration/CI-oriented evaluation and supports model-based rubric grading. Those capabilities are useful, but do not replace this app's domain validators. A future adapter should call the complete production `generate()` path and retain all three candidates as one set, not directly test a bare prompt. Adding that adapter and dependency before November 9 duplicates functioning evidence paths without resolving the current human-calibration gap. Sources: [Promptfoo repository](https://github.com/promptfoo/promptfoo), [official LLM rubric documentation](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/).

## Controlled usage and cost plan

Nominal full run: **50 generation + 50 mandatory factual audits + 50 offline judge calls = 150 API calls**, producing 150 customer messages. With unchanged default recovery budget, ceiling **200 generation/audit calls + 50 judge = 250 calls**. The global budget prevents calls past the explicit ceiling; if it is exhausted, remaining cases must be reported incomplete. No automatic judge retries or optional regrading are included. Configuration overrides can change the potential ceiling and are recorded.

Scaling the four optimized cases and their judges gives approximately **481,575 input tokens and 24,825 output tokens**, with observed cached input 105,600. Estimated nominal cost is **$0.14 peak / $0.07 off-peak** at that cache ratio, or **$0.17 peak / $0.09 off-peak** with all input treated as cache misses. Allow **$0.25 for the nominal sample-scaled plan** as a planning allowance, not a binding spending limit. Retries, larger cases and a different judge model can exceed it. A deliberately conservative planning envelope of 250 calls × 64,000 input and 2,400 output tokens is about **$5.52 peak**; 64,000 input tokens is an assumption, not an enforced input cap. The actual enforced limit is API call count.

These are token-based estimates, not an account bill. DeepSeek's published Flash rates checked November 7 are $0.30/$0.006 per million cache-miss/cache-hit input tokens and $1.20 output at peak, half off-peak. Confirm rates again before execution. [Official pricing](https://api-docs.deepseek.com/quick_start/pricing/?model_version=DeepSeek-V4-Pro-0813). The 20 completed calls consumed an estimated $0.0104 at published off-peak rates; no billing balance was inspected.

At measured medians, sequential generation alone projects about three minutes for 50 cases; judging adds about two minutes. Plan 5–10 minutes plus recovery and reporting time, without treating this as a duration guarantee. Human review time is separate. Sequential cases are retained for clear attribution and small budget control; no unwarranted throughput redesign is needed.

## Remaining work before November 9

1. Review the four actual judged sets now. Resolve J-01/J-02 against the published anchors; revise the judge only as a separately versioned, documented calibration decision. Keep original scores.
2. Approve the concrete 50-case / nominal 150-call plan and chosen global call budget. The runbook command is gated and has not been executed.
3. Run the full evaluation, inspect all six scenario summaries and every hard failure. Failures remain recorded; do not regenerate already valid output merely to improve scores.
4. A real reviewer completes the six assigned calibration cases and additional hard/low-score cases. Compare judge/human scores, adjudicate differences ≥2, and record decisions. Do not label automated review human review.
5. Address demonstrated defects with a new prompt/judge version, rerun affected cases with approval, preserve first-run evidence and report both results. Do not lower thresholds retrospectively.
6. Freeze the final implementation commit, copy the approved live run into a new submission evidence directory, verify hashes, and assemble Work Log, Methodology, 50 Test Cases, Evaluation Report and Defects/Next Steps from these linked artifacts.

Build, all 609 tests and the existing local production HTTP smoke test pass; exact closeout checks are in [verification.json](../evaluation/final-v1/evidence/verification.json). One restricted rerun hit native Node assertions in three HTTP-related test processes; the complete rerun outside the sandbox passed without a code change. Technical execution readiness is established. Final quality acceptance remains pending the paid run and real human review.
