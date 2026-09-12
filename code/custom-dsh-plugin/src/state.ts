/**
 * The reviewer's mutable bookkeeping: live counters, last-run diagnostics, the bound session,
 * and the bounded decision ring the panel reads.
 *
 * Only the reviewer's own loop writes here; the panel route and the report tool read it. The
 * counters are deliberate: `unboundSkips` and `scopeSkips` are what prove the fail-closed
 * session gate is working, and `annotationFailures` is what proves the human actually saw the
 * reviewer's note.
 */
import { clipText } from "./text.js";
import type { ReviewerConfig, ReviewerScope } from "./config.js";
import type { ApprovalRequest, DecisionRecord } from "./types.js";

export interface ReviewerState {
  enabled: boolean;
  boundSessionId: string;
  route: string;
  routeVia: string;
  lastError: string;
  lastRaw: string;
  lastFailure: string;
  lastPrompt: string;
  lastEvidence: string;
  lastInspection: string;
  lastSessionId: string;
  lastCwd: string;
  lastDeferWritten: boolean;
  /** Every approval request the composition offered, before any gating. */
  listenerHits: number;
  /** Unrelated host events, used only as a liveness signal. */
  eventHits: number;
  /** Requests skipped because they belong to another session. */
  scopeSkips: number;
  /** Requests skipped because no session is bound yet (fail-closed). */
  unboundSkips: number;
  toolError: string;
  annotationFailures: number;
  decisions: DecisionRecord[];
}

export function createState(): ReviewerState {
  return {
    enabled: true,
    boundSessionId: "",
    route: "",
    routeVia: "",
    lastError: "",
    lastRaw: "",
    lastFailure: "",
    lastPrompt: "",
    lastEvidence: "",
    lastInspection: "",
    lastSessionId: "",
    lastCwd: "",
    lastDeferWritten: false,
    listenerHits: 0,
    eventHits: 0,
    scopeSkips: 0,
    unboundSkips: 0,
    toolError: "",
    annotationFailures: 0,
    decisions: [],
  };
}

/** Append one decision, keeping the ring bounded. */
export function recordDecision(
  state: ReviewerState,
  config: ReviewerConfig,
  entry: DecisionRecord,
): void {
  state.decisions.push(entry);
  while (state.decisions.length > config.ringSize) state.decisions.shift();
}

export interface PanelDecisionFields {
  time: number;
  toolName: unknown;
  callId: unknown;
  reason: unknown;
  outcome: string;
  risk: string;
  authorization: string;
  rationale: string;
  deferred: boolean;
  annotated: boolean;
  inspected: number;
}

/** Build the record for one decision, reading the live request defensively. */
export function buildDecision(
  state: ReviewerState,
  config: ReviewerConfig,
  req: ApprovalRequest,
  fields: PanelDecisionFields,
): DecisionRecord {
  return {
    time: fields.time,
    toolName: typeof fields.toolName === "string" ? fields.toolName : "?",
    callId: typeof fields.callId === "string" ? fields.callId : "",
    sessionId: state.lastSessionId,
    reason: clipText(typeof fields.reason === "string" ? fields.reason : "", 300),
    outcome: fields.outcome,
    risk: fields.risk,
    authorization: fields.authorization,
    rationale: fields.rationale,
    deferred: fields.deferred === true,
    annotated: fields.annotated === true,
    inspected: typeof fields.inspected === "number" ? fields.inspected : 0,
    dryRun: config.dryRun === true,
    ms: Date.now() - fields.time,
  };
}

/** The panel's poll payload. */
export interface PanelSnapshot {
  enabled: boolean;
  dryRun: boolean;
  scope: ReviewerScope;
  boundSessionId: string;
  route: string;
  lastError: string;
  toolError: string;
  autoDeny: boolean;
  annotationFailures: number;
  listenerHits: number;
  scopeSkips: number;
  unboundSkips: number;
  decisions: readonly DecisionRecord[];
}

export function stateSnapshot(state: ReviewerState, config: ReviewerConfig): PanelSnapshot {
  return {
    enabled: state.enabled,
    dryRun: config.dryRun === true,
    scope: config.scope,
    boundSessionId: state.boundSessionId,
    route: state.route,
    lastError: state.lastError,
    toolError: state.toolError,
    autoDeny: config.autoDeny === true,
    annotationFailures: state.annotationFailures,
    listenerHits: state.listenerHits,
    scopeSkips: state.scopeSkips,
    unboundSkips: state.unboundSkips,
    decisions: state.decisions,
  };
}

/** The browser half's poll is what binds the session to intercept. */
export function bindSession(state: ReviewerState, sessionId: unknown): void {
  if (typeof sessionId === "string" && sessionId !== "") state.boundSessionId = sessionId;
}
