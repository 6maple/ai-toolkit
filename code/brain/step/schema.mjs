// Compile the reviewed public object schema without SDK-private hooks.
import { readFile } from "node:fs/promises";
import { z } from "zod";

export const definition = JSON.parse(
  (await readFile(new URL("./guidance/tool-definition.json", import.meta.url), "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);
const keep = "本次参数未应用。保留尚未保存的实际内容，修正后重新提交原动作。";
function compile(node, defs, location) {
  if (node.$ref) {
    const name = node.$ref.split("/").at(-1);
    if (!defs[name]) throw new Error("Unknown definition: " + name);
    // Use the effective reference description for validation errors as well as publication.
    return compile(
      node.description ? { ...defs[name], description: node.description } : defs[name],
      defs,
      location,
    );
  }
  const error = `${location}：${node.description ?? "按字段定义填写。"} ${keep}`;
  let value;
  if (node.enum)
    value = z.union(
      node.enum.map((item) => z.literal(item)),
      { error: `${location}允许值：${node.enum.join(" / ")}。${keep}` },
    );
  else if (Array.isArray(node.type))
    value = z.union(
      node.type.map((type) => compile({ ...node, type }, defs, location)),
      { error },
    );
  else if (node.type === "null") value = z.null({ error });
  else if (node.type === "string") value = z.string({ error }).min(node.minLength ?? 0, { error });
  else if (node.type === "array") {
    value = z.array(compile(node.items, defs, `${location}[]`), { error });
    if (node.minItems) value = value.min(node.minItems, { error });
  } else if (node.type === "object") {
    const shape = Object.fromEntries(
      Object.entries(node.properties ?? {}).map(([key, child]) => {
        const field = compile(child, defs, `${location}.${key}`);
        return [key, node.required?.includes(key) ? field : field.optional()];
      }),
    );
    value = z.strictObject(shape, {
      error: (issue) => {
        if (issue.code !== "unrecognized_keys") return error;
        return issue.keys
          .map((key) => {
            if (
              location === "请求" &&
              [
                "taskChanges",
                "pendingUserInput",
                ...Object.keys(definition.inputSchema.$defs.WorkUpdate.properties),
              ].includes(key)
            )
              return `${key}应放在updates.${key}。${keep}`;
            if (location === "请求" && key === "step")
              return `step不是本三阶段工具字段；submit使用当前返回的phase，不按旧步骤编号换算。${keep}`;
            if (location === "请求.updates" && key === "progress")
              return `updates不接受progress。仅action=update时，将progress放在请求顶层；action=submit不接受progress，先用独立update保存进展，再移除progress重交原submit。${keep}`;
            if (location === "请求.updates" && key === "impact")
              return `${key}应放在请求顶层，与updates并列。${keep}`;
            return `${location}不接受字段${key}；按当前字段说明保留实际内容并修正位置。${keep}`;
          })
          .join("\n");
      },
    });
  } else throw new Error("Unsupported reviewed schema type at " + location);
  return node.description ? value.describe(node.description) : value;
}
export const inputSchema = compile(definition.inputSchema, definition.inputSchema.$defs, "请求");
export const outputSchema = compile(definition.outputSchema, {}, "返回");
export const phaseIds = ["intent", "essence", "work"];
export const noteKeys = [
  "background",
  "intent",
  "scope",
  "analysis",
  "research",
  "method",
  "acceptance",
  "result",
  "replyDraft",
];
export const decisions = {
  intent: ["advance", "continue", "handoff"],
  essence: ["advance", "continue", "revisit_intent", "handoff"],
  work: ["continue", "revisit_intent", "revisit_essence", "review_execution", "finish", "handoff"],
};
