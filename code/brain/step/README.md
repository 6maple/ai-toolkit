# brain_step

三阶段深度思考控制器：持续深挖用户完整意图 → 持续深挖事情本质 → 研究专业方法、计划、执行和验收。三阶段承接同一份当前 State。

本目录将经过 A–D 两轮验证的 quality 候选纳入版本控制。工具定义、方法、返回指导及状态转换沿用受测版本；提交指导从审核文档逐字提取为 `guidance/submissions.json`，运行时不依赖审核稿或本机工作目录。

## 宿主注册

`brain_step` 已并入 `PUBLIC_BRAIN_TOOLS` 和 `registerBrainTools`，与其它 `brain_*` 工具一起注册。Codex、Claude 和 DSH 插件通过现有公共入口使用同一实现。下面的单工具注册 API 留给独立嵌入方。

```js
import { registerBrainStep, createFileRuntime } from "brain/step";

registerBrainStep(
  server,
  createFileRuntime({
    async resolveHost(extra) {
      // 从当前宿主的可信调用上下文取得；不能由模型提交或猜测。
      return resolveCurrentHostContext(extra);
    },
  }),
);
```

`resolveHost` 必须返回真实 `conversationId`、真实 `turnId` 和当前工作目录的绝对 `sourceRoot`。默认 [模型入口](../think-workflow/brain-ai/index.md) 已使用三阶段工具流程。

公共注册入口从可信 `BrainToolInvocation.stepHost` 取得这些信息；普通 MCP 宿主也可以在调用信封的 `_meta.threadId`、`_meta.turnId` 中提供身份，目录由当前服务绑定。它们不是模型业务参数。Codex 由 UserPromptSubmit 保存会话/轮次；DSH 使用实际 agent ID 和最新用户 splice 序号；Claude 由会话环境标识和 UserPromptSubmit 绑定取得轮次，SessionEnd 清理过期绑定。

宿主未提供有效身份时，brain_step 返回失败并保持原状态；其它 cognition 工具继续可用。Claude 较旧版本可能没有 `CLAUDE_CODE_SESSION_ID`，清空/恢复后保留旧 MCP 进程的场景也须重新连接到正确会话；不能用固定标识或扫描其它会话代替。

独立 CLI 通过 [brain-skill](../../brain-skill-toolkit-cli/README.md) 的 `step --input-file` 接入本 runtime，schema 和业务指导沿用本模块。它从真实宿主会话标识建立独立 CLI 绑定，每次成功 think 分配逻辑轮次；不会假定宿主安装了恢复 hook。

## 动作与保存

- `start`：以宿主轮次开始本轮；同轮同消息重复调用保留进展，新轮清空旧工作内容。
- `status`：取得当前阶段、当前所需成果、方法及提交要求。
- `overview`：取得同一 State 的整体目标、关系、计划、结果和未知。
- `update`：保存最新修订、任务和进展；重要变化报告实际 `impact`。
- `submit`：记录继续、转换、回查、执行核对、完成或交接判断。

State 路径为 `{sourceRoot}/.brain-working/brain-step-three-phase/{SHA256(conversationId)}.json`。它是本地工作状态，不是新的 Brain cognition scope。阶段切换不复制或清空成果；新轮初始化才重置本轮内容。

每次调用读取当前文件；成功变更经临时文件与原子替换保存。被拒绝的请求不部分应用；查询不写文件，保存失败不返回成功。该实现沿用每会话串行调用的约束，不提供并发写入合并。

## 质量与验收边界

程序维护阶段、真实任务 ID、检查失效和持久化；开放调查、授权与依赖判断、语义验收仍由模型完成。`passed` 是模型提交的判断，不是程序独立认证。

`replyDraft` 实际修改或清空使成果验收和流程检查失效；相同内容不失效。变更范围、方法或验收目标也会使执行核对失效。上游影响优先于同次完成判断，实际成果保留。

成功结果沿用受测的 `structuredContent`，并在文本中返回同一对象的 JSON；失败返回 `isError` 和具体纠正指导。这是 `brain_step` 的契约，区别于已有 cognition 工具的纯文本结果。

模型验证支持给定四个小型任务的主要本地成果，尚未证明开放复杂任务的持续最深追溯、长期用户认识学习或本次新增提示词的独立增益。原生注册、插件轮次绑定及打包资源另由确定性检查覆盖；尚未追加真实模型的正式插件使用验证。
