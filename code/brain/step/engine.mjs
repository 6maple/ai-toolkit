import { inputSchema } from "./schema.mjs";
import { taskView } from "./views.mjs";

export async function executeStep(raw) {
  const request = inputSchema.safeParse(raw);
  if (!request.success) {
    throw new Error(
      request.error.issues
        .map((issue) => `${issue.path.join(".") || "参数"}：${issue.message}`)
        .join("\n"),
    );
  }
  return taskView(request.data.action);
}
