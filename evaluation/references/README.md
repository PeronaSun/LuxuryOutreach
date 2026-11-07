# Reference material is separate from evaluation cases

No gold-standard candidate messages have been authored for the new 18-case set. Its definitions contain inputs, facts to check, comparison groups and review expectations only.

- The frozen Brand Bible and catalog are **grounding facts**, which the production system legitimately receives. They are not held-out answer examples.
- The application's existing `demoCandidates()` strings are deterministic **implementation fixtures**, preserved in the source snapshot. They are not reference-quality answers or actual LLM outputs.
- Actual template outputs are stored only in explicitly labeled demo run artifacts. They may illustrate workflow defects, but are not fed back into the live evaluation prompts as few-shot answers.
- User-provided message/CTA examples informed prior implementation instructions; this evaluation phase adds no new examples to production prompts.
- If human reference answers are later created, put them under this separate directory with author, date, source evidence and intended use. Do not edit the frozen case input or silently expose an answer to a held-out generation run.
