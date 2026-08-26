# brain v1

> **状态：Frozen / Implemented Baseline（2026-08-20）**  
> 当前 `code/brain/` production implementation、calibration 与 dated Production CI Review 仍以本目录为版本基线。v2 的新行为不能反向改变本目录已经冻结的 expectation。

## 文档

| 文档 | 职责 |
|---|---|
| [bdd-brain-behavior-requirements.md](bdd-brain-behavior-requirements.md) | Frozen/Re-reviewed 行为需求（What）。 |
| [brain-tools-contract.md](brain-tools-contract.md) | v1 model-visible/public `brain_*` tool contract。 |
| [acceptance-spec-brain.md](acceptance-spec-brain.md) | Frozen Specification by Example。 |
| [design-brain-runtime.md](design-brain-runtime.md) | Engineering Design（How）。 |
| [test-review-brain-production-ci.md](test-review-brain-production-ci.md) | 2026-08-20 Production CI / Compliance Review 快照。 |

## 阅读顺序

`BDD + public contract → Acceptance → Design → ../../../code/brain`

历史背景与被否方案见 [`../archive/`](../archive/)。下一版工作见 [`../v2/`](../v2/)。