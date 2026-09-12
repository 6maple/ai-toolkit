# @dsh-external/dsh-approve-for-me

Codex 风格的"帮我批准"审查者。它插在 DSH 的人工审批弹窗**之前**接管 `approval/request`：

- **低/中风险** → 自动放行，不打扰你；
- **高风险**（审查模型给出 `deny`）→ 直接拦截，并把理由写进记录；
- **拿不准** → 转回人工弹窗，并在卡片上附上审查意见（写进 `req.reason`）。

对应 Codex CLI 的 `approvals_reviewer = "auto_review"`。默认**接管全部会话**。

## 两个半边

| 半边   | 源码              | 产物                                                      | 加载方式                                                             |
| ------ | ----------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| host   | `src/*.ts`        | `dist/index.mjs`（vp pack / tsdown）+ `lib/index.js` 垫片 | Node 经 Cordis 加载                                                  |
| client | `src/client/*.ts` | `lib/client.js`                                           | 浏览器经 `dsh-client-modules` 当脚本执行（vp pack / tsdown，带包壳） |

形态照 `brain-dsh-plugin/code`：`main`/`exports` 指向 `dist/index.mjs`，`lib/index.js` 只是 3 行垫片 `export * from '../dist/index.mjs'`（部分加载路径按 cordis 插件约定解析 `lib/index.js`，垫片让两条路都通）。

**客户端半边必须是真 bundle，不能套同一形态**：`dsh-super-injector` 对声明了 `dsh.client` 的包做两道硬校验——`lib/client.js` 缺失或内容里没有 `__ModuleLoader__` 就 block（"不是 tsdown bundle"），并额外要求其中出现 `inject = ['slots']` 和字面量已知 slot 名。垫片两条都过不了；而且浏览器里根本没有 Node 解析和 jiti，垫片那句 `export *` 不是可执行脚本。（那条字面量校验对引号不敏感，正则等价于 `['"]slots['"]`，所以 oxfmt 改成双引号不影响。）

host 产物**零外部运行时 import**（`dist/index.mjs` 里没有任何裸 import，相对模块被打包器内联）：包以 junction 链接进 profile，真实路径下没有 `node_modules`，任何 `import` 三方包都会在加载时炸掉。类型依赖一律 `import type`，编译期擦除。

## 构建

```bash
npm run build   # 两半一起：vp pack（读 vite.config.ts 的 pack 块）
npm run stub    # host 迭代：unbuild --stub（dist 换成按 src 现编的 jiti 加载器）
npm run check   # vp check：oxfmt 格式 + oxlint + tsgolint 类型检查
```

配置写在 `vite.config.ts` 的 `pack` 块里（数组，host + client 各一份）——Vite+ 官方不推荐 `tsdown.config.ts`。host pack 出 `dist/`（`dts: true`、`deps.neverBundle: []`）；client pack 出 `lib/client.js`（`format: cjs`、`platform: browser`、`clean: false`、用 `outputOptions` 包 `window.__ModuleLoader__.load({...})` 壳）。`clean: false` 是必需的：client 的输出目录就是 `lib/`，清空会把 `lib/index.js` 垫片一起删掉。

`vp check` 的类型检查由 `lint.options.typeAware / typeCheck` 打开（走 tsgolint，不是 `tsc`）。

两个 tsconfig：`tsconfig.json` 供类型检查与编辑器（覆盖全部 `src`，客户端靠文件内的 `/// <reference lib="dom" />` 取得 DOM 类型）；`tsconfig.client.json` 供 client pack（DOM lib）。

`unbuild` 只为 `npm run stub` 存在，不在生产构建链路上。

**本包没有 `scripts/build.sh`**：注入器的 `dev_build_plugin` / `dev_self_test` 硬要求该文件，因此它们不接受本包——本包是常驻插件，正常路径是 profile 装配（见下），不需要 dev 注入。

> 沙箱注意：`vp pack` / `vp check` 载入 `vite.config.ts` 时 Vite 会 spawn 子进程算 realpath，受限沙箱下会 `spawn EPERM`（表现为 `Failed to resolve vite config: GenericFailure`）；普通终端里没有这个问题。

## 装配

本包是**常驻 bundle 插件**：profile 的 `dependencies`（link 本目录）与 `dsh.profile.bundles` 已在安装时写好，DSH 启动即加载，**不需要 dev 注入**。改完源码后 `npm run build`，新代码由 DSH 自身的重载或下次启动生效；注入器的 `dev_reload_package` 只是本会话里验证用的便利手段。

## 运行期行为

- **接管范围**：默认 `scope: 'all'` —— **所有会话**的审批请求都由审查者接管，每条都按**它自己的会话**取人类原话、项目指令和模型路由，所以不需要任何标签页停留在某个会话。切成 `scope: 'session'` 时只接管面板轮询所绑定的那个会话，其余 `defer`（`scopeSkips` / `unboundSkips` 计数可见）。
- **必须 `prepend: true`**：人工弹窗在浏览器启动时就注册好了，后注册的监听器排在它后面，人类会先被弹窗问到。插到队首才能先裁决。
- **审查模型**：取 `sessions` 服务里该会话的 `requestContext` 路由，取不到回落到 `agentDefaultModel`（当前 `opencode-go-custom/deepseek-flash`）。每次调用必须带 `sessionId`，否则 400 `MissingSessionID`。
- **只读查阅**：审查模型可以请求查看工作区内的若干路径以核实授权（上限 `maxInspectPaths=3`，单文件 `maxInspectBytes=8192`）；工作区之外的路径一律 `refused`。
- **状态**：内存中最近 40 条裁决（工具名、风险、授权、理由、耗时、是否查阅、是否成功写入人工提示）。重启即清空，热重载也会清空。

### HTTP 路由

| 路由                         | 方法 | 用途                                                               |
| ---------------------------- | ---- | ------------------------------------------------------------------ |
| `/dsh-approve-for-me/state`  | GET  | 面板轮询：状态 + 最近裁决；查询里的 sessionId 决定面板高亮哪个会话 |
| `/dsh-approve-for-me/toggle` | POST | 切换 `enabled` / `dryRun` / `scope`                                |

两个路由都先调 `connection.requestRejection(req)`，未通过连接围栏时返回 401。

### 工具

`approve_for_me_report`：`action=state` 看状态；`action=config` 改 `enabled`/`dryRun`/`scope`/`sessionId`；`action=selftest` 跑确定性自检（映射表 5 例、合成"私钥外传"场景应判 `deny`、只读查阅的三个分支：不存在/普通文件/工作区外拒绝），不发任何真实动作。

## 面板

注册在 `conversation.session.header.utilities`（`id: dsh-approve-for-me`，`order: 50`），显示 `帮我批准 放行N·拦截N·转人工N`，点开可切换范围/演练/启停，并列出最近裁决（其他会话的裁决带来源会话标签）。样式用主题 token，随主题走。

## 已知边界

- host 走 `vp pack`（tsdown）+ `dist` + 垫片；客户端半边不能套同一形态（必须真 bundle，理由见上）。
- **`npm run stub` 的免构建迭代尚未验证成功**（2026-09-12 实测）：stub 能正常加载（671 字节的 jiti 加载器，插件服务齐全），但改 `src` 后 `dev_reload_package` 仍跑旧代码——`src/config.ts` 已改成 `autoDeny: false`、单独用 jiti 导入也读到 `false`，而运行中的插件仍报 `true`。刷新失败发生在 jiti 之外（入口间接层／加载器缓存），不是 jiti 的磁盘缓存（`node_modules/.cache/jiti` 里只有 `build.config` 的转译缓存）。常驻插件的正常重载路径（DSH 启动／HMR）是否能让 stub 生效，未验证。
- 注入器的产物新鲜度检查比的是 `lib/index.js`（`buildFreshnessProblems`，8581-8588），而垫片是内容恒定的静态文件：改了 `src` 但没构建就 inject/reload，会看到"疑似漏 npm run build"的警告。这条只在用注入器时才会遇到。
- 沙箱为 `read-only` 时，任何需要提权的操作都会走本插件裁决。默认接管全部会话（`scope: 'all'`），面板显示当前会话的裁决并标注其他会话来源；切成 `'session'` 后受管范围才跟随面板轮询的那个会话。
- 失败关闭路径在所有范围下一致：无模型路由 / 请求没有 sessionId / 审查结果解析失败 / 调用出错 → 一律转人工弹窗，所以审查模型坏掉不会静默放行。
- 裁决理由写入 `req.reason` 依赖 `dsh-api-remotes` 按引用转发同一个请求对象；若上游改成快照传递，意见会只出现在面板里而不在弹窗上（`annotationFailures` 会计数）。
