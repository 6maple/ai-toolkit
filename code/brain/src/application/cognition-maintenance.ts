import {
  applyDirectEngagement,
  applyValidatedUse,
  createFreshAccessibilityState,
  initialScopeCycleState,
  rebaseAcrossScope,
  type AccessibilityPersistenceState,
  type ScopeCycleState,
} from "../brain/accessibility.ts";
import { parseArchivalDocument, validateCoreDocument } from "../brain/documents.ts";
import {
  activeEpistemicState,
  clearChallenge,
  setChallenge,
  type EpistemicState,
} from "../brain/epistemic.ts";
import {
  isSameLogicalPath,
  type LogicalArchivalPath,
  type LogicalBrainPath,
  type LogicalCorePath,
  type ScopeRef,
} from "../brain/namespace.ts";
import {
  encodeCompanion,
  encodeMarkdown,
  hashMarkdownContent,
  normalizeMarkdownInput,
} from "../persistence/codecs.ts";
import {
  persistentArchivalRef,
  persistentCompanionRef,
  persistentCoreRef,
  type MaintenanceStatePort,
  type MaterializedScopeSnapshot,
  type ResourceMutation,
} from "../persistence/cognition-state-store.ts";
import type {
  AuxiliaryUpdateOutcome,
  AuxiliaryUpdateRequest,
  SemanticOperationRequest,
} from "../persistence/operation-coordination.ts";
import { applyExactEdits, ExactEditError, type ExactEdit } from "./exact-edits.ts";

export type MaintenanceInputErrorCode =
  | "edit-mode"
  | "empty-edits"
  | "empty-old-text"
  | "old-text-not-found"
  | "old-text-not-unique"
  | "overlapping-edits"
  | "same-source-destination"
  | "question-challenge-required";

export class MaintenanceInputError extends Error {
  readonly code: MaintenanceInputErrorCode;

  constructor(code: MaintenanceInputErrorCode, options?: { cause?: unknown }) {
    super(`brain maintenance input failed: ${code}`, options);
    this.name = "MaintenanceInputError";
    this.code = code;
  }
}

export type MaintenanceTargetErrorCode =
  | "write-requires-archival"
  | "rm-requires-archival"
  | "feedback-requires-archival"
  | "mv-requires-archival-source"
  | "mv-requires-archival-destination"
  | "target-not-found";

export class MaintenanceTargetError extends Error {
  readonly code: MaintenanceTargetErrorCode;

  constructor(code: MaintenanceTargetErrorCode) {
    super(`brain maintenance target failed: ${code}`);
    this.name = "MaintenanceTargetError";
    this.code = code;
  }
}

export class MaintenanceStateInvariantError extends Error {
  readonly code = "required-runtime-core-uninitialized" as const;

  constructor() {
    super("brain runtime-required core is uninitialized");
    this.name = "MaintenanceStateInvariantError";
  }
}

export type MaintenanceResult =
  | { readonly action: "created"; readonly path: LogicalArchivalPath }
  | { readonly action: "overwrote"; readonly path: LogicalArchivalPath }
  | {
      readonly action: "edited";
      readonly path: LogicalCorePath | LogicalArchivalPath;
      readonly changed: boolean;
    }
  | {
      readonly action: "moved";
      readonly from: LogicalArchivalPath;
      readonly to: LogicalArchivalPath;
      readonly replacedExistingDestination: boolean;
    }
  | { readonly action: "removed"; readonly path: LogicalArchivalPath }
  | { readonly action: "adopted"; readonly path: LogicalArchivalPath }
  | { readonly action: "questioned"; readonly path: LogicalArchivalPath; readonly changed: boolean }
  | { readonly action: "resolved"; readonly path: LogicalArchivalPath };

export type FeedbackKind = "adopt" | "question" | "resolve";

export interface EditRequest {
  readonly path: LogicalCorePath | LogicalArchivalPath;
  readonly edits?: readonly ExactEdit[];
  readonly content?: string;
}

export interface ResolvedMaintenanceTarget {
  readonly requested: LogicalBrainPath;
  readonly path: LogicalBrainPath;
  readonly aliasFollowed: boolean;
}

export interface MaintenancePersistencePort extends MaintenanceStatePort {
  resolveExisting(path: LogicalBrainPath): Promise<ResolvedMaintenanceTarget>;
  resolveCreateTarget(path: LogicalBrainPath): Promise<ResolvedMaintenanceTarget>;
  deleteCompanion(path: LogicalArchivalPath): Promise<void>;
}

export interface MaintenanceOperationPort {
  runSemanticOperation<T>(request: SemanticOperationRequest<T>): Promise<T>;
  tryApplyAuxiliaryUpdate(request: AuxiliaryUpdateRequest): Promise<AuxiliaryUpdateOutcome>;
}

interface TargetScopePreparation {
  readonly scopeState: ScopeCycleState;
  readonly requiredInitMutations: readonly ResourceMutation[];
  readonly wasInitialized: boolean;
}

function sameScopeRef(a: ScopeRef, b: ScopeRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "session" && b.kind === "session") return a.sessionId === b.sessionId;
  return true;
}

function accessibilityEqual(
  a: AccessibilityPersistenceState,
  b: AccessibilityPersistenceState,
): boolean {
  return (
    a.ageCycles === b.ageCycles &&
    a.anchorCycle === b.anchorCycle &&
    a.durability === b.durability &&
    a.exposure === b.exposure
  );
}

function epistemicEqual(a: EpistemicState, b: EpistemicState): boolean {
  return a.challenge === b.challenge;
}

function scopeOrderKey(scope: ScopeRef): string {
  switch (scope.kind) {
    case "global":
      return "0";
    case "project":
      return "1";
    case "session":
      return `2:${scope.sessionId}`;
  }
}

function uniqueOrderedScopes(scopes: readonly ScopeRef[]): readonly ScopeRef[] {
  const unique: ScopeRef[] = [];
  for (const scope of scopes) {
    if (!unique.some((candidate) => sameScopeRef(candidate, scope))) unique.push(scope);
  }
  return unique.sort((a, b) => {
    const left = scopeOrderKey(a);
    const right = scopeOrderKey(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function mapExactEditError(error: unknown): never {
  if (error instanceof ExactEditError) {
    throw new MaintenanceInputError(error.code, { cause: error });
  }
  throw error;
}

function deriveEditedText(
  current: string,
  edits: readonly ExactEdit[] | undefined,
  content: string | undefined,
): string {
  if ((edits === undefined) === (content === undefined)) {
    throw new MaintenanceInputError("edit-mode");
  }
  if (content !== undefined) return content;
  try {
    return applyExactEdits(current, edits!);
  } catch (error) {
    return mapExactEditError(error);
  }
}

function requireArchivalKind(
  path: LogicalBrainPath,
  code: Extract<
    MaintenanceTargetErrorCode,
    | "write-requires-archival"
    | "rm-requires-archival"
    | "feedback-requires-archival"
    | "mv-requires-archival-source"
    | "mv-requires-archival-destination"
  >,
): LogicalArchivalPath {
  if (path.kind !== "archival") throw new MaintenanceTargetError(code);
  return path;
}

export class CognitionMaintenance {
  constructor(
    private readonly persistence: MaintenancePersistencePort,
    private readonly operations: MaintenanceOperationPort,
  ) {}

  async write(requestedPath: LogicalBrainPath, content: string): Promise<MaintenanceResult> {
    requireArchivalKind(requestedPath, "write-requires-archival");
    const normalized = normalizeMarkdownInput(content);
    const document = parseArchivalDocument(normalized);
    const documentBytes = encodeMarkdown(document.text);

    return this.operations.runSemanticOperation({
      name: "brain-write",
      scopes: [requestedPath.scope],
      derive: async () => {
        const targetScope = await this.prepareTargetScope(requestedPath.scope);
        const resolved = await this.persistence.resolveCreateTarget(requestedPath);
        const path = requireArchivalKind(resolved.path, "write-requires-archival");
        const current = targetScope.wasInitialized
          ? undefined
          : await this.persistence.loadArchival(path);
        const epistemic = activeEpistemicState();
        const accessibility = createFreshAccessibilityState(targetScope.scopeState);
        const action = current === undefined ? "created" : "overwrote";
        const result: MaintenanceResult = { action, path };
        const mutations: ResourceMutation[] = [...targetScope.requiredInitMutations];

        if (current === undefined || current.document.text !== document.text) {
          mutations.push({ kind: "put", ref: persistentArchivalRef(path), bytes: documentBytes });
        }

        // A created target always gets an explicit fresh companion so any orphan
        // state at the address cannot reattach. An overwrite only rewrites it
        // when the current hydrated state is not already exactly fresh.
        if (
          current === undefined ||
          !epistemicEqual(current.epistemic, epistemic) ||
          !accessibilityEqual(current.accessibility, accessibility)
        ) {
          mutations.push({
            kind: "put",
            ref: persistentCompanionRef(path),
            bytes: encodeCompanion({
              contentHash: hashMarkdownContent(document.text),
              epistemic,
              accessibility,
            }),
          });
        } else if (current.document.text !== document.text) {
          // Same domain C2/D1 values still need a content-hash rebind after the
          // replacement Markdown changes.
          mutations.push({
            kind: "put",
            ref: persistentCompanionRef(path),
            bytes: encodeCompanion({
              contentHash: hashMarkdownContent(document.text),
              epistemic,
              accessibility,
            }),
          });
        }

        return mutations.length === 0
          ? { kind: "no-change", result }
          : { kind: "change", mutations, result };
      },
    });
  }

  async edit(request: EditRequest): Promise<MaintenanceResult> {
    if ((request.edits === undefined) === (request.content === undefined)) {
      throw new MaintenanceInputError("edit-mode");
    }
    if (request.edits !== undefined && request.edits.length === 0) {
      throw new MaintenanceInputError("empty-edits");
    }

    return this.operations.runSemanticOperation({
      name: "brain-edit",
      scopes: [request.path.scope],
      derive: async () => {
        const resolved = await this.persistence.resolveExisting(request.path);
        const path = resolved.path;
        const scope = await this.requireScope(path.scope);

        if (path.kind === "core") {
          const raw = deriveEditedText(scope.core.text, request.edits, request.content);
          const next = validateCoreDocument(normalizeMarkdownInput(raw));
          const changed = next.text !== scope.core.text;
          const result: MaintenanceResult = { action: "edited", path, changed };
          return changed
            ? {
                kind: "change",
                mutations: [
                  {
                    kind: "put",
                    ref: persistentCoreRef(path.scope),
                    bytes: encodeMarkdown(next.text),
                  },
                ],
                result,
              }
            : { kind: "no-change", result };
        }

        const archivalPath = requireArchivalKind(path, "write-requires-archival");
        const current = await this.requireArchival(archivalPath);
        const raw = deriveEditedText(current.document.text, request.edits, request.content);
        const nextDocument = parseArchivalDocument(normalizeMarkdownInput(raw));
        const changed = nextDocument.text !== current.document.text;
        const result: MaintenanceResult = { action: "edited", path: archivalPath, changed };
        if (!changed) return { kind: "no-change", result };

        const nextAccessibility = applyDirectEngagement(scope.cycle, current.accessibility);
        return {
          kind: "change",
          mutations: [
            {
              kind: "put",
              ref: persistentArchivalRef(archivalPath),
              bytes: encodeMarkdown(nextDocument.text),
            },
            {
              kind: "put",
              ref: persistentCompanionRef(archivalPath),
              bytes: encodeCompanion({
                contentHash: hashMarkdownContent(nextDocument.text),
                epistemic: current.epistemic,
                accessibility: nextAccessibility,
              }),
            },
          ],
          result,
        };
      },
    });
  }

  async move(
    requestedSrc: LogicalBrainPath,
    requestedDst: LogicalBrainPath,
  ): Promise<MaintenanceResult> {
    requireArchivalKind(requestedSrc, "mv-requires-archival-source");
    requireArchivalKind(requestedDst, "mv-requires-archival-destination");

    const result = await this.operations.runSemanticOperation({
      name: "brain-mv",
      scopes: uniqueOrderedScopes([requestedSrc.scope, requestedDst.scope]),
      derive: async () => {
        const [resolvedSrc, resolvedDst] = await Promise.all([
          this.persistence.resolveExisting(requestedSrc),
          this.persistence.resolveCreateTarget(requestedDst),
        ]);
        const src = requireArchivalKind(resolvedSrc.path, "mv-requires-archival-source");
        const dst = requireArchivalKind(resolvedDst.path, "mv-requires-archival-destination");
        if (isSameLogicalPath(src, dst)) {
          throw new MaintenanceInputError("same-source-destination");
        }

        const sourceScope = await this.requireScope(src.scope);
        const source = await this.requireArchival(src);
        const target = sameScopeRef(src.scope, dst.scope)
          ? {
              scopeState: sourceScope.cycle,
              requiredInitMutations: [] as readonly ResourceMutation[],
              wasInitialized: false,
            }
          : await this.prepareTargetScope(dst.scope);
        const destination = target.wasInitialized
          ? undefined
          : await this.persistence.loadArchival(dst);
        const accessibility = sameScopeRef(src.scope, dst.scope)
          ? applyDirectEngagement(sourceScope.cycle, source.accessibility)
          : rebaseAcrossScope(sourceScope.cycle, target.scopeState, source.accessibility);

        return {
          kind: "change",
          mutations: [
            ...target.requiredInitMutations,
            {
              kind: "put",
              ref: persistentArchivalRef(dst),
              bytes: encodeMarkdown(source.document.text),
            },
            {
              kind: "put",
              ref: persistentCompanionRef(dst),
              bytes: encodeCompanion({
                contentHash: hashMarkdownContent(source.document.text),
                epistemic: source.epistemic,
                accessibility,
              }),
            },
            { kind: "delete", ref: persistentArchivalRef(src) },
          ],
          result: {
            action: "moved",
            from: src,
            to: dst,
            replacedExistingDestination: destination !== undefined,
          } satisfies MaintenanceResult,
        };
      },
    });

    if (result.action === "moved") {
      await this.operations.tryApplyAuxiliaryUpdate({
        scopes: [result.from.scope],
        deriveAndApply: () => this.persistence.deleteCompanion(result.from),
      });
    }
    return result;
  }

  async remove(requestedPath: LogicalBrainPath): Promise<MaintenanceResult> {
    requireArchivalKind(requestedPath, "rm-requires-archival");
    const result = await this.operations.runSemanticOperation({
      name: "brain-rm",
      scopes: [requestedPath.scope],
      derive: async () => {
        const resolved = await this.persistence.resolveExisting(requestedPath);
        const path = requireArchivalKind(resolved.path, "rm-requires-archival");
        await this.requireScope(path.scope);
        await this.requireArchival(path);
        return {
          kind: "change",
          mutations: [{ kind: "delete", ref: persistentArchivalRef(path) }],
          result: { action: "removed", path } satisfies MaintenanceResult,
        };
      },
    });

    if (result.action === "removed") {
      await this.operations.tryApplyAuxiliaryUpdate({
        scopes: [result.path.scope],
        deriveAndApply: () => this.persistence.deleteCompanion(result.path),
      });
    }
    return result;
  }

  async feedback(
    requestedPath: LogicalBrainPath,
    feedback: FeedbackKind,
    challenge?: string,
  ): Promise<MaintenanceResult> {
    requireArchivalKind(requestedPath, "feedback-requires-archival");
    if (feedback === "question" && challenge === undefined) {
      throw new MaintenanceInputError("question-challenge-required");
    }

    return this.operations.runSemanticOperation({
      name: "brain-feedback",
      scopes: [requestedPath.scope],
      derive: async () => {
        const resolved = await this.persistence.resolveExisting(requestedPath);
        const path = requireArchivalKind(resolved.path, "feedback-requires-archival");
        const scope = await this.requireScope(path.scope);
        const current = await this.requireArchival(path);
        let epistemic = current.epistemic;
        let accessibility = current.accessibility;
        let result: MaintenanceResult;

        switch (feedback) {
          case "adopt":
            accessibility = applyValidatedUse(scope.cycle, current.accessibility);
            result = { action: "adopted", path };
            break;
          case "question":
            epistemic = setChallenge(current.epistemic, challenge!);
            accessibility = applyDirectEngagement(scope.cycle, current.accessibility);
            result = { action: "questioned", path, changed: true };
            break;
          case "resolve":
            epistemic = clearChallenge(current.epistemic);
            accessibility = applyDirectEngagement(scope.cycle, current.accessibility);
            result = { action: "resolved", path };
            break;
        }

        const changed =
          !epistemicEqual(epistemic, current.epistemic) ||
          !accessibilityEqual(accessibility, current.accessibility);
        if (result.action === "questioned") result = { ...result, changed };
        if (!changed) return { kind: "no-change", result };

        return {
          kind: "change",
          mutations: [
            {
              kind: "put",
              ref: persistentCompanionRef(path),
              bytes: encodeCompanion({
                contentHash: hashMarkdownContent(current.document.text),
                epistemic,
                accessibility,
              }),
            },
          ],
          result,
        };
      },
    });
  }

  private async prepareTargetScope(scope: ScopeRef): Promise<TargetScopePreparation> {
    const snapshot = await this.persistence.loadScope(scope);
    if (snapshot !== undefined) {
      return {
        scopeState: snapshot.cycle,
        requiredInitMutations: [],
        wasInitialized: false,
      };
    }
    if (scope.kind !== "session") throw new MaintenanceStateInvariantError();

    return {
      scopeState: initialScopeCycleState(),
      requiredInitMutations: [
        {
          kind: "put",
          ref: persistentCoreRef(scope),
          bytes: encodeMarkdown(normalizeMarkdownInput("")),
        },
      ],
      wasInitialized: true,
    };
  }

  private async requireScope(scope: ScopeRef): Promise<MaterializedScopeSnapshot> {
    const snapshot = await this.persistence.loadScope(scope);
    if (snapshot === undefined) throw new MaintenanceTargetError("target-not-found");
    return snapshot;
  }

  private async requireArchival(path: LogicalArchivalPath) {
    const snapshot = await this.persistence.loadArchival(path);
    if (snapshot === undefined) throw new MaintenanceTargetError("target-not-found");
    return snapshot;
  }
}
