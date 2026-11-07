# Baseline methodology and challenge evidence map

## Scope and populations

This phase audits and preserves commit `e5856af7bd5dc85541677a8af7aed30e6722953d`; it does not tune production prompts or generation. Grounding facts remain the fictional Brand Bible v1.0. Profiles, conversations, purchases, events and test scenarios are fictional.

Keep these populations separate:

- **Existing unit suite:** 79 checks, including fifty fixed implementation regression cases and mocked provider/DOM/API checks. Passing establishes those contracts, not live language quality. Existing historical evaluation files are untouched.
- **New baseline set:** 18 proposed representative cases, six scenarios, all three Motifs/five Lines, with explicit expected current behavior and desired-business status. Negative controls are intentional.
- **Validation-only:** input/ranking/prompt inspection without generating messages. Zero executed generation cases.
- **Template smoke:** actual outputs from the frozen deterministic demo branch. Useful for workflow and demonstrable template defects, not an LLM benchmark.
- **Live baseline:** real generated drafts and release-filter results, followed by human review. Currently unexecuted because no key is configured.

## Freeze and run procedure

1. Capture source bytes, Git HEAD/cleanliness, exact lock/runtime dependency versions, configuration, Brand Bible, full constructed scenario instructions and hashes, and old output hashes. Never copy secrets.
2. Freeze cases and their SHA-256 separately. Store expectations and comparison groups without reference answers. Do not revise a case to make a later system pass.
3. Run validation in a new directory. Inspect intended versus baseline status/SKU, particularly negative controls and false positives.
4. Optionally run explicitly labeled demo smoke. Record actual outputs and defects without assigning live quality scores.
5. With a key, run explicit live mode against the frozen source. Retain requests/responses, request IDs, returned model, tokens, latency and audit reasons when supplied. Preserve withheld drafts separately from delivered messages. Do not retry in place.
6. Have reviewers annotate a separate copy of the human-review table using the rubric. Current score fields remain blank.
7. Record defects, propose one change, version an iteration, and compare matched cases and stage-specific denominators. No such generation change was made in this phase.

The main runner exercises the production generation **core**, including its input evaluation and output/audit checks. It does not go through HTTP; transport/UI behavior is covered separately by existing regression tests. This boundary must be stated in the report.

## Controlled factors

B03/B04/B05 vary only occasion at fixed client and SKU. Each case's three simultaneous candidate styles form the style control: client, occasion, product and context remain fixed. Style is not an existing single-select request field, so no unsupported style parameter is added. Evaluate middle paragraphs; shared introductions and different closing phrases do not count as style quality.

No seed or temperature is sent by the application. Identical input may not produce identical live prose, and a configured model alias may change provider snapshot over time. Record actual returned model, use separate repeat runs, and report variability rather than claiming exact model reproducibility from a source hash alone.

## Proposed expansion to 50 cases — not yet created or executed

| Scenario | Initial cases | Planned total | Additional cases |
| --- | --- | --- | --- |
| Birthday/festival | 2 | 8 | 6 |
| Product recommendation, including injected-context control | 7 | 14 | 7 |
| Post-purchase care | 2 | 8 | 6 |
| Reactivation | 2 | 6 | 4 |
| Event invitation | 2 | 6 | 4 |
| Price objection | 3 | 8 | 5 |
| **Total** | **18** | **50** | **32** |

Additions should span all fifteen SKUs, three scope depths, sparse versus rich histories, controlled context changes, all occasions, unsupported versus explicitly denied claims, and missing-event/wrong-purchase negative controls. Retain a held-out subset for later iteration and label any development cases separately. Fifty cases means fifty inputs, not fifty candidate messages; three candidates are expected only where generation is valid and actually succeeds. Existing `tests/cases.mjs` is a different implementation regression set and must not be relabeled as fifty human-evaluated live cases.

## Challenge artifact map

| Challenge section | Evidence now available | Evidence still needed |
| --- | --- | --- |
| Work Log | `work-log.md`, Git/hash record, immutable run timestamps | Later iteration commits and decisions |
| Methodology | This file, pipeline audit, controlled comparisons, rubric | Reviewer calibration and repeated live runs |
| 50 Test Cases | Frozen 18-case seed and explicit 32-case expansion plan; prior regression set preserved separately | Remaining 32 versioned case definitions and actual execution |
| Evaluation Report | Input status checks, template outputs, configuration preflight, unchanged-source proof | Live drafts, human scores, per-dimension results and disagreement |
| Defects and Next Steps | Source-linked findings, two observed baseline issues, measurement priorities | Confirmed live defects, targeted fixes, measured improvement/regression |

## Reporting rules

- Availability: report eligible, attempted, actually generated, released and withheld sets separately.
- Input-gate precision: distinguish desirable rejection from a benign request incorrectly blocked; B18 is not a quality pass merely because it matches old behavior.
- Quality: use human-reviewed actual candidates as the denominator. Zero reviewed live messages means “not evaluated.” Do not invent scores, latency, usage or model response identifiers.
- Template versus model: every table and artifact retains mode/model labels; never pool template messages into live metrics.
- Output visibility: evaluate raw drafts and delivered messages separately, including the production audit's false rejections/acceptances, to avoid survivor bias.
- Reproduction: source/prompt/case integrity is deterministic; provider text sampling is not guaranteed deterministic. Keep both facts visible.
