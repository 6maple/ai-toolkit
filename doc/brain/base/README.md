# Brain Base

`base/` 只保存 **跨版本稳定的根锚点**：为什么要做 Brain、用户真正希望得到什么（包括借助 Brain 和 Harness 追求更可靠的高水平通用思考能力）、用户明确确认的长期设计思想，以及研究和设计 Brain 时必须遵守的认识论纪律。

它不是当前版本的研究区，也不是某个版本的 Architecture / Prompt / implementation owner。

## 与 archive / v7 / version 的关系

```text
archive/
    历史原始材料与当时证据
    用来回答“当时实际说过什么、发生过什么”

base/
    用户拥有的跨版本根锚点
    用来回答“为什么做、真正要什么、设计时不能忘什么”

v7/
    当前阶段可修正的研究与设计
    evidence → interpretation → derivation → current architecture → to validate

v1..v6/
    对应历史版本已经形成的 Requirements / Design / implementation truth
```

Base 不因为新的研究结论而自动扩张。一个结论即使很有道理、很稳定，只要它回答的是“当前我们认为 Brain 应怎样设计”，就属于当前版本而不是 Base。

判断一句话是否应该进入 Base，可以问：

> 如果当前 v7 的设计全部被推翻，这句话是否仍然准确描述用户为什么做 Brain、真正希望得到什么，或者用户明确要求设计过程始终遵守什么？

只有答案仍然是“是”，才适合进入 Base。

## 阅读顺序

快速恢复根背景时：

```text
01-origin-and-goal.md
→ 02-design-philosophy.md
→ 03-epistemic-discipline.md
→ 04-fact-intent-expression-model.md
```

其中 [04](./04-fact-intent-expression-model.md)完整保留用户已确认的深度思考根本目的、本质模型及缓存例子；继续设计或审查思考方法时，应完整读取模型和示例。

然后才进入当前版本，例如：

```text
../v7/README.md
```

需要核对历史原始表达时，再进入：

```text
../archive/
```

## Base 的 authority

Base 中主要保存三类内容：

1. **用户明确拥有的目标、约束和设计取向**；
2. **可以从历史材料直接追溯的初始背景**；
3. **用户明确要求长期遵守的分析 / 设计纪律**。

外部研究、仓库现状、模型实验、benchmark、AI 的综合推论和当前架构方案都不是 Base authority；它们进入当前版本，并保留各自 evidence 与 uncertainty。

## 维护纪律

- 不从当前实现反推初始目的。
- 不把 AI 后来形成的解释包装成用户最初就确认的意图。
- 不因为某条研究结论长期可能有效，就把它升级成 Base。
- 用户明确改变根目标、设计思想或认识论要求时，才修改对应 Base owner。
- 同一根概念只保留一个 canonical owner；当前版本只引用，不复制成第二份长期定义。
