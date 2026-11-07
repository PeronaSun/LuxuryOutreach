# Reusable rubric v1

These are **project-defined acceptance criteria**, not employer requirements. Machine-readable anchors and weights are in [rubric.mjs](rubric.mjs); judge schema/instructions are in [judge.mjs](judge.mjs). No soft score can cancel a hard failure.

## Layer 1 — hard validation

Reuse production structured schema checking and `assessCandidates`, followed by the mandatory production semantic factual audit. The final evaluator adds explicit event name/location/date/time completeness (including equivalent Chinese date/time forms), birthday-purpose checks and case-insensitive internal identifier detection.

Hard failures include wrong count/styles or three-paragraph structure; wrong selected product/category/material/gemstone/price; claims outside the selected Motif/Line/SKU; invented customer facts; internal SKU leakage; unsupported discounts, stock, certification, services, guarantees or urgency; wrong scenario or required details; unsupported/foreign product stories; ignored explicit applicable context or occasion; unsafe CTA. Generation errors and refused/invalid responses are incomplete cases, not successful empty outputs.

Exact story **correctness and source scope** are hard constraints. Story **depth, relevance and elegance** are subjective. Recommendations and care require the selected product story; greetings, invitations and general price conversations must not be penalized for valid absence of a SKU story. Sparse profile personalization means using known context honestly, not inventing details. Selected purchase/current selection outranks historical interests. Regex/schema checks alone cannot establish all semantic facts; production audit and human inspection remain necessary.

Unknown/ambiguous semantic concerns from the offline judge are flagged for human adjudication, not silently converted into a weighted soft score. Report deterministic violations separately from judge concerns and human-confirmed defects.

## Layer 2 — offline judge, anchored 1–5

| Criterion / weight        | 1                                | 2                                     | 3                                   | 4                                                               | 5                                                           |
| ------------------------- | -------------------------------- | ------------------------------------- | ----------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| Brand consistency / 20%   | Promotional or brand conflict    | Repeated pressure/clichés             | Acceptable, generic, one tone lapse | Warm, restrained, grounded imagery                              | Distinctive and precise throughout                          |
| Chinese naturalness / 20% | Incoherent/unusable              | Substantial rewriting needed          | Understandable but stiff            | Fluent, minor edits                                             | Thoughtful professional CA voice                            |
| Personalization / 20%     | Ignores context or invents facts | Pasted detail, mostly generic         | One weakly connected true detail    | Relevant known details integrated; sparse data handled honestly | Precise and unobtrusive adaptation to client and occasion   |
| Scenario relevance / 25%  | Wrong/absent purpose             | Purpose obscured by selling           | Recognizable, uneven priorities     | Fits exact purpose, scope and occasion                          | Every sentence serves the communication purpose             |
| CTA quality / 15%         | Unsafe pressure/promise          | Commercial, unclear or competing asks | Safe but generic                    | One relevant, restrained next step or warm noncommercial close  | Effortless close suited to relationship and customer choice |

**Candidate-set differentiation**, scored once across all three messages: 1 = copies or contradictions; 2 = synonym swaps; 3 = recognizable but overlapping; 4 = Concise focuses, Detailed adds useful facts, Elegant refines grounded imagery; 5 = three independently usable treatments without padding or factual disagreement. Length alone is insufficient. All three retain the same facts, task and structure.

Per-candidate score = weighted sum of the five criteria. Case score = `0.8 × mean(candidate scores) + 0.2 × set differentiation`. A case soft pass requires score ≥4.0, every candidate ≥3.5, every candidate's brand and scenario scores ≥3, and set differentiation ≥3. An additional judge hard concern keeps the case out of accepted soft passes until adjudicated; it cannot be hidden by averaging.

The judge uses one structured call for the whole set, temperature 0, explicit integer scores and brief reasons. It is offline and does not increase customer-facing generation latency. Judge exceptions remain unscored. Same-model grading is provisional rather than independent proof of quality.

## Layer 3 — actual human review and calibration

Assigned calibration cases: **F-001, F-010, F-028, F-033, F-039, F-044**, one per scenario. Review all hard failures, judge hard concerns and low-score sets in addition to that representative sample. Current real judged evidence contains only F-004, F-010, F-028 and F-044, so the full six-case calibration cannot yet be completed from it.

1. Read the full input and exact allowed facts. Score the three messages independently before viewing judge scores to reduce anchoring. Use the same anchors and a set-differentiation score.
2. Complete the exported `human-review.json`: actual reviewer, ISO `reviewedAt`, all five integer scores for each style, integer `differentiationScore`, `confirmedHardRules` and notes. Leave scores blank until a person reviews them. CSV is a worksheet; import expects JSON.
3. Import annotations into a new run using the README's zero-call resume recipe. The exporter preserves supplied annotations and computes scorewise mean absolute difference, set-score difference and flags discrepancies ≥2 points. Duplicate case reviews are rejected; six copies of one case cannot satisfy calibration.
4. Reconcile flags against canonical facts and anchors. In particular, a warm greeting close need not solicit a sale; purchased white gold cannot be changed to match historical rose-gold preferences. Record the human decision and rationale. Calibration completion requires the specified six distinct cases and no unresolved discrepancy/human-hard flags.
5. Do not automatically adjust scores. If anchors/judge need correction, increment the rubric/judge version and retain both evaluations. Human adjudication should be reported beside the model judgment, with confirmed hard defects taking precedence.

## Aggregate acceptance and reporting

Proposed final targets: 50 valid cases, exactly 150 live messages, 50/50 completion and hard factual passes; at least 45/50 soft passes; scenario mean ≥3.8 in every scenario; completed human calibration; no unresolved hard concerns. Performance targets: median ≤8 seconds and p95 ≤15 seconds for successful generation. Always separately report failed-request latencies and retries so withholding failures cannot make speed look artificially better.

Report generation success over all requested cases; hard passes over all cases; soft passes over scored and total cases; actual score coverage; count of human-reviewed cases; scenario counts and means; style-level criterion means; set-differentiation distribution; actual call/token counts; median and nearest-rank p95. Per-scenario n=5–18 remains too small for a stable p95 even when overall n=50. The runner exports the raw data needed for these breakdowns; empty score groups are null, never assumed passing.

Human quality judgment is not implemented by labeling the assistant or model a human. Current human status is **PENDING_HUMAN_REVIEW**.
