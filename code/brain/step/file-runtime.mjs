// Host identity is supplied by the operator/host, never by model business parameters.
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
      "宿主须提供真实文字conversationId、turnId与绝对sourceRoot，尚未初始化或修改State。",
    );
  const key = createHash("sha256").update(host.conversationId).digest("hex");
  return path.join(host.sourceRoot, ".brain-working", "brain-step-three-phase", key + ".json");
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
      else throw new Error(`无法读取会话State ${file}；尚未初始化或覆盖原记录。${error.message}`);
    }
    return {
      execute: async (raw) => {
        const result = execute(previous, host, raw, { notePath: file });
        if (result.changed) {
          const temp = path.join(
            path.dirname(file),
            "." + path.basename(file) + "." + randomUUID() + ".tmp",
          );
          try {
            await fileSystem.mkdir(path.dirname(file), { recursive: true });
            await fileSystem.writeFile(temp, JSON.stringify(result.envelope, null, 2) + "\n", {
              encoding: "utf8",
              flag: "wx",
            });
            await fileSystem.rename(temp, file);
          } catch (error) {
            await fileSystem.rm(temp, { force: true }).catch(() => {});
            throw new Error(
              `State保存未正常完成，尚未返回保存成功。文件：${file}；错误：${error.code ?? error.message}。保留原业务内容，按实际写入或替换失败的范围排查后继续。`,
            );
          }
        }
        return result.output;
      },
    };
  };
}
