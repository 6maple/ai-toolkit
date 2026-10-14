// Approved tool wording from doc/brain/v7/16-model-facing-composition-review.md.
export const BRAIN_TOOL_DESCRIPTIONS: Record<string, string> = {
  brain_think:
    "建立本轮 Brain 工作上下文，自动读取当前配置选定的think-workflow，返回实际取得的流程、Core、候选和诊断。仅在模型负责显式调用的模式暴露；每条新用户消息后、其他实质行动前调用。成功后不重复调用；失败时根据错误与副作用判断是否重试，并继续可完成的工作。",
  brain_cat:
    "按准确路径读取一份 Scope Core 或 archival 记忆。结果按稳定的 1 起始逻辑行分页；返回 `next_offset` 时从该位置续读。archival 结果包含当前可用的争议状态。",
  brain_ls:
    "已知记忆目录时列出直接子项。结果有限且不可分页；根据路径、描述和状态识别候选；默认按路径读取完整正文，只有明确无关时才跳过，拿不准时读取。被截断时缩小范围或改用其他发现工具。",
  brain_glob:
    "已知 scope、角色、目录或文件名线索时，按完整公开路径匹配活跃 archival 记忆。返回的是有限候选；命中后按路径读取正文，截断时缩小范围重查。",
  brain_grep:
    "已知词句或文本模式时，在活跃 archival Markdown 中查找匹配片段，包括正文。片段用于定位；候选默认按路径读取完整正文和条件，只有明确无关时才跳过，拿不准时读取。结果截断时缩小范围重查。",
  brain_ask_search:
    "需要按意思寻找尚无准确路径的历史认知，且本轮提供该工具时，用自然语言描述当前对象、动作与要找的过去决定、约束或经验。只搜索活跃 archival 记忆的 `summary`，按记忆返回有限候选；每条显示路径、说明何时值得读取的 `description`、概括正文认识的 `summary` 和可用的争议标记。记忆缺少摘要或细节只在正文中时可能漏掉；相似度排名和摘要都不判断当前适用性，未出现也不证明不存在。默认用 `brain_cat` 读取候选的完整记忆与当前争议；只有明确无关时才跳过，拿不准时读取。查找正文中的明确词句用 `brain_grep`，枚举路径模式用 `brain_glob`。",
  brain_absolute_path:
    "将有效的 Brain 公开位置映射为供文件工具使用的绝对路径。只返回路径，不读取或创建目标；也不保证目标存在。",
  brain_write:
    "在准确的 archival 路径创建新认知，或有意以不同认知替换原有内容。替换不会继承原记忆的争议和学习连续性；修订同一认知用 `brain_edit`。此工具不写 Core。",
  brain_edit:
    "修订一份已有 Core 或 archival 记忆并保留其身份。Core 只保存每轮必须直接可见的少量指导与稳定读取路线，详细方法放在 archival。非空 Core 使用准确匹配的 `edits`；空 Core 才能用 `content` 初始化。更新 archival 的结论且影响概述时同步更新 `summary`，适用条件变化时同步更新 `description`。",
  brain_mv:
    "将同一份 archival 记忆移动到另一准确路径，保留身份与适用的连续状态。目标已存在时会被替换，先检查目标；不移动 Core 或目录。",
  brain_rm:
    "删除一份准确路径上的活跃 archival 记忆。成功后它不再参与每轮候选呈现、发现或准确读取；不删除 Core、目录或配套文件。",
  brain_feedback:
    "对现有活跃 archival 记忆记录已验证的成功使用、当前未解争议，或解除已解决争议。只改变学习／争议状态，不改写正文、描述、重要性或路径；各 `feedback` 值的成立条件以参数说明为准。",
};

export const BRAIN_TOOL_FIELDS: Record<string, Record<string, string>> = {
  brain_think: {},
  brain_absolute_path: {
    path: "（必填）：要映射的有效 Brain 工作区位置。可填内置 scope 根（`@global`、`@project`）或已配置的 `#alias`，也可填其 Core、memories 树，或记忆角色目录以下的安全路径。使用正斜杠；不接受路径穿越和 scope 内部管理路径。返回绝对文件系统路径；目标可以尚不存在，调用不会读取或创建目标。",
  },
  brain_ls: {
    path: "（必填）：要列出直接子项的 archival 目录。使用 `<scope-root>/memories/`、`<scope-root>/memories/{decision,knowledge,intention,skill}/` 或角色目录以下的子目录。不能填裸 scope、Core 或具体 `.md` 文档。结果有限且不可分页，包含子目录与活跃记忆的公开路径、`description`、可用的状态；截断时缩小目录或换发现工具。",
  },
  brain_glob: {
    pattern:
      "（必填，非空）：匹配候选**完整公开路径**的 glob，包括 scope 根和 `.md` 文件名。可用 `*`、`**`、`?`、字符类等；例如 `**/testing-*.md` 或 `@project/memories/decision/**/*.md`。只匹配活跃 archival 文档，不匹配 Core、目录或普通工作区文件。用正斜杠。",
    path: "（可选）：搜索前缩小范围的 archival 目录，允许的目录形式同 `brain_ls.path`；省略时查 Global、当前 Project 和可用相关 Project 的记忆。它是目录范围，不是单个 `.md` 文档。返回有限、不可分页的路径与读取引导；截断时缩小 `path` 或 `pattern` 再查。",
  },
  brain_grep: {
    pattern:
      "（必填）：要在活跃 archival Markdown 内容中查找的表达式。默认按正则表达式解析，非法正则是输入错误；要按普通文字查找时设 `literal=true`。默认区分大小写。",
    path: "（可选）：搜索的 archival 目录范围，允许的目录形式同 `brain_ls.path`；省略时查 Global、当前 Project 和可用相关 Project。不能填 Core 或单个文档。",
    glob: "（可选）：相对于每个选定搜索根的文件 glob，用于进一步过滤被搜索的 archival `.md` 文档；它与 `brain_glob.pattern` 匹配完整公开路径的规则不同。省略时不作此过滤。使用正斜杠。",
    ignoreCase: "（可选，布尔）：`true` 时不区分大小写；省略或 `false` 时区分。",
    literal: "（可选，布尔）：`true` 时把 `pattern` 当普通文字；省略或 `false` 时按正则表达式。",
    context:
      "（可选，非负整数）：在每条命中行前后显示多少条逻辑行片段；省略或 `0` 时只显示命中行。结果有限且不可分页，片段用于定位；候选默认用 `brain_cat` 读取完整正文，只有明确无关时才跳过，拿不准时读取；截断时缩小条件。",
  },
  brain_ask_search: {
    query:
      "（必填，非空）：用自然语言描述“当前对象和动作＋要找的过去决定、约束或经验”，按当前要找的对象聚焦查询，不机械复制用户消息；新线索改变搜索对象时可调整查询。内部只查活跃 archival 记忆的 frontmatter `summary`；正文不参加语义搜索。结果是有限的记忆级候选，每份最多出现一次，显示路径、说明何时读取的 `description`、概括正文当前认识的 `summary` 和可用的争议标记。排名与摘要都不证明当前适用；记忆缺少摘要或细节只在正文时可能漏掉，未出现也不证明不存在。候选默认按路径调用 `brain_cat` 读取完整正文和当前争议；只有明确无关时才跳过，拿不准时读取。已知具体词句用 `brain_grep`，已知路径模式用 `brain_glob`。\n\n  例如，用户说“帮我规划个人网站”，本轮缺少可能影响方案的既有个人目标时，可查询“个人网站规划：过去确定的展示目标、目标受众与表达偏好”。查询只是寻找候选；命中后按路径读取正文，未命中时继续使用本轮已有资料，不据此断言过去没有相关决定。",
  },
  brain_cat: {
    path: "（必填）：准确的一份 cognition Markdown。可填 `<scope-root>/core.md` 或 `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`。不能填裸 scope、目录或非 `.md` 路径；相关项目的 `#alias` 要写实际值。",
    offset:
      "（可选，正整数）：从第几条逻辑行开始，首行为 `1`；省略时从第 1 行开始。续读时准确传入前次结果的 `next_offset`。超出末尾时返回空行且无后续位置。",
    limit:
      "（可选，正整数）：本次最多请求多少条逻辑行；省略时用默认值。传输预算可能使实际返回少于请求值，以 `next_offset` 判断是否续读。能容纳的一行会完整返回；单行过大时仅返回标为不完整的片段，`next_offset` 会走到后续行，不能据此认为该行已经读全。若该行影响判断，按结果给出的恢复位置用 `brain_absolute_path` 和宿主文件工具取得原文。archival 读取同时呈现可用的当前状态和争议。",
  },
  brain_write: {
    path: "（必填）：要创建或有意替换的准确 archival 路径，形式为 `<scope-root>/memories/{decision,knowledge,intention,skill}/<relative-item-path>.md`。scope 决定连续使用范围，角色目录记录认知角色。不能填 Core、裸 scope、目录或非 `.md` 路径。已有内容被替换时不继承原记忆的争议和学习连续性；修订同一认知用 `brain_edit`。",
    content:
      "（必填）：完整 archival Markdown，包含非空正文及以下 YAML frontmatter：\n\n  ```yaml\n  ---\n  description: <何时应该读取这份认知>\n  summary: <正文当前记录的主要认识及必要边界>\n  importance: low | medium | high | critical\n  ---\n  ```\n\n  每次写入都提供 `description` 和 `summary`。`description` 写清适用的任务、问题或条件，帮助模型辨认对象和范围；候选默认读取，只有明确无关时才跳过，拿不准时读取；`summary` 概括正文当前记录的对象、主要认识及会改变适用性的边界，是 `brain_ask_search` 的唯一语义索引输入。二者都要由正文支持，不能把未证实的解释写成结论；摘要不能代替正文。正文保留结论成立的条件、关键依据及尚未证实的原因。这里的摘要填写要求仅来自模型可见描述，不增加缺摘要即拒绝写入的校验门槛；旧记忆可读取、编辑和按文字搜索，但缺摘要时不参加语义发现。`importance` 表示该认知适用却未被想起时合理预期的遗漏后果：`low` 为影响很小且易恢复，`medium` 为有意义但通常可恢复的返工或误判，`high` 为重要结果的实质改变或显著成本，`critical` 为严重、不可逆或不可接受的后果。按合理预期判断，不按遥远最坏情形；它不代表新旧、频率、适用范围、确定性、可检索性或本轮相关性。",
  },
  brain_edit: {
    path: "（必填）：现存的准确 Core 或 archival 文档路径，格式同 `brain_cat.path`；裸 scope、目录、非 `.md` archival 路径及缺失目标不可编辑。",
    edits:
      "（与 `content` 二选一）：非空的准确替换列表。每项 `oldText` 是当前原文中恰好出现一次的非空完整片段，按字面匹配空格和换行，取足够上下文以唯一定位；`newText` 是替换文字，可含 Markdown 和换行，空字符串表示删除。各 `oldText` 均在**同一份修改前原文**上匹配，不能重叠，不依赖前一项的结果；任一项无效则整次替换不生效。非空 Core 必须使用 `edits`；若有意整体重写，以完整当前 Core 作为一项 `oldText`。archival 每次更新都核对 `description` 与 `summary` 是否仍与正文一致；适用条件或认识变化时在同次编辑中同步修订，旧记忆缺少摘要时据正文补写。",
    content:
      "（与 `edits` 二选一）：同一现存认知的完整修订 Markdown。只有空 Core 可用它初始化；Core 不需要 archival frontmatter，只保留常驻所需的最少触发条件、准确路径和用法。archival 可用完整正文整体修订，保留完整 frontmatter、非空正文及当前已知结论、条件和证据。每次更新都核对 `description` 与 `summary`，旧记忆缺少摘要时据正文补写；适用条件或认识变化时同步修订对应字段。重要性只在合理预期遗漏后果改变时调整。此操作保留同一认知的身份与适用连续性，不创建缺失文件；此处的摘要填写要求不新增 schema 拒绝门槛。",
  },
  brain_rm: {
    path: "（必填）：现存活跃 archival 的准确路径，形式同 `brain_write.path`。不能填 Core、裸 scope、目录、非 `.md` 路径或缺失目标。删除后该记忆不再参加本轮候选、发现或准确读取；普通目录和配套资产不由此删除。",
  },
  brain_mv: {
    src: "（必填）：现存活跃 archival 的准确来源路径，形式同 `brain_write.path`；不能填 Core、裸 scope、目录、非 `.md` 路径或缺失目标。",
    dst: "（必填）：不同的准确 archival 目标路径，形式同 `brain_write.path`。可改变 scope、角色或相对路径；目标可尚不存在，已存在时该目标认知会被替换，不会合并。移动保留来源认知的身份、当前争议和适用的学习连续性，正文不改写；不移动 Core、目录或普通资产。",
  },
  brain_feedback: {
    path: "（必填）：要反馈的现存活跃 archival 准确路径，形式同 `brain_write.path`；不能填 Core、裸 scope、目录、非 `.md` 路径或缺失目标。",
    feedback:
      "（必填，`adopt|question|resolve`）：`adopt` 只在该认知实际指导了行动或决定，且观察结果支持其在已测试条件内有效时记录；仅阅读、提及、同意、计划使用或任务总体成功都不够。成功不扩大适用范围；若认识改变，先用 `brain_edit` 修改正文；已有争议仍保留。`question` 在具体反例或矛盾实质挑战正文含义、依据、条件、确定性或承诺且仍未解决时，设置或替换完整当前争议；仅不清楚本轮条件是否成立时先调查条件。`resolve` 仅在已有当前争议被解决后解除；解决改变正文时先编辑，解除本身不记录成功使用。",
    challenge:
      "（`feedback=question` 时必填、非空）：完整说明当前被挑战之处及仍未解决之处；去掉首尾空白，替换旧的当前争议，不追加历史。`adopt`、`resolve` 时省略；若传入也会被忽略。反馈只改变学习或争议状态，不改正文、`description`、`summary`、`importance`、路径或认知角色。",
  },
};
