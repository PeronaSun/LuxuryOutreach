const messages = {
  API_AUTH: "模型服务认证失败，请检查服务器 API 密钥与权限。",
  API_BALANCE: "模型服务余额不足，请充值后重试。",
  API_RATE_LIMIT: "模型服务请求过于频繁，请稍后重试。",
  API_HTTP: "模型服务暂时不可用，请稍后重试或检查服务器配置。",
  API_NETWORK: "无法连接模型服务，请检查网络与服务地址。",
  API_TIMEOUT: "模型服务响应超时，请稍后重试。",
  RESPONSE_JSON: "模型服务响应无法解析，请重试。",
  OUTPUT_EMPTY: "模型返回了空内容，请重新生成。",
  OUTPUT_INCOMPLETE:
    "模型回复未完成或被截断，请重试；持续出现时请检查输出长度配置。",
  OUTPUT_REFUSED: "模型未能为此请求生成候选，请修改输入。",
  OUTPUT_SCHEMA: "模型返回格式无效，请重试。",
  OUTPUT_VALIDATION: "候选未通过基础检查，请调整输入后重试。",
  AUDIT_VALIDATION:
    "候选未通过品牌事实与任务核验，暂未展示。请核对产品及沟通背景后重试。",
};

export class GenerationError extends Error {
  constructor(code, { stage, ruleIds = [], httpStatus } = {}) {
    super(messages[code] || "生成暂时失败，请稍后重试。");
    this.code = code;
    this.stage = stage;
    this.ruleIds = ruleIds;
    this.providerStatus = httpStatus;
  }
}

// Only fixed metadata is emitted. No headers, request bodies, client names,
// candidate texts, model-provided reasons or stack traces enter diagnostics.
export function diagnosticEvent(
  event,
  { requestId, provider, model, demo, key },
) {
  const safe = {
    requestId,
    provider,
    model,
    source: demo ? "demo" : "live",
    retryCount: 0,
    stage: event.stage,
    status: event.status,
    ruleIds: event.ruleIds || [],
  };
  for (const field of [
    "httpStatus",
    "apiSuccess",
    "parseSuccess",
    "schemaSuccess",
    "reason",
    "candidateCount",
  ])
    if (event[field] !== undefined) safe[field] = event[field];
  return JSON.parse(
    key
      ? JSON.stringify(safe).replaceAll(key, "[REDACTED]")
      : JSON.stringify(safe),
  );
}

// Validate the small JSON Schema subset used by generation/audit locally too.
export function matchesSchema(value, schema) {
  if (!schema) return true;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    if (schema.required?.some((key) => !Object.hasOwn(value, key)))
      return false;
    return Object.keys(value).every((key) =>
      schema.properties?.[key]
        ? matchesSchema(value[key], schema.properties[key])
        : schema.additionalProperties !== false,
    );
  }
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      value.length >= (schema.minItems ?? 0) &&
      value.length <= (schema.maxItems ?? Infinity) &&
      value.every((item) => matchesSchema(item, schema.items))
    );
  if (schema.type === "integer")
    return (
      Number.isInteger(value) &&
      value >= (schema.minimum ?? -Infinity) &&
      value <= (schema.maximum ?? Infinity)
    );
  return typeof value === schema.type;
}
