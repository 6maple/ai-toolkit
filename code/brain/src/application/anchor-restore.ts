import {
  advanceScopeCycle,
  applyPassiveExposure,
  projectAccessibility,
  type AccessibilityPersistenceState,
  type ScopeCycleState,
} from "../brain/accessibility.ts";
import type { ArchivalDocument, CoreDocument } from "../brain/documents.ts";
import { deriveEpistemicStatus, type EpistemicState } from "../brain/epistemic.ts";
import {
  formatPublicPath,
  type LogicalArchivalPath,
  type LogicalCorePath,
  type ScopeRef,
  type SessionId,
} from "../brain/namespace.ts";
import {
  ScarcitySelectionError,
  rankPassiveL0Candidates,
  type ScarcityCandidate,
} from "../brain/scarcity.ts";
import type { CheckpointOutcome } from "../git/checkpoint.ts";
import {
  encodeCompanion,
  encodeMarkdown,
  encodeScopeState,
  hashMarkdownContent,
  normalizeMarkdownInput,
  type LogicalMarkdownText,
} from "../persistence/codecs.ts";
import { persistentCoreRef, type ResourceMutation } from "../persistence/cognition-state-store.ts";
import type {
  AuxiliaryUpdateOutcome,
  AuxiliaryUpdateRequest,
  SemanticOperationRequest,
} from "../persistence/operation-coordination.ts";
import {
  renderAnchorCandidateItem,
  renderAnchorContext,
  type AnchorCandidateProjection,
  type AnchorCoreProjection,
  type AnchorProjection,
} from "./anchor-renderer.ts";

export const L0_MAX_CANDIDATES = 10;
export const L0_CANDIDATE_ITEMS_MAX_RENDERED_UTF8_BYTES = 8192;

export interface AnchorRequest {
  readonly currentSessionId?: SessionId;
}

export interface AnchorDiagnostic {
  readonly kind:
    | "archival-item-skipped"
    | "auxiliary-learning-degraded"
    | "history-checkpoint-degraded";
  readonly path?: LogicalArchivalPath;
  readonly message: string;
}

export interface AnchorResult {
  readonly context: string;
  readonly diagnostics: readonly AnchorDiagnostic[];
}

export interface AnchorScopeSnapshot {
  readonly scope: ScopeRef;
  readonly core: CoreDocument;
  readonly cycle: ScopeCycleState;
  readonly cycleWasFresh: boolean;
}

export interface AnchorArchivalSnapshot {
  readonly path: LogicalArchivalPath;
  readonly document: ArchivalDocument;
  readonly epistemic: EpistemicState;
  readonly accessibility: AccessibilityPersistenceState;
  readonly companionState?: "persisted" | "fresh";
}

export interface AnchorArchivalListing {
  readonly items: readonly AnchorArchivalSnapshot[];
  readonly diagnostics: readonly AnchorDiagnostic[];
}

export interface AnchorPersistencePort {
  loadScope(scope: ScopeRef): Promise<AnchorScopeSnapshot | undefined>;
  listArchival(scope: ScopeRef): Promise<AnchorArchivalListing>;
  loadArchival(path: LogicalArchivalPath): Promise<AnchorArchivalSnapshot | undefined>;
  putScopeCycle(scope: ScopeRef, bytes: Uint8Array): Promise<void>;
  putCompanion(path: LogicalArchivalPath, bytes: Uint8Array): Promise<void>;
}

export interface AnchorOperationPort {
  runSemanticOperation<T>(request: SemanticOperationRequest<T>): Promise<T>;
  tryApplyAuxiliaryUpdate(request: AuxiliaryUpdateRequest): Promise<AuxiliaryUpdateOutcome>;
}

export interface AnchorCheckpointPort {
  checkpointWorkspace(): Promise<CheckpointOutcome>;
}

export type AnchorStateInvariantErrorCode = "required-core-unavailable" | "duplicate-archival-path";

export class AnchorStateInvariantError extends Error {
  readonly code: AnchorStateInvariantErrorCode;

  constructor(code: AnchorStateInvariantErrorCode, options?: { cause?: unknown }) {
    super(`brain anchor state failed: ${code}`, options);
    this.name = "AnchorStateInvariantError";
    this.code = code;
  }
}

function scopeKey(scope: ScopeRef): string {
  return scope.kind === "session" ? `session:${scope.sessionId}` : scope.kind;
}

function sameScope(a: ScopeRef, b: ScopeRef): boolean {
  return scopeKey(a) === scopeKey(b);
}

export function applicableScopes(request: AnchorRequest): readonly ScopeRef[] {
  const scopes: ScopeRef[] = [{ kind: "global" }, { kind: "project" }];
  if (request.currentSessionId !== undefined) {
    scopes.push({ kind: "session", sessionId: request.currentSessionId });
  }
  return scopes;
}

function corePath(scope: ScopeRef): LogicalCorePath {
  return { kind: "core", scope };
}

interface RankedAnchorValue {
  readonly projection: AnchorCandidateProjection;
  readonly snapshot: AnchorArchivalSnapshot;
}

const encoder = new TextEncoder();

export class AnchorRestore {
  constructor(
    private readonly state: AnchorPersistencePort,
    private readonly operations: AnchorOperationPort,
    private readonly checkpoint: AnchorCheckpointPort,
  ) {}

  async runAnchor(request: AnchorRequest): Promise<AnchorResult> {
    const scopes = applicableScopes(request);
    if (request.currentSessionId !== undefined) {
      await this.ensureSessionCore({ kind: "session", sessionId: request.currentSessionId });
    }

    const scopeSnapshots = new Map<string, AnchorScopeSnapshot>();
    const advancedCycles = new Map<string, ScopeCycleState>();
    const cores: AnchorCoreProjection[] = [];
    const pool: Array<ScarcityCandidate<RankedAnchorValue>> = [];
    const diagnostics: AnchorDiagnostic[] = [];
    const canonicalSeen = new Set<string>();

    for (const scope of scopes) {
      const snapshot = await this.state.loadScope(scope);
      if (snapshot === undefined) throw new AnchorStateInvariantError("required-core-unavailable");
      scopeSnapshots.set(scopeKey(scope), snapshot);
      const advanced = advanceScopeCycle(snapshot.cycle);
      advancedCycles.set(scopeKey(scope), advanced);
      cores.push({ scope, path: corePath(scope), text: snapshot.core.text as LogicalMarkdownText });

      const listing = await this.state.listArchival(scope);
      diagnostics.push(...listing.diagnostics);
      for (const item of listing.items) {
        const canonical = formatPublicPath(item.path);
        if (canonicalSeen.has(canonical)) {
          throw new AnchorStateInvariantError("duplicate-archival-path");
        }
        canonicalSeen.add(canonical);
        const status = deriveEpistemicStatus(item.epistemic);
        const projection: AnchorCandidateProjection = {
          path: item.path,
          summary: item.document.summary,
          ...(status === "questioned" ? { status: "questioned" as const } : {}),
        };
        pool.push({
          path: item.path,
          importance: item.document.importance,
          epistemicStatus: status,
          accessibility: projectAccessibility(advanced, item.accessibility),
          exposure: item.accessibility.exposure,
          value: { projection, snapshot: item },
        });
      }
    }

    let ranked: readonly ScarcityCandidate<RankedAnchorValue>[];
    try {
      ranked = rankPassiveL0Candidates(pool);
    } catch (error) {
      if (error instanceof ScarcitySelectionError && error.code === "duplicate-candidate-path") {
        throw new AnchorStateInvariantError("duplicate-archival-path", { cause: error });
      }
      throw error;
    }

    const shown: RankedAnchorValue[] = [];
    let usedBytes = 0;
    for (const candidate of ranked) {
      if (shown.length >= L0_MAX_CANDIDATES) break;
      const rendered = renderAnchorCandidateItem(candidate.value.projection);
      const itemBytes = encoder.encode(rendered).byteLength;
      if (itemBytes > L0_CANDIDATE_ITEMS_MAX_RENDERED_UTF8_BYTES) continue;
      if (usedBytes + itemBytes > L0_CANDIDATE_ITEMS_MAX_RENDERED_UTF8_BYTES) break;
      shown.push(candidate.value);
      usedBytes += itemBytes;
    }

    const projection: AnchorProjection = {
      ...(request.currentSessionId === undefined
        ? {}
        : { currentSessionId: request.currentSessionId }),
      cores,
      candidates: shown.map((item) => item.projection),
    };
    const context = renderAnchorContext(projection);

    for (const scope of scopes) {
      const shownInScope = shown.filter((item) => sameScope(item.snapshot.path.scope, scope));
      const outcome = await this.operations.tryApplyAuxiliaryUpdate({
        scopes: [scope],
        deriveAndApply: async () => {
          const currentScope = await this.state.loadScope(scope);
          if (currentScope === undefined) {
            throw new AnchorStateInvariantError("required-core-unavailable");
          }
          const advanced = advanceScopeCycle(currentScope.cycle);
          await this.state.putScopeCycle(scope, encodeScopeState(advanced));

          for (const shownItem of shownInScope) {
            const current = await this.state.loadArchival(shownItem.snapshot.path);
            if (current === undefined) continue;
            const accessibility = applyPassiveExposure(advanced, current.accessibility);
            await this.state.putCompanion(
              current.path,
              encodeCompanion({
                contentHash: hashMarkdownContent(current.document.text),
                epistemic: current.epistemic,
                accessibility,
              }),
            );
          }
        },
      });
      if (outcome.kind === "degraded") {
        diagnostics.push({
          kind: "auxiliary-learning-degraded",
          message: outcome.diagnostic.message,
        });
      }
    }

    const checkpoint = await this.checkpoint.checkpointWorkspace();
    if (checkpoint.kind === "failed" || checkpoint.kind === "unavailable") {
      diagnostics.push({
        kind: "history-checkpoint-degraded",
        message: checkpoint.diagnostic.message,
      });
    }

    return { context, diagnostics };
  }

  private async ensureSessionCore(scope: Extract<ScopeRef, { kind: "session" }>): Promise<void> {
    if ((await this.state.loadScope(scope)) !== undefined) return;
    await this.operations.runSemanticOperation({
      name: "anchor-fresh-session-core",
      scopes: [scope],
      derive: async () => {
        if ((await this.state.loadScope(scope)) !== undefined) {
          return { kind: "no-change", result: undefined };
        }
        const mutations: ResourceMutation[] = [
          {
            kind: "put",
            ref: persistentCoreRef(scope),
            bytes: encodeMarkdown(normalizeMarkdownInput("")),
          },
        ];
        return { kind: "change", mutations, result: undefined };
      },
    });
    if ((await this.state.loadScope(scope)) === undefined) {
      throw new AnchorStateInvariantError("required-core-unavailable");
    }
  }
}
