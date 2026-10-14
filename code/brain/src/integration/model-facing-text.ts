// Approved model-visible wording from doc/brain/v7/16-model-facing-composition-review.md.
export const BRAIN_CONTEXT_PREFIX =
  "# 本轮 Brain 工作上下文\n\n下方为本轮实际取得的上下文。Core正文已在下方提供；候选仅提供描述与当前可用状态。";

export const BRAIN_ROLES =
  "## 记忆的角色\n\nDecision 是相应决定者已明确作出的选择，在其对象和范围内使用；模型建议或推断不会因为进入 Brain 而成为用户决定。\n\nKnowledge 是在正文所记条件和依据范围内可用的认识；条件改变时重新判断。\n\nIntention 是仍需继续的目标或承诺；按正文的当前状态继续。\n\nSkill 是带有适用条件的可复用方法；条件成立时按正文使用。\n\n搜索命中、最近修改时间或进入本轮候选，都不会自动改变 cognition 的角色或 authority。";

export const BRAIN_MAINTENANCE =
  "## 维护已有 cognition\n\n修改已有 Core 或 archival cognition 时，先取得并理解当前完整内容，把它作为同一 cognition 的当前状态继续修订。\n\n新的 evidence、owner decision、条件变化或明确目标改变什么，就修改什么；没有受到影响的目标、决定、条件、依据、边界、约束和未完事项继续保留。\n\n结构级重写不能因为新的上位表述看起来能够概括旧内容，就静默删除或弱化仍会改变模型判断、行动或完成边界的明确语义。\n\n修改后重新读取结果，核对应该继续成立的内容没有被意外删除、弱化或改变。";

export const BRAIN_DISCOVERY_COMMON =
  "## 候选与发现\n\n本轮候选只表示运行时认为它们可能相关，不表示已验证适用或已提供完整正文。发现工具的实际搜索范围、结果限制及失败语义见对应工具说明。";

export const BRAIN_SEMANTIC_BRANCH =
  "本轮提供 brain_ask_search、brain_grep、brain_glob及brain_cat。";

export const BRAIN_NO_SEMANTIC_BRANCH =
  "本轮未提供 brain_ask_search；提供brain_grep、brain_glob及brain_cat。";

export const BRAIN_SCOPE =
  "## 范围与相关项目\n\nGlobal cognition跨项目使用；Project cognition用于对应项目。相关项目的普通cognition在实际配置的发现范围内；相关Project Core不自动加载，当前可用路径和权限见本轮相关项目列表。";

export const BRAIN_EXPLICIT_INSTRUCTION =
  "每收到一条新的用户消息，在其他实质行动前调用brain_think，建立本轮Brain工作上下文；它自动提供当前选择的think-workflow、Core、候选及诊断。成功建立后不重复调用；调用失败时根据实际错误及副作用判断重试，继续可完成的工作。";

export const BRAIN_FAILURE_TEMPLATE =
  "# 本轮 Brain 上下文未建立\n\nBrain 未能为这条用户消息建立工作上下文：<可公开的简短错误说明>。本轮可能缺少仍有效的决定、约束和续作状态；这次失败不表示其它能力不可用，未取得的认知也不代表已经核对。";
