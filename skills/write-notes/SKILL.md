---
name: write-notes
description: Record durable engineering decisions, constraints, and rejected alternatives; maintain existing decision notes as code changes. Use for new or revised technical choices, cross-module contracts, postmortems, explicit note maintenance, and decision-note boards. Ordinary local fixes need no new note unless they introduce a lasting constraint or tradeoff. Chinese edition.
---

# Write Notes

把决定为何成立、放弃了什么、如何验证留在代码旁，方便后来者检索。用户指令和宿主 `AGENTS.md`、`CLAUDE.md` 优先。

## 0. 确认宿主约定

先读宿主指南、查找既有决策记录，再决定是否创建目录。

- **已有 ADR 或其他决策格式**：保留其位置、文件名、头部、状态、索引和校验命令，在原格式内应用本技能的写作原则。不向不兼容记录强加本技能的目录、门禁、归档封印或看板解析器。
- **已采用本技能格式**：沿用配置的笔记根目录与配套检查。
- **没有现成约定**：真正需要笔记时使用 `.agents/notes/`，只创建用到的目录。普通修复不初始化空笔记树。

`AGENT_NOTE_ROOT` 只改变根目录，不兼容平铺 ADR 或其他格式。只有用户明确授权迁移范围时才迁移既有记录。详见[校验与接入](references/verification.md)。

## 1. 选择不写、更新或新建

先检索决定归属，再按顺序判断：

| 情况 | 动作 |
|---|---|
| 已有笔记负责该决定，只改变路径、符号、参数等事实 | 原位更新，即使代码只是机械改动 |
| 决定本身或选择理由变化 | 新建决定并与旧文互链，保留旧理由 |
| 没有归属笔记，新增了代码与测试无法解释的长期约束、契约或取舍 | 新建笔记 |
| 没有受影响的决策事实，也没有新的长期理由 | 直接改代码，不新增笔记 |

**行为变化本身不构成写笔记的充分条件。** 恢复已有契约的局部 bug 修复、常规 CRUD、格式、样式、明确改名、依赖补丁，在 diff 与测试足以解释时不新增笔记。反之，一行重试默认值也可能承载重要运行约束，需要记录。文件数和改动大小都不是门槛。

新决定应说明看不见的约束或被放弃的方案、其他模块必须遵守的边界，或删除旧能力的条件。不要把任务流水账写成决策笔记。例子与交互原则见[何时写、何时改](references/when-to-write.md)。

## 2. 使用适用的格式

本技能格式的身份为笔记根下 `{lifecycle}/{class}/yyyy-mm-dd-topic.md`。状态转换不改首次提出日。本格式不建立集中式 `INDEX.md`。

- 状态：`proposed` 尚未实现；`implemented` 已生效；`rejected` 明确否决；`archived` 冻结的实现快照。
- 类别：`feature`、`bug-fix`、`simplification`、`architecture`、`process`、`testing`。先决定是否需要笔记，再看[分类说明](references/classification.md)选类别。

前三行为 `# Agent Note: <标题>`、空行、`Status: <状态>`，第四行空白。状态与目录一致；rejected 状态行附理由。

- 提案：`Problem`、`Proposal`、`Alternatives considered`、`Acceptance criteria`、`Risks`。
- 实现：`Problem`、`Decision`、`Alternatives considered`、`Consequences`，可补充验证和设计章节。
- 否决：保留提案，结论写在状态行。

使用二级标题，首节为 `Problem`。实现决策用现在时，删除提案期章节。详见[格式与支持的中文别名](references/note-format.md)及 `templates/`。已有宿主 ADR 仍保留原骨架。

## 3. 检索并处理关联记录

沿已有源码锚点或模块文档链接查找，按状态与类别缩小范围，再用 `rg --hidden` 搜关键词并排除根目录下 `archived/`。自定义根目录须同时替换检索路径与排除路径。先读替代关系，再把旧决定用于当前代码。

新建前将相关记录分为：无关、部分重叠需互链、完全吸收、尚未实现且明确放弃的提案。与新笔记一起说明重叠如何处理。不要仅为检索而给源码添加锚点。

## 4. 保持状态与理由准确

- 已授权的实现完成后，把提案移到 `implemented`，保留日期，将 `Proposal` 改为 `Decision`，将验收条件与风险并入影响或验证，与代码同批交付。
- 实现完成所以没有待办，属于 **implemented**。只有尚未实现且明确否掉的选择才是 rejected；仅在其理由能防止重犯时保留。
- 部分替代：两篇都保留并互链，在 `Problem` 开头醒目标明被取代范围及后继文档。保留仍有效的决定和旧理由。
- 完全替代：新文承接独有理由、备选、影响与验证限制，修复入站链接。完全吸收后可删除旧活跃记录；仍有独立历史价值时才归档。
- 只用 `scripts/archive-agent-note.ts` 归档 implemented 笔记，不改写冻结快照。本地封印验证一致性，CI 需要变更前 Git 基线才能检测历史改写。归档、删除、重封前阅读[归档规则](references/archiving.md)。

## 5. 写作与复核

只写真实考虑过的备选，不设最低数量。先说对手方案最强的理由，再解释放弃原因。交代收益、成本、限制及可核对的验证结果。笔记之间用相对 Markdown 链接。

只询问尚未决定的重要取舍；能查明的事实自行查明，已授权工作直接推进。新建笔记不产生额外批准要求。

修改笔记后运行宿主适用的检查，并做[语义自检](references/quality-gate.md)，简短报告结果与缺口。按需阅读[表达检查](references/prose-checklist.md)和[简化检查](references/simplification-checklist.md)。

## 6. 校验与生成看板

在**宿主根目录**执行，以本次加载的 `SKILL.md` 所在目录设置 `NOTE_SKILL_DIR`。Node.js 24 可直接运行脚本，宿主不需要 `package.json`。下面的门禁仅用于采用本技能格式的记录：

```sh
node "$NOTE_SKILL_DIR/scripts/verify-agent-note-tree.ts"
node "$NOTE_SKILL_DIR/scripts/verify-agent-note-format.ts"
node "$NOTE_SKILL_DIR/scripts/verify-archived-agent-notes.ts"
```

用户明确要求决策看板时，同样调用已安装的脚本：

```sh
node "$NOTE_SKILL_DIR/scripts/build-board.ts" --init board.html "项目决策看板"
node "$NOTE_SKILL_DIR/scripts/build-board.ts" --bundle .agents/notes demo.html "项目决策看板"
```

`--init` 创建本地目录查看页，`--bundle` 内嵌指定笔记树。兼容本格式的自定义目录须替换实际根路径。两版看板界面均为中文。安装路径、可选 npm 快捷命令、CI、覆盖保护、归档命令和打包参数见[校验说明](references/verification.md)。
