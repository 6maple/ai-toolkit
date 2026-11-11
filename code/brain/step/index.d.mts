/// <reference types="node" />
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

/** Trusted host identity. The model does not supply these identifiers. */
export interface BrainStepHost {
  readonly conversationId: string;
  readonly turnId: string;
  readonly sourceRoot: string;
}

export interface BrainStepRuntime {
  execute(raw: unknown): Promise<string>;
}

export type BrainStepFileSystem = Pick<
  typeof import("node:fs/promises"),
  "readFile" | "mkdir" | "writeFile" | "rename" | "rm"
>;

export function statePathFor(host: BrainStepHost): string;
export function createFileRuntime(options: {
  resolveHost(extra: unknown): BrainStepHost | Promise<BrainStepHost>;
  fileSystem?: BrainStepFileSystem;
}): (extra: unknown) => Promise<BrainStepRuntime>;
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
