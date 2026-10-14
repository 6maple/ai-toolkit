---
description: Global Core指向的记忆读取方法；立即读取完整原文，并按其中路线取得当前适用的专业记忆。
summary: 记忆读取默认沿已提供路线和候选取得完整正文，只有明确无关才跳过，拿不准时读取；必读指令直接执行。专业方法保留原读取条件，已知路径直接读取，发现方式按实际可用工具选择。读取、检索和保存不提高证据效力，暂不可得时保留缺口并继续独立工作；相关项目Core按原范围取得。本文不规定思考流程或依赖workflow步骤。
importance: high
---

# 记忆读取与使用

## 已提供路线与候选

本轮实际提供的Global Core和当前Project Core是稳定的记忆读取路线；Core为空时，该范围没有路线可执行。

直接执行Core中的必读指令；默认沿其余已提供路线按准确路径读取完整正文，只有明确与当前工作无关时才跳过，拿不准时读取。本轮已经提供的候选记忆同样先按description判断对象和范围；明确无关才跳过，拿不准时读取正文。

准确路径读取、续读、超长内容恢复以及失败后的替代获取方式，按本轮实际Brain工具说明执行。暂时取不到某项cognition时，不把它当成已经读过；继续仍有依据且不依赖缺失内容的工作。

取得正文后，按其来源、对象、条件及当前状态判断怎样使用。读取、检索或保存不会提高原信息的证明效力。

## 专业记忆

立即读取 @global/memories/skill/brain-ai-test/user-facing-expression.md。

默认立即读取 @global/memories/skill/brain-ai-test/software.md；只有当前工作明确与软件、代码、工程实现和工程判断都无关时才跳过，拿不准时读取。

当前工作涉及 LLM Agent 的职责、Prompt、Context、Tool、持续工作材料或 Agent 间协作
→ 立即读取 @global/memories/skill/brain-ai-test/agentic-software.md。

当前工作需要编写、修改或审查给模型执行的Prompt、system / developer instruction、AGENTS.md、规则、规范或其它model-facing guidance
→ 立即读取 @global/memories/skill/brain-ai-test/instructions.md；拿不准时读取。

当前工作需要产出、修改或审查可独立阅读、保存、提交或转发的正式书面成品
→ 立即读取 @global/memories/skill/brain-ai-test/report-writing.md。普通问答、普通分析回复和对话中的简短进度汇报不读取。

## 发现历史认知

已知准确路径时直接读取；需要发现其它历史cognition时，使用本轮实际提供的发现工具。各工具的搜索范围、结果限制和失败退路以对应工具说明为准。

本轮提供brain_ask_search且尚无准确路径，需要按语义发现历史cognition
→ 使用brain_ask_search。

已知正文词句
→ 使用brain_grep。

已知scope、角色、目录或文件名线索
→ 使用brain_glob。

发现结果仅为候选；需要正文支持判断时，用brain_cat取得完整内容，再按其实际条件使用。

## 相关项目

Global cognition跨项目继续使用；Project cognition用于对应项目。

相关项目的普通cognition可通过实际提供的发现能力取得；相关Project Core不自动加载。准备依据相关项目当前状态作判断或处理其文件时，按本轮提供的准确路径读取该项目Core，再使用其中适用的路线。
