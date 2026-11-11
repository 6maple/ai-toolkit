// Pi owns the text matching and replacement behavior used by brain_step.update.
// Virtual file operations let the State runtime persist Markdown and JSON together.
import { createEditToolDefinition } from "@earendil-works/pi-coding-agent";

export async function editWithPi(content, edits) {
  let current = content;
  const tool = createEditToolDefinition(process.cwd(), {
    operations: {
      access: async () => {},
      readFile: async () => Buffer.from(current, "utf8"),
      writeFile: async (_target, value) => {
        current = value;
      },
    },
  });
  await tool.execute("brain:step-edit", {
    path: "state.md",
    edits: edits.map(({ old_text, new_text }) => ({ oldText: old_text, newText: new_text })),
  });
  return current;
}
