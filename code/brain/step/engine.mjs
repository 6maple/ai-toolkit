// One user turn, one current State. The model owns semantic work;
// the program owns the legal action, precise edits, persistence and fixed successor.
import { inputSchema } from "./schema.mjs";
import { sectionTitle, taskView } from "./views.mjs";
import { editWithPi } from "./pi-edit.mjs";

const phases = ["intent", "essence", "work"];
const present = (s) => typeof s === "string" && s.trim().length > 0;
const fields = {
  start: ["action", "message"],
  submit_work: ["action", "result"],
  submit_review: ["action", "result"],
  confirm_review: ["action", "result"],
  update: ["action", "edits"],
  read: ["action"],
};
function error(message) {
  throw new Error(message);
}
function fresh(message) {
  return {
    message,
    phase: "intent",
    mode: "work",
    content: "# 当前 State\n",
    saved: { intent: false, essence: false, work: false },
    issue: null,
    revised: false,
  };
}
function enforceFields(req) {
  const extra = Object.keys(req).filter((key) => !fields[req.action].includes(key));
  if (extra.length)
    error(`${req.action} 不接受字段：${extra.join("、")}。请只提交此动作所需参数。`);
}
function requireMode(state, modes, action) {
  if (state.mode === "done") error("本轮已经完成；新的用户消息到来后用 start 开始新一轮。");
  if (!modes.includes(state.mode))
    error(
      `当前任务是 ${state.mode}，不能调用 ${action}。请按当前任务 Markdown 完成工作并使用对应提交动作；可用 start(message) 重新取得当前任务。`,
    );
}
function next(state) {
  const i = phases.indexOf(state.phase);
  if (i === phases.length - 1) state.mode = "done";
  else {
    state.phase = phases[i + 1];
    state.mode = "work";
  }
  state.issue = null;
  state.revised = false;
}

export async function execute(previous, host, raw) {
  if (!present(host?.conversationId) || !present(host?.turnId))
    error("宿主须提供真实 conversationId 和 turnId；没有可信身份，不初始化或修改 State。");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    error(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "参数"}：${issue.message}`)
        .join("\n"),
    );
  const req = parsed.data;
  enforceFields(req);
  const sameTurn =
    previous?.conversationId === host.conversationId && previous?.turnId === host.turnId;

  if (req.action === "start") {
    if (!present(req.message)) error("start 必须提供本轮用户原消息 message。");
    if (sameTurn) {
      if (previous.state.message !== req.message)
        error("同一轮 start 的 message 与已保存的用户原消息不同；本次未更改 State。");
      return { changed: false, envelope: previous, output: taskView(previous.state) };
    }
    const envelope = {
      conversationId: host.conversationId,
      turnId: host.turnId,
      state: fresh(req.message),
    };
    return { changed: true, envelope, output: taskView(envelope.state) };
  }
  if (!sameTurn)
    error("本轮尚未 start；请先用 start(message) 开始本轮工作，不能隐式沿用上一轮 State。");

  const state = structuredClone(previous.state);
  if (req.action === "read") return { changed: false, envelope: previous, output: state.content };

  if (req.action === "update") {
    requireMode(state, ["work", "fix"], "update");
    if (!req.edits?.length) error("update 必须提供 edits。");
    let changed;
    try {
      changed = await editWithPi(state.content, req.edits);
    } catch (cause) {
      error(`Pi edit 修改失败：${cause.message} 建议先调用 read 获取最新 State，再修正 edits。`);
    }
    if (changed !== state.content) {
      state.content = changed;
      if (state.mode === "fix") state.revised = true;
    }
    return {
      changed: changed !== previous.state.content,
      envelope: { ...previous, state },
      output: "更新已保存。",
    };
  }

  if (req.action === "submit_work") {
    requireMode(state, ["work", "fix"], "submit_work");
    if (state.mode === "fix") {
      if (present(req.result))
        error("当前为修正 work：请用 update 修改 State 中已有成果，实际完成后调用 submit_work()。");
      if (!state.revised)
        error(
          "当前修正 work 尚未通过 update 保存实际修订，不能空提交。请先修正 State 中已有成果。",
        );
      state.issue = null;
      state.revised = false;
      state.mode = "review";
    } else {
      if (!present(req.result))
        error("当前 work 尚未提交完整新成果；请用 submit_work(result) 提交本任务实际结果。");
      if (state.saved[state.phase])
        error("当前成果已保存，请遵循当前返回的任务。已有正文需要修改时在 work 中使用 update。");
      state.content += `\n## ${sectionTitle(state.phase)}\n\n${req.result.trim()}\n`;
      state.saved[state.phase] = true;
      state.mode = "review";
    }
  } else if (req.action === "submit_review" || req.action === "confirm_review") {
    requireMode(state, [req.action === "submit_review" ? "review" : "confirm"], req.action);
    if (present(req.result)) {
      state.issue = req.result.trim();
      state.mode = "fix";
      state.revised = false;
    } else if (req.action === "submit_review") state.mode = "confirm";
    else next(state);
  }

  return {
    changed: true,
    envelope: { ...previous, state },
    output: taskView(state),
  };
}
