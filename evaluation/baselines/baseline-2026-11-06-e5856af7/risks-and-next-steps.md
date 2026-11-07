# Initial risks, observed defects and iteration hypotheses

No production fixes or prompt changes were made. “Observed” means verified in current code or the separately labeled demo/validation artifacts; it does not claim live model behavior.

| ID / priority | Status and evidence | Risk or hypothesis | Next measurement |
| --- | --- | --- | --- |
| D01 / P1 | Confirmed input false positive: B18 is BLOCKED in validation-only and demo runs; `rules.mjs:11` matches 承诺…折扣 without negation handling | A benign refusal to promise discounts cannot reach generation | After baseline review, compare semantic/negation-aware handling against a held-out set of positive and negated discount requests; count false positives and unsafe false negatives |
| D02 / P1 | Confirmed **demo-only unsupported inference**: B16 states price is within budget and the real concern is design; demo says “理解价格高于您的预期，需要仔细衡量” because `generation.mjs:198` matches 预算 | The template creates an unstated price-expectation concern instead of addressing design | Test live B16 unchanged, then independently test the demo classifier. Within-budget and meeting expectations are not logically identical; the demonstrated error is inventing the latter claim without evidence, not proving a formal budget contradiction |
| D03 / P2 | Static source gap: demo does not compose from notes, free-text history or reconnect reason | A successful demo cannot validate conversational responsiveness; B11 may look relevant from product facts alone | Compare actual live notes/reason counterfactuals with identical SKU; judge context adherence separately from product matching |
| D04 / P2 | Confirmed explanatory metadata issue: B08 has no recorded interests, but occasion adds a positive score and `resolveProduct()` uses score>0 to say it matched existing preference | Resolver explanation can claim a preference match when only occasion fit exists | Inspect B08's resolution reason; distinguish score components in a later implementation change |
| H05 / P1 | Source-backed hypothesis: entire Bible plus exact selected-story packet enter the prompt | Unselected-Line stories or Line-level gemstones could leak into prose; guardrails may miss paraphrases | Human fact-check all claims in B06/B07/B10/B12 and future all-SKU runs. No live leakage has been observed yet |
| H06 / P1 | Confirmed observability gap: production discards raw API metadata, withheld drafts and audit reasons | Evaluating delivered candidates alone hides failures and falsely inflates quality | Use isolated runner traces for future live runs; compare raw generation and release-filter outcomes. Do not change production yet |
| H07 / P2 | Same model performs generation and audit; audit lacks separate notes/reconnect-reason fields | Correlated errors or context omissions may pass the release filter | Human review every live baseline set; examine false-negative/false-positive audit decisions before considering a separate calibrated judge |
| H08 / P2 | Deterministic style checks are trigram similarity and relative length; Chinese check requires a Han character | Padding or awkward mostly-English prose can satisfy structural proxies; Elegant may be generic | Blind human scoring of main bodies using the rubric; do not treat format checks as language-quality evidence |
| H09 / P2 | Keyword/date/price recognition is incomplete and can be negation-insensitive | Valid denials can be rejected; paraphrased unsupported facts or Chinese-written dates can escape | Expand a distinct validator/adversarial set later; separate validator precision/recall from model quality |
| H10 / P2 | Full Bible, no sent seed/temperature, configured model alias, at most two 45-second calls, no retry | Cost/latency, stochastic variation, truncation, or model drift can affect comparability | Collect provider-returned model, usage, latency and request IDs during live execution; repeat matched runs without overwriting |
| H11 / P2 | `.env.example` forces DEMO_MODE=true; old evaluator overwrites fixed result names | A developer can accidentally benchmark templates or erase previous evidence | Use explicit new-run mode and immutable paths documented here; keep demo and live results separate |
| H12 / P3 | Demo directly emits catalog-like constructions and, for wedding, wording about not restricting wearer identity | Chinese can expose internal writing guidance or sound formulaic even when facts are correct | Human naturalness/brand review of actual demo examples; do not generalize findings to the live model without execution |

## What to change only after a live baseline exists

1. Obtain/configure a key and execute the frozen set, preserving raw drafts and release outcomes.
2. Review with the rubric, categorize factual/context/style defects, and select one measurable target.
3. Create a new Git commit and a new baseline/iteration ID before changing a rule or prompt. Preserve this snapshot and all runs.
4. Keep client/SKU/occasion controls unchanged where possible. Add targeted held-out cases rather than rewriting cases to match a fix.
5. Report improvements alongside regressions, input false positives, model failures, cost/latency, and reviewers' disagreement. Template results remain a separate population.

This list is a measurement and iteration plan. It is not evidence that the live model has any particular hallucination or quality rate.
