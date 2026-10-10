# 按需阅读：校验脚本

> SKILL §6 的展开。接入 CI 时对照；本地轻量使用时跳过。

## 检查脚本（均为 tsx，零新增依赖，均可 `npx tsx` 独立运行）

1. **`verify-agent-note-tree`**（`scripts/agent-note-tree.ts` + `scripts/verify-agent-note-tree.ts`）
   - 校验 lifecycle 封闭集 `proposed/implemented/rejected` + `archived`、class 封闭集 6 个、路径深度 `{lifecycle}/{class}/file.md`、文件名 `yyyy-mm-dd-topic.md`、禁止 `INDEX.md`、活跃笔记内部相对 Markdown 链接有效性。

2. **`verify-agent-note-format`**（`scripts/verify-agent-note-format.ts`）
   - 头部：第 1 行 `# Agent Note:` 标题（半角/全角冒号都收，中文输入法常打出全角）、第 2/4 行空行、第 3 行 `Status:` 与 lifecycle 一致且全篇唯一。
   - 骨架：首节必须 `## Problem`/`## 问题`；per-lifecycle 必需节匹配中英别名（`## Decision`/`## 决策`、`## Consequences`/`## 后果` 等；`## Decision（说明）` 这类括号后缀会先剥掉再匹配）；`implemented` 禁用提案式标题（`## Proposal`/`## Plan`/`## Migration plan`/`## Acceptance criteria` 及其中文别名）。现在时是散文纪律，不扫正文。
   - 备选方案：`## Alternatives considered` / `## 备选方案` / `## 已考虑的替代方案` 等别名必写。脚本不检查「不做/复用」档，仅首次提出日在 2026-07-05 之前的历史笔记可使用 `note-sections.ts` 定义的旧格式注释；新笔记不享有此豁免。
   - 兼容：CRLF/BOM 自动归一。

3. **`verify-archived`**（`scripts/verify-archived-agent-notes.ts` + `scripts/seal-store.ts`，标配）
   - 每篇归档：头部布局逐行校验（L3 `Status: implemented` / L4 `Archived: YYYY-MM-DD` 紧邻 / L5 空行）；路径必须是 `archived/<class>/`，分类封闭集与活跃区一致。不承认 `Superseded-by:` 字段。
   - `archived/manifest.json`：每个文件有封印条目、每条目有对应文件、sha256 与磁盘内容一致。
   - `archived/.seal-ledger.json`：按路径排序的封印账本，每条带链接前一条的哈希。校验同时核对链、索引、磁盘文件和 Git 基线；已有路径与摘要不能变化，插入新路径可以重算后续链值。
   - append-only：与基线 ref 逐条对比（env `AGENT_NOTE_ARCHIVE_BASE_REF`，默认 HEAD）。CI 必须指向变更前的 commit（模板 workflow：PR 用 `pull_request.base.sha`，push 用 `github.event.before`），用 HEAD 等于没查。另外还会拒绝"基线里不存在对应 implemented 笔记"的新封印——手放进 `archived/` 的笔记拿不到合法封印。
   - `--write`：**只新增**。已封印文件内容变了就拒绝写入（不重封）。若封印史存在但 `manifest.json` 丢失，也拒绝隐式重建。
   - `--reseal`：显式把当前内容采纳为新基线，并逐个打印被改动的条目。这是"我知道自己在改写冻结区"的声明。
   - **降级要响**：未显式指定基线且没有 git、或 git 无法执行（沙箱、权限）时打印"外部见证缺失"的明确警告，不静默通过。封印史在本仓库内，只有外部基线能真正证明没人改过。

4. **`check-note-anchors`**（`scripts/check-note-anchors.ts`，软报告，退出码恒 0，**不进 CI**）
   - 扫描源码（env `AGENT_NOTE_CODE_ROOT` 指定根，默认 cwd；自动跳过 node_modules/.git/dist 等）里的 `// Note:` / `# Note:` 物理锚点：报告悬空锚点、没有锚点指向的 implemented 笔记、缺路径的锚点行。宿主没用锚点就不必跑。

## 空根不放行

`verify-agent-note-tree` 与 `verify-agent-note-format` 在**一篇笔记都没找到**时以非零退出。这条看着多余，实际是最常见的事故：Agent 路径写错、cwd 不对、`AGENT_NOTE_ROOT` 指偏，旧版本会打印 `ok: 0 note(s) verified` 并退出 0——于是"校验通过"的报告背后什么都没查。

## 接入建议

- 轻量（个人/无 git）：前两个脚本即可，归档封印在第一次归档后自然生效；但没有 git 就没有外部见证，封印只能留痕。
- 完整（团队）：`npm run verify-notes` 三线串进 CI，并把 `manifest.json`、`.seal-ledger.json` 一并提交（本 Skill 的 `templates/verify-notes.yml` 可作模板，复制到宿主根目录 `.github/workflows/` 并核对脚本路径后启用）。

三个校验脚本共用格式与路径规则；`.zh.md` 必须与基础文件配对，且两篇都接受校验。锚点体检是可选软报告，不是门禁。

## 脚本路径

本文的 `scripts/` 相对于 Skill 安装目录。运行命令时保持当前目录为宿主项目根目录，并使用实际 Skill 路径调用脚本；安装本身不会创建宿主 npm scripts。

## 一致性与失败规则

- `.zh.md` 配对文件也逐篇校验头部、正文结构和链接；配对检查不能代替内容检查。
- 代码块、行内代码、引用和 HTML 注释中的示例链接不算实际引用；首个真实二级标题必须是 Problem 或其别名。
- 看板的本地目录模式与打包模式共用 `scripts/note-parser.mjs`，生成 HTML 时内嵌相同解析器与词汇表。
- 索引、账本和归档文件必须逐项一致；只读校验不修补缺失条目。只剩索引而账本丢失时必须恢复账本；只剩完整账本时可用 `--reseal` 显式恢复索引。
- 显式设置 `AGENT_NOTE_ARCHIVE_BASE_REF` 后，Git 不可用、引用无法解析或基线读取失败均报错。未设置时，无 Git 或尚无提交会警告并只验证本地一致性。有效提交中尚无封印文件属于首次建档。
- `AGENT_NOTE_ROOT` 指定的目录同样用于 Git 来源检查。`--reseal` 不豁免已有基线中的封印变化；CI 仍会拒绝历史改写。
