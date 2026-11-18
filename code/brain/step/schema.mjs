import { readFile } from "node:fs/promises";
import { z } from "zod";

export const definition = JSON.parse(
  (await readFile(new URL("./guidance/tool-definition.json", import.meta.url), "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);

export const inputSchema = z.strictObject({
  action: z
    .enum(["start", "ready", "review"])
    .describe("选择当前步骤完成后需要取得的下一份 Brain 提示词。"),
  thought: z
    .string()
    .trim()
    .min(1)
    .describe("本步骤实际形成的认知。"),
});
