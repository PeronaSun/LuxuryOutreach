export function reliabilityMetrics(records) {
  const attempted = records.filter((record) => record.attempted);
  const count = (predicate) => attempted.filter(predicate).length;
  const rate = (numerator, denominator) => ({
    numerator,
    denominator,
    rate: denominator ? numerator / denominator : null,
  });
  const failures = (record) => record.recovery?.failures || [];
  const retries = attempted.filter((record) => record.recovery?.retryCount > 0);
  const breakdown = (key) =>
    Object.fromEntries(
      [...new Set(attempted.map((record) => record[key] ?? "none"))].map(
        (value) => {
          const group = attempted.filter(
            (record) => (record[key] ?? "none") === value,
          );
          return [
            value,
            {
              attempted: group.length,
              succeeded: group.filter((record) => record.succeeded).length,
              failed: group.filter((record) => !record.succeeded).length,
            },
          ];
        },
      ),
    );
  return {
    cases: records.length,
    attempted: attempted.length,
    successfulGenerationRate: rate(
      count((record) => record.succeeded),
      attempted.length,
    ),
    parsingFailureRate: rate(
      count((record) =>
        failures(record).some((failure) => failure.stage?.endsWith(".parse")),
      ),
      attempted.length,
    ),
    schemaFailureRate: rate(
      count((record) =>
        failures(record).some(
          (failure) =>
            failure.stage?.endsWith(".schema") || failure.stage === "assembly",
        ),
      ),
      attempted.length,
    ),
    factualAuditFailureRate: rate(
      count((record) =>
        failures(record).some(
          (failure) =>
            failure.code === "AUDIT_VALIDATION" &&
            failure.ruleIds.some((rule) =>
              /^(FACT_|PROHIBITED|WRONG_SCOPE|STORY_UNGROUNDED)/.test(rule),
            ),
        ),
      ),
      attempted.length,
    ),
    factualValidationFailureRate: rate(
      count((record) =>
        failures(record).some((failure) =>
          failure.ruleIds?.some((rule) =>
            /^(FACT_|WRONG_|PROHIBITED_CLAIM)/.test(rule),
          ),
        ),
      ),
      attempted.length,
    ),
    retryRecoveryRate: rate(
      retries.filter((record) => record.succeeded).length,
      retries.length,
    ),
    actualProviderCalls: attempted.reduce(
      (sum, record) => sum + (record.actualProviderCalls || 0),
      0,
    ),
    mockedProviderCalls: attempted.reduce(
      (sum, record) => sum + (record.mockedProviderCalls || 0),
      0,
    ),
    byScenario: breakdown("scenario"),
    bySku: breakdown("resolvedSku"),
    bySelectionDepth: breakdown("selectionDepth"),
  };
}
