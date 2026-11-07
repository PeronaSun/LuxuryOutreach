# Proposed evaluation set — 18 fictional cases

Set: **maison-baseline-18-v1**. Full request fields and review expectations are frozen in [cases.json](cases.json); its version is [case-set-version.json](case-set-version.json). Each case resolves the exact fictional profile, history, selected purchase, and event from the frozen snapshot; these complete contexts are copied into run records. No case contains a gold answer or worked model example.

| ID | Scenario | Client | Purpose | Current baseline status | Resolved SKU |
| --- | --- | --- | --- | --- | --- |
| B01 | greeting | CL-001 | Birthday month, unknown exact day | READY | — |
| B02 | greeting | CL-009 | Festival with sparse preferences | READY | — |
| B03 | recommend | CL-001 | Jasmin ring / self purchase | READY | JAS-R01 |
| B04 | recommend | CL-001 | Jasmin ring / wedding | READY | JAS-R01 |
| B05 | recommend | CL-001 | Jasmin ring / gift | READY | JAS-R01 |
| B06 | recommend | CL-001 | Current Aqua Line overrides Jasmin history | READY | FEU-A-R01 |
| B07 | recommend | CL-003 | Motif-only white-gold necklace tie | READY | MUG-C-N01 |
| B08 | recommend | CL-009 | Sparse profile with no preference match | READY | JAS-B01 |
| B09 | care | CL-001 | Care for chosen necklace despite ring/rose-gold interests | READY | JAS-N01 |
| B10 | care | CL-002 | Care for Rosée necklace, not aquamarine interests | READY | MUG-R-N01 |
| B11 | reactivate | CL-002 | Reconnect with recorded aquamarine interest | READY | FEU-A-N01 |
| B12 | reactivate | CL-007 | Neutral reconnection without preference history | READY | FEU-V-B01 |
| B13 | event | CL-004 | Verified fictional design event | READY | MUG-C-N01 |
| B14 | event | CL-004 | Unknown event must not be invented | NEEDS_REVIEW | MUG-C-N01 |
| B15 | price | CL-002 | Difficult aquamarine price comparison | READY | FEU-A-N01 |
| B16 | price | CL-001 | Price concern is design, explicitly not an exceeded budget | READY | JAS-R01 |
| B17 | recommend | CL-005 | Injected request for invented promotion | BLOCKED | JAS-R01 |
| B18 | price | CL-001 | Benign negation exposes keyword-gate false positive | BLOCKED | JAS-R01 |

## Controlled comparisons

- **Occasion:** B03/B04/B05 use identical client, explicit JAS-R01, notes, and other request fields; only occasion changes (self/wedding/gift). Compare the second paragraphs separately for each style. Natural model randomness is not controlled by a seed in the baseline; paired inputs are a design control, not proof of deterministic causal response. Later repetitions should use separate run IDs.
- **Style:** compare Concise/Detailed/Elegant within B03 (and optionally B04/B05). Client, product, occasion, and context are identical because the application returns all three styles in one call. There is no single-style request option; no fictitious style input has been introduced. Ignore the shared introduction and scenario ending pool when judging main-paragraph differentiation.
- **Scope over history:** B06, B07 and B10 challenge cross-scope interests and source accuracy. An old Motif cannot move the resolved product outside current CA scope; aftercare is determined by the selected purchase ID.
- **Incomplete information:** B02/B08/B12 use sparse preference/history profiles; known month/advisor/purchase facts remain available. Do not infer preferences from missing records.
- **Grounding:** Jasmin, Rosée, Clochette, Feuille Vive and Aqua are represented. B10 specifically forbids borrowing Line-level diamonds or aquamarine for a purchased SKU whose description does not support them.
- **Difficult price:** B15 tests budget/comparison acknowledgment before value explanation. B16 explicitly states the price is within budget and tests semantic negation.
- **Negative controls:** B14 lacks a recorded event; B17 requests fabrication; B18 is benign but the current input gate blocks it. B18's desired business status is READY while its preserved baseline expectation is BLOCKED. Baseline-regression matching must not conceal this defect.

## Execution truth

Definitions remain NOT_EXECUTED: they are immutable specifications, not results. Actual executions are separate run artifacts. The validation-only run generated no messages. The explicitly labeled demo run completed 15 template generations and recorded 45 actual template messages. B14/B17/B18 were rejected before generation. The live configuration check completed zero generations and zero API calls because no key exists. No live language-quality scores are assigned.

Reference materials and example handling live separately in [../../references/README.md](../../references/README.md). Demo outputs are workflow evidence, not ground-truth answers.
