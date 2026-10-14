# 16 · 表达与 Prompt guidance 实施记录

日期：2026-09-30

## 背景

用户要求重新整理旧 `ai-think` 中可复用的 Prompt 写法与表达经验，并明确两项优先级：

- 对 model-facing guidance，正确、完整、清楚、低歧义和弱模型稳定执行优先于精简；
- 普通用户可见表达与正式报告 / 汇报写作分开，最终表达不转录内部思考过程。

讨论中先后对照当前模型 Prompt guidance 与公开 Skill 实践，并多次删除过度设计。研究资料只用于形成和校验规则，不进入最终长期方法正文。

## 已批准并实施的 model-facing 文字

用户在完整展示后批准以下实际文本：

1. `brain-ai/core.md` 的专项读取路线：
   - 普通用户可见表达每轮读取 `user-facing-expression.md`；
   - Prompt / model-facing guidance 任务读取 `instructions.md`；
   - 只有需要可独立阅读、保存、提交或转发的正式书面成品时读取 `report-writing.md`；
   - “简单汇报一下进度”仍属于普通表达，不因关键词“汇报”触发正式报告写作。
2. 重写 `instructions.md`：
   - 确定动作直接表达；
   - 判断分支明确什么条件改变动作；
   - 顺序影响结果时明确先后；
   - 关键要求不依赖背景、例子或相邻文字让模型自行推导；
   - 重要修改用正常情境、关键边界和已有代表性失败验证；
   - 精简放在最后。
3. 新增 `user-facing-expression.md`：
   - 普通回复先回答用户真正的问题；
   - 最终表达按用户需要重新组织，不按内部思考和工具执行顺序输出；
   - 技术事实先说明实际意义；
   - 较长工作只报告有意义的状态变化；
   - 完成状态按实际 evidence 范围报告。
4. 新增 `report-writing.md`：
   - 触发依据是正式书面成品的交付形态，而不是“汇报 / 总结”等关键词；
   - 先确定读者、用途、范围和可用 evidence；
   - 分别覆盖工作 / 状态报告、分析 / 研究报告、executive brief / 决策 memo；
   - 报告应脱离当前对话独立理解；
   - 不把执行流水账当作成果。

Global Core 本轮不修改；它仍只稳定读取 `brain-ai/core.md`。

## Production 同步

已同步：

- 实际 Global Brain：
  - `@global/memories/skill/brain-ai/core.md`
  - `@global/memories/skill/brain-ai/instructions.md`
  - `@global/memories/skill/brain-ai/user-facing-expression.md`
  - `@global/memories/skill/brain-ai/report-writing.md`
- 默认包：
  - `code/brain-cli/default-memories/skill/brain-ai/core.md`
  - `instructions.md`
  - `user-facing-expression.md`
  - `report-writing.md`
- `brain-cli` 安装清单由三份扩为五份；README、`llm.txt` 与测试同步。
- v7 当前架构、model-facing 草稿、默认包正文、组合审核稿及相关 CLI / runtime contract 文档同步到当前状态。

`software.md` 未修改。

## 验证

已验证：

- 实际 Global 的 `core.md`、`instructions.md`、`user-facing-expression.md`、`report-writing.md` 与默认包对应文件逐份一致；
- v7 10 与 v7 16 中四份镜像正文与默认包逐份一致；
- `code/brain-cli` 测试：2 / 2 通过；
- package 测试实际要求导出后的 `brain-ai` 目录包含五份正文；
- `git diff --check` 通过。

未验证：

- 真实模型是否在不同强弱模型上稳定选择正确 route；
- 普通“汇报一下进度”和正式项目状态报告在真实模型中的分支稳定性；
- Codex、Claude、DSH 等宿主的实际长期使用效果。

这些仍以用户实际使用反馈为准。

## 范围

本次只实现已审核的 Prompt / 表达 / 报告 guidance 及其必要安装同步。工作区中其他已存在的 staged / unstaged 修改未作为本次内容处理。
