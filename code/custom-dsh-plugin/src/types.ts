/**
 * The host contract surface this plugin actually consumes.
 *
 * Deliberately local and narrow instead of importing the service packages' declarations:
 * the sandbox/approval/session services are separate dsh packages whose type versions must
 * match the running host, while the plugin must stay loadable by junction with ZERO runtime
 * imports (Node resolves a junction target's imports from the package's real path, where no
 * node_modules exists). Every interface below mirrors a contract that was verified against
 * the live host; the single cast at the boundary lives in index.ts.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";

export type { IncomingMessage, ServerResponse, ToolDefinition };

/** A session event as the log exposes it; every field is untrusted and narrowed on use. */
export interface SessionEventData {
  readonly callId?: unknown;
  readonly name?: unknown;
  readonly arguments?: unknown;
  readonly content?: unknown;
  readonly source?: unknown;
}

export interface SessionEvent {
  readonly type?: unknown;
  readonly data?: SessionEventData;
}

export interface SessionHeader {
  readonly id?: unknown;
  readonly cwd?: unknown;
}

export interface SessionRequestContext {
  readonly provider?: unknown;
  readonly model?: unknown;
}

/** The slice of a live session the reviewer reads. */
export interface ReviewerSession {
  readonly header?: SessionHeader;
  snapshotEvents(): readonly SessionEvent[];
  requestContext(): SessionRequestContext | undefined;
}

export interface SessionsService {
  get(agentId: string): ReviewerSession | undefined;
}

export interface LlmMessage {
  readonly id: string;
  readonly role: "user";
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly source: { readonly kind: string; readonly plugin: string };
}

export interface LlmStreamOptions {
  readonly provider: string;
  readonly model: string;
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  readonly maxTokens: number;
  readonly temperature: number;
  signal?: AbortSignal;
  sessionId?: string;
}

export interface LlmChunk {
  readonly type?: unknown;
  readonly text?: unknown;
  readonly reason?: unknown;
}

export interface LlmService {
  stream(options: LlmStreamOptions): AsyncIterable<LlmChunk>;
}

export interface DefaultModelSelection {
  readonly provider?: unknown;
  readonly model?: unknown;
}

export interface DefaultModelService {
  currentSelection(): DefaultModelSelection | undefined;
}

export interface ToolsService {
  register(definition: ToolDefinition): () => void;
}

/** An opaque filesystem handle; only the fs service itself interprets it. */
export type FsTarget = unknown;

export interface FsStat {
  readonly type?: unknown;
  readonly size?: unknown;
}

export interface FsEntry {
  readonly name?: unknown;
  readonly type?: unknown;
}

export interface FsService {
  resolve(path: string, options?: { readonly cwd?: string }): Promise<FsTarget>;
  contains(root: FsTarget, target: FsTarget): boolean;
  stat(target: FsTarget): Promise<FsStat | undefined>;
  listDir(target: FsTarget): Promise<readonly FsEntry[]>;
  readByteRange(
    target: FsTarget,
    range: { readonly offset: number; readonly length: number },
  ): Promise<Uint8Array | undefined>;
}

export interface WebServerRegistration {
  readonly kind: "exact";
  readonly path: string;
  readonly handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
}

export interface WebServerService {
  register(registration: WebServerRegistration): () => void;
}

export interface ConnectionService {
  /** The composition's Host/Origin + login-token fence; undefined lets the request through. */
  requestRejection(req: IncomingMessage): number | undefined;
}

/** One pending approval request. `reason` is mutated in place to carry the reviewer's note. */
export interface ApprovalRequest {
  readonly toolName?: unknown;
  readonly callId?: unknown;
  reason?: string;
  readonly agent?: { readonly id?: unknown };
  readonly signal?: AbortSignal;
}

export type ApprovalOutcome = "allowed-once" | "rejected" | "cancelled" | "unavailable";

export type ApprovalNext = () => ApprovalOutcome | Promise<ApprovalOutcome>;

export interface ApprovalListener {
  (req: ApprovalRequest, next: ApprovalNext): Promise<ApprovalOutcome>;
}

/** The host context surface used here: three services reached by name plus two events. */
export interface HostContext {
  get(name: string): unknown;
  on(
    name: "approval/request",
    listener: ApprovalListener,
    options?: { readonly prepend?: boolean },
  ): unknown;
  on(name: "tools/change", listener: () => void): unknown;
  effect(callback: () => unknown, label?: string): unknown;
  webServer: WebServerService;
  tools: ToolsService;
}

/** One reviewer decision, as the panel and the report tool expose it. */
export interface DecisionRecord {
  time: number;
  toolName: string;
  callId: string;
  sessionId: string;
  reason: string;
  outcome: string;
  risk: string;
  authorization: string;
  rationale: string;
  deferred: boolean;
  annotated: boolean;
  inspected: number;
  dryRun: boolean;
  ms: number;
}
