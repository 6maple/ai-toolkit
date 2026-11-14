import { readFile } from "node:fs/promises";
import { z } from "zod";

export const definition = JSON.parse(
  (await readFile(new URL("./guidance/tool-definition.json", import.meta.url), "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);

export const inputSchema = z.strictObject({
  action: z.enum(["start", "ready", "review"]).describe("在完成当前步骤要求后，选择下一项固定 Brain Step 提示词。"),
});
