import { GenerationError } from "./generation-errors.mjs";

const number = (value, fallback, min, max) =>
  Number.isFinite(Number(value)) && value !== undefined && value !== ""
    ? Math.max(min, Math.min(max, Math.floor(Number(value))))
    : fallback;
export function recoveryConfig(env = process.env) {
  return {
    maxProviderCalls: number(env.GENERATION_MAX_PROVIDER_CALLS, 4, 2, 8),
    maxTransientRetries: number(env.GENERATION_MAX_TRANSIENT_RETRIES, 1, 0, 3),
    maxOutputRepairs: number(env.GENERATION_MAX_OUTPUT_REPAIRS, 1, 0, 2),
    timeoutMs: number(env.GENERATION_TIMEOUT_MS, 45000, 1000, 90000),
    outputTokens: number(env.GENERATION_OUTPUT_TOKENS, 2400, 1200, 6000),
    backoffMs: number(env.GENERATION_BACKOFF_MS, 1000, 0, 10000),
    maxBackoffMs: 10000,
    temperature: 0.2,
  };
}
export const transientFailure = (error) =>
  ["API_NETWORK", "API_TIMEOUT", "API_RATE_LIMIT"].includes(error.code) ||
  (error.code === "API_HTTP" && error.providerStatus >= 500);
export const repairableFailure = (error) =>
  [
    "RESPONSE_JSON",
    "OUTPUT_EMPTY",
    "OUTPUT_INCOMPLETE",
    "OUTPUT_SCHEMA",
    "OUTPUT_VALIDATION",
    "AUDIT_VALIDATION",
  ].includes(error.code);

export function recoverySession(
  settings,
  onDiagnostic,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  const state = {
    providerCalls: 0,
    transientRetries: 0,
    outputRepairs: 0,
    failures: [],
  };
  const event = (data) =>
    onDiagnostic({
      ...data,
      retryCount: state.transientRetries + state.outputRepairs,
      repairCount: state.outputRepairs,
      apiCallCount: state.providerCalls,
    });
  const remember = (error) => {
    state.failures.push({
      code: error.code || "GENERATION_FAILED",
      stage: error.stage || "generation",
      ruleIds: error.ruleIds || [],
      candidateIndexes: error.candidateIndexes || [],
    });
    event({
      stage: error.stage || "generation",
      status: "failed",
      reason: error.code,
      ruleIds: error.ruleIds || [],
      ...(error.stage?.endsWith(".parse") ? { parseSuccess: false } : {}),
      ...(error.stage?.endsWith(".schema") ? { schemaSuccess: false } : {}),
    });
  };
  const request = async (callback) => {
    while (true) {
      if (state.providerCalls >= settings.maxProviderCalls)
        throw new GenerationError("RECOVERY_BUDGET", {
          stage: "recovery",
          ruleIds: ["PROVIDER_CALL_BUDGET"],
        });
      state.providerCalls++;
      try {
        return await callback(event);
      } catch (error) {
        remember(error);
        const delay = Math.max(
          settings.backoffMs * 2 ** state.transientRetries,
          error.retryAfterMs || 0,
        );
        if (
          !transientFailure(error) ||
          state.transientRetries >= settings.maxTransientRetries ||
          state.providerCalls >= settings.maxProviderCalls ||
          delay > settings.maxBackoffMs
        )
          throw error;
        state.transientRetries++;
        event({
          stage: "recovery.backoff",
          status: "retrying",
          reason: error.code,
          ruleIds: error.ruleIds || [],
          retryAfterMs: delay,
        });
        await sleep(delay);
      }
    }
  };
  return { state, event, remember, request };
}
