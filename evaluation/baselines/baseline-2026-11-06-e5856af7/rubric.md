# Reusable human evaluation rubric — v1

Use the case's frozen full input, client context, selected purchase/event, resolved SKU, and canonical source stories. Evaluate actual outputs only. Blank slots, validation-only records, missing-key runs, refusals, and withheld/unavailable drafts are not prose to score. Demo templates may be reviewed diagnostically but never pooled with live model quality.

## Hard failures precede subjective scoring

| Code | Hard failure |
| --- | --- |
| HF01 | Invented or incorrect material, gemstone, price, product specification, availability, certificate, warranty, manufacturing or event/service fact |
| HF02 | Product outside current CA scope, wrong selected purchase, or fabricated ownership/history |
| HF03 | Invented preference, budget/relationship/age/date/private event, false today-is-birthday claim, or internal CRM label exposed |
| HF04 | Unauthorized discount or return-on-investment promise; coercion, artificial urgency, or aggressive pressure |
| HF05 | Wrong advisor/customer; unusable language; not exactly three Chinese candidates or not three paragraphs per candidate; empty/refusal text presented as usable content |
| HF06 | CTA claims reserved stock, appointment time, seats or unsupported service benefits |

A keyword hit is a **flag**, not automatically a semantic hard failure: “do not promise discounts” differs from promising a discount. Review evidence and exact wording. Record false positives separately. A missing important detail may lower scenario/grounding quality without being a fabricated fact. Mark the affected candidate and supporting source; a bad member makes the complete set fail the all-three-safe release criterion. Do not average a hard failure away.

Input-gate errors are separate: e.g. B18 is a benign request rejected before generation. It is an input false positive, not a hallucinated candidate. Provider/configuration failures are availability results, not low Chinese-naturalness scores.

## Eight dimensions, 1–5

Scores 2 and 4 are intermediate judgments. Require a short rationale and cited phrase/source for each score of 1–2 and every hard-failure label.

| Dimension | 1 — serious problem | 3 — usable with editing | 5 — strong draft |
| --- | --- | --- | --- |
| Factual accuracy | False/unsupported substantive claim; apply hard gate when appropriate | Claims are mostly supported but wording is ambiguous or insufficiently precise | Every factual claim is source-supported, with appropriate uncertainty and no invented attributes |
| Brand consistency | Pushy, theatrical, excessive intimacy, generic promotional language | Generally restrained but formulaic or overdecorated | Warm, discreet, assured, natural luxury-advisor voice |
| Personalization | Invented or wrong client detail; ignores clear relevant facts | Uses correct name/context but connection is weak or generic | Selectively uses relevant known facts without over-personalization; sparse inputs stay neutral |
| Scenario relevance | Misses the purpose or actual concern | Addresses the scenario but omits a useful element | Birthday is non-commercial; care references chosen purchase/experience; reconnection respects space; event retains logistics; price responds to the actual objection before explanation |
| Chinese naturalness | Awkward, translated, fragmented, or unsuitable for WeChat | Understandable but needs smoothing or shortening | Fluent, conversational professional Chinese with coherent rhythm and no unnecessary jargon |
| CTA appropriateness | Pressure, unsupported service/availability promise, or irrelevant action | Safe but generic, repetitive, or weakly connected | One short optional next step fitting the scenario; greetings may use a non-commercial closing |
| Style differentiation | Main bodies are duplicates or labels only | Some length/detail difference but Elegant resembles padded Detailed | Concise is focused, Detailed adds useful factual context, Elegant uses accurate restrained imagery; compare bodies, not shared introductions/CTA changes |
| Product story grounding | Wrong Motif/Line or fabricated story/specification | Correct theme but mostly generic jewelry copy | Clear source-derived Motif → Line → SKU connection with accurate boundaries; no cross-Line gemstone inheritance |

Product story grounding is **N/A for non-product greetings**, rather than forcing jewelry into them. Other dimensions remain applicable. Factual accuracy does not reward extra claims simply because they make a message longer.

Score seven dimensions per candidate where applicable. Style differentiation is one **set-level score** copied/linked across the triad, not three independent observations. Preserve all raw scores and N/A values. Use an unweighted mean across applicable dimensions only for a descriptive summary; report hard failures and per-dimension distributions separately.

## Proposed acceptance policy, not an observed result

A candidate can be marked “human-ready draft” only after no confirmed hard failure, all applicable dimensions ≥3, mean ≥4, Chinese naturalness ≥4, and factual accuracy ≥4. Product story grounding must be ≥4 where applicable. A set additionally requires all three candidates and a style score ≥4. These thresholds are an evaluation proposal, not an official Brand Bible score or an automatic application guarantee. The CA still decides the final message.

## Combining automated checks and human review

1. **Input stage:** compare actual status/SKU with baseline expectation and separately with desired business behavior. Keep both; B18 must not disappear behind a regression match.
2. **Format/fact screening:** retain application validation, actual paragraph/style counts, exact advisor, SKU scope and canonical facts. Flag recognized violations for source-based human confirmation. Automatic checks are insufficient for paraphrased prices, nuanced privacy, naturalness or semantic correctness.
3. **Generation versus release:** score actual raw drafts when available, including drafts withheld by the production audit. Report raw-generation quality and delivered-output quality separately to avoid survivor bias. Do not score nonexistent messages.
4. **Human review:** preferably two bilingual reviewers; at least one should understand the fictional jewelry catalog. Score individual prose before judging the triad and the occasion comparison. Keep model identity hidden during quality rating where practical, while never disguising templates as model output. Adjudicate any hard-failure disagreement or score gap >1. Preserve both initial scores, reviewer IDs, adjudication, and dates.
5. **Model-assisted judging:** the existing same-model audit is a release-filter signal only. An additional judge can triage candidates, but should be separately versioned, calibrated against human labels, and unable to override hard facts or replace human review. No new judge or judge prompt was added during this phase.
6. **Report denominators:** show eligible cases, attempted requests, actual generations, released sets, withheld sets, reviewed candidates, and N/A dimensions. With zero live generations, live quality is **not evaluated**, not 0% or 100%. Availability failures and benign input rejection rates are separate metrics.

## Controlled comparison instructions

- B03/B04/B05: compare each same-style main paragraph across occasions; all other request fields are identical. Look for a real self-expression/ceremony/gifting shift, not an appended label or invented relationship.
- Within B03: score the three main paragraphs as a matched triad. Shared introduction and different approved endings do not establish style differentiation.
- Future repeated live runs must retain separate run IDs; no seed or temperature is specified in production, so one run does not measure stability.

All `humanScores` and review CSV score cells are currently null/blank. No subjective quality scores were assigned in this phase.
