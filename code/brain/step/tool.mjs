import { definition, inputSchema } from "./schema.mjs";
import { executeStep } from "./engine.mjs";

export function stepPromptForProject(text, sourceRoot) {
  return `当前项目：${sourceRoot.replaceAll("\\", "/")}\n\n${text}`;
}

export function stepResultContent(text, sourceRoot) {
  return [{ type: "text", text: stepPromptForProject(text, sourceRoot) }];
}

export function registerBrainStepTool(server, sourceRoot = process.cwd()) {
  return server.registerTool(
    "brain_step",
    { description: definition.description, inputSchema },
    async (raw) => {
      try {
        return { content: stepResultContent(await executeStep(raw), sourceRoot) };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : "无效的 Brain Step 动作。",
            },
          ],
        };
      }
    },
  );
}
