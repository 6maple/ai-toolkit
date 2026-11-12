import { readFile } from "node:fs/promises";
import { z } from "zod";

export const definition = JSON.parse(
  (await readFile(new URL("./guidance/tool-definition.json", import.meta.url), "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);

export const turnIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const inputSchema = z.strictObject({
  action: z
    .enum(["start", "submit_work", "submit_review", "confirm_review", "update", "read"])
    .describe("本次操作；根据当前收到的 Markdown 任务选择。"),
  turnId: z.string().regex(turnIdPattern).optional()
    .describe("本轮工具返回的 turnId。新轮 start 时省略，续作时传回原值。"),
  message: z.string().min(1).optional().describe("仅 start：本轮用户原消息。"),
  result: z
    .string()
    .optional()
    .describe("仅 submit_xx：本次工作完整成果；检视与确认时仅填写有依据的实际问题。"),
  edits: z
    .array(
      z.strictObject({
        old_text: z.string().min(1),
        new_text: z.string(),
      }),
    )
    .min(1)
    .optional()
    .describe("仅 update：对 State 中已有正文作准确替换。"),
});
