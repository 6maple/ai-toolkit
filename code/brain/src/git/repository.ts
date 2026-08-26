import { spawn } from "node:child_process";
import { promises as fsPromises } from "node:fs";

export interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitCommandRunner {
  run(
    args: readonly string[],
    options?: { readonly stdin?: string | Uint8Array },
  ): Promise<GitCommandResult>;
}

export class SystemGitCommandRunner implements GitCommandRunner {
  constructor(private readonly brainRoot: string) {}

  run(
    args: readonly string[],
    options: { readonly stdin?: string | Uint8Array } = {},
  ): Promise<GitCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", [...args], {
        cwd: this.brainRoot,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GCM_INTERACTIVE: "Never",
        },
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => {
        resolve({
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
      if (options.stdin !== undefined) child.stdin.end(options.stdin);
      else child.stdin.end();
    });
  }
}

export interface RepositoryFs {
  exists(target: string): Promise<boolean>;
}

export const nodeRepositoryFs: RepositoryFs = {
  exists: async (target) => {
    try {
      await fsPromises.lstat(target);
      return true;
    } catch (error) {
      if (isErrno(error, "ENOENT")) return false;
      throw error;
    }
  },
};

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
