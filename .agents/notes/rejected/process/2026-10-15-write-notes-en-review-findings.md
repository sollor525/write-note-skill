# Agent Note: write-notes-en 评审发现已全部处置，不再有待办提案

Status: rejected — 7 项发现全部落地：代码修复与文档修正已随实现笔记提交，本篇记录的提案本身已无待办，转入 rejected 存档。

## Problem

2026-10-15 对 `skills/write-notes-en/` 做了一次外部评审，发现 7 项可改进点。其中 #1 已端到端复现：一篇缺少 `## Alternatives considered` 的 `implemented` 笔记会被 `verify-agent-note-format` 拒绝，却能被正常归档，随后 `verify-archived` 还报告通过。当时把这些发现留档为本篇加仓库根目录的 `REVIEW.md`，作为后续修复的清单。

本篇的原始形态是"记录发现、本轮暂缓修复"的 `proposed` 提案。**该前提已经消失**：7 项已在同一批工作中处置完毕，清单不再有待办。技能规定 `proposed` 永不归档、前提消失时应转 `rejected` 或删除，因此本篇转为 `rejected` 存档，而不是继续挂在 `proposed/` 下当僵尸提案。

完整证据与复现步骤保留在 `REVIEW.md`；本轮做出的决策落在两篇 `implemented` 笔记里：

- [归档前跑完整格式校验，锚点匹配锚定笔记自身路径](../../implemented/bug-fix/2026-10-15-archive-body-gate-and-anchor-root.md) —— 覆盖 #1、#2 与 #7 的代码侧。
- [本仓库的英文笔记另存为 `-en.md`，用结构同步守卫兜底](../../implemented/process/2026-10-15-bilingual-note-pairing-exception.md) —— 覆盖 #6，并记录 #3、#4、#5 的文档修正。

## Decision

本篇不再提出任何动作，只保留"评审发现与其处置结果"的对应关系，供以后检索：

| 发现 | 处置 |
|---|---|
| #1 归档跳过正文格式门禁 | 正文规则提取为共享 `validateNoteContent`，归档命令在写入前调用；已补负例断言 |
| #2 `check-note-anchors` 写死 `.agents/notes/` | 匹配改为锚定笔记自身的 `{lifecycle}/{class}/file.md`，不再依赖前缀写法 |
| #3 `AGENT_NOTE_CODE_ROOTS` 未入文档 | 中英两版 `verification.md` 改为主用复数名，并注明单数旧名兼容 |
| #4 CI 注释用例数过期 | `verify.yml` 的断言数更新为当前值 |
| #5 README 脚本名不符 | 宿主脚本示例统一为 `archive-agent-note` |
| #6 `-en.md` 绕过配对约定 | 保留为例外并新增结构与元数据同步守卫；理由与代价写入实现笔记 |
| #7 漏译守卫只扫 `SKILL.md` | 扩到英文版全部文档，允许清单补入门禁接受的中文状态行写法 |

## Proposal

初版提案只有一条动作：先把发现留档为本篇加 `REVIEW.md`，本轮不修代码，后续按 #1 → #2 → #3/#4/#5 → #6 的顺序推进。该动作已执行完毕，清单也已按上表逐项处置；本篇作为提案不再有可执行内容，保留下来的是"发现与处置的对应关系"。

## Alternatives considered

- **保持 `proposed` 但在正文标注"已完成"** —— 省一次状态转换。但状态字段与正文矛盾，检索时会把已结束的提案当成待办，正是本仓库一直在防的"看板与实际不一致"。放弃。
- **直接删除本篇** —— 最干净。但 #1 的复现证据、逐项处置的对应关系会失去仓库内索引，只剩会随时间失效的行号引用。保留证据链的收益大于少一个文件。放弃。
- **拆成 7 篇 `rejected` 笔记逐项登记** —— 每项独立可检索。但多数是单点小改，且决策已在两篇实现笔记里成文，再拆会重复叙述同一决策。放弃。
- **保留原 `proposed` 提案，另写一篇 `implemented` 记录修复** —— 不改变任何既有链接。但会留下一个永久无法完成的提案，职责重叠；清单的处置状态只能靠读者自己比对。放弃。

## Consequences

- **收益**：评审清单的每一项都有明确落点，检索"评审发现怎么处理的"能一次命中；`proposed/` 不再留有永不推进的提案。
- **代价与已知上限**：`REVIEW.md` 里的行号、断言数与笔记计数是**当时的快照**，随后变化即失效；判断当前状态应重跑 `npm run verify-notes`、`npm run test-gates`，而非引用文中数字。证据行号只作定位线索。
- 后续同类外部评审可直接沿用本表结构：发现 → 处置 → 决策落点。

## Verification

`npm run verify-notes` 通过（12 篇笔记、0 篇归档、2 对双语笔记同步）；`npm run test-gates` 111/111 通过。#1 的针对性证明：缺 `## Alternatives considered` 的笔记现在同时被格式门禁与归档命令拒绝，且源文件字节不变、`archived/` 不被创建。
