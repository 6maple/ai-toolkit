/// <reference lib="dom" />
/**
 * The session-header chip and its expandable panel.
 *
 * Wording, thresholds and the fail-closed red line are carried over unchanged from the dynamic
 * prototype the user validated; the CSS still uses theme tokens so it follows the active theme.
 * Styling is injected as a data-plugin-css tag, the same convention the shipped client plugins
 * use, so a hot reload can replace it without duplicating rules.
 */
import * as React from "react";

export const CSS_TAG = "@dsh-external/dsh-approve-for-me/panel.css";

const PANEL_CSS = `
.a4m-wrap{position:relative;display:inline-flex}
.a4m-chip{font:inherit;font-size:11px;line-height:16px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;padding:2px 9px;cursor:pointer;white-space:nowrap}
.a4m-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.a4m-chip-bad{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.a4m-card{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;background:var(--dsw-alias-bg-layer-1)}
.a4m-pop{position:absolute;top:calc(100% + 6px);right:0;z-index:40;width:min(560px,84vw);max-height:60vh;overflow:auto;box-shadow:0 8px 28px rgba(0,0,0,.22)}
.a4m-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.a4m-title{font-weight:600}
.a4m-dim{color:var(--dsw-alias-label-secondary)}
.a4m-btn{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 8px;cursor:pointer}
.a4m-spacer{margin-left:auto}
.a4m-row{display:flex;gap:8px;align-items:baseline;border-top:1px solid var(--dsw-alias-border-l1);padding-top:6px;margin-top:6px;flex-wrap:wrap}
.a4m-badge{flex:none;white-space:nowrap}
.a4m-allow{color:var(--dsw-alias-state-success-primary)}
.a4m-warn{color:var(--dsw-alias-state-warn-primary)}
.a4m-deny{color:var(--dsw-alias-state-error-primary)}
.a4m-rationale{flex:1 1 200px;min-width:0}
.a4m-detail{flex:1 1 100%;color:var(--dsw-alias-label-secondary);word-break:break-word}
`;

export function ensureStyles(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]") !== null)
    return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "@dsh-external/dsh-approve-for-me";
  tag.dataset.pluginCss = CSS_TAG;
  tag.textContent = PANEL_CSS;
  document.head.appendChild(tag);
}

export interface DecisionView {
  time?: number;
  sessionId?: string;
  toolName?: string;
  outcome?: string;
  risk?: string;
  authorization?: string;
  rationale?: string;
  reason?: string;
  deferred?: boolean;
  annotated?: boolean;
  inspected?: number;
  ms?: number;
  dryRun?: boolean;
}

export interface ViewState {
  enabled: boolean;
  dryRun: boolean;
  scope: string;
  boundSessionId: string;
  route: string;
  lastError: string;
  toolError: string;
  autoDeny: boolean;
  annotationFailures: number;
  scopeSkips: number;
  unboundSkips: number;
  decisions: DecisionView[];
  listenerHits: number;
  ready: boolean;
}

const EMPTY_VIEW: ViewState = {
  enabled: true,
  dryRun: false,
  scope: "session",
  boundSessionId: "",
  route: "",
  lastError: "",
  toolError: "",
  autoDeny: true,
  annotationFailures: 0,
  scopeSkips: 0,
  unboundSkips: 0,
  decisions: [],
  listenerHits: 0,
  ready: false,
};

/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
function hostBase(): string {
  const origin = globalThis.location?.origin;
  return origin !== undefined && origin !== "null" ? origin : "http://dsh.internal";
}

function readSessionId(props: { readonly sessionId?: unknown }): string {
  if (props === null || typeof props !== "object") return "";
  return typeof props.sessionId === "string" ? props.sessionId : "";
}

function badgeClass(outcome: string | undefined): string {
  if (outcome === "allow") return "a4m-badge a4m-allow";
  if (outcome === "deny") return "a4m-badge a4m-deny";
  return "a4m-badge a4m-warn";
}

function outcomeLabel(entry: DecisionView): string {
  const dry = entry.dryRun === true ? "演练·" : "";
  if (entry.outcome === "allow") return dry + "自动放行";
  if (entry.outcome === "deny") return dry + "已拦截";
  if (entry.outcome === "unsure") return dry + "转人工";
  if (entry.outcome === "unparsed") return dry + "转人工·未解析";
  if (entry.outcome === "no-route") return dry + "转人工·无模型";
  if (entry.outcome === "error") return dry + "转人工·出错";
  return dry + String(entry.outcome);
}

function timeText(ms: number | undefined): string {
  if (typeof ms !== "number") return "";
  const at = new Date(ms);
  const pad = (value: number): string => (value < 10 ? "0" + value : "" + value);
  return pad(at.getHours()) + ":" + pad(at.getMinutes()) + ":" + pad(at.getSeconds());
}

/** Label a decision that came from another session; the managed scope is every session. */
function otherSession(entrySession: string | undefined, current: string): string {
  if (typeof entrySession !== "string" || entrySession === "" || entrySession === current)
    return "";
  return "会话 " + entrySession.replace(/^session-/, "").slice(0, 8);
}

/** Narrow the host payload into the panel's own view state. */
function normalizeView(next: unknown): ViewState {
  if (next === null || typeof next !== "object") return EMPTY_VIEW;
  const value = next as Record<string, unknown>;
  return {
    enabled: value.enabled === true,
    dryRun: value.dryRun === true,
    scope: typeof value.scope === "string" ? value.scope : "session",
    boundSessionId: typeof value.boundSessionId === "string" ? value.boundSessionId : "",
    route: typeof value.route === "string" ? value.route : "",
    lastError: typeof value.lastError === "string" ? value.lastError : "",
    toolError: typeof value.toolError === "string" ? value.toolError : "",
    autoDeny: value.autoDeny === true,
    annotationFailures: typeof value.annotationFailures === "number" ? value.annotationFailures : 0,
    scopeSkips: typeof value.scopeSkips === "number" ? value.scopeSkips : 0,
    unboundSkips: typeof value.unboundSkips === "number" ? value.unboundSkips : 0,
    decisions: Array.isArray(value.decisions) ? (value.decisions as DecisionView[]) : [],
    listenerHits: typeof value.listenerHits === "number" ? value.listenerHits : 0,
    ready: true,
  };
}

export function Panel(props: { readonly sessionId?: unknown }): React.ReactElement {
  const sessionId = readSessionId(props);
  const [view, setView] = React.useState<ViewState>(EMPTY_VIEW);
  const [open, setOpen] = React.useState(false);

  const pull = React.useCallback(async (): Promise<void> => {
    try {
      const url = new URL("/dsh-approve-for-me/state", hostBase());
      if (sessionId !== "") url.searchParams.set("sessionId", sessionId);
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const next: unknown = await response.json();
      setView(normalizeView(next));
    } catch (error) {
      console.error("approve-for-me: state pull failed", error);
    }
  }, [sessionId]);

  React.useEffect(() => {
    let cancelled = false;
    const tick = (): void => {
      if (!cancelled) void pull();
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pull]);

  const toggle = (patch: Record<string, unknown>): void => {
    void (async () => {
      try {
        await fetch(new URL("/dsh-approve-for-me/toggle", hostBase()), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        await pull();
      } catch (error) {
        console.error("approve-for-me: toggle failed", error);
      }
    })();
  };

  let allowed = 0;
  let blocked = 0;
  let deferred = 0;
  let mine = 0;
  for (let i = 0; i < view.decisions.length; i++) {
    const outcome = view.decisions[i].outcome;
    if (outcome === "allow") allowed++;
    else if (outcome === "deny") blocked++;
    else deferred++;
    if (view.decisions[i].sessionId === sessionId) mine++;
  }
  const others = view.decisions.length - mine;

  const bound = view.boundSessionId !== "";
  const unbound = view.scope === "session" && bound !== true;
  let summary: string;
  if (view.enabled !== true) summary = "插件已暂停：所有审批都交给你。";
  else if (unbound) summary = "尚未收到本会话 id，插件暂不接管任何请求。";
  else if (view.dryRun === true) summary = "演练模式：只审查不接管，每次都会带着审查意见转给你。";
  else {
    summary =
      "审查模型 " +
      (view.route || "解析中…") +
      "：低/中风险自动放行" +
      (view.autoDeny ? "，高风险直接拦截" : "，高风险也转你确认") +
      "，拿不准转给你并附上审查意见";
  }

  const rows = view.decisions
    .slice()
    .reverse()
    .map((entry, index) =>
      React.createElement(
        "div",
        {
          className: "a4m-row",
          key: String(entry.time) + "-" + String(index),
        },
        React.createElement("span", { className: "a4m-dim" }, timeText(entry.time)),
        React.createElement(
          "span",
          { className: "a4m-warn" },
          otherSession(entry.sessionId, sessionId),
        ),
        React.createElement("span", { className: badgeClass(entry.outcome) }, outcomeLabel(entry)),
        React.createElement("span", { className: "a4m-dim" }, String(entry.toolName || "?")),
        React.createElement(
          "span",
          { className: "a4m-dim" },
          "风险 " + String(entry.risk || "?") + " · 授权 " + String(entry.authorization || "?"),
        ),
        React.createElement(
          "span",
          { className: "a4m-dim" },
          typeof entry.ms === "number" ? entry.ms + "ms" : "",
        ),
        typeof entry.inspected === "number" && entry.inspected > 0
          ? React.createElement(
              "span",
              { className: "a4m-dim" },
              "查阅 " + entry.inspected + " 个路径",
            )
          : null,
        entry.deferred === true && entry.annotated === false
          ? React.createElement("span", { className: "a4m-deny" }, "（未能写入人工提示）")
          : null,
        React.createElement("span", { className: "a4m-rationale" }, String(entry.rationale || "")),
        entry.reason
          ? React.createElement("span", { className: "a4m-detail" }, String(entry.reason))
          : null,
      ),
    );

  const popup =
    open !== true
      ? null
      : React.createElement(
          "div",
          { className: "a4m-card a4m-pop" },
          React.createElement(
            "div",
            { className: "a4m-head" },
            React.createElement("span", { className: "a4m-title" }, "帮我批准"),
            React.createElement(
              "span",
              { className: "a4m-dim" },
              "自动放行 " + allowed + " · 拦截 " + blocked + " · 转人工 " + deferred,
            ),
            React.createElement(
              "span",
              { className: "a4m-dim a4m-spacer" },
              "拦截请求 " + view.listenerHits + " 次",
            ),
            React.createElement(
              "button",
              {
                className: "a4m-btn",
                type: "button",
                onClick: () => toggle({ scope: view.scope === "session" ? "all" : "session" }),
              },
              view.scope === "session" ? "范围：本会话" : "范围：全部会话",
            ),
            React.createElement(
              "button",
              {
                className: "a4m-btn",
                type: "button",
                onClick: () => toggle({ dryRun: view.dryRun !== true }),
              },
              view.dryRun ? "演练：开" : "演练：关",
            ),
            React.createElement(
              "button",
              {
                className: "a4m-btn",
                type: "button",
                onClick: () => toggle({ enabled: view.enabled !== true }),
              },
              view.enabled ? "已启用" : "已暂停",
            ),
          ),
          React.createElement("div", { className: "a4m-dim" }, summary),
          React.createElement(
            "div",
            { className: "a4m-dim" },
            "裁决来源：本会话 " +
              mine +
              " · 其他会话 " +
              others +
              (view.scope === "all"
                ? "（当前接管全部会话，每条都按它自己的会话审查）"
                : "（当前只接管本会话）"),
          ),
          unbound
            ? React.createElement(
                "div",
                { className: "a4m-deny" },
                "未绑定会话：插件当前不会接管任何审批请求。",
              )
            : null,
          view.lastError !== ""
            ? React.createElement("div", { className: "a4m-deny" }, "审查错误：" + view.lastError)
            : null,
          view.toolError !== ""
            ? React.createElement(
                "div",
                { className: "a4m-deny" },
                "工具注册失败：" + view.toolError,
              )
            : null,
          view.annotationFailures > 0
            ? React.createElement(
                "div",
                { className: "a4m-deny" },
                "有 " +
                  view.annotationFailures +
                  " 次未能把审查意见写入人工提示（弹窗里看不到意见）",
              )
            : null,
          view.scopeSkips > 0 || view.unboundSkips > 0
            ? React.createElement(
                "div",
                { className: "a4m-dim" },
                "已跳过：非本会话 " + view.scopeSkips + " 次 · 未绑定 " + view.unboundSkips + " 次",
              )
            : null,
          view.ready && view.decisions.length === 0
            ? React.createElement(
                "div",
                { className: "a4m-dim" },
                "还没有审批请求。当沙箱需要升级权限时，这里会显示每一次裁决。",
              )
            : null,
          rows,
        );

  return React.createElement(
    "div",
    { className: "a4m-wrap" },
    React.createElement(
      "button",
      {
        className: unbound ? "a4m-chip a4m-chip-bad" : "a4m-chip",
        type: "button",
        title: summary,
        "aria-expanded": open,
        onClick: () => setOpen((value) => value !== true),
      },
      "帮我批准 放行" + allowed + "·拦截" + blocked + "·转人工" + deferred,
    ),
    popup,
  );
}
