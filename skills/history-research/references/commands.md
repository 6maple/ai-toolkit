# 命令与读取契约

使用本Skill的 `scripts/research.mjs` 绝对路径调用Node。以下 `$script` 仅代表这个路径；PowerShell可先赋值该普通变量。命令返回JSON，原话在 `items[].text` 内保持解码值；外层标签不是原话。字符限制按UTF-16位置计数，分页不拆代理对，续读无需模型计算偏移。

```powershell
$script = '<Skill绝对目录>/scripts/research.mjs'
node $script init --root 'D:/Workspace/history-research/new-run' --codex 'C:/Users/Maple/.codex/sessions' --claude 'C:/Users/Maple/.claude/projects'
node $script next --root 'D:/Workspace/history-research/new-run'
```

`init`只列文件元数据、范围边界与问题，创建State索引、TaskState、`run/sources.jsonl`及`run/progress.json`。实际提交时才产生`run/checkpoints.jsonl`。已有运行不覆盖；不读取正文转换、不迁移旧数据。其他来源（含归档目录）要按实际研究范围明确补足，两个初始目录不是完整性的证明。输入目录只读，运行目录须在它们之外。

## 来源、范围与断点

`status --root RUN [--offset 0 --limit 20]` 分页列来源ID、实际路径、类型和固定字节边界；文件修改时间不是事件时间。清单顺序用于稳定定位，不冒充跨来源事件时序。追加内容在本次边界外；按来源追加型使用假设读取旧边界并报告增长，改写/缩短应核对引用，不能保证源删除后的重放。

同名plain/zst均保留；不能仅靠名字跳过。非支持格式和无法访问入口明确列为问题，必要内容用现有工具读取，不当作已研究。会话自然语言视图之外的字段、内容块、摘要和结构可以用raw精确补读；已保存原记录不存在的明文不能恢复。

## 继续工作与提交

```powershell
node $script next --root RUN --limit 16000
node $script next --root RUN --more
node $script submit --root RUN --task t1 --kind local --result 'state/事项.md#本批结果'
node $script next --root RUN
node $script submit --root RUN --task t1 --kind review --result 'state/事项.md#整体回看'
```

`next`无未完任务时自动领取连续粗筛范围；有未完work任务时重现最后一段，`--more`才扩展同一任务。最多返回给定字符范围，短用户链即使源文件很大也不强制分页。保存的是断点和合并范围，不保存分页正文。输出 `page.next=null`只表示所选材料供给结束。

将实际局部研究结果写入State，再提交local；同一目录只允许一个写入控制器，普通read/find可独立读取。local后进入review，next只返回整体回看指导；review前不能领取下一任务。回看后更新必要State/索引/TaskState并提交review。重复同一已接受提交不会重复推进；已写文件但未提交的工作恢复时核对，不自动覆盖或假完成。

结果使用运行目录内Markdown路径，可加真实标题文字选择该节（到下一个同级/上级标题）。程序保存当次实际分析文字、引用、读取范围与提交顺序，避免当前正文覆盖后丢失研究过程；不另存全部State快照。

其他研究阶段：

```powershell
node $script next --root RUN --stage group --label '归并当前工作线索'
node $script next --root RUN --stage study --label '核对某判断的形成原因' --source s000003
node $script next --root RUN --stage audit --label '独立检查指定时期' --source s000008,s000021
node $script next --root RUN --stage synthesis --label '综合当前认识'
```

不指定来源时只返回当前阶段指导和State入口，不打开会话；需要时再补读。指定来源是模型已经作出的范围选择，不是脚本语义检索。人工选择的研究任务不推进自动粗筛游标。独立抽查可从status来源清单按明确时期/项目/类别范围，用普通小脚本的可重现规则选定ID并记录规则，不只筛已命中主题；无需另建采样平台。

## 补读与查找

```powershell
node $script read --root RUN --source s000003 --view dialogue --limit 16000
node $script read --root RUN --ref 's000003:501#/payload/replacement_history/0/content/0/text' --view raw
node $script read --root RUN --ref 's000003:23' --before 4 --after 4 --view dialogue
node $script find --root RUN --text '原文中的词句' --source s000003 --limit 20
```

三种读取视图：`users`为结构中用户文本（明确压缩摘要排除并保留原入口；作者未知标签仍需模型判断）；`dialogue`加助手自然语言及可识别保留内容；`raw`读取指定物理记录或JSON pointer对应值，包括普通视图未展开字段。Claude tool_result不作为用户自然语言；Codex retained_context回答若无作者字段则只标上下文，不冒充原话。

`ref`形如 `s000003:501#/payload/...`，行号为解压后物理JSONL行，JSON pointer中`~1`代表`/`、`~0`代表`~`。`before/after`是明确的同来源物理行范围，不证明分支相邻；根据输出的parent/turn等结构核对正确分支，必要时再选相应范围。来源无明确关系时不自动断言最近的助手就是确认对象。

读取结果有 `continuation` 时，以相同source/ref/view/before/after加 `--cursor TOKEN`继续，直到null；查找同样保持原词句和来源。修改请求范围后不能沿用旧游标。长消息连续部分由相同ref、offset及continued定位，不截尾。`read/find`保存实际供料/成本元数据但不改变分析完成度。

`find`只按明确文字遍历解码后的所有字符串字段，包括常规视图没提取的字段；返回每个命中字段的首处片段与精确引用，正文需按ref补读。它不是语义召回，也不能证明没有其他重要材料。

## 原文与成本边界

程序只保留当前记录、有限输出和少量顺序状态；单条JSON记录很大时内存仍随该条大小增长。普通文件可用字节断点续读；压缩来源随机访问可能重解码前缀，记录实际读取量，连续范围/合并请求应优先于许多碎片往返。程序释放内存不清除模型上下文；必要资料在上下文重建后重新读。

输出notices/gaps和未展开类别入口属于实际覆盖边界，不能忽略或当空内容。无法解码或未知原记录可用raw及现有工具核对；若原始来源缺失/加密无明文，只能保存具体未知。成本中的真实模型token/费用仅在宿主可提供时记录，不假推或自动调用模型测量。
