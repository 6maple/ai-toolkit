// Built-in views are generated on demand; they are not cognition paths.
export const BRAIN_VIRTUAL_PATHS = [
  "@brain-virtual/normal.md",
  "@brain-virtual/deep.md",
  "@brain-virtual/normal-memory.md",
  "@brain-virtual/deep-memory.md",
] as const;

export type BrainVirtualPath = (typeof BRAIN_VIRTUAL_PATHS)[number];

export function isBrainVirtualPath(path: string): path is BrainVirtualPath {
  return BRAIN_VIRTUAL_PATHS.some((entry) => entry === path);
}

export const BRAIN_PROCESSING_ENTRY = `# 处理流程

处理任何事情时，严格按照下面流程推进：

1. 理解用户字面意图。

2. 只有用户已极其详细地明确规定如何做，详细到可以写成代码执行，
   没有任何需要决策或调整表达的内容时，才可以跳过「深度思考流程」，
   使用 brain_cat 读取 @brain-virtual/normal.md，按照「常规流程」推进。

   否则，必须使用 brain_cat 读取 @brain-virtual/deep.md，严格按照「深度思考流程」推进。
`;

export const BRAIN_NORMAL_FLOW = `# 常规流程

按照用户已明确规定的做法处理当前事情，并严格按照以下流程读取和维护记忆。

1. 使用 brain_cat 读取并严格执行「记忆读取与维护要求」：
   @brain-virtual/normal-memory.md。

2. 自检是否严格按照「记忆读取与维护要求」执行。
   如果未严格执行，则进行纠正；
   必须确保严格执行后，才完成本次对用户的回复。
`;

export function renderDeepFlow(workflowPath: string): string {
  return `# 深度思考流程

> 用户信息往往描述的只是表面，而要求我们解决的往往是表面下最深处的本质。
> 所以必须对事情建立整体的理解，深挖我们找到的各类信息背后的关系链，建立起整体的、深度可靠的事件分析深挖链。

用户的消息可能省略已有背景、约束和协作期待，也可能只表达一个症状或想到的办法。意图理解会影响后续查什么、做什么以及怎样验收。本流程通过先查清完整意图，再追查实际形成关系并据此完成工作，减少用户反复解释、纠正和返工。

必须严格按照以下流程执行：

1. 结合你当前对用户信息的理解，立即向用户说明你接下来会深度挖掘其完整的意图。

2. 立即使用 brain_cat 读取并严格执行「记忆读取与维护要求」：
   @brain-virtual/deep-memory.md。

3. 立即读取并严格执行「深度思考步骤」：
  \`${workflowPath}\`。

4. 自检是否严格按照「记忆读取与维护要求」和「深度思考步骤」执行。
   如果未严格执行，则进行纠正；
   必须确保两项要求均严格执行后，才交付本轮实际结果并完成本次对用户的回复。
`;
}
