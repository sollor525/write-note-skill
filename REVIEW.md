# 评审文档：write-notes-en

- 日期：2026-10-15（评审基线 `7612ae3`；修复批同日落在其后）
- 评审对象：`skills/write-notes-en/`（英文版技能；共享逻辑与 `skills/write-notes/` 逐字节相同）
- 评审范围：`SKILL.md`、`references/`（7 篇）、`scripts/`、`templates/`、本仓库自用方式（`.agents/notes/`、`.github/workflows/verify.yml`、`README.md`）
- 状态：**7 项发现已全部处置**（见文末「处置结果」）；评审原文保留为证据，未逐句改写

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
| 2 | 锚点匹配改为锚定笔记自身的 `{lifecycle}/{class}/file.md`，不再依赖路径前缀写法；补自定义根目录行为断言 | 同上 |
| 3 | 中英两版 `references/verification.md` 改为主用 `AGENT_NOTE_CODE_ROOTS`，注明单数旧名兼容 | [本仓库的英文笔记另存为 `-en.md`…](.agents/notes/implemented/process/2026-10-15-bilingual-note-pairing-exception.md) |
| 4 | `.github/workflows/verify.yml` 的断言数由 50 更新为当前值 | 同上 |
| 5 | `README.md` 宿主脚本示例统一为 `archive-agent-note` | 同上 |
| 6 | 拍板为**保留 `-en.md` 例外**，并新增 `verify-bilingual-notes.ts` 比较两端二级标题序列、日期与状态行；已并入本仓库 `verify-notes` / `verify-notes-en` | 同上 |
| 7 | 漏译守卫从只扫 `SKILL.md` 扩到英文版全部文档，允许清单补入门禁接受的中文状态行写法 | 同上 |

小问题中「混合行尾归一化」未改：它只影响 `--superseded-by` 插入链接时的后继笔记，且归档快照本身保字节；留待有实际宿主信号时再动。

验证：`npm run verify-notes` 通过（12 篇笔记、0 篇归档、2 对双语同步），`npm run test-gates` 111/111 通过。

## 证据附件

`REVIEW.md` 保留评审当时的原文与行号，作为证据快照；行号、断言数、笔记计数随后变化即失效，判断当前状态请重跑上文的复现命令，而不是引用文中数字。
