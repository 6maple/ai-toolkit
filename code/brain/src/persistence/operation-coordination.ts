import { createRequire } from "node:module";
import path from "node:path";

import type { ScopeRef } from "../brain/namespace.ts";
import type {
  PersistentResourcePort,
  PreparedPhysicalMutation,
  ResourceBeforeState,
  ResourceMutation,
} from "./cognition-state-store.ts";

const require = createRequire(import.meta.url);
const properLockfile = require("proper-lockfile") as {
  lock(
    file: string,
    options: {
      readonly lockfilePath: string;
      readonly retries: number;
      readonly stale: number;
      readonly update: number;
      readonly realpath: boolean;
      readonly onCompromised: (error: Error) => void;
    },
  ): Promise<() => Promise<void>>;
};

export type SemanticOperationName = string;

export type PreparedSemanticOperation<T> =
  | { readonly kind: "no-change"; readonly result: T }
  | {
      readonly kind: "change";
      readonly mutations: readonly ResourceMutation[];
      readonly result: T;
    };

export interface SemanticOperationRequest<T> {
  readonly name: SemanticOperationName;
  readonly scopes: readonly ScopeRef[];
  readonly signal?: AbortSignal;
  readonly derive: () => Promise<PreparedSemanticOperation<T>>;
}

export interface GlobalSemanticLeasePort {
  runExclusive<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T>;
}

export interface TechnicalDiagnostic {
  readonly code: string;
  readonly message: string;
}

export type AuxiliaryUpdateOutcome =
  | { readonly kind: "applied" }
  | { readonly kind: "degraded"; readonly diagnostic: TechnicalDiagnostic };

export interface AuxiliaryUpdateRequest {
  readonly scopes: readonly ScopeRef[];
  readonly deriveAndApply: () => Promise<void>;
}

export type SemanticOperationPlanErrorCode = "duplicate-resource" | "empty-change-plan";

export class SemanticOperationPlanError extends Error {
  readonly code: SemanticOperationPlanErrorCode;

  constructor(code: SemanticOperationPlanErrorCode) {
    super(`brain semantic operation plan failed: ${code}`);
    this.name = "SemanticOperationPlanError";
    this.code = code;
  }
}

export type CoordinationErrorCode = "global-coordination-unavailable" | "aborted";

export class CoordinationError extends Error {
  readonly code: CoordinationErrorCode;

  constructor(code: CoordinationErrorCode, options?: { cause?: unknown }) {
    super(`brain operation coordination failed: ${code}`, options);
    this.name = "CoordinationError";
    this.code = code;
  }
}

export type StoreInvariantErrorCode = "restore-failed";

export class StoreInvariantError extends Error {
  readonly code: StoreInvariantErrorCode;

  constructor(code: StoreInvariantErrorCode, options?: { cause?: unknown }) {
    super(`brain store invariant failed: ${code}`, options);
    this.name = "StoreInvariantError";
    this.code = code;
  }
}

interface Waiter {
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: unknown) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}

class ProcessSerialGate {
  private locked = false;
  private readonly waiters: Waiter[] = [];

  async run<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire(signal);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new CoordinationError("aborted"));
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve(() => this.releaseNext());
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new CoordinationError("aborted"));
      };
      (waiter as { onAbort?: () => void }).onAbort = onAbort;
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  private releaseNext(): void {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal?.aborted) continue;
      waiter.resolve(() => this.releaseNext());
      return;
    }
    this.locked = false;
  }
}

const GLOBAL_LOCK_STALE_MS = 10_000;
const GLOBAL_LOCK_UPDATE_MS = 5_000;
const GLOBAL_LOCK_MAX_ATTEMPTS = 12;
const GLOBAL_LOCK_RETRY_MS = 50;

export class FileGlobalSemanticLease implements GlobalSemanticLeasePort {
  private readonly lockPath: string;

  constructor(private readonly brainRoot: string) {
    this.lockPath = path.join(brainRoot, ".brain-global-semantic.lock");
  }

  async runExclusive<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire(signal);
    let result: T | undefined;
    let operationError: unknown;
    try {
      result = await operation();
    } catch (error) {
      operationError = error;
    }

    let releaseError: unknown;
    try {
      await release();
    } catch (error) {
      releaseError = error;
    }

    if (operationError !== undefined) throw operationError;
    if (releaseError !== undefined) {
      throw new CoordinationError("global-coordination-unavailable", { cause: releaseError });
    }
    return result as T;
  }

  private async acquire(signal?: AbortSignal): Promise<() => Promise<void>> {
    let lastError: unknown;
    for (let attempt = 0; attempt < GLOBAL_LOCK_MAX_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) throw new CoordinationError("aborted");
      let compromised: Error | undefined;
      try {
        const release = await properLockfile.lock(this.brainRoot, {
          lockfilePath: this.lockPath,
          retries: 0,
          stale: GLOBAL_LOCK_STALE_MS,
          update: GLOBAL_LOCK_UPDATE_MS,
          realpath: true,
          onCompromised: (error) => {
            compromised = error;
          },
        });
        return async () => {
          if (compromised) {
            throw new CoordinationError("global-coordination-unavailable", { cause: compromised });
          }
          await release();
        };
      } catch (error) {
        lastError = error;
        if (!isErrno(error, "ELOCKED")) break;
        if (attempt + 1 < GLOBAL_LOCK_MAX_ATTEMPTS) {
          await delayWithAbort(GLOBAL_LOCK_RETRY_MS, signal);
        }
      }
    }
    throw new CoordinationError("global-coordination-unavailable", { cause: lastError });
  }
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function delayWithAbort(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new CoordinationError("aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new CoordinationError("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function touchesGlobal(scopes: readonly ScopeRef[]): boolean {
  return scopes.some((scope) => scope.kind === "global");
}

interface PreparedEntry {
  readonly mutation: ResourceMutation;
  readonly prepared: PreparedPhysicalMutation;
  readonly before: ResourceBeforeState;
}

function comparePreparedEntry(a: PreparedEntry, b: PreparedEntry): number {
  if (a.mutation.kind !== b.mutation.kind) return a.mutation.kind === "put" ? -1 : 1;
  if (a.prepared.absolutePath < b.prepared.absolutePath) return -1;
  if (a.prepared.absolutePath > b.prepared.absolutePath) return 1;
  return 0;
}

function diagnosticForAuxiliaryFailure(error: unknown): TechnicalDiagnostic {
  if (error instanceof CoordinationError) {
    return {
      code: error.code,
      message: "auxiliary learning update was not recorded",
    };
  }
  if (error instanceof StoreInvariantError) {
    return {
      code: error.code,
      message:
        "auxiliary learning update was skipped because persistent state is not safely mutable",
    };
  }
  return {
    code: "auxiliary-update-failed",
    message: "auxiliary learning update was not recorded",
  };
}

export class PersistentOperationCoordinator {
  private readonly processGate = new ProcessSerialGate();
  private fatalStoreError: StoreInvariantError | undefined;

  constructor(
    private readonly resources: PersistentResourcePort,
    private readonly globalLease: GlobalSemanticLeasePort,
  ) {}

  runSemanticOperation<T>(request: SemanticOperationRequest<T>): Promise<T> {
    return this.processGate.run(request.signal, () =>
      this.withScopeCoordination(request.scopes, request.signal, () =>
        this.executeSemanticOperation(request),
      ),
    );
  }

  async tryApplyAuxiliaryUpdate(request: AuxiliaryUpdateRequest): Promise<AuxiliaryUpdateOutcome> {
    try {
      await this.processGate.run(undefined, () =>
        this.withScopeCoordination(request.scopes, undefined, request.deriveAndApply),
      );
      return { kind: "applied" };
    } catch (error) {
      return { kind: "degraded", diagnostic: diagnosticForAuxiliaryFailure(error) };
    }
  }

  private async withScopeCoordination<T>(
    scopes: readonly ScopeRef[],
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.fatalStoreError) throw this.fatalStoreError;
    if (signal?.aborted) throw new CoordinationError("aborted");
    return touchesGlobal(scopes) ? this.globalLease.runExclusive(signal, operation) : operation();
  }

  private async executeSemanticOperation<T>(request: SemanticOperationRequest<T>): Promise<T> {
    const plan = await request.derive();
    if (plan.kind === "no-change") return plan.result;
    if (plan.mutations.length === 0) throw new SemanticOperationPlanError("empty-change-plan");

    const preparedWithoutBefore: Array<{
      readonly mutation: ResourceMutation;
      readonly prepared: PreparedPhysicalMutation;
    }> = [];
    const seen = new Set<string>();
    for (const mutation of plan.mutations) {
      const prepared = await this.resources.preflight(mutation);
      if (seen.has(prepared.absolutePath)) {
        throw new SemanticOperationPlanError("duplicate-resource");
      }
      seen.add(prepared.absolutePath);
      preparedWithoutBefore.push({ mutation, prepared });
    }

    const entries: PreparedEntry[] = [];
    for (const entry of preparedWithoutBefore) {
      entries.push({ ...entry, before: await this.resources.readBefore(entry.prepared) });
    }
    entries.sort(comparePreparedEntry);

    if (request.signal?.aborted) throw new CoordinationError("aborted");

    let sideEffectStarted = false;
    try {
      for (const entry of entries) {
        sideEffectStarted = true;
        if (entry.mutation.kind === "put") {
          await this.resources.putWhole(entry.prepared, entry.mutation.bytes);
        } else {
          await this.resources.deleteFile(entry.prepared);
        }
      }
    } catch (error) {
      if (!sideEffectStarted) throw error;
      try {
        for (const entry of entries) {
          await this.resources.restoreBefore(entry.prepared, entry.before);
        }
      } catch (restoreError) {
        const invariant = new StoreInvariantError("restore-failed", { cause: restoreError });
        this.fatalStoreError = invariant;
        throw invariant;
      }
      throw error;
    }

    return plan.result;
  }
}
