# Initial baseline evidence report

This is a pipeline/integrity report and template smoke evaluation, **not a live LLM quality evaluation**. Source/prompt baseline is unchanged. Human rubric scores remain pending.

| Run | Cases checked | Template generations | Live generations | API calls | Actual candidate texts | Status |
| --- | --- | --- | --- | --- | --- | --- |
| [validate](runs/2026-11-06T18-16-40-718Z-validate-1bf432cb/run-report.md) | 18 | 0 | 0 | 0 | 0 | VALIDATION_ONLY |
| [demo](runs/2026-11-06T18-18-04-420Z-demo-34a25af4/run-report.md) | 18 | 15 | 0 | 0 | 45 | COMPLETED |
| [live](runs/2026-11-06T18-18-04-555Z-live-373784f2/run-report.md) | 18 | 0 | 0 | 0 | 0 | CONFIGURATION_BLOCKED |

All 18 cases match their **current implementation** status/SKU expectations. This is not an 18/18 quality pass: B18 intentionally records an undesirable input-gate false positive. Input status counts: 15 READY, 1 NEEDS_REVIEW, 2 BLOCKED. Each run has 54 review rows (18 cases × three style slots); ungenerated text is blank/null. Only the demo run has 45 populated message fields.

## Observed findings

1. **B18 — confirmed input false positive.** The concern “请不要承诺折扣，只介绍已知材质与设计。” is blocked by the request regex despite explicitly forbidding a discount promise. Desired behavior is READY; current behavior is preserved as BLOCKED. No model was called.
2. **B16 — confirmed template unsupported inference.** Input states “这枚戒指没有超出我的预算。” The actual demo output says “理解价格高于您的预期，需要仔细衡量，Jasmin Étoilé的戒指：五瓣茉莉开口戒，花心小钻，采用18K玫瑰金，呼应茉莉初绽时的安静自信。” The demo classifier matches the word 预算 and changes it into an above-expectation acknowledgment. Within-budget does not logically imply meeting price expectations; the demonstrated defect is adding an unsupported expectation claim instead of responding to the stated design concern. This is evidence about the template branch; live-model behavior is unknown. The application validator did not flag the contradiction.

These findings are linked to code and follow-up hypotheses in [risks-and-next-steps.md](risks-and-next-steps.md). No production fix was made.

## Regression and integrity verification

The unchanged `npm test` suite was actually rerun: **79 tests passed, 0 failed**. See [regression-check.json](regression-check.json) for the observed summary. The [integrity check](integrity-report.json) verified all 30 original/snapshot files and 8 prior output files unchanged, plus the execution-state evidence in the three new run directories. There are no tracked production changes; only the new evaluation directory is untracked.

## Evidence limitations

No API key is configured; the live run exits 2 with NO_API_KEY before any provider request or generation attempt. It is a configuration preflight result, not failed model prose. Automated checks and existing unit tests cannot establish Chinese fluency or subtle brand quality. The same-model production audit is a release filter, not independent human scoring. No reference answer, human score, latency, token usage, or provider-returned model identifier has been invented. Future live traces will capture available provider metadata and actual audit reasons.
