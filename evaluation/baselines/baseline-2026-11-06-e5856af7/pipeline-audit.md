# Current generation pipeline audit

Audit date: November 6, 2026. Evidence is the frozen code at commit `e5856af7bd5dc85541677a8af7aed30e6722953d`. Links below point to the snapshot, so this audit remains reviewable after future application changes. Production implementation and prompts were not edited.

## 1. Request-to-message flow

1. The React workspace calls `/api/validate` after input changes and `/api/generate` on submission. Its revision counter discards responses for inputs that have since changed. Client and scenario choices are buttons. This is an advisor drafting tool; no WeChat delivery integration exists. Evidence: [main.jsx](snapshot/src/main.jsx), `api()`, validation effect, and `generate()`.
2. The Node API accepts a bounded JSON body and allowlists `clientId`, scenario, product hierarchy, occasion, purchase/event IDs, notes, concern, reconnect reason, and greeting fields. Request-supplied customer, advisor, catalog, or purchase facts are not authoritative. It loads canonical fixtures and calls `evaluateRequest()`. Evidence: [index.mjs](snapshot/server/index.mjs), lines 95–145.
3. `evaluateRequest()` checks factual completeness and product scope, resolves a product, and produces READY, NEEDS_REVIEW, or BLOCKED. Only READY reaches generation. Material-preference differences are non-blocking notices. Evidence: [rules.mjs](snapshot/server/rules.mjs), lines 13–177.
4. `generate()` explicitly selects demo or live behavior, validates the three candidates, and in live mode performs a second model call for a factual/style audit. Failure withholds candidates; there is no repair loop or automatic retry. Evidence: [generation.mjs](snapshot/server/generation.mjs), lines 271 onward.
5. Successful results, resolved context, selected purchase, message plan, and declarative versions are appended to `runtime/records.jsonl`. Input rejection and generation failure also get records, with no delivered candidates. The UI displays three cards, supports editing/copying/regeneration, and exports records. Evidence: `index.mjs`, lines 169–240; `main.jsx`.

## 2. Live API versus demo templates

The live implementation is real: `structuredCall()` sends `fetch()` requests to `https://api.openai.com/v1/responses` using a server-side bearer key. It requests strict JSON-schema output, `store:false`, at most 1,800 output tokens per call, and a 45-second timeout. It checks HTTP success, completed status, refusal, and JSON parsing. No SDK is used. Temperature and seed are not sent.

The configured/default live identifier is `gpt-4.1-mini`. The same configured model performs generation and the subsequent audit. This is a separate audit **call**, not an independent model family or a calibrated evaluator. The application ignores provider-returned model metadata, usage and request IDs in its returned result.

`demoCandidates()` is a distinct deterministic template implementation: fixed per-Line imagery, source-derived stories, occasion phrases, scenario frames, and a price-concern keyword classifier. It is not an LLM call. Its model label is `demo-template-v1.2`, and the UI labels it non-AI demo output.

| Environment | Application behavior |
| --- | --- |
| No key; DEMO_MODE unset | Demo templates |
| Key present; DEMO_MODE unset | Live calls |
| DEMO_MODE=true | Demo even if a key exists |
| DEMO_MODE=false; no key | Live-mode configuration error, not template fallback |

At capture there was **no key and no `.env`**. Effective application mode was demo. No live execution has been demonstrated by this audit. The isolated evaluation runner uses explicit `demo:true` or `demo:false`, records that override, and never silently substitutes templates for a live run.

## 3. Brand Bible incorporation and retrieval classification

There are two mechanisms:

- The full `docs/brand-bible-v1.txt` is read at module import and interpolated directly into the live generator's instruction string. The complete text is also supplied to the model-audit request as `rules`. This includes unselected catalog content.
- `storyFor(product)` performs exact SKU → Line → Motif lookups in the in-memory catalog. `messagePlan()` supplies the resolved SKU facts, exact source-derived Motif and Line stories, occasion direction, style directions, trusted greeting, and scenario closing options. The relevant packet is JSON in the live input.

Evidence: [generation.mjs](snapshot/server/generation.mjs), `buildPrompt()` and audit input; [message-contract.mjs](snapshot/server/message-contract.mjs), `storyFor()` and `messagePlan()`; [catalog.mjs](snapshot/data/catalog.mjs).

**Classification:** structured catalog lookup plus direct context/prompt augmentation. There is real deterministic lookup, but no document chunking, embedding model, vector database, semantic search, learned retrieval ranking, or corpus retriever. Calling this conventional semantic/vector RAG would overstate the implementation. In a broad sense it is retrieval-augmented generation via exact business-key lookup; the full Bible is also directly inserted rather than retrieved on demand.

The demo branch does not read the live prompt to write prose. It uses hardcoded story paraphrases and the catalog story fields. Therefore strong prompt instructions do not establish that demo messages honor conversation notes.

## 4. What influences product choice and prose

Evidence: `resolveProduct()` in [rules.mjs](snapshot/server/rules.mjs), `buildPrompt()` / `demoCandidates()` in [generation.mjs](snapshot/server/generation.mjs).

| Input | Product resolution | Live prose | Demo prose |
| --- | --- | --- | --- |
| Current Motif / Line / SKU | Filters allowed scope first; explicit SKU fixes the answer | Receives one resolved SKU and story packet; forbidden to switch | Uses that resolved SKU |
| Structured interests | Additive match weights inside scope | Supplied in client context | Can supply one relevance phrase |
| Latest explicit material | Adds 150 on match; a mismatch produces a notice | Supplied in context | Can supply a material preference phrase |
| Purchase occasion | Adds 2 for a matching Line suitability tag | Explicit self/wedding/gift direction in the message plan and prompt | Fixed occasion phrases change the main paragraph; when occasion exists, its phrase replaces the optional preference phrase in Detailed |
| Selected purchase ID | Aftercare uses only a purchase owned by the chosen client | Only that purchase appears in `client.purchases` and `purchase` | Uses selected product and purchase date |
| Stored conversational history | Does not rank products | Supplied to generation and audit | Not interpreted as conversation text |
| Notes and reconnect reason | No semantic ranking; keyword rules may reject text | Sent under `untrusted_context` to generation | Not used to compose main text |
| Actual price concern | Completeness/keyword checks only | Sent to generator and audit | Classified with a few regex branches |
| Event ID | Must match a stored verified event | Stored logistics and resolved product context | Stored logistics and optional source story |

Within scope, historical exact SKU scores 100, Line 30, Motif 12, category 10, material 8, and gemstone 8; weights accumulate. Latest-material match adds 150; documented occasion fit adds 2. Ties use ascending `sku.localeCompare()`. These numbers are not an LLM decision. No current preference is overwritten. A latest-material weight is not an unconditional override of every possible accumulated historical score.

Aftercare bypasses recommendation ranking and uses its selected purchase. Greetings have no product. Recommendation, reactivation, event, and price are product scenarios; event currently resolves a product even when no jewelry scope was explicitly selected. Sparse preferences permit neutral fallback.

## 5. Style differentiation

The live prompt targets main-paragraph differences: Concise 1–2 sentences and one core idea; Detailed 2–4 sentences with Motif/Line/SKU explanation and relevant context; Elegant 2–3 sentences using restrained source imagery. Greeting is fixed and closing comes from a small allowed pool. These are instructions and source inputs, not proof of model quality.

The deterministic template branch implements different body constructions for the same roles. `validateCandidates()` compares **main paragraphs**, rejects exact duplication or Chinese/digit trigram Jaccard similarity above 0.84, requires Detailed to be longer than Concise, and requires at least two distinct closings. It does not prove information density, naturalness, exactly specified sentence counts, or that Elegant is the best prose. Human comparison remains necessary.

## 6. Three-paragraph enforcement

Each client stores `assignedAdvisor`; the required assignments Sophie/Camille/Claire are fixed data. `greetingFor()` constructs the complete first paragraph from that trusted profile. The model returns only three ordered `{style, main, cta}` objects. `main` cannot contain a non-trimmed internal newline; `cta` must be an exact allowed scenario ending. `assembleCandidates()` joins introduction, main and closing with `\n\n`.

The output validator rechecks three nonempty paragraphs, exact introduction, one Bonjour, Chinese presence in the body, no paragraph headings, and allowed ending. Cards and Journal preserve whitespace; copying preserves the string. Optional edited-message checks still check format/facts but allow a CA-written closing rather than requiring the exact generation pool. Evidence: [message-contract.mjs](snapshot/server/message-contract.mjs), [rules.mjs](snapshot/server/rules.mjs), `index.mjs` lines 148–164, [styles.css](snapshot/src/styles.css).

## 7. Current guardrails and their limits

- Input: JSON/body-size and text-length limits; allowlisted fields; canonical fixture lookup; incompatible Motif/Line/SKU rejection; recorded purchase ownership; stored event facts; required price concern and explicit SKU; festival name completeness. All predefined fictional clients are eligible; there is no contact-permission gate in this baseline.
- Untrusted context: notes/history are labeled data in the prompt; an input regex blocks some fabrication/injection requests. It is not semantic instruction isolation and is negation-insensitive in observed cases.
- Output: three ordered styles, paragraph contract, exact advisor/customer, Chinese-character presence, 600-character ceiling, no emoji, keyword bans, recognized out-of-scope SKU/Line/Motif imagery, supported materials/gemstones/prices, some private-attribute/age patterns, and numeric birthday-month/day checks.
- Live release filter: same-model structured audit checks scenario, facts, selected purchase, occasion and styles. Failure withholds the set. Audit sees stored history and price concern but **not additional notes or reconnect reason** as separate fields; context alignment can be under-observed.
- Editing: optional deterministic checking is explicitly limited; copying is not blocked pending a check and nothing is sent automatically.

These checks are incomplete semantic detectors. For example, the price regex recognizes particular currency/number forms; the birthday regex does not enumerate every Chinese date phrasing; Chinese-language checking requires a Han character rather than measuring fluency. The same-model audit is fallible. An automatic pass is not a human quality or compliance certification.

## 8. Existing evaluation and evidence caveats

The existing [scripts/evaluate.mjs](snapshot/scripts/evaluate.mjs) evaluates fifty fixed status/SKU cases, defaults to demo, and writes fixed `runtime/evaluation-demo.*` or `evaluation-live.*` filenames. Re-running it could overwrite prior evidence. Its exported language results are not human quality scores. **It was not run for this phase.**

Production records do not preserve the exact API request/response, withheld drafts, audit reasons, tokens, latency, or provider-returned model. The new isolated runner preserves those when available without changing production generation. It records validated context and exact prompt fingerprints now; live telemetry remains absent until a real model request occurs.
