# 评审文档：write-notes-en

- 日期：2026-10-15
- 评审对象：`skills/write-notes-en/`（英文版技能；共享逻辑与 `skills/write-notes/` 逐字节相同）
- 评审范围：`SKILL.md`、`references/`（7 篇）、`scripts/`、`templates/`、本仓库自用方式（`.agents/notes/`、`.github/workflows/verify.yml`、`README.md`）
- 状态：**只评审，未修改任何技能代码或文档**。发现项留待决定后再动。

## 复现方式

在仓库根目录运行：

```bash
npm run verify-notes      # 通过：9 篇笔记，0 篇归档，封印一致
npm run test-gates        # 通过：97/97
```

针对发现 #1 的独立复现（临时宿主，非本仓库）：

```bash
# 建一篇缺 ## Alternatives considered 的 implemented 笔记
# 跑 archive-agent-note.ts —— 成功归档
# 跑 verify-archived-agent-notes.ts —— 报告 ok: 1 archived note(s) verified
# 但同一篇笔记若跑 verify-agent-note-format.ts 会被拒绝
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

## 后续动作（待决定，尚未执行）

拟议顺序：

1. 发现 #1：归档时增加正文格式校验。
2. 发现 #3 / #4 / #5：一行级文档修正。
3. 发现 #2：让锚点路径模式从 `AGENT_NOTE_ROOT` 推导。
4. 发现 #6：需先决定采用 `.zh.md` 配对还是记录例外。
