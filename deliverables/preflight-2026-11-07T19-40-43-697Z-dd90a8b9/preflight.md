# Submission preflight

Status: **PREFLIGHT PASSED — awaiting user approval**. Exactly 50 valid fictional cases; all 15 canonical SKUs; selection depths 0–4. No paid calls or live generations in this preflight.

## Distribution

| Scenario | Cases |
| --- | ---: |
| greeting | 8 |
| recommend | 12 |
| care | 8 |
| reactivate | 8 |
| event | 7 |
| price | 7 |

## Execution proposal

Model: deepseek-flash; provider: deepseek; demo: false; key configured but never printed. Independent judge: PENDING_INDEPENDENT_JUDGE_NOT_CONFIGURED. Nominal 100 calls; maximum 200; concurrency 1. Existing bounded recovery policy remains unchanged. No manual or demo replacements. Failed outputs remain missing.

Projected generation tokens: 344088 input, 12000 output, cached input subset 72000. Estimated nominal cost: $0.048–$0.118; scaling the same average to all 200 calls is roughly $0.235 peak. These are not enforced spending limits. A conservative 64k-input/2400-output-token assumption at the full default call ceiling is $4.42 peak. [Pricing source](https://api-docs.deepseek.com/quick_start/pricing/), checked 2026-11-07.

No independent judge is configured, so there are zero subjective grading calls in this proposal and scores remain pending. An optional, unconfigured different-model Pro judge would add 50 calls and roughly $0.12–$0.23 without caching; it requires separate configuration and approval and will not run automatically. Production factual auditing is still mandatory.

## Preservation and versions

Git HEAD 61c6ddfd5688ee0ce1dada2b85c81b042ad85f6b; prompt advisor-1.5.0; Brand Bible 1.0 · 2026-11. Frozen original final-50-v1 inputs and evidence remain unchanged. 1406 preexisting protected files checked, zero changes. Exact run/prompt/source hashes and expanded inputs are in manifest.json.

## Excel readiness

The requested four-sheet export data and eight exact first-sheet columns are prepared. Input CSV/JSONL and workbook-data.json contain blank output cells and NOT_EXECUTED status; they are not completed test results. Target: deliverables/Maison_Liore_50_Cases_Evaluation.xlsx. No workbook exists yet. Required artifact-tool dependency loader is unavailable; the installed skill prohibits alternative workbook libraries without explicit user permission.

## After approval

Run the existing production generator on this versioned set, preserve every checkpoint and provider-attempt trace, export JSONL/CSV, prepare human review, then author and verify the authorized Excel workbook. No extra generation retries beyond the existing policy. Do not claim 50-case completion if any case is missing three valid live messages.

Approved-run recipe (not yet executed):

```sh
node --env-file-if-exists=.env scripts/final-evaluation.mjs --case-set submission-v2 --live --approve-paid-run --max-api-calls 200
```
