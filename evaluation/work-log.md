# Evaluation & Iteration work log

Date: November 6, 2026, America/New_York.

1. Inspected the actual React, HTTP API, fixtures, catalog, generation, message-contract, validation and evaluation code. Confirmed the repository had a clean tracked working tree at Git commit `e5856af7bd5dc85541677a8af7aed30e6722953d`.
2. Read configuration through a secret-free allowlist. No API key or `.env` was present. The configured/default live identifier is `gpt-4.1-mini`; effective app mode is demo. Recorded actual installed/locked versions and runtime.
3. Created a separate `evaluation/` area. Copied thirty tracked files into a source snapshot, fingerprinted all files and exact scenario instructions, and captured hashes for eight prior output files. No Git commit/reset, dependency update, production code/prompt edit, prior output overwrite, or build was performed.
4. Prepared eighteen fictional evaluation cases covering six scenarios and five Lines. Added matched occasion cases and within-request style triads. Kept reference handling separate. Froze cases with a separate hash/version file.
5. Implemented an evaluation-only runner that imports the frozen production core, creates unique output directories, records complete contexts/prompts/messages/statuses, and supports validation-only, explicit template smoke, or explicit live mode. It captures actual provider/audit traces when available without saving Authorization headers or keys. It does not change request prompts or generation logic.
6. Validation-only run: eighteen inputs checked; fifteen READY, one NEEDS_REVIEW, two BLOCKED; no generated messages. All eighteen match preserved implementation expectations, while B18 differs from desired business behavior.
7. Demo run: fifteen template generations completed, forty-five actual template messages recorded, zero model calls. Identified unsupported expectation inference in B16. This evidence is labeled template-only; no subjective live score was assigned.
8. Live preflight: exited 2 with `NO_API_KEY`, zero provider calls and zero generation attempts. All message slots remain null and no case is labeled live-executed.
9. Re-ran the unchanged existing suite with isolated local API networking: **79 tests passed, 0 failed**. These are regression/mocked-provider checks, not human language-quality results. Did not run the fixed-name old evaluation scripts, which could overwrite previous outputs.
10. Added pipeline audit, version record, case table, rubric, observed/source-based risks, methodology, fifty-case expansion plan and clear commands. Added a read-only evidence checker; it verified thirty original/snapshot source files and eight prior outputs unchanged, eighteen cases across six scenarios, and correct generation-state evidence in three run directories.

No eight-dimension human scores, model outputs, provider latency/token data, or evaluation success claims were fabricated. Production generation and prompt iteration are explicitly deferred until after a real baseline and review.
