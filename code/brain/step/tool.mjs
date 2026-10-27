import { definition, inputSchema, outputSchema } from "./schema.mjs";

export function registerThreePhase(server, resolveRuntime) {
  return server.registerTool(
    "brain_step",
    { description: definition.description, inputSchema, outputSchema },
    async (raw, extra) => {
      try {
        const runtime = await resolveRuntime(extra);
        const output = await runtime.execute(raw);
        return {
          structuredContent: output,
          content: [{ type: "text", text: JSON.stringify(output) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                error instanceof Error
                  ? error.message
                  : "操作未正常完成；保存影响尚未确认，需按实际失败范围继续。",
            },
          ],
        };
      }
    },
  );
}
