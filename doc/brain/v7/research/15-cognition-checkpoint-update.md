# Cognition checkpoint 与 semantic recall 时序实施记录

日期：2026-09-29

## 批准范围

用户在完整展示并多轮审查两份最终稿后明确指示：“按这两份最终稿实施”。实施范围是：

- brain-ai/core.md：两阶段每轮 cognition checkpoint、主动 semantic recall 时序、本轮计划/后续推进分离、Brain 维护闭环及示例；
- Brain Harness 每轮静态文字：收窄为确定性读取、候选/角色和工具接口语义，不再拥有主动 recall 的认知触发；
- 对应默认记忆包、实际 Global Brain 与 v7 文档镜像。

## 实施结果

- code/brain-cli/default-memories/skill/brain-ai/core.md 已替换为批准稿。
- 实际 Global @global/memories/skill/brain-ai/core.md 通过 brain_edit 保留 cognition identity 同步；与默认包 SHA-256 完全一致。
- code/brain/src/integration/model-facing-text.ts 已收窄静态协议；semantic/no-semantic 分支只说明实际工具能力。
- doc/brain/v7/08-model-facing-and-memory-text-draft.md、10-default-memory-pack-design.md、16-model-facing-composition-review.md 已同步完整文字。
- doc/brain/v7/06-current-architecture.md 已记录两阶段 checkpoint、stable route 与 active discovery 的当前 owner/timing 边界。

最终时序：

    deterministic route / provided candidates
    -> 认知更新 / 初步判断 / 关联记忆 / 本轮计划
    -> active semantic discovery
    -> reality evidence / execution / verification
    -> 当前判断 / 后续预判 / 关键存疑 / Brain 维护 / 后续推进

其中 stable route 和已提供候选不依赖模型先意识到缺口；主动 semantic discovery 由 provisional frame 和 recall need 驱动。无需搜索、没有关键存疑都不能只依赖模型主观 confidence。

## 核对

- git diff --check：通过。
- code/brain 测试：14 个 test files、180 项测试全部通过。
- code/brain production build：通过。
- code/brain typecheck：通过。
- code/brain-cli tests：2 项全部通过。
- 实际 Global core 与默认包 core SHA-256：一致。

未进行真实模型行为回放或跨宿主人工验证；该效果仍由用户实际使用继续观察。