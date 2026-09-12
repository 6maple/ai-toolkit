/**
 * @dsh-external/dsh-approve-for-me — host half.
 *
 * A Codex-style "auto_review" adjudicator for DSH approval requests: it intercepts
 * `approval/request` ahead of the human popup, reviews the pending action with an LLM, and
 * grants low/medium risk without a prompt, blocks what the reviewer denies, and hands anything
 * uncertain back to the human with the reviewer's note attached to the card.
 *
 * Three properties are load-bearing and verified against live traffic:
 *   - `prepend: true` — the human popup is registered during browser boot, so an injected
 *     listener must be unshifted ahead of it or the human is asked first.
 *   - Fail-closed gating — until the panel's poll binds a session, and for any request from
 *     another session, the listener defers to `next()` untouched.
 *   - Zero runtime imports — dsh-super-injector links this package by junction, and Node
 *     resolves a junction target's imports from the package's real path, where no node_modules
 *     exists. Every import here is type-only and erased by tsc.
 */
import { mergeConfig } from "./config.js";
import { gatherEvidence, sessionOf } from "./evidence.js";
import { registerPanelRoutes } from "./panel.js";
import { buildPrompt } from "./prompt.js";
import { resolveRoute, reviewWithInspection } from "./review.js";
import { buildDecision, createState, recordDecision } from "./state.js";
import { clipText, decide, errorText } from "./text.js";
import { createReportTool } from "./tool.js";
import type { ReviewerConfig } from "./config.js";
import type { ReviewerState } from "./state.js";
import type {
  ApprovalListener,
  ApprovalRequest,
  DefaultModelService,
  FsService,
  HostContext,
  LlmService,
  SessionsService,
  ToolsService,
} from "./types.js";

export const name = "approve-for-me";

/** The route carrier, the trust fence, and every service the reviewer needs. */
export const inject = [
  "sessions",
  "llm",
  "agentDefaultModel",
  "tools",
  "fs",
  "webServer",
  "connection",
];

/**
 * Append the reviewer's note to the approval reason the human card renders as its headline.
 * The request object is shared by reference with the browser bridge, which is why writing here
 * is what makes the note visible in the popup.
 */
function annotateReason(req: ApprovalRequest, note: string): boolean {
  const original = req.reason;
  if (typeof original !== "string" || original === "") return false;
  const wanted = original + "\n\n【帮我批准】" + note;
  try {
    req.reason = wanted;
  } catch {
    return false;
  }
  return req.reason === wanted;
}

export function apply(ctx: HostContext, provided?: unknown): void {
  const config: ReviewerConfig = mergeConfig(provided);
  const state: ReviewerState = createState();

  // One documented cast: the host's service registry is untyped at this boundary, and these
  // interfaces mirror the contract the reviewer was verified against.
  const sessions = ctx.get("sessions") as SessionsService | undefined;
  const llm = ctx.get("llm") as LlmService | undefined;
  const defaultModel = ctx.get("agentDefaultModel") as DefaultModelService | undefined;
  const tools = ctx.get("tools") as ToolsService | undefined;
  const fs = ctx.get("fs") as FsService | undefined;
  const services = {
    sessions: sessions !== undefined,
    llm: llm !== undefined,
    agentDefaultModel: defaultModel !== undefined,
    tools: tools !== undefined,
    fs: fs !== undefined,
  };

  /** Hand the decision to the human, carrying the reviewer's note in the card they will read. */
  function defer(req: ApprovalRequest, note: string): boolean {
    const ok = annotateReason(req, note);
    state.lastDeferWritten = ok;
    if (!ok) state.annotationFailures = state.annotationFailures + 1;
    return ok;
  }

  function note(
    req: ApprovalRequest,
    startedAt: number,
    outcome: string,
    risk: string,
    authorization: string,
    rationale: string,
    deferred: boolean,
    annotated: boolean,
    inspected: number,
  ): void {
    recordDecision(
      state,
      config,
      buildDecision(state, config, req, {
        time: startedAt,
        toolName: req.toolName,
        callId: req.callId,
        reason: req.reason,
        outcome,
        risk,
        authorization,
        rationale,
        deferred,
        annotated,
        inspected,
      }),
    );
  }

  ctx.on("tools/change", () => {
    state.eventHits = state.eventHits + 1;
  });

  if (sessions === undefined || llm === undefined) {
    state.lastError = "missing service; no listener registered: " + JSON.stringify(services);
    console.error("approve-for-me: " + state.lastError);
  } else {
    const listener: ApprovalListener = async (req, next) => {
      state.listenerHits = state.listenerHits + 1;
      if (state.enabled !== true) return next();
      const startedAt = Date.now();
      try {
        const found = sessionOf(sessions, req);
        if (config.scope === "session") {
          if (state.boundSessionId === "") {
            state.unboundSkips = state.unboundSkips + 1;
            return next();
          }
          if (found === undefined || found.id === "" || found.id !== state.boundSessionId) {
            state.scopeSkips = state.scopeSkips + 1;
            return next();
          }
        }
        state.lastSessionId = found === undefined ? "" : found.id;
        const route = resolveRoute(
          found === undefined ? undefined : found.session,
          defaultModel,
          config,
        );
        if (route === undefined) {
          const ok = defer(req, "无法解析审查模型路由，已交给你判断。");
          note(
            req,
            startedAt,
            "no-route",
            "-",
            "-",
            "could not resolve a reviewer model route",
            true,
            ok,
            0,
          );
          return next();
        }
        state.route = route.provider + "/" + route.model;
        state.routeVia = typeof route.via === "string" ? route.via : "";
        const evidence = gatherEvidence(found, req, config);
        const sessionId =
          evidence !== undefined && evidence.sessionId !== ""
            ? evidence.sessionId
            : req.agent !== undefined && typeof req.agent.id === "string"
              ? req.agent.id
              : "";
        const prompt = buildPrompt(req, evidence);
        state.lastPrompt = clipText(prompt, 1500);
        state.lastCwd = evidence === undefined ? "" : evidence.cwd;
        state.lastEvidence = JSON.stringify({
          found: evidence !== undefined,
          argsChars: evidence === undefined ? 0 : evidence.arguments.length,
          humanMessages: evidence === undefined ? 0 : evidence.humanTexts.length,
          instructionMessages: evidence === undefined ? 0 : evidence.instructionTexts.length,
          contextMessages: evidence === undefined ? 0 : evidence.contextTexts.length,
          cwd: evidence === undefined ? "" : evidence.cwd,
          sessionId,
        });
        const outcome = await reviewWithInspection(
          llm,
          fs,
          prompt,
          route,
          config,
          req.signal,
          sessionId,
          evidence,
          undefined,
        );
        const result = outcome.result;
        const verdict = outcome.verdict;
        const inspected = outcome.inspected;
        state.lastRaw = clipText(result.text, 800);
        state.lastFailure = clipText(result.failure, 300);
        state.lastInspection = outcome.inspection;
        if (verdict === undefined) {
          const why =
            result.failure !== ""
              ? "审查调用失败：" + clipText(result.failure, 160)
              : "审查者未返回可用的结论，已交给你判断。";
          const ok = defer(req, why);
          note(
            req,
            startedAt,
            "unparsed",
            "-",
            "-",
            result.failure !== ""
              ? "review call failed: " + clipText(result.failure, 200)
              : "reviewer returned no usable JSON",
            true,
            ok,
            inspected,
          );
          return next();
        }
        if (config.dryRun === true) {
          const ok = defer(
            req,
            "演练模式（不接管）：若真实生效会判为 " +
              verdict.outcome +
              " · 风险 " +
              verdict.risk +
              " · 授权 " +
              verdict.authorization +
              " — " +
              verdict.rationale,
          );
          note(
            req,
            startedAt,
            verdict.outcome,
            verdict.risk,
            verdict.authorization,
            verdict.rationale,
            true,
            ok,
            inspected,
          );
          return next();
        }
        const action = decide(verdict, config.autoDeny, false);
        if (action === "allowed-once") {
          note(
            req,
            startedAt,
            "allow",
            verdict.risk,
            verdict.authorization,
            verdict.rationale,
            false,
            false,
            inspected,
          );
          return "allowed-once";
        }
        if (action === "rejected") {
          note(
            req,
            startedAt,
            "deny",
            verdict.risk,
            verdict.authorization,
            verdict.rationale,
            false,
            false,
            inspected,
          );
          return "rejected";
        }
        const ok = defer(
          req,
          "风险 " +
            verdict.risk +
            " · 用户授权 " +
            verdict.authorization +
            " — " +
            verdict.rationale,
        );
        note(
          req,
          startedAt,
          verdict.outcome,
          verdict.risk,
          verdict.authorization,
          verdict.rationale,
          true,
          ok,
          inspected,
        );
        return next();
      } catch (error) {
        const message = errorText(error);
        state.lastError = clipText(message, 300);
        const ok = defer(req, "审查出错，已交给你判断。");
        note(req, startedAt, "error", "-", "-", clipText(message, 200), true, ok, 0);
        console.error("approve-for-me: review failed, deferring to the human:", message);
        return next();
      }
    };
    ctx.on("approval/request", listener, { prepend: true });
  }

  registerPanelRoutes(ctx, state, config);

  if (tools !== undefined) {
    try {
      ctx.tools.register(createReportTool({ state, config, services, llm, fs, defaultModel }));
    } catch (error) {
      state.toolError = clipText(errorText(error), 400);
      console.error("approve-for-me: report tool registration failed:", state.toolError);
    }
  }

  console.log(
    "approve-for-me: active - claims only the bound session; low/medium risk is granted without a prompt, high risk is blocked, unsure reaches you with the reviewer note attached",
  );
}
