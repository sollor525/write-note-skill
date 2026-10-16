# 评审文档：write-notes-en

- 日期：2026-10-15（评审基线 `7612ae3`；修复批同日落在其后）
- 评审对象：`skills/write-notes-en/`（英文版技能；共享逻辑与 `skills/write-notes/` 逐字节相同）
- 评审范围：`SKILL.md`、`references/`（7 篇）、`scripts/`、`templates/`、本仓库自用方式（`.agents/notes/`、`.github/workflows/verify.yml`、`README.md`）
- 状态：**原 7 项发现已处置**；2026-10-16 补充复核的 4 项问题也已修复，另有设计优化建议（见末尾）。初次评审原文保留为证据。

## 复核修正（2026-10-15，修复批）

评审当时的三处数字与机制描述，在修复批复核时修正如下。发现本身全部成立，只是记录已过期：

1. **笔记数量已变。** 评审基线 `7612ae3` 是 9 篇笔记；其后 `1885750` 把评审本身写成一篇文章，现在是 **12 篇**（9 篇原有 + 评审记录 + 修复批新增 2 篇）。原文"9 篇笔记"是当时的快照。
2. **发现 #1 的复现机制表述不准。** 原文写"同一篇笔记若跑 `verify-agent-note-format` 会被拒绝"，容易被读成"归档后仍会被拒"。实际机制是：格式门禁**只遍历活跃树**，笔记归档后落在 `archived/` 下不再被遍历，脚本因"零笔记"短路退出——不是"报告通过"，而是**该校验对归档区永不适用**。结论（归档是正文格式校验的盲区）不变，且已实测确认。
3. **断言数以实测为准。** 评审正文记 97/97（当时正确），修复批新增用例后为 **111/111**；CI 注释里被 #4 指出的 "50" 是更早的过期值。

## 复现方式

在仓库根目录运行：

```bash
npm run verify-notes      # 通过：12 篇笔记，0 篇归档，2 对双语笔记同步
npm run test-gates        # 通过：111/111
```

针对发现 #1 的独立复现（临时宿主，非本仓库）：

```bash
# 建一篇缺 ## Alternatives considered 的 implemented 笔记
# 跑 verify-agent-note-format.ts —— 拒绝（首个信号）
# 修复前：archive-agent-note.ts 照常归档，且此后格式门禁对该笔记永不适用
# 修复后：归档命令同样拒绝，源文件字节不变、archived/ 不被创建
```

## 总体评价

这是一个相当严谨的 Agent Skill。亮点：

- **规矩被强制，而不只写在散文里。** 每条关键要求背后都有真门禁（`verify-agent-note-tree` / `-format` / `-archived`）以非零退出兜底；`test-gates.mjs` 专门断言**反例**（空根目录必须失败、篡改封印必须失败、`--strict` 拦截、CRLF 保留、注入 I/O 故障后回滚）。
- **对封印边界诚实。** `references/archiving.md §2.1` 与 `SKILL.md §6` 明确说明本地封印只是**留痕（tamper-evident），不是防篡改（tamper-proof）**，真正的见证是 CI 基线（`AGENT_NOTE_ARCHIVE_BASE_REF`）。
- **两版不会跑偏。** `test-gates` 逐字节比对共享脚本，并检查 frontmatter 与目录名一致。
- **`SKILL.md` 可判定。** "硬门禁"清单、"三个方向"（往前看 / 往回看 / 做减法）、"借口 vs 现实"表，使写 / 改 / 不写的判断确定化。

## 发现（按重要性排序）

### 1. 归档路径跳过了正文格式门禁（被封存的笔记可能残缺）

`scripts/archive-agent-note.ts:49-53` 只校验**头部**（第 1–4 行）就允许移动。`scripts/verify-archived-agent-notes.ts` 随后只检查头部布局、分类、封印，**从不检查正文骨架**。

后果：一篇缺少 `## Alternatives considered`（或残留提案标题）的 `implemented` 笔记，会被 `verify-agent-note-format` 拒绝，却能被正常归档，之后还报告通过。归档是笔记变得永久的那一刻，最不该少检。

建议：写入封印前，对源文件跑一遍正文小节校验（或直接对单文件调用格式校验器）。

### 2. `check-note-anchors` 写死 `.agents/notes/`，忽略 `AGENT_NOTE_ROOT`

`scripts/check-note-anchors.ts:42`：

```js
const PATH_RE = /\.agents\/notes\/([^\s'"`)>]+?\.md)/;
```

其余所有工具都尊重自定义根目录 `AGENT_NOTE_ROOT`（`test-gates` 用 `docs/adr` 测过）。但锚点检查把路径模式写死为 `.agents/notes/`：笔记放在 `docs/adr/` 的仓库，写 `// Note: ... see docs/adr/...` 会被报成"缺 `.agents/notes` 路径的锚点"，而真正的锚点又匹配不上任何笔记。仅软报告，但与"支持自定义根目录"的文档不一致。

建议：路径模式从 `agentNoteRoot` 推导，而非写死。

### 3. 文档漂移：`AGENT_NOTE_CODE_ROOTS` vs `AGENT_NOTE_CODE_ROOT`

`scripts/check-note-anchors.ts:8,25` 优先读复数形式 `AGENT_NOTE_CODE_ROOTS`（支持多个根），单数 `AGENT_NOTE_CODE_ROOT` 仅作 legacy 兼容。但 `references/verification.md:26`（**中英两版都是**）只记录单数旧名。

建议：参考文档改写为复数形式，并注明旧名仍兼容。

### 4. CI 注释里的用例数过期

`.github/workflows/verify.yml:4` 写 "the 50-case regression suite"，而 `test-gates` 现在报 **97** 个断言。纯文案，但描述的是测试套件，不会自动跟着变。

### 5. README 里的 npm 脚本名对不上

`README.md:281` 建议宿主脚本叫 `archive-note`，而 `SKILL.md §6` 与 `package.json` 用 `archive-agent-note`。

建议：统一命名，保证从 README 复制粘贴可直接运行。

### 6. 自用问题：本仓库双语笔记绕过技能自身的配对规则

技能定义了可选翻译约定（`<base>.md` + `<base>.zh.md`，由 `verify-agent-note-tree` 校验配对）。本仓库改为用 `*-en.md` **另存一份**中文原笔记（例：`2026-10-09-append-only-seal-ledger.md` / `…-ledger-en.md`）。二者并非配对，没有任何机制保证同步，迟早漂移。

建议（需拍板）：要么改用 `.zh.md` 配对，要么写一篇笔记说明本仓库为何有意把它们当作独立决策记录。

### 7. "英文版无漏译中文"的守卫只扫了 `SKILL.md`

`scripts/test-gates.mjs:436` 只对 `SKILL.md` 调用 `strayChinese`，而 README（第 390 行）描述为对整个英文版的检查。`references/` 从未被扫描；尤其 `note-format.md` 含 `状态：已实现`，而它不在 `ALLOWED_CHINESE` 集合中（`test-gates.mjs:423-427`）。

建议：把守卫扩到 `references/`（值得做），同时扩充允许清单。

## 小问题 / 吹毛求疵

- `archive-agent-note.ts:80-85`：插入 `--superseded-by` 链接时，按任意换行拆分后继笔记、再用**主流**换行符重新 join，会归一化混合行尾文件。其余代码都在刻意保字节，此处值得记一笔。
- 英文版共享脚本保留中文注释/控制台输出，看板界面也仅中文。这是**已记录**的取舍（见 `.agents/notes/implemented/process/2026-10-09-language-editions-as-separate-skills.md`），仅需当作自觉的技术债。
- `README.md` 只有中文，而技能是双语的；英文读者缺少落地页。优先级低。

## 无需改动、扎实的部分

- 封印账本 / 哈希链语义、乱序归档、删除末条检测、I/O 失败回滚——测试覆盖良好。
- 现在时 / 不得改写决策的纪律，在 `SKILL.md`、`note-format.md`、`when-to-write.md` 表述一致。
- 头块契约（第 3 行 `Status`、第 4 行紧邻 `Archived`）由归档命令与校验器以相同方式强制。

## 处置结果（修复批已执行，非提案）

按原拟顺序逐项落地；决策全文见两篇 `implemented` 笔记。

| # | 处置 | 落点 |
|---|---|---|
| 1 | 正文规则提取为共享 `validateNoteContent`，归档命令在**写入任何文件前**调用；补负例断言 | [归档前跑完整格式校验…](.agents/notes/implemented/bug-fix/2026-10-15-archive-body-gate-and-anchor-root.md) |
| 2 | 按完整路径解析并检查 `AGENT_NOTE_ROOT` 边界，补齐绝对路径、仓库相对路径、文件相对路径和错误前缀用例；初版尾段匹配已被替代 | [完整锚点路径解析](.agents/notes/implemented/bug-fix/2026-10-16-resolve-full-note-anchor-paths.md) |
| 3 | 中英两版 `references/verification.md` 改为主用 `AGENT_NOTE_CODE_ROOTS`，注明单数旧名兼容 | [本仓库的英文笔记另存为 `-en.md`…](.agents/notes/implemented/process/2026-10-15-bilingual-note-pairing-exception.md) |
| 4 | `.github/workflows/verify.yml` 改为描述离线回归套件，用例数以实际测试输出为准 | 同上 |
| 5 | `README.md` 宿主脚本示例统一为 `archive-agent-note` | 同上 |
| 6 | 拍板为**保留 `-en.md` 例外**，并新增 `verify-bilingual-notes.ts` 比较两端二级标题序列、日期与状态行；已并入本仓库 `verify-notes` / `verify-notes-en` | 同上 |
| 7 | 漏译守卫从只扫 `SKILL.md` 扩到英文版全部文档，允许清单补入门禁接受的中文状态行写法 | 同上 |

小问题中「混合行尾归一化」未改：它只影响 `--superseded-by` 插入链接时的后继笔记，且归档快照本身保字节；留待有实际宿主信号时再动。

2026-10-15 修复批验证：`npm run verify-notes` 通过（12 篇笔记、0 篇归档、2 对双语同步），`npm run test-gates` 111/111 通过。后续结果见下文。

## 证据附件

`REVIEW.md` 保留评审当时的原文与行号，作为证据快照；行号、断言数、笔记计数随后变化即失效，判断当前状态请重跑上文的复现命令，而不是引用文中数字。

## 补充复核与修复（2026-10-16）

本次修复基线为 `f9366db`。新增回归用例先在原实现上运行，复现 10 个失败场景；修复后全部通过。

| 已确认问题 | 当前处理 |
|---|---|
| 错误的完整路径因尾段相同而被当作有效引用 | 保留完整路径，归一化后检查根目录边界和实际目标；取消同名文件兜底 |
| `notes/...` 与源码旁的 `adr/...` 被漏检 | 相对路径分别按宿主根和源码目录解析；两个不同目标同时存在时报告歧义 |
| 任意宿主的 `test-gates.mjs` 都不扫描 | 删除文件名豁免；本仓库夹具改为拼接 Note 标记 |
| 已完成的评审清单被标记为 rejected | 移到 implemented，移除提案段；两版技能说明补明完成与放弃的区别 |

锚点依旧是逐行文本软报告，不要求宿主添加引用。当前仓库扫描无悬空或无效锚点；13 篇 implemented 笔记均未配置源码锚点，符合其可选定位。

验证：`npm run test-gates` 为 **130/130**；两版笔记检查、skill frontmatter 检查和共享文件一致性检查通过。新增用例覆盖路径边界、相对路径、文件名、Markdown 链接、空格、歧义以及新旧扫描根变量。本轮未改变安装布局，未重跑需要联网的安装测试；未在 Windows 上执行。

## GitHub 同类设计对比

本次读取以下项目的公开 `SKILL.md`，比较其职责、记录方式和决策维护规则；这是文档与源码设计对比，未安装或运行这些第三方 skill。链接指向本次读取的分支，后续内容可能变化。

| 对比对象 | 已观察到的设计 | 对本 skill 的启示 |
|---|---|---|
| [wshobson/agents：architecture-decision-records](https://github.com/wshobson/agents/blob/main/plugins/documentation-generation/skills/architecture-decision-records/SKILL.md) | 聚焦架构选择，区分应记录与可跳过的工作，模板按需读取，使用 ADR 状态和相互链接 | 学习明确触发边界及按需模板；无需引入其团队审批人数要求 |
| [pavi2410/agent-skills：architecture-decisions](https://github.com/pavi2410/agent-skills/blob/main/skills/architecture-decisions/SKILL.md) | 先读现行决策索引；旧决策加醒目的替代说明及后继链接，保留原理由 | 学习让读者先看到“哪部分已失效”；本项目已有分类树与链接，无需照搬手工集中索引 |
| [ArcticZvan/project-memory](https://github.com/ArcticZvan/project-memory/blob/main/SKILL.md) | 每日记录配合项目摘要；错误或被替代的条目会关联修正记录 | 说明跨会话恢复与决策记录是不同职责；可借鉴纠错关系，不必把每次会话都写成决策笔记 |
| [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files/blob/master/skills/planning-with-files/SKILL.md) | 分别保存计划、研究发现和进度，提供恢复、任务目录选择及完成检查 | 临时执行状态应与长期决策分开；无需引入其完整计划文件、自动钩子和会话恢复流程 |

本 skill 的明确价值是把“为什么这样改”与路径、正文、归档封印检查结合，并把事实修正和决策翻转分开处理。上述项目提供的主要借鉴是触发边界、现行决策识别与任务状态分工；没有证据表明应替换现有封印机制或引入更多生命周期。

## 后续优化实施（2026-10-16）

四项建议已实现，原来的格式门禁和归档约束保持不变。

| 优化 | 实现 |
|---|---|
| 统一触发判断 | 中英文入口、分类说明、流转参考和 README 使用相同顺序：先查归属，事实更新；决定或理由改变则新建后继；新增隐藏约束或取舍才新建；普通恢复既定行为的局部修复不自动建笔记 |
| 明确已有 ADR 边界 | 现有平铺 ADR 保持宿主格式和检查；没有宿主校验器时如实报告人工审阅。`AGENT_NOTE_ROOT` 只换根路径，迁移须有明确范围，不生成平行库、不放宽空根门禁 |
| 模型行为评测 | `evals/note-behavior/` 的隔离场景实际调用 Codex，检查文件动作、独立代码断言与真实门禁，另留语义评审项。CI 只运行离线评分器测试；完成、拒绝、部分替代和已有 ADR 均有场景 |
| 压缩入口 | 英文入口从约 3,000 词缩至约 1,080 词；安装位置、CI、覆盖行为、封印及看板选项移入既有参考。两种看板命令仍在入口，宿主无需 package.json |

部分替代在旧篇 Problem 开头醒目标明失效范围和后继链接，保留仍有效的决定与原理由。没有引入必填集中索引、新状态或固定文件数量阈值。

执行方式与结果含义见[行为评测说明](evals/README.md)。130 项门禁回归、13 项离线评分器测试及真实安装检查已经通过；英文版八个真实模型场景及中文版两个代表场景均通过，差异与内容复核见[评测记录](evals/results/2026-10-16.md)，不能用格式通过代替语义正确。入口字数减少也不是质量提高的独立证据。
