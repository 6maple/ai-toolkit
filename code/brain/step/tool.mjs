import { definition, inputSchema } from "./schema.mjs";

export function stepResultContent({ turnId, text }) {
  return [
    { type: "text", text },
    { type: "text", text: `本轮 turnId: \`${turnId}\`` },
  ];
}

export function registerBrainStepTool(server, resolveRuntime) {
  return server.registerTool(
    "brain_step",
    { description: definition.description, inputSchema },
    async (raw, extra) => {
      try {
        const runtime = await resolveRuntime(extra);
        return { content: stepResultContent(await runtime.execute(raw)) };
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
