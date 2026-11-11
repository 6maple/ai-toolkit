import { definition, inputSchema } from "./schema.mjs";

export function registerBrainStepTool(server, resolveRuntime) {
  return server.registerTool(
    "brain_step",
    { description: definition.description, inputSchema },
    async (raw, extra) => {
      try {
        const runtime = await resolveRuntime(extra);
        const markdown = await runtime.execute(raw);
        return { content: [{ type: "text", text: markdown }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : "操作失败；当前 State 未更改。",
            },
          ],
        };
      }
    },
  );
}
