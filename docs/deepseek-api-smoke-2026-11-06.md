# DeepSeek integration and single live smoke test

Run date: 2026-11-06. Outcome: **DeepSeek connectivity verified; end-to-end generation did not pass the existing model audit.** No retry or full evaluation was run.

## Configuration and integration

- The local `.env` was loaded using Node's `--env-file-if-exists=.env`. The key was checked for presence only and was never displayed.
- `DEEPSEEK_API_KEY` is configured; `DEEPSEEK_BASE_URL` is `https://api.deepseek.com`; `DEEPSEEK_MODEL` is `deepseek-flash`.
- `.env` is ignored by `.gitignore:3` and is not tracked by Git. The existing ignore file was not changed during this task.
- The initial backend only read OpenAI environment variables and hardcoded `https://api.openai.com/v1/responses`. DeepSeek configuration would therefore have been ignored and generation would have defaulted to demo mode without an OpenAI key.
- The genuine integration error was fixed by adding server-only provider configuration and passing the configured key, base URL and model to the existing Responses transport. DeepSeek settings select DeepSeek; OpenAI behavior remains available when DeepSeek is not configured. Explicit `DEMO_MODE=true` still selects demo mode.
- DeepSeek supports the Responses API and JSON Schema output, allowing the generation instructions, input payload, output schema and audit instructions to remain unchanged. [Official Responses documentation](https://api-docs.deepseek.com/guides/responses_api/)
- DeepSeek requests disable thinking via `reasoning.effort=none`, preserving the existing 1,800-token budget for the JSON output. OpenAI requests retain their existing configuration.
- Backend metadata now reports the selected provider and model. Credentials are not included in metadata, records or errors. Invalid URLs containing credentials/query strings are rejected without echoing their contents.

A fresh backend instance loaded `.env` for the smoke test. The existing watched backend also reloaded after the source change: a read-only check of `http://127.0.0.1:3001/api/bootstrap` returned HTTP 200, `mode=live`, `provider=deepseek`, `model=deepseek-flash`. That check did not invoke the provider.

## One live generation

Input:

```json
{
  "caseId": "DEEPSEEK-SINGLE-LIVE-SMOKE",
  "clientId": "CL-001",
  "scenario": "recommend",
  "motif": "jasmin",
  "line": "jasmin",
  "sku": "JAS-R01",
  "occasion": "personal"
}
```

The customer is the fictional 林女士 with assigned advisor Sophie. The selected product is the existing Brand Bible/catalog SKU `JAS-R01`. Prompt version remains `advisor-1.3.0`.

Command executed once:

```sh
node --env-file-if-exists=.env scripts/deepseek-smoke.mjs
```

The application's existing pipeline makes one generation call followed by one audit call. These were the only two live provider calls; no retries were made.

| Stage                | Endpoint                             | Sent model       | Returned model   | HTTP | Provider status |
| -------------------- | ------------------------------------ | ---------------- | ---------------- | ---- | --------------- |
| Generation           | `https://api.deepseek.com/responses` | `deepseek-flash` | `deepseek-flash` | 200  | `completed`     |
| Existing model audit | `https://api.deepseek.com/responses` | `deepseek-flash` | `deepseek-flash` | 200  | `completed`     |

The run began at `2026-11-06T20:41:30.431Z`; the audit completed at `2026-11-06T20:41:35.627Z`.

Generation reached the audit stage, which in the existing code occurs only after three assembled candidates pass deterministic validation, including Chinese main text, paragraph structure and style checks. This confirms the three-candidate generation path worked. However, the audit did not pass. The application withheld the candidates and returned HTTP **502** with:

> 候选需要进一步核实，暂未展示。请补充信息或重新生成。

**Final messages returned to the caller: 0.** This is not a successful end-to-end smoke result. It is a verified live DeepSeek response, not a demo fallback. No authentication, network or provider HTTP error was observed in this run. The remaining failure is at the existing audit gate.

The current failure path does not persist the model's detailed audit rationale or rejected candidate texts. Their content was not recovered or fabricated. This run alone cannot establish the specific quality defect, so no quality scores or prompt changes are claimed.

## Evidence and checks

The new run was saved separately under:

`runtime/deepseek-smoke/2026-11-06T20-41-30-387Z/`

- `smoke-report.json`: sanitized request stages, model identifiers, HTTP/provider statuses and application response.
- `records.jsonl`: the existing backend's failed-generation record, including input and version metadata, with no displayed candidates.

In that raw report, `confirmedLive=false` means the complete application result did not succeed in live mode. The two recorded HTTP 200 provider requests independently establish that the real DeepSeek API was reached. `passed=false` accurately records the failed application-level outcome.

Local verification: **115 unit/API/DOM tests passed, 0 failed**, using fixtures/mocked providers for those tests. `git diff --check` passed. No 50-case evaluation command was run. A SHA-256 comparison found all 94 protected pre-task files unchanged, including all 79 frozen evaluation files, every UI source file, prior runtime files, `.env`, `.gitignore`, customer/catalog data and dependency files.

Files added/changed for this task:

- `server/provider-config.mjs` (new): server-only provider selection and endpoint normalization.
- `server/generation.mjs`: configurable Responses endpoint/provider, DeepSeek transport settings and sanitized HTTP status on transport errors.
- `server/index.mjs`: shared provider configuration for bootstrap, generation and records.
- `tests/provider.test.mjs` (new): configuration, routing, credentials, mock live generation/audit and error checks.
- `scripts/deepseek-smoke.mjs` (new): single-generation harness with a maximum of two provider calls and an isolated output directory.
- This report (new).

The UI, generation/audit prompts, frozen evaluation records and existing outputs were preserved. The next quality investigation should capture rejected candidates and audit reasons in a separately authorized run; no further model execution was performed here.
