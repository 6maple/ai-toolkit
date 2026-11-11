// Trusted host identity is supplied by the host, never by the model.
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { execute } from "./engine.mjs";

export function statePathFor(host) {
  if (
    typeof host?.conversationId !== "string" ||
    !host.conversationId.trim() ||
    typeof host?.turnId !== "string" ||
    !host.turnId.trim() ||
    typeof host?.sourceRoot !== "string" ||
    !path.isAbsolute(host.sourceRoot)
  )
    throw new Error(
      "宿主须提供真实 conversationId、turnId 和绝对 sourceRoot；没有可信身份，不修改 State。",
    );
  const key = createHash("sha256").update(host.conversationId).digest("hex");
  return path.join(host.sourceRoot, ".brain-working", "brain-step", key + ".json");
}

async function writeAtomically(fileSystem, file, text) {
  const temp = path.join(
    path.dirname(file),
    "." + path.basename(file) + "." + randomUUID() + ".tmp",
  );
  try {
    await fileSystem.writeFile(temp, text, { encoding: "utf8", flag: "wx" });
    await fileSystem.rename(temp, file);
  } catch (error) {
    await fileSystem.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

function markdownPath(jsonFile, contentFile) {
  const prefix = path.basename(jsonFile, ".json") + ".";
  if (
    typeof contentFile !== "string" ||
    !contentFile.startsWith(prefix) ||
    !/^[a-f0-9]{64}\.[a-f0-9-]{36}\.md$/.test(contentFile)
  )
    throw new Error("State JSON 引用了无效的 Markdown 文件名；未读取或修改任何文件。");
  return path.join(path.dirname(jsonFile), contentFile);
}

export function createFileRuntime({ resolveHost, fileSystem = fs }) {
  return async (extra) => {
    const host = await resolveHost(extra);
    const file = statePathFor(host);
    let previous;
    try {
      previous = JSON.parse((await fileSystem.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
    } catch (error) {
      if (error.code === "ENOENT") previous = null;
      else
        throw new Error(`无法读取本轮 State ${file}；未初始化或覆盖原记录。原因：${error.message}`);
    }
    if (previous?.state?.contentFile) {
      const markdownFile = markdownPath(file, previous.state.contentFile);
      try {
        previous.state.content = await fileSystem.readFile(markdownFile, "utf8");
      } catch (error) {
        throw new Error(
          `无法读取 State Markdown ${markdownFile}；未修改原记录。原因：${error.message}`,
        );
      }
    }
    return {
      execute: async (raw) => {
        const result = await execute(previous, host, raw);
        if (!result.changed) return result.output;

        const envelope = structuredClone(result.envelope);
        const oldMarkdown = previous?.state?.contentFile;
        const contentChanged =
          envelope.state.content !== previous?.state?.content ||
          !oldMarkdown ||
          previous?.turnId !== host.turnId;
        let newMarkdown;
        if (contentChanged) {
          newMarkdown = path.basename(file, ".json") + "." + randomUUID() + ".md";
          envelope.state.contentFile = newMarkdown;
        } else {
          envelope.state.contentFile = oldMarkdown;
        }
        delete envelope.state.content;

        try {
          await fileSystem.mkdir(path.dirname(file), { recursive: true });
          if (newMarkdown) {
            const newPath = markdownPath(file, newMarkdown);
            await writeAtomically(fileSystem, newPath, result.envelope.state.content);
          }
          await writeAtomically(fileSystem, file, JSON.stringify(envelope, null, 2) + "\n");
        } catch (error) {
          if (newMarkdown) {
            await fileSystem.rm(markdownPath(file, newMarkdown), { force: true }).catch(() => {});
          }
          throw new Error(
            `State 未能持久保存；未返回保存成功。文件：${file}。原因：${error.code ?? error.message}`,
          );
        }
        if (oldMarkdown && newMarkdown && oldMarkdown !== newMarkdown) {
          await fileSystem.rm(markdownPath(file, oldMarkdown), { force: true }).catch(() => {});
        }
        return result.output;
      },
    };
  };
}
