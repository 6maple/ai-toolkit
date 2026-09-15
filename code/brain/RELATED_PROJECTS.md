# 跨项目记忆（Related Projects）

Brain 可以让当前项目读取另一个项目自己的 cognition，同时保持两个项目彼此独立。

```text
当前项目 A
  └─ #brain → 项目 B
```

`#brain` 只是 A 访问 B 的名字，不会把 A、B 合并成同一个 ProjectId。

## 1. 配置

在**当前项目**根目录创建：

```text
.brain/config.json
```

例如：

```json
{
  "relatedProjects": {
    "brain": {
      "path": "../brain"
    },
    "mobile": {
      "path": "../mobile",
      "access": "write"
    }
  }
}
```

含义：

- `brain` / `mobile` 是当前项目自己定义的 alias，之后用 `#brain/...`、`#mobile/...` 访问。
- `path` 可以是相对路径或绝对路径；相对路径从当前项目根目录开始算。
- `access` 可选：`read` / `write`。
- 不写 `access` 时默认 `read`。
- `read` 只能通过 Brain 读取目标项目；需要修改目标 cognition 时才配置 `write`。
- 目标目录必须已经是 Brain 认识的项目，例如以前曾以该目录作为 cwd 启动或使用过 Brain。relation 不会自动创建一个新项目。
- 配置会在每次 Brain tool 调用时重新读取；改完 `config.json` 后下一次调用即可生效，不需要重启 Brain。

## 2. 读取关联项目

配置后直接使用 `#alias`。

例如：

```text
brain_cat("#brain/core.md")
brain_ls("#brain/memories/")
brain_cat("#brain/memories/decision/architecture.md")
```

搜索关联项目时也要明确写出 `#alias`：

```text
brain_glob(
  path="#brain/memories/",
  pattern="#brain/memories/**/*.md"
)

brain_grep(
  path="#brain/memories/",
  pattern="architecture"
)
```

省略 `brain_glob.path` / `brain_grep.path` 时，只搜索当前项目自己的 built-in scopes，不会顺带扫描所有关联项目。

`brain_think` 会告诉模型当前有哪些关联项目，例如：

```text
#brain [read]
- files: ../brain/**
- core: #brain/core.md
```

关联项目的 core 不会自动塞进上下文。任务确实涉及该项目时，再读取对应的 `#alias/core.md`。

## 3. 写入关联项目

默认的 `read` 不能通过 Brain 修改目标项目。

需要写入时显式配置：

```json
{
  "relatedProjects": {
    "brain": {
      "path": "../brain",
      "access": "write"
    }
  }
}
```

之后可以直接对 `#brain/...` 使用 mutation tool，例如：

```text
brain_edit(path="#brain/core.md", ...)
brain_write(path="#brain/memories/knowledge/x.md", ...)
brain_rm(path="#brain/memories/knowledge/x.md")
brain_feedback(path="#brain/memories/knowledge/x.md", ...)
```

`brain_mv` 也可以跨项目移动 cognition。凡是会被这次 move 修改到的关联项目，都必须配置为 `write`。

## 4. cognition 里的 `@project/...` 不要改

项目自己的 cognition 仍然使用：

```text
@project/memories/decision/architecture.md
```

不要为了让其他项目访问，把它改成某个 `#alias/...`。

例如 B 的 cognition 原文是：

```text
@project/memories/decision/architecture.md
```

A 通过 `#brain/...` 读取 B 时：

```text
读取这条引用：
@project/memories/decision/architecture.md
→ 用 #brain/memories/decision/architecture.md 调 Brain tool

写回 B：
仍然保存 @project/memories/decision/architecture.md
```

当 related read/discovery 的返回文本里出现 `@project/...` 时，Brain 会直接告诉模型当前应该使用哪个 `#alias/...` 去继续访问，并提醒写回时保留 `@project/...`。

所以：

```text
已有 .brain-data        不需要迁移
已有 @project/... 引用  不需要批量修改
#alias                  只用于当前项目访问另一个项目
```

## 5. 能访问什么

一个 relation 只暴露目标项目自己的：

```text
#alias/core.md
#alias/memories/**
```

不会通过 relation 暴露：

```text
目标项目的 sessions
目标项目的 global cognition
目标项目自己配置的其他 related projects
```

relation 只走一层：

```text
A → B
B → C

不代表：
A → C
```

如果 A 也要访问 C，A 自己必须配置 C。

## 6. 常见问题

**为什么配置了 path 还是 unavailable？**

目标路径必须存在，而且必须精确对应一个已经注册过的 Brain source root。Brain 不会向上猜项目，也不会自动创建 ProjectId。

**为什么能读但不能 edit/write？**

因为 `access` 默认是 `read`。需要修改目标 cognition 时显式设置 `"access": "write"`。

**一个 alias 配坏了，会不会导致当前项目 Brain 不能用？**

不会。坏掉的 alias 只影响自己；当前项目的 `@global`、`@project`、`@session` 和其他正常 alias 仍然可用。

**可以把 alias 指向当前项目自己吗？**

不可以。self-relation 会被视为 unavailable。

**`brain_absolute_path("#brain/...")` 在 read relation 下能用吗？**

能。它只返回真实 filesystem path。拿到这个路径以后，如果再使用普通 filesystem 工具直接修改文件，那已经不属于 Brain 的 `read/write` 权限控制范围。
