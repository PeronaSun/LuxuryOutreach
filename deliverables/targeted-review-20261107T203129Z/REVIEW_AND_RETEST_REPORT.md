# Targeted defect inspection and retest — November 7, 2026

**50/50 cases now have three valid actual generated messages (150 selected messages).** No full paid 50-case rerun was performed. Original result remains **41/50**, and its workbook/run/failed evidence is unchanged.

## What changed and what was retained

- **41 cases** retain original passing output and original validation record unchanged.
- **F-037** retains all three original messages verbatim, with corrected offline event validation only; no new model calls.
- **Eight distinct affected cases** were regenerated with exactly the original inputs, profile snapshots, canonical grounding and application clock. F-017 required a later separately versioned case-only retest after captured evidence proved a further audit bug.
- New API calls: **23**; original **104**; cumulative **127 / 200**. All live generation used **deepseek-flash**, no demo or manually authored replacements. Raw targeted provider responses, including rejected/malformed/audit responses, are retained in each targeted run's attempts directory.
- Selected generation cohorts: **42 original advisor-1.5.0**, **7 advisor-1.5.1**, **1 advisor-1.5.2**. Per-row source run, generation version, validator version and original status appear in the new workbook. Mixed-cohort latency is not represented as a new 50-case benchmark.

## Nine-case diagnosis

| Case | Classification | Selected generation version | Resolution | Result |
| --- | --- | --- | --- | --- |
| F-014 | Original rejected text unavailable | advisor-1.5.1 | Live targeted retest | PASS |
| F-017 | Confirmed validator false positives on reproduction | advisor-1.5.2 | Live targeted retest | PASS |
| F-031 | Schema contract defect + historic-Motif false positive reproduced | advisor-1.5.1 | Live targeted retest | PASS |
| F-034 | Historic-Motif false positive reproduced | advisor-1.5.1 | Live targeted retest | PASS |
| F-037 | Pure event-location validator false positive | advisor-1.5.0 | Offline revalidation; original text | PASS |
| F-039 | Mixed validator false positive and genuine generation defect | advisor-1.5.1 | Live targeted retest | PASS |
| F-041 | Mixed validator false positive and genuine generation defect | advisor-1.5.1 | Live targeted retest | PASS |
| F-042 | Genuine generation defects | advisor-1.5.1 | Live targeted retest | PASS |
| F-045 | Historic-Motif false positive reproduced | advisor-1.5.1 | Live targeted retest | PASS |

The original five withheld records did not retain rejected text. Their error categories are evidence, but do not prove what the missing wording said. Exact original causes are explicitly left uncertain where appropriate. New targeted raw responses make the historic-Motif and CRM-source false positives reproducible; they do not retroactively fabricate original outputs.

### Event false positives versus genuine defects

F-037 is the pure word-order false positive: every required factual component is present. F-039 and F-041 additionally made definite, unverified claims about event topics, so accepting their old wording merely by fixing address order would have missed genuine defects. F-042 omitted the venue in Concise and invented prior interests. The corrected check requires both exact venue and address, correct name/date/time, and rejects missing or changed facts while allowing different word order/punctuation. No required component was dropped.

### Verified code/prompt fixes

1. **advisor-1.5.1 / event-facts-v2 / final-deterministic-v2:** reusable component-based event check, hard guards against unverified event-topic promises and sparse-profile past-interest assertions, and explicit event completeness guidance. The production pipeline applies these hard checks before releasing output and can use its existing repair policy.
2. Repair schema cardinality: a request for one/two replacement styles no longer carries a contradictory exactly-three-candidates instruction. Only requested styles are returned; unaffected candidates remain unchanged. Recovery budgets are unchanged.
3. **advisor-1.5.2 / final-deterministic-v2.1:** allow a narrowly identifiable, verified historical Motif reference while still rejecting unknown history and foreign-story attribution to the selected product. The audit now explicitly recognizes stored client.latestPreference/interests/history as factual CRM sources even when notes are empty. Its hard rule set/severities remain intact.

Targeted test fixtures cover correct venue/address order, missing venue, wrong street, wrong date/year/time, genuine unverified agenda and sparse-history claims, the actual original event cases, valid versus invalid historic Motif references, and one-style repair cardinality/preservation.

## Retest execution and outcome

First targeted run: eight cases, **21 calls**, seven passes; F-017 still failed the factual audit. Its captured response and audit show a real stored rose-gold preference was falsely called fabricated because hasNotes=false. After the verified audit/history fix, only F-017 ran again: **2 calls**, PASS. No already-valid case was regenerated to improve a quality score.

All selected sets also passed a final **offline-only compatibility check** against the latest hard validators: **50/50**, zero API calls. Stored original validation records remain unchanged; compatibility results are separate evidence, not a claimed new generation run. Independent LLM quality judging and actual human review remain **pending**, with no fabricated scores.

## Artifacts and versions

- New workbook: `deliverables/Maison_Liore_50_Cases_Evaluation_Retest_v2.xlsx`.
- Original workbook: `deliverables/Maison_Liore_50_Cases_Evaluation.xlsx`, unchanged.
- New workbook retains the required eight-column 50 Test Cases sheet plus Evaluation Scores, Defects & Iteration and Summary, and adds **Original vs Retest** with original messages, original/current outcomes and versions, live-vs-offline resolution and all targeted call usage.
- Original outputs, intermediate failed targeted outputs and traces remain archived. Selected-view JSON/JSONL/CSV exports are in `deliverables/live-evaluation-merged-2026-11-07T20-50-48-460Z-81dd2f06`; nested targeted evidence contains every raw response. Full source-before/source-after snapshots and exact run source hashes document the implementation changes. No Git commit was created; source hashes identify the uncommitted versions.
- Workbook output text matches the selected source records exactly; original text matches the preserved original records. Formula caches and full Chinese/French/paragraph content are verified. All five worksheets received visual layout inspection.
- **620 regression tests pass**, production build passes, and the existing production HTTP demo smoke test passes. No UI files or catalog data changed.

Cumulative usage: **446,440 input tokens**, including **193,664 cached**, and **18,323 output tokens**. Estimated cumulative token cost at the documented Saturday off-peak Flash rates: **USD 0.049491** (about $0.05), not an invoice. Additional targeted usage is 81,781 input / 32,256 cached / 3,550 output tokens. No quality-judge calls were made.

## Remaining work

Generation completeness is now satisfied. Complete real human review and/or independently configured offline quality grading before subjective quality sign-off. Retain the original 41/50 result alongside the improved selected result; do not present this as 50 fresh cases generated under advisor-1.5.2.
