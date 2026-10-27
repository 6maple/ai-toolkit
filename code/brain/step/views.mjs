import { readFile } from "node:fs/promises";
import { noteKeys, phaseIds, decisions } from "./schema.mjs";

const pack = new URL("./guidance/", import.meta.url);
const read = async (name) =>
  (await readFile(new URL(name, pack), "utf8")).replace(/^\uFEFF/, "").trim();
const methods = {
  intent: await read("methods/intent.md"),
  essence: await read("methods/essence.md"),
  work: await read("methods/work.md"),
};
// One code-owned fragment, inserted at the current phase's investigation point.
const investigation = `围绕 {待查关系} 和当前认知缺口，主动取得能够直接说明它们的信息（网络资料必须是查询途径之一）。
不能仅凭已有知识、本地资料或信心跳过外部调查；决定不查时先说明具体理由，拿不准外部资料是否会改变判断或做法时，先查再判断。`;
for (const phase of phaseIds) {
  const paragraphs = methods[phase].split(/\r?\n\r?\n/);
  paragraphs.splice(phase === "work" ? 1 : 2, 0, investigation);
  methods[phase] = paragraphs.join("\n\n");
}
const submit = JSON.parse(await read("submissions.json"));
const stateUse = await read("state-use.md");
const unavailable = await read("unavailable.md");
const delivery = await read("delivery-rules.md");
const names = {
  intent: "阶段1：持续深挖用户完整意图",
  essence: "阶段2：持续深挖事情本质",
  work: "阶段3：完成本轮工作",
};
export function currentPhase(state) {
  const active = phaseIds.filter((id) => state.phases[id].status === "active");
  if (active.length > 1) throw new Error("State有多个active阶段，尚未进行本次修改。");
  return active[0] ?? null;
}
export function submissionHelp(phase) {
  if (phase === null)
    return "本轮已可交付；用status取得实际交付内容。发现真实变化时用update保存实际修订及重要impact。";
  return `${submit[phase]}\n本阶段允许decision：${decisions[phase].join(" / ")}。`;
}
function notes(state, keys) {
  return keys
    .filter((key) => state.notes[key] != null)
    .map((key) => `${key}:\n${state.notes[key]}`)
    .join("\n\n");
}
function taskText(task) {
  return JSON.stringify(task, null, 2);
}
function pending(state) {
  return state.pendingUserInput.length
    ? `\n\n用户待决事项：\n${JSON.stringify(state.pendingUserInput, null, 2)}\n\n${unavailable}`
    : "";
}
function plans(state) {
  return state.tasks.length ? state.tasks.map(taskText).join("\n\n") : "";
}
export function executionView(state, receipt) {
  const selected = new Set(state.reviews.execution.runnableTaskIds);
  const tasks = state.tasks.filter(
    (task) =>
      selected.has(task.id) &&
      task.scheduledFor === "current_round" &&
      ["todo", "doing"].includes(task.execution.status),
  );
  const intro = receipt || "执行核对已记录，当前仍在阶段3。";
  const context = notes(state, ["intent", "scope", "analysis", "method", "acceptance"]);
  if (!tasks.length)
    return `${intro}

本次没有列出可执行任务。

当前具体缺口及已有进展：
${state.reviews.execution.assessment}
${context ? "\n当前工作所需的整体目的与约束：\n" + context : ""}${pending(state)}

仍有可自行查明或纠正的内容，继续按阶段3方法处理并更新State。
当前确无可继续的获准工作时，核对实际流程后提交handoff，交付已有进展和具体缺口。`;
  return `${intro}

现在处理以下已核对通过、独立且已获准的工作：
${tasks.map(taskText).join("\n\n")}

当前工作所需的整体目的与约束：
${context}${pending(state)}

工作及验收结果及时用update保存；影响已有认识或计划时，同时提交实际impact。`;
}
export function newTaskReviewView(state, receipt) {
  if (currentPhase(state) !== "work" || state.handoffReason) return null;
  const covered = new Set(state.reviews.execution?.runnableTaskIds ?? []);
  const tasks = state.tasks.filter(
    (task) =>
      task.scheduledFor === "current_round" &&
      ["todo", "doing"].includes(task.execution.status) &&
      !covered.has(task.id),
  );
  if (!tasks.length) return null;
  return `${receipt}

本轮这些任务尚未完成执行核对：
${tasks.map(taskText).join("\n\n")}

现在按当前意图、事实与方法核对这些任务的范围、前提、依赖和验收目标；
使用submit，phase="work"、decision="review_execution"提交实际核对和可执行任务ID。
再按返回执行，并持续更新实际进展及验收结果。`;
}
export function deliveryView(state, notePath) {
  const phase = currentPhase(state);
  const intro = state.handoffReason
    ? `当前阶段${names[phase]}尚未完成。\n\n本轮当前没有可继续的获准工作，原因是：\n${state.handoffReason}`
    : "本轮成果验收与流程检查的通过判断已记录。";
  const artifacts = [
    ...new Set(state.tasks.flatMap((task) => task.execution.result?.artifacts ?? [])),
  ];
  const understanding = notes(state, ["intent", "scope", "analysis", "research"]);
  const actual = notes(state, ["replyDraft", "result"]);
  const remaining = state.tasks.filter(
    (task) =>
      task.scheduledFor === "future" || !["done", "cancelled"].includes(task.execution.status),
  );
  return `${intro}

${delivery}${understanding ? "\n\n本轮整体认识与依据：\n" + understanding : ""}${actual ? "\n\n本轮已整理的内容：\n" + actual : ""}
${artifacts.length ? `\n正式成果位置：\n${artifacts.join("\n")}\n` : ""}${remaining.length ? `\n尚未完成及后续验收安排：\n${remaining.map(taskText).join("\n\n")}\n` : ""}${notePath ? `\n深度思考笔记实际位置：\n${notePath}` : ""}${pending(state)}`;
}
export function currentView(state, notePath, receipt = "") {
  const phase = currentPhase(state);
  if (phase === null || state.handoffReason)
    return `${receipt ? receipt + "\n\n" : ""}${deliveryView(state, notePath)}`;
  const keys =
    phase === "intent"
      ? ["background", "intent", "scope", "research"]
      : phase === "essence"
        ? ["intent", "scope", "analysis", "research"]
        : ["intent", "scope", "analysis", "method", "acceptance", "result"];
  const currentTasks = state.tasks.filter((task) => task.scheduledFor === "current_round");
  const runnable =
    state.reviews.execution?.runnableTaskIds.filter((id) =>
      currentTasks.some(
        (task) => task.id === id && ["todo", "doing"].includes(task.execution.status),
      ),
    ) ?? [];
  return `当前阶段：${names[phase]}（phase=${phase}）
当前进展：${state.phases[phase].progress}
${receipt ? `\n本次处理：\n${receipt}\n` : ""}
当前工作所需成果：
${phase === "intent" ? "本轮用户原消息：\n" + state.message + "\n\n" : ""}${notes(state, keys) || "当前State尚未保存阶段成果，按本阶段方法取得实际内容。"}${currentTasks.length ? "\n\n本轮实际任务：\n" + currentTasks.map(taskText).join("\n\n") : ""}${pending(state)}
${phase === "work" ? `\n当前核对记录：\n${JSON.stringify(state.reviews, null, 2)}\n当前仍可执行的真实任务ID：${runnable.length ? runnable.join("、") : "当前未列出；按实际前提核对，不据此认定无工作。"}\n` : ""}
${stateUse}

当前阶段方法：
${methods[phase]}

继续方式：
${submit[phase]}`;
}
export function overviewView(state, notePath) {
  return `当前整体意图与本轮边界：
${notes(state, ["background", "intent", "scope"])}

事实关系、专业依据与未知：
${notes(state, ["analysis", "research"])}

方法、验收目标及计划：
${notes(state, ["method", "acceptance"])}${state.tasks.length ? "\n\n" + plans(state) : ""}

实际结果与未完：
${notes(state, ["result"])}${pending(state)}

当前位置：${currentPhase(state) ?? "本轮流程已完成"}
核对当前工作与上述整体的关系；发现实际变化，用update修订受影响内容并报告重要impact。
${currentPhase(state) === null || state.handoffReason ? "\n" + delivery + (notePath ? "\n\n深度思考笔记实际位置：\n" + notePath : "") : ""}`;
}
export function shortView(state, notePath, receipt) {
  const phase = currentPhase(state);
  if (phase === null || state.handoffReason) return currentView(state, notePath, receipt);
  return `${receipt}\n\n当前阶段：${names[phase]}（phase=${phase}）\n当前进展：${state.phases[phase].progress}\n\n继续按当前阶段方法处理剩余工作，并持续用update保存实际变化。\n${submissionHelp(phase)}`;
}
export const resources = { methods, stateUse, unavailable, delivery, noteKeys };
