# brain v2 Detailed Design — Auxiliary Git History Checkpoint

> **Layer:** Phase 5B Detailed Design child。
> **System owner:** E3 Auxiliary Git History。
> **Parent:** `design-brain-system.md`。
> **Inputs:** Frozen Requirements / Contract / Acceptance；E1 canonical brain workspace；B4 anchor checkpoint opportunity。
> **Children:** none。
> **Status:** **Design Frozen (2026-08-24, evidence-corrected re-freeze)**；canonical v2 Detailed Design baseline。
> **Compatibility boundary:** 不为 v1 history/layout提供 migration；Git不可用时仍必须能够使用 current cognition。

---

## 1. 本文职责

E3 只提供：

> 当 Git 当前可用时，为 brain workspace 形成便于人和工具查看/恢复的版本 checkpoint。

Git 不拥有：

- current cognition truth；
- Tool success；
- semantic rollback；
- scope initialization；
- concurrency correctness；
- auxiliary learning correctness；
- custom pending/recovery lifecycle。

Canonical distinction：

```text
brainRoot working files
→ current workspace truth

Git commit when successfully formed
→ optional historical recovery point
```

没有 commit / staging失败 / Git CLI不可用，都不能让本来合法的 cognition read/write/anchor失效。

---

## 2. Concrete module boundary

Current implementation可保持简单：

```text
src/git/checkpoint.ts
```

职责：

- 检测/初始化 app-owned repo when possible；
- 在 anchor checkpoint opportunity 时 capture current workspace；
- 返回 technical outcome；
- 写 technical diagnostics。

不再需要 ordinary mutation `stageAffected` port，也不需要 E2 Git dependency。

系统 Git CLI 是合理 baseline；exact binary/version/CLI flags/retry tuning属于 implementation。

---

## 3. Repository availability

`brainRoot` 是 current workspace，不因为 Git 状态改变身份。

### 3.1 No repository yet

如果 `<brainRoot>/.git` 不存在：

```text
Git CLI available
→ best-effort git init current brainRoot
→ configure fixed local identity
→ history available

Git unavailable / init fails
→ history unavailable diagnostic
→ cognition continues
```

已有 working files **不阻止**初始化；它们就是第一次 checkpoint 应 capture 的 current workspace。没有必要要求“fresh empty brainRoot 才能 git init”。

### 3.2 Existing repository

若 `.git` 存在但当前不能正常 add/commit（例如 external operation、index lock、repo damage）：

- 不 reset/switch/repair working files；
- 本次 checkpoint outcome = failed/unavailable；
- current workspace保持原样；
- 后续 anchor仍可再次获得 checkpoint opportunity。

不把 Git health变成 runtime serving gate。

---

## 4. Git process boundary

Git subprocess输入只来自 app-owned `brainRoot` 与固定 arguments：

- 不拼 shell command；
- non-interactive；
- fixed local author/committer identity；
- commit message不来自模型；
- raw stderr/absolute paths不进入 model-visible output。

当前 fixed metadata可为：

```text
name    = brain
email   = brain@local
message = brain: cognition checkpoint
```

具体措辞可以 implementation-managed；它不是 cognition semantics。

Commit timestamp不参与 aging/ranking。

---

## 5. Checkpoint API

```ts
export type CheckpointOutcome =
  | { readonly kind: "committed" }
  | { readonly kind: "no-change" }
  | { readonly kind: "unavailable"; readonly diagnostic: TechnicalDiagnostic }
  | { readonly kind: "failed"; readonly diagnostic: TechnicalDiagnostic }

function checkpointWorkspace(): Promise<CheckpointOutcome>
```

只由 B4 / hook-equivalent anchor给一次 opportunity。Ordinary write/edit/mv/rm/cat 不调用 E3。

一个 anchor至多调用一次。

---

## 6. Checkpoint algorithm

Conceptual baseline：

```text
1. ensure repository if possible
2. stage current brain managed workspace state
3. if index has no effective change → no-change
4. commit one checkpoint
5. committed
```

Staging在 checkpoint 时直接 capture **当前 workspace**，而不是依赖 ordinary operations提前维护 Git index。

应包括：

```text
global/**
projects/**
```

因此通过 `brain_absolute_path` + host ordinary filesystem tools维护的 memory assets，也能随下一 checkpoint自然进入 history。

`.git/**` 自身不作为 content stage target。

当前实现可以使用等价于：

```text
git add -A -- global projects
```

的做法；exact command不是 Design truth。

---

## 7. Failure semantics

任何 Git step失败：

```text
current cognition/workspace unchanged
→ checkpoint outcome failed/unavailable
→ technical log / optional concise degraded warning
```

不：

- rollback cognition；
- rollback auxiliary learning；
- create pending marker；
- create recovery commit；
- require user/model retry；
- stop Tool serving；
- auto reset/checkout/delete current files。

因为 Git只是 history enhancement，本轮 history丢失或延后是可接受 degradation。

---

## 8. Concurrency

多个 project processes可能同时尝试 checkpoint 同一 Git repo。Git index/ref lock本身是技术共享资源。

当前 Design只要求：

- 不以破坏 current working files的方式“修复” Git contention；
- 一个 checkpoint能正常完成就形成历史；
- contention/lock failure则本次 checkpoint失败并退出；
- 不为提高 checkpoint成功率引入 cross-process business lock、queue、daemon或 durable retry state。

下一真实 anchor自然再次提供机会。

因此 checkpoint **不需要**持有 E2 global semantic lease。它记录的是调用时当前 workspace 的一个可用历史快照，不承诺精确对应某个单独 anchor transition。

---

## 9. Startup / restart

Runtime startup：

- working files始终按 E1/C1 current truth解释；
- 不要求 clean index/worktree；
- 不依据 Git status决定 cognition validity；
- 不自动 reset/restore/commit；
- 可以 best-effort 准备 E3 repository，但失败不阻塞 runtime。

正常 restart后，未 checkpoint 但已成功的 current cognition仍由 working files保留。

---

## 10. Human inspectability / recovery

当 Git checkpoint真实存在时，普通 Git history可以帮助用户/开发者：

- 查看 diff/log；
- 理解过去 workspace版本；
- 手工恢复某个旧资源。

brain public tools不再包装一套 restore/recycle API，也不声称“任何被 replace/rm 的 cognition 一定可从 Git恢复”。只有真实进入过 commit 的版本才有这份额外依据。

---

## 11. Error / diagnostic boundary

E3不把 Git failure升级成 cognition-domain exception。Internal implementation可以区分：

```text
cli-unavailable
repo-init-failed
stage-failed
commit-failed
contention
external-operation-active
```

这些用于 logs / optional concise warning。Model-visible message只需表达：

> current cognition succeeded/restored, but this history checkpoint was not recorded.

不暴露 SHA、absolute path、raw command/stderr。

---

## 12. Coding constraints

1. E2/B2/B3 不依赖 E3；
2. no per-operation stage contract；
3. checkpoint at most once per anchor；
4. add/commit failure never rolls back current state；
5. no Git-based semantic before-state；
6. no clean-worktree startup gate；
7. no auto reset/repair；
8. no pending-history/recovery FSM；
9. no custom `history.jsonl` / recycle store；
10. Git lock/retry tuning stays implementation-local；
11. checkpoint can capture non-Markdown assets in managed workspace。

---

## 13. Required tests

- no Git CLI / init failure → runtime/cognition still usable；
- existing uncommitted working files survive setup unchanged；
- checkpoint captures current Markdown + memory assets；
- no-change checkpoint creates no empty commit；
- commit failure leaves working files untouched；
- ordinary write/edit/mv/rm/cat performs no E3 call；
- anchor makes at most one checkpoint attempt；
- contention failure is local degradation；
- later anchor can checkpoint changes missed by earlier failure；
- committed historical version can be inspected/restored with ordinary Git；
- no claim that never-checkpointed replacement/rm history is recoverable。

---

## 14. Convergence note

旧 E3 的：

```text
per-operation stageAffected
+ stage as semantic success prerequisite
+ same-E2-lease checkpoint
+ Git repository health as startup gate
```

都来自“Git 参与 current-state correctness”的旧假设。

当前最小模型只有：

```text
current workspace works without Git
+
anchor-time best-effort workspace checkpoint
```

这已经满足当前明确需要的 history/recoverability enhancement，同时不会让 Git 的技术故障反向拖垮 cognition。
