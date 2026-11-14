import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

export function executeStep(raw: unknown): string;
export const initialPrompt: string;
export function stepResultContent(text: string, warnings?: readonly string[]): Array<{ type: "text"; text: string }>;
export function registerBrainStep(server: Pick<McpServer, "registerTool">): RegisteredTool;
export const definition: {
  readonly name: "brain_step";
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
};
export const inputSchema: z.ZodType;
