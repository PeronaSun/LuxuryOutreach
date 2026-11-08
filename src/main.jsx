import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  Flower2,
  Gem,
  Gift,
  Heart,
  Info,
  Leaf,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  CalendarDays,
  PenLine,
  CheckCheck,
  ArrowLeft,
} from "lucide-react";
import { selectMotif, selectLine, selectProduct } from "./selection.mjs";
import ClientProfile from "./ClientProfile.jsx";
import { resolvePurchaseDisplay } from "./product-display.mjs";
import "./styles.css";
const scenarioIcons = [
  Gift,
  Gem,
  Heart,
  RefreshCw,
  CalendarDays,
  MessageSquare,
];
const styleLabels = [
  ["更简洁", "Concise"],
  ["更丰富", "Detailed"],
  ["更优雅", "Elegant"],
];
const blank = {
  clientId: "CL-001",
  scenario: "recommend",
  motif: "jasmin",
  line: null,
  sku: null,
  occasion: null,
  notes: "",
  concern: "",
  reconnectReason: "",
  purchaseId: null,
  eventId: null,
  greetingKind: "birthday",
  greetingName: "",
};
const cash = (n) => "¥" + n.toLocaleString("zh-CN");
async function api(path, body, signal) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(
      data.error ||
        data.issues?.map((i) => i.message).join(" ") ||
        "服务暂时不可用",
    );
    e.data = data;
    throw e;
  }
  return data;
}
function Choice({ active, children, className = "", ...props }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      className={`choice ${active ? "active" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
function SectionHeading({ number, title, caption, optional }) {
  return (
    <div className="section-heading">
      <div className="section-title">
        <span className="section-number">{number}</span>
        <h2>{title}</h2>
        {optional && <span className="optional">可选</span>}
      </div>
      {caption && <span className="section-caption">{caption}</span>}
    </div>
  );
}
function MotifArt({ motif, small = false }) {
  return (
    <div
      className={`motif-art ${motif} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {motif === "jasmin" ? (
        <Flower2 />
      ) : motif === "muguet" ? (
        <svg viewBox="0 0 80 80">
          <path d="M39 69c2-18 8-37 3-56M42 25C26 16 18 30 23 39c7 5 15 2 18-5M44 41c14-11 24 2 19 12-6 5-14 1-17-5M38 48c-14-9-21 1-16 10 5 4 10 1 14-3M36 68c-7-17-18-19-24-19 4 14 11 20 24 19" />
        </svg>
      ) : (
        <Leaf />
      )}
    </div>
  );
}
function JewelryArt({ p }) {
  return (
    <svg
      className={
        "jewel-art " +
        (p.material === "18K玫瑰金"
          ? "rose"
          : p.material === "18K黄金"
            ? "yellow"
            : "white")
      }
      viewBox="0 0 140 100"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={"metal" + p.sku} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="currentColor" />
          <stop offset=".5" stopColor="#fffdf7" />
          <stop offset="1" stopColor="currentColor" />
        </linearGradient>
      </defs>
      {p.category === "戒指" ? (
        <>
          <ellipse
            cx="70"
            cy="61"
            rx="27"
            ry="25"
            fill="none"
            stroke={"url(#metal" + p.sku + ")"}
            strokeWidth="4"
          />
          <path d="M47 45l8-10m30 0 8 10" />
        </>
      ) : p.category === "手镯" ? (
        <ellipse
          cx="70"
          cy="55"
          rx="47"
          ry="27"
          fill="none"
          stroke={"url(#metal" + p.sku + ")"}
          strokeWidth="3"
        />
      ) : (
        <path
          d="M24 4c-1 42 17 56 46 60 29-4 47-18 46-60"
          fill="none"
          stroke={"url(#metal" + p.sku + ")"}
          strokeWidth="2"
        />
      )}
      {p.motif === "jasmin" ? (
        <g transform={`translate(70 ${p.category === "项链" ? 70 : 32})`}>
          <path
            d="M0-2C-20-25-28-1-8 4-31 12-12 30 0 10c12 20 31 2 8-6 20-5 12-29-8-6Z"
            fill="#f6eee1"
          />
          <circle r="4" fill="#fff" />
        </g>
      ) : p.line === "aqua" ? (
        <g>
          <ellipse
            cx="70"
            cy={p.category === "项链" ? 72 : 30}
            rx="11"
            ry="15"
            fill="#c4dfe0"
            strokeWidth="2"
          />
          <path d="m60 27 10-12 10 12-10 17Z" fill="none" opacity=".5" />
        </g>
      ) : (
        <g transform={`translate(70 ${p.category === "项链" ? 70 : 32})`}>
          <path
            d="M0 13C-25 4-19-17 0-11 19-17 25 4 0 13Z"
            fill={p.line === "vive" ? "#b5b69a" : "#f8f6ee"}
          />
          <path d="M0-10V12" />
        </g>
      )}
    </svg>
  );
}
function App() {
  const [data, setData] = useState(null),
    [bootError, setBootError] = useState(""),
    [task, setTask] = useState(blank),
    [more, setMore] = useState(false),
    [validation, setValidation] = useState(null),
    [validating, setValidating] = useState(false),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null),
    [edited, setEdited] = useState(""),
    [editReview, setEditReview] = useState(null),
    [toast, setToast] = useState(""),
    [view, setView] = useState("workspace"),
    [records, setRecords] = useState([]),
    [recordError, setRecordError] = useState(""),
    [calendarEpoch, setCalendarEpoch] = useState(0);
  const revision = useRef(0),
    latest = useRef(task),
    validationRevision = useRef(0),
    generationInFlight = useRef(false);
  latest.current = task;
  const notify = (message) => setToast(message);
  useEffect(() => {
    api("bootstrap")
      .then(setData)
      .catch(() => setBootError("无法连接本地服务，请确认服务器正在运行。"));
  }, []);
  useEffect(() => {
    const refresh = () => setCalendarEpoch((value) => value + 1);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    const checkRevision = ++validationRevision.current;
    setValidating(true);
    setValidation(null);
    const timer = setTimeout(() => {
      api("validate", task, controller.signal)
        .then((value) => {
          if (
            !controller.signal.aborted &&
            checkRevision === validationRevision.current &&
            latest.current === task
          )
            setValidation(value);
        })
        .catch((e) => {
          if (
            !controller.signal.aborted &&
            checkRevision === validationRevision.current &&
            e.name !== "AbortError"
          )
            setError("输入检查暂时不可用，请重试。");
        })
        .finally(() => {
          if (!controller.signal.aborted) setValidating(false);
        });
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [task, data, calendarEpoch]);
  const change = (updater) => {
    revision.current++;
    setTask((t) =>
      typeof updater === "function" ? updater(t) : { ...t, ...updater },
    );
    setResult(null);
    setSelected(null);
    setEdited("");
    setEditReview(null);
    setError("");
  };
  const loadRecords = async () => {
    try {
      const r = await api("records");
      setRecords(r.records.reverse());
      setRecordError("");
    } catch {
      setRecordError("读取记录失败，请重试。");
    }
  };
  useEffect(() => {
    if (view === "records") loadRecords();
  }, [view]);
  async function generate() {
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    setSelected(null);
    const rev = revision.current;
    try {
      const r = await api("generate", task);
      if (rev === revision.current) {
        setResult(r);
        setValidation(r);
      }
    } catch (e) {
      if (rev === revision.current) {
        setError(e.message);
        if (e.data?.status) setValidation(e.data);
      }
    } finally {
      generationInFlight.current = false;
      setBusy(false);
    }
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify("消息已复制，请核实后发送");
    } catch {
      notify("复制失败，请选中文字手动复制");
    }
  }
  function selectCandidate(i) {
    setSelected(i);
    setEdited(result.candidates[i].text);
    setEditReview(null);
  }
  async function reviewEdit() {
    setEditReview("正在检查…");
    try {
      const r = await api("review", { ...task, text: edited });
      setEditReview(r.errors.length ? r.errors.join(" ") : r.label);
    } catch (e) {
      setEditReview(e.message);
    }
  }
  async function exportRecords() {
    try {
      const { records } = await api("records");
      if (!records.length) {
        notify("暂无生成记录");
        return;
      }
      const blob = new Blob(
        [
          JSON.stringify(
            { exportedAt: new Date().toISOString(), records },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "maison-liore-generation-records.json";
      a.click();
      URL.revokeObjectURL(url);
      notify("记录已导出");
    } catch {
      notify("导出失败，请重试");
    }
  }
  if (bootError)
    return (
      <div className="boot">
        <Flower2 />
        <h1>Maison Lioré</h1>
        <p role="alert">{bootError}</p>
        <button onClick={() => location.reload()}>重新连接</button>
      </div>
    );
  if (!data)
    return (
      <div className="boot">
        <Flower2 />
        <h1>Maison Lioré</h1>
        <LoaderCircle className="spin" />
        <p>正在准备您的顾问工作台</p>
      </div>
    );
  const client = data.clients.find((c) => c.id === task.clientId),
    product = validation?.resolvedProduct;
  const hasJewelry = ["recommend", "reactivate", "event", "price"].includes(
    task.scenario,
  );
  const currentScenario = data.scenarios.find((s) => s.id === task.scenario);
  return (
    <>
      <header className="topbar">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("workspace");
          }}
        >
          <Flower2 />
          <span>
            MAISON LIORÉ<small>CLIENT ADVISOR ATELIER</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <button
            className={view === "workspace" ? "nav-active" : ""}
            onClick={() => setView("workspace")}
          >
            顾问工作台<span>Workspace</span>
          </button>
          <button
            className={view === "records" ? "nav-active" : ""}
            onClick={() => setView("records")}
          >
            生成记录<span>Journal</span>
          </button>
        </nav>
        <div className="advisor">
          <span className="status-dot" />
          <span>私人顾问工作空间</span>
          <div className="avatar">CA</div>
        </div>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <div className="eyebrow">THE ART OF THOUGHTFUL CONNECTION</div>
            <h1>
              {view === "workspace"
                ? "让每一次问候，恰如其分。"
                : "每一次用心，都有迹可循。"}
            </h1>
            <p>
              {view === "workspace"
                ? "从一份了解开始，为客户写下一段有温度的微信。"
                : "回顾生成依据与版本，导出可复现的评估记录。"}
            </p>
          </div>
          <div className="intro-aside">
            <span className="brand-motto">A quiet moment, kept forever.</span>
            <span className={`mode ${data.mode === "demo" ? "demo" : ""}`}>
              <span className="status-dot" />
              {data.mode === "demo"
                ? "示例模式 · 非 AI 生成"
                : "实时 AI · " + data.model}
            </span>
          </div>
        </div>
        {view === "records" ? (
          <section className="journal">
            <div className="journal-head">
              <div>
                <div className="eyebrow">GENERATION JOURNAL</div>
                <h2>
                  生成记录 <span>{records.length}</span>
                </h2>
              </div>
              <div className="row">
                <button className="text-button" onClick={loadRecords}>
                  <RefreshCw size={15} />
                  刷新
                </button>
                <button className="outline-button" onClick={exportRecords}>
                  <Download size={15} />
                  导出 JSON
                </button>
              </div>
            </div>
            {recordError && <p role="alert">{recordError}</p>}
            {!records.length ? (
              <div className="journal-empty">
                <PenLine />
                <p>尚无生成记录</p>
                <button
                  className="text-button"
                  onClick={() => setView("workspace")}
                >
                  返回工作台 <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <div className="record-list">
                {records.map((r) => (
                  <article key={r.id}>
                    <div>
                      <span className="record-date">
                        {new Date(r.createdAt).toLocaleString("zh-CN")}
                      </span>
                      <h3>
                        {data.clients.find((c) => c.id === r.clientId)?.name} ·{" "}
                        {data.scenarios.find((s) => s.id === r.scenario)?.zh}
                      </h3>
                      <p>
                        {r.resolvedProductSku || "无需产品"} ·{" "}
                        {r.model || "未生成"} · Prompt {r.promptVersion}
                      </p>
                    </div>
                    <span
                      className={
                        "record-state " + r.validationStatus.toLowerCase()
                      }
                    >
                      {r.validationStatus}
                    </span>
                    <div className="record-messages">
                      {r.candidates.map((c, i) => (
                        <p key={c.style}>
                          <b>{styleLabels[i][0]}</b>
                          {c.text}
                        </p>
                      ))}
                      {!r.candidates.length && (
                        <p>
                          {r.error
                            ? "生成未完成"
                            : r.promptVersion === "advisor-1.0.0"
                              ? "早期版本的未完成记录"
                              : r.issues?.map((i) => i.message).join(" ")}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="workspace">
            <section className="input-panel" aria-label="客户顾问输入">
              <div className="panel-top">
                <div>
                  <span className="tiny-eyebrow">YOUR INTENTION</span>
                  <h2>构思这一次沟通</h2>
                </div>
                <span className="panel-index">01 / INPUT</span>
              </div>
              <div className="form-section client-section">
                <SectionHeading
                  number="01"
                  title="选择客户"
                  caption="虚构客户资料"
                />
                <div className="client-choices" role="group" aria-label="客户">
                  {data.clients
                    .slice(0, more ? data.clients.length : 3)
                    .map((c) => (
                      <Choice
                        key={c.id}
                        active={task.clientId === c.id}
                        className="client-choice"
                        onClick={() => change({ ...blank, clientId: c.id })}
                      >
                        <span className="client-avatar">{c.initial}</span>
                        <span>{c.name}</span>
                        {task.clientId === c.id && <Check size={13} />}
                      </Choice>
                    ))}
                  <button
                    className="more-clients"
                    aria-expanded={more}
                    onClick={() => setMore(!more)}
                  >
                    {more ? "收起客户" : "更多客户"}
                    <ChevronRight size={13} className={more ? "rotate" : ""} />
                  </button>
                </div>
              </div>
              <div className="form-section">
                <SectionHeading
                  number="02"
                  title="沟通场景"
                  caption="选择这次联系的目的"
                />
                <div
                  className="scenario-grid"
                  role="group"
                  aria-label="沟通场景"
                >
                  {data.scenarios.map((s, i) => {
                    const Icon = scenarioIcons[i];
                    return (
                      <Choice
                        key={s.id}
                        active={task.scenario === s.id}
                        className="scenario-choice"
                        onClick={() =>
                          change((t) => ({
                            ...blank,
                            clientId: t.clientId,
                            scenario: s.id,
                            motif: s.id === "recommend" ? "jasmin" : null,
                          }))
                        }
                      >
                        <Icon size={17} />
                        <span>{s.zh}</span>
                        {task.scenario === s.id && (
                          <span className="choice-dot" />
                        )}
                      </Choice>
                    );
                  })}
                </div>
              </div>
              {task.scenario === "greeting" && (
                <div className="form-section">
                  <SectionHeading number="03" title="一份真诚的祝福" />
                  <div className="chips" role="group" aria-label="问候类型">
                    <Choice
                      active={task.greetingKind === "birthday"}
                      onClick={() => change({ greetingKind: "birthday" })}
                    >
                      生日月祝福
                    </Choice>
                    <Choice
                      active={task.greetingKind === "festival"}
                      onClick={() => change({ greetingKind: "festival" })}
                    >
                      节日问候
                    </Choice>
                  </div>
                  {task.greetingKind === "birthday" ? (
                    <p className="field-hint">
                      按右侧客户资料中的生日月，构思一份从容的祝福。
                    </p>
                  ) : (
                    <>
                      <div className="sub-label">
                        选择一个节日，或写下简短背景
                      </div>
                      <div className="chips" role="group" aria-label="节日">
                        {["圣诞节", "春节", "元旦", "中秋节"].map((name) => (
                          <Choice
                            key={name}
                            active={task.greetingName === name}
                            onClick={() =>
                              change({
                                greetingName:
                                  task.greetingName === name ? "" : name,
                              })
                            }
                          >
                            {name}
                          </Choice>
                        ))}
                      </div>
                      <label className="field">
                        节日名称
                        <input
                          value={task.greetingName}
                          onChange={(e) =>
                            change({ greetingName: e.target.value })
                          }
                          placeholder="例如：中秋节"
                          maxLength={100}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
              {task.scenario === "care" && (
                <div className="form-section">
                  <SectionHeading
                    number="03"
                    title="这次关心哪一件作品？"
                    caption="选择一条历史购买"
                  />
                  <div
                    className="purchase-choices"
                    role="group"
                    aria-label="关怀购买记录"
                  >
                    {client.purchases.map((p) => (
                      <Choice
                        key={p.id}
                        active={task.purchaseId === p.id}
                        className="purchase-card"
                        onClick={() =>
                          change({
                            purchaseId: task.purchaseId === p.id ? null : p.id,
                          })
                        }
                      >
                        <CheckCheck size={20} />
                        <span>
                          <strong>
                            {resolvePurchaseDisplay(p, data).label}
                          </strong>
                          <small>
                            {p.sku} · {p.purchaseDate}
                          </small>
                          <small>
                            {cash(p.purchasePrice)}
                            {p.occasion
                              ? ` · ${data.occasions.find((o) => o.id === p.occasion)?.zh}`
                              : ""}
                          </small>
                        </span>
                        {task.purchaseId === p.id && <Check size={16} />}
                      </Choice>
                    ))}
                  </div>
                  {!client.purchases.length && (
                    <p className="field-hint">
                      暂无历史购买记录。请先补充真实的演示记录。
                    </p>
                  )}
                </div>
              )}
              {task.scenario === "reactivate" && (
                <div className="form-section">
                  <label className="field">
                    重新联系的原因（可选）
                    <textarea
                      value={task.reconnectReason}
                      onChange={(e) =>
                        change({ reconnectReason: e.target.value })
                      }
                      placeholder="请记录真实、恰当的联系原因"
                      maxLength={500}
                    />
                  </label>
                </div>
              )}
              {task.scenario === "event" && (
                <div className="form-section">
                  <SectionHeading number="03" title="选择一场相聚" />
                  {data.events.map((e) => (
                    <Choice
                      key={e.id}
                      active={task.eventId === e.id}

                      className="event-card"
                      onClick={() =>
                        change({ eventId: task.eventId === e.id ? null : e.id })
                      }
                    >
                      <CalendarDays size={20} />
                      <span>
                        <strong>{e.name}</strong>
                        <small>
                          {e.date}
                          <br />
                          {e.location}
                          <br />
                          {e.registration} · 全部为虚构演示信息
                        </small>
                      </span>
                      {task.eventId === e.id && <Check size={16} />}
                    </Choice>
                  ))}
                </div>
              )}
              {hasJewelry && (
                <div className="form-section jewelry-section">
                  <SectionHeading
                    number={
                      ["reactivate", "event"].includes(task.scenario)
                        ? "04"
                        : "03"
                    }
                    title="选择一件心意"
                    caption="当前顾问选择 · 优先于历史偏好"
                  />
                  <div className="sub-label">
                    <span>
                      自然意象 <small>MOTIF</small>
                    </span>
                    {task.motif && (
                      <button
                        className="clear-button"
                        onClick={() =>
                          change({
                            motif: null,
                            line: null,
                            sku: null,
                          })
                        }
                      >
                        清除选择
                      </button>
                    )}
                  </div>
                  <div
                    className="motif-grid"
                    role="group"
                    aria-label="自然意象"
                  >
                    {data.motifs.map((m) => (
                      <Choice
                        key={m.id}
                        active={task.motif === m.id}
                        className="motif-card"
                        onClick={() => change((t) => selectMotif(t, m.id))}
                      >
                        <MotifArt motif={m.id} />
                        <strong>{m.name}</strong>
                        <span>{m.zh}</span>
                        {task.motif === m.id && (
                          <Check className="motif-check" size={13} />
                        )}
                      </Choice>
                    ))}
                  </div>
                  {task.motif && (
                    <>
                      <div className="sub-label">
                        <span>
                          设计系列 <small>LINE · 可选</small>
                        </span>
                        {task.line && (
                          <button
                            className="clear-button"
                            onClick={() =>
                              change({
                                line: null,
                                sku: null,
                              })
                            }
                          >
                            清除系列
                          </button>
                        )}
                      </div>
                      <div className="chips" role="group" aria-label="设计系列">
                        {data.lines
                          .filter((l) => l.motif === task.motif)
                          .map((l) => (
                            <Choice
                              key={l.id}
                              active={task.line === l.id}
                              className="line-choice"
                              onClick={() => change((t) => selectLine(t, l.id))}
                            >
                              {l.name}
                              <small>{l.zh}</small>
                              {task.line === l.id && <Check size={13} />}
                            </Choice>
                          ))}
                      </div>
                    </>
                  )}
                  {task.line && (
                    <>
                      <div className="sub-label">
                        <span>
                          具体作品 <small>PRODUCT · 可选</small>
                        </span>
                        {task.sku && (
                          <button
                            className="clear-button"
                            onClick={() => change({ sku: null })}
                          >
                            清除作品
                          </button>
                        )}
                      </div>
                      <div
                        className="product-grid"
                        role="group"
                        aria-label="具体作品"
                      >
                        {data.products
                          .filter((p) => p.line === task.line)
                          .map((p) => (
                            <Choice
                              key={p.sku}
                              active={task.sku === p.sku}
                              className="product-card"
                              onClick={() =>
                                change((t) => selectProduct(t, p.sku))
                              }
                            >
                              <div className="product-image">
                                <JewelryArt p={p} />
                                <span>设计示意</span>
                                {task.sku === p.sku && <Check size={13} />}
                              </div>
                              <div className="product-content">
                                <span className="product-category">
                                  {p.category} / {p.sku}
                                </span>
                                <strong>{p.name}</strong>
                                <span className="material">{p.material}</span>
                                <span className="product-price">
                                  {cash(p.price)}
                                </span>
                              </div>
                            </Choice>
                          ))}
                      </div>
                      <p className="field-hint">
                        虚构产品与模拟零售价；插图仅为设计示意。
                      </p>
                    </>
                  )}
                  {product && (
                    <div className="resolved">
                      <Gem size={15} />
                      <div>
                        <span>本次推荐依据</span>
                        <p>
                          {product.sku} · {product.name}
                        </p>
                        <small>{validation.reason}</small>
                      </div>
                    </div>
                  )}
                  {!product &&
                    validation?.reason &&
                    !["greeting", "care"].includes(task.scenario) && (
                      <p className="field-hint">{validation.reason}</p>
                    )}
                  {!task.line && (
                    <p className="field-hint">
                      可保留当前选择层级；仅在范围内存在平台模拟预测时自动推荐单品。
                    </p>
                  )}
                </div>
              )}
              {["recommend", "price"].includes(task.scenario) && (
                <div className="form-section occasion-section">
                  <SectionHeading number="04" title="购买场合" optional />
                  <div className="chips" role="group" aria-label="购买场合">
                    {data.occasions.map((o, i) => {
                      const Icon = [Gem, Heart, Gift][i];
                      return (
                        <Choice
                          key={o.id}
                          active={task.occasion === o.id}
                          onClick={() =>
                            change({
                              occasion: task.occasion === o.id ? null : o.id,
                            })
                          }
                        >
                          <Icon size={14} />
                          {o.zh}
                        </Choice>
                      );
                    })}
                  </div>
                </div>
              )}
              {task.scenario === "price" && (
                <div className="form-section">
                  <label className="field">
                    客户实际表达的价格顾虑
                    <textarea
                      value={task.concern}
                      onChange={(e) => change({ concern: e.target.value })}
                      placeholder="记录客户的原话或准确转述"
                      maxLength={1000}
                    />
                  </label>
                </div>
              )}
              <div className="form-section notes-section">
                <div className="notes-label">
                  <label htmlFor="notes">
                    补充沟通背景 <span>可选</span>
                  </label>
                  <span>{task.notes.length}/1000</span>
                </div>
                <textarea
                  id="notes"
                  value={task.notes}
                  onChange={(e) => change({ notes: e.target.value })}
                  maxLength={1000}
                  placeholder="例如：客户最近的问题、这次希望传达的心意…"
                />
                <p className="field-hint">
                  只填写与此次沟通相关的已知信息，简短几句就好。
                </p>
              </div>
              <div className="generate-area">
                {validation?.issues?.length > 0 && (
                  <div
                    role="status"
                    className={"validation " + validation.status.toLowerCase()}
                  >
                    <div>
                      <Info size={15} />
                      <strong>
                        {validation.status === "BLOCKED"
                          ? "此请求暂不可生成"
                          : validation.issues.some(
                                (issue) => issue.code === "birthday-month",
                              )
                            ? "生日月提示"
                            : "还差一点沟通背景"}
                      </strong>
                    </div>
                    {validation.issues.map((i, n) => (
                      <p key={n}>{i.message}</p>
                    ))}
                    {validation.status !== "BLOCKED" &&
                      validation.issues.some(
                        (issue) => issue.code === "birthday-month",
                      ) && (
                        <button
                          type="button"
                          className="outline-button"
                          onClick={() => change({ greetingKind: "festival" })}
                        >
                          改为节日问候
                        </button>
                      )}
                  </div>
                )}
                {validation?.notices?.map((notice, i) => (
                  <p key={i} className="selection-note">
                    <Info size={13} />
                    {notice}
                  </p>
                ))}
                <button
                  className="generate-button"
                  onClick={generate}
                  disabled={
                    busy || validating || validation?.status !== "READY"
                  }
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  <span>{busy ? "正在细心构思…" : "生成微信消息"}</span>
                  {!busy && <ArrowRight size={17} />}
                </button>
                <div className="generate-footnote">
                  <ShieldCheck size={12} />
                  <span>
                    {data.mode === "demo"
                      ? "示例模式使用固定模板，不调用 AI"
                      : "AI 辅助构思，由您审核与发送"}{" "}
                    · 不会自动发送
                  </span>
                </div>
              </div>
            </section>
            <div className="right-column">
              <ClientProfile client={client} catalog={data} />
              <aside className="results-panel" aria-label="AI 消息结果">
                <div className="panel-top">
                  <div>
                    <span className="tiny-eyebrow">
                      WORDS, WITH CONSIDERATION
                    </span>
                    <h2>为您构思的三种表达</h2>
                  </div>
                  <Sparkles className="results-spark" size={20} />
                </div>
                <div className="results-meta">
                  <span>
                    {client.name}
                    <ChevronRight size={11} />
                    {currentScenario.zh}
                  </span>
                  <span className="mode-label">
                    {result ? "3 条候选消息" : "静候您的灵感"}
                  </span>
                </div>
                {data.mode === "demo" && (
                  <div className="demo-notice">
                    <Info size={14} />
                    <span>
                      演示模板 · 用于体验流程，并非真实 AI
                      生成。配置服务器密钥后可使用实时模式。
                    </span>
                  </div>
                )}
                {error && (
                  <div className="error-banner" role="alert">
                    <Info size={16} />
                    <span>{error}</span>
                    <button aria-label="关闭错误" onClick={() => setError("")}>
                      <X size={14} />
                    </button>
                  </div>
                )}
                {busy ? (
                  <div className="loading-results" role="status">
                    <div className="loading-emblem">
                      <Flower2 />
                    </div>
                    <h3>把了解，化作恰好的语言</h3>
                    <p>
                      正在整理信息与核实表达；遇到暂时问题会自动重试，请稍候…
                    </p>
                    {styleLabels.map((s, i) => (
                      <div className="skeleton-card" key={s[0]}>
                        <span>
                          0{i + 1} — {s[0]}
                        </span>
                        <div />
                        <div />
                        <div />
                      </div>
                    ))}
                  </div>
                ) : result ? (
                  <>
                    <div className="message-cards">
                      {result.candidates.map((c, i) => (
                        <article
                          className={
                            "message-card " + (selected === i ? "selected" : "")
                          }
                          key={c.style}
                        >
                          <div className="message-heading">
                            <div className="style-number">0{i + 1}</div>
                            <div>
                              <h3>{styleLabels[i][0]}</h3>
                              <span>{styleLabels[i][1]}</span>
                            </div>
                            {selected === i ? (
                              <span className="selected-tag">
                                <Check size={11} />
                                已选用
                              </span>
                            ) : (
                              <span className="style-tag">
                                {
                                  ["自然 · 直接", "细节 · 周全", "含蓄 · 从容"][
                                    i
                                  ]
                                }
                              </span>
                            )}
                          </div>
                          <p className="message-text">{c.text}</p>
                          <div className="message-actions">
                            <span>{c.text.length} 字符</span>
                            <div>
                              <button
                                className="text-button"
                                onClick={() => copy(c.text)}
                                aria-label={"复制" + styleLabels[i][0]}
                              >
                                <Copy size={13} />
                                复制
                              </button>
                              <button
                                className={
                                  "select-message " +
                                  (selected === i ? "chosen" : "")
                                }
                                onClick={() => selectCandidate(i)}
                              >
                                {selected === i ? (
                                  <Check size={13} />
                                ) : (
                                  <PenLine size={13} />
                                )}
                                选用并编辑
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="result-controls">
                      <span>
                        <ShieldCheck size={13} />
                        {result.checks}
                      </span>
                      <button
                        className="text-button"
                        onClick={generate}
                        disabled={busy || validation?.status !== "READY"}
                      >
                        <RefreshCw size={13} />
                        重新生成
                      </button>
                    </div>
                    {selected !== null && (
                      <section className="editor">
                        <div className="editor-title">
                          <h3>
                            <PenLine size={15} />
                            您的最终表达
                          </h3>
                          <button
                            className="clear-button"
                            onClick={() => setSelected(null)}
                          >
                            收起编辑
                          </button>
                        </div>
                        <label className="sr-only" htmlFor="final-message">
                          编辑最终消息
                        </label>
                        <textarea
                          id="final-message"
                          value={edited}
                          onChange={(e) => {
                            setEdited(e.target.value);
                            setEditReview(null);
                          }}
                          maxLength={600}
                        />
                        <div className="edit-warning">
                          <Info size={13} />
                          <span>
                            {edited !== result.candidates[selected].text
                              ? "已编辑 · 尚未重新审核"
                              : "选用原始候选 · 仍需顾问确认"}
                          </span>
                        </div>
                        {editReview && (
                          <p role="status" className="edit-review">
                            {editReview}
                          </p>
                        )}
                        <div className="editor-actions">
                          <button
                            className="outline-button"
                            onClick={reviewEdit}
                            disabled={!edited.trim()}
                          >
                            基础检查
                          </button>
                          <button
                            className="dark-button"
                            onClick={() => copy(edited)}
                            disabled={!edited.trim()}
                          >
                            <Copy size={13} />
                            复制最终消息
                          </button>
                        </div>
                      </section>
                    )}
                  </>
                ) : (
                  <div className="empty-results">
                    <div className="empty-illustration">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <Flower2 />
                      <span className="illustration-star one">✧</span>
                      <span className="illustration-star two">✧</span>
                      <span className="illustration-label">
                        A PERSONAL TOUCH
                      </span>
                    </div>
                    <h3>好的表达，始于用心了解</h3>
                    <p>
                      选择客户与沟通场景，
                      <br />
                      我们将为您构思三种恰如其分的表达。
                    </p>
                    <div className="empty-styles">
                      {styleLabels.map((s, i) => (
                        <div key={s[0]}>
                          <span>0{i + 1}</span>
                          <strong>{s[0]}</strong>
                          <small>{s[1]}</small>
                        </div>
                      ))}
                    </div>
                    <div className="empty-note">
                      <ShieldCheck size={15} />
                      <p>
                        基于品牌手册与已存客户资料
                        <br />
                        每一条消息，都由您作最后决定。
                      </p>
                    </div>
                  </div>
                )}
                <div className="results-bottom">
                  <span>温暖 · 自然 · 克制</span>
                  <Flower2 size={15} />
                  <span>THE MAISON LIORÉ VOICE</span>
                </div>
              </aside>
            </div>
          </div>
        )}
        <footer>
          <span>
            MAISON LIORÉ <i>·</i> Client Advisor Workspace
          </span>
          <span>
            虚构品牌与演示资料 <i>·</i> Brand Bible v1.0
          </span>
          <button onClick={exportRecords}>
            <Download size={12} />
            导出生成记录
          </button>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
    </>
  );
}
export const applicationRoot = createRoot(document.getElementById("root"));
applicationRoot.render(<App />);
