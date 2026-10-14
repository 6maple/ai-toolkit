---
description: 当前工作涉及 LLM Agent 的职责、Prompt、Context、Tool、持续工作材料、Agent 间协作或 model-visible 能力设计时读取。
summary: Agent 设计从真实认知职责和工作过程出发，组合 Prompt、Context、Tool 与持续材料形成工作面。开放语义和上下文判断交给模型，identity、routing、权限、一致性与恢复等确定性责任优先交给程序。model-visible Tool 从 Agent 实际要完成的业务动作设计，区分可复用/可发现 Tool 与封闭系统内专用 Tool；结构化只用于稳定机器语义。长程工作把模型需要继续理解的材料、程序状态和真实 artifact 分别放在合适 owner 中。Agent 协作围绕稳定责任和业务语义，不把底层 registry、ID 和 transport 变成模型不必要的认知负担。
importance: high
---

# Agent 设计

## 先定认知职责

先确定 Agent 实际负责：

- 理解什么；
- 判断什么；
- 能采取什么行动；
- 结果由谁继续使用。

认知职责确定后，再设计 Prompt、Context、Tool、工作材料和协作方式。

不要由节点名、Workflow、Graph、数据库结构或已有 API 反推 Agent 应该负责什么。

## 按真实能力分工

开放语义、自然语言、上下文关系、候选差异和需要综合判断的内容
→ 优先让模型理解和判断。

identity、routing、权限、schema validation、原子写入、幂等、一致性、持久化和恢复等确定性责任
→ 优先让程序保证。

模型已经通过语义确定业务对象后，不要求它持续复制或记忆 opaque ID；宿主能够可靠绑定的 identity 和 scope 由宿主绑定。

程序内部使用 ID、枚举或状态机
≠
模型也必须用它们作为主要工作语义。

## 组成 Agent 工作面

Agent 的实际工作面由 Prompt、Context、Tool 和持续材料共同形成。

Prompt：
{长期职责、当前工作规则、行动边界}

Context：
{当前目标、对象、事实、约束、已有工作材料}

Tool：
{取得缺失信息或采取行动的能力}

持续材料：
{后续调用仍需恢复和继续使用的语义工作状态}

核对这些部分组合以后，Agent 是否真的拥有完成职责所需的信息和动作能力。

## 输入与结果

开放语义任务优先保留自然语言或多模态表达。

只有稳定机器协议真正需要时，才增加固定字段、枚举或 schema。

不要为了程序处理方便，把完整专业意图机械拆成大量模型必须填写的字段。

结果形式按实际消费者选择：自然语言、结构化数据、文件、其它 artifact、Tool 行动或宿主提供的 UI 都可以。

一次模型调用结束、一次结果输出、业务事项完成是不同概念；按实际协作关系判断，不自动等同。

## Tool contract

设计 model-visible Tool 前先明确：

~~~text
{哪个 Agent}
→ 在 {什么工作背景} 下
→ 要完成 {什么业务动作}
→ 现有 Context / 能力为什么不足
→ 调用后模型需要得到 {什么结果或变化}
~~~

说清这些关系后，再设计名称、description、输入、结果和 schema。

Tool 首先是模型理解和使用的能力界面，不是把底层函数签名直接暴露给模型。

### 可复用 / 可发现 Tool

能力会被不同 Host、Agent 或未知调用方发现和使用
→ contract 自足地说明能力、输入、结果、重要副作用、限制、失败语义，以及为正确发现和区分所需的局部适用条件。

### 封闭 Agent 系统内专用 Tool

系统已经知道稳定责任关系和调用角色
→ 优先直接表达对应的业务责任与动作。

底层通用 transport、registry、queue、RPC、provider 或 routing 保持为内部实现，不因为底层复用就把通用基础设施接口暴露给模型。

通用操作本身就是 Agent 需要直接组合的工作原语时，可以直接暴露，例如文件读取、搜索或 shell。

## Tool guidance 的放置

Tool contract 负责说明 Tool 本身。

跨 Tool、跨情境长期成立的角色目标、职责、授权、协作和 selection policy 放在 Agent instructions 更合适时，由 instructions 拥有。

当具体 placement 依赖模型、provider、Tool discovery 或 runtime 行为
→ 取得当前官方资料，并用实际模型行为验证。

不要在多个位置维护两套完整且可能漂移的规则。

## 持续工作的材料

主要给后续模型继续理解和修改的认知、计划、假设、问题或研究材料
→ 优先使用模型易读的语义材料。

程序必须确定查询、校验、原子更新或恢复的状态
→ 使用适合机器处理的结构化状态。

项目正式结果
→ 保持在对应 canonical artifact。

三者不要互相冒充。

新的 Agent execution 能从可靠事实、工作材料和真实 artifact 恢复工作时，不要求同一个模型实例长期存活。

## Agent 间协作

稳定专业责任已知
→ 优先提供直接表达该责任的协作能力。

调用 Agent 负责说明当前问题和必要背景，并判断怎样使用返回结果。

宿主负责把已确定的责任绑定到正确 identity、execution 和 routing。

只有机器协议确实要求时，才让 Agent 直接操作 registry、目标 ID 或通用消息协议。
