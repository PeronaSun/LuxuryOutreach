# DeepSeek integration continuation — verified 2026-11-07

## Outcome

**The real React → HTTP frontend proxy → backend → DeepSeek → React flow passed.** One new generation submission returned three Chinese messages and displayed them through the existing React application. The model sent and returned was `deepseek-flash`, with `reasoning.effort=none`. No retry or 50-case evaluation was run.

The in-app browser connection had no available browser session. Verification therefore used the actual React component mounted in JSDOM with real HTTP requests through a running Vite proxy and backend. Application API responses and provider responses were **not mocked or replayed** in this new end-to-end test. This establishes the request/state/render flow, not visual browser layout or operating-system clipboard behavior.

## What survived the interruption

Repository inspection and saved evidence confirmed:

- Server-only DeepSeek configuration and Responses API routing were already implemented.
- Structured generation, JSON/schema checks, fixed advisor introduction, three-paragraph assembly and independent audit calls were present.
- The audit had already been separated into hard factual/task failures and soft quality warnings; severity is assigned by application code.
- Whitespace normalization, actionable error codes and opt-in structured diagnostics were saved.
- Prompt version was already `advisor-1.3.1`.
- The 2026-11-06 diagnostic run was successful: one generation, two HTTP 200 DeepSeek calls, three messages returned, no audit findings.
- The interrupted frontend replay had actually finished and saved `runtime/deepseek-debug/2026-11-06T21-15-46-719Z/ui-replay-verification.json` with `passed=true` and three rendered messages. That test replayed a captured response and made zero new provider calls.

The remaining gap was a newly verified frontend-to-provider round trip, plus loading, editing, selection and copy checks against that fresh result.

The original failed run had reached its final audit after successful API responses and deterministic validation. Its single boolean gate conflated factual failures and style/story-depth issues, and the failure path discarded the detailed rationale. The exact finding from that historical rejection cannot be recovered from its saved record. This continuation does not claim otherwise. The fresh test below demonstrates the revised hard/soft policy with actual quality warnings.

## Configuration and running services

- `.env` loads through Node's `--env-file-if-exists=.env`.
- The configured DeepSeek key is available server-side. It was checked for presence only and was not printed, logged, copied into frontend code or committed.
- Base origin: `https://api.deepseek.com`; model: `deepseek-flash`; mode: live.
- `.env` is ignored by `.gitignore:3` and is not tracked by Git.
- Both existing services were reachable: backend `http://127.0.0.1:3001/api/bootstrap` and frontend proxy `http://127.0.0.1:5173/api/bootstrap` returned HTTP 200 and reported live DeepSeek mode with `deepseek-flash`.
- The integration test used isolated temporary frontend/backend ports and a new records directory, leaving those existing services and prior records untouched. Its temporary services were closed after verification.

## Actual automated results

| Verification                | Actual result                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Existing `npm test`         | **125 passed, 0 failed, 0 skipped**                                                          |
| New no-generation preflight | Passed: actual React form and frontend/backend HTTP path; **0 provider calls**               |
| New live end-to-end test    | Passed: one UI submission, two provider calls, three displayed Chinese candidates            |
| `npm run build`             | Passed                                                                                       |
| `git diff --check`          | Passed                                                                                       |
| Preservation comparison     | All **133 existing protected files** unchanged, including all **79 frozen evaluation files** |

The first preflight encountered Vite's default-port behavior (`port=0` resolves to 5173), while the user's existing frontend already occupied that port. Only the new verification script was corrected to select a free numeric port. Both preflight records were inspected and preserved. Neither preflight invoked DeepSeek.

## New live test and evidence

Test began at `2026-11-07T16:22:11.519Z` and finished at `2026-11-07T16:22:19.203Z` (11:22 AM America/New_York).

Complete selected communication task:

```json
{
  "clientId": "CL-001",
  "scenario": "recommend",
  "motif": "jasmin",
  "line": "jasmin",
  "sku": "JAS-B01",
  "occasion": "personal",
  "notes": "客户喜欢低调、适合日常佩戴的珠宝，不喜欢过于夸张的设计。"
}
```

The actual frontend request also included its normal empty optional fields; those are preserved in the evidence. The fictional customer is 林女士, assigned to Sophie. Canonical SKU `JAS-B01` is the 18K rose-gold narrow rigid bracelet with half-open floral decoration, catalog price ¥26,800 and no recorded gemstone. Brand Bible/catalog and customer histories were not changed.

| Stage                | Request model    | Returned model   | HTTP | Status                         |
| -------------------- | ---------------- | ---------------- | ---- | ------------------------------ |
| DeepSeek generation  | `deepseek-flash` | `deepseek-flash` | 200  | `completed`; JSON parsed       |
| DeepSeek audit       | `deepseek-flash` | `deepseek-flash` | 200  | `completed`; JSON parsed       |
| Application response | `deepseek-flash` | `deepseek-flash` | 200  | Three live candidates returned |

Every displayed main paragraph referenced a bracelet/hard bracelet, 18K rose gold, everyday use and understated style. Deterministic output assessment found no hard failures. The audit reported no hard findings, while returning `STYLE_DETAIL`, `STYLE_SIMILARITY` and `STORY_DEPTH` as soft warnings. The messages remained available.

Verified through the actual React component:

- Correct client, scenario, Motif, Line, SKU, occasion and additional context submitted through HTTP.
- Three returned message texts displayed exactly, each retaining the three-paragraph structure.
- “实时 AI · deepseek-flash” displayed.
- Loading state appeared and ended; generate control became enabled again.
- No generation error banner remained for the valid result.
- Candidate copy handler received the exact text.
- Selecting a candidate populated the editor; editing updated its state; final-copy handler received the edited text.
- Edited-message basic review reached the actual backend and returned no errors, without another model call.

Copy verification used an in-memory `navigator.clipboard` shim because JSDOM has no operating-system clipboard. It verifies application copy handlers, not system paste permissions. No screenshot or visual browser verification is claimed.

New immutable evidence directory:

`runtime/deepseek-e2e/2026-11-07T16-22-11-506Z/`

- `report.json`: timestamps, provider/model, prompt/audit hashes, prompt version, input, actual submitted payload, three messages, validation assessment, provider stage results, audit findings, safe diagnostics and frontend interaction checks.
- `records.jsonl`: backend's persisted live generation record with input, messages and version metadata.

These results are separate from demo outputs and all prior baseline/run records. No subjective quality scores were assigned.

## Changes made to finish this continuation

Only new files were added:

- `scripts/verify-deepseek-e2e.mjs`: reproducible actual React/HTTP/provider integration verification, isolated records, safe diagnostics, a zero-generation preflight mode, and a strict budget of one generation/two provider requests.
- This completion report.

No existing application, prompt, UI, data, dependency, test, previous report or evaluation file was modified during this continuation. New run directories were added without overwriting existing records. The production build was regenerated successfully.

## Guardrails and remaining evaluation work

Hard checks remain active for schema fields, candidate count/order, trusted greeting, canonical material/price/SKU, fabricated claims/private facts, selected scope, occasion, relevant context and grounded product stories. Semantic context is still required by the live audit; a lexical synonym mismatch alone is not treated as proof that context was ignored. Minor style/story-depth/CTA-variation issues can be recorded as warnings. Whitespace is normalized without dropping the three required paragraphs. Malformed, failed or rejected live requests never silently switch to demo mode.

The live app integration is verified and can support controlled evaluation. **The existing legacy 50-case CLI is not yet ready to launch unchanged with DeepSeek:** `scripts/evaluate.mjs` still requires `OPENAI_API_KEY`, uses strict legacy quality checks and writes fixed historical output paths. That runner needs a separate provider-aware, append-only iteration path before a DeepSeek batch. Frozen baseline runners/snapshots should retain their original behavior. No batch was started here.

Quality still requires human review. The fresh Detailed candidate included the correct internal SKU `JAS-B01` despite the generation prompt asking to omit SKU identifiers from customer text. That is a remaining presentation defect, not an incorrect product fact; it was preserved in the actual output and was not silently edited away. The model audit's soft-warning explanations are also imperfect and should not be treated as human quality scores. One successful case does not establish all six scenarios' live quality or eliminate correlated generation/audit mistakes.

## Exact startup commands

From the project root:

```sh
cd /Users/perona/Documents/LuxuryOutreach
npm run dev
```

This starts the backend with `.env` loaded and the Vite frontend. Open `http://127.0.0.1:5173`. Both services were already running during this verification; another copy should not be started on the occupied ports.

For a production build instead of the development pair:

```sh
cd /Users/perona/Documents/LuxuryOutreach
npm run build
npm start
```

Open `http://127.0.0.1:3001`; stop the existing backend first if using that same port.

For future explicit verification (the second command makes a paid live generation and must not be run just to read these results):

```sh
node --env-file-if-exists=.env scripts/verify-deepseek-e2e.mjs --preflight
node --env-file-if-exists=.env scripts/verify-deepseek-e2e.mjs
```
