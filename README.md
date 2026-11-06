# Maison Lioré · Client Advisor Workspace

A working local MVP for a **fictional** fine jewelry brand. React, Vite, and a small Node HTTP server. Chinese WeChat drafts remain under the Client Advisor's control; nothing sends messages automatically.

## Run locally

Requires npm and a supported Node.js version: **24.15+ in the 24.x line** (tested with 24.16.0), **22.22.2+ in the 22.x line**, or 26+. The version floor includes jsdom's test-runtime requirements.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Vite serves the UI and proxies `/api` to the Node server on port 3001. The development server reloads when backend modules change.

For a production build served by Node:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. Both servers bind to loopback. This is a local, single-advisor application.

## Configure the LLM

Without a key, the application clearly labels its **deterministic demo templates as non-AI output**. Live requests never silently fall back to templates.

```sh
cp .env.example .env
```

Edit `.env` locally:

```dotenv
DEMO_MODE=false
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
PORT=3001
```

Restart `npm run dev` after changing `.env`. Use an account-accessible model that supports the Responses API and strict JSON-schema output. The model identifier is configurable; `gpt-4.1-mini` is a configuration default, not an assertion of account access. `DEMO_MODE=true` explicitly forces demo output even with a key. `DEMO_MODE=false` without a key reports a configuration error.

Secrets stay on the server. `.env` is ignored, the frontend receives only mode/model metadata, and requests set `store:false`. **Never prefix API keys with `VITE_`.** Live generation uses two API calls: structured generation, followed by a fresh same-model factual/tone audit. Requests time out after 45 seconds per call. Failed generation, refusals, invalid output, or failed review withhold all candidates and show a safe error.

API implementation reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Use the workspace

1. Select a fictional client. Stored interests, birth month, and purchase history load automatically. Every demo client is eligible for outreach.
2. Choose one of six scenarios. There are no contact-permission or approval steps.
3. Select a Motif, optionally a Line, optionally an SKU. All predefined choices use buttons/cards. Optional choices can be cleared; parent changes clear children.
4. Add only relevant context. Birthday-month greetings work immediately from the stored month; festivals use a clickable festival or a short name. Aftercare requires selecting a purchase card, with no purchase silently preselected. Invitations use the stored fictional event. Price discussions require the specific SKU and the customer's actual concern.
5. Generate, compare the three styles, select, edit, and copy. A preference difference is informational and never changes the CA-selected product or requires approval. Edited text is marked as unreviewed; its optional basic check is not a compliance certification.
6. Open **生成记录 / Journal** or use **导出生成记录** for JSON export.

For a quick demo: the default 林女士 + 产品推荐 + Jasmin Motif resolves to `JAS-R01` without choosing a Line or SKU. Switch to 生日 / 节日祝福 to generate November birthday-month wishes with no date input. In 购买后关怀, select either her September ring or June necklace. 陈女士 and 许先生 also have two purchases each. All nine fictional clients support all six scenarios when the necessary scenario facts are supplied. Sparse preference information produces neutral catalog recommendations.

## Three-paragraph message contract

Every new candidate is composed as `introduction + "\n\n" + main + "\n\n" + closing`. The existing result cards preserve whitespace, the editor/copy actions preserve the original text, and Journal messages now preserve paragraph breaks too. No selection workflow or CTA selector was added.

`assignedAdvisor` is stored on every fictional client and included in the minimal profile projection. 林女士 → **Sophie**, 陈女士 → **Camille**, 许先生 → **Claire**. The assigned advisor is visible in the client profile. The server constructs the first paragraph from canonical client data, for example `Bonjour，林女士，我是 Maison Lioré 的珠宝顾问 Sophie。`; the model cannot choose a different name or advisor for this paragraph.

The live model still writes Paragraph 2. It receives a retrieved `messagePlan.story` containing the resolved product's **verbatim Motif story, verbatim Line story, and canonical SKU facts**, plus the current occasion, relevant stored preferences, selected purchase/event, and untrusted conversational context. Product resolution and CA-scope priority are unchanged. A broad Motif story does not authorize unsupported SKU details: Feuille Vive cannot inherit Aqua Héritage's aquamarine, and a Line's diamond description cannot be copied into an SKU without source support.

The structured response returns `style`, `main`, and `cta` for each candidate; the server assembles the three paragraphs. Concise focuses on one core idea in 1–2 sentences. Detailed explains Motif/Line narrative, exact design/material facts and relevance in roughly 2–4 sentences. Elegant uses source-grounded imagery in roughly 2–3 sentences. The 45–100-character guidance can be exceeded when the introduction, story and closing need more space. Output checks reject a flat block, extra paragraphs, repeated/wrong introductions, headings, English-only bodies, near-duplicate main paragraphs, and a Detailed body no more informative in length than Concise. A fresh same-model audit separately checks factual accuracy, meaningful style differences, occasion relevance, and response to the actual price concern.

The occasion changes the **middle paragraph**: personal purchase connects design with daily style and self-expression; wedding connects it with ceremony/celebration without assuming a bride or groom; gifting connects symbolism and thoughtfulness without inventing the recipient's relationship. These directions are explicit in live input and implemented in the labeled demo fixtures.

`server/message-contract.mjs` supplies small scenario-specific closing pools based on the screenshot's restrained consultation tone and the Brand Bible. The model chooses distinct approved endings. Product recommendations offer further design information, care continues the wearing-experience discussion, reactivation leaves room to reconnect, invitations express participation intent, price replies invite further questions without pressure, and greetings use a warm non-commercial closing. No closing asserts prepared stock, reserved time, seats, fitting availability, or additional service benefits. Edited final messages may use a CA-written closing; their optional check retains structure/factual checks without requiring the generator's exact phrasing.

The explicit non-AI demo mode uses the same paragraph contract, retrieved stories and guardrails. It does not replace live LLM generation. New records store `three-paragraph-v1`, the retrieved message plan, assigned advisor in client context, and prompt/template versions; earlier records remain unchanged.

## Grounding and decisions

The user-supplied [Brand Bible](docs/Maison_Liore_Fictional_Brand_Bible_v1.docx), version 1.0 (November 2026), is preserved alongside its [text extraction](docs/brand-bible-v1.txt). No additional official products or product names were invented. SKU cards use the source's product descriptions as labels. Prices are fictional RMB suggested retail prices. Product illustrations are labeled design schematics, not photographic representations of canonical products.

Nine fictional client profiles, conversations, birth months, purchases, and one verified fictional event are fixtures in `data/clients.mjs`. They are demonstration facts, not real CRM data. Only minimal relevant profile fields reach the model. Contact restrictions and exact birthday dates are absent. The current demo workflow follows the redesign brief; canonical Brand Bible product facts are unchanged.

林女士 has `JAS-R01` (2026-09-18) and `JAS-N01` (2026-06-12); 陈女士 has `MUG-R-N01` (2026-08-22) and `MUG-R-B01` (2026-04-15); 许先生 has `FEU-A-N01` (2026-10-10) and `FEU-A-R01` (2026-07-06). Each other demo profile has one fictional purchase so aftercare can be exercised for every client. Records include a unique purchase ID, canonical product description, SKU, Motif, Line, category, historical purchase date, catalog price, and optional occasion/advisor note. All dates precede the fixed demonstration context, 2026-11-05. Aftercare requests reference a **purchase ID**, not just an SKU, and the selected record is included in the generation prompt and journal export.

Recommendation ranking first filters the catalog to the current CA scope. An explicit SKU wins. Within scope, current explicit material preference scores 150; historical exact SKU 100, Line 30, Motif 12, category 10, material 8, gemstone 8; documented Line occasion suitability adds 2. Ties use ascending SKU. Wedding context adds no invented bridal suitability. A material preference difference appears as a non-blocking note and never changes stored preferences. Factual product, purchase, event, privacy, and unsupported-claim checks remain automatic.

## Main files and architecture

| File                             | Responsibility                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/main.jsx`, `src/styles.css` | Responsive two-column workspace, buttons, scenario forms, profile, results, editor, journal                  |
| `src/selection.mjs`              | Parent/child selection transitions                                                                           |
| `data/catalog.mjs`               | Canonical 3 Motifs, 5 Lines, 15 SKUs, descriptions, materials and prices                                     |
| `data/clients.mjs`               | Fictional profiles, birth months, complete purchase records, verified event                                  |
| `server/rules.mjs`               | Factual completeness, scoped ranking, non-blocking preference notes, deterministic output checks             |
| `server/message-contract.mjs`    | Trusted introduction, exact story retrieval, style/occasion directions, scenario endings, paragraph assembly |
| `server/generation.mjs`          | Versioned prompt, six scenario instructions, Responses API, audit, explicit demo templates                   |
| `server/index.mjs`               | Input allowlist, local API, JSONL persistence, record export, production static server                       |
| `tests/cases.mjs`                | Fifty fixed cases with expected status and resolved SKU                                                      |
| `scripts/evaluate.mjs`           | Separate reproducible evaluation runner and JSON/CSV export                                                  |

Flow: client → scenario → relevant selections/context → generate → select/edit/copy. Internally: request allowlist → canonical profile/purchase/event lookup → factual completeness and scope checks → structured LLM → deterministic validation → same-model audit → exactly three candidates → persisted record. Missing essential facts use short inline guidance; no approval dialogs are introduced. Demo mode follows the same business rules and deterministic output validation, replacing the two LLM calls with clearly labeled templates.

## Tests and evaluation

```sh
npm test
npm run evaluate
# Only after configuring a real key; performs paid API calls for READY cases:
npm run evaluate:live
```

`npm test` covers the fixed 50 cases, catalog/source integrity, selection transitions, privacy projection, hierarchy, output checks, API persistence/export, duplicate submission, provider failure/refusal handling, mocked live generation/audit, and DOM interactions. The DOM suite uses jsdom; it is not visual browser QA.

`npm run evaluate` writes `runtime/evaluation-demo.json` and a UTF-8 BOM CSV suitable for spreadsheet import. The updated fixture has **31 READY, 7 NEEDS_REVIEW, and 12 BLOCKED** cases. Each READY case gets three demo candidates; incomplete or factually prohibited cases get none. `evaluate:live` writes separately named live files and fails before generation when no key exists. No human quality scores are synthesized. Prompt version `advisor-1.2.0` and template version `demo-template-v1.2` distinguish the simplified workflow from earlier records.

Generation records live in `runtime/records.jsonl`. They preserve case/record IDs, scenario, selections, occasion, stored client context/history and assigned advisor, retrieved message plan/format version, **selected purchase record**, event context, resolved SKU/reason, three candidates when available, model identifier, prompt/Brand Bible version, timestamp, and validation status. Earlier records remain intact; the current journal does not revive obsolete contact-workflow notices. Runtime files are ignored by Git. Edited final text is not persisted; the record preserves original candidates.

See [evaluation and defect report](docs/evaluation-report.md) and [implementation log](docs/implementation-log.md) for actual execution results and limitations.

## Known limits and next improvements

- Live network calls and human language quality evaluation require an API key and have not been exercised in this session. Mocked tests verify the integration contract, including the audit failure path.
- No browser connection was available, so visual, mobile viewport, clipboard-permission, and keyboard behavior in a real browser remain unverified. Responsive CSS and native button keyboard semantics are implemented and DOM interactions are tested.
- Semantic fact checking and same-model review reduce risk but cannot guarantee compliance. Nuanced prompt injection, phrasing, inferred attributes, or unsupported claims can evade keyword checks or model judgment. CA review is always required; edited-message checking is limited to deterministic rules.
- The 45–100 Chinese-character range is guidance. Event messages may run longer to retain verified logistics. Demo templates are intentionally deterministic and are not evidence of live model quality.
- Profiles, purchase records, and verified events are server fixtures. There is no CRM editing, login, shared-user database, automatic WeChat delivery, or deployment in this MVP. Loopback binding and local-origin checks support the intended local workflow.
- Next: run and annotate the live evaluation against the nine-dimension rubric, complete real-browser/a11y review, and persist edited drafts if required.
