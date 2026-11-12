/// <reference types="node" />
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

export interface BrainStepWorkspace {
  readonly sourceRoot: string;
  readonly brainRoot?: string;
}

export interface BrainStepResult {
  readonly turnId: string;
  readonly text: string;
}

export interface BrainStepRuntime {
  execute(raw: unknown): Promise<BrainStepResult>;
}

export type BrainStepFileSystem = Pick<
  typeof import("node:fs/promises"),
  "readFile" | "stat" | "mkdir" | "writeFile" | "rename" | "rm"
>;

export function statePathFor(workspace: BrainStepWorkspace & { readonly turnId: string }): string;
export function createFileRuntime(options: BrainStepWorkspace & {
  fileSystem?: BrainStepFileSystem;
  onNewTurn?(): Promise<readonly string[]>;
}): BrainStepRuntime;
export function stepResultContent(result: BrainStepResult): Array<{ type: "text"; text: string }>;
export function registerBrainStep(
  server: Pick<McpServer, "registerTool">,
  resolveRuntime: (extra: unknown) => BrainStepRuntime | Promise<BrainStepRuntime>,
): RegisteredTool;
export const definition: {
  readonly name: "brain_step";
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
};
export const inputSchema: z.ZodType;
