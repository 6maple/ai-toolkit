# 默认读取策略实施记录

日期：2026-09-28。

用户针对实际使用中的漏读问题，明确要求直接读取，其他条件式读取采用同样取向，宁愿多读也不愿漏读。在旧 ai-think 对照与具体修改方案展示后，用户回复原文：“可以”。本轮按该方案实施。讨论与精确原文见工作区 `.cache/thread-review-20260928-pair/`。

## 已实施内容

- Global Core 与 CLI PACK_ROUTE 改成直接读取 brain-ai/core 完整原文。
- 当前 Project Core 三条路线改成默认立即读取，明确无关才跳过，拿不准时读取。
- 默认包 core 的历史查找和 software/instructions 入口采用同样取向；三份 description 同步，core/instructions 的 summary 与正文一致。
- instructions 明确：确定动作直接表达，必要分支再写条件；记忆默认读取。
- Brain 每轮 Core 路线、候选正文、语义与非语义发现、显式入口的后续读取、相关项目路线和失败后的获取说明同步。
- 搜索候选与记忆 description 的工具说明同步，避免重新要求先证明相关性再读取。
- v7 当前相关文档及组合正文同步；样例 Project Core 与候选描述也采用相同取向。旧研究草稿和 ai-think 备份保留历史原文。
- 实际 Global 三份方法使用 brain_edit 保留身份修订并完整回读，与默认包一致。

读取后继续根据正文的来源、适用范围与当前状态判断如何使用。宿主自动注入完整方法正文仍未实施，本次修改的是读取指令与引导。

## 验证

- Brain：vp test，14 个文件、178 项测试通过。
- CLI：node --test tests/memory.test.mjs，2 项测试通过，覆盖安装入口、冲突保护与导入导出。
- vp run build 成功，包括生产 bundle 与公开类型声明。
- 本次两个 TypeScript 文件已格式化；针对它们的 vp check 通过格式、lint 与类型检查。
- 全量 vp check 仍报告 28 个本轮未修改文件的既有格式问题，未作全仓库格式重写。
- 实际 Global 三份正文完整回读，与默认包逐份一致。
- 验证脚本确认两份规范中的六份包正文，以及八个运行时文字常量与完整组合审阅稿一致。
- git diff --check 通过。

以上证明文字同步、构建与测试覆盖的行为；没有运行模型行为回放或跨宿主接入测试，不能据此声称模型从此不会漏读。已有常驻 MCP 进程是否重新载入构建产物，未在本轮验证。

## 交付位置

完整运行时与方法正文见 [组合正文](../16-model-facing-composition-review.md)。默认包正文见 [记忆包文档](../10-default-memory-pack-design.md)。工作区修改前副本、应用脚本与一致性核对脚本在 `.cache/thread-review-20260928-pair/`。

本轮没有提交或发布。

