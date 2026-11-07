export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    median: n
      ? n % 2
        ? sorted[(n - 1) / 2]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : null,
    p95: n ? sorted[Math.ceil(0.95 * n) - 1] : null,
    min: n ? sorted[0] : null,
    max: n ? sorted[n - 1] : null,
    p95Method: "nearest-rank; exploratory when n<20",
    adequateTailSample: n >= 20,
  };
}
export function summarizePerformance(records) {
  const good = records.filter((r) => r.succeeded);
  const metrics = [
    "httpTotalMs",
    "pipelineMs",
    "normalizationMs",
    "resolutionMs",
    "contextBuildMs",
    "generationApiMs",
    "auditApiMs",
    "jsonParseMs",
    "schemaMs",
    "validationMs",
  ];
  return {
    attempted: records.filter((r) => r.attempted).length,
    succeeded: good.length,
    failed: records.filter((r) => r.attempted && !r.succeeded).length,
    latency: Object.fromEntries(
      metrics.map((metric) => [
        metric,
        distribution(good.map((record) => record.timings?.[metric])),
      ]),
    ),
    providerCalls: records.reduce((n, r) => n + r.traces.length, 0),
    retries: records.reduce(
      (n, r) => n + (r.result?.recovery?.retryCount || 0),
      0,
    ),
    tokens: records
      .flatMap((r) => r.traces)
      .reduce(
        (s, t) => ({
          input: s.input + (t.usage?.input_tokens || 0),
          cached:
            s.cached + (t.usage?.input_tokens_details?.cached_tokens || 0),
          output: s.output + (t.usage?.output_tokens || 0),
        }),
        { input: 0, cached: 0, output: 0 },
      ),
  };
}
