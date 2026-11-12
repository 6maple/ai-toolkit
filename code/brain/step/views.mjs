// One focused Markdown task per call; previously submitted results remain in State.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const deliveryRules = fileURLToPath(new URL("./guidance/delivery-rules.md", import.meta.url));
const dataEntry = readFileSync(new URL("./guidance/data-entry.md", import.meta.url), "utf8").trim();
const purpose = "# Brain 的背景与目的\n\n用户实际使用的是模型，期望模型理解真实问题和完整意图，自主、准确地完成工作，结果不少、不多、不偏、质量符合。用户消息可能仅表达现象、原因猜测或建议方法；需要结合真实背景、用户活动及事实形成关系，确认最终怎样做才能符合用户期望。\n\n模型承担专业调查、方法选择、工具使用、执行与验证。Brain Step 负责确定当前聚焦任务、保存当前有效成果和在关键阶段安排整体客观检视。当前任务围绕总体目的完成，不以阶段表面通过代替真实结果。";
const work = {
  "background_goal": {
    "overall": "根据本轮用户消息及已知有效背景，运用「Brain 的背景与目的」确定本轮应该解决什么问题。当前尚未形成「Background + Goal 成果」，不得假定目标已得到验证。",
    "local": "查明用户为什么提出本次要求：当前实际情况及形成原因，怎样影响用户的活动和目标；区分用户要的最终结果、对成因的认识、提出的办法和已作出的决定。调查会改变最终要求的关键事实关系、适用条件、竞争解释和反证，证据不足时保留未知。\n\n本阶段要形成有据的整体背景与最终结果要求，让后续方法、计划和执行都有共同目标。",
    "submit": "提交真实背景、形成关系、用户希望得到的最终结果、约束和关键未知。使用 submit_work(result) 提交，程序将保存为「Background + Goal 成果」。"
  },
  "method": {
    "overall": "以首次「Brain 的背景与目的」和当前最新「Background + Goal 成果」为准；整体目标以已保存的有效正文为唯一依据。",
    "local": "依据「Background + Goal 成果」，研究对应领域成熟的专业方法及其实际依据，结合当前条件和有据取舍选择适用方案，并把整体目标落实为具体产物、质量标准和验收方式。关键专业事实及当前版本能力需要适用证据支持。\n\n资料来源与读取方法参照首次「资料与方法入口」，具体调查方式由模型根据当前目标选用。",
    "submit": "提交选定方法、适用条件、关键依据、具体成果与验收标准，按 submit_work(result) 约定保存为「Method 成果」。"
  },
  "plan": {
    "overall": "以首次「Brain 的背景与目的」及当前最新「Background + Goal 成果」为整体依据，结合「Method 成果」的有效目标与条件。",
    "local": "本阶段把「Method 成果」转为实际可执行的工作安排，明确真实依赖、先后顺序、每项预期结果和验收方式。无法有据确认简单的事项按实际依赖从整体向必要局部展开。计划须符合用户本轮授权，不把尚待核实的技术前提描述为已具备。\n\n需要实际资料时按首次「资料与方法入口」自主取证。",
    "submit": "提交可执行计划、依赖条件、每项验收要求、未解问题和授权边界，按 submit_work(result) 约定保存为「Plan 成果」。"
  },
  "execute": {
    "overall": "以首次「Brain 的背景与目的」和当前最新「Background + Goal 成果」为准，实际结果必须回应用户本轮委托。",
    "local": "依据「Method 成果」及「Plan 成果」，在本轮用户授权范围内完成实际工作。按有效目标检查真实产物与结果；新证据影响旧认识时修订受影响的 State。局部工作完成后回到整体目标核对组合效果。\n\n用户只要求方案时，实际交付完整可审核的方案；若没有获得生产改动授权，不把计划中的代码修改或测试说成已执行。交付前读取并执行交付指导：__DELIVERY_RULES__，核对事实、成果和未完边界。\n\n需要事实或历史依据时按首次「资料与方法入口」自主取得。",
    "submit": "提交本轮实际完成的结果、核验依据、整体目标达成范围及真实未完事项，按 submit_work(result) 约定保存为「Execute 成果」。"
  }
};
const names = {"background_goal":"Background + Goal","method":"Method","plan":"Plan","execute":"Execute"};
const titles = {"background_goal":"Background + Goal 成果","method":"Method 成果","plan":"Plan 成果","execute":"Execute 成果"};
const reviews = {
  "background_goal": "核对「Background + Goal 成果」对用户真实处境、完整意图、最终结果与约束的判断是否成立；事实的直接与上游关系、竞争解释和重要未知，是否有足够依据支持。检查用户已经明确的决定有没有被模型的原因猜测或解决建议代替。",
  "method": "核对「Method 成果」的专业方法是否真正能实现「Background + Goal 成果」，是否符合当前环境、版本和实际权限；具体质量标准与验收方式能否证明目标达成。不要把某份规范允许的通用能力直接当作具体宿主已经具备的能力。",
  "plan": "核对「Plan 成果」是否完整承接「Background + Goal 成果」和「Method 成果」，关键工作、真实依赖、先后关系、权限与各项验收是否有据且没有重要遗漏；检查尚待查证的前提是否被错误地当作已满足。",
  "execute": "核对「Execute 成果」与用户本轮授权和最终目标是否一致。检查真实执行、产物、测试与验收的证据是否支持所声称的完成范围，关键组合效果、关联影响及仍未完成的事项是否如实交代."
};
const reviewEvidence = "独立核验当前成果的关键判断及证据基础：所用资料是否可靠、适用于当前对象和条件；对资料的解释与推论是否得到原文或真实结果支持；是否遗漏足以改变判断或最终结果的重要事实、约束、反证和验证。\n\n有实质疑点时，在本次 Review 中直接取得必要的 Brain 记忆、外部资料或实际工具结果核实；已有可靠、适用的依据可以沿用。如果本阶段的关键结论仍缺少成立的必要依据，应明确缺口及影响，不能认定该结论已获证实或本阶段已达到要求。以整体目标和本阶段应达到的结果为准，只对实际有据、会影响结果的问题提交修正；属于后续阶段的未知如实保留。";

export function sectionTitle(phase) {
  return titles[phase];
}
export function taskView(state) {
  const name = names[state.phase];
  if (state.mode === "done")
    return "本轮工作及一次最终确认已完成。根据当前有效成果向用户交付真实结果。";
  if (state.mode === "work") {
    const item = work[state.phase];
    const local = item.local.replace("__DELIVERY_RULES__", deliveryRules);
    return (state.phase === "background_goal" ? purpose + "\n\n" : "") +
      "# 当前任务：" + name + " / Work\n\n## 整体背景与目的\n\n" +
      item.overall + "\n\n## 当前背景与目的\n\n" + local + "\n\n" +
      (state.phase === "background_goal" ? dataEntry + "\n\n" : "") +
      "## 本次提交\n\n" + item.submit;
  }
  if (state.mode === "review")
    return "# 当前任务：" + name + " / Review\n\n## Brain 的背景与目的\n\n" +
      "参照首次「Brain 的背景与目的」及当前最新「Background + Goal 成果」，从用户真正希望得到的整体结果和本阶段目标出发，独立检视当前成果。\n\n" +
      "## 本次检视要求\n\n" + reviews[state.phase] + "\n\n" +
      reviewEvidence + "\n\n## 本次提交\n\n" +
      "没有实质问题，调用 submit_review()。有实际证据支持的实质问题，以「检视问题」为标题说明问题、依据、影响和修正要求，调用 submit_review(result)。";
  if (state.mode === "fix") {
    const issueReferences = {
      submit_review: `最近一次「当前任务：${name} / Review」中提交的「检视问题」`,
      confirm_review: `最近一次「当前任务：${name} / Confirm」中通过 confirm_review(result) 提交的问题`,
    };
    const issueReference = issueReferences[state.issue?.source] ?? "引发本次修正的实质问题";
    return (
      "# 当前任务：" +
      name +
      " / Fix\n\n## 整体背景与目的\n\n" +
      "以首次「Brain 的背景与目的」和当前有效「Background + Goal 成果」为整体依据。\n\n" +
      "## 当前背景与目的\n\n" +
      "针对" +
      issueReference +
      "，修正「" +
      titles[state.phase] +
      "」中真实受影响的认识与边界。保留经核实仍成立的目标。若检视证据改变了对整体目标的认识，修订「Background + Goal 成果」中受影响的部分。使本阶段成果符合真实证据和实际可行条件。\n\n" +
      "可根据首次「资料与方法入口」取得需要的证据。\n\n" +
      "## 本次提交\n\n按已提供的 update 和 submit_work 约定修订现有成果；修正结束后程序安排新的完整 Review。"
    );
  }
  return "# 当前任务：" + name + " / Confirm\n\n## 整体背景与目的\n\n" +
    "以首次「Brain 的背景与目的」和当前最新「Background + Goal 成果」为准。\n\n" +
    "## 当前背景与目的\n\n" +
    "准确参照最近一次「当前任务：" + name + " / Review」中的「Brain 的背景与目的」和「本次检视要求」，仅确认那次完整检视是否仍有会改变结论的实质遗漏。\n\n" +
    "## 本次提交\n\n没有实质问题调用 confirm_review()；有真实有据的遗漏则调用 confirm_review(result)，说明问题与影响。";
}
