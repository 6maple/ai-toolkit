// The host selects the workspace. A server-issued ID selects one turn within it.
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import properLockfile from "proper-lockfile";
import { execute, parseStepRequest } from "./engine.mjs";
import { turnIdPattern } from "./schema.mjs";

export function statePathFor({ sourceRoot, brainRoot, turnId }) {
  if (typeof sourceRoot !== "string" || !path.isAbsolute(sourceRoot))
    throw new Error("宿主须提供绝对项目路径 sourceRoot。");
  if (typeof turnId !== "string" || !turnIdPattern.test(turnId))
    throw new Error("请传回工具返回的有效 turnId。");
  const key = createHash("sha256").update(JSON.stringify([brainRoot, turnId])).digest("hex");
  return path.join(sourceRoot, ".brain-working", "brain-step", key + ".json");
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

async function loadState(fileSystem, file, turnId) {
  let previous;
  try {
    previous = JSON.parse((await fileSystem.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw new Error(`无法读取本轮 State ${file}；未初始化或覆盖原记录。原因：${error.message}`);
  }
  if (previous?.turnId !== turnId || !previous.state)
    throw new Error("无法识别已保存的 Brain Step 轮次。");
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
  return previous;
}

export function createFileRuntime({ sourceRoot, brainRoot, fileSystem = fs, onNewTurn }) {
  return {
    async execute(raw) {
      const request = parseStepRequest(raw);
      const turnId = request.turnId ?? randomUUID();
      const file = statePathFor({ sourceRoot, brainRoot, turnId });
      const missing = "当前项目中找不到这个 turnId。请使用本轮工具返回的 ID。";
      if (request.turnId) {
        try {
          await fileSystem.stat(file);
        } catch (error) {
          if (error.code === "ENOENT") throw new Error(missing);
          throw error;
        }
      } else {
        await fileSystem.mkdir(path.dirname(file), { recursive: true });
      }
      const release = await properLockfile.lock(file, {
        realpath: false,
        retries: { retries: 60, minTimeout: 100, maxTimeout: 100 },
      });
      try {
        const previous = await loadState(fileSystem, file, turnId);
        if (request.turnId && !previous) throw new Error(missing);
        if (!request.turnId && previous) throw new Error("轮次 ID 已存在。请重新调用 start。");
        const result = await execute(previous, turnId, request);
        if (!result.changed) return { turnId, text: result.output };
        const diagnostics = previous ? [] : await onNewTurn?.() ?? [];

        const envelope = structuredClone(result.envelope);
        const oldMarkdown = previous?.state?.contentFile;
        const contentChanged = envelope.state.content !== previous?.state?.content || !oldMarkdown;
        let newMarkdown;
        if (contentChanged) {
          newMarkdown = path.basename(file, ".json") + "." + randomUUID() + ".md";
          envelope.state.contentFile = newMarkdown;
        } else {
          envelope.state.contentFile = oldMarkdown;
        }
        delete envelope.state.content;

        try {
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
        const text = diagnostics.length
          ? result.output + "\n\n" + diagnostics.map((warning) => `warning: ${warning}`).join("\n")
          : result.output;
        return { turnId, text };
      } finally {
        await release();
      }
    },
  };
}
