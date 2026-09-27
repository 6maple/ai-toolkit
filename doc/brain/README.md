# brain 文档入口

brain 文档现在区分四层：

~~~text
base/
    跨版本根锚点：初始背景、用户目标、长期设计思想、认识论纪律

v7/
    当前正在形成的研究与设计：
    evidence → interpretation → derivation → current architecture → to validate

v1..v6/
    历史版本已经形成的 Requirements / Contract / Design / implementation truth

archive/
    更早的历史原始材料与演进 evidence
~~~

## 版本状态

| 目录 | 状态 | 用途 |
|---|---|---|
| [base/](base/) | **Stable cross-version anchors** | Brain 为什么存在、用户真正要什么、长期设计思想和认识论纪律。Base 不拥有当前版本 Architecture。 |
| [v7/](v7/) | **Active research / design** | 当前 Brain 重设计版本。正在从 LLM failure boundary、cognition research 与真实 case 推导新 architecture；尚未进入 production Prompt / implementation。 |
| [v6/](v6/) | **Implemented / Verified** | 当前 production baseline。v7 未获最终批准前，production 仍以 v6 / 当前代码现实为准。 |
| [v5/](v5/) | **Frozen predecessor / Implemented baseline** | v6 的 multi-project 前代基线。 |
| [v4/design-draft.md](v4/design-draft.md) | **Implemented in source / Manual acceptance pending** | 历史 model-facing cognition interface 调整记录。 |
| [v3/](v3/) | **Frozen full specification baseline** | 历史完整规格与实现基线。 |
| [v2/](v2/) | **Frozen predecessor** | v3 前代规格。 |
| [v1/](v1/) | **Frozen / Implemented baseline** | 早期实现基线。 |
| [archive/](archive/) | **Historical evidence** | 原始讨论、历史设计依据、旧 memory model 与被否方案。 |

## 重新设计 Brain 时怎样读

先恢复不能被当前方案改写的根锚点：

~~~text
base/README.md
→ base/01-origin-and-goal.md
→ base/02-design-philosophy.md
→ base/03-epistemic-discipline.md
~~~

然后进入当前 v7：

~~~text
v7/README.md
→ v7/01-llm-capability-and-failures.md
→ v7/02-generalist-cognition-research.md
→ v7/03-problem-representation-and-control.md
→ v7/04-model-harness-brain-boundary.md
→ v7/05-design-derivation.md
→ v7/06-current-architecture.md
~~~

需要核对具体论文、旧阶段长篇推导或迁移前 Base 工作稿时，再读 v7/research/。

需要确认“用户当时到底说过什么、历史上为什么形成某设计”时，再读 archive/。

这个顺序有意避免：

~~~text
当前实现 / 当前推导
→ 被模型误当成原始目的
~~~

## v7 当前阶段

Base / v7 第一轮文档整理已经完成；当前已获批准继续 **v7 Architecture 收敛**。

尚未获得：

- 最终 model-facing Prompt approval；
- production Brain / Harness / Tool / renderer / code 修改授权。

当前 Gate：

~~~text
完成 Base / v7 整理
→ 收敛 LLM failure → compensation architecture
→ 形成按 owner 分开的完整中文 Prompt
→ 用户审核完整实际文字
→ 用户明确批准
→ 才进入 production 实现
~~~

## 文档 authority

不同目录不能互相偷换 authority：

- Base 中的用户根目标和长期设计思想，不因 v7 当前方案变化而变化。
- v7 research 中的 search result、论文、benchmark 和项目 observation 是 evidence，不自动等于 Architecture truth。
- v7 的 interpretation / design 是当前可修正 baseline，不反向伪装成用户最初就确认的意图。
- 历史 version 只拥有对应版本的 contract / implementation truth。
- archive 说明历史事实和演进，不直接覆盖当前 contract。
- 当前 production reality 必须从真实 code / runtime / verification 取得，不根据文档标题猜测。

## 上位方法

- [base/](base/)：Brain 的跨版本根锚点。
- [v7/](v7/)：当前研究和新架构设计。
- [../design-rule.md](../design-rule.md)：复杂软件工作的设计 / 验证方法。
- [../ai-mds/agent-dev-rules.md](../ai-mds/agent-dev-rules.md)：Agent 项目的 Prompt / Context / Tool / State 分工与真实 Replay / Eval 方法。
