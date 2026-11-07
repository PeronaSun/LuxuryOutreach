// Independent scoring is opt-in configuration; a production factual audit is
// mandatory regardless of this offline quality-judge policy.
export function judgePolicy(
  config,
  env = process.env,
  independentOnly = false,
) {
  const configured = env.DEEPSEEK_JUDGE_MODEL;
  const model = configured || (!independentOnly ? config.model : null);
  const independent = Boolean(model && model !== config.model);
  const enabled = Boolean(model && (!independentOnly || independent));
  return {
    enabled,
    model: enabled ? model : null,
    provider: enabled ? config.provider : null,
    independent,
    status: enabled ? "CONFIGURED" : "PENDING_INDEPENDENT_JUDGE_NOT_CONFIGURED",
    method: enabled
      ? independent
        ? "independent-model-offline-rubric"
        : "same-model-offline-rubric"
      : "pending-independent-judge",
  };
}
