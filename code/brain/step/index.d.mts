/// <reference types="node" />
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

/** Trusted host context; these identifiers are not model input fields. */
export interface BrainStepHost {
  readonly conversationId: string;
  readonly turnId: string;
  readonly sourceRoot: string;
}

export interface BrainStepOutput {
  readonly currentPhase: "intent" | "essence" | "work" | null;
  readonly guidance: string;
}

export interface BrainStepRuntime {
  execute(raw: unknown): Promise<BrainStepOutput>;
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
  readonly outputSchema: Readonly<Record<string, unknown>>;
};
export const inputSchema: z.ZodType;
export const outputSchema: z.ZodType;
