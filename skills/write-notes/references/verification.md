# 按需阅读：校验脚本

> 接入门禁、定位安装路径、生成看板或配置 CI 时阅读。

## 已有 ADR 与本技能格式的边界

随附门禁与看板解析器要求 `{lifecycle}/{class}/yyyy-mm-dd-topic.md` 以及 Agent Note 头部与章节。`AGENT_NOTE_ROOT=docs/adr` 只改变根目录，不能兼容 `docs/adr/0001-database.md`。宿主已有其他约定时保留其命名、状态、索引与校验命令；没有校验器就对照宿主模板人工复核并如实报告，不宣称本技能门禁通过，也不向不兼容记录运行这些门禁。

采用严格格式是单独授权的迁移：先明确目标根目录、路径/日期/状态映射、旧理由保留与入站链接调整。不要擅自重排历史或另建平行笔记库。空根检查仍失败，沿用宿主格式不构成门禁内的豁免。

## 定位并直接运行脚本

以本次加载的 `SKILL.md` 所在目录为准，安装可能在项目中，也可能在全局目录。cwd 保持在宿主根，`NOTE_SKILL_DIR` 指向实际技能目录，不能误指向宿主自己的 `scripts/`。Node.js 24 可直接运行 TypeScript，不要求宿主有 `package.json`：

```sh
# 以下是路径示例，使用时替换为实际安装位置。
NOTE_SKILL_DIR="$HOME/.codex/skills/write-notes"
node "$NOTE_SKILL_DIR/scripts/verify-agent-note-tree.ts"
node "$NOTE_SKILL_DIR/scripts/verify-agent-note-format.ts"
node "$NOTE_SKILL_DIR/scripts/verify-archived-agent-notes.ts"
```

宿主已有 tsx 时也可用 `npx tsx <脚本>`，npx 可能下载运行器。安装技能不添加 npm 命令；只有确认宿主 `package.json` 定义了相应脚本后才能用 `npm run verify-notes` 或 `npm run init-board`。不要仅为运行这些脚本创建包清单。

## 检查脚本

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
   - 扫描源码（env `AGENT_NOTE_CODE_ROOTS` 指定一个或多个根，多个按平台路径分隔符连接；旧名单数 `AGENT_NOTE_CODE_ROOT` 仍兼容；默认 cwd；自动跳过隐藏目录、node_modules/dist 等，不豁免单个文件名）里的 `// Note:` / `# Note:` 物理锚点。每行取标记后的第一个 Markdown 路径，按完整路径解析：绝对路径直接使用，相对路径分别以宿主根目录（cwd）和源码文件目录为基准。归一化后必须位于 `AGENT_NOTE_ROOT` 内，且只有一个实际存在的目标；两种基准指向不同文件时报告歧义，改用绝对路径。报告缺路径、越界、歧义、悬空引用和无引用的 implemented 笔记；不会用同名文件或相同尾段替代原路径。
   - 例如 `AGENT_NOTE_ROOT=docs/adr` 时，仓库相对路径 `docs/adr/implemented/architecture/2026-01-02-example.md` 与 `docs/code.ts` 中的文件相对路径 `adr/implemented/architecture/2026-01-02-example.md` 均有效。路径含空格时加引号或反引号；支持 Markdown 链接并忽略 `#fragment`。扫描是逐行文本识别，不是各语言的语法解析器；测试夹具应拼接标记，避免字符串被误当成注释。宿主没用锚点就不必跑。

5. **`verify-bilingual-notes`**（`scripts/verify-bilingual-notes.ts`，可选，本仓库自用）
   - 项目若在 `<base>.md` + `<base>.zh.md` 约定之外自行维护双语笔记，可以用它机械比对两侧：同基底文件名的英文笔记与基础笔记的 `## ` 标题序列、首次提出日、状态行必须一致。不比较正文语义。只有采用这类约定时才接进自己的流水线；上面三个门禁仍是宿主的契约。

## 空根不放行

`verify-agent-note-tree` 与 `verify-agent-note-format` 在**一篇笔记都没找到**时以非零退出。这条看着多余，实际是最常见的事故：Agent 路径写错、cwd 不对、`AGENT_NOTE_ROOT` 指偏，旧版本会打印 `ok: 0 note(s) verified` 并退出 0——于是"校验通过"的报告背后什么都没查。

## 接入建议

- 轻量（个人/无 git）：前两个脚本即可，归档封印在第一次归档后自然生效；但没有 git 就没有外部见证，封印只能留痕。
- 完整（团队）：`npm run verify-notes` 三线串进 CI，并把 `manifest.json`、`.seal-ledger.json` 一并提交（本 Skill 的 `templates/verify-notes.yml` 可作模板，复制到宿主根目录 `.github/workflows/` 并核对脚本路径后启用）。

三个校验脚本共用格式与路径规则；`.zh.md` 必须与基础文件配对，且两篇都接受校验。锚点体检是可选软报告，不是门禁。

## 脚本路径

本文的 `scripts/` 相对于 Skill 安装目录。运行命令时保持当前目录为宿主项目根目录，并使用实际 Skill 路径调用脚本；安装本身不会创建宿主 npm scripts。

## 看板与归档命令

笔记树兼容本格式时，使用前面已设置的 `NOTE_SKILL_DIR`：

```sh
node "$NOTE_SKILL_DIR/scripts/build-board.ts" --init board.html "项目决策看板"
node "$NOTE_SKILL_DIR/scripts/build-board.ts" --bundle .agents/notes demo.html "项目决策看板"
node "$NOTE_SKILL_DIR/scripts/check-note-anchors.ts"
node "$NOTE_SKILL_DIR/scripts/archive-agent-note.ts" .agents/notes/implemented/architecture/2026-01-01-example.md --strict
node "$NOTE_SKILL_DIR/scripts/verify-archived-agent-notes.ts" --reseal
```

只选择需要的命令；重封是明确采纳已编辑的归档，不是日常验证。归档资格、`--superseded-by`、入站链接与删除详见[归档说明](archiving.md)。

`--init` 生成查看页，打开后选择笔记目录；`--bundle` 内嵌指定笔记树，自定义兼容根目录须替换 `.agents/notes`。默认包含正文，`--metadata-only` 去掉正文与理由。两种模式都不转换平铺 ADR，也不需要 npm 初始化。两版看板界面均为中文。已有生成看板可重新生成；普通文件会被拒绝覆盖，只有明确要求的 `--force` 才覆盖。

接入 CI 时，把 `templates/verify-notes.yml` 复制到宿主 `.github/workflows/`，调整安装路径并提交引用的技能文件；模板留在技能目录内不会生效。可选 npm 快捷命令只包装这些脚本。`AGENT_NOTE_ARCHIVE_BASE_REF` 指向变更前提交，两份封印文件一起提交；可写仓库里的本地封印无法独立证明历史未改。

## 一致性与失败规则

- `.zh.md` 配对文件也逐篇校验头部、正文结构和链接；配对检查不能代替内容检查。
- 代码块、行内代码、引用和 HTML 注释中的示例链接不算实际引用；首个真实二级标题必须是 Problem 或其别名。
- 看板的本地目录模式与打包模式共用 `scripts/note-parser.mjs`，生成 HTML 时内嵌相同解析器与词汇表。
- 索引、账本和归档文件必须逐项一致；只读校验不修补缺失条目。只剩索引而账本丢失时必须恢复账本；只剩完整账本时可用 `--reseal` 显式恢复索引。
- 显式设置 `AGENT_NOTE_ARCHIVE_BASE_REF` 后，Git 不可用、引用无法解析或基线读取失败均报错。未设置时，无 Git 或尚无提交会警告并只验证本地一致性。有效提交中尚无封印文件属于首次建档。
- `AGENT_NOTE_ROOT` 指定的目录同样用于 Git 来源检查。`--reseal` 不豁免已有基线中的封印变化；CI 仍会拒绝历史改写。
