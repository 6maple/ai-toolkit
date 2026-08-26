# brain 参数标定（Calibration）

> **状态：Current engineering aid / 2026-08-20**  
> 本文件不是行为契约，也不复制源码为第二份参数真相。行为边界以 `../../doc/brain/v1/bdd-brain-behavior-requirements.md` / Acceptance 为准；参数意义与机制设计以 `../../doc/brain/v1/design-brain-runtime.md` 为准；**当前数值以 `src/**` 常量为唯一实现真值\*\*。

## 1. 标定原则

参数标定只调整 Design / Calibration 已明确允许变化的数值，不改变 Frozen public behavior。

推荐流程：

1. 选择一个参数和一个明确的真实 failure mode / quality signal；
2. 修改源码中的单一参数；
3. 运行 `pnpm test`、`pnpm run typecheck`，确认 Frozen behavior 仍成立；
4. 用真实使用数据或专门的 calibration experiment 观察效果；
5. 达到稳定结论后，把最终取舍记录回 Engineering Design 的 calibration 部分。

Acceptance tests 不锁 calibration 数字；Invariant/Mechanism tests 可以读取当前 Design 值验证“配置确实被执行”。

## 2. 当前参数索引

### `src/memory/store.ts`

| 参数                     |  当前值 | 作用                                             |
| ------------------------ | ------: | ------------------------------------------------ |
| `CORE_DOC_MAX_CHARS`     |  `4000` | 单层 core 文档容量保护；越界 mutation 原子拒绝。 |
| `STABILITY_GOOD`         |   `2.2` | successful-use review 的 stability 增益。        |
| `STABILITY_AGAIN`        |   `0.4` | failed/corrected-use 的 stability 调整。         |
| `STABILITY_HARD`         |   `1.2` | read/exposure review 的较弱 stability 调整。     |
| `DIFFICULTY_GOOD_DELTA`  | `-0.05` | successful-use 对 difficulty 的调整。            |
| `DIFFICULTY_AGAIN_DELTA` |  `0.15` | failed/corrected-use 对 difficulty 的调整。      |

### `src/memory/core.ts`

| 参数                   | 当前值 | 作用                                                                            |
| ---------------------- | -----: | ------------------------------------------------------------------------------- |
| `CANDIDATE_LIMIT`      |   `10` | 单次 L0 candidate 上限；具体数字属于 Design/Calibration，不是 public contract。 |
| `EXPOSURE_ALPHA`       | `0.05` | exposure 对 candidate ranking 的机械降权。                                      |
| `QUESTIONED_PENALTY`   |  `0.1` | questioned memory 的确定性 ranking penalty。                                    |
| `PAGE_LIMIT_DEFAULT`   |  `100` | L2 默认分页上限。                                                               |
| `PROMOTE_OK_THRESHOLD` |    `3` | successful-use history 达到后产生 promotion signal。                            |
| `DEMOTE_R_THRESHOLD`   | `0.05` | demotion signal 的 retrievability 条件。                                        |
| `DEMOTE_IMP_THRESHOLD` |  `0.4` | demotion signal 的 importance 条件。                                            |

### `src/tools/sync.ts`

| 参数                              |         当前值 | 作用                                        |
| --------------------------------- | -------------: | ------------------------------------------- |
| `ADOPT_MAX`                       |          `0.2` | adopt importance delta 上界。               |
| `CORRECT_MIN` / `CORRECT_MAX`     | `-0.3 / -0.05` | correct 合法 delta 区间。                   |
| `ATTRIBUTE_MIN` / `ATTRIBUTE_MAX` |    `-0.15 / 0` | attribute 合法 delta 区间。                 |
| `DAMPING_IMP`                     |          `0.8` | 高 importance correction damping 的触发点。 |
| `DAMPING_CORRECT_MIN`             |         `-0.1` | 高 importance item 的 correction 下界。     |

## 3. 优先观察的问题

### Candidate ranking

观察长期使用后 candidate 顺序是否兼顾“重要性”和“避免熟悉偏差”。重点联动：`EXPOSURE_ALPHA`、`QUESTIONED_PENALTY`、`CANDIDATE_LIMIT`。

### Promotion / demotion signal

观察 promotion 是否过早/过晚、demotion 是否误伤“重要但低频”的 memory。重点联动：`PROMOTE_OK_THRESHOLD`、`DEMOTE_R_THRESHOLD`、`DEMOTE_IMP_THRESHOLD`。

### Learning dynamics

观察 explicit adopt/correct 与普通 read/exposure 的长期差异是否符合实际使用。重点联动：stability/difficulty 参数；不要把 L0/L2 read 调成 successful-use 的等价事件。

### Feedback magnitude

观察模型实际提交的 importance delta 分布以及 clamp 频率。区间方向属于 Frozen behavior；可标定的是区间幅度和 high-importance damping，而不是把错误方向变成合法。

### Context economics

观察三层 core 总长度和 L0 candidate 数量对上下文质量的影响。`CORE_DOC_MAX_CHARS` / `CANDIDATE_LIMIT` 应在“足够信息”和“避免无效上下文”之间找 benefit knee。

## 4. 数据与验证边界

真实使用数据可以读取内部 state/index 作为**标定证据**，但这些字段不是 public acceptance contract。标定实验与 Manual/E2E 是否执行由项目 Test Strategy 决定。

每次参数变更至少运行：

```text
pnpm test
pnpm run typecheck
```

若涉及构建/发布边界，同时运行：

```text
pnpm run build
pnpm exec vp lint
```

参数变更如果暴露出新的产品行为歧义，应先回到 BDD 讨论并达成一致，而不是通过 calibration 静默改变语义。
