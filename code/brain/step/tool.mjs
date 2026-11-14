import { definition, inputSchema } from "./schema.mjs";
import { executeStep } from "./engine.mjs";

export function stepResultContent(text, warnings = []) {
  return [
    { type: "text", text },
    ...warnings.map((warning) => ({ type: "text", text: `warning: ${warning}` })),
  ];
}

export function registerBrainStepTool(server) {
  return server.registerTool(
    "brain_step",
    { description: definition.description, inputSchema },
    async (raw) => {
      try {
        return { content: stepResultContent(executeStep(raw)) };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "无效的 Brain Step 动作。",
          }],
        };
      }
    },
  );
}
