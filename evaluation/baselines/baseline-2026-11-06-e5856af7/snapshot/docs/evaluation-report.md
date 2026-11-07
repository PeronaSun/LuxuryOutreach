# Message-generation evaluation report

Executed November 5, 2026 against Brand Bible **1.0 · 2026-11**, prompt **advisor-1.2.0**, and explicit demo templates **demo-template-v1.2**. This report covers the updated existing application and supersedes the earlier workflow evaluation.

## Actual results

| Check                    | Result                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`               | **79 passed, 0 failed**, including the updated 50 fixed cases, HTTP API, mocked LLM/audit integration, and DOM workflow                                  |
| `npm run evaluate`       | **50/50** status/SKU and permitted demo-output checks passed                                                                                             |
| Evaluation distribution  | **31 READY, 7 NEEDS_REVIEW, 12 BLOCKED**                                                                                                                 |
| Candidate count          | **93 clearly labeled demo candidates**, three per READY case                                                                                             |
| `npm run build`          | Passed; production HTML, CSS, and JavaScript generated                                                                                                   |
| `node scripts/smoke.mjs` | Passed: production HTML/JS, nine clients, fifteen products, recommendation, birthday-month greetings, chosen-purchase care, persisted/exportable records |
| Real model execution     | Not performed; API credentials were not configured. The existing integration remains contract-tested with mocked Responses and audit calls.              |
| Visual/browser QA        | Not performed; the supported in-app browser was unavailable and browser discovery returned an empty list.                                                |

The updated [50-case CSV](evaluation/demo-results.csv) and [JSON evidence](evaluation/demo-results.json) contain the actual inputs, expected/actual statuses and SKUs, versions, and demo candidate text. No human language-quality scores or live-model results are fabricated.

## Three-paragraph generation checks (Tests A–G)

- **A/B — Structure and advisors:** all three candidates contain exactly three newline-separated paragraphs; introduction is server-assembled from stored `assignedAdvisor`. Required Sophie/Camille/Claire assignments and every other demo advisor are checked. Wrong advisors, missing/extra/repeated greetings, English-only bodies, and headings are rejected.
- **C — Story accuracy:** all three Motif stories and all five Line stories match the source text verbatim. Retrieval is checked for every one of the fifteen SKUs; Jasmin, both Muguet Lines, and both Feuille Lines receive their own imagery and factual product data. Tests prevent aquamarine from leaking into Feuille Vive descriptions.
- **D — Differentiation:** deterministic fixture main paragraphs for all fifteen SKUs have a shorter Concise version, additional exact design/story facts in Detailed, and distinct restrained imagery in Elegant. These are fixture and validation checks, not human scores for actual model prose.
- **E — Occasions:** the same client and JAS-R01 produce distinct self-purchase, wedding and gifting middle paragraphs in all three styles. Live request payloads carry the occasion direction. Relationship and bridal assumptions are checked.
- **F/G — Scenario and CTA:** six scenarios plus the festival subtype use the format. Greetings contain no forced products; aftercare uses the chosen purchase; event paragraphs preserve logistics; price paragraphs acknowledge concerns; closing pools are scenario-appropriate and vary across candidates. Unsupported screenshot claims about stock, reserved time, appointments, or seats are not used.
- **Live contract:** mocked Responses calls verify strict `main`/`cta` schema, retrieved story input, fixed advisor introduction, occasion direction, factual audit, and withholding malformed multi-paragraph model bodies. No real provider calls were made.
- **UI/API:** DOM interactions verify visible advisor assignments, three paragraphs in results, selection/edit/copy preserving breaks, and the existing button hierarchy/workflow. HTTP tests verify message format, stored message plan/advisor, record export, and the optional edited-message check. Production HTTP smoke checks passed.

Current modified files: `data/clients.mjs`, `data/catalog.mjs`, `server/message-contract.mjs` (new), `server/generation.mjs`, `server/rules.mjs`, `server/index.mjs`, `src/main.jsx`, `src/styles.css`, `tests/message-structure.test.mjs` (new), existing rule/API/UI tests, `scripts/smoke.mjs`, README, this report, the implementation log, and refreshed evaluation JSON/CSV evidence. No libraries were added.

Observed and corrected failures: the first occasion test required the exact words “个人表达” even for the semantically equivalent “个人风格” and “自己的表达”; the assertion now accepts these explicit alternatives. The first full API run also found that custom edited closings were incorrectly checked against the generator's exact phrase pool; the API now permits a grounded CA-written closing while generated messages remain constrained. Final test execution is clean.

## Changed behavior verified

- All nine fictional clients can use all six scenarios when essential scenario facts are supplied. A separate all-client/all-scenario regression iterates the 54 combinations. There are no contact flags, permission fields, inquiry-eligibility gates, contact controls, or contact confirmation steps in the current workflow.
- Each profile has an integer birth month from 1 to 12 and no exact birth date. Birthday greetings work immediately without a date, checkbox, or approval. Deterministic checks reject invented birthday days, wrong numeric months, age claims, and statements that today is the birthday; they allow natural “新的一岁” wishes.
- Festivals use clickable choices or a short free-text name and do not require birthday information.
- 林女士, 陈女士, and 许先生 each have the two requested purchases and dates. Every record has a unique purchase ID, canonical product description, SKU, Motif, Line, category, purchase date, catalog price, and optional occasion/advisor note. All purchase dates precede the fictional context of November 5, 2026. Existing unrelated interests remain intact.
- Each other demo client has a small fictional purchase record, keeping all six scenario demonstrations available for every client. No runtime generation invents a purchase.
- The profile displays compact Purchase History rows. Aftercare displays clickable purchase cards and does not preselect a purchase. The selected record ID controls the product, prompt, and persisted/exported purchase context. Attempts to use another client's purchase or supply invented purchase facts are rejected or ignored.
- Historical material differences are informational. The current CA selection stays authoritative, with no conflict confirmation action.
- The UI retains the two-column workspace, six scenarios, optional Motif/Line/SKU hierarchy, parent clearing, purchase occasions, three styles, select/edit/copy, regeneration, Journal, and explicit demo/live labeling. No select controls were introduced.
- Blue theme tokens are checked through the DOM stylesheet. Functional tests verify all relevant interactions. jsdom cannot validate pixel appearance or reliably resolve inherited CSS custom properties in computed button backgrounds; those checks are not presented as visual QA.

## Safeguards retained

Canonical product facts and scope restrictions remain enforced. The input allowlist rejects attempts to override catalog/client/purchase/event facts. Generation still uses structured output, deterministic candidate validation, and a fresh same-model factual audit in live mode. Unsupported discounts, stock, certificates, warranty claims, invented event details, unrelated private attributes, and internal CRM labels remain prohibited. Missing essential facts receive short inline guidance rather than approval screens. Edited-message checking remains optional and explicitly limited.

## Findings corrected during this change

- Removed obsolete contact and exact-birthday validation in both frontend and backend, rather than just hiding controls.
- Changed aftercare requests from SKU selection to purchase-record ID selection, so the full selected purchase is unambiguous and auditable.
- Added selected purchase details to generation context, independent audit context, and saved generation records.
- Corrected an overly broad age check that rejected the harmless birthday phrase “新的一岁”; numeric and Chinese age claims remain rejected.
- Updated DOM test fixture record IDs to be unique when multiple generations occur; final test execution had no duplicate-key warnings.
- A restricted test invocation failed while opening local networking and emitted a native Node assertion. The final approved-networking test and production smoke runs passed. The native assertion's root cause was not independently established.
- jsdom returned a transparent computed background for CSS variables despite exposing the correct theme tokens. Tests check the stylesheet tokens and workflow, and browser rendering remains explicitly unverified.

## Remaining limitations

Live model quality, real clipboard behavior, mobile viewport appearance, keyboard/screen-reader behavior, and pixel-level theme review remain unverified in a real browser. Semantic checks and model audit cannot guarantee compliance; the CA still chooses the final message. Profiles, purchase records, and event logistics remain fictional fixtures. Earlier generation records are retained unchanged for provenance; current Journal summaries do not revive their obsolete contact-flow notices.
