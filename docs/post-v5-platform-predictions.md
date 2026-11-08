# Post-V5: fixed platform predictions and selection priority

Starting commit: `9a1aea9807886bc09369c92bd3b55862502d4080` (V5). This is an uncommitted **post-V5 implementation**, prompt **advisor-1.6.0**, normalized context **generation-context-v3-post-v5**, prediction fixture **simulated-platform-v1-post-v5**. Existing V5 case definitions, run records, generated text and Excel results are unchanged. No real model calls or GitHub pushes were performed.

## Inspection and implemented changes

There was no `predictedInterests` field. Recommendations previously ranked the full catalog using historical interests/current preferences, then alphabetic SKU fallback. Reactivation and price conversations generally did not select a product without a manual SKU. Client Profile displayed purchases but had no separate prediction section.

The new implementation persists predictions in `data/platform-predictions.json`, includes them in the minimal client projection/bootstrap/journal, and adds read-only prediction and conversation sections within the existing profile card. CA controls and their state setters are unchanged. A no-match explanation is shown without changing a selected Motif, Line or SKU.

## Fixed simulated assignments

All entries are **simulated platform predictions, not explicit preferences or purchases**. Each contains canonical `sku`, `line`, `motif`, integer `rank`, `rationale`, `source`, `isSimulated`, and fixture `version`. Values below are listed in rank order.

| Client        | CA       | Predicted SKUs, highest rank first |
| ------------- | -------- | ---------------------------------- |
| CL-001 林女士 | Sophie   | JAS-R01, JAS-B01, JAS-N01          |
| CL-002 陈女士 | Camille  | FEU-A-N01, FEU-A-B01               |
| CL-003 吴女士 | Amélie   | MUG-C-N01                          |
| CL-004 周女士 | Nora     | MUG-C-N01                          |
| CL-005 许先生 | Claire   | MUG-R-B01, MUG-R-R01, MUG-R-N01    |
| CL-006 沈女士 | Élise    | MUG-R-R01                          |
| CL-007 陆女士 | Lucie    | JAS-R01                            |
| CL-008 顾女士 | Anaïs    | FEU-A-R01, FEU-A-B01               |
| CL-009 黎女士 | Juliette | FEU-V-N01                          |

Reproduction: `simulatePredictions(clients, products, 20261107)` in `data/prediction-simulation.mjs`. The number of candidates (1–3) and equal-affinity ordering use seeded randomness. Known SKU/Line/Motif/category/material/gemstone affinities receive documented deterministic weights; strong material restrictions filter the catalog before simulation. This is a synthetic rules-and-seed fixture, not trained-model inference or a measured customer propensity. Sparse profiles receive explicit exploration rationales rather than invented preferences. Requests read the persisted JSON and never run the generator.

## Resolution contract

| Condition                                             | Behavior                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Aftercare                                             | Use exactly the authorized selected purchase, regardless of predictions/current shopping scope                                       |
| Explicit CA SKU                                       | Use that exact canonical SKU; predictions cannot replace it                                                                          |
| CA Line without SKU                                   | For prediction-relevant scenarios, select the smallest-rank valid predicted SKU in that Line                                         |
| CA Motif without Line/SKU                             | Select the smallest-rank valid predicted SKU in that Motif; its canonical Line supplies story grounding                              |
| No CA product scope                                   | Use the top valid prediction where the scenario makes recommendation relevant                                                        |
| No matching eligible prediction                       | Keep the selected Motif/Line, no SKU; no historic-interest or alphabetical fallback                                                  |
| Prediction outside scope / inconsistent canonical IDs | Ignore it                                                                                                                            |
| Firm material restriction                             | Filter automatic candidates; if an explicit SKU conflicts, retain it visibly and return NEEDS_REVIEW with actionable inline guidance |

Automatic prediction specificity applies to recommendations and reactivation. Price objections use predictions when a product scope is selected and the concern is product-relevant, or when an otherwise unscoped concern asks for a recommendation. Explicit general-price/different-work/undecided concerns stay general. Greetings never automatically mention products. Events do not auto-select predictions, but preserve a manually selected SKU as optional verified context. Weak historic preferences do not rerank fixed prediction ranks. Explicit current restrictions may rule out a prediction; they never make the resolver choose an unpredicted SKU.

Resolution sources are `ca_sku`, `simulated_platform_prediction`, `verified_purchase`, `scope_only` and `not_applicable`. Canonical product details always come from `data/catalog.mjs`, never from prediction rationale text. The `normalized.selection` object still records the CA's actual selections; inferred specificity appears separately in grounding and `productRecommendation`.

## Prompt and factual safeguards

`buildPrompt` and the mandatory factual audit receive the resolved canonical product and `productRecommendation` source, rank, simulated marker and restrictions. Generation encourages concrete product details when a prediction resolves a product, and remains at the selected level when none matches. Reactivation instructions explicitly support server-resolved predictions without allowing independent model selection.

Both prompts distinguish predictions from verified CRM interests/history/latestPreference/purchases. Local `PREDICTION_ATTRIBUTION` checks catch unsupported specific-product, series/Motif/category and purchase attributions using an independent evidence ledger; prediction fields never count as customer evidence. Current explicit notes can support actual stated preferences. The existing semantic factual audit remains mandatory and handles language beyond the conservative local patterns. Existing Brand Bible facts, brand voice, three styles, three paragraphs, hard factual rules and bounded recovery remain active.

The client-information workbook has three worksheets: 客户信息, 购买明细 and 平台模拟预测. It contains 9 client rows, the 12 original purchases and 15 ranked predictions. Prediction fields are explicitly labeled simulated, with canonical products, rank, rationale and fixture version. Purchase-count/total formulas have verified cached results; exact birthday days remain unrecorded. Regeneration refuses to overwrite an existing workbook; use `--output` for a new name:

```sh
/Users/perona/anaconda3/bin/python scripts/export-client-info.py --output deliverables/client_info_new.xlsx
```

## Files changed

- Data: `data/clients.mjs`; new `data/platform-predictions.json`, `data/prediction-simulation.mjs`.
- Resolution/provenance: new `server/product-selection.mjs`, `server/prediction-claims.mjs`; `server/rules.mjs`, `server/generation-context.mjs`, `server/index.mjs`.
- Generation/safety: `server/generation.mjs`, `server/audit-policy.mjs`, `server/output-assessment.mjs`, `server/prompt-context.mjs`, `server/message-contract.mjs`.
- UI: `src/ClientProfile.jsx`, `src/main.jsx`, `src/styles.css` (same layout/palette; separate prediction/history sections and no-match hint).
- Export: new `scripts/export-client-info.py`, new `deliverables/client_info.xlsx`.
- Tests: new `tests/platform-predictions.test.mjs`; `tests/api.test.mjs`, `tests/greeting-context.test.mjs`, `tests/reliability-matrix.test.mjs`, `tests/rules.test.mjs`, `tests/ui.test.mjs`.
- Documentation: this file and the post-V5 verification record.

Old tests asserting forced historical/alphabetical selection were updated to assert the new requested behavior. Original fixture files `tests/cases.mjs` and `tests/reliability-cases.mjs`, and every file under `evaluation/`, remain unchanged. No test was skipped to accommodate a failure.

## Validation

**629 tests pass** (9 new prediction tests plus the existing regressions), including all nine fixtures, canonical identity/ranking, Motif/Line resolution, explicit SKU priority, scope/no-match behavior, hard restrictions, aftercare priority, scenario relevance, false preference/purchase claims, caller-supplied prediction spoofing, and mocked generation/audit provenance for all nine clients. UI DOM tests verify separate profile sections, read-only predictions, unchanged manual selections, dependent controls and no-match generation. Production build passes; demo HTTP smoke and frozen-evidence integrity results are recorded in `docs/post-v5-platform-predictions-verification.json`.

UI checks use the existing JSDOM regression infrastructure; the in-app browser connection was unavailable. All Excel sheets were rendered from stored cell data/styles and visually inspected. No real LLM behavior or quality improvement is claimed without a separately approved post-V5 live evaluation.
