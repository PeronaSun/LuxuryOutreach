import http from "node:http";
import { readFile, mkdir, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  products,
  motifs,
  lines,
  scenarios,
  occasions,
  BRAND_VERSION,
} from "../data/catalog.mjs";
import { clients, events, clientProfile } from "../data/clients.mjs";
import { evaluateRequest, PROMPT_VERSION } from "./rules.mjs";
import { generate } from "./generation.mjs";
import { applicationCalendar } from "./application-calendar.mjs";
import { providerConfig } from "./provider-config.mjs";
import { GenerationError, diagnosticEvent } from "./generation-errors.mjs";
import {
  messagePlan,
  MESSAGE_FORMAT_VERSION,
  DEMO_MODEL,
} from "./message-contract.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
export function createApp({
  recordDir = resolve(root, "runtime"),
  generator = generate,
  env = process.env,
  clock = () => new Date(),
  diagnosticLogger = (event) => console.info(JSON.stringify(event)),
} = {}) {
  const provider = providerConfig(env);
  let busy = false;
  const send = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const save = async (record) => {
    await mkdir(recordDir, { recursive: true });
    await appendFile(
      resolve(recordDir, "records.jsonl"),
      JSON.stringify(record) + "\n",
    );
  };
  return http.createServer(async (req, res) => {
    try {
      // Local-only app. Reject cross-origin writes and DNS-rebinding hostnames.
      if (
        !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
          req.headers.host || "",
        )
      )
        return send(res, 403, { error: "仅支持本地访问。" });
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        if (
          req.headers.origin &&
          !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)
        )
          return send(res, 403, { error: "请求来源无效。" });
        if (req.method === "GET" && url.pathname === "/api/bootstrap")
          return send(res, 200, {
            products,
            motifs,
            lines,
            scenarios,
            occasions,
            clients: clients.map((c) => ({
              ...clientProfile(c),
              initial: c.initial,
              note: c.note,
            })),
            events,
            brandVersion: BRAND_VERSION,
            calendar: applicationCalendar(clock()),
            mode: provider.demo ? "demo" : "live",
            provider: provider.provider,
            model: provider.model,
          });
        if (req.method === "GET" && url.pathname === "/api/records") {
          let records = [];
          try {
            records = (
              await readFile(resolve(recordDir, "records.jsonl"), "utf8")
            )
              .trim()
              .split("\n")
              .filter(Boolean)
              .map(JSON.parse);
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
          return send(res, 200, { records });
        }
        if (
          req.method === "POST" &&
          ["/api/validate", "/api/generate", "/api/review"].includes(
            url.pathname,
          )
        ) {
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return send(res, 415, { error: "请使用 JSON 请求。" });
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 16000)
              return send(res, 413, { error: "输入内容过长。" });
          }
          let input;
          try {
            input = JSON.parse(body);
          } catch {
            return send(res, 400, { error: "请求格式无效。" });
          }
          if (!input || typeof input !== "object" || Array.isArray(input))
            return send(res, 400, { error: "请求格式无效。" });
          // Strictly pick supported fields. No client profile, purchase facts, catalog or event overrides.
          const fields = [
            "clientId",
            "scenario",
            "motif",
            "line",
            "sku",
            "occasion",
            "purchaseId",
            "eventId",
            "notes",
            "concern",
            "reconnectReason",
            "greetingKind",
            "greetingName",
          ];
          const task = Object.fromEntries(
            fields
              .filter((f) => Object.hasOwn(input, f))
              .map((f) => [f, input[f]]),
          );
          const context = evaluateRequest(task, { now: clock() });
          const validation = {
            status: context.status,
            issues: context.issues,
            notices: context.notices || [],
            resolvedProduct: context.resolved?.product || null,
            reason: context.resolved?.reason || "",
            calendar: context.calendar || null,
          };
          if (url.pathname === "/api/validate")
            return send(res, 200, validation);
          if (url.pathname === "/api/review") {
            if (context.status !== "READY") return send(res, 422, validation);
            const { validateMessage } = await import("./rules.mjs");
            if (typeof input.text !== "string" || input.text.length > 600)
              return send(res, 400, { error: "消息内容无效。" });
            // Editing gets a limited deterministic check only, clearly labeled in the UI.
            const errors = validateMessage(
              input.text,
              { ...context, input: task },
              { enforceCta: false },
            );
            return send(res, 200, {
              errors,
              label: errors.length
                ? "基础检查发现问题"
                : "基础检查未发现问题；仍需顾问核实事实与语气",
            });
          }
          if (busy)
            return send(res, 429, { error: "已有请求正在处理，请稍后重试。" });
          busy = true;
          const record = {
            id: randomUUID(),
            caseId:
              typeof input.caseId === "string"
                ? input.caseId.slice(0, 100)
                : null,
            createdAt: new Date().toISOString(),
            input: task,
            clientId: task.clientId,
            scenario: task.scenario,
            clientContext: context.client || null,
            conversationHistory: context.client?.history || [],
            eventContext: context.event || null,
            selectedPurchase: context.purchase || null,
            applicationCalendar: context.calendar || null,
            communicationContext: context.communicationContext || null,
            resolvedProductSku: context.resolved?.product?.sku || null,
            resolutionReason: context.resolved?.reason || null,
            brandBibleVersion: BRAND_VERSION,
            promptVersion: PROMPT_VERSION,
            messageFormatVersion: MESSAGE_FORMAT_VERSION,
            messagePlan:
              context.client?.assignedAdvisor && context.resolved
                ? messagePlan(task, context)
                : null,
            validationStatus: context.status,
            candidates: [],
            provider: provider.provider,
            model: provider.demo ? DEMO_MODEL : provider.model,
          };
          const diagnostics = [];
          const diagnosticsEnabled =
            env.GENERATION_DIAGNOSTICS === "true" ||
            env.NODE_ENV === "development";
          const onDiagnostic = (event) => {
            const safe = diagnosticEvent(event, {
              ...provider,
              requestId: record.id,
            });
            if (diagnosticsEnabled) {
              diagnostics.push(safe);
              diagnosticLogger(safe);
            }
          };
          onDiagnostic({
            stage: "request.validation",
            status: context.status === "READY" ? "passed" : "failed",
            ruleIds: context.issues.map((issue) => issue.code),
            reason: context.status,
          });
          try {
            if (context.status !== "READY") {
              await save({ ...record, issues: context.issues });
              return send(res, 422, validation);
            }
            let result;
            try {
              result = await generator(task, context, {
                ...provider,
                onDiagnostic,
              });
            } catch (e) {
              const known = e instanceof GenerationError;
              onDiagnostic({
                stage: known ? e.stage : "generation",
                status: "failed",
                ruleIds: known ? e.ruleIds : ["GENERATION_FAILED"],
                reason: known ? e.code : "GENERATION_FAILED",
                ...(e.stage?.endsWith(".parse") ? { parseSuccess: false } : {}),
                ...(e.stage?.endsWith(".schema")
                  ? { schemaSuccess: false }
                  : {}),
              });
              await save({
                ...record,
                validationStatus: "NEEDS_REVIEW",
                error: "GENERATION_FAILED",
                failureStage: known ? e.stage : "generation",
                failedRuleIds: known ? e.ruleIds : ["GENERATION_FAILED"],
                ...(diagnosticsEnabled ? { diagnostics } : {}),
              });
              const safeMessages = [
                "实时模式尚未配置服务器 API 密钥。",
                "示例模式暂不能可靠理解这段背景；请简化为明确需求或启用实时 AI。",
                "模型服务暂时不可用，请稍后重试或检查服务器配置。",
                "模型服务地址配置无效，请检查服务器配置。",
                "模型未完成生成，请重试。",
                "模型未能为此请求生成候选，请修改输入。",
                "模型返回格式无效，请重试。",
                "候选未通过基础检查，请调整输入后重试。",
                "候选需要进一步核实，暂未展示。请补充信息或重新生成。",
              ];
              return send(res, 502, {
                error:
                  known || safeMessages.includes(e.message)
                    ? e.message
                    : "生成暂时失败，请稍后重试。",
                code: known ? e.code : "GENERATION_FAILED",
                stage: known ? e.stage : "generation",
                requestId: record.id,
              });
            }
            onDiagnostic({
              stage: "generation.complete",
              status: "passed",
              candidateCount: result.candidates.length,
              ruleIds: result.warnings?.map((warning) => warning.ruleId) || [],
            });
            const complete = {
              ...record,
              ...result,
              ...(diagnosticsEnabled ? { diagnostics } : {}),
            };
            await save(complete);
            return send(res, 200, {
              ...result,
              recordId: record.id,
              ...validation,
            });
          } finally {
            busy = false;
          }
        }
        return send(res, 404, { error: "接口不存在。" });
      }
      if (req.method !== "GET")
        return send(res, 405, { error: "请求方法无效。" });
      const mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
      };
      const dist = resolve(root, "dist");
      let file = resolve(dist, "." + decodeURIComponent(url.pathname));
      if (file !== dist && !file.startsWith(dist + "/"))
        return send(res, 403, { error: "路径无效。" });
      if (!extname(file)) file = resolve(dist, "index.html");
      try {
        const content = await readFile(file);
        res.writeHead(200, {
          "Content-Type": mime[extname(file)] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        });
        res.end(content);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        send(res, 404, {
          error: "请先运行 npm run build，或使用 npm run dev。",
        });
      }
    } catch {
      send(res, 500, { error: "服务暂时不可用，请稍后重试。" });
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT) || 3001;
  createApp().listen(port, "127.0.0.1", () =>
    console.log(`Maison Lioré server: http://127.0.0.1:${port}`),
  );
}
