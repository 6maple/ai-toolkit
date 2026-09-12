/**
 * Reviewer configuration: shipped defaults, the two control routes, and the control-body
 * ceiling. `mergeConfig` keeps the dynamic prototype's merge semantics exactly — a provided
 * object is layered over the defaults, so an omitted key keeps its default.
 */

/** Panel poll route; the query's sessionId selects which session the panel highlights. */
export const STATE_ROUTE = "/dsh-approve-for-me/state";
/** Control route: enable/pause, dry-run, and scope. */
export const TOGGLE_ROUTE = "/dsh-approve-for-me/toggle";
/** Control bodies are tiny JSON objects; anything larger is hostile. */
export const MAX_BODY_BYTES = 64 * 1024;

export type ReviewerScope = "session" | "all";

export interface ReviewerConfig {
  /** Force a reviewer provider; otherwise the session's own route is used. */
  provider: string | undefined;
  /** Force a reviewer model; otherwise the session's own route is used. */
  model: string | undefined;
  maxTokens: number;
  temperature: number;
  maxToolArgChars: number;
  maxUserChars: number;
  maxInstructionChars: number;
  maxContextChars: number;
  maxInspectPaths: number;
  maxInspectBytes: number;
  recentUserMessages: number;
  recentContextMessages: number;
  /** How many decisions the panel keeps. */
  ringSize: number;
  /** A reviewer "deny" blocks the action instead of being handed to the human. */
  autoDeny: boolean;
  /** Review every request but never claim it — always hand the verdict to the human. */
  dryRun: boolean;
  /**
   * Which sessions the reviewer claims. `all` (the default) reviews every session's requests,
   * each with that request's own session for evidence and model route, so nobody has to keep a
   * particular tab open. `session` narrows interception to the session the panel's poll binds.
   */
  scope: ReviewerScope;
}

export const DEFAULT_CONFIG: ReviewerConfig = {
  provider: undefined,
  model: undefined,
  maxTokens: 1200,
  temperature: 0,
  maxToolArgChars: 6000,
  maxUserChars: 1000,
  maxInstructionChars: 2000,
  maxContextChars: 400,
  maxInspectPaths: 3,
  maxInspectBytes: 8192,
  recentUserMessages: 4,
  recentContextMessages: 3,
  ringSize: 40,
  autoDeny: true,
  dryRun: false,
  scope: "all",
};

/** Layer the plugin's `provided` config over the shipped defaults. */
export function mergeConfig(provided: unknown): ReviewerConfig {
  if (provided === null || typeof provided !== "object") return { ...DEFAULT_CONFIG };
  return Object.assign({}, DEFAULT_CONFIG, provided as Partial<ReviewerConfig>);
}
