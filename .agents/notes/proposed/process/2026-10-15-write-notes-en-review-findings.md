# Agent Note: 记录 write-notes-en 的评审发现，本轮暂缓修复

Status: proposed

## Problem

2026-10-15 对 `skills/write-notes-en/` 做了一次外部评审，发现 7 项可改进点。其中 #1 已端到端复现：一篇缺少 `## Alternatives considered` 的 `implemented` 笔记会被 `verify-agent-note-format` 拒绝，却能正常归档，随后 `verify-archived` 还报告通过。这些发现若不落文档，复现命令、行号证据和优先级判断就只存在于当次会话里；下一个会话要么重做评审，要么在不知情的情况下重犯同一处。

完整证据、复现步骤与逐项分析在仓库根目录的 `REVIEW.md`。检测命令：`npm run verify-notes`、`npm run test-gates`（当前 97/97 通过）。

## Proposal

先把发现留档为本篇 + `REVIEW.md`，本轮不修代码。后续按以下优先级处理（编号与 `REVIEW.md` 一致）：

1. **归档命令补正文格式校验**：`archive-agent-note.ts` 只校验头部，正文骨架（`## Alternatives considered`、禁止的提案标题）不查，导致残缺笔记可被永久冻结。归档前对源文件跑一遍格式校验。
2. **`check-note-anchors` 尊重 `AGENT_NOTE_ROOT`**：脚本把路径模式写死为 `.agents/notes/`，自定义根目录的仓库会误报为"缺路径的锚点"并漏匹配真实锚点。
3. **参考文档修正**：`references/verification.md` 只记录了 legacy 的 `AGENT_NOTE_CODE_ROOT`，应改为主用的 `AGENT_NOTE_CODE_ROOTS` 并注明旧名兼容（中英两版同步）。
4. **CI 注释修正**：`.github/workflows/verify.yml` 的 "50-case" 已过期（现为 97 个断言）。
5. **README 脚本名统一**：`archive-note` 与 `archive-agent-note` 二选一，保证复制粘贴可直接运行。
6. **双语笔记配对**（需拍板）：本仓库用 `*-en.md` 另存一份，而非技能定义的 `.zh.md` 配对约定，二者之间没有同步机制，会随时间漂移。
7. **漏译守卫扩围**：`test-gates` 的 `strayChinese` 只扫 `SKILL.md`，应覆盖 `references/`，并同步扩充允许清单。

## 即时审计（写入本篇时同批完成）

按模块名与关键词检索活跃笔记（`implemented/architecture`、`bug-fix`、`process`、`testing`），逐条归类：

- #1 与 [笔记校验保留原始事实，归档先检查再批量更新](../../implemented/bug-fix/2026-10-10-validation-and-archive-consistency.md) **部分重叠**：那篇约束的是"先检查再批量更新"的事务性，本篇 #1 针对的是"检查范围只有头部"；互相补充，双向不冲突。
- #6、#7 与 [语言做成两个可独立安装的 Skill](../../implemented/process/2026-10-09-language-editions-as-separate-skills.md) **相关**：那篇记录了"语言独立成 Skill"的决策，本篇记录其遗留的配对缺口与漏译守卫覆盖不足。
- 其余命中（空笔记根、封印史、夹具位置、安装测试）与本篇**无关**。

## Alternatives considered

- **立即一次性全部修复** —— 能一次清空清单。但 #6 是需要维护者拍板的取舍（采用配对约定 vs 保留独立记录），且本轮已明确"暂缓修复"；把未定项与已定项绑进同一次改动，会让 #6 拖着其余 6 项。放弃。
- **只在聊天里说明、不落文档** —— 零成本。但违反本仓库"决策要留在仓库里"的初衷：新会话看不见，行号证据随时间失效，#1 的复现已做过一次还得再做。放弃。
- **把 `REVIEW.md` 直接放进 `.agents/notes/` 当作笔记** —— 看起来省一步。但它不满足头部与骨架契约（缺 `## Alternatives considered` 等），门禁会直接报红；本篇才是合法记录，`REVIEW.md` 保留为证据附件。放弃。
- **为 7 项各写一篇 proposed 笔记** —— 每项独立可跟踪。但多数是单点小改（#3 / #4 / #5），一篇总览加优先级表更便于整体推进，也避免笔记树为琐碎项膨胀。放弃。

## Acceptance criteria

- 每项发现要么被修复，要么被显式转成 `Status: rejected — <原因>` 留在原处，不允许"悄悄消失"。
- 修复后 `npm run verify-notes` 与 `npm run test-gates` 保持通过；#1 需新增一条"缺备选方案的笔记无法归档"的负例断言。
- 处理完任意一项时，就地更新本篇该项状态（技能允许的原地事实更新），不新开笔记。

## Risks

- **证据漂移**：行号与断言数会随代码变化，`REVIEW.md` 的记录会过时。以检测命令为准，行号仅作定位线索。
- **僵尸提案**：本篇不推进就会长期停在 `proposed/`。按 `references/archiving.md §1.3`，`proposed` 永不归档；前提消失或不再推进时应转 `rejected` 或删除。
- **#6 悬而不决**：双语笔记会继续各自演进，漂移风险随时间增大。
