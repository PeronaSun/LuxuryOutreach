# Birthday, festive greeting and additional-context iteration

Implemented and verified on 2026-11-06. This is a new iteration; the frozen baseline evaluation is unchanged.

## Root cause and inspected data flow

The existing additional-context input already worked as a transport mechanism:

1. `src/main.jsx` stores the `#notes` textarea in `task.notes` through `change({ notes: ... })`.
2. The frontend sends the task to `/api/validate` and `/api/generate`.
3. `server/index.mjs` includes `notes` in its request-field allowlist.
4. `buildPrompt()` in `server/generation.mjs` already included the value in `untrusted_context.notes`.

The missing behavior was after transport. The deterministic demo templates never used those notes. The live prompt did not explicitly require each main paragraph to incorporate relevant notes, and the audit request omitted the notes, so it could not reliably detect their omission. Product ranking also used structured historical interests and the stored latest preference, without considering newer preferences in the notes.

The fix addresses interpretation, generation and validation. The existing two-call live pipeline remains: structured generation through the OpenAI Responses API, deterministic checks, then a separate audit call using the same configured model. There is no new provider, retrieval system, or automatic fallback from a failed live request to a demo response.

## Birthday behavior

`applicationCalendar()` calculates the current Gregorian date using the server clock and `Asia/Shanghai`. The production default is the real time; only tests inject a fixed clock. Public requests cannot override the clock, current month or stored birth month.

Birthday generation requires `client.birthMonth === applicationCalendar.month`. A mismatch returns `NEEDS_REVIEW` with a `birthday-month` issue. The existing left validation area displays the warning, disables generation and offers “改为节日问候”. The backend also refuses generation, including direct calls through the generation helpers. No date collection, confirmation workflow or profile mutation was added.

The frontend revalidates once per minute and when the window regains focus or visibility. The backend evaluates the clock again for every request. Festive greetings bypass the birthday-month gate. Existing guards against exact birthday dates and “今天是您的生日” remain.

## Christmas and Spring Festival

Christmas and Spring Festival have directly clickable chips alongside the existing festival options. All three main paragraphs must explicitly name the selected occasion: 圣诞 for Christmas; 新春 / 春节 / 新年 for Spring Festival. Generation instructions and the audit require appropriate atmosphere and noncommercial greetings. Demo versions use distinct festival-specific text in each style.

Christmas uses “圣诞将近” within 45 days before December 25, “圣诞时节” on December 25, and neutral advance-draft wording otherwise. Spring Festival uses neutral New Year wishes and never computes or assumes a Gregorian lunar-new-year date. An exact date is unnecessary for this draft workflow; no lunar-calendar dependency was introduced.

Output checks reject generic holiday bodies, unsupported today/date claims and unrequested Christmas/Spring Festival mixing. Explicit combined-greeting requests can enable both themes. Prompts and the audit prohibit invented events, promotions, gifts, religious beliefs and family arrangements.

## Additional communication context

The priority is: canonical brand facts and prohibited claims; current scenario and Motif / Line / SKU scope; relevant explicit notes; historical interests; general storytelling.

`communication-context.mjs` derives conservative intent facets and explicit preferences without changing the stored profile. It supports the supplied examples: understated commuting jewelry, completed projects and rest, comfortable wearing experience plus styling, and price concerns with comparison. New material/category/gemstone preferences influence ranking only within the selected product scope. An explicit SKU remains authoritative. When a new material preference differs from that SKU, the message can acknowledge the preference neutrally while describing the actual catalog material.

The live prompt receives both the raw untrusted notes and the derived context. It requires all three main paragraphs to integrate the most useful relevant point, with brief, detailed and elegant treatments. An empty derived context does not authorize the model to ignore raw notes. The audit also receives the original notes and must reject any candidate that ignores relevant context or gives older history priority over new explicit needs.

Recognized facets receive a deterministic per-main coverage check. Demo messages paraphrase those facets differently for each style; Detailed may include a second useful facet. Raw notes are never appended verbatim. Clearly irrelevant notes, incorrect catalog-only notes and experiences about another purchased category are excluded from the corresponding demo message. Existing unsafe-request blocking remains. Unfamiliar notes that the demo cannot safely interpret cause a clear error instead of a silently generic draft.

Price acknowledgments also avoid treating “没有超出预算” as a high-price complaint. Competitor comparison is acknowledged respectfully, without discounts or disparagement.

## Files changed in this iteration

| Files                                                                         | Purpose                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `server/application-calendar.mjs` (new)                                       | China-market date and festival timing context                                         |
| `server/communication-context.mjs` (new)                                      | Conservative context facets, preference extraction, coverage and price acknowledgment |
| `server/rules.mjs`                                                            | Birthday gate, scoped current-preference ranking, output guards, prompt version       |
| `server/message-contract.mjs`                                                 | Calendar/festival/context metadata; updated demo identifier                           |
| `server/generation.mjs`                                                       | Live prompt and audit requirements; context-aware demo and festival mains             |
| `server/index.mjs`                                                            | Server-clock injection, calendar responses, recorded context, safe demo error         |
| `src/main.jsx`                                                                | Festival chips, birthday warning/switch action and periodic validation refresh        |
| `tests/greeting-context.test.mjs` (new)                                       | Paired generation, boundary, grounding, mock-provider and rejection tests             |
| `tests/test-clock.mjs` (new)                                                  | Deterministic test-only clock                                                         |
| `tests/api.test.mjs`, `tests/ui.test.mjs`                                     | API/DOM acceptance coverage and existing workflow regression                          |
| `tests/cases.mjs`, `tests/rules.test.mjs`, `tests/message-structure.test.mjs` | Expected birthday gate and deterministic dates in active regression tests             |
| `scripts/smoke.mjs`                                                           | Deterministic matching-month production smoke check                                   |
| This document                                                                 | Root cause, implementation and actual verification record                             |

Existing uncommitted client-profile layout work was retained. This iteration did not change the prior theme CSS, profile component, product-label helper, selection helper, customer/catalog fixtures or dependency files. No layout rebuild was performed.

## Version and preservation record

- Git HEAD at implementation: `e5856af7bd5dc85541677a8af7aed30e6722953d`; changes are uncommitted workspace changes, not a new commit.
- Prompt: `advisor-1.3.0` (previously `advisor-1.2.0`).
- Demo model identifier: `demo-template-v1.3` (previously `demo-template-v1.2`).
- Message structure: unchanged `three-paragraph-v1`.
- Live model configuration: unchanged `OPENAI_MODEL`, default `gpt-4.1-mini`.
- Brand Bible, catalog and dependencies: unchanged.
- SHA-256 comparison against the pre-edit preservation manifest: all 92 protected files unchanged, including all 79 files under `evaluation/`, prior runtime outputs and the protected UI/data/dependency files.
- The frozen baseline remains `baseline-2026-11-06-e5856af7`. Its prompts, cases, outputs and reports were not updated to reflect this iteration.

The active regression fixture `tests/cases.mjs` is separate from the frozen baseline's copied case set. Its wrong-month birthday expectation was updated intentionally. No existing evaluation outputs were overwritten. Tests and smoke use temporary record directories and remove their own temporary records.

## Actual verification

| Command / check                 | Result                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                      | **110 passed, 0 failed, 0 skipped**                                                                                                            |
| `npm run build`                 | Passed; production assets built with Vite                                                                                                      |
| `node scripts/smoke.mjs`        | Passed: production HTML/JS, 9 clients, 15 products, recommendation, matching birthday, selected-purchase care and persisted/exportable records |
| `git diff --check`              | Passed                                                                                                                                         |
| SHA-256 preservation comparison | 92/92 unchanged; 79/79 frozen evaluation files unchanged                                                                                       |

Coverage includes Shanghai month/year boundaries, matching months for every fictional client, mismatched birthday blocking before provider calls, caller-date spoofing, holiday independence from birthday, advance holiday drafts, festival/date/mixing guards, and explicit dual-festival requests.

Eight paired demo comparisons hold client/scenario/product fixed and add notes: recommendation, Christmas, Spring Festival, birthday, care, price objection, reactivation and event. They verify that every main changes, conveys the relevant detail without copying the full note, keeps three paragraphs, preserves facts and remains differentiated by style. Other tests cover new preferences against old interests, explicit-SKU precedence, irrelevant/unsafe/conflicting notes, negation, unrelated purchases, editing/copying/history, and unchanged profile/theme DOM behavior.

Provider-path tests use mocked Responses API replies. They verify prompt/audit payloads, withholding when recognized context is missing, and semantic-audit rejection for unfamiliar notes. **These are not real model generations or LLM quality scores.**

## Limits and rerunning

No API key was configured in the inspected environment, and there was no local `.env` file. No real LLM calls, human quality ratings or new baseline scores were produced.

The demo remains a labeled, finite-vocabulary template system. Unrecognized context requires clearer notes or live mode. Keyword coverage can reject valid synonyms and cannot prove semantic fidelity or factual accuracy on its own. The live audit uses the same model as generation in a separate call; correlated mistakes remain possible. Live outputs still need representative real-model runs and CA review before making quality claims. DOM tests verify interactions and theme tokens; no new browser screenshot or pixel-level visual assessment was performed in this iteration.

Run `npm test`, `npm run build`, and `node scripts/smoke.mjs` from the project root to reproduce the local checks. They require no API key. Tests/smoke inject dates for reproducibility; the normal app does not. Run `npm run dev` to inspect the workspace with the real current Shanghai month. Configure the existing server-side API key and live mode only when ready to test real-model quality; record those executions as a separate iteration.

Do not use legacy `npm run evaluate` to preserve old runtime outputs: it writes its historical output paths. Any future evaluation of this prompt version should use a fresh iteration/run directory. A frozen-baseline checker that compares the current production source to the old source snapshot will correctly detect this authorized implementation change; that source difference does not mean the frozen baseline files changed.
