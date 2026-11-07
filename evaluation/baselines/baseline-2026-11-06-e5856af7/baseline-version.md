# Baseline version record

Captured for the November 6, 2026 audit, before changing any tracked production files.

| Field | Frozen value |
| --- | --- |
| Git HEAD | `e5856af7bd5dc85541677a8af7aed30e6722953d` |
| Commit subject | Initial Maison Liore MVP |
| Tracked working tree | Clean at capture |
| Application package version | 1.0.0 |
| Configured live model | `gpt-4.1-mini` (no provider call yet; actual snapshot identifier unknown) |
| Effective app mode | demo |
| API key configured / .env present | false / false |
| Prompt version | advisor-1.2.0 |
| Brand Bible version | 1.0 · 2026-11 |
| Message format | three-paragraph-v1 |
| Demo model label | demo-template-v1.2 |
| Source SHA-256 | `5cd61fb492464eba5cdce9b78dfc457b2a5bf035f3512e0b644320b7696a01a3` |
| Runtime | Node v24.16.0; npm 11.13.0; darwin/arm64 |

API configuration: Responses endpoint, strict JSON schema, store:false, 1,800 maximum output tokens **per call**, 45-second timeout per call, up to one generation call plus one same-model audit call. No temperature or seed is sent; no retry is implemented. API keys and private environment file contents are excluded. The configured model identifier may be an alias, so a frozen source/prompt does not guarantee bit-identical future model output.

## Exact dependency versions

| Dependency | Declared | Locked | Installed |
| --- | --- | --- | --- |
| lucide-react | ^0.468.0 | 0.468.0 | 0.468.0 |
| react | ^19.0.0 | 19.3.1 | 19.3.1 |
| react-dom | ^19.0.0 | 19.3.1 | 19.3.1 |
| jsdom | ^30.1.3 | 30.1.3 | 30.1.3 |
| prettier | ^3.9.10 | 3.9.10 | 3.9.10 |
| vite | ^6.0.0 | 6.4.5 | 6.4.5 |

The generation core uses Node built-ins and fetch, not an OpenAI SDK. UI/test dependencies are recorded for application reproducibility. Full source bytes, including package-lock.json and the canonical DOCX/text, are retained under snapshot/. Each file hash and the protected pre-existing output hashes are in [baseline-version.json](baseline-version.json).

## Exact scenario instruction fingerprints

These hashes cover the fully constructed instruction string (including the full Brand Bible), not a paraphrase of the prompt. Scenario changes change the instruction string. Per-case serialized input hashes are retained in each run.

| Scenario | SHA-256 |
| --- | --- |
| greeting | `26c567e56e6388cc744729ba018cc8cb7b2cdcb8489d9dab1ada516806ce0a10` |
| recommend | `3cb495ceaa8326e36b9819f62bf156e2333aff8682717abc2bdd09640124bc10` |
| care | `13fca2607c51aa490b1cf698b6fbc57520e57419d18f8939c676554008a6ef13` |
| reactivate | `eda729ed25500695b142f150c82b175afeecbcbdab4bf0de6bf77583391dfdfd` |
| event | `5b6eb8d79ef0237e96fc159cbe32c396a081bb70ba4ad0282713c74fb3845a63` |
| price | `d5893ce858406c75e8d1aceab3960dc0a2dabb4e7f139190f7c6bab74e6dcf4a` |

The audit prompt is inline in server/generation.mjs and is covered by that module's frozen hash. Future live runs retain the actual generation/audit request bodies and provider responses, without Authorization headers. The runner version is hashed in every run-start.json; the evaluated tools are archived under tooling/.

Existing runtime, dist, and docs/evaluation files are protected by hashes and were not overwritten. This baseline is a copy; no Git commit, reset, prompt edit, or dependency update was made.
