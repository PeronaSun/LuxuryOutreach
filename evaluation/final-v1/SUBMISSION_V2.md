# Submission execution readiness — November 7, 2026

The requested distribution is implemented as **final-50-submission-v2** in `cases-submission-v2.mjs`, preserving the original `cases.mjs` and every historical result. Git starting version: `61c6ddfd5688ee0ce1dada2b85c81b042ad85f6b`; production prompt remains advisor-1.5.0. No UI, provider adapter, generation prompt, factual validator, recovery policy or catalog was changed.

Latest [preflight report](../../deliverables/preflight-2026-11-07T19-40-43-697Z-dd90a8b9/preflight.md), [expanded inputs and version manifest](../../deliverables/preflight-2026-11-07T19-40-43-697Z-dd90a8b9/manifest.json), and [input CSV](../../deliverables/preflight-2026-11-07T19-40-43-697Z-dd90a8b9/case-inputs.csv) are available for review. CSV output cells are empty. These are prepared inputs, not completed model results.

## Infrastructure inspection

| Component                               | Existing functionality reused                                                                   | Necessary addition / remaining work                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cases and canonical input normalization | Production `evaluateRequest`, client/catalog/event/purchase data                                | Separate requested 8/12/8/8/7/7 case-set version; all 15 SKUs, all five selection depths                                                                  |
| Generation and recovery                 | Production `generate`, mandatory factual audit, existing bounded retries/repair                 | No changes; runner selects submission-v2 explicitly                                                                                                       |
| Evidence                                | Per-case checkpoints, source/prompt hashes, diagnostics, JSON/JSONL/CSV exports                 | Per-attempt case ID, stage, timestamps, model, tokens, prompt fingerprint and durable JSONL trace; per-case usage/API latency and normalized input        |
| Deterministic checks                    | Existing schema, selected facts, scope, identifiers, scenario/date/time and unsafe-claim checks | Reused unchanged                                                                                                                                          |
| Subjective judge                        | Existing explicit rubric and structured offline grader                                          | Independent-only policy for submission-v2; no independent judge configured, so quality scores remain pending                                              |
| Human review                            | Existing blank worksheets, named reviewer/date/score import and calibration                     | Prepare actual representative/difficult/failed sets after execution; real review remains pending                                                          |
| Excel data mapping                      | Existing complete raw exports                                                                   | `submission-export-data.mjs` maps exactly eight first-sheet columns, scores, defects, review sample and metadata; rejects mock/reused-profile submissions |
| Excel authoring                         | Required artifact-tool runtime is unavailable in this session                                   | Final `.xlsx` not created. Enable the required runtime or explicitly authorize installation/use of an alternative writer such as openpyxl                 |

The 50-case dataset validates READY with canonical relationships and known purchase/event references. Distribution: greetings 8, recommendations 12, care 8, reactivation 8, invitations 7, price objections 7. F-009/010/011 are the same client/bracelet/notes with personal/wedding/gift occasion. Each actual invocation will generate all three styles together. Every case carries explicit expected scenario behavior, while the manifest holds the complete profile/history/canonical grounding and task input.

## Preflight and testing

```sh
node --env-file-if-exists=.env scripts/preflight-submission.mjs
node scripts/final-evaluation.mjs --case-set submission-v2 --mock
npm test
```

All **616 tests pass**. Fixture validation and adapter checks are explicitly tests, not newly executed paid cases. The adapter's paragraph-preservation test reads saved genuine earlier evidence only; that evidence is not substituted into this final dataset. All preflight work used **zero API calls**. The preflight checked 1,406 preexisting protected files with zero changes. The current configuration is DeepSeek Flash, live mode, valid endpoint and key present; no key was printed or logged. No new network/API health request was made before approval. No independent judge model/key is configured.

## Approval-gated execution

**Not yet executed.** The user attachment's Phase 3 explicitly says: “Stop and obtain my approval before launching the complete paid run.” Preparing the request does not satisfy that gate.

```sh
node --env-file-if-exists=.env scripts/final-evaluation.mjs --case-set submission-v2 --live --approve-paid-run --max-api-calls 200
```

Current proposal: 50 generation + 50 mandatory factual audits = **100 nominal calls**, at most **200 calls** with the existing four-call per-case recovery limit. Concurrency is one. No independent quality judge calls occur without configuration and a revised approved budget. Nominal projected cost: **$0.048–$0.118**, with sample-size/cache/rate caveats; conservative planning envelope **$4.42 peak** under a 64k-input/2,400-output-token per-call assumption. That is not an enforced dollar cap; the 200-call cap is enforced. Detailed cost assumptions and an optional independent-judge estimate are in preflight.json.

On failure, retain the original checkpoint, categorized error, per-stage diagnostics, recovery history and provider attempt trace. No retries beyond production policy, and no demo/manual replacements. The production interface withholds rejected text rather than exposing it as a final message; record that fact rather than reconstructing an unavailable rejected candidate.

After the approved live run:

```sh
node scripts/prepare-submission-export.mjs PATH_TO_THE_LIVE_RUN
```

This prepares data without making model calls. It rejects mock runs and reused sample evidence, preserves Chinese/French text and paragraph breaks, and reports missing outputs explicitly. The final workbook, once its writer is authorized, will have the requested four sheets and exactly the requested eight columns on “50 Test Cases”. Freeze/filter/wrap/width/row-height formatting and summary formulas will be verified before delivery. Preserve prior exports if the final target already exists; do not overwrite it silently.

Target: `deliverables/Maison_Liore_50_Cases_Evaluation.xlsx`. No final workbook currently exists. Prepared/live/complete/message/failure counts for this new submission are **50 / 0 / 0 / 0 / 50 not yet executed**. Those unexecuted cases are not API failures. Quality scores and human review remain pending; no score or message is fabricated.
