import path from "node:path";

import type { StorageBinding } from "../persistence/storage.ts";
import { nodeRepositoryFs, type GitCommandRunner, type RepositoryFs } from "./repository.ts";

export interface GitHistoryDiagnostic {
  readonly code:
    | "cli-unavailable"
    | "repo-init-failed"
    | "repository-root-mismatch"
    | "stage-failed"
    | "commit-failed"
    | "git-operation-failed";
  readonly message: string;
}

export type CheckpointOutcome =
  | { readonly kind: "committed" }
  | { readonly kind: "no-change" }
  | { readonly kind: "unavailable"; readonly diagnostic: GitHistoryDiagnostic }
  | { readonly kind: "failed"; readonly diagnostic: GitHistoryDiagnostic };

export type PrepareHistoryOutcome =
  | { readonly kind: "available" }
  | { readonly kind: "unavailable"; readonly diagnostic: GitHistoryDiagnostic }
  | { readonly kind: "failed"; readonly diagnostic: GitHistoryDiagnostic };

export const CHECKPOINT_IDENTITY = {
  name: "brain",
  email: "brain@local",
  message: "brain: cognition checkpoint",
} as const;

function normalizeComparisonPath(value: string, platform: StorageBinding["platform"]): string {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const resolved = pathApi.resolve(value.trim());
  if (platform === "win32" && /^[A-Za-z]:\\/.test(resolved)) {
    return `${resolved[0]!.toUpperCase()}${resolved.slice(1)}`;
  }
  return resolved;
}

export class GitCheckpoint {
  constructor(
    private readonly binding: StorageBinding,
    private readonly runner: GitCommandRunner,
    private readonly fs: RepositoryFs = nodeRepositoryFs,
  ) {}

  async prepareRepository(): Promise<PrepareHistoryOutcome> {
    const pathApi = this.binding.platform === "win32" ? path.win32 : path.posix;
    const gitPath = pathApi.join(this.binding.brainRoot, ".git");

    let exists: boolean;
    try {
      exists = await this.fs.exists(gitPath);
    } catch {
      return {
        kind: "failed",
        diagnostic: {
          code: "git-operation-failed",
          message: "Git history repository could not be inspected",
        },
      };
    }

    if (!exists) {
      let initialized;
      try {
        initialized = await this.runner.run(["init"]);
      } catch {
        return {
          kind: "unavailable",
          diagnostic: { code: "cli-unavailable", message: "Git history is unavailable" },
        };
      }
      if (initialized.exitCode !== 0) {
        return {
          kind: "unavailable",
          diagnostic: {
            code: "repo-init-failed",
            message: "Git history repository was not initialized",
          },
        };
      }
    }

    let top;
    try {
      top = await this.runner.run(["rev-parse", "--show-toplevel"]);
    } catch {
      return {
        kind: "unavailable",
        diagnostic: { code: "cli-unavailable", message: "Git history is unavailable" },
      };
    }
    if (
      top.exitCode !== 0 ||
      normalizeComparisonPath(top.stdout, this.binding.platform) !==
        normalizeComparisonPath(this.binding.brainRoot, this.binding.platform)
    ) {
      return {
        kind: "failed",
        diagnostic: {
          code: "repository-root-mismatch",
          message: "Git history does not own the configured brain workspace",
        },
      };
    }
    return { kind: "available" };
  }

  async checkpointWorkspace(): Promise<CheckpointOutcome> {
    const prepared = await this.prepareRepository();
    if (prepared.kind !== "available") return prepared;

    let staged;
    try {
      staged = await this.runner.run(["add", "-A", "--", "global", "projects"]);
    } catch {
      return {
        kind: "unavailable",
        diagnostic: { code: "cli-unavailable", message: "Git history checkpoint was not recorded" },
      };
    }
    if (staged.exitCode !== 0) {
      return {
        kind: "failed",
        diagnostic: { code: "stage-failed", message: "Git history checkpoint was not recorded" },
      };
    }

    let diff;
    try {
      diff = await this.runner.run(["diff", "--cached", "--quiet", "--exit-code"]);
    } catch {
      return {
        kind: "unavailable",
        diagnostic: { code: "cli-unavailable", message: "Git history checkpoint was not recorded" },
      };
    }
    if (diff.exitCode === 0) return { kind: "no-change" };
    if (diff.exitCode !== 1) {
      return {
        kind: "failed",
        diagnostic: {
          code: "git-operation-failed",
          message: "Git history checkpoint was not recorded",
        },
      };
    }

    let committed;
    try {
      committed = await this.runner.run([
        "-c",
        `user.name=${CHECKPOINT_IDENTITY.name}`,
        "-c",
        `user.email=${CHECKPOINT_IDENTITY.email}`,
        "-c",
        "commit.gpgSign=false",
        "commit",
        "--no-verify",
        "-m",
        CHECKPOINT_IDENTITY.message,
      ]);
    } catch {
      return {
        kind: "unavailable",
        diagnostic: { code: "cli-unavailable", message: "Git history checkpoint was not recorded" },
      };
    }
    if (committed.exitCode !== 0) {
      return {
        kind: "failed",
        diagnostic: { code: "commit-failed", message: "Git history checkpoint was not recorded" },
      };
    }
    return { kind: "committed" };
  }
}
