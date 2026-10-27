// Pure three-phase controller. Semantic investigation/verification remains the model's responsibility.
import { inputSchema, phaseIds, noteKeys, decisions } from "./schema.mjs";
import {
  currentPhase,
  currentView,
  overviewView,
  shortView,
  submissionHelp,
  executionView,
  newTaskReviewView,
} from "./views.mjs";

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const present = (value) => typeof value === "string" && value.trim().length > 0;
const index = (phase) => phaseIds.indexOf(phase);
function reject(message) {
  throw new Error(`${message}\n本次请求未应用。保留尚未保存的实际内容，修正后重新提交原动作。`);
}
function fields(value, allowed, label) {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) {
    const recovery =
      value.action === "submit" && extra.includes("progress")
        ? "submit不接受progress。先用独立update将progress放在请求顶层保存进展，再移除progress重交原submit。"
        : "";
    reject(`${label}不接受${extra.join("、")}；本次允许字段：${allowed.join("、")}。${recovery}`);
  }
}
function requireValue(value, name) {
  if (!present(value)) reject(`${name}须提供实际内容及依据，不能用空值替代。`);
}
function requireNotes(state, keys) {
  const missing = keys.filter((key) => !present(state.notes[key]));
  if (missing.length)
    reject(
      `当前尚未保存${missing.join("、")}，下一工作需要使用。按当前方法实际调查，用update记录真实内容或具体存疑；没有依据时保留未知，不为通过检查虚构结论。`,
    );
}
function move(state, target, progress) {
  phaseIds.forEach((phase, n) => {
    state.phases[phase] =
      n < index(target)
        ? { status: "done" }
        : n === index(target)
          ? { status: "active", progress }
          : { status: "pending" };
  });
}
function invalidate(state, keys, invalidated) {
  for (const key of keys)
    if (state.reviews[key] && (key === "execution" || state.reviews[key].outcome === "passed")) {
      state.reviews[key] = null;
      invalidated.add(key);
    }
}
function fresh(message) {
  return {
    message,
    phases: {
      intent: { status: "active", progress: "尚未开始本轮实际理解和调查。" },
      essence: { status: "pending" },
      work: { status: "pending" },
    },
    notes: Object.fromEntries(noteKeys.map((key) => [key, null])),
    tasks: [],
    pendingUserInput: [],
    reviews: { execution: null, completion: null, workflow: null },
    handoffReason: null,
  };
}
function taskOf(state, id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task)
    reject(
      `任务ID ${id}不存在。用overview取得实际任务记录；确需新增时先用updates.taskChanges的add取得真实ID。`,
    );
  return task;
}
function checkReview(review, name) {
  fields(
    review,
    review.outcome === "passed"
      ? ["outcome", "assessment"]
      : ["outcome", "assessment", "correction"],
    name,
  );
  requireValue(review.assessment, `${name}.assessment`);
  if (review.outcome === "needs-work" && !review.correction)
    reject(`${name}为needs-work，须提供correction.kind和details，说明实际缺口。`);
}
const finalChecks = ["completion", "workflow"];
const allChecks = ["execution", ...finalChecks];
const taskFields = {
  add: ["kind", "description", "scheduledFor", "parentId"],
  revise: ["kind", "taskId", "description", "scheduledFor"],
  progress: ["kind", "taskId", "progress", "result"],
  complete: ["kind", "taskId", "result"],
  correct_result: ["kind", "taskId", "result"],
  block: ["kind", "taskId", "reason"],
  defer: ["kind", "taskId", "reason"],
  cancel: ["kind", "taskId", "reason"],
};
function applyChanges(state, updates, invalidated, receipts) {
  if (!updates) return false;
  const before = JSON.stringify(state);
  const initialIds = new Set(state.tasks.map((task) => task.id));
  for (const key of noteKeys)
    if (Object.hasOwn(updates, key) && !equal(state.notes[key], updates[key])) {
      state.notes[key] = updates[key];
      invalidate(
        state,
        ["scope", "method", "acceptance"].includes(key) ? allChecks : finalChecks,
        invalidated,
      );
    }
  if (
    Object.hasOwn(updates, "pendingUserInput") &&
    !equal(state.pendingUserInput, updates.pendingUserInput)
  ) {
    state.pendingUserInput = updates.pendingUserInput;
    invalidate(state, finalChecks, invalidated);
  }
  for (const change of updates.taskChanges ?? []) {
    fields(change, taskFields[change.kind], `taskChanges.${change.kind}`);
    if (change.kind === "add") {
      requireValue(change.description, "add.description");
      if (!change.scheduledFor)
        reject("add须提供scheduledFor：current_round本轮，future后续；不改变实际完成状态。");
      if (change.parentId && !initialIds.has(change.parentId))
        reject(
          "parentId须为工具此前返回的已有任务ID。保留本次新增内容，先取得父任务真实ID后再提交。",
        );
      let n = state.tasks.length + 1;
      while (state.tasks.some((task) => task.id === `task-${n}`)) n++;
      const task = {
        id: `task-${n}`,
        parentId: change.parentId ?? null,
        scheduledFor: change.scheduledFor,
        description: change.description,
        execution: { status: "todo" },
      };
      state.tasks.push(task);
      receipts.push(`已创建${task.id}：${task.description}`);
      invalidate(state, finalChecks, invalidated);
      continue;
    }
    requireValue(change.taskId, "taskId");
    if (!initialIds.has(change.taskId))
      reject(
        `任务${change.taskId}不是本次调用前已返回的任务ID；先取得新增任务实际ID再提交后续操作。`,
      );
    const task = taskOf(state, change.taskId);
    const oldTask = structuredClone(task);
    const oldResult = task.execution.result ?? null;
    if (change.kind === "revise") {
      if (change.description === undefined && change.scheduledFor === undefined)
        reject("revise至少提供description或scheduledFor的一项真实修订。");
      if (change.description !== undefined) task.description = change.description;
      if (change.scheduledFor !== undefined) task.scheduledFor = change.scheduledFor;
    } else if (change.kind === "progress") {
      requireValue(change.progress, "taskChanges.progress");
      task.execution = {
        status: "doing",
        progress: change.progress,
        result: change.result ?? oldResult,
      };
    } else if (change.kind === "complete") {
      if (!change.result) reject("complete须提交真实result及完成/验证依据。");
      task.execution = { status: "done", result: change.result };
    } else if (change.kind === "correct_result") {
      if (!oldResult || !change.result)
        reject("correct_result须针对已保存的实际结果提供修订；新产物按真实执行进展保存。");
      task.execution.result = change.result;
    } else {
      requireValue(change.reason, `${change.kind}.reason`);
      task.execution = {
        status: { block: "blocked", defer: "deferred", cancel: "cancelled" }[change.kind],
        reason: change.reason,
        result: oldResult,
      };
    }
    if (!equal(oldTask, task)) {
      invalidate(state, finalChecks, invalidated);
      if (
        ["revise", "block", "defer", "cancel"].includes(change.kind) &&
        state.reviews.execution?.runnableTaskIds.includes(task.id)
      )
        invalidate(state, ["execution"], invalidated);
      receipts.push(`已记录${task.id}的${change.kind}，实际状态为${task.execution.status}。`);
    }
  }
  return before !== JSON.stringify(state);
}
function applyImpact(state, impact, invalidated) {
  if (!impact) return null;
  for (const id of impact.affectedTaskIds) taskOf(state, id);
  if (impact.areas.some((area) => ["intent", "essence", "scope", "method_or_plan"].includes(area)))
    invalidate(state, allChecks, invalidated);
  else {
    if (impact.areas.includes("results")) {
      invalidate(state, finalChecks, invalidated);
      if (
        state.reviews.execution?.runnableTaskIds.some(
          (id) =>
            impact.affectedTaskIds.includes(id) &&
            ["todo", "doing"].includes(taskOf(state, id).execution.status),
        )
      )
        invalidate(state, ["execution"], invalidated);
    }
    if (impact.areas.includes("reply")) invalidate(state, ["workflow"], invalidated);
  }
  return impact.areas.includes("intent")
    ? "intent"
    : impact.areas.includes("essence")
      ? "essence"
      : null;
}

export function execute(previous, host, raw, { notePath } = {}) {
  if (!present(host?.conversationId) || !present(host?.turnId))
    throw new Error("宿主须提供真实文字conversationId与turnId；尚未初始化或修改State。");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    reject(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "请求"}：${issue.message}`)
        .join("\n"),
    );
  const req = parsed.data;
  const sameTurn =
    previous?.conversationId === host.conversationId && previous?.turnId === host.turnId;
  const oldPhase = sameTurn ? currentPhase(previous.state) : null;
  const readOnly = req.action === "status" || req.action === "overview";
  if (req.action === "start") {
    fields(req, ["action", "message"], "start");
    requireValue(req.message, "start.message");
    if (sameTurn) {
      if (req.message !== previous.state.message)
        reject(
          "同轮start不能替换用户原消息或清空进展；记录新的理解用update，真实新轮由宿主turnId绑定。",
        );
      return {
        envelope: previous,
        changed: false,
        output: {
          currentPhase: oldPhase,
          guidance: currentView(previous.state, notePath, "本轮已开始，继续当前实际工作。"),
        },
      };
    }
    const envelope = {
      conversationId: host.conversationId,
      turnId: host.turnId,
      state: fresh(req.message),
    };
    return {
      envelope,
      changed: true,
      output: {
        currentPhase: "intent",
        guidance: currentView(envelope.state, notePath, "本轮已开始，流程状态已初始化。"),
      },
    };
  }
  if (!sameTurn) reject("本轮尚未start；先提交start及用户本轮原消息，查询不会暗中初始化。");
  if (readOnly) {
    fields(req, ["action"], `${req.action}只读查询；保存实际业务内容用update`);
    return {
      envelope: previous,
      changed: false,
      output: {
        currentPhase: oldPhase,
        guidance:
          req.action === "status"
            ? currentView(previous.state, notePath)
            : overviewView(previous.state, notePath),
      },
    };
  }
  if (req.action === "update") {
    fields(req, ["action", "updates", "progress", "impact"], "update");
    if (!req.progress && (!req.updates || !Object.keys(req.updates).length))
      reject("update须有updates中的实际修订或progress；仅查看用status。");
    if (oldPhase === null && req.progress !== undefined)
      reject("当前没有active阶段；先用update提交真实修订及其影响，不只填写progress。");
  } else {
    if (req.phase !== oldPhase)
      reject(
        `当前阶段为${oldPhase ?? "已完成"}，不能使用phase=${req.phase}。${submissionHelp(oldPhase)}`,
      );
    if (!decisions[oldPhase].includes(req.decision))
      reject(`当前阶段不接受decision=${req.decision}。${submissionHelp(oldPhase)}`);
    const extras =
      req.decision === "review_execution"
        ? ["review"]
        : req.decision === "finish"
          ? ["completion", "workflow"]
          : req.decision === "handoff"
            ? ["assessment", "workflow"]
            : ["assessment"];
    fields(
      req,
      ["action", "phase", "decision", "updates", "impact", ...extras],
      `submit ${req.phase}/${req.decision}`,
    );
    if (extras.includes("assessment")) requireValue(req.assessment, "assessment");
    if (req.decision === "review_execution" && !req.review)
      reject("review_execution须提交review.assessment与真实runnableTaskIds。");
    if (["finish", "handoff"].includes(req.decision) && !req.workflow)
      reject("workflow须实际检查本轮应执行的流程并提交结果，不能用业务验收替代。");
    if (req.completion) checkReview(req.completion, "completion");
    if (req.workflow) checkReview(req.workflow, "workflow");
  }
  if (req.impact && (!req.updates || !Object.keys(req.updates).length))
    reject("impact随对应实际updates提交；仅请求回查可用submit的实际回查判断及assessment。");

  const envelope = structuredClone(previous),
    state = envelope.state;
  const receipts = [],
    invalidated = new Set();
  const businessChanged = applyChanges(state, req.updates, invalidated, receipts);
  const upstream = applyImpact(state, req.impact, invalidated);
  if (req.action === "submit" && req.decision !== "handoff" && state.handoffReason) {
    state.handoffReason = null;
    invalidate(state, ["workflow"], invalidated);
  }
  if (businessChanged || req.progress !== undefined || req.impact) {
    state.handoffReason = null;
    if (oldPhase === null)
      move(
        state,
        upstream ?? "work",
        req.impact?.reason ?? "实际修订已保存，处理受影响工作及核对。",
      );
    if (req.progress !== undefined && oldPhase !== null) {
      if (state.phases[oldPhase].progress !== req.progress)
        invalidate(state, finalChecks, invalidated);
      state.phases[oldPhase].progress = req.progress;
    }
  }
  if (upstream && index(upstream) < index(oldPhase ?? "work")) {
    move(state, upstream, req.impact.reason);
    receipts.push(
      `本次修订已保存，并按所报告的上游影响回查；${req.action === "submit" ? `原${req.decision}判断未采用。` : "继续处理实际变化。"}`,
    );
    return result(true);
  }
  if (req.action === "update") {
    receipts.unshift(
      businessChanged || req.impact || req.progress !== undefined
        ? "本次实际更新已记录。"
        : "内容与已有记录一致。",
    );
    return result(false);
  }
  if (req.decision === "advance") {
    requireNotes(
      state,
      req.phase === "intent" ? ["intent", "scope"] : ["intent", "scope", "analysis", "research"],
    );
    const next = phaseIds[index(req.phase) + 1];
    move(state, next, "本阶段尚未登记执行进展。");
    receipts.push(`已根据本次推进判断进入${next}；已保存成果继续在同一State中使用。`);
    return result(true);
  }
  if (req.decision === "continue") {
    state.phases[req.phase].progress = req.assessment;
    receipts.push(`继续判断已记录：${req.assessment}`);
    return result(false);
  }
  if (req.decision.startsWith("revisit_")) {
    invalidate(state, allChecks, invalidated);
    move(state, req.decision === "revisit_intent" ? "intent" : "essence", req.assessment);
    receipts.push(`本次回查判断已记录：${req.assessment}`);
    return result(true);
  }
  if (req.decision === "review_execution") {
    requireNotes(state, ["scope", "method", "acceptance"]);
    for (const id of req.review.runnableTaskIds) {
      const task = taskOf(state, id);
      if (
        task.scheduledFor !== "current_round" ||
        !["todo", "doing"].includes(task.execution.status)
      )
        reject(
          `任务${id}当前不是可列入本轮执行的todo/doing工作。保留真实任务内容，按实际进展核对后提交review。`,
        );
    }
    state.reviews.execution = req.review;
    state.phases.work.progress = req.review.assessment;
    receipts.push("执行核对已记录，当前仍在阶段3。");
    return result(false, "execution");
  }
  const failed = [req.completion, req.workflow].filter(
    (review) => review?.outcome === "needs-work",
  );
  if (failed.length) {
    const earliest = Math.min(
      index(req.phase),
      ...failed.map((review) => index(review.correction.kind)),
    );
    const validCompletion =
      earliest === index("work") && req.completion?.outcome !== "needs-work"
        ? (req.completion ?? state.reviews.completion)
        : null;
    invalidate(state, allChecks, invalidated);
    if (req.completion?.outcome === "needs-work") state.reviews.completion = req.completion;
    else if (validCompletion?.outcome === "passed") state.reviews.completion = validCompletion;
    else if (req.completion) state.reviews.completion = null;
    state.reviews.workflow =
      earliest === index("work") || req.workflow.outcome === "needs-work" ? req.workflow : null;
    move(state, phaseIds[earliest], failed.map((review) => review.correction.details).join("\n"));
    receipts.push("实际核对缺口已记录，尚未进入交付；按具体缺口补查或纠正。");
    return result(true);
  }
  if (req.decision === "handoff") {
    const runnable =
      state.reviews.execution?.runnableTaskIds.filter((id) =>
        ["todo", "doing"].includes(taskOf(state, id).execution.status),
      ) ?? [];
    if (runnable.length)
      reject(
        `仍有已核对可执行工作${runnable.join("、")}；按实际前提继续，或记录真实受阻/变化后再判断handoff。`,
      );
    state.reviews.workflow = req.workflow;
    state.handoffReason = req.assessment;
    receipts.push("本次交接判断已记录，当前阶段保持未完成。");
    return result(true);
  }
  requireNotes(state, ["acceptance", "result"]);
  const completion = req.completion ?? state.reviews.completion;
  if (completion?.outcome !== "passed")
    reject("当前没有仍有效的passed成果验收；实际按验收目标/方式核对后提交completion。");
  const unfinished = state.tasks.filter(
    (task) =>
      task.scheduledFor === "current_round" &&
      !["done", "cancelled"].includes(task.execution.status),
  );
  if (unfinished.length)
    reject(
      `本轮工作尚未完成：${unfinished.map((task) => `${task.id}=${task.execution.status}`).join("、")}。继续处理；确无可继续工作时用handoff，不能仅为通过finish移到future。`,
    );
  state.reviews.completion = completion;
  state.reviews.workflow = req.workflow;
  state.phases.work = { status: "done" };
  state.handoffReason = null;
  return result(true);

  function result(full, view = null) {
    const stillInvalid = [...invalidated].filter((key) => state.reviews[key] === null);
    if (
      stillInvalid.includes("completion") &&
      previous.state.reviews.completion?.outcome === "passed" &&
      req.updates &&
      Object.hasOwn(req.updates, "replyDraft") &&
      !equal(previous.state.notes.replyDraft, state.notes.replyDraft)
    )
      receipts.push("回复草稿已修改，需重新核对受影响的交付内容。");
    if (stillInvalid.length)
      receipts.push(`需重新核对的检查：${stillInvalid.join("、")}；实际成果和未受影响内容保留。`);
    const phase = currentPhase(state);
    const receipt = receipts.join("\n");
    const addedCurrentTask = req.updates?.taskChanges?.some(
      (change) => change.kind === "add" && change.scheduledFor === "current_round",
    );
    const specific =
      view === "execution"
        ? executionView(state, receipt)
        : !full && addedCurrentTask
          ? newTaskReviewView(state, receipt)
          : null;
    const guidance =
      specific ??
      (full ? currentView(state, notePath, receipt) : shortView(state, notePath, receipt));
    return {
      envelope,
      changed: !equal(previous, envelope),
      output: { currentPhase: phase, guidance },
    };
  }
}
