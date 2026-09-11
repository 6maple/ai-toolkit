# brain-web

本地 VitePress 页面，用于浏览 `~/.brain-data` 中的 Brain 数据。

## 工程

- 使用 Vite+ 管理依赖和构建任务。
- 依赖 `brain: link:../brain`，通过 `brain/shared` 共享导出读取 brain 数据。
- 不在磁盘生成 Markdown，而是由 VitePress dynamic routes 提供虚拟 Markdown 页面。
- 页面清单由 `docs/brain/[path].paths.ts` 动态生成。

## 开发

```bash
# 先确保 brain 有 shared stub（dist/shared.mjs）
cd ../brain
vp run stub

# 安装并启动
cd ../brain-web
vp install
vp run dev  # 等价于 vitepress dev
```

## 说明

- 默认读取 `~/.brain-data`。
- 可用 `BRAIN_ROOT` 环境变量指定其他 brain 根目录：

```bash
BRAIN_ROOT=D:\some\brain pnpm dev
```

- 页面通过 VitePress 的 Markdown 转换管线渲染，不是前端自行解析 Markdown。
- 顶部搜索由 brain-web 自己构建索引，覆盖 core、memory 正文与元数据、项目和 session 信息。
- 支持 `Ctrl/Cmd + K` 或 `/` 打开搜索；中文内容使用分词和二元词索引。
- 搜索数据会进入本地构建产物，不应发布或共享 `.vitepress/dist`。
