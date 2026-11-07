// Server-only configuration. Never include the key in API responses or records.
export function providerConfig(env = process.env) {
  const deepseek = Boolean(
    env.DEEPSEEK_API_KEY || env.DEEPSEEK_BASE_URL || env.DEEPSEEK_MODEL,
  );
  const key = deepseek ? env.DEEPSEEK_API_KEY : env.OPENAI_API_KEY;
  return {
    provider: deepseek ? "deepseek" : "openai",
    key,
    baseUrl: deepseek
      ? env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
      : "https://api.openai.com/v1",
    model: deepseek
      ? env.DEEPSEEK_MODEL || "deepseek-flash"
      : env.OPENAI_MODEL || "gpt-4.1-mini",
    demo: env.DEMO_MODE === "true" || (!key && env.DEMO_MODE !== "false"),
  };
}

export function responsesEndpoint(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    url.pathname = url.pathname.replace(/\/+$/, "") + "/responses";
    return url.toString();
  } catch {
    // Do not echo configuration: an incorrectly entered URL may contain secrets.
    throw new Error("模型服务地址配置无效，请检查服务器配置。");
  }
}
