# Final live evaluation — November 7, 2026

The approved 50-case real DeepSeek run completed execution. **41/50 cases passed all original automated checks; 9 require repair or adjudication.** This is not a completed 50-valid-case / 150-valid-message deliverable.

## Actual counts and provenance

- Prepared / actually executed: **50 / 50**; provider **DeepSeek**, requested and returned model **deepseek-flash**, demo mode **false**.
- Pipeline returned **45 complete three-message sets (135 messages)**. All 135 messages are retained verbatim in the workbook and raw exports.
- **41 fully passing cases / 123 messages in those passing cases**; completion under the original final deterministic checks is **82%**.
- **5 cases have no released output**; their 15 output cells remain blank. **4 returned sets are flagged** by the extra event-detail check; their 12 actual messages remain visible and flagged, not silently removed or accepted.
- **104 API calls**, below the approved global cap of **200**: **57 generation calls + 47 mandatory factual-audit calls**. All 104 returned HTTP 200 with completed envelopes; application-level validation/schema failures are separate from HTTP success.
- **7 bounded output-repair actions**, **0 transient retries**; two repaired cases ultimately returned valid sets (F-013, F-032). No additional out-of-policy generations were performed.
- Usage: **364,659 input**, including **161,408 cached**, and **14,773 output tokens**. No call lacks usage metadata.
- Token-based estimated actual cost: **USD 0.039836**, approximately **$0.04**, using published Flash off-peak rates (Saturday UTC). This is an estimate, not an account invoice. Pricing source: https://api-docs.deepseek.com/quick_start/pricing/ .
- Actual provider calls ran **2026-11-07 19:57:17–20:01:00 UTC**. Exports and checks made no further model calls.

## Scenario results

| Scenario | Executed | Returned sets | Fully passing sets | Messages in passing sets |
| --- | ---: | ---: | ---: | ---: |
| greeting | 8 | 8 | 8 | 24 |
| recommend | 12 | 10 | 10 | 30 |
| care | 8 | 8 | 8 | 24 |
| reactivate | 8 | 6 | 6 | 18 |
| event | 7 | 7 | 3 | 9 |
| price | 7 | 6 | 6 | 18 |

## Missing output cases

| Case | Final error category | Rule |
| --- | --- | --- |
| F-014 | OUTPUT_VALIDATION | WRONG_MOTIF |
| F-017 | OUTPUT_VALIDATION | FACT_CUSTOMER |
| F-031 | OUTPUT_SCHEMA | OUTPUT_SCHEMA |
| F-034 | OUTPUT_VALIDATION | WRONG_MOTIF |
| F-045 | OUTPUT_VALIDATION | WRONG_MOTIF |

The production pipeline withheld unsuccessful candidates. Rejected message text is not exposed by its interface and was not reconstructed or fabricated. Per-case recovery history, diagnostic stages, final errors and all provider-attempt statuses/timestamps/models/tokens/fingerprints are preserved. API attempts are durably recorded in provider-traces.jsonl. Existing recovery was allowed to finish; unused global budget was not used for extra manual retries.

## Event flags and evaluator defect observations

- F-037: Likely validator false positive: venue and street address are both present, in reversed word order. Original FAIL retained; requires adjudication, not regeneration.
- F-039: Likely validator false positive: venue and street address are both present, in reversed word order. Original FAIL retained; requires adjudication, not regeneration.
- F-041: Likely validator false positive: venue and street address are both present, in reversed word order. Original FAIL retained; requires adjudication, not regeneration.
- F-042: Concise omits the verified venue name. Its claim about prior interest also lacks support in this sparse profile/history. Preserve output and review; no automatic acceptance.

These are code/record inspection observations, **not completed human reviews or new model judgments**. Original validation and pass counts remain unchanged. The location checker currently uses an ordered full-string substring; accepting a semantically identical venue/address order needs a separately versioned evaluator fix and tests, then offline rescoring of the saved outputs. It does not require changing generation prompts or new API calls. F-042's omitted venue needs output repair; its sparse-profile assertion also deserves factual review.

## Evaluation layers

1. Deterministic checks ran against all 45 returned sets: **41 PASS / 4 flagged**. Generation/schema/factual gates withheld another five sets before final evaluation. Production factual audit is mandatory and independent of the offline quality-score configuration, but uses the generating model/provider.
2. Independent LLM-as-a-Judge: **not configured, not executed**; all subjective brand/naturalness/personalization/relevance/CTA/set scores are blank and marked pending. No score from earlier sample runs is mixed into this run.
3. Human review: **pending, zero actual reviews**. The workbook identifies assigned cases; human-review-sample.json includes representative, difficult, recovered and failed cases. Review these using the existing project rubric before quality sign-off.

## Latency and versions

All 50 attempts, including failures: median **4.352 s**, nearest-rank p95 **6.291 s**. These measure direct production generation plus final checks, not browser paint. Per-scenario samples remain small; do not treat their p95 as stable tail estimates.

Git base: `61c6ddfd5688ee0ce1dada2b85c81b042ad85f6b`; prompt: **advisor-1.5.0**; Brand Bible: **1.0 · 2026-11**; case set: **final-50-submission-v2**. Source and complete prompt hashes, actual timestamps and full normalized inputs are recorded in manifest/records/traces. The evaluation harness was uncommitted and is fingerprinted; this run is not represented as the clean Git base's exact source.

## Excel and evidence verification

Final workbook: `deliverables/Maison_Liore_50_Cases_Evaluation.xlsx`.

- Exactly the required eight first-sheet columns and all 50 cases; four requested worksheets.
- Every output cell matches the actual saved message or a genuine blank. Chinese, French characters and paragraph breaks are preserved.
- Header freezes, filters, wrapped text, fitted rows, readable widths, pending-score styling and editable human review status.
- **26 formula cells** have verified cached results and recalculate on opening in Excel. No formula-error cells were found.
- Workbook visual panels for all four sheets were inspected. The renderer reads actual openpyxl styles/values and formula caches; it is a verification preview, not a native Excel screenshot.
- Raw JSON/JSONL/CSV and all original attempt/checkpoint files are copied here byte-for-byte; runtime originals remain untouched.
- All **1416 preexisting protected files** remain unchanged, including frozen baselines, previous evidence, .env, source UI, generation prompts/implementation and catalog data.

## Remaining blockers before submission

Resolve the five missing-output cases, adjudicate the three likely evaluator false positives, repair F-042's missing/unsupported facts, then complete independent quality assessment or actual human review with documented rubric. Preserve this first run and report any later evaluator/prompt version and retest separately. Do not call this a successful 50-case / 150-valid-message evaluation until those gaps are resolved.
